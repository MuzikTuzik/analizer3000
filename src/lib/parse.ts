import type {
  ClientBreakdown,
  Product,
  ProductAnalysis,
  QuantityBucket,
  SaleColumn,
  TopPackRow,
} from "./types";

const HEADER_ROW = 6; // 0-based: row 7 in sheet
const DATA_START_ROW = 7; // 0-based: row 8 in sheet
const NAME_COL = 3; // column D
const STOCK_COL = 4; // column E

const SALE_PAYMENTS = ["нал", "безнал", "на карту"];
const EXCLUDED_PAYMENTS = [
  "возврат",
  "обмен",
  "карлос",
  "продано",
  "резерв",
  "корректир",
  "таганрог",
];
const EXCLUDED_CLIENTS = [
  "наименование",
  "остаток",
  "итого",
  "примечан",
  "корректир",
  "пост.",
  "жене",
  "микаэль",
  "таганрог",
  "помогалка",
  "образцы",
  "прим",
];

function cell(grid: string[][], row: number, col: number): string {
  return (grid[row]?.[col] ?? "").trim();
}

function parseNumber(raw: string): number | null {
  if (!raw) return null;
  const normalized = raw.replace(/\s/g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function looksLikeDate(value: string): boolean {
  return /^\d{1,2}[./-]\d{1,2}([./-]\d{2,4})?$/.test(value.trim());
}

function isSalePayment(value: string): boolean {
  const v = value.toLowerCase();
  return SALE_PAYMENTS.some((m) => v.includes(m));
}

function isExcludedPayment(value: string): boolean {
  const v = value.toLowerCase();
  if (!v) return false;
  return EXCLUDED_PAYMENTS.some((m) => v.includes(m));
}

function isExcludedClient(value: string): boolean {
  const v = value.toLowerCase();
  if (!v) return false;
  if (/^\d{4}$/.test(v)) return true; // year columns
  return EXCLUDED_CLIENTS.some((m) => v.includes(m));
}

function extractSku(name: string): string {
  const match = name.match(/^([^\s*]+)/);
  return match?.[1]?.replace(/\*+$/, "") ?? name;
}

function findSalesStartCol(grid: string[][]): number {
  const header = grid[HEADER_ROW] ?? [];
  for (let col = 0; col < header.length; col++) {
    const name = cell(grid, HEADER_ROW, col).toLowerCase();
    if (name.includes("примечан")) return col + 1;
  }
  // Fallback: first "Вадим" warehouse block often precedes real orders
  for (let col = 0; col < header.length; col++) {
    if (cell(grid, HEADER_ROW, col) === "Вадим") return col;
  }
  return 0;
}

export function detectSaleColumns(grid: string[][]): SaleColumn[] {
  if (grid.length <= HEADER_ROW) return [];

  const startCol = findSalesStartCol(grid);
  const maxCols = Math.max(
    grid[HEADER_ROW]?.length ?? 0,
    grid[5]?.length ?? 0,
    grid[4]?.length ?? 0,
    grid[3]?.length ?? 0,
  );

  const columns: SaleColumn[] = [];

  for (let col = startCol; col < maxCols; col++) {
    const clientRaw = cell(grid, HEADER_ROW, col);
    const date = cell(grid, 5, col);
    const payment = cell(grid, 3, col);
    const city = cell(grid, 2, col);
    const sum = parseNumber(cell(grid, 4, col));

    if (!looksLikeDate(date)) continue;
    if (isExcludedPayment(payment)) continue;
    if (isExcludedClient(clientRaw)) continue;

    // Real order: named sale payment, or anonymous column with order sum
    const namedSale = Boolean(clientRaw) && isSalePayment(payment);
    const anonymousOrder = !clientRaw && sum !== null;
    const namedWithoutPay =
      Boolean(clientRaw) && !payment && sum !== null;

    if (!namedSale && !anonymousOrder && !namedWithoutPay) continue;

    const client = clientRaw || `Не указан · ${date}`;

    columns.push({
      colIndex: col,
      client,
      date,
      city,
      payment: payment || "—",
    });
  }

  return columns;
}

export function listProducts(grid: string[][]): Product[] {
  const products: Product[] = [];

  for (let row = DATA_START_ROW; row < grid.length; row++) {
    const name = cell(grid, row, NAME_COL);
    if (!name) continue;
    // Real SKUs look like 10001, 10004-1, SP-10045…
    if (!/^[\dA-Za-z][\w.-]{2,}/.test(name)) continue;
    if (!/\d{3,}/.test(name)) continue;

    const sku = extractSku(name);
    const stock = parseNumber(cell(grid, row, STOCK_COL));

    products.push({
      rowIndex: row,
      sku,
      name,
      label: name,
      stock,
    });
  }

  return products;
}

type PackStats = { orderCount: number; packCount: number };

/**
 * Split order qty into pack tiers:
 * 1) as many 100 as possible
 * 2) remainder 75 → one 75 (own price, not 50+25)
 * 3) else 50, then 25s
 *
 * 1675 → 16×100 + 1×75
 * 625  → 6×100 + 1×25
 * 150  → 1×100 + 1×50
 */
export function decomposePacks(qty: number): { pack: number; count: number }[] {
  if (!Number.isFinite(qty) || qty <= 0) return [];

  let rem = Math.round(qty);
  const parts: { pack: number; count: number }[] = [];

  const n100 = Math.floor(rem / 100);
  if (n100 > 0) {
    parts.push({ pack: 100, count: n100 });
    rem %= 100;
  }

  // 75 is its own tier — only when remainder is exactly 75
  if (rem === 75) {
    parts.push({ pack: 75, count: 1 });
    rem = 0;
  }

  if (rem >= 50) {
    parts.push({ pack: 50, count: 1 });
    rem -= 50;
  }

  const n25 = Math.floor(rem / 25);
  if (n25 > 0) {
    parts.push({ pack: 25, count: n25 });
  }

  return parts;
}

function toBuckets(stats: Map<number, PackStats>): QuantityBucket[] {
  return [25, 50, 75, 100]
    .filter((q) => stats.has(q))
    .map((quantity) => {
      const s = stats.get(quantity)!;
      return {
        quantity,
        orderCount: s.orderCount,
        packCount: s.packCount,
      };
    });
}

function bumpPack(stats: Map<number, PackStats>, pack: number, packs: number) {
  const cur = stats.get(pack) ?? { orderCount: 0, packCount: 0 };
  cur.orderCount += 1;
  cur.packCount += packs;
  stats.set(pack, cur);
}

function applyPackParts(
  stats: Map<number, PackStats>,
  parts: { pack: number; count: number }[],
) {
  for (const part of parts) {
    bumpPack(stats, part.pack, part.count);
  }
}

export function analyzeProduct(
  grid: string[][],
  saleColumns: SaleColumn[],
  product: Product,
): ProductAnalysis {
  const byQuantity = new Map<number, PackStats>();
  const clientMap = new Map<
    string,
    {
      client: string;
      orderCount: number;
      totalQty: number;
      byQuantity: Map<number, PackStats>;
      orders: ClientBreakdown["orders"];
    }
  >();

  let orderCount = 0;
  let totalQty = 0;

  for (const col of saleColumns) {
    const qty = parseNumber(cell(grid, product.rowIndex, col.colIndex));
    if (qty === null || qty === 0) continue;

    orderCount += 1;
    totalQty += qty;

    const parts = decomposePacks(qty);
    applyPackParts(byQuantity, parts);

    // Named buyers aggregate; anonymous order columns stay separate
    const isAnonymous = col.client.startsWith("Не указан");
    const key = isAnonymous ? `col:${col.colIndex}` : `name:${col.client}`;

    const existing = clientMap.get(key) ?? {
      client: col.client,
      orderCount: 0,
      totalQty: 0,
      byQuantity: new Map<number, PackStats>(),
      orders: [],
    };

    existing.orderCount += 1;
    existing.totalQty += qty;
    applyPackParts(existing.byQuantity, parts);
    existing.orders.push({
      date: col.date,
      city: col.city,
      payment: col.payment,
      quantity: qty,
    });

    clientMap.set(key, existing);
  }

  const clients: ClientBreakdown[] = [...clientMap.values()]
    .map((data) => ({
      client: data.client,
      orderCount: data.orderCount,
      totalQty: data.totalQty,
      byQuantity: toBuckets(data.byQuantity),
      orders: data.orders,
    }))
    .sort(
      (a, b) => b.totalQty - a.totalQty || a.client.localeCompare(b.client, "ru"),
    );

  return {
    product,
    orderCount,
    clientCount: clients.length,
    totalQty,
    byQuantity: toBuckets(byQuantity),
    clients,
  };
}

export function findProduct(
  products: Product[],
  query: string,
): Product | undefined {
  const q = query.trim().toLowerCase();
  if (!q) return undefined;

  return (
    products.find((p) => p.sku.toLowerCase() === q) ||
    products.find((p) => p.label.toLowerCase() === q) ||
    products.find((p) => p.sku.toLowerCase().startsWith(q)) ||
    products.find((p) => p.label.toLowerCase().includes(q))
  );
}

/** Top products by pack-25 sales; includes pack-50 counts for the same SKUs. */
export function topProductsByPack25(
  grid: string[][],
  saleColumns: SaleColumn[],
  products: Product[],
  limit = 150,
): TopPackRow[] {
  const rows: TopPackRow[] = [];

  for (const product of products) {
    let pack25 = 0;
    let pack50 = 0;

    for (const col of saleColumns) {
      const qty = parseNumber(cell(grid, product.rowIndex, col.colIndex));
      if (qty === null || qty === 0) continue;

      for (const part of decomposePacks(qty)) {
        if (part.pack === 25) pack25 += part.count;
        if (part.pack === 50) pack50 += part.count;
      }
    }

    if (pack25 <= 0) continue;
    rows.push({ sku: product.sku, pack25, pack50 });
  }

  return rows
    .sort(
      (a, b) =>
        b.pack25 - a.pack25 ||
        b.pack50 - a.pack50 ||
        a.sku.localeCompare(b.sku, "ru"),
    )
    .slice(0, limit);
}
