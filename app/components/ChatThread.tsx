"use client";

import { useEffect, useRef, useState } from "react";

export interface ChatMessage {
  id: number;
  mine: boolean;
  text: string;
}

// Message list + composer, shared by the chat sidebar and the in-call chat.
export default function ChatThread({
  messages,
  connected,
  onSend,
  autoFocus = false,
}: {
  messages: ChatMessage[];
  connected: boolean;
  onSend: (text: string) => void;
  autoFocus?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !connected) return;
    onSend(text);
    setDraft("");
  }

  return (
    <>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
        {messages.length === 0 && (
          <p className="mt-8 text-center text-sm text-zinc-500">
            Say hello. Messages are peer-to-peer and never stored.
          </p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.mine ? "justify-end" : "justify-start"}`}
          >
            <span
              className={`max-w-[80%] break-words rounded-2xl px-3 py-2 text-sm ${
                m.mine
                  ? "bg-emerald-400 text-zinc-950"
                  : "bg-zinc-800 text-zinc-100"
              }`}
            >
              {m.text}
            </span>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <form onSubmit={submit} className="flex gap-2 border-t border-zinc-800 p-3">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={connected ? "Type a message…" : "Connecting…"}
          disabled={!connected}
          autoFocus={autoFocus}
          className="min-w-0 flex-1 rounded-full bg-zinc-900 px-4 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:ring-1 focus:ring-emerald-400 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!connected || !draft.trim()}
          className="rounded-full bg-emerald-400 px-4 py-2 text-sm font-semibold text-zinc-950 disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </>
  );
}
