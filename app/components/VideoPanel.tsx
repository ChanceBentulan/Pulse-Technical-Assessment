"use client";

import { useEffect, useRef } from "react";

export default function VideoPanel({
  localStream,
  remoteStream,
  remoteCamOff,
  remoteMicOff,
  peerName,
  camOn,
  micOn,
  onToggleCam,
  onToggleMic,
  onEnd,
}: {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  // Partner has no camera or turned it off; their audio (if any) still plays.
  remoteCamOff: boolean;
  remoteMicOff: boolean;
  peerName: string;
  camOn: boolean;
  micOn: boolean;
  onToggleCam: () => void;
  onToggleMic: () => void;
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
            {remoteStream && !remoteMicOff && (
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
        {remoteMicOff && (
          <div className="absolute left-4 top-4 flex items-center gap-1.5 rounded-full bg-zinc-900/80 px-3 py-1.5 text-xs text-zinc-300 backdrop-blur">
            <MicIcon off className="h-3.5 w-3.5 text-red-400" />
            {peerName} is muted
          </div>
        )}

        {/* Local (picture-in-picture) */}
        <video
          ref={localRef}
          autoPlay
          playsInline
          muted
          className="absolute bottom-4 right-4 h-40 w-28 rounded-lg border border-zinc-700 bg-zinc-800 object-cover"
        />
        {localStream && (!localHasVideo || !camOn) && (
          <div className="absolute bottom-4 right-4 flex h-40 w-28 flex-col items-center justify-center gap-1 rounded-lg border border-zinc-700 bg-zinc-800 px-2 text-center text-[11px] text-zinc-400">
            <span>{localHasVideo ? "Camera off" : "No camera"}</span>
            <span className="text-zinc-500">
              {!localHasAudio ? "Watching only" : micOn ? "Mic on" : "Muted"}
            </span>
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-center gap-3 bg-zinc-950 p-4">
        <ToggleButton
          on={micOn}
          available={localHasAudio}
          onClick={onToggleMic}
          label={micOn ? "Mute microphone" : "Unmute microphone"}
          unavailableLabel="No microphone available"
        >
          <MicIcon off={!micOn} className="h-5 w-5" />
        </ToggleButton>
        <ToggleButton
          on={camOn}
          available={localHasVideo}
          onClick={onToggleCam}
          label={camOn ? "Turn camera off" : "Turn camera on"}
          unavailableLabel="No camera available"
        >
          <CamIcon off={!camOn} className="h-5 w-5" />
        </ToggleButton>
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

function ToggleButton({
  on,
  available,
  onClick,
  label,
  unavailableLabel,
  children,
}: {
  on: boolean;
  available: boolean;
  onClick: () => void;
  label: string;
  unavailableLabel: string;
  children: React.ReactNode;
}) {
  const title = available ? label : unavailableLabel;
  return (
    <button
      onClick={onClick}
      disabled={!available}
      aria-pressed={available ? !on : undefined}
      aria-label={title}
      title={title}
      className={`flex h-12 w-12 items-center justify-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-40 ${
        on && available
          ? "bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
          : "bg-zinc-100 text-zinc-900 hover:bg-white"
      }`}
    >
      {children}
    </button>
  );
}

function MicIcon({ off, className }: { off?: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
      {off && <path d="M4 4l16 16" />}
    </svg>
  );
}

function CamIcon({ off, className }: { off?: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <rect x="3" y="7" width="12" height="10" rx="2" />
      <path d="M15 10.5l6-3.5v10l-6-3.5" />
      {off && <path d="M3 4l17 17" />}
    </svg>
  );
}
