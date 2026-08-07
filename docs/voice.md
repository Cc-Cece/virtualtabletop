# Realtime voice

VirtualTabletop can expose an embedded audio-only voice panel for games that opt in through `gameSettings.voice`.

## Transport model

The default `auto` mode prioritizes service quality while avoiding unnecessary server bandwidth:

1. Small rooms use browser-to-browser WebRTC P2P with STUN.
2. When the voice participant count exceeds `p2pMaxParticipants`, or repeated P2P quality samples show high RTT / packet loss, the whole voice room switches to LiveKit SFU when configured.
3. Once connected to LiveKit, LiveKit's normal ICE/TURN/TLS fallback handles restrictive client networks.

LiveKit's embedded TURN server is deliberately **not** offered to the raw P2P path. Its TURN authentication is integrated with a LiveKit signaling session, so failed P2P moves to LiveKit rather than attempting to reuse the embedded TURN server as a generic TURN relay.

Voice media never travels through the VTT WebSocket. The existing WebSocket carries only small P2P signaling/control messages and short-lived LiveKit access tokens.

## Server configuration

Voice is off at the VTT server level by default. Enable it in `config.json` or with environment variables. LiveKit API credentials must only be supplied as environment variables; they are never included in the client configuration.

Example `config.json`:

```json
{
  "voice": {
    "enabled": true,
    "defaultEnabledForGames": false,
    "defaultMode": "auto",
    "p2pMaxParticipants": 4,
    "stunUrls": ["stun:stun.cloudflare.com:3478"],
    "livekitURL": "wss://voice.example.com",
    "livekitClientURL": "https://cdn.jsdelivr.net/npm/livekit-client@2.21.0/dist/livekit-client.umd.min.js"
  }
}
```

Required environment variables for SFU mode:

```bash
VOICE_ENABLED=true
LIVEKIT_URL=wss://voice.example.com
LIVEKIT_API_KEY=your-api-key
LIVEKIT_API_SECRET=your-api-secret
```

Optional overrides:

```bash
VOICE_P2P_MAX_PARTICIPANTS=4
VOICE_STUN_URLS=stun:stun.cloudflare.com:3478
LIVEKIT_CLIENT_URL=https://cdn.jsdelivr.net/npm/livekit-client@2.21.0/dist/livekit-client.umd.min.js
```

`LIVEKIT_API_SECRET` must never be put in `config.json`: normal VTT config values are embedded in the generated client HTML.

## Game opt-in

A game enables voice declaratively:

```json
{
  "gameSettings": {
    "voice": {
      "enabled": true,
      "defaultMode": "auto",
      "p2pMaxParticipants": 4,
      "hostSeat": "seat-1"
    }
  }
}
```

When `hostSeat` names an occupied seat, the voice participant using that seat controls the room mode selector. If that seat is not represented in voice yet, the earliest joined voice participant is the temporary voice host.

## HTTPS

Production VTT must be served over HTTPS because browsers require a secure context for microphone access. LiveKit should likewise be exposed through its production TLS endpoint (`wss://`). `localhost` remains usable for browser development.

## LiveKit deployment

LiveKit is a separate process/service, but it can run on the same VM as VTT for an initial deployment. Configure its normal UDP ports and embedded TURN/TLS according to the LiveKit self-hosting documentation. No separate coturn process is required for this MVP.

VTT does not fork or modify LiveKit. It only issues short-lived, microphone-only room tokens with these permissions:

- join one room derived from the VTT room ID;
- publish microphone audio;
- subscribe to other participants;
- no data publishing.

## Client behavior

The embedded panel provides:

- join / leave voice;
- mute / unmute;
- microphone selection;
- automatic P2P/SFU switching;
- host mode selection (`auto`, `p2p`, `sfu`);
- per-participant volume;
- speaking indicators;
- P2P connectivity/quality fallback.

SDP and ICE payloads are excluded from VTT trace logs.
