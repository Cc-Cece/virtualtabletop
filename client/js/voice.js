const transport = window.vttVoiceTransport;

if(!transport) {
  console.warn('Voice module loaded without VTT transport bridge.');
} else {
  const state = {
    server: null,
    currentSessionID: null,
    joinIntent: false,
    localStream: null,
    muted: false,
    peers: new Map(),
    qualityTimer: null,
    liveKitRoom: null,
    liveKitSdk: null,
    liveKitLoading: null,
    liveKitTrackElements: new Map(),
    tokenRequests: new Map(),
    volumes: new Map(),
    locallyMuted: new Set(),
    analysers: new Map(),
    audioContext: null,
    analyserFrame: null,
    switchingTransport: false,
    lastStatus: 'Voice unavailable'
  };

  const ui = createUI();
  installStyles();
  wireTransport();
  wireUI();
  refreshDevices();

  const cachedSessionID = transport.lastMessage && transport.lastMessage('sessionID');
  if(cachedSessionID != null)
    onSessionID(cachedSessionID);

  function installStyles() {
    if(document.getElementById('voiceStyles'))
      return;
    const link = document.createElement('link');
    link.id = 'voiceStyles';
    link.rel = 'stylesheet';
    link.href = new URL('css/voice.css', document.baseURI).href;
    document.head.appendChild(link);
  }

  function createUI() {
    const toolbar = document.getElementById('toolbar');
    const playersButton = document.getElementById('playersButton');
    if(!toolbar || !playersButton)
      throw new Error('Voice UI could not find the VTT toolbar.');

    const button = document.createElement('button');
    button.id = 'voiceButton';
    button.className = 'toolbarButton toolbarTab voiceHidden';
    button.type = 'button';
    button.setAttribute('aria-expanded', 'false');
    button.innerHTML = '<i class="material-symbols voiceToolbarIcon">mic</i><span class="tooltip">Voice</span>';
    playersButton.insertAdjacentElement('afterend', button);

    const panel = document.createElement('section');
    panel.id = 'voicePanel';
    panel.className = 'voicePanel voiceHidden';
    panel.setAttribute('aria-label', 'Voice chat');
    panel.innerHTML = `
      <header class="voiceHeader">
        <div><strong>Voice</strong><span id="voiceRouteBadge">Off</span></div>
        <button id="voicePanelClose" type="button" aria-label="Close voice panel">×</button>
      </header>
      <div id="voiceStatus" class="voiceStatus">Voice unavailable</div>
      <div class="voicePrimaryActions">
        <button id="voiceJoin" type="button">Join voice</button>
        <button id="voiceMic" type="button" disabled>Mute mic</button>
      </div>
      <label class="voiceField">Microphone
        <select id="voiceInput" disabled><option value="">Default microphone</option></select>
      </label>
      <label class="voiceField">Route
        <select id="voiceMode" disabled>
          <option value="auto">Auto (recommended)</option>
          <option value="p2p">P2P preferred</option>
          <option value="sfu">Stable (SFU)</option>
        </select>
      </label>
      <div class="voiceParticipantsHeader">Players in voice</div>
      <div id="voiceParticipants" class="voiceParticipants"><div class="voiceEmpty">Nobody has joined voice.</div></div>
    `;
    document.body.appendChild(panel);

    const audioRoot = document.createElement('div');
    audioRoot.id = 'voiceAudioRoot';
    audioRoot.hidden = true;
    document.body.appendChild(audioRoot);

    return {
      button,
      panel,
      audioRoot,
      close: panel.querySelector('#voicePanelClose'),
      status: panel.querySelector('#voiceStatus'),
      routeBadge: panel.querySelector('#voiceRouteBadge'),
      join: panel.querySelector('#voiceJoin'),
      mic: panel.querySelector('#voiceMic'),
      input: panel.querySelector('#voiceInput'),
      mode: panel.querySelector('#voiceMode'),
      participants: panel.querySelector('#voiceParticipants')
    };
  }

  function wireUI() {
    ui.button.addEventListener('click', () => {
      const open = ui.panel.classList.toggle('open');
      ui.button.classList.toggle('active', open);
      ui.button.setAttribute('aria-expanded', String(open));
      if(open)
        transport.toServer('voiceStateRequest', {});
    });
    ui.close.addEventListener('click', ()=>setPanelOpen(false));
    ui.join.addEventListener('click', ()=>state.joinIntent ? leaveVoice() : joinVoice());
    ui.mic.addEventListener('click', toggleMicrophone);
    ui.input.addEventListener('change', switchInputDevice);
    ui.mode.addEventListener('change', ()=>transport.toServer('voiceSetMode', { mode: ui.mode.value }));
    document.addEventListener('keydown', e=>{
      if(e.key == 'Escape' && ui.panel.classList.contains('open'))
        setPanelOpen(false);
    });
    if(navigator.mediaDevices?.addEventListener)
      navigator.mediaDevices.addEventListener('devicechange', refreshDevices);
  }

  function wireTransport() {
    transport.onMessage('sessionID', onSessionID);
    transport.onMessage('meta', ()=>transport.toServer('voiceStateRequest', {}));
    transport.onMessage('voiceState', onVoiceState);
    transport.onMessage('voiceSignal', onVoiceSignal);
    transport.onMessage('voiceLiveKitToken', onLiveKitToken);
    transport.onMessage('voiceError', message=>{
      setStatus(message || 'Voice request failed.', true);
      transport.toServer('voiceStateRequest', {});
    });
  }

  function onSessionID(sessionID) {
    const numeric = Number(sessionID);
    if(!Number.isSafeInteger(numeric))
      return;
    if(state.currentSessionID != null && state.currentSessionID !== numeric) {
      closeAllPeers();
      disconnectLiveKit();
    }
    state.currentSessionID = numeric;
    transport.toServer('voiceStateRequest', {});
    if(state.joinIntent)
      transport.toServer('voiceJoin', {});
  }

  async function onVoiceState(serverState) {
    if(!serverState || typeof serverState != 'object')
      return;
    state.server = serverState;
    state.currentSessionID = Number(serverState.selfSessionID) || state.currentSessionID;

    const visible = serverState.enabled === true;
    ui.button.classList.toggle('voiceHidden', !visible);
    ui.panel.classList.toggle('voiceHidden', !visible);
    if(!visible) {
      if(state.joinIntent || state.localStream)
        await stopVoiceLocally();
      setPanelOpen(false);
      setStatus('Voice is disabled for this game.');
      updateUI();
      requestToolbarLayout();
      return;
    }

    requestToolbarLayout();
    if(state.joinIntent && !serverState.joined && state.localStream)
      transport.toServer('voiceJoin', {});

    if(serverState.joined && state.localStream) {
      if(serverState.effectiveMode == 'sfu')
        await switchToSFU();
      else if(serverState.effectiveMode == 'p2p')
        await switchToP2P();
    } else if(!serverState.joined) {
      closeAllPeers();
      await disconnectLiveKit();
    }
    updateUI();
  }

  function requestToolbarLayout() {
    if(typeof window.updateToolbarLayout == 'function')
      window.updateToolbarLayout();
    else
      window.dispatchEvent(new Event('resize'));
  }

  function setPanelOpen(open) {
    ui.panel.classList.toggle('open', open);
    ui.button.classList.toggle('active', open);
    ui.button.setAttribute('aria-expanded', String(open));
  }

  function secureMediaAvailable() {
    return !!(navigator.mediaDevices?.getUserMedia && (window.isSecureContext || [ 'localhost', '127.0.0.1', '::1' ].includes(location.hostname)));
  }

  async function joinVoice() {
    if(!state.server?.enabled)
      return;
    if(!secureMediaAvailable()) {
      setStatus('Microphone access requires HTTPS (localhost is allowed for development).', true);
      return;
    }

    ui.join.disabled = true;
    try {
      state.joinIntent = true;
      await ensureLocalStream();
      await ensureAudioContext();
      monitorStream(state.currentSessionID, state.localStream);
      await refreshDevices();
      transport.toServer('voiceJoin', {});
      setStatus('Joining voice…');
    } catch(error) {
      state.joinIntent = false;
      setStatus(`Microphone unavailable: ${error.message || error}`, true);
    } finally {
      ui.join.disabled = false;
      updateUI();
    }
  }

  async function leaveVoice() {
    state.joinIntent = false;
    transport.toServer('voiceLeave', {});
    await stopVoiceLocally();
    setStatus('Voice off');
    updateUI();
  }

  async function stopVoiceLocally() {
    closeAllPeers();
    await disconnectLiveKit();
    stopQualityMonitor();
    for(const track of state.localStream?.getTracks() || [])
      track.stop();
    state.localStream = null;
    state.muted = false;
    clearAnalysers();
  }

  async function ensureLocalStream(deviceId = ui.input.value) {
    if(state.localStream?.getAudioTracks().some(t=>t.readyState == 'live'))
      return state.localStream;
    state.localStream = await navigator.mediaDevices.getUserMedia({
      video: false,
      audio: {
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });
    const track = state.localStream.getAudioTracks()[0];
    if(!track)
      throw new Error('No audio track was returned by the browser.');
    track.enabled = !state.muted;
    return state.localStream;
  }

  async function refreshDevices() {
    if(!navigator.mediaDevices?.enumerateDevices)
      return;
    try {
      const selected = ui.input.value;
      const devices = (await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind == 'audioinput');
      ui.input.replaceChildren();
      const fallback = document.createElement('option');
      fallback.value = '';
      fallback.textContent = 'Default microphone';
      ui.input.appendChild(fallback);
      devices.forEach((device, index)=>{
        const option = document.createElement('option');
        option.value = device.deviceId;
        option.textContent = device.label || `Microphone ${index + 1}`;
        ui.input.appendChild(option);
      });
      if([ ...ui.input.options ].some(o=>o.value == selected))
        ui.input.value = selected;
    } catch(error) {
      console.warn('Could not enumerate microphones.', error);
    }
  }

  async function switchInputDevice() {
    if(!state.localStream)
      return;
    ui.input.disabled = true;
    const oldStream = state.localStream;
    const oldTrack = oldStream.getAudioTracks()[0];
    state.localStream = null;
    try {
      const newStream = await ensureLocalStream(ui.input.value);
      const newTrack = newStream.getAudioTracks()[0];
      newTrack.enabled = !state.muted;
      monitorStream(state.currentSessionID, newStream);

      for(const entry of state.peers.values()) {
        const sender = entry.pc.getSenders().find(s=>s.track?.kind == 'audio');
        if(sender)
          await sender.replaceTrack(newTrack);
      }

      if(state.liveKitRoom) {
        try {
          if(oldTrack)
            await state.liveKitRoom.localParticipant.unpublishTrack(oldTrack);
        } catch(error) {}
        await state.liveKitRoom.localParticipant.publishTrack(newTrack, {
          source: state.liveKitSdk.Track.Source.Microphone,
          name: 'vtt-voice'
        });
      }
      oldTrack?.stop();
      setStatus(`Connected via ${routeLabel(state.server?.effectiveMode)}.`);
    } catch(error) {
      state.localStream = oldStream;
      setStatus(`Could not switch microphone: ${error.message || error}`, true);
    } finally {
      ui.input.disabled = !state.joinIntent;
    }
  }

  function toggleMicrophone() {
    const track = state.localStream?.getAudioTracks()[0];
    if(!track)
      return;
    state.muted = !state.muted;
    track.enabled = !state.muted;
    updateUI();
  }

  async function switchToP2P() {
    if(state.switchingTransport)
      return;
    state.switchingTransport = true;
    try {
      if(state.liveKitRoom)
        await disconnectLiveKit();
      syncPeers();
      startQualityMonitor();
      setStatus('Connected via direct P2P.');
    } finally {
      state.switchingTransport = false;
      updateUI();
    }
  }

  function syncPeers() {
    if(!state.server || state.server.effectiveMode != 'p2p' || !state.localStream)
      return;
    const wanted = new Set((state.server.participants || []).map(p=>Number(p.sessionID)).filter(id=>id && id !== state.currentSessionID));
    for(const sessionID of state.peers.keys())
      if(!wanted.has(sessionID))
        closePeer(sessionID);

    for(const participant of state.server.participants || []) {
      const sessionID = Number(participant.sessionID);
      if(!sessionID || sessionID === state.currentSessionID)
        continue;
      const entry = ensurePeer(sessionID, participant.player);
      if(state.currentSessionID < sessionID && !entry.offerStarted && entry.pc.signalingState == 'stable')
        makeOffer(entry);
    }
  }

  function ensurePeer(sessionID, player) {
    if(state.peers.has(sessionID)) {
      const entry = state.peers.get(sessionID);
      entry.player = player || entry.player;
      return entry;
    }

    const iceServers = (state.server?.stunURLs || []).map(url=>({ urls: url }));
    const pc = new RTCPeerConnection({ iceServers });
    const entry = {
      sessionID,
      player,
      pc,
      offerStarted: false,
      pendingCandidates: [],
      disconnectTimer: null,
      connectTimer: null,
      quality: { received: 0, lost: 0, badSamples: 0, reported: false }
    };
    state.peers.set(sessionID, entry);
    entry.connectTimer = setTimeout(()=>{
      if(pc.connectionState != 'connected')
        reportP2PDegraded(`peer ${sessionID} connection timeout`);
    }, 12000);

    for(const track of state.localStream.getAudioTracks())
      pc.addTrack(track, state.localStream);

    pc.onicecandidate = event=>{
      if(event.candidate)
        transport.toServer('voiceSignal', { targetSessionID: sessionID, candidate: event.candidate.toJSON ? event.candidate.toJSON() : event.candidate });
    };
    pc.ontrack = event=>{
      const stream = event.streams?.[0] || new MediaStream([ event.track ]);
      attachP2PAudio(entry, stream);
    };
    pc.onconnectionstatechange = ()=>{
      if(pc.connectionState == 'connected') {
        clearTimeout(entry.connectTimer);
        entry.connectTimer = null;
        clearTimeout(entry.disconnectTimer);
        entry.disconnectTimer = null;
      } else if(pc.connectionState == 'failed') {
        reportP2PDegraded(`peer ${sessionID} failed`);
      }
    };
    pc.oniceconnectionstatechange = ()=>{
      if(pc.iceConnectionState == 'disconnected' && !entry.disconnectTimer) {
        entry.disconnectTimer = setTimeout(()=>{
          if(pc.iceConnectionState == 'disconnected')
            reportP2PDegraded(`peer ${sessionID} disconnected`);
        }, 5000);
      } else if(pc.iceConnectionState != 'disconnected') {
        clearTimeout(entry.disconnectTimer);
        entry.disconnectTimer = null;
      }
    };
    return entry;
  }

  async function makeOffer(entry) {
    entry.offerStarted = true;
    try {
      await entry.pc.setLocalDescription(await entry.pc.createOffer());
      transport.toServer('voiceSignal', {
        targetSessionID: entry.sessionID,
        description: { type: entry.pc.localDescription.type, sdp: entry.pc.localDescription.sdp }
      });
    } catch(error) {
      entry.offerStarted = false;
      reportP2PDegraded(`offer failed: ${error.message || error}`);
    }
  }

  async function onVoiceSignal(message) {
    if(!state.server?.joined || state.server.effectiveMode != 'p2p' || !state.localStream)
      return;
    const sessionID = Number(message?.fromSessionID);
    if(!sessionID || sessionID === state.currentSessionID)
      return;
    const entry = ensurePeer(sessionID, message.fromPlayer);
    try {
      if(message.description) {
        await entry.pc.setRemoteDescription(message.description);
        for(const candidate of entry.pendingCandidates.splice(0))
          await entry.pc.addIceCandidate(candidate);
        if(message.description.type == 'offer') {
          await entry.pc.setLocalDescription(await entry.pc.createAnswer());
          transport.toServer('voiceSignal', {
            targetSessionID: sessionID,
            description: { type: entry.pc.localDescription.type, sdp: entry.pc.localDescription.sdp }
          });
        }
      }
      if(message.candidate) {
        if(entry.pc.remoteDescription)
          await entry.pc.addIceCandidate(message.candidate);
        else
          entry.pendingCandidates.push(message.candidate);
      }
    } catch(error) {
      reportP2PDegraded(`signaling failed: ${error.message || error}`);
    }
  }

  function attachP2PAudio(entry, stream) {
    let audio = ui.audioRoot.querySelector(`[data-voice-session="${entry.sessionID}"]`);
    if(!audio) {
      audio = document.createElement('audio');
      audio.autoplay = true;
      audio.playsInline = true;
      audio.dataset.voiceSession = String(entry.sessionID);
      ui.audioRoot.appendChild(audio);
    }
    audio.srcObject = stream;
    applyVolume(entry.sessionID);
    audio.play().catch(()=>setStatus('Browser blocked remote audio playback; click the voice panel and retry.', true));
    monitorStream(entry.sessionID, stream);
  }

  function closePeer(sessionID) {
    const entry = state.peers.get(sessionID);
    if(!entry)
      return;
    clearTimeout(entry.connectTimer);
    clearTimeout(entry.disconnectTimer);
    entry.pc.ontrack = null;
    entry.pc.onicecandidate = null;
    entry.pc.close();
    state.peers.delete(sessionID);
    removeRemoteAudio(sessionID);
    stopMonitor(sessionID);
  }

  function closeAllPeers() {
    for(const sessionID of [ ...state.peers.keys() ])
      closePeer(sessionID);
    stopQualityMonitor();
  }

  function startQualityMonitor() {
    if(state.qualityTimer)
      return;
    state.qualityTimer = setInterval(sampleP2PQuality, 5000);
  }

  function stopQualityMonitor() {
    clearInterval(state.qualityTimer);
    state.qualityTimer = null;
  }

  async function sampleP2PQuality() {
    if(state.server?.effectiveMode != 'p2p')
      return;
    for(const entry of state.peers.values()) {
      if(entry.pc.connectionState != 'connected')
        continue;
      try {
        const stats = await entry.pc.getStats();
        let received = 0;
        let lost = 0;
        let jitter = 0;
        let rtt = 0;
        stats.forEach(report=>{
          if(report.type == 'inbound-rtp' && (report.kind == 'audio' || report.mediaType == 'audio')) {
            received += Number(report.packetsReceived) || 0;
            lost += Math.max(0, Number(report.packetsLost) || 0);
            jitter = Math.max(jitter, Number(report.jitter) || 0);
          }
          if(report.type == 'candidate-pair' && report.state == 'succeeded' && (report.nominated || report.selected))
            rtt = Math.max(rtt, Number(report.currentRoundTripTime) || 0);
        });
        const deltaReceived = Math.max(0, received - entry.quality.received);
        const deltaLost = Math.max(0, lost - entry.quality.lost);
        entry.quality.received = received;
        entry.quality.lost = lost;
        const packetTotal = deltaReceived + deltaLost;
        const lossRate = packetTotal ? deltaLost / packetTotal : 0;
        const bad = lossRate > 0.12 || rtt > 0.45 || jitter > 0.08;
        entry.quality.badSamples = bad ? entry.quality.badSamples + 1 : 0;
        if(entry.quality.badSamples >= 2 && !entry.quality.reported) {
          entry.quality.reported = true;
          reportP2PDegraded(`quality loss=${lossRate.toFixed(2)} rtt=${rtt.toFixed(2)} jitter=${jitter.toFixed(2)}`);
        }
      } catch(error) {
        console.warn('Could not sample P2P voice quality.', error);
      }
    }
  }

  function reportP2PDegraded(reason) {
    if(state.server?.effectiveMode != 'p2p')
      return;
    transport.toServer('voiceQuality', { degraded: true, reason: String(reason).slice(0, 256) });
    setStatus('Direct voice quality degraded; switching to stable route…');
  }

  async function switchToSFU() {
    if(state.liveKitRoom || state.switchingTransport)
      return;
    state.switchingTransport = true;
    try {
      const sdk = await loadLiveKitSDK();
      const credentials = await requestLiveKitToken();
      const room = new sdk.Room({ adaptiveStream: false, dynacast: false });
      state.liveKitSdk = sdk;

      room.on(sdk.RoomEvent.TrackSubscribed, (track, publication, participant)=>attachLiveKitTrack(track, publication, participant));
      room.on(sdk.RoomEvent.TrackUnsubscribed, (track, publication, participant)=>detachLiveKitTrack(track, participant));
      room.on(sdk.RoomEvent.ParticipantDisconnected, participant=>detachLiveKitParticipant(participant));
      room.on(sdk.RoomEvent.Reconnecting, ()=>setStatus('Stable voice reconnecting…'));
      room.on(sdk.RoomEvent.Reconnected, ()=>setStatus('Connected via stable SFU.'));
      room.on(sdk.RoomEvent.Disconnected, ()=>{
        if(state.joinIntent && state.server?.effectiveMode == 'sfu')
          setStatus('Stable voice disconnected.', true);
      });

      await room.connect(credentials.url, credentials.token);
      const localTrack = state.localStream?.getAudioTracks()[0];
      if(!localTrack)
        throw new Error('Microphone track disappeared before SFU connection.');
      await room.localParticipant.publishTrack(localTrack, {
        source: sdk.Track.Source.Microphone,
        name: 'vtt-voice'
      });
      state.liveKitRoom = room;
      closeAllPeers();
      setStatus('Connected via stable SFU.');
    } catch(error) {
      setStatus(`Stable route failed: ${error.message || error}`, true);
      console.error('LiveKit voice connection failed.', error);
    } finally {
      state.switchingTransport = false;
      updateUI();
    }
  }

  async function loadLiveKitSDK() {
    if(state.liveKitSdk)
      return state.liveKitSdk;
    if(window.LivekitClient) {
      state.liveKitSdk = window.LivekitClient;
      return state.liveKitSdk;
    }
    if(state.liveKitLoading)
      return state.liveKitLoading;
    const url = state.server?.liveKitClientURL;
    if(!url)
      throw new Error('LiveKit browser SDK URL is not configured.');

    state.liveKitLoading = new Promise((resolve, reject)=>{
      const script = document.createElement('script');
      script.src = url;
      script.async = true;
      script.onload = ()=>window.LivekitClient ? resolve(window.LivekitClient) : reject(new Error('LiveKit SDK did not expose LivekitClient.'));
      script.onerror = ()=>reject(new Error('Could not load LiveKit browser SDK.'));
      document.head.appendChild(script);
    }).then(sdk=>{
      state.liveKitSdk = sdk;
      return sdk;
    }).finally(()=>state.liveKitLoading = null);
    return state.liveKitLoading;
  }

  function requestLiveKitToken() {
    const requestID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    return new Promise((resolve, reject)=>{
      const timer = setTimeout(()=>{
        state.tokenRequests.delete(requestID);
        reject(new Error('Timed out waiting for LiveKit credentials.'));
      }, 7000);
      state.tokenRequests.set(requestID, value=>{
        clearTimeout(timer);
        resolve(value);
      });
      transport.toServer('voiceLiveKitToken', { requestID });
    });
  }

  function onLiveKitToken(args) {
    const resolver = state.tokenRequests.get(args?.requestID);
    if(!resolver)
      return;
    state.tokenRequests.delete(args.requestID);
    resolver(args);
  }

  function liveKitSessionID(participant) {
    try {
      const metadata = JSON.parse(participant?.metadata || '{}');
      return Number(metadata.vttSessionID) || null;
    } catch(error) {
      return null;
    }
  }

  function attachLiveKitTrack(track, publication, participant) {
    const sdk = state.liveKitSdk;
    if(!sdk || (publication?.kind && publication.kind != sdk.Track.Kind.Audio) || (track?.kind && track.kind != sdk.Track.Kind.Audio))
      return;
    const sessionID = liveKitSessionID(participant);
    if(!sessionID)
      return;
    const element = track.attach();
    element.autoplay = true;
    element.playsInline = true;
    element.dataset.voiceSession = String(sessionID);
    ui.audioRoot.appendChild(element);
    const entries = state.liveKitTrackElements.get(sessionID) || [];
    entries.push({ track, element });
    state.liveKitTrackElements.set(sessionID, entries);
    applyVolume(sessionID);
    if(track.mediaStreamTrack)
      monitorStream(sessionID, new MediaStream([ track.mediaStreamTrack ]));
    element.play?.().catch(()=>setStatus('Browser blocked remote audio playback; click the voice panel and retry.', true));
  }

  function detachLiveKitTrack(track, participant) {
    const sessionID = liveKitSessionID(participant);
    if(!sessionID)
      return;
    const entries = state.liveKitTrackElements.get(sessionID) || [];
    const keep = [];
    for(const entry of entries) {
      if(entry.track === track) {
        try { track.detach(entry.element); } catch(error) {}
        entry.element.remove();
      } else {
        keep.push(entry);
      }
    }
    if(keep.length)
      state.liveKitTrackElements.set(sessionID, keep);
    else {
      state.liveKitTrackElements.delete(sessionID);
      stopMonitor(sessionID);
    }
  }

  function detachLiveKitParticipant(participant) {
    const sessionID = liveKitSessionID(participant);
    if(!sessionID)
      return;
    for(const entry of state.liveKitTrackElements.get(sessionID) || []) {
      try { entry.track.detach(entry.element); } catch(error) {}
      entry.element.remove();
    }
    state.liveKitTrackElements.delete(sessionID);
    stopMonitor(sessionID);
  }

  async function disconnectLiveKit() {
    const room = state.liveKitRoom;
    state.liveKitRoom = null;
    for(const sessionID of [ ...state.liveKitTrackElements.keys() ])
      detachLiveKitParticipant({ metadata: JSON.stringify({ vttSessionID: sessionID }) });
    if(room) {
      try { await room.disconnect(); } catch(error) {}
    }
  }

  function removeRemoteAudio(sessionID) {
    for(const element of ui.audioRoot.querySelectorAll(`[data-voice-session="${sessionID}"]`))
      element.remove();
  }

  async function ensureAudioContext() {
    if(!state.audioContext)
      state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    if(state.audioContext.state == 'suspended')
      await state.audioContext.resume();
    if(!state.analyserFrame)
      state.analyserFrame = requestAnimationFrame(updateSpeaking);
  }

  function monitorStream(sessionID, stream) {
    if(!sessionID || !stream || !state.audioContext)
      return;
    stopMonitor(sessionID);
    try {
      const source = state.audioContext.createMediaStreamSource(stream);
      const analyser = state.audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      state.analysers.set(Number(sessionID), { source, analyser, buffer: new Uint8Array(analyser.fftSize) });
    } catch(error) {
      console.warn('Could not monitor voice activity.', error);
    }
  }

  function stopMonitor(sessionID) {
    const monitor = state.analysers.get(Number(sessionID));
    if(monitor) {
      try { monitor.source.disconnect(); } catch(error) {}
      try { monitor.analyser.disconnect(); } catch(error) {}
    }
    state.analysers.delete(Number(sessionID));
    updateSpeakingRow(Number(sessionID), false);
  }

  function clearAnalysers() {
    for(const sessionID of [ ...state.analysers.keys() ])
      stopMonitor(sessionID);
    if(state.analyserFrame)
      cancelAnimationFrame(state.analyserFrame);
    state.analyserFrame = null;
  }

  function updateSpeaking() {
    for(const [ sessionID, monitor ] of state.analysers) {
      monitor.analyser.getByteTimeDomainData(monitor.buffer);
      let sum = 0;
      for(const value of monitor.buffer) {
        const sample = (value - 128) / 128;
        sum += sample * sample;
      }
      const rms = Math.sqrt(sum / monitor.buffer.length);
      updateSpeakingRow(sessionID, rms > 0.028);
    }
    state.analyserFrame = requestAnimationFrame(updateSpeaking);
  }

  function updateSpeakingRow(sessionID, speaking) {
    const row = ui.participants.querySelector(`[data-session-id="${sessionID}"]`);
    row?.classList.toggle('speaking', speaking);
  }

  function updateUI() {
    const server = state.server;
    const joined = !!server?.joined && !!state.localStream && state.joinIntent;
    ui.join.textContent = joined ? 'Leave voice' : 'Join voice';
    ui.join.disabled = !server?.enabled;
    ui.mic.disabled = !joined;
    ui.mic.textContent = state.muted ? 'Unmute mic' : 'Mute mic';
    ui.mic.classList.toggle('muted', state.muted);
    ui.input.disabled = !joined;

    ui.mode.value = server?.modeOverride || 'auto';
    ui.mode.disabled = !server?.enabled || !server?.canControlMode;
    const sfuOption = ui.mode.querySelector('option[value="sfu"]');
    if(sfuOption)
      sfuOption.disabled = !server?.sfuAvailable;
    ui.mode.title = server?.canControlMode ? 'Choose the route for this room.' : 'Only the configured room host can change the route.';

    const effectiveMode = server?.effectiveMode || 'off';
    ui.routeBadge.textContent = routeLabel(effectiveMode);
    ui.routeBadge.dataset.mode = effectiveMode;
    renderParticipants();
  }

  function renderParticipants() {
    const participants = state.server?.participants || [];
    const speaking = new Set([ ...ui.participants.querySelectorAll('.voiceParticipant.speaking') ].map(row=>Number(row.dataset.sessionId)));
    ui.participants.replaceChildren();
    if(!participants.length) {
      const empty = document.createElement('div');
      empty.className = 'voiceEmpty';
      empty.textContent = 'Nobody has joined voice.';
      ui.participants.appendChild(empty);
      return;
    }

    for(const participant of participants) {
      const sessionID = Number(participant.sessionID);
      const row = document.createElement('div');
      row.className = 'voiceParticipant';
      row.dataset.sessionId = String(sessionID);
      if(speaking.has(sessionID))
        row.classList.add('speaking');

      const dot = document.createElement('span');
      dot.className = 'voiceSpeakingDot';
      dot.setAttribute('aria-hidden', 'true');
      row.appendChild(dot);

      const name = document.createElement('span');
      name.className = 'voiceParticipantName';
      name.textContent = participant.player + (sessionID === state.currentSessionID ? ' (you)' : '');
      row.appendChild(name);

      if(sessionID === state.currentSessionID) {
        const localState = document.createElement('span');
        localState.className = 'voiceLocalState';
        localState.textContent = state.muted ? 'muted' : 'mic on';
        row.appendChild(localState);
      } else {
        const mute = document.createElement('button');
        mute.type = 'button';
        mute.className = 'voicePeerMute';
        mute.textContent = state.locallyMuted.has(sessionID) ? '🔇' : '🔊';
        mute.title = state.locallyMuted.has(sessionID) ? `Unmute ${participant.player}` : `Mute ${participant.player}`;
        mute.addEventListener('click', ()=>{
          if(state.locallyMuted.has(sessionID)) state.locallyMuted.delete(sessionID); else state.locallyMuted.add(sessionID);
          applyVolume(sessionID);
          updateUI();
        });
        row.appendChild(mute);

        const volume = document.createElement('input');
        volume.type = 'range';
        volume.min = '0';
        volume.max = '100';
        volume.value = String(state.volumes.get(sessionID) ?? 100);
        volume.className = 'voicePeerVolume';
        volume.title = `Volume for ${participant.player}`;
        volume.setAttribute('aria-label', `Volume for ${participant.player}`);
        volume.addEventListener('input', ()=>{
          state.volumes.set(sessionID, Number(volume.value));
          if(Number(volume.value) > 0)
            state.locallyMuted.delete(sessionID);
          applyVolume(sessionID);
        });
        row.appendChild(volume);
      }
      ui.participants.appendChild(row);
    }
  }

  function applyVolume(sessionID) {
    const muted = state.locallyMuted.has(Number(sessionID));
    const volume = muted ? 0 : (state.volumes.get(Number(sessionID)) ?? 100) / 100;
    for(const element of ui.audioRoot.querySelectorAll(`[data-voice-session="${sessionID}"]`)) {
      element.muted = muted;
      element.volume = Math.max(0, Math.min(1, volume));
    }
  }

  function routeLabel(mode) {
    if(mode == 'p2p') return 'P2P';
    if(mode == 'sfu') return 'SFU';
    return 'Off';
  }

  function setStatus(message, error = false) {
    state.lastStatus = message;
    ui.status.textContent = message;
    ui.status.classList.toggle('error', error);
  }
}
