import { unstable_cache } from "next/cache";
import { parseCsv } from "./csv";
import {
  analyzeProduct,
  detectSaleColumns,
  findProduct,
  listProducts,
} from "./parse";
import type { Product, ProductAnalysis, SaleColumn } from "./types";

const DEFAULT_SHEET_ID = "1nECnwPqhPggtkFMPuwTUi-JKPF8TsdoMvcmhtQfJzr8";

export type SheetDataset = {
  products: Product[];
  saleColumns: SaleColumn[];
  grid: string[][];
  fetchedAt: string;
  source: "sheets-api" | "csv";
};

function getSheetId(): string {
  return process.env.GOOGLE_SHEET_ID?.trim() || DEFAULT_SHEET_ID;
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

async function getFirstSheetTitle(
  sheetId: string,
  apiKey: string,
): Promise<string> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties.title&key=${apiKey}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Не удалось прочитать таблицу через Sheets API (${res.status}). Проверьте GOOGLE_API_KEY и что включён Google Sheets API. ${body.slice(0, 200)}`,
    );
  }
  const data = (await res.json()) as {
    sheets?: { properties?: { title?: string } }[];
  };
  const title = data.sheets?.[0]?.properties?.title;
  if (!title) throw new Error("В таблице нет листов");
  return title;
}

async function fetchViaSheetsApi(
  sheetId: string,
  apiKey: string,
): Promise<string[][]> {
  const title = await getFirstSheetTitle(sheetId, apiKey);
  const range = encodeURIComponent(`'${title}'`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}?key=${apiKey}`;
  const res = await fetch(url, { cache: "no-store" });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Sheets API error ${res.status}: ${body.slice(0, 300)}. Таблица должна быть «Все, у кого есть ссылка → Читатель».`,
    );
  }

  const data = (await res.json()) as { values?: string[][] };
  return data.values ?? [];
}

async function fetchViaPublicCsv(sheetId: string): Promise<string[][]> {
  const urls = [
    `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=0`,
    `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&gid=0`,
  ];

  let lastError: Error | null = null;

  for (const url of urls) {
    try {
      const res = await fetchWithCookies(url);
      if (!res.ok) {
        throw new Error(`CSV export failed: ${res.status}`);
      }

      const buffer = await res.arrayBuffer();
      const text = new TextDecoder("utf-8").decode(buffer);
      assertCsvPayload(text, res.headers.get("content-type"));

      const grid = parseCsv(text);
      if (grid.length < 8) {
        throw new Error("CSV слишком короткий — похоже, таблица не загрузилась");
      }
      return grid;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError ?? new Error("Не удалось загрузить таблицу");
}

async function loadGrid(): Promise<{ grid: string[][]; source: "sheets-api" | "csv" }> {
  const sheetId = getSheetId();
  const apiKey = process.env.GOOGLE_API_KEY?.trim();

  // On Vercel CSV export usually fails; if key exists, use API only and surface real errors.
  if (apiKey) {
    const grid = await fetchViaSheetsApi(sheetId, apiKey);
    return { grid, source: "sheets-api" };
  }

  try {
    const grid = await fetchViaPublicCsv(sheetId);
    return { grid, source: "csv" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `${message} Сейчас GOOGLE_API_KEY не задан в Vercel — добавьте его в Environment Variables (Production) и нажмите Redeploy.`,
    );
  }
}

async function loadDatasetUncached(): Promise<SheetDataset> {
  const { grid, source } = await loadGrid();
  const saleColumns = detectSaleColumns(grid);
  const products = listProducts(grid);

  if (products.length < 10) {
    throw new Error(
      `Найдено слишком мало позиций (${products.length}). Источник: ${source}. Проверьте доступ к таблице.`,
    );
  }

  return {
    grid,
    saleColumns,
    products,
    fetchedAt: new Date().toISOString(),
    source,
  };
}

export const getDataset = unstable_cache(loadDatasetUncached, ["sheet-dataset-v3"], {
  revalidate: 60,
  tags: ["sheet"],
});

export async function getProducts(): Promise<{
  products: Omit<Product, "rowIndex">[];
  saleColumnCount: number;
  fetchedAt: string;
  source: "sheets-api" | "csv";
  hasApiKey: boolean;
}> {
  const ds = await getDataset();
  return {
    products: ds.products.map(({ rowIndex: _r, ...p }) => p),
    saleColumnCount: ds.saleColumns.length,
    fetchedAt: ds.fetchedAt,
    source: ds.source,
    hasApiKey: hasApiKey(),
  };
}

export async function getAnalysis(query: string): Promise<ProductAnalysis | null> {
  const ds = await getDataset();
  const product = findProduct(ds.products, query);
  if (!product) return null;
  return analyzeProduct(ds.grid, ds.saleColumns, product);
}
