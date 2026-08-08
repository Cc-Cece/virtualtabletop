# Realtime voice (MVP)

VirtualTabletop voice is deliberately separate from game-state synchronization. Games opt in with `_meta.gameSettings.voice`; the browser then keeps audio in WebRTC while the existing VTT WebSocket carries only room-scoped signaling and control messages.

## Routing policy

The default route is automatic:

1. For small rooms, use direct browser-to-browser WebRTC P2P.
2. If a P2P connection fails, remains disconnected, or reports sustained poor loss/RTT/jitter, switch the whole voice room to LiveKit SFU when LiveKit is configured.
3. When the number of voice participants exceeds `p2pMaxParticipants`, use LiveKit SFU directly.
4. LiveKit's own ICE/TURN path provides firewall/NAT fallback for the SFU connection. The embedded LiveKit TURN server is not used as a generic relay for the separate P2P mesh.

A game can identify a host seat with `voice.hostSeat`. That seated player can select Auto, P2P preferred, or Stable (SFU). P2P preferred still falls back to SFU after measured degradation; voice quality takes priority over server-bandwidth savings.

## Game opt-in

Example game settings:

```json
{
  "voice": {
    "enabled": true,
    "hostSeat": "seat-1",
    "p2pMaxParticipants": 4
  }
}
```

Games that do not set `voice.enabled` to `true` do not show the voice UI.

## HTTPS requirement

Production VTT must be served through HTTPS. Browser microphone capture (`getUserMedia`) is only available in secure contexts, apart from local development on localhost.

The VTT Node process can continue to listen on plain HTTP behind a reverse proxy such as Caddy or nginx; terminate TLS at the proxy and proxy WebSocket upgrades normally.

## VTT configuration

The following non-secret settings are available in `config.json` (defaults are shown in `config.template.json`):

- `voiceLiveKitURL`: public LiveKit WebSocket URL, for example `wss://livekit.example.com`. The standard `LIVEKIT_URL` environment variable overrides it.
- `voiceLiveKitClientURL`: browser UMD build of `livekit-client`. The default is pinned to 2.21.0 on jsDelivr. For a fully self-hosted deployment, mirror that exact file and point this setting at the local URL.
- `voiceP2PMaxParticipants`: server fallback default when the game does not set its own value.
- `voiceSTUNURLs`: STUN URLs used only by the direct P2P route. If LiveKit embedded TURN/UDP is exposed on a host that also provides STUN, an example is `["stun:turn.example.com:3478"]`.

Do **not** put LiveKit API credentials in `config.json`, because VTT's normal client configuration is browser-visible. Set these only in the VTT server process environment:

```bash
LIVEKIT_URL=wss://livekit.example.com
LIVEKIT_API_KEY=your_api_key
LIVEKIT_API_SECRET=your_api_secret
```

`LIVEKIT_API_SECRET` never leaves the VTT server. The server creates short-lived room-scoped JWTs that permit microphone publishing and subscribing but not data publishing.

## LiveKit deployment

Run an unmodified self-hosted LiveKit server as a separate service/process. It can live on the same VPS as VTT for the MVP. Enable its embedded TURN according to the LiveKit deployment documentation and expose the media/TURN ports required by your chosen LiveKit configuration.

No coturn process is required for this MVP. If a later deployment needs independent TURN scaling or policy, it can be introduced without changing the game package.

## Browser UI

The voice module is loaded separately from the main bundled client and adds a Voice tab directly to the existing toolbar. It provides:

- join/leave voice;
- microphone mute/unmute;
- microphone device selection;
- current route (P2P/SFU);
- host route selector;
- per-player local mute and volume;
- speaking indicator;
- automatic reconnection through the existing room session lifecycle.

Opening or failing voice does not affect cards, room state, or the main VTT WebSocket connection.

## Persistent voice membership and preferences

Joining voice creates a room-scoped local preference in the browser. That preference remains across page refreshes, browser crashes, browser restarts, computer shutdowns, and later visits to the same room. Returning to the room automatically reuses the normal Join Voice flow. Only an explicit **Leave voice** action clears the saved membership intent.

A failed automatic reconnect does not clear that intent. The browser keeps it and shows a lightweight reconnect action instead. A successful automatic reconnect shows a short non-blocking notification with a **Leave voice** action so the user is aware that voice was restored without adding another mode or confirmation step.

The same room-scoped browser preference also remembers:

- whether the user's own microphone was muted;
- the selected microphone device when that device is still available;
- which remote players the user muted locally.

Muting the microphone does not revoke browser microphone permission; it continues to use the normal voice track and can be unmuted immediately. Muting another player is local only and does not affect what anyone else hears. Remote mute preferences are stored by player name rather than connection/session ID so they survive reconnects and device changes.

These preferences live only in browser `localStorage`. They are not written into room state, save files, undo history, traces, or the server database. Preferences are keyed by the VTT room path so joining voice in one room does not opt the user into another room.

### Reconnect presence grace

A page refresh normally destroys the browser's WebRTC/LiveKit objects and creates a new VTT session. To prevent other room members from seeing a rapid leave/rejoin flicker, the server keeps a disconnected voice participant visible for an 8-second grace period without keeping that stale connection in the active P2P/SFU participant set.

If the same player rejoins voice during that grace period, the old visible session is replaced by the new one and no intermediate leave presence is broadcast. If the player does not return within 8 seconds, the temporary presence expires and the room receives the normal updated voice participant list. Explicit **Leave voice** bypasses the grace period and is broadcast immediately.

The grace period is only short-lived server memory. It does not attempt to keep a user visibly online overnight or across a long power outage; long-term return behavior comes from the browser's persistent voice membership preference.

## Voice invitations

Voice invitations are a VTT room capability, not a game-package feature. A user who has already joined voice can invite another currently connected room player from the existing Players overlay. Players already in voice are shown with a microphone status instead of an invite action.

Invitations are player-scoped rather than connection-scoped. If the target player has several browser/device sessions connected, the same invitation is delivered to all of them. The first accept or decline resolves the invitation everywhere. A target can have only one pending call-style invitation at a time, so several inviters cannot stack prompts on the same screen.

The invited player receives a prominent call-style prompt with **Decline** and **Join voice** actions. Accepting the invitation does not itself mark that player as a voice participant; the client reuses the ordinary Join Voice action, including the normal browser microphone permission flow. The server only considers the player joined after the existing `voiceJoin` message succeeds.

Invitations are transient server memory. They are not written into room state, save files, undo history, or game-package data. Pending invitations expire after 30 seconds. The server also enforces a short global invite interval and a 10-second inviter/target cooldown to reduce accidental repeat clicks and spam. Invitations cannot target the inviter, disconnected players, or players already in voice.

The invitation transport uses the existing VTT WebSocket. LiveKit is not involved until a player actually joins voice, so no LiveKit, TURN, Caddy, or game-package changes are required for invitation support.

## Game-facing speaking activity

Speaking is also exposed as a generic, client-only player activity so game packages can choose their own visual response without learning about WebRTC, LiveKit, or voice-panel DOM details.

A game can add a dedicated visual widget with a declaration such as:

```json
{
  "id": "example-speaking-indicator",
  "type": "basic",
  "display": false,
  "clientActivityIndicator": {
    "source": "voice.speaking",
    "playerWidget": "seat-1"
  }
}
```

`playerWidget` points to a normal VTT widget whose `player` property identifies the player represented by the indicator. The browser locally shows the dedicated indicator while that player is active for the declared source and hides it otherwise. Keeping the indicator's saved `display` value `false` makes the package safe on older VTT clients that do not understand `clientActivityIndicator`.

The platform event is `vtt-client-activity`. Voice publishes player-scoped activity equivalent to:

```js
{
  source: 'voice.speaking',
  subject: 'player',
  player: 'Alice',
  sessionID: 123,
  active: true
}
```

Multiple sessions for the same player are aggregated, so one session becoming quiet does not clear another active session. Speaking starts immediately and the game-facing activity uses a short 350 ms release delay to avoid flicker at syllable boundaries; muting the local microphone clears the activity immediately.

This activity is intentionally transient and local. It is not written into room state, save files, undo history, traces, or normal game synchronization. Games decide whether to draw a glow, animate an avatar, show an icon, or ignore it entirely. `clientActivityIndicator` is intended for dedicated visual widgets rather than for overriding the normal visibility lifecycle of gameplay widgets.

## Notes on privacy and bandwidth

P2P participants learn the network addresses WebRTC exposes to their peer connection, as is normal for direct WebRTC. Choose Stable (SFU) if hiding peer network topology is more important than minimizing server bandwidth.

In SFU mode, media is forwarded by LiveKit and therefore consumes server network bandwidth. In P2P mode, VTT only carries small signaling/control messages; audio is direct between browsers.