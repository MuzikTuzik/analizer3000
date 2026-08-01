const DEFAULT_LIMIT = 150;
const MIN_LIMIT = 1;
const MAX_LIMIT = 5000;

/** Parse ?limit= from query; clamp to a safe range. */
export function parseLimitParam(raw: string | null | undefined): number {
  if (!raw?.trim()) return DEFAULT_LIMIT;
  const n = Number(raw.trim());
  if (!Number.isFinite(n)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, Math.floor(n)));
}

export { DEFAULT_LIMIT, MIN_LIMIT, MAX_LIMIT };
