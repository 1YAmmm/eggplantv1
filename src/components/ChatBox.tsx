"use client";

import { useEffect, useRef, useState } from "react";
import { useClickLimit } from "@/lib/clickLimit";
import type { Prediction } from "@/lib/model";
import { getPest } from "@/lib/pests";

type Message = { role: "user" | "assistant"; content: string };

const MAX_CHARS = 500;
const MAX_QUESTIONS_PER_MINUTE = 6;
/** How many of the most likely diagnoses are shared with the assistant. */
const SCAN_ENTRIES = 4;

function suggestions(label: string): string[] {
  const pest = getPest(label);
  if (pest.healthy) {
    return ["How do I keep my plant healthy?", "How often should I water?", "Paano maiiwasan ang peste?"];
  }
  const first = pest.pesticides[0];
  return [
    first ? `How do I use ${first.brand ?? first.name}?` : "What should I do first?",
    "Gaano kadalas dapat mag-spray?",
    "Is it safe to harvest after spraying?",
  ];
}

/**
 * Floating chat button (bottom-right) that opens a chat panel about the latest scan. Render it only while a
 * result is on screen; the conversation lives as long as the component is mounted.
 */
export default function ChatBox({ predictions }: { predictions: Prediction[] }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  // At most 6 questions a minute from this page: enough for a normal chat, not for spamming the AI.
  const sendLimit = useClickLimit(MAX_QUESTIONS_PER_MINUTE, 60_000);
  const cooling = sendLimit.waitSeconds > 0;

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading, error, open]);

  useEffect(() => {
    if (!open) return;
    // Focus the field on desktop only; on phones it would pop up the keyboard straight away.
    if (window.matchMedia("(pointer: fine)").matches) inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      requestAnimationFrame(() => buttonRef.current?.focus());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function send(text: string) {
    const question = text.trim();
    if (!question || loading || sendLimit.isLimited()) return;
    sendLimit.record();
    const next: Message[] = [...messages, { role: "user", content: question }];
    setMessages(next);
    setInput("");
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next,
          scan: predictions.slice(0, SCAN_ENTRIES).map((p) => ({ label: p.label, probability: p.probability })),
        }),
      });
      const data = (await res.json().catch(() => null)) as { reply?: string; error?: string } | null;
      if (!res.ok || !data?.reply) throw new Error(data?.error ?? "Something went wrong. Please try again.");
      setMessages([...next, { role: "assistant", content: data.reply }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reach the assistant. Check your connection.");
    } finally {
      setLoading(false);
    }
  }

  const position = "fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40";

  if (!open) {
    return (
      <button
        ref={buttonRef}
        onClick={() => setOpen(true)}
        aria-label="Ask a question about this result"
        aria-expanded={false}
        className={`${position} flex h-14 items-center gap-2 rounded-full bg-leaf-700 px-4 text-sm font-medium text-white shadow-xl shadow-leaf-900/25 transition hover:bg-leaf-800 active:scale-95 sm:px-5`}
      >
        <ChatIcon className="h-6 w-6" />
        <span className="hidden sm:inline">Ask a question</span>
      </button>
    );
  }

  return (
    <section
      aria-label="Ask a question"
      className={`${position} flex h-[min(34rem,calc(100dvh-2rem))] w-[calc(100vw-2rem)] max-w-sm flex-col overflow-hidden rounded-3xl bg-white shadow-2xl shadow-leaf-900/25 ring-1 ring-leaf-900/10`}
    >
      <header className="flex items-center justify-between gap-3 bg-leaf-900 px-4 py-3 text-white">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Ask a question</h2>
          <p className="truncate text-xs text-white/70">About: {getPest(predictions[0].label).name}</p>
        </div>
        <button
          onClick={() => {
            setOpen(false);
            requestAnimationFrame(() => buttonRef.current?.focus());
          }}
          aria-label="Close chat"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15 transition hover:bg-white/25"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </header>

      <div ref={listRef} role="log" aria-live="polite" className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div>
            <p className="text-sm text-leaf-900/70">
              Ask about this result: how to spray, how often, or how to protect your plants. You can write in English or
              Tagalog.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {suggestions(predictions[0].label).map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  disabled={cooling}
                  className="rounded-full bg-leaf-50 px-3 py-1.5 text-left text-sm text-leaf-800 ring-1 ring-leaf-900/10 transition hover:bg-leaf-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <p
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                m.role === "user" ? "bg-leaf-700 text-white" : "bg-leaf-50 text-leaf-900"
              }`}
            >
              {m.content}
            </p>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <p className="rounded-2xl bg-leaf-50 px-3.5 py-2.5 text-sm text-leaf-900/60">Thinking…</p>
          </div>
        )}
        {error && <p className="rounded-2xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex gap-2 border-t border-leaf-900/10 p-3"
      >
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={MAX_CHARS}
          placeholder="Type your question…"
          aria-label="Your question"
          className="h-11 min-w-0 flex-1 rounded-xl bg-leaf-50 px-3.5 text-base text-leaf-950 outline-none ring-1 ring-leaf-900/10 placeholder:text-leaf-900/40 focus:ring-2 focus:ring-leaf-500 sm:text-sm"
        />
        <button
          type="submit"
          disabled={loading || cooling || !input.trim()}
          className="h-11 shrink-0 rounded-xl bg-leaf-700 px-4 text-sm font-medium text-white transition hover:bg-leaf-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {cooling ? `Wait ${sendLimit.waitSeconds}s` : "Send"}
        </button>
      </form>
      {cooling && (
        <p role="status" className="px-4 pb-2 text-xs text-amber-700">
          You are sending messages too fast. You can ask again in {sendLimit.waitSeconds}s.
        </p>
      )}
      <p className="px-4 pb-3 text-xs text-leaf-900/50">
        AI answers can be wrong. Check the product label and ask your local agriculturist for serious infestations.
      </p>
    </section>
  );
}

const svg = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", viewBox: "0 0 24 24" } as const;

function ChatIcon({ className }: { className?: string }) {
  return (
    <svg {...svg} className={className} aria-hidden="true">
      <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.6 8.6 0 0 1-3.6-.8L3 21l1.9-5.1A8.4 8.4 0 1 1 21 11.5Z" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg {...svg} strokeWidth={2.2} className={className} aria-hidden="true">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}
