import { NextResponse } from "next/server";
import { getAvailableYears } from "@/lib/sheets";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getAvailableYears();
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
