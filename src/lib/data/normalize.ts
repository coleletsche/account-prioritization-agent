const LEGAL_SUFFIXES = new Set(["inc", "incorporated"]);

const ABBREVIATIONS: Record<string, string> = {
  amer: "america",
  comm: "community",
  dev: "development",
  fdn: "foundation",
  inst: "institute",
  intl: "international",
  ww: "worldwide",
};

export function normalizeOrganizationName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .match(/[a-z0-9]+/g)
    ?.filter((token) => !LEGAL_SUFFIXES.has(token))
    .map((token) => ABBREVIATIONS[token] ?? token)
    .join(" ") ?? "";
}

export function validOrganizationName(value: string): boolean {
  return /[A-Za-z\p{L}]/u.test(value.trim());
}

export function parseWebsiteDomain(value: string): string | undefined {
  try {
    const url = new URL(value.trim());
    if (!(["http:", "https:"].includes(url.protocol)) || !url.hostname.includes(".")) return undefined;
    return url.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

export function parseDomain(value: string): string | undefined {
  const candidate = value.trim();
  if (!candidate) return undefined;
  return parseWebsiteDomain(candidate.includes("://") ? candidate : `https://${candidate}`);
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function compareIsoDates(a?: string, b?: string): number {
  if (!a && !b) return 0;
  if (!a) return -1;
  if (!b) return 1;
  return a.localeCompare(b);
}

export function stableId(prefix: string, value: string): string {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `${prefix}-${(hash >>> 0).toString(36)}`;
}
