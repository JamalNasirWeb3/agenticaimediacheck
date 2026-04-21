import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    const res = await fetch(`${BACKEND_URL}/api/fact-check-image`, {
      method: "POST",
      body: formData,
    });

    const body = await res.text();

    return new NextResponse(body, {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return NextResponse.json(
      { detail: `Proxy error: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
