import { getHeroes } from "@/lib/opendota/client";
import type { OpenDotaHero } from "@/lib/opendota/types";
import DraftApp from "./components/DraftApp";

export default async function Page() {
  let heroes: OpenDotaHero[] = [];
  try {
    heroes = await getHeroes();
  } catch {
    // OpenDota unreachable — app still renders, picker will be empty
  }
  return <DraftApp heroes={heroes} />;
}
