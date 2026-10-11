import { startXLogin } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

/** GET /api/auth/x/login?next=/path → X consent screen (read posts + read profile, no email). */
export const GET = (req: Request) => startXLogin(req);
