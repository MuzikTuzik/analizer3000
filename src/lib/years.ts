/** Parse ?years=2026,2025 or empty → null (meaning all available). */
export function parseYearsParam(raw: string | null): string[] | null {
  if (!raw?.trim()) return null;
  const years = raw
    .split(",")
    .map((y) => y.trim())
    .filter((y) => /^\d{4}$/.test(y));
  return years.length ? [...new Set(years)].sort((a, b) => b.localeCompare(a)) : null;
}

export function isYearSheetTitle(title: string): boolean {
  return /^\d{4}$/.test(title.trim());
}

export function yearsQuery(years: string[]): string {
  return years.length ? `years=${encodeURIComponent(years.join(","))}` : "";
}
