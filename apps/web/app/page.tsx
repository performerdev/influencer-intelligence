import { AppHome } from "@/components/app/AppHome";
import { HomeStage } from "@/components/home/HomeStage";
import { currentUser } from "@/lib/server/auth";
import { hasDatabase, latestQuestions, loadIntelligences } from "@/lib/server/data";
import { listChats } from "@/lib/server/history";

// Visitors get the landing page; logged-in visitors get the app. Both read the session cookie, so this renders per request.
export const dynamic = "force-dynamic";

export default async function Home() {
  const user = hasDatabase() ? await currentUser().catch(() => null) : null;
  if (user) {
    const [intelligences, chats] = await Promise.all([loadIntelligences(), listChats(user).catch(() => [])]);
    return <AppHome intelligences={intelligences} recent={chats.map(({ id, kind, handles, title, updatedAt }) => ({ id, kind, handles, title, updatedAt }))} />;
  }
  const [intelligences, questions] = await Promise.all([loadIntelligences(), latestQuestions()]);
  return <HomeStage intelligences={intelligences} questions={questions} />;
}
