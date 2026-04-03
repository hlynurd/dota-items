import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam } from "@anthropic-ai/sdk/resources";
import { toolDefinitions, executeTool } from "../tools";
import { CHAT_SYSTEM_PROMPT } from "./prompts";
import type { ChatMessage, ChatContext } from "./types";

const client = new Anthropic();

// Serialise the draft context into a system message addendum
function buildContextBlock(ctx: ChatContext): string {
  const radiantNames = ctx.draft.radiant
    .map((h) => `${h.localized_name}${h.position ? ` (pos${h.position})` : ""}`)
    .join(", ") || "none";
  const direNames = ctx.draft.dire
    .map((h) => `${h.localized_name}${h.position ? ` (pos${h.position})` : ""}`)
    .join(", ") || "none";

  const buildSummaries = ctx.builds
    .map((b) => {
      const coreItems = b.phases.core.map((i) => i.display_name).join(", ");
      return `${b.hero.localized_name}: core = [${coreItems}]`;
    })
    .join("\n");

  return (
    `\n\n## Current Draft\nRadiant: ${radiantNames}\nDire: ${direNames}\n\n` +
    `## Recommended Builds\n${buildSummaries}`
  );
}

// Returns a streaming text response — the route handler pipes this to the client
export async function* chatStream(
  messages: ChatMessage[],
  ctx: ChatContext
): AsyncGenerator<string> {
  const systemPrompt = CHAT_SYSTEM_PROMPT + buildContextBlock(ctx);

  const apiMessages: MessageParam[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  // Chat agent also has tool access for fresh data lookups
  while (true) {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: systemPrompt,
      tools: toolDefinitions,
      messages: apiMessages,
    });

    if (response.stop_reason === "tool_use") {
      apiMessages.push({ role: "assistant", content: response.content });

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
      apiMessages.push({ role: "user", content: toolResults });
    } else {
      // Stream the final text response character by character
      const textBlock = response.content.find((b) => b.type === "text");
      if (textBlock && textBlock.type === "text") {
        yield textBlock.text;
      }
      break;
    }
  }
}
