import fs from "fs";

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else q = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') {
      q = true;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
      continue;
    }
    field += ch;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const g = parseCsv(fs.readFileSync("sheet.csv", "utf8"));
const names = [
  "Смирнова",
  "Автометиз",
  "Цюцюроха",
  "Краска",
  "Белов",
  "Арменян",
  "Винокуров",
  "Бородина",
];

for (const name of names) {
  const cols = [];
  for (let c = 0; c < g[6].length; c++) {
    if ((g[6][c] || "").includes(name)) cols.push(c);
  }
  // also search all header rows
  const any = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < (g[r]?.length || 0); c++) {
      if ((g[r][c] || "").includes(name)) any.push(`${r}:${c}`);
    }
  }
  console.log(name, "row7cols", cols, "any", any.slice(0, 20));
}

// List ALL clients in row 7 after col 27
const all = [];
for (let c = 27; c < g[6].length; c++) {
  const v = (g[6][c] || "").trim();
  if (v) all.push(`${c}:${v}`);
}
console.log("\nAll clients after 27:", all.join(" | "));
console.log("count", all.length);

// How many product qty cells exist in sale-like columns (date present, col>=31)
let qtyCells = 0;
let rowIdx = -1;
for (let r = 7; r < Math.min(g.length, 200); r++) {
  if ((g[r][3] || "").match(/^\d/)) {
    for (let c = 31; c < g[6].length; c++) {
      const date = (g[5][c] || "").trim();
      const qty = (g[r][c] || "").trim();
      if (/^\d{1,2}[./-]/.test(date) && qty && Number(qty.replace(",", "."))) {
        qtyCells++;
      }
    }
  }
}
console.log("qty cells in first ~200 products with dates:", qtyCells);
