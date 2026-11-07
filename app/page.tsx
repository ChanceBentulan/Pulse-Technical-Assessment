"use client";

import { useEffect, useRef, useState } from "react";
import EntryGate from "./components/EntryGate";
import WorldMap from "./components/WorldMap";
import ConnectionPrompt from "./components/ConnectionPrompt";
import TagList from "./components/TagList";
import ChatPanel, { type ChatMessage } from "./components/ChatPanel";
import SafetyCode from "./components/SafetyCode";
import VideoPanel from "./components/VideoPanel";
import { join, leave, poll, sendSignal, type LatLng } from "@/lib/api";
import { PeerSession, type DescType, type PeerControl } from "@/lib/webrtc";
import { POLL_INTERVAL_MS } from "@/lib/presence";
import { type PeerDot, type SignalMsg } from "@/lib/types";
import { displayName, type Profile } from "@/lib/profile";
import { type SafetySymbol } from "@/lib/safetyCode";

type Conn =
  | { kind: "idle" }
  | { kind: "requesting"; peerId: string }
  | { kind: "incoming"; peerId: string }
  | { kind: "connecting"; peerId: string }
  | { kind: "connected"; peerId: string };

type VideoState = "none" | "requesting" | "incoming" | "active";

const REQUEST_TIMEOUT_MS = 30_000;

export default function Home() {
  const [phase, setPhase] = useState<"gate" | "live">("gate");
  const [sessionId] = useState(() => crypto.randomUUID());
  const [peers, setPeers] = useState<PeerDot[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  // Partner joined the video call without a camera (told via "cam-off").
  const [remoteCamOff, setRemoteCamOff] = useState(false);
  const [remoteMicOff, setRemoteMicOff] = useState(false);
  // Partner has unblurred our video (consent-first video starts blurred).
  const [peerSeesMe, setPeerSeesMe] = useState(false);
  // Our own in-call camera / mic toggles.
  const [camOn, setCamOn] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [myLocation, setMyLocation] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  // Own profile (as sanitised by the server) and the current partner's.
  const [myProfile, setMyProfile] = useState<Profile>({ name: null, tags: [] });
  const [partner, setPartner] = useState<Profile | null>(null);
  // Safety code for the current connection, and who has confirmed it matches.
  const [safetyCode, setSafetyCode] = useState<SafetySymbol[] | null>(null);
  const [iVerified, setIVerified] = useState(false);
  const [peerVerified, setPeerVerified] = useState(false);

  const [conn, _setConn] = useState<Conn>({ kind: "idle" });
  const connRef = useRef<Conn>(conn);
  const setConn = (c: Conn) => {
    connRef.current = c;
    _setConn(c);
  };

  const [video, _setVideo] = useState<VideoState>("none");
  const videoRef = useRef<VideoState>(video);
  const setVideo = (v: VideoState) => {
    videoRef.current = v;
    _setVideo(v);
  };

  // Server-side privacy-offset position from /api/join; sent with each poll so
  // a reaped presence row is recreated at the same spot.
  const offsetLocRef = useRef<LatLng | null>(null);
  const profileRef = useRef<Profile | null>(null);
  const peerRef = useRef<PeerSession | null>(null);
  const msgId = useRef(0);
  const requestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function profileOf(peerId: string): Profile | null {
    const p = peers.find((d) => d.id === peerId);
    return p ? { name: p.name, tags: p.tags } : null;
  }

  function showNotice(text: string) {
    setNotice(text);
    window.setTimeout(() => setNotice(null), 3500);
  }

  function addMessage(mine: boolean, text: string) {
    setMessages((prev) => [...prev, { id: msgId.current++, mine, text }]);
  }

  // Used by both the chat sidebar and the in-call chat (same thread).
  function sendChat(text: string) {
    peerRef.current?.sendChat(text);
    addMessage(true, text);
  }

  function teardown(message?: string) {
    if (requestTimer.current) clearTimeout(requestTimer.current);
    peerRef.current?.close();
    peerRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setRemoteCamOff(false);
    setRemoteMicOff(false);
    setPeerSeesMe(false);
    setVideo("none");
    setMessages([]);
    setPartner(null);
    setSafetyCode(null);
    setIVerified(false);
    setPeerVerified(false);
    setConn({ kind: "idle" });
    if (message) showNotice(message);
  }

  function startPeer(peerId: string, initiator: boolean) {
    const ps = new PeerSession(initiator, {
      onSignal: (type: DescType, payload: string) => {
        void sendSignal(sessionId, peerId, type, payload);
      },
      onChat: (text) => addMessage(false, text),
      onControl: (ctrl) => handleControl(ctrl),
      onRemoteStream: (stream) => setRemoteStream(stream),
      onConnectionState: (state) => {
        if (state === "failed") {
          // Tell the server so both busy flags are cleared — otherwise the
          // survivor of a dropped call stays "busy" and unreachable forever.
          void sendSignal(sessionId, peerId, "end");
          teardown("Connection failed (network).");
        }
      },
      onChannelOpen: () => {
        setConn({ kind: "connected", peerId });
        void ps.getSafetyCode().then((code) => {
          // Ignore if this connection was torn down while hashing.
          if (peerRef.current === ps) setSafetyCode(code);
        });
      },
    });
    peerRef.current = ps;
  }

  // Called once our side of a video call is live. Tells the partner whether
  // our camera is on (every call, so their placeholder never goes stale),
  // explains to us why it isn't, and picks up the partner's stream — on
  // repeat calls no new "track" event fires, since senders are reused.
  function onVideoLive(ps: PeerSession, stream: MediaStream) {
    const hasCamera = stream.getVideoTracks().length > 0;
    const hasMic = stream.getAudioTracks().length > 0;
    setCamOn(hasCamera);
    setMicOn(hasMic);
    ps.sendControl(hasCamera ? "cam-on" : "cam-off");
    ps.sendControl(hasMic ? "mic-on" : "mic-off");
    const remote = ps.getRemoteStream();
    if (remote) setRemoteStream(remote);
    if (!hasCamera) {
      const how =
        stream.getAudioTracks().length > 0 ? "with audio only" : "without camera or mic";
      showNotice(
        ps.cameraIssue === "blocked"
          ? `Camera blocked — joined ${how}. Allow it in your browser's site settings.`
          : ps.cameraIssue === "busy"
            ? `Camera is in use by another app — joined ${how}.`
            : `No camera found — joined ${how}.`,
      );
    }
  }

  function handleControl(ctrl: PeerControl) {
    const ps = peerRef.current;
    switch (ctrl) {
      case "video-request":
        if (videoRef.current === "none") setVideo("incoming");
        break;
      case "video-accept":
        if (videoRef.current === "requesting" && ps) {
          ps.startVideo()
            .then((stream) => {
              setLocalStream(stream);
              setVideo("active");
              onVideoLive(ps, stream);
            })
            .catch(() => {
              setVideo("none");
              ps.sendControl("video-end");
              showNotice("Camera unavailable.");
            });
        }
        break;
      case "video-decline":
        if (videoRef.current === "requesting") {
          setVideo("none");
          showNotice("Video declined.");
        }
        break;
      case "video-end":
        ps?.stopVideo();
        setLocalStream(null);
        setRemoteStream(null);
        setRemoteCamOff(false);
        setRemoteMicOff(false);
        setPeerSeesMe(false);
        setVideo("none");
        break;
      case "cam-on":
        setRemoteCamOff(false);
        break;
      case "cam-off":
        setRemoteCamOff(true);
        break;
      case "mic-on":
        setRemoteMicOff(false);
        break;
      case "mic-off":
        setRemoteMicOff(true);
        break;
      case "code-verified":
        setPeerVerified(true);
        break;
      case "video-revealed":
        setPeerSeesMe(true);
        break;
      case "video-hidden":
        setPeerSeesMe(false);
        break;
      case "code-mismatch": {
        // The partner saw a different code: treat the link as compromised.
        const c = connRef.current;
        if (c.kind === "connecting" || c.kind === "connected") {
          void sendSignal(sessionId, c.peerId, "end");
        }
        teardown(
          `${displayName(partner?.name)} reported the safety codes didn't match — connection ended.`,
        );
        break;
      }
    }
  }

  function requestConnection(peerId: string) {
    if (connRef.current.kind !== "idle") return;
    setPartner(profileOf(peerId));
    setConn({ kind: "requesting", peerId });
    void sendSignal(sessionId, peerId, "request");
    requestTimer.current = setTimeout(() => {
      if (
        connRef.current.kind === "requesting" &&
        connRef.current.peerId === peerId
      ) {
        void sendSignal(sessionId, peerId, "end");
        teardown("No answer.");
      }
    }, REQUEST_TIMEOUT_MS);
  }

  function cancelRequest() {
    if (connRef.current.kind === "requesting") {
      void sendSignal(sessionId, connRef.current.peerId, "end");
    }
    teardown();
  }

  function acceptIncoming() {
    if (connRef.current.kind !== "incoming") return;
    const peerId = connRef.current.peerId;
    startPeer(peerId, false);
    void sendSignal(sessionId, peerId, "accept");
    setConn({ kind: "connecting", peerId });
  }

  function declineIncoming() {
    if (connRef.current.kind !== "incoming") return;
    void sendSignal(sessionId, connRef.current.peerId, "decline");
    setConn({ kind: "idle" });
  }

  function endConnection() {
    const c = connRef.current;
    if (c.kind === "connecting" || c.kind === "connected") {
      void sendSignal(sessionId, c.peerId, "end");
    }
    teardown();
  }

  function confirmSafetyCode() {
    if (!peerRef.current || iVerified) return;
    peerRef.current.sendControl("code-verified");
    setIVerified(true);
  }

  // Codes differ → someone may be relaying the connection. Warn the partner
  // over the data channel, then hang up.
  function rejectSafetyCode() {
    peerRef.current?.sendControl("code-mismatch");
    const c = connRef.current;
    if (c.kind === "connecting" || c.kind === "connected") {
      void sendSignal(sessionId, c.peerId, "end");
    }
    teardown("Safety codes didn't match — connection ended to keep you safe.");
  }

  function startVideoRequest() {
    if (videoRef.current !== "none" || !peerRef.current) return;
    setVideo("requesting");
    peerRef.current.sendControl("video-request");
  }

  function acceptVideo() {
    const ps = peerRef.current;
    if (!ps) return;
    ps.startVideo()
      .then((stream) => {
        setLocalStream(stream);
        ps.sendControl("video-accept");
        setVideo("active");
        onVideoLive(ps, stream);
      })
      .catch(() => {
        ps.sendControl("video-decline");
        setVideo("none");
        showNotice("Camera unavailable.");
      });
  }

  function declineVideo() {
    peerRef.current?.sendControl("video-decline");
    setVideo("none");
  }

  function toggleCam() {
    const ps = peerRef.current;
    if (!ps || !localStream?.getVideoTracks().length) return;
    const next = !camOn;
    ps.setTrackEnabled("video", next);
    ps.sendControl(next ? "cam-on" : "cam-off");
    setCamOn(next);
  }

  function toggleMic() {
    const ps = peerRef.current;
    if (!ps || !localStream?.getAudioTracks().length) return;
    const next = !micOn;
    ps.setTrackEnabled("audio", next);
    ps.sendControl(next ? "mic-on" : "mic-off");
    setMicOn(next);
  }

  function endVideo() {
    const ps = peerRef.current;
    ps?.stopVideo();
    ps?.sendControl("video-end");
    setLocalStream(null);
    setRemoteStream(null);
    setRemoteCamOff(false);
    setRemoteMicOff(false);
    setPeerSeesMe(false);
    setVideo("none");
  }

  function processSignal(sig: SignalMsg) {
    switch (sig.type) {
      case "request": {
        if (connRef.current.kind === "idle") {
          setPartner(profileOf(sig.fromId));
          setConn({ kind: "incoming", peerId: sig.fromId });
        } else {
          void sendSignal(sessionId, sig.fromId, "decline");
        }
        break;
      }
      case "accept": {
        const c = connRef.current;
        if (c.kind === "requesting" && c.peerId === sig.fromId) {
          if (requestTimer.current) clearTimeout(requestTimer.current);
          startPeer(sig.fromId, true);
          setConn({ kind: "connecting", peerId: sig.fromId });
        }
        break;
      }
      case "decline": {
        const c = connRef.current;
        if (c.kind === "requesting" && c.peerId === sig.fromId) {
          if (requestTimer.current) clearTimeout(requestTimer.current);
          teardown("Request declined.");
        }
        break;
      }
      case "offer":
      case "answer":
      case "ice": {
        const c = connRef.current;
        const peerId =
          c.kind === "connecting" || c.kind === "connected" ? c.peerId : null;
        if (peerRef.current && peerId === sig.fromId) {
          void peerRef.current.handleSignal(
            sig.type as DescType,
            sig.payload ?? "",
          );
        }
        break;
      }
      case "end": {
        const c = connRef.current;
        if (
          (c.kind === "incoming" ||
            c.kind === "connecting" ||
            c.kind === "connected") &&
          c.peerId === sig.fromId
        ) {
          if (c.kind === "incoming") setConn({ kind: "idle" });
          else teardown(`${displayName(partner?.name)} disconnected.`);
        }
        break;
      }
    }
  }

  const processSignalRef = useRef(processSignal);
  useEffect(() => {
    processSignalRef.current = processSignal;
  });

  useEffect(() => {
    if (phase !== "live" || !sessionId) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      try {
        const data = await poll(sessionId, offsetLocRef.current, profileRef.current);
        if (!active) return;
        setPeers(data.peers);
        for (const s of data.signals) processSignalRef.current(s);
        // Keep the partner's name/tags fresh; keep the last known copy if
        // their row is briefly missing so the header doesn't flicker.
        const c = connRef.current;
        if (c.kind !== "idle") {
          const p = data.peers.find((d) => d.id === c.peerId);
          if (p) setPartner({ name: p.name, tags: p.tags });
        }
      } catch {}
      if (active) timer = setTimeout(tick, POLL_INTERVAL_MS);
    };
    tick();

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [phase, sessionId]);

  useEffect(() => {
    if (!sessionId || phase !== "live") return;
    const onLeave = () => leave(sessionId);
    window.addEventListener("pagehide", onLeave);
    window.addEventListener("beforeunload", onLeave);
    return () => {
      window.removeEventListener("pagehide", onLeave);
      window.removeEventListener("beforeunload", onLeave);
    };
  }, [sessionId, phase]);

  async function handleReady(lat: number, lng: number, profile: Profile) {
    setMyLocation({ lat, lng });
    const joined = await join(sessionId, lat, lng, profile);
    offsetLocRef.current = joined?.loc ?? null;
    const mine = joined?.profile ?? profile;
    profileRef.current = mine;
    setMyProfile(mine);
    setPhase("live");
  }

  if (phase === "gate") {
    return <EntryGate onReady={handleReady} />;
  }

  const inChat = conn.kind === "connecting" || conn.kind === "connected";

  return (
    <main className="fixed inset-0 overflow-hidden">
      <WorldMap
        peers={peers}
        me={myLocation}
        myTags={myProfile.tags}
        onPeerClick={requestConnection}
        canConnect={conn.kind === "idle"}
      />

      {notice && (
        <div className="absolute left-1/2 top-20 z-30 -translate-x-1/2 rounded-full bg-zinc-800/90 px-4 py-2 text-sm text-zinc-100 shadow-lg backdrop-blur">
          {notice}
        </div>
      )}

      {conn.kind === "requesting" && (
        <div className="absolute left-1/2 top-20 z-30 flex -translate-x-1/2 items-center gap-3 rounded-full bg-zinc-800/90 px-4 py-2 text-sm text-zinc-100 shadow-lg backdrop-blur">
          <span>Requesting connection…</span>
          <button
            onClick={cancelRequest}
            className="rounded-full bg-zinc-700 px-3 py-1 text-xs hover:bg-zinc-600"
          >
            Cancel
          </button>
        </div>
      )}

      {conn.kind === "incoming" && (
        <ConnectionPrompt
          title={`${displayName(partner?.name)} wants to connect`}
          subtitle={partner?.tags.length ? undefined : "No interests listed."}
          acceptLabel="Accept"
          declineLabel="Decline"
          onAccept={acceptIncoming}
          onDecline={declineIncoming}
        >
          <TagList
            tags={partner?.tags ?? []}
            myTags={myProfile.tags}
            className="mt-3 justify-center"
          />
        </ConnectionPrompt>
      )}

      {inChat && (
        <ChatPanel
          peerName={partner?.name ?? null}
          peerTags={partner?.tags ?? []}
          myTags={myProfile.tags}
          messages={messages}
          connected={conn.kind === "connected"}
          videoBusy={video !== "none"}
          safetyCode={safetyCode}
          iVerified={iVerified}
          peerVerified={peerVerified}
          onConfirmCode={confirmSafetyCode}
          onRejectCode={rejectSafetyCode}
          onSend={sendChat}
          onStartVideo={startVideoRequest}
          onEnd={endConnection}
        />
      )}

      {video === "requesting" && (
        <div className="absolute bottom-24 left-1/2 z-30 -translate-x-1/2 rounded-full bg-zinc-800/90 px-4 py-2 text-sm text-zinc-100 shadow-lg backdrop-blur">
          Waiting for {displayName(partner?.name)} to accept video…
        </div>
      )}

      {video === "incoming" && (
        <ConnectionPrompt
          title="Start video call?"
          subtitle={`${displayName(partner?.name)} wants to turn on video.`}
          acceptLabel="Accept"
          declineLabel="Decline"
          onAccept={acceptVideo}
          onDecline={declineVideo}
        />
      )}

      {video === "active" && (
        <VideoPanel
          localStream={localStream}
          remoteStream={remoteStream}
          remoteCamOff={remoteCamOff}
          remoteMicOff={remoteMicOff}
          peerSeesMe={peerSeesMe}
          onRevealChange={(revealed) =>
            peerRef.current?.sendControl(revealed ? "video-revealed" : "video-hidden")
          }
          camOn={camOn}
          micOn={micOn}
          onToggleCam={toggleCam}
          onToggleMic={toggleMic}
          messages={messages}
          chatConnected={conn.kind === "connected"}
          onSendChat={sendChat}
          safetyCode={
            conn.kind === "connected" && (
              <SafetyCode
                code={safetyCode}
                peerName={displayName(partner?.name)}
                iVerified={iVerified}
                peerVerified={peerVerified}
                onConfirm={confirmSafetyCode}
                onReject={rejectSafetyCode}
              />
            )
          }
          peerName={displayName(partner?.name)}
          onEnd={endVideo}
        />
      )}
    </main>
  );
}
