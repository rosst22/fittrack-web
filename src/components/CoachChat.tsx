"use client";

import { useEffect, useRef, useState } from "react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const GREETING: ChatMessage = {
  role: "assistant",
  content: "Hey! I'm your coach — I can see today's meals, workouts, and water. Ask me anything, like \"how am I doing on protein?\" or \"what should I eat for dinner?\"",
};

export default function CoachChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set when the quota guard says a paid plan would lift the limit that was
  // just hit, so the error can offer a way out instead of a dead end.
  const [showUpgrade, setShowUpgrade] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, open, busy]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setError(null);
    setShowUpgrade(false);
    setInput("");
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setBusy(true);
    try {
      const res = await fetch("/api/coach/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The greeting is client-side only; don't send it.
        body: JSON.stringify({ messages: next.slice(1) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setShowUpgrade(Boolean(data.upgrade));
        throw new Error(data.error || "Something went wrong");
      }
      setShowUpgrade(false);
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {open && (
        <div className="fixed bottom-20 right-4 z-40 flex h-[28rem] w-[calc(100vw-2rem)] max-w-sm flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="text-sm font-bold text-foreground">Coach</span>
            <button
              onClick={() => setOpen(false)}
              className="text-muted hover:text-foreground"
              aria-label="Close chat"
            >
              ✕
            </button>
          </div>
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div
                  className={
                    m.role === "user"
                      ? "max-w-[85%] whitespace-pre-wrap rounded-lg bg-accent px-3 py-2 text-sm text-white"
                      : "max-w-[85%] whitespace-pre-wrap rounded-lg bg-surface-2 px-3 py-2 text-sm text-foreground"
                  }
                >
                  {m.content}
                </div>
              </div>
            ))}
            {busy && <div className="text-sm text-muted">Coach is thinking…</div>}
            {error && (
              <div className="space-y-1 text-sm text-red-500">
                <div>{error}</div>
                {showUpgrade && (
                  <a href="/upgrade" className="inline-block font-medium text-accent underline">
                    See FitTrack Pro →
                  </a>
                )}
              </div>
            )}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="flex gap-2 border-t border-border p-3"
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask your coach…"
              className="flex-1 rounded-md border border-border px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="rounded-md bg-accent px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              Send
            </button>
          </form>
        </div>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-4 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-accent text-xl text-white shadow-lg hover:opacity-90"
        aria-label={open ? "Close coach chat" : "Open coach chat"}
      >
        {open ? "✕" : "💬"}
      </button>
    </>
  );
}
