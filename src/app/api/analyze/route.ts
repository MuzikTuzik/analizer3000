import { NextRequest, NextResponse } from "next/server";
import { getAnalysis } from "@/lib/sheets";
import { parseYearsParam } from "@/lib/years";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";

  if (!q) {
    return NextResponse.json({ error: "Укажите параметр q" }, { status: 400 });
  }

  try {
    const years = parseYearsParam(request.nextUrl.searchParams.get("years"));
    const analysis = await getAnalysis(q, years);
    if (!analysis) {
      return NextResponse.json(
        { error: "Позиция не найдена в выбранных годах" },
        { status: 404 },
      );
    }
    return NextResponse.json(analysis);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
