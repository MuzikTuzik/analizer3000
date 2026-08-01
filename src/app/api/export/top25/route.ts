import ExcelJS from "exceljs";
import { NextRequest, NextResponse } from "next/server";
import { parseLimitParam } from "@/lib/limit";
import { getTopPack25Rows } from "@/lib/sheets";
import { parseYearsParam } from "@/lib/years";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const years = parseYearsParam(request.nextUrl.searchParams.get("years"));
    const limit = parseLimitParam(request.nextUrl.searchParams.get("limit"));
    const rows = await getTopPack25Rows(limit, years);
    const yearLabel = years?.length ? years.join("-") : "all";

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "analizer3000";
    const sheet = workbook.addWorksheet(`Топ ${limit} по 25`);

    sheet.columns = [
      { header: "Артикул", key: "sku", width: 18 },
      { header: "По 25", key: "pack25", width: 12 },
      { header: "По 50", key: "pack50", width: 12 },
    ];

    sheet.getRow(1).font = { bold: true };
    for (const row of rows) {
      sheet.addRow({
        sku: row.sku,
        pack25: row.pack25,
        pack50: row.pack50,
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `top${limit}-po25-${yearLabel}-${new Date().toISOString().slice(0, 10)}.xlsx`;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
