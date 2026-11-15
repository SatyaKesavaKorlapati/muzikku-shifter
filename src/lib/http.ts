import { NextResponse } from "next/server";

export function ok(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function fail(error: unknown, status = 400) {
  const message = error instanceof Error ? error.message : "Request failed.";
  const code = /not found/i.test(message) ? 404 : status;
  return NextResponse.json({ error: message }, { status: code });
}
