import { NextResponse } from "next/server";

import { early } from "@/config/early";
import { siteOrigin } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

/** An invite link: remember who sent it (first one wins when the account is created), then open Early Mind. */
export async function GET(req: Request, { params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const h = decodeURIComponent(handle).replace(/^@/, "").toLowerCase();
  const res = NextResponse.redirect(`${siteOrigin(req)}/early`, 302);
  if (/^[a-z0-9_]{1,15}$/.test(h)) {
    res.cookies.set(early.refCookie, h, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 30 * 86400 });
  }
  return res;
}
