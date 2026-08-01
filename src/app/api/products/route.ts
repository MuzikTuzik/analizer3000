import { NextRequest, NextResponse } from "next/server";
import { getProducts } from "@/lib/sheets";
import { parseYearsParam } from "@/lib/years";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const years = parseYearsParam(request.nextUrl.searchParams.get("years"));
    const data = await getProducts(years);
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
