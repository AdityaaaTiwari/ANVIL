# Clean-Room Engineering & Reimplementation Protocol

This protocol defines the operational rules for extracting functional specifications from closed, compiled, or legacy binaries using REA tools, and implementing clean source code without copyright contamination.

---

## 1. Principles of Clean-Room Reimplementation

1. **Role Separation:**
   - **Analyst (Dirty Room):** Inspects the binary, disassembles, extracts schemas, API signatures, packet captures, and state machines. **Never writes production code.**
   - **Architect / Author (Clean Room):** Reads only the functional specifications, requirements, and test vectors created by the Analyst. **Never inspects the disassembled binary or decompiled code.**
2. **Behavioral Equivalence over Code Translation:**
   - The goal is functional compatibility, not line-by-line decompilation translation.
3. **Traceability:**
   - Every requirement must trace back to observable external interfaces, network protocols, or file formats.

---

## 2. ANVIL REA Rules

- **`REA-CR-001` (Dirty Room Contamination Guard):**
  Raw decompiled code or disassembly output must never be pasted into production source directories or committed directly to git.
- **`REA-CR-002` (Functional Spec Gate):**
  All implementations must originate from an approved behavioral specification (`.md` or OpenAPI/schema) detailing inputs, outputs, error conditions, and invariants.
- **`REA-CR-003` (Clean Verification):**
  The newly authored implementation must pass unit and integration test suites executed against the functional spec, verified with `anvil gate .`.

---

## 3. Evidence Template

When documenting a reverse-engineered component, use this format:

```markdown
# Component Reimplementation Specification: [Component Name]

## 1. Source Binary Metadata
- Binary: `target.exe` / `libtarget.so`
- Architecture: x86_64 / ARM64
- Hash (SHA-256): `...`

## 2. External Interface & Signatures
- Entry points / Exported symbols:
  - `export_func_a(uint32_t flags) -> int32_t`
- Protocol / Data Format:
  - Header (4 bytes magic: `0x41 0x4E 0x56 0x4C`)
  - Payload length (uint32 big-endian)

## 3. Behavioral Invariants
- When `flags & 0x01` is true, validate checksum before processing.
- Returns error code `-1` on unexpected EOF.

## 4. Verification Test Cases
- [ ] Test Case 1: Valid packet decoding with standard header.
- [ ] Test Case 2: Malformed packet rejection (negative test).
- [ ] Test Case 3: Boundary edge case (zero-length payload).
```
