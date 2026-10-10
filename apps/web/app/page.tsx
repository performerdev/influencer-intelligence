import { HomeStage } from "@/components/home/HomeStage";
import { getIntelligences } from "@/lib/intelligences";

export default function Home() {
  const intelligences = getIntelligences();
  return <HomeStage intelligences={intelligences} />;
}
