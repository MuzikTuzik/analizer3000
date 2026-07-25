import fs from "fs";
import { parseCsv } from "../src/lib/csv.ts";

// Re-implement detect/analyze briefly by importing compiled logic via dynamic eval of source patterns
const PAYMENT_OK = ["нал", "безнал", "на карту"];
const PAY_BAD = ["возврат", "обмен", "карлос", "продано", "резерв", "корректир", "таганрог"];
const CLIENT_BAD = [
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

const grid = parseCsv(fs.readFileSync("sheet.csv", "utf8"));
const cell = (r, c) => (grid[r]?.[c] ?? "").trim();
const num = (s) => {
  if (!s) return null;
  const n = Number(s.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

let start = 0;
for (let c = 0; c < grid[6].length; c++) {
  if (cell(6, c).toLowerCase().includes("примечан")) {
    start = c + 1;
    break;
  }
}

const sales = [];
for (let col = start; col < grid[6].length; col++) {
  const clientRaw = cell(6, col);
  const date = cell(5, col);
  const payment = cell(3, col);
  const sum = num(cell(4, col));
  if (!/^\d{1,2}[./-]\d{1,2}/.test(date)) continue;
  const payL = payment.toLowerCase();
  const clientL = clientRaw.toLowerCase();
  if (PAY_BAD.some((m) => payL.includes(m))) continue;
  if (/^\d{4}$/.test(clientL) || CLIENT_BAD.some((m) => clientL.includes(m)))
    continue;
  const namedSale = Boolean(clientRaw) && PAYMENT_OK.some((m) => payL.includes(m));
  const anonymousOrder = !clientRaw && sum !== null;
  const namedWithoutPay = Boolean(clientRaw) && !payment && sum !== null;
  if (!namedSale && !anonymousOrder && !namedWithoutPay) continue;
  sales.push({
    col,
    client: clientRaw || `Не указан · ${date}`,
    date,
    payment,
  });
}

console.log({ start, saleCols: sales.length });

let rowIdx = -1;
for (let r = 7; r < grid.length; r++) {
  if (cell(r, 3).includes("10004-1")) {
    rowIdx = r;
    break;
  }
}

let orders = 0;
let total = 0;
const byQ = new Map();
const byC = new Map();
for (const s of sales) {
  const qty = num(cell(rowIdx, s.col));
  if (!qty) continue;
  orders++;
  total += qty;
  byQ.set(qty, (byQ.get(qty) || 0) + 1);
  byC.set(s.client, (byC.get(s.client) || 0) + qty);
}
console.log({
  product: cell(rowIdx, 3),
  orders,
  total,
  byQ: [...byQ].sort((a, b) => a[0] - b[0]),
  top: [...byC].sort((a, b) => b[1] - a[1]).slice(0, 12),
});

let products = 0;
for (let r = 7; r < grid.length; r++) {
  if (/\d/.test(cell(r, 3))) products++;
}
console.log({ products });
