/** Match key: ignore case, spaces, hyphens, underscores. */
export function clientMatchKey(name: string): string {
  return name
    .trim()
    .toLocaleLowerCase("ru-RU")
    .replace(/[-\s_]+/g, "");
}

/**
 * Canonical display: hyphen between parts + Capitalized words.
 * "Полюс Сар" / "Полюс-сар" → "Полюс-Сар"
 * Short ALL-CAPS parts (≤4) kept as acronyms: "МКЦ-Нева" → "МКЦ-Нева"
 */
export function formatClientName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed || trimmed.startsWith("Не указан")) return trimmed;

  return trimmed
    .split(/[-\s_]+/)
    .filter(Boolean)
    .map((part) => {
      const letters = part.replace(/[^a-zA-Zа-яА-ЯёЁ]/g, "");
      if (
        letters.length > 0 &&
        letters.length <= 4 &&
        letters === letters.toLocaleUpperCase("ru-RU")
      ) {
        return part.toLocaleUpperCase("ru-RU");
      }
      return (
        part.charAt(0).toLocaleUpperCase("ru-RU") +
        part.slice(1).toLocaleLowerCase("ru-RU")
      );
    })
    .join("-");
}

/** Prefer observed name that already has hyphen and more capitals. */
export function preferClientName(current: string, incoming: string): string {
  const a = formatClientName(current);
  const b = formatClientName(incoming);
  if (clientMatchKey(a) !== clientMatchKey(b)) return a;

  const score = (n: string) => {
    let s = 0;
    if (n.includes("-")) s += 100;
    if (/\s/.test(n)) s -= 20;
    s += (n.match(/[A-ZА-ЯЁ]/g) || []).length * 2;
    return s;
  };

  return score(b) > score(a) ? b : a;
}
