import { finishXLogin } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

/** X redirects here with ?code&state; we exchange it once, read the profile, set the session. */
export const GET = (req: Request) => finishXLogin(req);
