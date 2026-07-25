import ExcelJS from "exceljs";

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile("sheet.xlsx");
console.log(
  "sheets",
  wb.worksheets.map((s) => s.name),
);

const ws = wb.worksheets[0];
console.log("sheet", ws.name, "dims", ws.dimensions?.toString?.() || ws.dimensions);
console.log("merges", ws._merges ? Object.keys(ws._merges).length : 0);

const mergeKeys = ws._merges ? Object.keys(ws._merges).slice(0, 30) : [];
console.log("sample merges", mergeKeys);

// Row 7 clients (1-based in exceljs)
const row7 = ws.getRow(7);
const clients = [];
row7.eachCell({ includeEmpty: false }, (cell, col) => {
  if (col >= 28) clients.push(`${col}:${cell.text || cell.value}`);
});
console.log("row7 clients count", clients.length);
console.log(clients.slice(0, 40).join(" | "));

// Check specific cells around 31-45
for (let c = 28; c <= 55; c++) {
  const vals = {};
  for (let r = 1; r <= 7; r++) {
    const cell = ws.getRow(r).getCell(c);
    const v = cell.text || cell.value;
    if (v !== null && v !== undefined && v !== "") vals[`r${r}`] = String(v).slice(0, 40);
  }
  if (Object.keys(vals).length) console.log(c, vals);
}

// Search for Смирнова anywhere in first 10 rows
let found = 0;
for (let r = 1; r <= 10; r++) {
  ws.getRow(r).eachCell({ includeEmpty: false }, (cell, col) => {
    const t = String(cell.text || cell.value || "");
    if (t.includes("Смирнова") || t.includes("Автометиз")) {
      console.log("FOUND", r, col, t);
      found++;
    }
  });
}
console.log("found names", found);
