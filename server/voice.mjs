import crypto from 'crypto';

import Config from './config.mjs';

const managers = new WeakMap();
const VOICE_MODES = new Set([ 'auto', 'p2p', 'sfu' ]);
const VOICE_INVITE_TTL_MS = 30000;
const VOICE_INVITE_PAIR_COOLDOWN_MS = 10000;
const VOICE_INVITE_GLOBAL_COOLDOWN_MS = 1000;

function base64url(value) {
  return Buffer.from(value).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function parseStringList(value) {
  if(Array.isArray(value))
    return value.filter(v=>typeof v == 'string' && v.trim()).map(v=>v.trim());
  if(typeof value == 'string' && value.trim())
    return value.split(',').map(v=>v.trim()).filter(Boolean);
  return [];
}

export function createLiveKitJoinToken({ apiKey, apiSecret, identity, name, room, metadata = '', ttlSeconds = 600, now = Math.floor(Date.now()/1000) }) {
  if(!apiKey || !apiSecret)
    throw new Error('LiveKit API credentials are missing.');

  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    exp: now + ttlSeconds,
    iss: apiKey,
    sub: identity,
    name,
    nbf: now - 5,
    metadata,
    video: {
      room,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: false,
      canPublishSources: [ 'microphone' ]
    }
  };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = crypto.createHmac('sha256', apiSecret).update(unsigned).digest();
  return `${unsigned}.${base64url(signature)}`;
}

function liveKitConfig() {
  return {
    url: process.env.LIVEKIT_URL || Config.get('voiceLiveKitURL') || '',
    apiKey: process.env.LIVEKIT_API_KEY || '',
    apiSecret: process.env.LIVEKIT_API_SECRET || '',
    clientURL: Config.get('voiceLiveKitClientURL') || ''
  };
}

function validateSignal(args) {
  if(!args || typeof args != 'object')
    return null;

  const targetSessionID = Number(args.targetSessionID);
  if(!Number.isSafeInteger(targetSessionID) || targetSessionID < 1)
    return null;

  let description;
  if(args.description !== undefined) {
    if(!args.description || ![ 'offer', 'answer' ].includes(args.description.type) || typeof args.description.sdp != 'string' || args.description.sdp.length > 131072)
      return null;
    description = { type: args.description.type, sdp: args.description.sdp };
  }

  let candidate;
  if(args.candidate !== undefined) {
    const c = args.candidate;
    if(!c || typeof c.candidate != 'string' || c.candidate.length > 8192)
      return null;
    candidate = {
      candidate: c.candidate,
      sdpMid: typeof c.sdpMid == 'string' ? c.sdpMid.slice(0, 256) : null,
      sdpMLineIndex: Number.isInteger(c.sdpMLineIndex) ? c.sdpMLineIndex : null,
      usernameFragment: typeof c.usernameFragment == 'string' ? c.usernameFragment.slice(0, 256) : undefined
    };
  }

  if(!description && !candidate)
    return null;
  return { targetSessionID, description, candidate };
}

class VoiceRoomManager {
  constructor(room) {
    this.room = room;
    this.participants = new Set();
    this.modeOverride = 'auto';
    this.qualityFallback = false;
    this.pendingInvites = new Map();
    this.lastInviteBySession = new Map();
    this.lastInviteByPair = new Map();
  }

  settings() {
    const voice = this.room.state?._meta?.gameSettings?.voice;
    return voice && typeof voice == 'object' ? voice : {};
  }

  enabled() {
    return this.settings().enabled === true;
  }

  p2pMaxParticipants() {
    const configured = Number(this.settings().p2pMaxParticipants ?? Config.get('voiceP2PMaxParticipants'));
    return Number.isFinite(configured) ? Math.max(2, Math.min(12, Math.floor(configured))) : 4;
  }

  stunURLs() {
    return parseStringList(Config.get('voiceSTUNURLs'));
  }

  liveKit() {
    const lk = liveKitConfig();
    return { ...lk, available: !!(lk.url && lk.apiKey && lk.apiSecret && lk.clientURL) };
  }

  canControlMode(player) {
    const hostSeat = this.settings().hostSeat;
    if(typeof hostSeat == 'string' && hostSeat)
      return this.room.state?.[hostSeat]?.player === player.name;
    return this.room.players[0] === player;
  }

  effectiveMode() {
    if(!this.enabled())
      return 'off';

    const lk = this.liveKit();
    if(!lk.available)
      return 'p2p';
    if(this.modeOverride == 'sfu')
      return 'sfu';
    if(this.qualityFallback)
      return 'sfu';
    if(this.modeOverride == 'p2p')
      return 'p2p';
    return this.participants.size > this.p2pMaxParticipants() ? 'sfu' : 'p2p';
  }

  stateFor(player) {
    const lk = this.liveKit();
    return {
      enabled: this.enabled(),
      joined: this.participants.has(player),
      selfSessionID: player.sessionID,
      participants: [ ...this.participants ].map(p=>({ sessionID: p.sessionID, player: p.name })),
      modeOverride: this.modeOverride,
      effectiveMode: this.effectiveMode(),
      canControlMode: this.canControlMode(player),
      p2pMaxParticipants: this.p2pMaxParticipants(),
      stunURLs: this.stunURLs(),
      sfuAvailable: lk.available,
      liveKitClientURL: lk.clientURL || ''
    };
  }

  sendState(player) {
    player.send('voiceState', this.stateFor(player));
  }

  broadcastState(exceptPlayer = null) {
    for(const player of this.room.players)
      if(player !== exceptPlayer)
        this.sendState(player);
  }

  playersNamed(name) {
    return this.room.players.filter(player=>player.name === name);
  }

  playerNameInVoice(name) {
    return [ ...this.participants ].some(player=>player.name === name);
  }

  sendToPlayerName(name, func, args) {
    for(const player of this.playersNamed(name))
      player.send(func, args);
  }

  sendInviteStatus(inviterName, targetPlayer, status, extra = {}) {
    this.sendToPlayerName(inviterName, 'voiceInviteStatus', { targetPlayer, status, ...extra });
  }

  pendingInviteForTarget(targetPlayer) {
    return [ ...this.pendingInvites.values() ].find(invite=>invite.targetPlayer === targetPlayer) || null;
  }

  finishInvite(invite, status) {
    if(!invite || !this.pendingInvites.has(invite.inviteID))
      return;
    clearTimeout(invite.timer);
    this.pendingInvites.delete(invite.inviteID);
    this.sendToPlayerName(invite.targetPlayer, 'voiceInviteResolved', {
      inviteID: invite.inviteID,
      status
    });
    this.sendInviteStatus(invite.fromPlayer, invite.targetPlayer, status, {
      inviteID: invite.inviteID
    });
  }

  resolveInvitesForTarget(targetPlayer, status) {
    for(const invite of [ ...this.pendingInvites.values() ])
      if(invite.targetPlayer === targetPlayer)
        this.finishInvite(invite, status);
  }

  join(player) {
    if(!this.enabled()) {
      this.sendState(player);
      return;
    }
    this.resolveInvitesForTarget(player.name, 'joined');
    this.participants.add(player);
    this.broadcastState();
  }

  leave(player, disconnecting = false) {
    const removed = this.participants.delete(player);
    if(!this.participants.size)
      this.qualityFallback = false;
    if(removed)
      this.broadcastState(disconnecting ? player : null);
    else if(!disconnecting)
      this.sendState(player);
  }

  invite(player, args) {
    if(!this.enabled())
      return player.send('voiceError', 'Voice is disabled for this game.');
    if(!this.participants.has(player))
      return player.send('voiceError', 'Join voice before inviting another player.');

    const targetPlayer = typeof args?.targetPlayer == 'string' ? args.targetPlayer.trim().slice(0, 256) : '';
    if(!targetPlayer || targetPlayer === player.name)
      return player.send('voiceError', 'Invalid voice invitation target.');

    const targets = this.playersNamed(targetPlayer);
    if(!targets.length)
      return this.sendInviteStatus(player.name, targetPlayer, 'unavailable');
    if(this.playerNameInVoice(targetPlayer))
      return this.sendInviteStatus(player.name, targetPlayer, 'joined');

    const existing = this.pendingInviteForTarget(targetPlayer);
    if(existing)
      return this.sendInviteStatus(player.name, targetPlayer, 'pending', {
        inviteID: existing.inviteID,
        expiresAt: existing.expiresAt
      });

    const now = Date.now();
    const pairKey = `${player.name}\u0000${targetPlayer}`;
    const globalRetryAt = (this.lastInviteBySession.get(player.sessionID) || 0) + VOICE_INVITE_GLOBAL_COOLDOWN_MS;
    const pairRetryAt = (this.lastInviteByPair.get(pairKey) || 0) + VOICE_INVITE_PAIR_COOLDOWN_MS;
    const retryAt = Math.max(globalRetryAt, pairRetryAt);
    if(now < retryAt)
      return this.sendInviteStatus(player.name, targetPlayer, 'cooldown', { retryAt });

    this.lastInviteBySession.set(player.sessionID, now);
    this.lastInviteByPair.set(pairKey, now);

    const inviteID = crypto.randomUUID();
    const expiresAt = now + VOICE_INVITE_TTL_MS;
    const invite = {
      inviteID,
      fromPlayer: player.name,
      fromSessionID: player.sessionID,
      targetPlayer,
      expiresAt,
      timer: null
    };
    invite.timer = setTimeout(()=>this.finishInvite(invite, 'expired'), VOICE_INVITE_TTL_MS);
    this.pendingInvites.set(inviteID, invite);

    for(const target of targets)
      target.send('voiceInvite', { inviteID, fromPlayer: player.name, expiresAt });
    this.sendInviteStatus(player.name, targetPlayer, 'sent', { inviteID, expiresAt });
  }

  respondToInvite(player, args) {
    const inviteID = typeof args?.inviteID == 'string' ? args.inviteID : '';
    const decision = args?.decision;
    if(!inviteID || ![ 'accept', 'reject' ].includes(decision))
      return;
    const invite = this.pendingInvites.get(inviteID);
    if(!invite || invite.targetPlayer !== player.name)
      return;
    if(invite.expiresAt <= Date.now())
      return this.finishInvite(invite, 'expired');
    this.finishInvite(invite, decision == 'accept' ? 'accepted' : 'rejected');
  }

  signal(player, args) {
    if(!this.participants.has(player) || this.effectiveMode() != 'p2p')
      return;
    const signal = validateSignal(args);
    if(!signal)
      return player.send('voiceError', 'Invalid voice signaling payload.');

    const target = [ ...this.participants ].find(p=>p.sessionID === signal.targetSessionID);
    if(!target || target === player)
      return;

    target.send('voiceSignal', {
      fromSessionID: player.sessionID,
      fromPlayer: player.name,
      description: signal.description,
      candidate: signal.candidate
    });
  }

  reportQuality(player, args) {
    if(!this.participants.has(player) || this.effectiveMode() != 'p2p' || args?.degraded !== true)
      return;
    if(!this.liveKit().available)
      return;
    this.qualityFallback = true;
    this.broadcastState();
  }

  setMode(player, args) {
    const mode = args?.mode;
    if(!VOICE_MODES.has(mode))
      return player.send('voiceError', 'Unknown voice route mode.');
    if(!this.canControlMode(player))
      return player.send('voiceError', 'Only the configured room host can change the voice route.');
    if(mode == 'sfu' && !this.liveKit().available)
      return player.send('voiceError', 'LiveKit SFU is not configured on this server.');

    this.modeOverride = mode;
    if(mode != 'sfu')
      this.qualityFallback = false;
    this.broadcastState();
  }

  sendLiveKitToken(player, args) {
    if(!this.participants.has(player) || this.effectiveMode() != 'sfu')
      return;
    const lk = this.liveKit();
    if(!lk.available)
      return player.send('voiceError', 'LiveKit SFU is not configured on this server.');

    const room = `vtt-${this.room.id}`;
    const identity = `vtt-${this.room.id}-${player.sessionID}`;
    const metadata = JSON.stringify({ vttPlayer: player.name, vttSessionID: player.sessionID });
    const token = createLiveKitJoinToken({
      apiKey: lk.apiKey,
      apiSecret: lk.apiSecret,
      identity,
      name: player.name,
      room,
      metadata
    });
    player.send('voiceLiveKitToken', {
      requestID: typeof args?.requestID == 'string' ? args.requestID.slice(0, 128) : '',
      url: lk.url,
      token,
      identity
    });
  }

  handle(player, func, args) {
    if(!this.enabled() && this.participants.size) {
      this.participants.clear();
      this.qualityFallback = false;
    }
    if(func == 'voiceStateRequest')
      return this.sendState(player);
    if(func == 'voiceJoin')
      return this.join(player);
    if(func == 'voiceLeave')
      return this.leave(player);
    if(func == 'voiceInvite')
      return this.invite(player, args);
    if(func == 'voiceInviteResponse')
      return this.respondToInvite(player, args);
    if(func == 'voiceSignal')
      return this.signal(player, args);
    if(func == 'voiceQuality')
      return this.reportQuality(player, args);
    if(func == 'voiceSetMode')
      return this.setMode(player, args);
    if(func == 'voiceLiveKitToken')
      return this.sendLiveKitToken(player, args);
  }

  disconnect(player) {
    for(const invite of [ ...this.pendingInvites.values() ])
      if(invite.fromSessionID === player.sessionID)
        this.finishInvite(invite, 'cancelled');
    this.lastInviteBySession.delete(player.sessionID);
    this.leave(player, true);
  }
}

export default function voiceForRoom(room) {
  if(!managers.has(room))
    managers.set(room, new VoiceRoomManager(room));
  return managers.get(room);
}
