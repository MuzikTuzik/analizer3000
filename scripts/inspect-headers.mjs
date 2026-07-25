import fs from "fs";

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      pushField();
      continue;
    }
    if (ch === "\n") {
      pushField();
      pushRow();
      continue;
    }
    if (ch === "\r") {
      if (text[i + 1] === "\n") i += 1;
      pushField();
      pushRow();
      continue;
    }
    field += ch;
  }
  if (field.length || row.length) {
    pushField();
    pushRow();
  }
  return rows;
}

const g = parseCsv(fs.readFileSync("sheet.csv", "utf8"));

for (let r = 0; r <= 7; r++) {
  const non = [];
  for (let c = 0; c < g[r].length; c++) {
    const v = (g[r][c] || "").trim();
    if (v) non.push(`${c}:${v.slice(0, 40)}`);
  }
  console.log(`ROW ${r + 1} nonempty ${non.length}`);
  console.log(non.slice(0, 30).join(" | "));
  console.log("---");
}

const hits = [];
for (let c = 0; c < g[6].length; c++) {
  const client = g[6][c] || "";
  if (
    client.includes("Автометиз") ||
    client.includes("Смирнова") ||
    client.includes("Кабадарян") ||
    client.includes("Винокуров")
  ) {
    hits.push({
      c,
      client,
      pay: g[3][c],
      date: g[5][c],
      city: g[2][c],
      sum: g[4][c],
    });
  }
}
console.log("known clients", hits.slice(0, 25));

let withDate = 0;
let withPay = 0;
let both = 0;
let named = 0;
for (let c = 0; c < g[6].length; c++) {
  const client = (g[6][c] || "").trim();
  if (!client) continue;
  named += 1;
  const date = (g[5][c] || "").trim();
  const pay = (g[3][c] || "").trim();
  const hasDate = /^\d{1,2}[./-]/.test(date);
  const hasPay = /нал|безнал|карт/i.test(pay);
  if (hasDate) withDate += 1;
  if (hasPay) withPay += 1;
  if (hasDate && hasPay) both += 1;
}
console.log({ named, withDate, withPay, both });

// Show columns that have date + client but fail payment check
const almost = [];
for (let c = 0; c < g[6].length; c++) {
  const client = (g[6][c] || "").trim();
  const date = (g[5][c] || "").trim();
  const pay = (g[3][c] || "").trim();
  if (!client) continue;
  if (!/^\d{1,2}[./-]/.test(date)) continue;
  if (!/нал|безнал|карт/i.test(pay)) {
    almost.push({ c, client, date, pay });
  }
}
console.log("date+client but no payment", almost.slice(0, 40));
console.log("count almost", almost.length);
