import crypto from 'crypto';

import Config from './config.mjs';

const roomVoiceStates = new WeakMap();
const VALID_MODES = new Set([ 'auto', 'p2p', 'sfu' ]);
const DEFAULT_LIVEKIT_CLIENT_URL = 'https://cdn.jsdelivr.net/npm/livekit-client@2.21.0/dist/livekit-client.umd.min.js';

function boolEnv(name, fallback) {
  if(process.env[name] === undefined)
    return fallback;
  return ![ 'false', '0', 'no', 'off', '' ].includes(String(process.env[name]).toLowerCase());
}

function numberInRange(value, fallback, min, max) {
  const parsed = Number(value);
  if(!Number.isFinite(parsed))
    return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function stringList(value, fallback = []) {
  if(Array.isArray(value))
    return value.filter(v=>typeof v == 'string' && v.trim()).map(v=>v.trim());
  if(typeof value == 'string')
    return value.split(',').map(v=>v.trim()).filter(Boolean);
  return fallback;
}

function serverVoiceConfig() {
  const raw = Config.get('voice');
  const config = raw && typeof raw == 'object' && !Array.isArray(raw) ? raw : {};
  return {
    enabled: boolEnv('VOICE_ENABLED', config.enabled === true),
    defaultEnabledForGames: config.defaultEnabledForGames === true,
    defaultMode: VALID_MODES.has(config.defaultMode) ? config.defaultMode : 'auto',
    p2pMaxParticipants: numberInRange(process.env.VOICE_P2P_MAX_PARTICIPANTS ?? config.p2pMaxParticipants, 4, 2, 8),
    stunUrls: stringList(process.env.VOICE_STUN_URLS, stringList(config.stunUrls, [ 'stun:stun.cloudflare.com:3478' ])),
    livekitURL: String(process.env.LIVEKIT_URL || config.livekitURL || ''),
    livekitClientURL: String(process.env.LIVEKIT_CLIENT_URL || config.livekitClientURL || DEFAULT_LIVEKIT_CLIENT_URL),
    livekitAPIKey: String(process.env.LIVEKIT_API_KEY || ''),
    livekitAPISecret: String(process.env.LIVEKIT_API_SECRET || '')
  };
}

function gameVoiceConfig(room) {
  const config = room?.state?._meta?.gameSettings?.voice;
  return config && typeof config == 'object' && !Array.isArray(config) ? config : {};
}

function settingsFor(room) {
  const server = serverVoiceConfig();
  const game = gameVoiceConfig(room);
  const gameEnabled = game.enabled === undefined ? server.defaultEnabledForGames : game.enabled === true;
  const requestedDefaultMode = VALID_MODES.has(game.defaultMode) ? game.defaultMode : server.defaultMode;
  return {
    enabled: server.enabled && gameEnabled,
    defaultMode: requestedDefaultMode,
    p2pMaxParticipants: numberInRange(game.p2pMaxParticipants, server.p2pMaxParticipants, 2, 8),
    stunUrls: server.stunUrls,
    livekitURL: server.livekitURL,
    livekitClientURL: server.livekitClientURL,
    livekitAPIKey: server.livekitAPIKey,
    livekitAPISecret: server.livekitAPISecret,
    sfuAvailable: !!(server.livekitURL && server.livekitAPIKey && server.livekitAPISecret)
  };
}

function stateFor(room) {
  let state = roomVoiceStates.get(room);
  if(!state) {
    state = {
      participants: new Map(),
      requestedMode: null,
      forcedSfu: false,
      joinCounter: 0
    };
    roomVoiceStates.set(room, state);
  }
  return state;
}

function participants(state) {
  return [ ...state.participants.values() ].sort((a, b)=>a.joinOrder - b.joinOrder);
}

function hostSessionID(state) {
  return participants(state)[0]?.player.sessionID ?? null;
}

function selectedMode(room, state, settings = settingsFor(room)) {
  const desired = state.requestedMode || settings.defaultMode;
  if(desired == 'p2p')
    return 'p2p';
  if(desired == 'sfu')
    return settings.sfuAvailable ? 'sfu' : 'p2p';
  if(state.forcedSfu && settings.sfuAvailable)
    return 'sfu';
  if(state.participants.size > settings.p2pMaxParticipants && settings.sfuAvailable)
    return 'sfu';
  return 'p2p';
}

function publicStateFor(player) {
  const room = player.room;
  const state = stateFor(room);
  const settings = settingsFor(room);
  const host = hostSessionID(state);
  return {
    enabled: settings.enabled,
    joined: state.participants.has(player.sessionID),
    selfSessionID: player.sessionID,
    hostSessionID: host,
    isHost: host === player.sessionID,
    requestedMode: state.requestedMode || settings.defaultMode,
    activeTransport: selectedMode(room, state, settings),
    participants: participants(state).map(entry=>({
      sessionID: entry.player.sessionID,
      player: entry.player.name
    })),
    p2pMaxParticipants: settings.p2pMaxParticipants,
    stunUrls: settings.stunUrls,
    sfuAvailable: settings.sfuAvailable,
    livekitClientURL: settings.livekitClientURL
  };
}

function sendState(player) {
  player.send('voiceState', publicStateFor(player));
}

function broadcastState(room) {
  for(const player of room.players)
    sendState(player);
}

function clearRoomIfDisabled(room) {
  const settings = settingsFor(room);
  if(settings.enabled)
    return false;
  const state = stateFor(room);
  if(state.participants.size || state.requestedMode || state.forcedSfu) {
    state.participants.clear();
    state.requestedMode = null;
    state.forcedSfu = false;
  }
  return true;
}

function join(player) {
  const room = player.room;
  if(clearRoomIfDisabled(room)) {
    sendState(player);
    return;
  }
  const state = stateFor(room);
  if(!state.participants.has(player.sessionID))
    state.participants.set(player.sessionID, { player, joinOrder: ++state.joinCounter });
  broadcastState(room);
}

function leave(player) {
  const room = player.room;
  const state = stateFor(room);
  if(!state.participants.delete(player.sessionID))
    return;
  if(!state.participants.size) {
    state.requestedMode = null;
    state.forcedSfu = false;
  }
  broadcastState(room);
}

function forwardSignal(player, args) {
  const state = stateFor(player.room);
  if(!state.participants.has(player.sessionID))
    return;
  const targetSessionID = Number(args?.targetSessionID);
  if(!Number.isInteger(targetSessionID))
    return;
  const target = state.participants.get(targetSessionID)?.player;
  if(!target || target.room !== player.room)
    return;
  let size = 0;
  try {
    size = JSON.stringify(args.signal).length;
  } catch {
    return;
  }
  if(size > 64 * 1024)
    return;
  target.send('voiceSignal', {
    fromSessionID: player.sessionID,
    fromPlayer: player.name,
    signal: args.signal
  });
}

function setMode(player, args) {
  const room = player.room;
  const state = stateFor(room);
  const settings = settingsFor(room);
  if(!state.participants.has(player.sessionID) || hostSessionID(state) !== player.sessionID)
    return;
  const mode = args?.mode;
  if(!VALID_MODES.has(mode))
    return;
  if(mode == 'sfu' && !settings.sfuAvailable) {
    player.send('voiceError', 'SFU mode is not configured on this server.');
    return;
  }
  state.requestedMode = mode;
  state.forcedSfu = false;
  broadcastState(room);
}

function reportQuality(player, args) {
  const room = player.room;
  const state = stateFor(room);
  const settings = settingsFor(room);
  if(!state.participants.has(player.sessionID) || !settings.sfuAvailable)
    return;
  const desired = state.requestedMode || settings.defaultMode;
  if(desired != 'auto' || selectedMode(room, state, settings) != 'p2p')
    return;
  if(args?.action != 'fallback')
    return;
  state.forcedSfu = true;
  broadcastState(room);
}

function base64urlJSON(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

export function createLiveKitToken({ apiKey, apiSecret, roomName, identity, name, sessionID, ttlSeconds = 300 }) {
  if(!apiKey || !apiSecret || !roomName || !identity)
    throw new Error('LiveKit token parameters are incomplete.');
  const now = Math.floor(Date.now() / 1000);
  const header = base64urlJSON({ alg: 'HS256', typ: 'JWT' });
  const payload = base64urlJSON({
    exp: now + ttlSeconds,
    iss: apiKey,
    nbf: now - 5,
    sub: identity,
    name,
    metadata: JSON.stringify({ sessionID, player: name }),
    video: {
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: false,
      canPublishSources: [ 'microphone' ]
    }
  });
  const unsigned = `${header}.${payload}`;
  const signature = crypto.createHmac('sha256', apiSecret).update(unsigned).digest('base64url');
  return `${unsigned}.${signature}`;
}

function requestSfuToken(player) {
  const room = player.room;
  const state = stateFor(room);
  const settings = settingsFor(room);
  if(!state.participants.has(player.sessionID) || selectedMode(room, state, settings) != 'sfu' || !settings.sfuAvailable)
    return;
  const identity = `vtt-${player.sessionID}`;
  player.send('voiceSfuToken', {
    url: settings.livekitURL,
    token: createLiveKitToken({
      apiKey: settings.livekitAPIKey,
      apiSecret: settings.livekitAPISecret,
      roomName: `vtt-${room.id}`,
      identity,
      name: player.name,
      sessionID: player.sessionID
    }),
    identity
  });
}

async function handleMessage(player, func, args) {
  if(func == 'voiceDiscover') {
    clearRoomIfDisabled(player.room);
    sendState(player);
  } else if(func == 'voiceJoin') {
    join(player);
  } else if(func == 'voiceLeave') {
    leave(player);
  } else if(func == 'voiceSignal') {
    forwardSignal(player, args);
  } else if(func == 'voiceSetMode') {
    setMode(player, args);
  } else if(func == 'voiceQuality') {
    reportQuality(player, args);
  } else if(func == 'voiceRequestSfuToken') {
    requestSfuToken(player);
  }
}

function playerDisconnected(player) {
  leave(player);
}

export default { handleMessage, playerDisconnected };
