import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam } from "@anthropic-ai/sdk/resources";
import { toolDefinitions, executeTool } from "../tools";
import { ANALYZE_SYSTEM_PROMPT } from "./prompts";
import type { DraftInput, Hero, HeroBuild } from "./types";

const client = new Anthropic();

// ─── Single-hero analysis (runs the tool-use loop) ───────────────────────────

async function analyzeHero(
  hero: Hero,
  allies: Hero[],
  enemies: Hero[]
): Promise<HeroBuild> {
  const posLabel = hero.position ? ` (Position ${hero.position})` : "";
  const allyNames =
    allies.length > 0
      ? allies
          .map((h) => `${h.localized_name}${h.position ? ` pos${h.position}` : ""}`)
          .join(", ")
      : "none";
  const enemyNames =
    enemies.length > 0
      ? enemies
          .map((h) => `${h.localized_name}${h.position ? ` pos${h.position}` : ""}`)
          .join(", ")
      : "none";

  const userMessage =
    `Recommend items for: ${hero.localized_name}${posLabel}\n` +
    `Hero ID: ${hero.id}\n` +
    `Allies: ${allyNames}\n` +
    `Enemies: ${enemyNames}\n` +
    `Enemy IDs: [${enemies.map((e) => e.id).join(", ")}]`;

  const messages: MessageParam[] = [{ role: "user", content: userMessage }];

  // Agentic tool-use loop
  while (true) {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system: ANALYZE_SYSTEM_PROMPT,
      tools: toolDefinitions,
      messages,
    });

    if (response.stop_reason === "tool_use") {
      messages.push({ role: "assistant", content: response.content });

      const toolResults: MessageParam["content"] = [];
      for (const block of response.content) {
        if (block.type === "tool_use") {
          const result = await executeTool(
            block.name,
            block.input as Record<string, unknown>
          );
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify(result),
          });
        }
      }
      messages.push({ role: "user", content: toolResults });
    } else {
      // Final response — extract and parse JSON
      const textBlock = response.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        throw new Error(`Agent returned no text for ${hero.localized_name}`);
      }

      // Strip any accidental markdown code fences
      const raw = textBlock.text.trim().replace(/^```json\n?/, "").replace(/\n?```$/, "");
      const parsed = JSON.parse(raw) as {
        phases: HeroBuild["phases"];
        timing_winrates: HeroBuild["timing_winrates"];
      };

      return { hero, phases: parsed.phases, timing_winrates: parsed.timing_winrates };
    }
  }
}

// ─── Streaming generator — yields events for the API route ──────────────────

export type AnalyzeEvent =
  | { type: "status"; message: string }
  | { type: "hero_build"; data: HeroBuild }
  | { type: "done" };

export async function* analyzeStream(
  draft: DraftInput
): AsyncGenerator<AnalyzeEvent> {
  const allHeroes = [...draft.radiant, ...draft.dire];

  for (const hero of allHeroes) {
    const isRadiant = draft.radiant.some((h) => h.id === hero.id);
    const allies = (isRadiant ? draft.radiant : draft.dire).filter(
      (h) => h.id !== hero.id
    );
    const enemies = isRadiant ? draft.dire : draft.radiant;

    yield { type: "status", message: `Analyzing ${hero.localized_name}...` };

    const build = await analyzeHero(hero, allies, enemies);
    yield { type: "hero_build", data: build };
  }

  yield { type: "done" };
}
