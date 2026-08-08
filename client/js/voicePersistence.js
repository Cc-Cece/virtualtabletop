const transport = window.vttVoiceTransport;

if(!transport) {
  console.warn('Persistent voice module loaded without VTT transport bridge.');
} else {
  const STORAGE_PREFIX = 'vtt.voice.preferences:';
  const RESTORE_TIMEOUT_MS = 12000;
  const DEVICE_WAIT_MS = 1500;
  const state = {
    server: null,
    prefs: loadPreferences(),
    uiReady: false,
    restoreInFlight: false,
    restoreAttemptedForSession: null,
    restoreTimer: null,
    autoRestored: false,
    explicitLeave: false,
    syncingControls: false
  };

  installStyles();
  waitForVoiceUI().then(wireUI).catch(error=>console.warn('Could not initialize persistent voice UI.', error));
  transport.onMessage('sessionID', sessionID=>{
    const numeric = Number(sessionID) || null;
    if(numeric !== state.restoreAttemptedForSession) {
      state.restoreAttemptedForSession = null;
      state.restoreInFlight = false;
      clearRestoreTimer();
    }
  });
  transport.onMessage('voiceState', onVoiceState);
  transport.onMessage('voiceError', onVoiceError);

  const cachedVoiceState = transport.lastMessage && transport.lastMessage('voiceState');
  if(cachedVoiceState)
    onVoiceState(cachedVoiceState);

  function roomStorageKey() {
    const roomPath = location.pathname.replace(/\/+$/, '') || '/';
    return `${STORAGE_PREFIX}${location.origin}${roomPath}`;
  }

  function defaultPreferences() {
    return {
      joined: false,
      selfMuted: false,
      microphoneDeviceId: '',
      remoteMutedPlayers: {}
    };
  }

  function loadPreferences() {
    try {
      const value = JSON.parse(localStorage.getItem(roomStorageKey()) || 'null');
      if(!value || typeof value != 'object')
        return defaultPreferences();
      return {
        joined: value.joined === true,
        selfMuted: value.selfMuted === true,
        microphoneDeviceId: typeof value.microphoneDeviceId == 'string' ? value.microphoneDeviceId : '',
        remoteMutedPlayers: value.remoteMutedPlayers && typeof value.remoteMutedPlayers == 'object' && !Array.isArray(value.remoteMutedPlayers)
          ? { ...value.remoteMutedPlayers }
          : {}
      };
    } catch(error) {
      console.warn('Could not read saved voice preferences.', error);
      return defaultPreferences();
    }
  }

  function savePreferences() {
    try {
      localStorage.setItem(roomStorageKey(), JSON.stringify(state.prefs));
    } catch(error) {
      console.warn('Could not save voice preferences.', error);
    }
  }

  function installStyles() {
    if(document.getElementById('voicePersistenceStyles'))
      return;
    const link = document.createElement('link');
    link.id = 'voicePersistenceStyles';
    link.rel = 'stylesheet';
    link.href = new URL('css/voicePersistence.css', document.baseURI).href;
    document.head.appendChild(link);
  }

  function waitForVoiceUI() {
    return new Promise((resolve, reject)=>{
      const started = Date.now();
      const find = ()=>{
        const ui = {
          join: document.getElementById('voiceJoin'),
          mic: document.getElementById('voiceMic'),
          input: document.getElementById('voiceInput'),
          participants: document.getElementById('voiceParticipants')
        };
        if(ui.join && ui.mic && ui.input && ui.participants)
          return resolve(ui);
        if(Date.now() - started > 10000)
          return reject(new Error('Voice controls did not appear.'));
        setTimeout(find, 50);
      };
      find();
    });
  }

  function wireUI(ui) {
    state.ui = ui;
    state.uiReady = true;

    ui.join.addEventListener('click', event=>{
      if(state.syncingControls)
        return;
      const currentlyJoined = !!state.server?.joined || /leave voice/i.test(ui.join.textContent || '');
      if(currentlyJoined) {
        state.explicitLeave = true;
        state.prefs.joined = false;
        state.autoRestored = false;
        savePreferences();
        hideToast();
      } else if(event.isTrusted || !state.restoreInFlight) {
        // This also covers accepting a voice invitation, which reuses the normal Join Voice button.
        state.prefs.joined = true;
        state.explicitLeave = false;
        savePreferences();
      }
    }, true);

    ui.mic.addEventListener('click', ()=>{
      if(state.syncingControls)
        return;
      state.prefs.selfMuted = !state.prefs.selfMuted;
      savePreferences();
    }, true);

    ui.input.addEventListener('change', ()=>{
      if(state.syncingControls)
        return;
      state.prefs.microphoneDeviceId = ui.input.value || '';
      savePreferences();
    });

    ui.participants.addEventListener('click', event=>{
      if(state.syncingControls)
        return;
      const button = event.target.closest?.('.voicePeerMute');
      if(!button)
        return;
      const row = button.closest('.voiceParticipant');
      const sessionID = Number(row?.dataset.sessionId);
      const participant = (state.server?.participants || []).find(p=>Number(p.sessionID) === sessionID);
      if(!participant?.player)
        return;
      state.prefs.remoteMutedPlayers[participant.player] = !state.prefs.remoteMutedPlayers[participant.player];
      if(!state.prefs.remoteMutedPlayers[participant.player])
        delete state.prefs.remoteMutedPlayers[participant.player];
      savePreferences();
    }, true);

    ui.participants.addEventListener('input', event=>{
      if(state.syncingControls)
        return;
      const volume = event.target.closest?.('.voicePeerVolume');
      if(!volume || Number(volume.value) <= 0)
        return;
      const row = volume.closest('.voiceParticipant');
      const sessionID = Number(row?.dataset.sessionId);
      const participant = (state.server?.participants || []).find(p=>Number(p.sessionID) === sessionID);
      if(participant?.player && state.prefs.remoteMutedPlayers[participant.player]) {
        delete state.prefs.remoteMutedPlayers[participant.player];
        savePreferences();
      }
    });

    restoreDeviceSelection();
    syncSavedControls();
    maybeAutoRestore();
  }

  function onVoiceState(serverState) {
    if(!serverState || typeof serverState != 'object')
      return;
    const wasJoined = !!state.server?.joined;
    state.server = serverState;

    if(serverState.joined) {
      state.prefs.joined = true;
      state.explicitLeave = false;
      savePreferences();
      clearRestoreTimer();
      const restored = state.restoreInFlight;
      state.restoreInFlight = false;
      if(restored && !wasJoined && !state.autoRestored) {
        state.autoRestored = true;
        showToast('Voice reconnected automatically.', 'Your previous voice settings were restored.', 'Leave voice', leaveFromToast);
      }
    }

    if(state.uiReady) {
      restoreDeviceSelection();
      setTimeout(syncSavedControls, 0);
      maybeAutoRestore();
    }
  }

  function onVoiceError() {
    if(!state.restoreInFlight)
      return;
    state.restoreInFlight = false;
    clearRestoreTimer();
    showRestoreFailure();
  }

  function maybeAutoRestore() {
    if(!state.uiReady || !state.server?.enabled || state.server.joined || !state.prefs.joined || state.restoreInFlight)
      return;
    const sessionID = Number(state.server.selfSessionID) || null;
    if(sessionID && state.restoreAttemptedForSession === sessionID)
      return;

    state.restoreAttemptedForSession = sessionID;
    state.restoreInFlight = true;
    state.explicitLeave = false;

    waitForPreferredDevice().finally(()=>{
      const join = ()=>{
        if(!state.restoreInFlight)
          return;
        if(!state.ui?.join || state.ui.join.disabled) {
          setTimeout(join, 100);
          return;
        }
        state.syncingControls = true;
        try {
          state.ui.join.click();
        } finally {
          state.syncingControls = false;
        }
        clearRestoreTimer();
        state.restoreTimer = setTimeout(()=>{
          if(state.restoreInFlight && !state.server?.joined) {
            state.restoreInFlight = false;
            showRestoreFailure();
          }
        }, RESTORE_TIMEOUT_MS);
      };
      join();
    });
  }

  function waitForPreferredDevice() {
    const saved = state.prefs.microphoneDeviceId;
    if(!saved || !state.ui?.input)
      return Promise.resolve();
    const started = Date.now();
    return new Promise(resolve=>{
      const check = ()=>{
        if([ ...state.ui.input.options ].some(option=>option.value === saved)) {
          state.syncingControls = true;
          try { state.ui.input.value = saved; } finally { state.syncingControls = false; }
          return resolve();
        }
        if(Date.now() - started >= DEVICE_WAIT_MS)
          return resolve();
        setTimeout(check, 75);
      };
      check();
    });
  }

  function clearRestoreTimer() {
    clearTimeout(state.restoreTimer);
    state.restoreTimer = null;
  }

  function showRestoreFailure() {
    showToast('Voice could not reconnect automatically.', 'Your saved voice membership was kept.', 'Reconnect', ()=>{
      state.restoreAttemptedForSession = null;
      state.restoreInFlight = false;
      hideToast();
      maybeAutoRestore();
    });
  }

  function restoreDeviceSelection() {
    const input = state.ui?.input;
    const saved = state.prefs.microphoneDeviceId;
    if(!input || !saved)
      return;
    if([ ...input.options ].some(option=>option.value === saved)) {
      state.syncingControls = true;
      try { input.value = saved; } finally { state.syncingControls = false; }
    }
  }

  function syncSavedControls() {
    if(!state.uiReady || !state.server?.joined)
      return;

    state.syncingControls = true;
    try {
      // Preserve the user's own mute preference. The existing voice module owns the media track;
      // this module drives its normal mute control rather than revoking browser microphone permission
      // or creating a parallel audio path.
      const micShowsMuted = /unmute mic/i.test(state.ui.mic.textContent || '');
      if(state.prefs.selfMuted !== micShowsMuted && !state.ui.mic.disabled)
        state.ui.mic.click();

      for(const row of state.ui.participants.querySelectorAll('.voiceParticipant')) {
        const sessionID = Number(row.dataset.sessionId);
        if(!sessionID || sessionID === Number(state.server.selfSessionID))
          continue;
        const participant = (state.server.participants || []).find(p=>Number(p.sessionID) === sessionID);
        const mute = row.querySelector('.voicePeerMute');
        if(!participant?.player || !mute)
          continue;
        const wantsMuted = state.prefs.remoteMutedPlayers[participant.player] === true;
        const currentlyMuted = mute.textContent?.includes('🔇') || /^unmute /i.test(mute.title || '');
        if(wantsMuted !== currentlyMuted)
          mute.click();
      }
    } finally {
      state.syncingControls = false;
    }
  }

  function leaveFromToast() {
    state.prefs.joined = false;
    state.explicitLeave = true;
    savePreferences();
    hideToast();
    if(state.server?.joined && state.ui?.join && !state.ui.join.disabled)
      state.ui.join.click();
  }

  function ensureToast() {
    let root = document.getElementById('voiceRestoreToast');
    if(root)
      return root;
    root = document.createElement('aside');
    root.id = 'voiceRestoreToast';
    root.className = 'voiceRestoreToast voiceRestoreToastHidden';
    root.setAttribute('role', 'status');
    root.setAttribute('aria-live', 'polite');
    root.innerHTML = `
      <i class="material-symbols">mic</i>
      <div class="voiceRestoreToastText">
        <strong></strong>
        <span></span>
      </div>
      <button type="button"></button>
    `;
    document.body.appendChild(root);
    return root;
  }

  function showToast(title, text, actionLabel, action) {
    const toast = ensureToast();
    toast.querySelector('strong').textContent = title;
    toast.querySelector('.voiceRestoreToastText span').textContent = text;
    const button = toast.querySelector('button');
    button.textContent = actionLabel;
    button.onclick = action;
    toast.classList.remove('voiceRestoreToastHidden');
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(()=>hideToast(), 7000);
  }

  function hideToast() {
    const toast = document.getElementById('voiceRestoreToast');
    if(!toast)
      return;
    toast.classList.add('voiceRestoreToastHidden');
    clearTimeout(toast._hideTimer);
  }
}
