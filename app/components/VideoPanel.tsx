"use client";

import { useEffect, useRef } from "react";

export default function VideoPanel({
  localStream,
  remoteStream,
  remoteCamOff,
  peerName,
  onEnd,
}: {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  // Partner joined without a camera; their audio (if any) still plays.
  remoteCamOff: boolean;
  peerName: string;
  onEnd: () => void;
}) {
  // We may have joined with mic only, or receive-only (no camera / blocked).
  const localHasVideo = (localStream?.getVideoTracks().length ?? 0) > 0;
  const localHasAudio = (localStream?.getAudioTracks().length ?? 0) > 0;

  const localRef = useRef<HTMLVideoElement>(null);
  const remoteRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (localRef.current && localRef.current.srcObject !== localStream) {
      localRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteRef.current && remoteRef.current.srcObject !== remoteStream) {
      remoteRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-black">
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {/* Remote (full screen) */}
        <video
          ref={remoteRef}
          autoPlay
          playsInline
          className="absolute inset-0 h-full w-full bg-zinc-900 object-cover"
        />
        {remoteCamOff ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-zinc-900 text-center text-zinc-400">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-zinc-800 text-2xl font-bold text-zinc-300">
              {peerName.charAt(0).toUpperCase()}
            </div>
            <p className="text-sm">{peerName}&rsquo;s camera is off</p>
            {remoteStream && (
              <p className="text-xs text-zinc-500">You can still hear them.</p>
            )}
          </div>
        ) : (
          !remoteStream && (
            <div className="absolute inset-0 flex items-center justify-center text-zinc-500">
              Waiting for {peerName}&rsquo;s video…
            </div>
          )
        )}
        {/* Local (picture-in-picture) */}
        <video
          ref={localRef}
          autoPlay
          playsInline
          muted
          className="absolute bottom-4 right-4 h-40 w-28 rounded-lg border border-zinc-700 bg-zinc-800 object-cover"
        />
        {localStream && !localHasVideo && (
          <div className="absolute bottom-4 right-4 flex h-40 w-28 flex-col items-center justify-center gap-1 rounded-lg border border-zinc-700 bg-zinc-800 px-2 text-center text-[11px] text-zinc-400">
            <span>No camera</span>
            <span className="text-zinc-500">
              {localHasAudio ? "Mic on" : "Watching only"}
            </span>
          </div>
        )}
      </div>
      <div className="flex shrink-0 justify-center bg-zinc-950 p-4">
        <button
          onClick={onEnd}
          className="rounded-full bg-red-500 px-8 py-3 font-semibold text-white hover:bg-red-400"
        >
          End video
        </button>
      </div>
    </div>
  );
}
