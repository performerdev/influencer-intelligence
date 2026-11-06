import { AppHome } from "@/components/app/AppHome";
import { HomeStage } from "@/components/home/HomeStage";
import { currentUser } from "@/lib/server/auth";
import { hasDatabase, loadIntelligences } from "@/lib/server/data";

// Visitors get the landing page; logged-in visitors get the app. Both read the session cookie, so this renders per request:
// one quick session lookup here, everything per user (recent chats, the brain) is fetched by the app in the browser.
export const dynamic = "force-dynamic";

export default async function Home() {
  const [user, intelligences] = await Promise.all([hasDatabase() ? currentUser().catch(() => null) : null, loadIntelligences()]);
  return user ? <AppHome intelligences={intelligences} /> : <HomeStage intelligences={intelligences} />;
}
