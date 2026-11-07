// Shared types across client + API.

// Signal mailbox message types.
export type SignalType =
  | "request" // connection request (tap a dot)
  | "accept" // recipient accepted
  | "decline" // recipient declined (or auto-declined while busy)
  | "offer" // WebRTC SDP offer
  | "answer" // WebRTC SDP answer
  | "ice" // WebRTC ICE candidate
  | "end"; // hang up / leave the connection

export interface PeerDot {
  id: string;
  lat: number;
  lng: number;
  busy: boolean;
  name: string | null;
  tags: string[];
}

export interface SignalMsg {
  id: string;
  fromId: string;
  toId: string;
  type: SignalType;
  payload: string | null;
  createdAt: string;
}

// A live connection between two dots, drawn as an arc on the map. Carries
// only the two (already privacy-offset) positions, not who they are.
export interface LiveLink {
  from: { lat: number; lng: number };
  to: { lat: number; lng: number };
}

export interface PollResponse {
  peers: PeerDot[];
  links: LiveLink[];
  signals: SignalMsg[];
}
