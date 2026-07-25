import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const hasApiKey = Boolean(process.env.GOOGLE_API_KEY?.trim());
  const sheetId =
    process.env.GOOGLE_SHEET_ID?.trim() ||
    "1nECnwPqhPggtkFMPuwTUi-JKPF8TsdoMvcmhtQfJzr8";

  let sheetsApiOk: boolean | null = null;
  let sheetsApiError: string | null = null;

  if (hasApiKey) {
    try {
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=properties.title&key=${process.env.GOOGLE_API_KEY}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) {
        sheetsApiOk = false;
        sheetsApiError = `${res.status}: ${(await res.text()).slice(0, 250)}`;
      } else {
        sheetsApiOk = true;
      }
    } catch (err) {
      sheetsApiOk = false;
      sheetsApiError = err instanceof Error ? err.message : String(err);
    }
  }

  return NextResponse.json({
    ok: hasApiKey && sheetsApiOk === true,
    hasApiKey,
    sheetId,
    sheetsApiOk,
    sheetsApiError,
    hint: !hasApiKey
      ? "Добавьте GOOGLE_API_KEY в Vercel → Settings → Environment Variables (Environment: Production) → Save → Redeploy"
      : sheetsApiOk
        ? "Ключ работает"
        : "Ключ есть, но Sheets API не отвечает — включите Google Sheets API и проверьте доступ таблицы «по ссылке»",
  });
}
