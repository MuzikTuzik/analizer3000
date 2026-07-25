import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

export async function POST() {
  revalidateTag("sheet", "max");
  return NextResponse.json({ ok: true, revalidatedAt: new Date().toISOString() });
}
