import crypto from 'crypto';

import Config from '../server/config.mjs';
import Voice, { createLiveKitToken } from '../server/voice.mjs';

function roomWithVoice(gameVoice = {}) {
  return {
    id: 'voice-room',
    state: {
      _meta: { gameSettings: { voice: { enabled: true, ...gameVoice } } },
      'seat-1': { player: 'Host' }
    },
    players: []
  };
}

function player(room, sessionID, name) {
  const messages = [];
  const value = {
    room,
    sessionID,
    name,
    messages,
    send(func, args) {
      messages.push({ func, args });
    }
  };
  room.players.push(value);
  return value;
}

function lastMessage(player, func) {
  return [ ...player.messages ].reverse().find(message=>message.func == func)?.args;
}

const originalVoiceConfig = Config.config.voice;
const originalEnv = Object.fromEntries([
  'VOICE_ENABLED',
  'VOICE_P2P_MAX_PARTICIPANTS',
  'VOICE_STUN_URLS',
  'LIVEKIT_URL',
  'LIVEKIT_API_KEY',
  'LIVEKIT_API_SECRET'
].map(key=>[ key, process.env[key] ]));

afterEach(() => {
  Config.config.voice = originalVoiceConfig;
  for(const [ key, value ] of Object.entries(originalEnv)) {
    if(value === undefined)
      delete process.env[key];
    else
      process.env[key] = value;
  }
});

function enableVoiceServer({ p2pMaxParticipants = 2 } = {}) {
  Config.config.voice = {
    enabled: true,
    defaultEnabledForGames: false,
    defaultMode: 'auto',
    p2pMaxParticipants,
    stunUrls: [ 'stun:example.test:3478' ],
    livekitURL: ''
  };
  process.env.VOICE_ENABLED = 'true';
  process.env.LIVEKIT_URL = 'wss://voice.example.test';
  process.env.LIVEKIT_API_KEY = 'test-key';
  process.env.LIVEKIT_API_SECRET = 'test-secret';
}

test('auto mode uses P2P for a small room and SFU after the configured threshold', async () => {
  enableVoiceServer({ p2pMaxParticipants: 2 });
  const room = roomWithVoice({ defaultMode: 'auto', p2pMaxParticipants: 2 });
  const host = player(room, 1, 'Host');
  const second = player(room, 2, 'Second');
  const third = player(room, 3, 'Third');

  await Voice.handleMessage(host, 'voiceJoin');
  expect(lastMessage(host, 'voiceState').activeTransport).toBe('p2p');

  await Voice.handleMessage(second, 'voiceJoin');
  expect(lastMessage(host, 'voiceState').activeTransport).toBe('p2p');

  await Voice.handleMessage(third, 'voiceJoin');
  expect(lastMessage(host, 'voiceState').activeTransport).toBe('sfu');
  expect(lastMessage(second, 'voiceState').activeTransport).toBe('sfu');
  expect(lastMessage(third, 'voiceState').activeTransport).toBe('sfu');
});

test('configured host seat controls manual transport mode', async () => {
  enableVoiceServer({ p2pMaxParticipants: 4 });
  const room = roomWithVoice({ hostSeat: 'seat-1' });
  const guest = player(room, 1, 'Guest');
  const host = player(room, 2, 'Host');

  await Voice.handleMessage(guest, 'voiceJoin');
  await Voice.handleMessage(host, 'voiceJoin');
  expect(lastMessage(host, 'voiceState').isHost).toBe(true);
  expect(lastMessage(guest, 'voiceState').isHost).toBe(false);

  await Voice.handleMessage(guest, 'voiceSetMode', { mode: 'sfu' });
  expect(lastMessage(host, 'voiceState').requestedMode).toBe('auto');

  await Voice.handleMessage(host, 'voiceSetMode', { mode: 'sfu' });
  expect(lastMessage(host, 'voiceState').requestedMode).toBe('sfu');
  expect(lastMessage(host, 'voiceState').activeTransport).toBe('sfu');
});

test('P2P signaling is forwarded only between joined sessions in the same room', async () => {
  enableVoiceServer();
  const room = roomWithVoice();
  const first = player(room, 1, 'Host');
  const second = player(room, 2, 'Second');
  const observer = player(room, 3, 'Observer');

  await Voice.handleMessage(first, 'voiceJoin');
  await Voice.handleMessage(second, 'voiceJoin');
  first.messages.length = 0;
  second.messages.length = 0;
  observer.messages.length = 0;

  await Voice.handleMessage(first, 'voiceSignal', {
    targetSessionID: 2,
    signal: { type: 'offer', sdp: 'test-sdp' }
  });

  expect(lastMessage(second, 'voiceSignal')).toEqual({
    fromSessionID: 1,
    fromPlayer: 'Host',
    signal: { type: 'offer', sdp: 'test-sdp' }
  });
  expect(lastMessage(observer, 'voiceSignal')).toBeUndefined();
});

test('LiveKit tokens are signed and restricted to microphone room participation', () => {
  const token = createLiveKitToken({
    apiKey: 'key',
    apiSecret: 'secret',
    roomName: 'vtt-room',
    identity: 'vtt-7',
    name: 'Player',
    sessionID: 7,
    ttlSeconds: 60
  });
  const [ header, payload, signature ] = token.split('.');
  const expectedSignature = crypto.createHmac('sha256', 'secret').update(`${header}.${payload}`).digest('base64url');
  const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));

  expect(signature).toBe(expectedSignature);
  expect(decoded.iss).toBe('key');
  expect(decoded.sub).toBe('vtt-7');
  expect(decoded.video).toEqual({
    roomJoin: true,
    room: 'vtt-room',
    canPublish: true,
    canSubscribe: true,
    canPublishData: false,
    canPublishSources: [ 'microphone' ]
  });
});
