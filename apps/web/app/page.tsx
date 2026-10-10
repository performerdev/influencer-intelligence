import { HomeStage } from "@/components/home/HomeStage";
import { latestQuestions, loadIntelligences } from "@/lib/server/data";

// Real counts come from the database; refresh the page data every 5 minutes.
export const revalidate = 300;

export default async function Home() {
  const [intelligences, questions] = await Promise.all([loadIntelligences(), latestQuestions()]);
  return <HomeStage intelligences={intelligences} questions={questions} />;
}
