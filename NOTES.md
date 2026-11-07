# Pulse — Notes

- **Repo:** https://github.com/ChanceBentulan/Pulse-Technical-Assessment
- **Live:** https://pulse-technical-assessment-tan.vercel.app

> Assumptions / judgment calls are marked **Assumption:** inline.

---

## Phase 1 — Make it run

What was broken, how I found it, how I fixed it.

1. **Every user's dot stayed on the map forever** (`app/api/poll/route.ts`)
   - *Found:* closed both tabs, dots kept showing.
   - *Cause:* heartbeat ran `updateMany({ where: {} })`, refreshing `lastSeen` for
     **every** row on every poll, so nobody ever went stale.
   - *Fix:* heartbeat only the caller's row. Also: if the caller's row was reaped
     (throttled background tab, bfcache restore), re-create it with the *same*
     offset coords returned by `/api/join` — re-rolling the offset would let
     repeated samples be averaged back to the real location.
2. **Chat messages never arrived** (`lib/webrtc.ts`)
   - *Cause:* sender used `t: "msg"`, receiver checked `t: "chat"`.
   - *Fix:* aligned the message type.
3. **ICE candidates dropped / connection flaky** (`lib/webrtc.ts`)
   - *Cause:* queued ICE candidates were flushed **before**
     `setRemoteDescription`, so `addIceCandidate` had no remote description.
   - *Fix:* set the remote description first, then flush.
4. **Users stuck "busy" after a call ended** (`app/api/signal/route.ts`, `app/page.tsx`)
   - *Cause:* busy was cleared on `decline` instead of `end`; a failed network
     connection never told the server at all.
   - *Fix:* clear busy on `end`; send `end` when the peer connection fails.
     `decline` intentionally leaves busy alone (a user mid-chat auto-declines).
5. **End-video button pushed off-screen** (`app/components/VideoPanel.tsx`)
   - *Cause:* the remote `<video>` in a flex child grew past the viewport.
   - *Fix:* `min-h-0` + `overflow-hidden` on the video area, absolute-positioned
     video, `shrink-0` on the controls bar.

---

## Phase 2 — Make it good

What I changed and the thinking behind it.

- **Identity without accounts:** optional username + interest tags on entry.
- **People list:** browse online users with country and interests, not just dots.
- **Filters:** popular-interests filter and distance-radius filter.
- **Map legend** explaining dot states.
- **Call controls:** toggle mic/camera, chat inside the video call, join a call
  without a camera.

<!-- TODO: design direction / visual polish / motion, and the "why" behind each -->

Initially the application has a chat/video functionality, allowing users to connect within one another.

First improvement I did is to add a legend that helps user understand the application on how to use it.

I also made the application more friendly and made it feel more safe by adding an optional username. I added the interests so that they can easily connect to people who they feel like they have something in common. Same goes to adding filters it allows for them to narrow down to specific users.

I added additional call controls that allows user to have more control over the application to turn mic or camera off.

Generally it makes the application a social website that let's them connect to people who has common interest and talk about it.

---

## Phase 3 — Make it secure

Issues found, ranked, and what I fixed.

**Issue: no way to prove who is calling the API**

- *Found:* Pulse's API is public — anyone can call `/api/join`, `/api/poll`,
  `/api/signal` and `/api/leave` directly (DevTools / `curl`). The only thing
  identifying a user is their session `id`, and `/api/poll` sends every online
  user's `id` to everyone so their dots can be drawn. That `id` is acting as both
  a public name *and* a password.
- *Impact:* with someone else's `id`, an attacker can:
  - poll as them and steal their incoming requests and call-setup messages;
  - send signals as them (e.g. `end` to kill their call, `accept` to fake a connection);
  - call `/api/leave` to remove them from the map.
- *Fix:* `/api/join` now issues a random secret **token** that only the user's
  browser holds (the server stores only its hash). `poll`, `signal` and `leave`
  must include it and are rejected if it doesn't match the `id`. The `id` stays
  public for the map; the token proves it's really you.

---

## Phase 4 — Make it better

What I built, why, and what I'd do next.

### Safety code (safe)
- Six-emoji code both partners compare to prove no one — not even the Pulse
  server — is in the middle of the connection.
- *How:* derived from both DTLS certificate fingerprints in the SDP. The server
  relays SDP, so a compromised server could swap fingerprints and MITM the call;
  in that case each side would compute a different code. Same idea as Signal
  safety numbers, but using WebRTC's built-in keys — no extra crypto, nothing stored.
- Mismatch → partner is warned over the data channel and the call is ended.

### Camera blur (safe)
- Blur your own video so you can start a call with strangers without showing
  your face/surroundings right away.

### Live connection arcs + day/night shading (alive)
- Arcs on the globe showing who is talking to whom.
- Day/night terminator shading and a partner clock, so you can see what time it
  is where the other person is.

### Next with more time
- I would add an upload image/gif/video functionality
- Rehaul the project to save connections, so that we can reconnect to them if they are available.

I actually have a lot of idea about this applicaiton but it also comes with cons the reason why I did not go through with it.

I have a thought that this could be an app that allows workers like roof inspectors, plumbers, electrician, or any other fixers that they can use to scan for people in need of help, given the distance filter they can limit it to the area they can cater to and they can connect with that user ask about the issue and they can book for an appointment. 

Another idea is an application that shows people in need of help or an emergency could be fire emergency, flat tires, car not working, and they can pin for help. Helpers can look through the website and provide the help. It shows the actual distance of the helper, and the one in need of help as they try to rescue.

This are all valid applications but moving to this requires a lot of security. Making sure that the helpers are verified and not some random person. 
