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

// Dump all header rows for cols 28-70
for (let c = 28; c <= 70; c++) {
  const vals = [0, 1, 2, 3, 4, 5, 6].map((r) => (g[r][c] || "").trim());
  if (vals.some(Boolean)) {
    console.log(
      c,
      JSON.stringify({
        r1: vals[0],
        from: vals[1],
        to: vals[2],
        pay: vals[3],
        sum: vals[4],
        date: vals[5],
        client: vals[6],
      }),
    );
  }
}

console.log("\n--- product 10004-1 qty in cols 28-80 ---");
let rowIdx = -1;
for (let r = 7; r < g.length; r++) {
  if ((g[r][3] || "").includes("10004-1")) {
    rowIdx = r;
    break;
  }
}
for (let c = 28; c <= 120; c++) {
  const qty = (g[rowIdx][c] || "").trim();
  const client = (g[6][c] || "").trim();
  const date = (g[5][c] || "").trim();
  if (qty || client) {
    console.log({ c, qty, client, date, pay: (g[3][c] || "").trim() });
  }
}
