import { onLoad } from './domhelpers.js';
import { toServer } from './connection.js';

;(()=>{
let voiceState = null;
let localStream = null;
let muted = false;
let selectedMicID = localStorage.getItem('vttVoiceMic') || '';
let activeTransport = null;
let p2pStatsTimer = null;
let p2pFallbackReported = false;
let liveKitRoom = null;
let liveKitTokenPending = false;
let liveKitScriptPromise = null;
let liveKitReconnectTimer = null;
let localAnalyserCleanup = null;
const peers = new Map();
const queuedCandidates = new Map();
const speakingSessions = new Set();
const remoteVolumes = readStoredVolumes();

function readStoredVolumes() {
  try {
    const value = JSON.parse(localStorage.getItem('vttVoiceVolumes') || '{}');
    return value && typeof value == 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function secureMediaAvailable() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && (window.isSecureContext || [ 'localhost', '127.0.0.1', '::1' ].includes(location.hostname)));
}

function createVoiceUI() {
  if($('#voiceButton'))
    return;

  const button = document.createElement('button');
  button.id = 'voiceButton';
  button.className = 'toolbarButton';
  button.innerHTML = '<i class="material-symbols voiceToolbarIcon">mic_off</i><span class="tooltip">Voice</span>';
  button.title = 'Voice';
  button.hidden = true;
  const optionsAnchor = $('#optionsAnchor');
  optionsAnchor.parentElement.insertBefore(button, optionsAnchor);

  const panel = document.createElement('section');
  panel.id = 'voicePanel';
  panel.hidden = true;
  panel.innerHTML = `
    <div class="voiceHeader">
      <strong>Voice</strong>
      <button id="voicePanelClose" type="button" title="Close">×</button>
    </div>
    <div id="voiceStatus" class="voiceStatus">Voice is ready.</div>
    <div class="voiceActions">
      <button id="voiceJoinButton" type="button">Join voice</button>
      <button id="voiceMuteButton" type="button" disabled>Mute</button>
    </div>
    <label class="voiceField">Microphone
      <select id="voiceMicSelect"><option value="">Default microphone</option></select>
    </label>
    <label class="voiceField">Connection mode
      <select id="voiceModeSelect" disabled>
        <option value="auto">Auto (recommended)</option>
        <option value="p2p">P2P preferred</option>
        <option value="sfu">SFU stable</option>
      </select>
    </label>
    <div id="voiceTransport" class="voiceTransport"></div>
    <div id="voiceParticipants" class="voiceParticipants"></div>
  `;
  document.body.appendChild(panel);

  button.addEventListener('click', async ()=>{
    if(isLoading)
      return;
    // This click is also the explicit user gesture required by restrictive autoplay
    // policies. Retry any remote audio that may have been blocked previously.
    await retryAudioPlayback();
    panel.hidden = !panel.hidden;
    if(!panel.hidden)
      updateVoiceUI();
  });
  $('#voicePanelClose').addEventListener('click', ()=>panel.hidden = true);
  $('#voiceJoinButton').addEventListener('click', async ()=>{
    if(voiceState?.joined) {
      toServer('voiceLeave');
      await stopAllVoiceMedia();
      return;
    }
    if(!secureMediaAvailable()) {
      setVoiceStatus('Microphone access requires HTTPS (localhost is allowed).', true);
      return;
    }
    try {
      setVoiceStatus('Requesting microphone…');
      await ensureLocalMedia();
      toServer('voiceJoin');
    } catch(e) {
      setVoiceStatus(`Could not access microphone: ${e.message}`, true);
    }
  });
  $('#voiceMuteButton').addEventListener('click', async ()=>{
    muted = !muted;
    await applyMuteState();
    updateVoiceUI();
  });
  $('#voiceMicSelect').addEventListener('change', async e=>{
    selectedMicID = e.target.value;
    localStorage.setItem('vttVoiceMic', selectedMicID);
    if(!voiceState?.joined)
      return;
    try {
      if(activeTransport == 'p2p')
        await replaceP2PMicrophone();
      else if(activeTransport == 'sfu')
        await replaceLiveKitMicrophone();
    } catch(err) {
      setVoiceStatus(`Could not switch microphone: ${err.message}`, true);
    }
  });
  $('#voiceModeSelect').addEventListener('change', e=>toServer('voiceSetMode', { mode: e.target.value }));
}

function setVoiceStatus(text, error = false) {
  if(!$('#voiceStatus'))
    return;
  $('#voiceStatus').textContent = text;
  $('#voiceStatus').classList.toggle('error', error);
}

async function retryAudioPlayback() {
  if(liveKitRoom?.startAudio)
    await liveKitRoom.startAudio().catch(()=>{});
  for(const element of $a('.voiceRemoteAudio'))
    if(element.play)
      await element.play().catch(()=>{});
}

function audioConstraints() {
  return {
    deviceId: selectedMicID || undefined,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: 1
  };
}

async function ensureLocalMedia(force = false) {
  if(localStream && !force)
    return localStream;
  if(localStream)
    stopLocalStream();
  localStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints(), video: false });
  for(const track of localStream.getAudioTracks())
    track.enabled = !muted;
  await refreshMicrophones();
  startLocalSpeakingDetector();
  return localStream;
}

function stopLocalStream() {
  if(localAnalyserCleanup) {
    localAnalyserCleanup();
    localAnalyserCleanup = null;
  }
  if(localStream)
    for(const track of localStream.getTracks())
      track.stop();
  localStream = null;
}

async function refreshMicrophones() {
  if(!navigator.mediaDevices?.enumerateDevices || !$('#voiceMicSelect'))
    return;
  const devices = (await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind == 'audioinput');
  const select = $('#voiceMicSelect');
  const current = selectedMicID;
  select.replaceChildren(new Option('Default microphone', ''));
  for(const [ index, device ] of devices.entries())
    select.appendChild(new Option(device.label || `Microphone ${index + 1}`, device.deviceId));
  if([ ...select.options ].some(o=>o.value == current))
    select.value = current;
  else if(current) {
    selectedMicID = '';
    localStorage.removeItem('vttVoiceMic');
  }
}

function startSpeakingDetector(stream, sessionID, onCleanup) {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if(!AudioContext || !stream)
    return;
  const context = new AudioContext();
  const analyser = context.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.5;
  const source = context.createMediaStreamSource(stream);
  source.connect(analyser);
  const data = new Uint8Array(analyser.fftSize);
  let lastSpeaking = false;
  const timer = setInterval(()=>{
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for(const sample of data) {
      const normalized = (sample - 128) / 128;
      sum += normalized * normalized;
    }
    const rms = Math.sqrt(sum / data.length);
    const speaking = rms > 0.035;
    if(speaking != lastSpeaking) {
      lastSpeaking = speaking;
      setSpeaking(sessionID, speaking);
    }
  }, 120);
  const cleanup = ()=>{
    clearInterval(timer);
    setSpeaking(sessionID, false);
    source.disconnect();
    analyser.disconnect();
    context.close().catch(()=>{});
  };
  onCleanup(cleanup);
}

function startLocalSpeakingDetector() {
  if(localAnalyserCleanup) {
    localAnalyserCleanup();
    localAnalyserCleanup = null;
  }
  if(localStream && voiceState?.selfSessionID != null)
    startSpeakingDetector(localStream, voiceState.selfSessionID, cleanup=>localAnalyserCleanup = cleanup);
}

function setSpeaking(sessionID, speaking) {
  if(sessionID == null)
    return;
  if(speaking)
    speakingSessions.add(Number(sessionID));
  else
    speakingSessions.delete(Number(sessionID));
  const row = document.querySelector(`#voiceParticipants [data-session-id="${Number(sessionID)}"]`);
  if(row)
    row.classList.toggle('speaking', speaking);
}

function updateVoiceUI() {
  if(!$('#voiceButton') || !voiceState)
    return;
  const enabled = !!voiceState.enabled;
  $('#voiceButton').hidden = !enabled;
  if(!enabled) {
    $('#voicePanel').hidden = true;
    return;
  }

  const joined = !!voiceState.joined;
  const icon = $('.voiceToolbarIcon', $('#voiceButton'));
  icon.textContent = joined ? muted ? 'mic_off' : 'mic' : 'mic_off';
  $('#voiceButton').classList.toggle('voiceJoined', joined);
  $('#voiceButton').classList.toggle('voiceSpeaking', joined && speakingSessions.has(Number(voiceState.selfSessionID)));
  $('#voiceJoinButton').textContent = joined ? 'Leave voice' : 'Join voice';
  $('#voiceMuteButton').disabled = !joined;
  $('#voiceMuteButton').textContent = muted ? 'Unmute' : 'Mute';
  $('#voiceMicSelect').disabled = !joined;

  const mode = $('#voiceModeSelect');
  mode.value = voiceState.requestedMode || 'auto';
  mode.disabled = !joined || !voiceState.isHost;
  const sfuOption = mode.querySelector('option[value="sfu"]');
  sfuOption.disabled = !voiceState.sfuAvailable;
  sfuOption.textContent = voiceState.sfuAvailable ? 'SFU stable' : 'SFU stable (not configured)';

  const transport = joined ? voiceState.activeTransport?.toUpperCase() : 'not connected';
  $('#voiceTransport').textContent = joined
    ? `Transport: ${transport}${voiceState.activeTransport == 'p2p' ? ' · direct media when possible' : ' · LiveKit SFU'}`
    : `Auto uses P2P up to ${voiceState.p2pMaxParticipants} participants, then SFU when available.`;

  renderParticipants();
}

function renderParticipants() {
  const container = $('#voiceParticipants');
  if(!container || !voiceState)
    return;
  container.replaceChildren();
  if(!voiceState.participants.length) {
    const empty = document.createElement('div');
    empty.className = 'voiceEmpty';
    empty.textContent = 'Nobody is in voice yet.';
    container.appendChild(empty);
    return;
  }
  for(const participant of voiceState.participants) {
    const row = document.createElement('div');
    row.className = 'voiceParticipant';
    row.dataset.sessionId = participant.sessionID;
    row.classList.toggle('speaking', speakingSessions.has(Number(participant.sessionID)));
    const name = document.createElement('span');
    name.className = 'voiceParticipantName';
    name.textContent = participant.player + (participant.sessionID == voiceState.selfSessionID ? ' (you)' : '');
    row.appendChild(name);
    const speaking = document.createElement('span');
    speaking.className = 'voiceSpeakingDot';
    speaking.title = 'Speaking';
    row.appendChild(speaking);
    if(participant.sessionID != voiceState.selfSessionID) {
      const volume = document.createElement('input');
      volume.type = 'range';
      volume.min = '0';
      volume.max = '100';
      volume.value = String(Math.round(volumeFor(participant.sessionID) * 100));
      volume.title = `Volume for ${participant.player}`;
      volume.addEventListener('input', ()=>setParticipantVolume(participant.sessionID, Number(volume.value) / 100));
      row.appendChild(volume);
    }
    container.appendChild(row);
  }
}

function volumeFor(sessionID) {
  const value = Number(remoteVolumes[sessionID]);
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1;
}

function setParticipantVolume(sessionID, value) {
  value = Math.max(0, Math.min(1, value));
  remoteVolumes[sessionID] = value;
  localStorage.setItem('vttVoiceVolumes', JSON.stringify(remoteVolumes));
  const peer = peers.get(Number(sessionID));
  if(peer?.audio)
    peer.audio.volume = value;
  if(liveKitRoom) {
    const participant = [ ...liveKitRoom.remoteParticipants.values() ].find(p=>sessionIDFromLiveKitIdentity(p.identity) == Number(sessionID));
    if(participant?.setVolume)
      participant.setVolume(value);
  }
}

async function applyMuteState() {
  if(activeTransport == 'p2p' && localStream)
    for(const track of localStream.getAudioTracks())
      track.enabled = !muted;
  if(activeTransport == 'sfu' && liveKitRoom)
    await liveKitRoom.localParticipant.setMicrophoneEnabled(!muted, audioConstraints());
}

async function handleVoiceState(nextState) {
  const previousTransport = activeTransport;
  voiceState = nextState;
  if(!voiceState.enabled) {
    await stopAllVoiceMedia();
    updateVoiceUI();
    return;
  }
  if(!voiceState.joined) {
    await stopAllVoiceMedia();
    updateVoiceUI();
    return;
  }

  startLocalSpeakingDetector();
  if(previousTransport != voiceState.activeTransport)
    await switchTransport(voiceState.activeTransport);
  else if(voiceState.activeTransport == 'p2p')
    await syncP2PPeers();
  updateVoiceUI();
}

async function switchTransport(transport) {
  p2pFallbackReported = false;
  if(transport == 'p2p') {
    await disconnectLiveKit();
    await ensureLocalMedia();
    activeTransport = 'p2p';
    await syncP2PPeers();
    startP2PStats();
    setVoiceStatus('Connected using peer-to-peer voice.');
  } else if(transport == 'sfu') {
    stopP2P();
    stopLocalStream();
    activeTransport = 'sfu';
    liveKitTokenPending = true;
    setVoiceStatus('Connecting to stable SFU voice…');
    toServer('voiceRequestSfuToken');
  }
  updateVoiceUI();
}

function peerConfig() {
  const urls = voiceState?.stunUrls || [];
  return { iceServers: urls.length ? [ { urls } ] : [] };
}

function createPeer(targetSessionID) {
  targetSessionID = Number(targetSessionID);
  if(peers.has(targetSessionID))
    return peers.get(targetSessionID);
  const pc = new RTCPeerConnection(peerConfig());
  const peer = { pc, audio: null, analyserCleanup: null, badSamples: 0, disconnectTimer: null };
  peers.set(targetSessionID, peer);
  if(localStream)
    for(const track of localStream.getAudioTracks())
      pc.addTrack(track, localStream);
  pc.onicecandidate = event=>{
    if(event.candidate)
      toServer('voiceSignal', { targetSessionID, signal: { type: 'candidate', candidate: event.candidate.toJSON ? event.candidate.toJSON() : event.candidate } });
  };
  pc.ontrack = event=>{
    const stream = event.streams[0] || new MediaStream([ event.track ]);
    if(peer.audio)
      peer.audio.remove();
    const audio = document.createElement('audio');
    audio.autoplay = true;
    audio.playsInline = true;
    audio.srcObject = stream;
    audio.volume = volumeFor(targetSessionID);
    audio.className = 'voiceRemoteAudio';
    document.body.appendChild(audio);
    audio.play().catch(()=>setVoiceStatus('Browser blocked voice playback; click the Voice button once.', true));
    peer.audio = audio;
    if(peer.analyserCleanup)
      peer.analyserCleanup();
    startSpeakingDetector(stream, targetSessionID, cleanup=>peer.analyserCleanup = cleanup);
  };
  pc.onconnectionstatechange = ()=>{
    clearTimeout(peer.disconnectTimer);
    if(pc.connectionState == 'failed')
      reportP2PFallback('connection failed');
    if(pc.connectionState == 'disconnected')
      peer.disconnectTimer = setTimeout(()=>reportP2PFallback('connection disconnected'), 5000);
  };
  return peer;
}

async function syncP2PPeers() {
  if(!voiceState?.joined || voiceState.activeTransport != 'p2p')
    return;
  await ensureLocalMedia();
  const targets = new Set(voiceState.participants.filter(p=>p.sessionID != voiceState.selfSessionID).map(p=>Number(p.sessionID)));
  for(const sessionID of [ ...peers.keys() ])
    if(!targets.has(sessionID))
      closePeer(sessionID);
  for(const sessionID of targets) {
    const isNew = !peers.has(sessionID);
    const peer = createPeer(sessionID);
    if(isNew && Number(voiceState.selfSessionID) < sessionID) {
      const offer = await peer.pc.createOffer();
      await peer.pc.setLocalDescription(offer);
      toServer('voiceSignal', { targetSessionID: sessionID, signal: { type: 'offer', sdp: offer.sdp } });
    }
  }
}

async function handleVoiceSignal(args) {
  if(!voiceState?.joined || voiceState.activeTransport != 'p2p')
    return;
  const from = Number(args?.fromSessionID);
  const signal = args?.signal;
  if(!Number.isInteger(from) || !signal)
    return;
  await ensureLocalMedia();
  const peer = createPeer(from);
  try {
    if(signal.type == 'offer') {
      await peer.pc.setRemoteDescription({ type: 'offer', sdp: signal.sdp });
      await flushCandidates(from);
      const answer = await peer.pc.createAnswer();
      await peer.pc.setLocalDescription(answer);
      toServer('voiceSignal', { targetSessionID: from, signal: { type: 'answer', sdp: answer.sdp } });
    } else if(signal.type == 'answer') {
      await peer.pc.setRemoteDescription({ type: 'answer', sdp: signal.sdp });
      await flushCandidates(from);
    } else if(signal.type == 'candidate' && signal.candidate) {
      if(peer.pc.remoteDescription)
        await peer.pc.addIceCandidate(signal.candidate);
      else
        (queuedCandidates.get(from) || queuedCandidates.set(from, []).get(from)).push(signal.candidate);
    }
  } catch(e) {
    console.warn('Voice P2P signaling failed.', e);
    reportP2PFallback('signaling failed');
  }
}

async function flushCandidates(sessionID) {
  const peer = peers.get(Number(sessionID));
  if(!peer)
    return;
  for(const candidate of queuedCandidates.get(Number(sessionID)) || [])
    await peer.pc.addIceCandidate(candidate);
  queuedCandidates.delete(Number(sessionID));
}

async function replaceP2PMicrophone() {
  const oldStream = localStream;
  const newStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints(), video: false });
  const newTrack = newStream.getAudioTracks()[0];
  newTrack.enabled = !muted;
  for(const peer of peers.values()) {
    const sender = peer.pc.getSenders().find(s=>s.track?.kind == 'audio');
    if(sender)
      await sender.replaceTrack(newTrack);
    else
      peer.pc.addTrack(newTrack, newStream);
  }
  localStream = newStream;
  if(oldStream)
    for(const track of oldStream.getTracks())
      track.stop();
  startLocalSpeakingDetector();
  await refreshMicrophones();
}

function closePeer(sessionID) {
  const peer = peers.get(Number(sessionID));
  if(!peer)
    return;
  clearTimeout(peer.disconnectTimer);
  if(peer.analyserCleanup)
    peer.analyserCleanup();
  if(peer.audio)
    peer.audio.remove();
  peer.pc.ontrack = null;
  peer.pc.onicecandidate = null;
  peer.pc.onconnectionstatechange = null;
  peer.pc.close();
  peers.delete(Number(sessionID));
  queuedCandidates.delete(Number(sessionID));
  setSpeaking(sessionID, false);
}

function stopP2P() {
  clearInterval(p2pStatsTimer);
  p2pStatsTimer = null;
  for(const sessionID of [ ...peers.keys() ])
    closePeer(sessionID);
}

function startP2PStats() {
  clearInterval(p2pStatsTimer);
  p2pStatsTimer = setInterval(checkP2PQuality, 5000);
}

async function checkP2PQuality() {
  if(!voiceState?.joined || voiceState.activeTransport != 'p2p' || voiceState.requestedMode != 'auto')
    return;
  for(const peer of peers.values()) {
    try {
      const stats = await peer.pc.getStats();
      let rtt = 0;
      let loss = 0;
      for(const report of stats.values()) {
        if(report.type == 'candidate-pair' && report.state == 'succeeded' && report.currentRoundTripTime)
          rtt = Math.max(rtt, Number(report.currentRoundTripTime));
        if(report.type == 'inbound-rtp' && report.kind == 'audio') {
          const received = Number(report.packetsReceived || 0);
          const lost = Number(report.packetsLost || 0);
          if(received + lost > 0)
            loss = Math.max(loss, lost / (received + lost));
        }
      }
      peer.badSamples = rtt > 0.45 || loss > 0.12 ? peer.badSamples + 1 : 0;
      if(peer.badSamples >= 3)
        return reportP2PFallback(`quality degraded (RTT ${Math.round(rtt * 1000)} ms, loss ${Math.round(loss * 100)}%)`);
    } catch(e) {
      console.warn('Could not read voice connection statistics.', e);
    }
  }
}

function reportP2PFallback(reason) {
  if(p2pFallbackReported || voiceState?.requestedMode != 'auto' || !voiceState?.sfuAvailable)
    return;
  p2pFallbackReported = true;
  setVoiceStatus(`P2P ${reason}; switching to stable SFU…`);
  toServer('voiceQuality', { action: 'fallback', reason });
}

function loadLiveKit() {
  if(window.LivekitClient)
    return Promise.resolve(window.LivekitClient);
  if(liveKitScriptPromise)
    return liveKitScriptPromise;
  liveKitScriptPromise = new Promise((resolve, reject)=>{
    const script = document.createElement('script');
    script.src = voiceState.livekitClientURL;
    script.async = true;
    script.onload = ()=>window.LivekitClient ? resolve(window.LivekitClient) : reject(new Error('LiveKit client did not load.'));
    script.onerror = ()=>reject(new Error('LiveKit client download failed.'));
    document.head.appendChild(script);
  });
  return liveKitScriptPromise;
}

async function connectLiveKit(args) {
  if(!voiceState?.joined || voiceState.activeTransport != 'sfu')
    return;
  liveKitTokenPending = false;
  clearTimeout(liveKitReconnectTimer);
  liveKitReconnectTimer = null;
  await disconnectLiveKit();
  const LivekitClient = await loadLiveKit();
  const room = new LivekitClient.Room({ adaptiveStream: false, dynacast: false });
  liveKitRoom = room;
  room.on(LivekitClient.RoomEvent.TrackSubscribed, (track, publication, participant)=>{
    if(track.kind != 'audio')
      return;
    const element = track.attach();
    element.classList.add('voiceRemoteAudio');
    element.autoplay = true;
    document.body.appendChild(element);
    const sessionID = sessionIDFromLiveKitIdentity(participant.identity);
    if(sessionID != null) {
      const volume = volumeFor(sessionID);
      element.volume = volume;
      if(participant.setVolume)
        participant.setVolume(volume);
    }
  });
  room.on(LivekitClient.RoomEvent.TrackUnsubscribed, track=>track.detach().forEach(element=>element.remove()));
  room.on(LivekitClient.RoomEvent.ActiveSpeakersChanged, activeSpeakers=>{
    const active = new Set(activeSpeakers.map(p=>sessionIDFromLiveKitIdentity(p.identity)).filter(v=>v != null));
    for(const participant of voiceState?.participants || [])
      setSpeaking(participant.sessionID, active.has(Number(participant.sessionID)));
    if(!muted && room.localParticipant?.isSpeaking)
      setSpeaking(voiceState.selfSessionID, true);
  });
  room.on(LivekitClient.RoomEvent.Disconnected, ()=>{
    // disconnectLiveKit clears the global room reference before intentional disconnects.
    if(liveKitRoom !== room)
      return;
    liveKitRoom = null;
    for(const element of $a('.voiceRemoteAudio'))
      element.remove();
    if(voiceState?.joined && voiceState.activeTransport == 'sfu') {
      setVoiceStatus('SFU voice disconnected; reconnecting…', true);
      clearTimeout(liveKitReconnectTimer);
      liveKitReconnectTimer = setTimeout(()=>{
        if(voiceState?.joined && voiceState.activeTransport == 'sfu' && !liveKitTokenPending) {
          liveKitTokenPending = true;
          toServer('voiceRequestSfuToken');
        }
      }, 2000);
    }
  });
  await room.connect(args.url, args.token);
  // This succeeds immediately on browsers that already allow playback. If a browser
  // requires an explicit user gesture, clicking the Voice toolbar button retries it.
  if(room.startAudio)
    await room.startAudio().catch(()=>{});
  if(!muted)
    await room.localParticipant.setMicrophoneEnabled(true, audioConstraints());
  setVoiceStatus('Connected through LiveKit SFU.');
  updateVoiceUI();
}

function sessionIDFromLiveKitIdentity(identity) {
  const match = String(identity || '').match(/^vtt-(\d+)$/);
  return match ? Number(match[1]) : null;
}

async function replaceLiveKitMicrophone() {
  if(!liveKitRoom)
    return;
  await liveKitRoom.switchActiveDevice('audioinput', selectedMicID || 'default');
  await refreshMicrophones();
}

async function disconnectLiveKit() {
  liveKitTokenPending = false;
  clearTimeout(liveKitReconnectTimer);
  liveKitReconnectTimer = null;
  if(liveKitRoom) {
    const room = liveKitRoom;
    liveKitRoom = null;
    room.disconnect();
  }
  for(const element of $a('.voiceRemoteAudio'))
    element.remove();
}

async function stopAllVoiceMedia() {
  stopP2P();
  await disconnectLiveKit();
  stopLocalStream();
  activeTransport = null;
  p2pFallbackReported = false;
  speakingSessions.clear();
}

onLoad(function() {
  createVoiceUI();
  navigator.mediaDevices?.addEventListener?.('devicechange', ()=>refreshMicrophones().catch(()=>{}));
  onMessage('meta', ()=>toServer('voiceDiscover'));
  onMessage('voiceState', args=>handleVoiceState(args).catch(e=>{
    console.error('Voice state update failed.', e);
    setVoiceStatus(e.message, true);
    if(voiceState?.activeTransport == 'p2p')
      reportP2PFallback('setup failed');
  }));
  onMessage('voiceSignal', args=>handleVoiceSignal(args));
  onMessage('voiceSfuToken', args=>connectLiveKit(args).catch(e=>{
    liveKitTokenPending = false;
    console.error('LiveKit connection failed.', e);
    setVoiceStatus(`SFU connection failed: ${e.message}`, true);
    if(voiceState?.joined && voiceState.activeTransport == 'sfu') {
      clearTimeout(liveKitReconnectTimer);
      liveKitReconnectTimer = setTimeout(()=>{
        if(!liveKitTokenPending) {
          liveKitTokenPending = true;
          toServer('voiceRequestSfuToken');
        }
      }, 3000);
    }
  }));
  onMessage('voiceError', message=>setVoiceStatus(message, true));
  window.addEventListener('beforeunload', ()=>{
    if(voiceState?.joined)
      toServer('voiceLeave');
    stopP2P();
    stopLocalStream();
    if(liveKitRoom)
      liveKitRoom.disconnect();
  });
});
})();
