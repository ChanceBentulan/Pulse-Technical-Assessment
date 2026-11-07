"use client";

import { displayName } from "@/lib/profile";
import ChatThread, { type ChatMessage } from "./ChatThread";
import TagList from "./TagList";
import SafetyCode from "./SafetyCode";
import type { SafetySymbol } from "@/lib/safetyCode";

export type { ChatMessage };

export default function ChatPanel({
  peerName,
  peerTags,
  myTags,
  messages,
  connected,
  videoBusy,
  safetyCode,
  iVerified,
  peerVerified,
  onConfirmCode,
  onRejectCode,
  onSend,
  onStartVideo,
  onEnd,
}: {
  peerName: string | null;
  peerTags: string[];
  myTags: string[];
  messages: ChatMessage[];
  connected: boolean;
  videoBusy: boolean;
  safetyCode: SafetySymbol[] | null;
  iVerified: boolean;
  peerVerified: boolean;
  onConfirmCode: () => void;
  onRejectCode: () => void;
  onSend: (text: string) => void;
  onStartVideo: () => void;
  onEnd: () => void;
}) {
  return (
    <div className="absolute inset-y-0 right-0 z-20 flex w-full max-w-md flex-col border-l border-zinc-800 bg-zinc-950 text-zinc-100 shadow-2xl">
      <header className="flex items-start justify-between gap-3 border-b border-zinc-800 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate font-semibold">{displayName(peerName)}</p>
          <p className="text-xs text-zinc-500">
            {connected ? "Connected" : "Connecting…"}
          </p>
          <TagList tags={peerTags} myTags={myTags} className="mt-1.5" />
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={onStartVideo}
            disabled={!connected || videoBusy}
            className="rounded-full border border-zinc-700 px-3 py-1.5 text-sm hover:border-zinc-500 disabled:opacity-40"
          >
            Video
          </button>
          <button
            onClick={onEnd}
            className="rounded-full bg-red-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-400"
          >
            End
          </button>
        </div>
      </header>

      {connected && (
        <div className="border-b border-zinc-800 px-4 pb-2.5">
          <SafetyCode
            code={safetyCode}
            peerName={displayName(peerName)}
            iVerified={iVerified}
            peerVerified={peerVerified}
            onConfirm={onConfirmCode}
            onReject={onRejectCode}
            onCompareByCall={!videoBusy ? onStartVideo : undefined}
          />
        </div>
      )}

      <ChatThread messages={messages} connected={connected} onSend={onSend} />
    </div>
  );
}
