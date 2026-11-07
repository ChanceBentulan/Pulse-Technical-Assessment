import { computeSafetyCode, extractFingerprint, type SafetySymbol } from "./safetyCode";

export type DescType = "offer" | "answer" | "ice";
export type PeerControl =
  | "video-request"
  | "video-accept"
  | "video-decline"
  | "video-end"
  // Sent at the start of every video call so the partner's "camera off"
  // placeholder always reflects the current call, never a previous one.
  | "cam-on"
  | "cam-off"
  | "mic-on"
  | "mic-off"
  // Safety code outcome, so the partner sees what we concluded.
  | "code-verified"
  | "code-mismatch"
  // Consent-first video: whether we've unblurred the partner's video, so they
  // know if we can actually see them.
  | "video-revealed"
  | "video-hidden";

// Why our camera isn't in the call, if it isn't.
export type CameraIssue = "not-found" | "blocked" | "busy" | null;

interface PeerCallbacks {
  onSignal: (type: DescType, payload: string) => void;
  onChat: (text: string) => void;
  onControl: (ctrl: PeerControl) => void;
  onRemoteStream: (stream: MediaStream | null) => void;
  onConnectionState: (state: RTCPeerConnectionState) => void;
  onChannelOpen: () => void;
}

const ICE_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

export class PeerSession {
  private pc: RTCPeerConnection;
  private dc: RTCDataChannel | null = null;
  private readonly polite: boolean;
  private makingOffer = false;
  private ignoreOffer = false;
  private localStream: MediaStream | null = null;
  // One long-lived stream holding the partner's incoming tracks. Senders are
  // reused across video calls (replaceTrack, no renegotiation), so later
  // calls fire no new "track" events — the page re-reads this instead.
  private readonly remoteStream = new MediaStream();
  cameraIssue: CameraIssue = null;
  private closed = false;
  private readonly cb: PeerCallbacks;
  private pendingCandidates: RTCIceCandidateInit[] = [];

  constructor(initiator: boolean, cb: PeerCallbacks) {
    this.cb = cb;
    this.polite = !initiator;
    this.pc = new RTCPeerConnection(ICE_CONFIG);

    this.pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        this.cb.onSignal("ice", JSON.stringify(candidate));
      }
    };

    this.pc.onnegotiationneeded = async () => {
      try {
        this.makingOffer = true;
        await this.pc.setLocalDescription();
        if (this.pc.localDescription) {
          this.cb.onSignal("offer", JSON.stringify(this.pc.localDescription));
        }
      } finally {
        this.makingOffer = false;
      }
    };

    this.pc.ontrack = ({ track }) => {
      if (!this.remoteStream.getTracks().includes(track)) {
        this.remoteStream.addTrack(track);
      }
      this.cb.onRemoteStream(this.remoteStream);
    };

    this.pc.onconnectionstatechange = () => {
      this.cb.onConnectionState(this.pc.connectionState);
    };

    if (initiator) {
      this.dc = this.pc.createDataChannel("chat");
      this.wireDataChannel(this.dc);
    } else {
      this.pc.ondatachannel = (e) => {
        this.dc = e.channel;
        this.wireDataChannel(this.dc);
      };
    }
  }

  private wireDataChannel(dc: RTCDataChannel) {
    dc.onopen = () => this.cb.onChannelOpen();
    dc.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data as string);
        if (msg.t === "msg" && typeof msg.text === "string") {
          this.cb.onChat(msg.text);
        } else if (msg.t === "ctrl" && typeof msg.ctrl === "string") {
          this.cb.onControl(msg.ctrl as PeerControl);
        }
      } catch {}
    };
  }

  async handleSignal(type: DescType, payload: string) {
    if (this.closed) return;
    const data = JSON.parse(payload);

    if (type === "ice") {
      if (!this.pc.remoteDescription) {
        this.pendingCandidates.push(data);
        return;
      }
      try {
        await this.pc.addIceCandidate(data);
      } catch {}
      return;
    }

    const desc = data as RTCSessionDescriptionInit;
    const offerCollision =
      desc.type === "offer" &&
      (this.makingOffer || this.pc.signalingState !== "stable");
    this.ignoreOffer = !this.polite && offerCollision;
    if (this.ignoreOffer) return;

    await this.pc.setRemoteDescription(desc);
    await this.flushPendingCandidates();
    if (desc.type === "offer") {
      await this.pc.setLocalDescription();
      if (this.pc.localDescription) {
        this.cb.onSignal("answer", JSON.stringify(this.pc.localDescription));
      }
    }
  }

  private async flushPendingCandidates() {
    if (this.pendingCandidates.length === 0) return;
    const queued = this.pendingCandidates;
    this.pendingCandidates = [];
    for (const candidate of queued) {
      try {
        await this.pc.addIceCandidate(candidate);
      } catch {}
    }
  }

  sendChat(text: string) {
    this.safeSend({ t: "msg", text });
  }

  sendControl(ctrl: PeerControl) {
    this.safeSend({ t: "ctrl", ctrl });
  }

  private safeSend(obj: unknown) {
    if (this.dc && this.dc.readyState === "open") {
      this.dc.send(JSON.stringify(obj));
    }
  }

  // Emoji safety code derived from both DTLS fingerprints (see
  // lib/safetyCode.ts). Ready once both descriptions are set — i.e. by the
  // time the data channel opens. The certificate is fixed for the life of
  // the RTCPeerConnection, so video renegotiation never changes the code.
  async getSafetyCode(): Promise<SafetySymbol[] | null> {
    const local = extractFingerprint(this.pc.localDescription?.sdp);
    const remote = extractFingerprint(this.pc.remoteDescription?.sdp);
    if (!local || !remote || !crypto?.subtle) return null;
    return computeSafetyCode(local, remote);
  }

  // The partner's incoming media, or null if nothing has arrived yet.
  getRemoteStream(): MediaStream | null {
    return this.remoteStream.getTracks().length > 0 ? this.remoteStream : null;
  }

  // Joins the video call with whatever media is available, best first:
  // camera + mic, camera only, mic only, then nothing (receive-only). A
  // missing or blocked camera therefore never declines the call — the other
  // side's tracks still arrive, since our answer simply becomes recvonly.
  //
  // The first call adds tracks (one negotiation). Later calls plug the new
  // tracks into the same senders with replaceTrack, so the connection is
  // never renegotiated just to toggle video — repeated renegotiation is what
  // left the second call's video black.
  async startVideo(): Promise<MediaStream> {
    if (!this.localStream) {
      const { stream, issue } = await getBestMedia();
      this.localStream = stream;
      this.cameraIssue = issue;
      for (const track of stream.getTracks()) {
        const reusable = this.pc
          .getTransceivers()
          .find(
            (t) =>
              t.currentDirection !== "stopped" &&
              t.sender.track === null &&
              t.receiver.track.kind === track.kind,
          );
        if (reusable) {
          await reusable.sender.replaceTrack(track);
          reusable.sender.setStreams?.(stream);
          // A transceiver created by the partner's offer is recvonly until
          // we start sending on it (this one change does renegotiate).
          if (reusable.direction === "recvonly") reusable.direction = "sendrecv";
          else if (reusable.direction === "inactive") reusable.direction = "sendonly";
        } else {
          this.pc.addTrack(track, stream);
        }
      }
    }
    return this.localStream;
  }

  // In-call camera / mic toggle. Disabling a track sends black frames /
  // silence on the same sender — no renegotiation, instant to switch back.
  setTrackEnabled(kind: "audio" | "video", enabled: boolean) {
    for (const track of this.localStream?.getTracks() ?? []) {
      if (track.kind === kind) track.enabled = enabled;
    }
  }

  // Stops our camera/mic but keeps the senders (track set to null) so the
  // next call can reuse them without renegotiating.
  stopVideo() {
    if (this.localStream) {
      for (const track of this.localStream.getTracks()) track.stop();
      for (const sender of this.pc.getSenders()) {
        if (sender.track) {
          void sender.replaceTrack(null).catch(() => {});
        }
      }
      this.localStream = null;
    }
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.stopVideo();
    if (this.dc) {
      try {
        this.dc.close();
      } catch {}
    }
    try {
      this.pc.close();
    } catch {}
  }
}

const MEDIA_FALLBACKS: MediaStreamConstraints[] = [
  { video: true, audio: true },
  { video: true },
  { audio: true },
];

async function getBestMedia(): Promise<{ stream: MediaStream; issue: CameraIssue }> {
  if (!navigator.mediaDevices?.getUserMedia) {
    return { stream: new MediaStream(), issue: "not-found" };
  }
  let issue: CameraIssue = null;
  for (const constraints of MEDIA_FALLBACKS) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      return {
        stream,
        issue: stream.getVideoTracks().length > 0 ? null : issue,
      };
    } catch (err) {
      // Remember why the camera attempts failed, to tell the user.
      if (constraints.video && issue === null) issue = classify(err);
    }
  }
  return { stream: new MediaStream(), issue: issue ?? "not-found" };
}

function classify(err: unknown): CameraIssue {
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "blocked";
  if (name === "NotReadableError" || name === "AbortError") return "busy";
  return "not-found";
}
