/** Reader for Apple property lists: binary (`bplist00`) and XML. */

export type PlistValue =
  string | number | boolean | Date | Buffer | PlistValue[] | { [key: string]: PlistValue } | null;

function readUInt(buffer: Buffer, offset: number, size: number): number {
  let value = 0;
  for (let i = 0; i < size; i += 1) value = value * 256 + (buffer[offset + i] ?? 0);
  return value;
}

function parseBinary(buffer: Buffer): PlistValue {
  const trailer = buffer.length - 32;
  if (trailer < 8) throw new Error("Binary plist is truncated");
  const offsetSize = buffer.readUInt8(trailer + 6);
  const refSize = buffer.readUInt8(trailer + 7);
  const objectCount = readUInt(buffer, trailer + 8, 8);
  const topObject = readUInt(buffer, trailer + 16, 8);
  const tableOffset = readUInt(buffer, trailer + 24, 8);
  if (objectCount > 1_000_000 || tableOffset >= buffer.length) throw new Error("Corrupt binary plist");
  const offsets: number[] = [];
  for (let i = 0; i < objectCount; i += 1) offsets.push(readUInt(buffer, tableOffset + i * offsetSize, offsetSize));

  const parse = (index: number, depth: number): PlistValue => {
    if (depth > 64) throw new Error("Binary plist nests too deeply");
    const at = offsets[index];
    if (at === undefined || at >= buffer.length) throw new Error("Corrupt binary plist object reference");
    const marker = buffer[at] ?? 0;
    const high = marker >> 4;
    let low = marker & 0x0f;
    let start = at + 1;
    if (high !== 0 && high !== 1 && high !== 2 && high !== 3 && low === 0x0f) {
      const intSize = 1 << ((buffer[start] ?? 0) & 0x0f);
      low = readUInt(buffer, start + 1, intSize);
      start += 1 + intSize;
    }
    switch (high) {
      case 0x0:
        return low === 0x08 ? false : low === 0x09 ? true : null;
      case 0x1:
        return readUInt(buffer, start, 1 << low);
      case 0x2:
        return low === 2 ? buffer.readFloatBE(start) : buffer.readDoubleBE(start);
      case 0x3:
        return new Date((buffer.readDoubleBE(start) + 978_307_200) * 1000);
      case 0x4:
        return buffer.subarray(start, start + low);
      case 0x5:
        return buffer.toString("latin1", start, start + low);
      case 0x6:
        return Buffer.from(buffer.subarray(start, start + low * 2))
          .swap16()
          .toString("utf16le");
      case 0xa: {
        const items: PlistValue[] = [];
        for (let i = 0; i < low; i += 1) items.push(parse(readUInt(buffer, start + i * refSize, refSize), depth + 1));
        return items;
      }
      case 0xd: {
        const dict: { [key: string]: PlistValue } = {};
        for (let i = 0; i < low; i += 1) {
          const key = parse(readUInt(buffer, start + i * refSize, refSize), depth + 1);
          dict[String(key)] = parse(readUInt(buffer, start + (low + i) * refSize, refSize), depth + 1);
        }
        return dict;
      }
      default:
        return null;
    }
  };
  return parse(topObject, 0);
}

const unescape = (text: string) =>
  text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

function parseXml(text: string): PlistValue {
  const tokens = text.match(/<(\/?)(dict|array|key|string|integer|real|true|false|date|data)(\s*\/)?>|[^<]+/g) ?? [];
  let index = 0;
  const next = () => tokens[index++] ?? "";
  const textUntil = (tag: string) => {
    let value = "";
    for (let token = next(); token && token !== `</${tag}>`; token = next()) value += token;
    return unescape(value.trim());
  };
  const parseValue = (open: string, depth: number): PlistValue => {
    if (depth > 64) throw new Error("XML plist nests too deeply");
    const tag = open.replace(/[<>/\s]/g, "");
    if (open.endsWith("/>")) return tag === "true" ? true : tag === "false" ? false : tag === "dict" ? {} : [];
    switch (tag) {
      case "string":
        return textUntil("string");
      case "integer":
        return Number(textUntil("integer"));
      case "real":
        return Number(textUntil("real"));
      case "date":
        return new Date(textUntil("date"));
      case "data":
        return Buffer.from(textUntil("data").replace(/\s+/g, ""), "base64");
      case "true":
        return true;
      case "false":
        return false;
      case "array": {
        const items: PlistValue[] = [];
        for (let token = next(); token && token !== "</array>"; token = next()) {
          if (token.startsWith("<")) items.push(parseValue(token, depth + 1));
        }
        return items;
      }
      case "dict": {
        const dict: { [key: string]: PlistValue } = {};
        for (let token = next(); token && token !== "</dict>"; token = next()) {
          if (token !== "<key>") continue;
          const key = textUntil("key");
          let valueToken = next();
          while (valueToken && !valueToken.startsWith("<")) valueToken = next();
          dict[key] = parseValue(valueToken, depth + 1);
        }
        return dict;
      }
      default:
        return null;
    }
  };
  for (let token = next(); token; token = next()) {
    if (/^<(dict|array|string|integer|true|false)/.test(token)) return parseValue(token, 0);
  }
  throw new Error("No plist value found");
}

export function parsePlist(buffer: Buffer): PlistValue {
  if (buffer.subarray(0, 8).toString("latin1") === "bplist00") return parseBinary(buffer);
  return parseXml(buffer.toString("utf8"));
}
