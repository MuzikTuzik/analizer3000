import { unstable_cache } from "next/cache";
import { parseCsv } from "./csv";
import {
  analyzeProduct,
  detectSaleColumns,
  findProduct,
  listProducts,
  mergeAnalyses,
  mergeTopPackRows,
  topProductsByPack25,
  topProductsByPack50,
} from "./parse";
import type { Product, ProductAnalysis, SaleColumn, TopPackRow } from "./types";
import { isYearSheetTitle } from "./years";

const DEFAULT_SHEET_ID = "1nECnwPqhPggtkFMPuwTUi-JKPF8TsdoMvcmhtQfJzr8";

export type YearDataset = {
  year: string;
  products: Product[];
  saleColumns: SaleColumn[];
  grid: string[][];
  source: "sheets-api" | "csv";
};

/** Accept raw ID or a full Google Sheets URL. */
export function normalizeSheetId(raw: string | undefined | null): string {
  const value = (raw ?? "").trim();
  if (!value) return DEFAULT_SHEET_ID;

  const fromUrl = value.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (fromUrl?.[1]) return fromUrl[1];

  const cleaned = value.split("/")[0]?.split("?")[0]?.trim();
  return cleaned || DEFAULT_SHEET_ID;
}

function getSheetId(): string {
  return normalizeSheetId(process.env.GOOGLE_SHEET_ID);
}

function hasApiKey(): boolean {
  return Boolean(process.env.GOOGLE_API_KEY?.trim());
}

function assertCsvPayload(text: string, contentType: string | null): void {
  const trimmed = text.trimStart();
  const type = (contentType ?? "").toLowerCase();
  const looksHtml =
    type.includes("text/html") ||
    trimmed.startsWith("<!DOCTYPE") ||
    trimmed.startsWith("<html") ||
    trimmed.includes("account.google.com") ||
    trimmed.includes("Sign in");

  if (looksHtml) {
    throw new Error(
      "Google вернул HTML вместо CSV (с сервера Vercel так часто бывает). Добавьте GOOGLE_API_KEY в Environment Variables и сделайте Redeploy.",
    );
  }
}

function collectCookies(res: Response): string[] {
  const headers = res.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie().map((c) => c.split(";")[0] ?? c);
  }
  const single = res.headers.get("set-cookie");
  return single ? [single.split(";")[0] ?? single] : [];
}

async function fetchWithCookies(url: string, init?: RequestInit): Promise<Response> {
  const cookies: string[] = [];
  let current = url;

  for (let i = 0; i < 8; i++) {
    const headers = new Headers(init?.headers);
    headers.set(
      "User-Agent",
      "Mozilla/5.0 (compatible; Analizer3000/1.0; +https://vercel.com)",
    );
    headers.set("Accept", "text/csv,text/plain,*/*");
    if (cookies.length) headers.set("Cookie", cookies.join("; "));

    const res = await fetch(current, {
      ...init,
      headers,
      redirect: "manual",
      cache: "no-store",
    });

    cookies.push(...collectCookies(res));

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) {
        throw new Error(`Redirect without Location (${res.status})`);
      }
      current = new URL(location, current).toString();
      continue;
    }

    return res;
  }

  throw new Error("Too many redirects while fetching Google Sheet");
}

async function listSheetTitlesViaApi(
  sheetId: string,
  apiKey: string,
): Promise<string[]> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties.title&key=${apiKey}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Не удалось прочитать список листов (${res.status}). ${body.slice(0, 200)}`,
    );
  }
  const data = (await res.json()) as {
    sheets?: { properties?: { title?: string } }[];
  };
  return (data.sheets ?? [])
    .map((s) => s.properties?.title?.trim() ?? "")
    .filter(Boolean);
}

async function fetchSheetViaApi(
  sheetId: string,
  apiKey: string,
  title: string,
): Promise<string[][]> {
  const range = encodeURIComponent(`'${title}'`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}?key=${apiKey}`;
  const res = await fetch(url, { cache: "no-store" });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Sheets API error ${res.status} (${title}): ${body.slice(0, 300)}`,
    );
  }

  const data = (await res.json()) as { values?: string[][] };
  return data.values ?? [];
}

async function fetchSheetViaCsv(
  sheetId: string,
  title: string,
): Promise<string[][]> {
  const urls = [
    `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(title)}`,
    `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&sheet=${encodeURIComponent(title)}`,
  ];

  let lastError: Error | null = null;
  for (const url of urls) {
    try {
      const res = await fetchWithCookies(url);
      if (!res.ok) throw new Error(`CSV export failed: ${res.status}`);
      const buffer = await res.arrayBuffer();
      const text = new TextDecoder("utf-8").decode(buffer);
      assertCsvPayload(text, res.headers.get("content-type"));
      const grid = parseCsv(text);
      if (grid.length < 8) {
        throw new Error(`CSV листа ${title} слишком короткий`);
      }
      return grid;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }
  throw lastError ?? new Error(`Не удалось загрузить лист ${title}`);
}

async function listYearTitlesUncached(): Promise<string[]> {
  const sheetId = getSheetId();
  const apiKey = process.env.GOOGLE_API_KEY?.trim();

  if (apiKey) {
    const titles = await listSheetTitlesViaApi(sheetId, apiKey);
    const years = titles.filter(isYearSheetTitle).sort((a, b) => b.localeCompare(a));
    if (!years.length) {
      throw new Error(
        "Не найдены листы-годы (ожидаются имена вида 2023, 2024, 2025, 2026).",
      );
    }
    return years;
  }

  // Without API key: probe common year range via CSV
  const found: string[] = [];
  const current = new Date().getFullYear();
  for (let y = current; y >= current - 10; y--) {
    const title = String(y);
    try {
      await fetchSheetViaCsv(sheetId, title);
      found.push(title);
    } catch {
      // skip missing
    }
  }
  if (!found.length) {
    throw new Error(
      "Не найдены листы-годы. Задайте GOOGLE_API_KEY или назовите листы 2023, 2024…",
    );
  }
  return found.sort((a, b) => b.localeCompare(a));
}

export const listYearTitles = unstable_cache(
  listYearTitlesUncached,
  ["year-titles-v1"],
  { revalidate: 60, tags: ["sheet"] },
);

async function loadYearDatasetUncached(year: string): Promise<YearDataset> {
  const sheetId = getSheetId();
  const apiKey = process.env.GOOGLE_API_KEY?.trim();

  let grid: string[][];
  let source: "sheets-api" | "csv";

  if (apiKey) {
    grid = await fetchSheetViaApi(sheetId, apiKey, year);
    source = "sheets-api";
  } else {
    grid = await fetchSheetViaCsv(sheetId, year);
    source = "csv";
  }

  const saleColumns = detectSaleColumns(grid);
  const products = listProducts(grid);

  if (products.length < 5) {
    throw new Error(
      `В листе ${year} слишком мало позиций (${products.length}). Проверьте структуру.`,
    );
  }

  return { year, grid, saleColumns, products, source };
}

export const getYearDataset = unstable_cache(
  loadYearDatasetUncached,
  ["year-dataset-v1"],
  { revalidate: 60, tags: ["sheet"] },
);

async function resolveYears(requested: string[] | null): Promise<string[]> {
  const available = await listYearTitles();
  if (!requested?.length) return available;

  const set = new Set(available);
  const picked = requested.filter((y) => set.has(y));
  if (!picked.length) {
    throw new Error(
      `Нет выбранных годов среди доступных: ${available.join(", ")}`,
    );
  }
  return picked.sort((a, b) => b.localeCompare(a));
}

export async function getAvailableYears(): Promise<{
  years: string[];
  fetchedAt: string;
  hasApiKey: boolean;
}> {
  const years = await listYearTitles();
  return {
    years,
    fetchedAt: new Date().toISOString(),
    hasApiKey: hasApiKey(),
  };
}

export async function getProducts(yearsParam: string[] | null = null): Promise<{
  products: Omit<Product, "rowIndex">[];
  saleColumnCount: number;
  fetchedAt: string;
  source: "sheets-api" | "csv";
  hasApiKey: boolean;
  years: string[];
}> {
  const years = await resolveYears(yearsParam);
  const datasets = await Promise.all(years.map((y) => getYearDataset(y)));

  // Union products by SKU; prefer newest year's label/stock
  const bySku = new Map<string, Omit<Product, "rowIndex">>();
  let saleColumnCount = 0;
  let source: "sheets-api" | "csv" = "csv";

  for (const ds of datasets) {
    saleColumnCount += ds.saleColumns.length;
    if (ds.source === "sheets-api") source = "sheets-api";
    for (const p of ds.products) {
      if (!bySku.has(p.sku)) {
        const { rowIndex: _r, ...rest } = p;
        bySku.set(p.sku, rest);
      }
    }
  }

  return {
    products: [...bySku.values()].sort((a, b) =>
      a.sku.localeCompare(b.sku, "ru"),
    ),
    saleColumnCount,
    fetchedAt: new Date().toISOString(),
    source,
    hasApiKey: hasApiKey(),
    years,
  };
}

export async function getAnalysis(
  query: string,
  yearsParam: string[] | null = null,
): Promise<ProductAnalysis | null> {
  const years = await resolveYears(yearsParam);
  const datasets = await Promise.all(years.map((y) => getYearDataset(y)));

  const parts: ProductAnalysis[] = [];
  for (const ds of datasets) {
    const product = findProduct(ds.products, query);
    if (!product) continue;
    parts.push(analyzeProduct(ds.grid, ds.saleColumns, product));
  }

  return mergeAnalyses(parts);
}

export async function getTopPack25Rows(
  limit = 150,
  yearsParam: string[] | null = null,
): Promise<TopPackRow[]> {
  const years = await resolveYears(yearsParam);
  const datasets = await Promise.all(years.map((y) => getYearDataset(y)));
  const sets = datasets.map((ds) =>
    topProductsByPack25(ds.grid, ds.saleColumns, ds.products, 10_000),
  );
  return mergeTopPackRows(sets, 25, limit);
}

export async function getTopPack50Rows(
  limit = 150,
  yearsParam: string[] | null = null,
): Promise<TopPackRow[]> {
  const years = await resolveYears(yearsParam);
  const datasets = await Promise.all(years.map((y) => getYearDataset(y)));
  const sets = datasets.map((ds) =>
    topProductsByPack50(ds.grid, ds.saleColumns, ds.products, 10_000),
  );
  return mergeTopPackRows(sets, 50, limit);
}
