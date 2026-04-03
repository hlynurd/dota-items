"use client";

import { useState } from "react";
import type { OpenDotaHero } from "@/lib/opendota/types";
import type { Hero, HeroBuild, ChatMessage, Position } from "@/lib/agent/types";
import DraftBoard from "./DraftBoard";
import HeroPicker from "./HeroPicker";
import ResultsPanel from "./ResultsPanel";
import ChatPanel from "./ChatPanel";

type SlotKey = { side: "radiant" | "dire"; slot: number };

function toHero(oh: OpenDotaHero, position: Position | null = null): Hero {
  return {
    id: oh.id,
    name: oh.name,
    localized_name: oh.localized_name,
    primary_attr: oh.primary_attr,
    attack_type: oh.attack_type,
    roles: oh.roles,
    position,
  };
}

export default function DraftApp({ heroes }: { heroes: OpenDotaHero[] }) {
  const [radiant, setRadiant] = useState<(Hero | null)[]>(Array(5).fill(null));
  const [dire, setDire] = useState<(Hero | null)[]>(Array(5).fill(null));
  const [picker, setPicker] = useState<SlotKey | null>(null);
  const [builds, setBuilds] = useState<HeroBuild[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);

  const selectedIds = new Set([...radiant, ...dire].filter(Boolean).map((h) => h!.id));

  function openPicker(side: "radiant" | "dire", slot: number) {
    setPicker({ side, slot });
  }

  function handleHeroSelect(hero: OpenDotaHero) {
    if (!picker) return;
    // Row index determines position by default (row 0 = pos 1, etc.)
    const newHero = toHero(hero, (picker.slot + 1) as Position);
    if (picker.side === "radiant") {
      setRadiant((prev) => prev.map((h, i) => (i === picker.slot ? newHero : h)));
    } else {
      setDire((prev) => prev.map((h, i) => (i === picker.slot ? newHero : h)));
    }
    setPicker(null);
    setBuilds([]);
    setChatMessages([]);
  }

  // Toggle between row-assigned position and null (uncertain)
  function handleUncertainToggle(side: "radiant" | "dire", slot: number) {
    const rowPosition = (slot + 1) as Position;
    const update = (prev: (Hero | null)[]) =>
      prev.map((h, i) => {
        if (i !== slot || !h) return h;
        return { ...h, position: h.position === null ? rowPosition : null };
      });
    if (side === "radiant") setRadiant(update);
    else setDire(update);
    setBuilds([]);
    setChatMessages([]);
  }

  function handleHeroRemove(side: "radiant" | "dire", slot: number) {
    const update = (prev: (Hero | null)[]) =>
      prev.map((h, i) => (i === slot ? null : h));
    if (side === "radiant") setRadiant(update);
    else setDire(update);
    setBuilds([]);
    setChatMessages([]);
  }

  async function handleAnalyze() {
    const radiantHeroes = radiant.filter((h): h is Hero => h !== null);
    const direHeroes = dire.filter((h): h is Hero => h !== null);
    if (radiantHeroes.length === 0 && direHeroes.length === 0) return;

    setIsAnalyzing(true);
    setBuilds([]);
    setChatMessages([]);
    setStatusMessage("Starting analysis...");

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft: { radiant: radiantHeroes, dire: direHeroes } }),
      });

      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as
            | { type: "status"; message: string }
            | { type: "hero_build"; data: HeroBuild }
            | { type: "done" }
            | { type: "error"; message: string };

          if (event.type === "status") setStatusMessage(event.message);
          if (event.type === "hero_build") setBuilds((prev) => [...prev, event.data]);
          if (event.type === "done") setStatusMessage("");
          if (event.type === "error") setStatusMessage(`Error: ${event.message}`);
        }
      }
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function handleChatSend(message: string) {
    const radiantHeroes = radiant.filter((h): h is Hero => h !== null);
    const direHeroes = dire.filter((h): h is Hero => h !== null);
    const newMessages: ChatMessage[] = [...chatMessages, { role: "user", content: message }];
    setChatMessages(newMessages);
    setIsChatLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages,
          context: { draft: { radiant: radiantHeroes, dire: direHeroes }, builds },
        }),
      });

      if (!res.body) throw new Error("No response body");

      // Add empty assistant message, then stream into it
      setChatMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let text = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        setChatMessages((prev) => [
          ...prev.slice(0, -1),
          { role: "assistant", content: text },
        ]);
      }
    } catch (err) {
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, something went wrong. Try again." },
      ]);
    } finally {
      setIsChatLoading(false);
    }
  }

  const hasResults = builds.length > 0;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center gap-3">
          <div className="w-2 h-6 bg-red-500 rounded-sm" />
          <h1 className="text-xl font-semibold tracking-tight">Dota 2 Itemization Advisor</h1>
          <span className="ml-2 text-xs text-zinc-500 font-mono">beta</span>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-8 flex flex-col gap-8">
        {/* Draft board */}
        <DraftBoard
          radiant={radiant}
          dire={dire}
          isAnalyzing={isAnalyzing}
          statusMessage={statusMessage}
          onOpenPicker={openPicker}
          onUncertainToggle={handleUncertainToggle}
          onHeroRemove={handleHeroRemove}
          onAnalyze={handleAnalyze}
        />

        {/* Results + Chat side by side once we have data */}
        {(hasResults || isAnalyzing) && (
          <div className="flex flex-col xl:flex-row gap-6">
            <div className="flex-1 min-w-0">
              <ResultsPanel builds={builds} isAnalyzing={isAnalyzing} />
            </div>
            <div className="xl:w-96 shrink-0">
              <ChatPanel
                messages={chatMessages}
                isLoading={isChatLoading}
                hasBuilds={hasResults}
                onSend={handleChatSend}
              />
            </div>
          </div>
        )}
      </main>

      {/* Hero picker modal */}
      {picker && (
        <HeroPicker
          heroes={heroes}
          excludeIds={selectedIds}
          onSelect={handleHeroSelect}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}
