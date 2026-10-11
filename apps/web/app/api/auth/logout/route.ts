import { logout } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

export async function POST() {
  await logout();
  return Response.json({ ok: true });
}
