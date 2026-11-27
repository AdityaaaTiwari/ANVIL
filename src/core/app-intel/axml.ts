/**
 * Decoder for Android binary XML (the compiled AndroidManifest.xml inside an
 * APK). Produces a small element tree; attribute names fall back to the
 * framework resource id when an obfuscator stripped the string pool name.
 */

export type AxmlValue = string | number | boolean;

export interface AxmlElement {
  tag: string;
  attrs: Record<string, AxmlValue>;
  children: AxmlElement[];
}

const RES_XML = 0x0003;
const RES_STRING_POOL = 0x0001;
const RES_XML_RESOURCE_MAP = 0x0180;
const RES_XML_START_ELEMENT = 0x0102;
const RES_XML_END_ELEMENT = 0x0103;
const UTF8_FLAG = 1 << 8;
const NO_INDEX = 0xffffffff;

/** Android framework attribute ids, used when attribute names are obfuscated. */
const ANDROID_ATTR_IDS: Record<number, string> = {
  0x01010003: "name",
  0x01010006: "permission",
  0x0101000f: "debuggable",
  0x01010010: "exported",
  0x0101020c: "minSdkVersion",
  0x01010270: "targetSdkVersion",
  0x0101021b: "versionCode",
  0x0101021c: "versionName",
  0x01010280: "allowBackup",
  0x010104ec: "usesCleartextTraffic",
  0x01010527: "networkSecurityConfig",
};

function readLength8(buffer: Buffer, offset: number): [number, number] {
  const first = buffer[offset] ?? 0;
  return first & 0x80 ? [((first & 0x7f) << 8) | (buffer[offset + 1] ?? 0), 2] : [first, 1];
}

function readLength16(buffer: Buffer, offset: number): [number, number] {
  const first = buffer.readUInt16LE(offset);
  return first & 0x8000 ? [((first & 0x7fff) << 16) | buffer.readUInt16LE(offset + 2), 4] : [first, 2];
}

function readStringPool(buffer: Buffer, chunk: number): string[] {
  const headerSize = buffer.readUInt16LE(chunk + 2);
  const count = buffer.readUInt32LE(chunk + 8);
  const utf8 = (buffer.readUInt32LE(chunk + 16) & UTF8_FLAG) !== 0;
  const stringsStart = chunk + buffer.readUInt32LE(chunk + 20);
  const strings: string[] = [];
  for (let index = 0; index < count && index < 200_000; index += 1) {
    let at = stringsStart + buffer.readUInt32LE(chunk + headerSize + index * 4);
    if (utf8) {
      at += readLength8(buffer, at)[1]; // UTF-16 length, unused
      const [bytes, size] = readLength8(buffer, at);
      at += size;
      strings.push(buffer.toString("utf8", at, at + bytes));
    } else {
      const [chars, size] = readLength16(buffer, at);
      at += size;
      strings.push(buffer.toString("utf16le", at, at + chars * 2));
    }
  }
  return strings;
}

function typedValue(dataType: number, data: number, strings: string[]): AxmlValue {
  switch (dataType) {
    case 0x03:
      return strings[data] ?? "";
    case 0x10:
      return data | 0;
    case 0x11:
      return data >>> 0;
    case 0x12:
      return data !== 0;
    case 0x01:
      return `@0x${(data >>> 0).toString(16)}`;
    default:
      return data >>> 0;
  }
}

export function parseAxml(buffer: Buffer): AxmlElement {
  if (buffer.length < 8 || buffer.readUInt16LE(0) !== RES_XML) throw new Error("Not an Android binary XML file");
  const end = Math.min(buffer.length, buffer.readUInt32LE(4));
  let strings: string[] = [];
  let resourceIds: number[] = [];
  const root: AxmlElement = { tag: "#document", attrs: {}, children: [] };
  const stack: AxmlElement[] = [root];

  let offset = buffer.readUInt16LE(2);
  while (offset + 8 <= end) {
    const type = buffer.readUInt16LE(offset);
    const headerSize = buffer.readUInt16LE(offset + 2);
    const size = buffer.readUInt32LE(offset + 4);
    if (size < 8 || offset + size > end) throw new Error("Corrupt binary XML chunk");

    if (type === RES_STRING_POOL) strings = readStringPool(buffer, offset);
    else if (type === RES_XML_RESOURCE_MAP) {
      resourceIds = [];
      for (let at = offset + headerSize; at + 4 <= offset + size; at += 4) resourceIds.push(buffer.readUInt32LE(at));
    } else if (type === RES_XML_START_ELEMENT) {
      const ext = offset + headerSize;
      const nameIndex = buffer.readUInt32LE(ext + 4);
      const attributeStart = buffer.readUInt16LE(ext + 8);
      const attributeSize = buffer.readUInt16LE(ext + 10);
      const attributeCount = buffer.readUInt16LE(ext + 12);
      const element: AxmlElement = { tag: strings[nameIndex] ?? "", attrs: {}, children: [] };
      for (let i = 0; i < attributeCount; i += 1) {
        const at = ext + attributeStart + i * attributeSize;
        const attrName = buffer.readUInt32LE(at + 4);
        const raw = buffer.readUInt32LE(at + 8);
        const dataType = buffer.readUInt8(at + 15);
        const data = buffer.readUInt32LE(at + 16);
        let name = attrName === NO_INDEX ? "" : (strings[attrName] ?? "");
        if (!name) name = ANDROID_ATTR_IDS[resourceIds[attrName] ?? -1] ?? `attr${attrName}`;
        element.attrs[name] = raw !== NO_INDEX ? (strings[raw] ?? "") : typedValue(dataType, data, strings);
      }
      stack[stack.length - 1]?.children.push(element);
      stack.push(element);
    } else if (type === RES_XML_END_ELEMENT && stack.length > 1) {
      stack.pop();
    }
    offset += size;
  }
  return root.children[0] ?? root;
}

export function findAll(element: AxmlElement, tag: string): AxmlElement[] {
  const found: AxmlElement[] = [];
  const walk = (node: AxmlElement) => {
    if (node.tag === tag) found.push(node);
    node.children.forEach(walk);
  };
  walk(element);
  return found;
}
