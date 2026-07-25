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
};

function getSheetId(): string {
  return process.env.GOOGLE_SHEET_ID?.trim() || DEFAULT_SHEET_ID;
}

async function fetchViaSheetsApi(
  sheetId: string,
  apiKey: string,
): Promise<string[][]> {
  const range = encodeURIComponent("A1:ZZ");
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}?key=${apiKey}`;
  const res = await fetch(url, { next: { revalidate: 60 } });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Sheets API error ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as { values?: string[][] };
  return data.values ?? [];
}

async function fetchViaPublicCsv(sheetId: string): Promise<string[][]> {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
  const res = await fetch(url, {
    next: { revalidate: 60 },
    headers: { Accept: "text/csv" },
  });

  if (!res.ok) {
    throw new Error(`CSV export failed: ${res.status}`);
  }

  const buffer = await res.arrayBuffer();
  const text = new TextDecoder("utf-8").decode(buffer);
  return parseCsv(text);
}

async function loadGrid(): Promise<string[][]> {
  const sheetId = getSheetId();
  const apiKey = process.env.GOOGLE_API_KEY?.trim();

  if (apiKey) {
    try {
      return await fetchViaSheetsApi(sheetId, apiKey);
    } catch (err) {
      console.warn("Sheets API failed, falling back to CSV export", err);
    }
  }

  return fetchViaPublicCsv(sheetId);
}

async function loadDatasetUncached(): Promise<SheetDataset> {
  const grid = await loadGrid();
  const saleColumns = detectSaleColumns(grid);
  const products = listProducts(grid);

  return {
    grid,
    saleColumns,
    products,
    fetchedAt: new Date().toISOString(),
  };
}

export const getDataset = unstable_cache(loadDatasetUncached, ["sheet-dataset"], {
  revalidate: 60,
  tags: ["sheet"],
});

export async function getProducts(): Promise<{
  products: Omit<Product, "rowIndex">[];
  saleColumnCount: number;
  fetchedAt: string;
}> {
  const ds = await getDataset();
  return {
    products: ds.products.map(({ rowIndex: _r, ...p }) => p),
    saleColumnCount: ds.saleColumns.length,
    fetchedAt: ds.fetchedAt,
  };
}

export async function getAnalysis(query: string): Promise<ProductAnalysis | null> {
  const ds = await getDataset();
  const product = findProduct(ds.products, query);
  if (!product) return null;
  return analyzeProduct(ds.grid, ds.saleColumns, product);
}
