// Safety code: a short emoji sequence both partners can compare to prove
// that nobody — including the Pulse server — is sitting in the middle of
// their connection.
//
// Why it works: WebRTC encrypts everything with DTLS, and each browser's
// DTLS certificate fingerprint travels in its SDP (a=fingerprint:...). That
// SDP is relayed by OUR server (/api/signal), so a compromised server could
// swap in its own fingerprint and transparently decrypt/re-encrypt the call.
// The browser will only complete the DTLS handshake with a certificate that
// matches the fingerprint it was given, so if both sides derive the same
// code from (their own fingerprint, the fingerprint they received), the keys
// are end-to-end. A man-in-the-middle would leave each side holding a
// different pair, and the codes would differ.
//
// Same idea as Signal's safety numbers / WhatsApp's security codes, but
// derived from WebRTC's built-in keys — no extra crypto, nothing stored.

export const CODE_LENGTH = 6;

// 64 widely-supported emoji with a spoken name each, so the code can be read
// aloud on a video call. 64 divides 256, so `byte % 64` has no bias.
// 6 symbols × 6 bits = 36 bits — the same order as Bluetooth/ZRTP SAS codes,
// plenty for a live, interactive comparison an attacker gets one shot at.
export const SAFETY_SYMBOLS: ReadonlyArray<readonly [string, string]> = [
  ["🐶", "dog"], ["🐱", "cat"], ["🦊", "fox"], ["🐻", "bear"],
  ["🐼", "panda"], ["🐨", "koala"], ["🐯", "tiger"], ["🦁", "lion"],
  ["🐮", "cow"], ["🐷", "pig"], ["🐸", "frog"], ["🐵", "monkey"],
  ["🐔", "chicken"], ["🐧", "penguin"], ["🦉", "owl"], ["🐴", "horse"],
  ["🦄", "unicorn"], ["🐝", "bee"], ["🦋", "butterfly"], ["🐢", "turtle"],
  ["🐙", "octopus"], ["🐬", "dolphin"], ["🐳", "whale"], ["🦀", "crab"],
  ["🌵", "cactus"], ["🌲", "tree"], ["🍄", "mushroom"], ["🌻", "sunflower"],
  ["🌹", "rose"], ["🍁", "leaf"], ["🌙", "moon"], ["⭐", "star"],
  ["🔥", "fire"], ["🌈", "rainbow"], ["⚡", "lightning"], ["❄️", "snowflake"],
  ["🍎", "apple"], ["🍌", "banana"], ["🍇", "grapes"], ["🍉", "watermelon"],
  ["🍋", "lemon"], ["🍒", "cherries"], ["🥕", "carrot"], ["🌽", "corn"],
  ["🍕", "pizza"], ["🍩", "donut"], ["🎂", "cake"], ["☕", "coffee"],
  ["⚽", "football"], ["🏀", "basketball"], ["🎸", "guitar"], ["🎺", "trumpet"],
  ["🎈", "balloon"], ["🎁", "gift"], ["🔑", "key"], ["🔔", "bell"],
  ["⚓", "anchor"], ["🚀", "rocket"], ["🚲", "bicycle"], ["⛵", "sailboat"],
  ["🏠", "house"], ["⏰", "clock"], ["💡", "lightbulb"], ["👑", "crown"],
];

export interface SafetySymbol {
  emoji: string;
  name: string;
}

// Pulls the DTLS certificate fingerprint out of an SDP blob, normalised so
// both browsers format it identically ("sha-256 AB:CD:...").
export function extractFingerprint(sdp: string | undefined | null): string | null {
  if (!sdp) return null;
  const m = sdp.match(/^a=fingerprint:(\S+)\s+([0-9A-Fa-f:]+)\s*$/m);
  return m ? `${m[1].toLowerCase()} ${m[2].toUpperCase()}` : null;
}

// Both sides must get the same code, so the two fingerprints are sorted
// (not "mine, theirs") before hashing.
export async function computeSafetyCode(
  localFingerprint: string,
  remoteFingerprint: string,
): Promise<SafetySymbol[]> {
  const input = ["pulse-safety-code-v1", ...[localFingerprint, remoteFingerprint].sort()].join(
    "\n",
  );
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input)),
  );
  return Array.from(digest.slice(0, CODE_LENGTH), (byte) => {
    const [emoji, name] = SAFETY_SYMBOLS[byte % SAFETY_SYMBOLS.length];
    return { emoji, name };
  });
}
