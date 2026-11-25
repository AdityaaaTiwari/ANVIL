#!/usr/bin/env python3
"""Cross-platform unittest runner for ANVIL's catalog/rea/bridges Python suites.

The upstream REA bridge directory intentionally omits `__init__.py` files and
is normally executed from a POSIX container with pytest. This runner creates an
in-memory `bridge` package hierarchy mapping to `catalog/rea/bridges`, discovers
all `test_*.py` suites, and executes them via Python's stdlib `unittest`.

On Windows (`sys.platform == "win32"`), POSIX-only tests (those requiring Unix
`resource`, `os.mkfifo`, or Linux async subprocess cleanup) are skipped unless
`--require-posix` is passed. On POSIX CI runners (`--require-posix`), all 10
suites execute without skips from this runner.
"""

from __future__ import annotations

import argparse
import importlib.util
import pathlib
import sys
import types
import unittest

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
BRIDGES_DIR = REPO_ROOT / "catalog" / "rea" / "bridges"

WINDOWS_SKIP_FILES: dict[str, str] = {
    "pwndbg/test_core_context.py": "pwndbg core_context imports Unix-only `resource` module",
    "agentenv/test_solve_cleanup.py": "solve_cleanup async process-group test targets POSIX platforms",
}

WINDOWS_SKIP_TESTS: dict[str, tuple[str, ...]] = {
    "native/test_rea_lldb_tracer.py": (
        "test_output_pipe_counts_all_bytes_and_keeps_only_the_prefix",
        "test_output_pipe_reports_incomplete_capture_after_unexpected_close",
    ),
}


def install_virtual_bridge_packages() -> None:
    """Register `bridge` and `bridge.<subpkg>` namespace packages in sys.modules."""
    if str(BRIDGES_DIR) not in sys.path:
        sys.path.insert(0, str(BRIDGES_DIR))

    bridge_pkg = types.ModuleType("bridge")
    bridge_pkg.__path__ = [str(BRIDGES_DIR)]
    bridge_pkg.__package__ = "bridge"
    sys.modules["bridge"] = bridge_pkg

    for entry in sorted(BRIDGES_DIR.iterdir()):
        if entry.is_dir() and not entry.name.startswith((".", "__")):
            pkg_name = f"bridge.{entry.name}"
            subpkg = types.ModuleType(pkg_name)
            subpkg.__path__ = [str(entry)]
            subpkg.__package__ = pkg_name
            setattr(bridge_pkg, entry.name, subpkg)
            sys.modules[pkg_name] = subpkg


def load_test_module(test_file: pathlib.Path, index: int) -> types.ModuleType:
    """Load a test file under a unique module name so duplicate filenames do not collide."""
    rel = test_file.relative_to(BRIDGES_DIR)
    parent_parts = rel.parent.parts
    pkg_name = ".".join(("bridge", *parent_parts)) if parent_parts else "bridge"
    mod_name = f"_rea_test_{index}_{test_file.stem}"
    spec = importlib.util.spec_from_file_location(mod_name, test_file)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not create module spec for {test_file}")
    module = importlib.util.module_from_spec(spec)
    module.__package__ = pkg_name
    sys.modules[mod_name] = module
    spec.loader.exec_module(module)
    return module


def filter_suite_for_windows(
    suite: unittest.TestSuite, skip_method_names: set[str]
) -> tuple[unittest.TestSuite, list[str]]:
    """Replace POSIX-only test methods with explicit unittest skips on Windows."""
    filtered = unittest.TestSuite()
    skipped_names: list[str] = []
    for item in suite:
        if isinstance(item, unittest.TestSuite):
            sub_filtered, sub_skipped = filter_suite_for_windows(item, skip_method_names)
            filtered.addTest(sub_filtered)
            skipped_names.extend(sub_skipped)
        else:
            method_name = getattr(item, "_testMethodName", "")
            if method_name in skip_method_names:
                skipped_names.append(method_name)
                fn = getattr(item, method_name, None)
                if callable(fn):
                    setattr(
                        item,
                        method_name,
                        unittest.skip("Requires POSIX os.mkfifo")(fn),
                    )
            filtered.addTest(item)
    return filtered, skipped_names


def main() -> int:
    parser = argparse.ArgumentParser(description="Run ANVIL Python REA bridge tests.")
    parser.add_argument(
        "--require-posix",
        action="store_true",
        help="Fail if Windows skips would apply or if running on Windows.",
    )
    parser.add_argument("-v", "--verbose", action="store_true", help="Verbose unittest output.")
    args = parser.parse_args()

    if not BRIDGES_DIR.is_dir():
        print(f"ERROR: Missing REA bridges directory: {BRIDGES_DIR}", file=sys.stderr)
        return 2

    if args.require_posix and sys.platform == "win32":
        print("ERROR: --require-posix cannot be satisfied on Windows.", file=sys.stderr)
        return 2

    install_virtual_bridge_packages()

    loader = unittest.TestLoader()
    master_suite = unittest.TestSuite()
    test_files = sorted(BRIDGES_DIR.rglob("test_*.py"))
    if not test_files:
        print(f"ERROR: No test_*.py files found in {BRIDGES_DIR}", file=sys.stderr)
        return 2

    is_windows = sys.platform == "win32" and not args.require_posix
    skipped_files: list[tuple[str, str]] = []
    skipped_methods: list[str] = []

    for index, test_file in enumerate(test_files):
        rel_posix = test_file.relative_to(BRIDGES_DIR).as_posix()
        if is_windows and rel_posix in WINDOWS_SKIP_FILES:
            skipped_files.append((rel_posix, WINDOWS_SKIP_FILES[rel_posix]))
            continue

        module = load_test_module(test_file, index)
        suite = loader.loadTestsFromModule(module)
        if is_windows and rel_posix in WINDOWS_SKIP_TESTS:
            suite, method_skips = filter_suite_for_windows(
                suite, set(WINDOWS_SKIP_TESTS[rel_posix])
            )
            skipped_methods.extend(f"{rel_posix}::{name}" for name in method_skips)
        master_suite.addTest(suite)

    runner = unittest.TextTestRunner(verbosity=2 if args.verbose else 1, stream=sys.stdout)
    result = runner.run(master_suite)

    if skipped_files or skipped_methods:
        print("\n[test:rea] Windows-only skips (run natively in Linux/macOS CI):")
        for rel_posix, reason in skipped_files:
            print(f"  - SKIP file {rel_posix}: {reason}")
        for full_name in skipped_methods:
            print(f"  - SKIP test {full_name}: requires POSIX os.mkfifo")

    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    raise SystemExit(main())
