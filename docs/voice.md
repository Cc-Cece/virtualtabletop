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

## Notes on privacy and bandwidth

P2P participants learn the network addresses WebRTC exposes to their peer connection, as is normal for direct WebRTC. Choose Stable (SFU) if hiding peer network topology is more important than minimizing server bandwidth.

In SFU mode, media is forwarded by LiveKit and therefore consumes server network bandwidth. In P2P mode, VTT only carries small signaling/control messages; audio is direct between browsers.
