import { XMLParser } from "fast-xml-parser";

// parseTagValue: false keeps every leaf as a raw string — otherwise
// fast-xml-parser silently coerces all-digit values (NIP, invoice numbers)
// into JS numbers, which would corrupt any identifier starting with "0".
export const lenientXmlParser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
  parseTagValue: false,
});

// Different Ministry of Finance schemas disagree on tag casing — KSeF's
// FA(2)/FA(3) invoice schema uses PascalCase (P_1, Podmiot1), JPK_FA(4) uses
// all-lowercase (p_1, podmiot1). Matching case-insensitively lets one set of
// candidate key names work against either without duplicating lookups.
function sameKey(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

export function deepFind(node: unknown, key: string): unknown {
  if (node === null || typeof node !== "object") return undefined;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = deepFind(item, key);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  const record = node as Record<string, unknown>;
  for (const [entryKey, value] of Object.entries(record)) {
    if (sameKey(entryKey, key)) return value;
  }
  for (const value of Object.values(record)) {
    const found = deepFind(value, key);
    if (found !== undefined) return found;
  }
  return undefined;
}

export function deepFindAll(node: unknown, key: string): unknown[] {
  const results: unknown[] = [];
  function walk(current: unknown) {
    if (current === null || typeof current !== "object") return;
    if (Array.isArray(current)) {
      for (const item of current) walk(item);
      return;
    }
    for (const [entryKey, value] of Object.entries(current as Record<string, unknown>)) {
      if (sameKey(entryKey, key)) {
        if (Array.isArray(value)) results.push(...value);
        else results.push(value);
      } else {
        walk(value);
      }
    }
  }
  walk(node);
  return results;
}

export function findFirstString(node: unknown, keys: string[]): string | null {
  for (const key of keys) {
    const value = deepFind(node, key);
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return null;
}

export function findFirstNumber(node: unknown, keys: string[]): number | null {
  for (const key of keys) {
    const value = deepFind(node, key);
    if (typeof value === "number") return value;
    if (typeof value === "string" && value.trim() && !Number.isNaN(Number(value))) return Number(value);
  }
  return null;
}

export function findNip(node: unknown, subjectKey: string): string | null {
  const subject = deepFind(node, subjectKey);
  const nip = deepFind(subject, "NIP");
  return typeof nip === "string" ? nip.trim() : null;
}

export function findAddress(node: unknown): string | null {
  const lines = [findFirstString(node, ["AdresL1"]), findFirstString(node, ["AdresL2"])].filter(
    (line): line is string => Boolean(line),
  );
  return lines.length ? lines.join(", ") : null;
}

export function findFirstIsoDate(node: unknown): string | null {
  if (typeof node === "string") {
    const match = node.match(/^\d{4}-\d{2}-\d{2}/);
    return match ? match[0] : null;
  }
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findFirstIsoDate(item);
      if (found) return found;
    }
    return null;
  }
  if (node && typeof node === "object") {
    for (const value of Object.values(node)) {
      const found = findFirstIsoDate(value);
      if (found) return found;
    }
  }
  return null;
}
