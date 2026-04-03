import { after } from "next/server";
import { getHeroes } from "@/lib/opendota/client";
import type { OpenDotaHero } from "@/lib/opendota/types";
import { runAggregate, runMarginalAggregate } from "@/scripts/aggregate";
import DraftApp from "./components/DraftApp";

export default async function Page() {
  // Recompute win rates after every page load so data is fresh on the next request.
  // after() runs after the response is sent — does not block rendering.
  after(async () => {
    try {
      await Promise.all([runAggregate(), runMarginalAggregate()]);
    } catch (err) {
      console.error("[page] Background aggregate failed:", err);
    }
  });

  let heroes: OpenDotaHero[] = [];
  try {
    heroes = await getHeroes();
  } catch {
    // OpenDota unreachable — app still renders, picker will be empty
  }
  return <DraftApp heroes={heroes} />;
}
