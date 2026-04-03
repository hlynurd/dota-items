"use client";

import { useState, useRef, useEffect } from "react";
import type { ChatMessage } from "@/lib/agent/types";

interface Props {
  messages: ChatMessage[];
  isLoading: boolean;
  hasBuilds: boolean;
  onSend: (message: string) => void;
}

const SUGGESTIONS = [
  "Why is BKB recommended here?",
  "What should I buy if I'm getting stomped?",
  "What are the best items vs this lineup?",
  "Should I change my build based on the enemy offlane?",
];

export default function ChatPanel({ messages, isLoading, hasBuilds, onSend }: Props) {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;
    setInput("");
    onSend(text);
  }

  return (
    <div className="flex flex-col bg-zinc-900 border border-zinc-800 rounded-xl h-[600px]">
      {/* Header */}
      <div className="p-4 border-b border-zinc-800 shrink-0">
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-widest">
          Ask about the builds
        </h2>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        {messages.length === 0 && (
          <div className="flex flex-col gap-2 mt-2">
            <p className="text-xs text-zinc-600 mb-2">Suggestions:</p>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => onSend(s)}
                disabled={!hasBuilds}
                className="text-left text-xs text-zinc-500 hover:text-zinc-300 bg-zinc-800
                  hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed
                  rounded-lg px-3 py-2 transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed
                ${msg.role === "user"
                  ? "bg-red-700/30 text-zinc-100 rounded-br-sm"
                  : "bg-zinc-800 text-zinc-200 rounded-bl-sm"
                }`}
            >
              {msg.content || (
                <span className="flex gap-1">
                  <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce [animation-delay:0ms]" />
                  <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce [animation-delay:150ms]" />
                  <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce [animation-delay:300ms]" />
                </span>
              )}
            </div>
          </div>
        ))}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-3 border-t border-zinc-800 shrink-0 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={hasBuilds ? "Ask anything about the builds..." : "Run analysis first"}
          disabled={!hasBuilds || isLoading}
          className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2
            text-sm placeholder-zinc-600 focus:outline-none focus:border-zinc-500
            disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <button
          type="submit"
          disabled={!input.trim() || !hasBuilds || isLoading}
          className="px-4 py-2 bg-red-700 hover:bg-red-600 disabled:bg-zinc-700
            disabled:text-zinc-500 disabled:cursor-not-allowed rounded-lg text-sm
            font-medium transition-colors shrink-0"
        >
          Send
        </button>
      </form>
    </div>
  );
}
