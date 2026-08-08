const transport = window.vttVoiceTransport;
const ACTIVITY_SOURCE = 'voice.speaking';
const RELEASE_DELAY_MS = 350;
const sessions = new Map();
let panelObserver = null;
let waitingObserver = null;

if(!transport) {
  console.warn('Voice speaking activity adapter loaded without VTT voice transport bridge.');
} else {
  waitUntilReady();
}

function waitUntilReady() {
  if(!window.vttClientActivity?.publish || !document.body) {
    setTimeout(waitUntilReady, 50);
    return;
  }

  const panel = document.getElementById('voiceParticipants');
  if(panel) {
    attachPanel(panel);
    return;
  }

  if(waitingObserver)
    return;
  waitingObserver = new MutationObserver(()=>{
    const current = document.getElementById('voiceParticipants');
    if(!current)
      return;
    waitingObserver.disconnect();
    waitingObserver = null;
    attachPanel(current);
  });
  waitingObserver.observe(document.body, { childList: true, subtree: true });
}

function attachPanel(panel) {
  panelObserver?.disconnect();
  panelObserver = new MutationObserver(()=>syncSpeakingRows());
  panelObserver.observe(panel, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: [ 'class' ]
  });
  syncSpeakingRows();
}

function participantMap() {
  const state = transport.lastMessage?.('voiceState');
  const participants = new Map();
  for(const participant of state?.participants || []) {
    const sessionID = Number(participant?.sessionID);
    if(Number.isSafeInteger(sessionID) && sessionID > 0 && typeof participant?.player == 'string' && participant.player)
      participants.set(sessionID, participant.player);
  }
  return {
    participants,
    selfSessionID: Number(state?.selfSessionID) || null
  };
}

function publish(sessionID, player, active) {
  window.vttClientActivity?.publish({
    source: ACTIVITY_SOURCE,
    subject: 'player',
    player,
    sessionID,
    active
  });
}

function setSessionSpeaking(sessionID, player, detected, immediate = false) {
  let entry = sessions.get(sessionID);
  if(!entry) {
    entry = { player, active: false, releaseTimer: null };
    sessions.set(sessionID, entry);
  }

  if(entry.player !== player) {
    if(entry.releaseTimer)
      clearTimeout(entry.releaseTimer);
    if(entry.active && entry.player)
      publish(sessionID, entry.player, false);
    entry.player = player;
    entry.active = false;
    entry.releaseTimer = null;
  }

  if(detected) {
    if(entry.releaseTimer) {
      clearTimeout(entry.releaseTimer);
      entry.releaseTimer = null;
    }
    if(!entry.active) {
      entry.active = true;
      publish(sessionID, player, true);
    }
    return;
  }

  if(entry.releaseTimer) {
    clearTimeout(entry.releaseTimer);
    entry.releaseTimer = null;
  }

  if(!entry.active)
    return;

  if(immediate) {
    entry.active = false;
    publish(sessionID, player, false);
    return;
  }

  entry.releaseTimer = setTimeout(()=>{
    entry.releaseTimer = null;
    if(!entry.active)
      return;
    entry.active = false;
    publish(sessionID, entry.player, false);
  }, RELEASE_DELAY_MS);
}

function forgetSession(sessionID) {
  const entry = sessions.get(sessionID);
  if(!entry)
    return;
  if(entry.releaseTimer)
    clearTimeout(entry.releaseTimer);
  if(entry.active && entry.player)
    publish(sessionID, entry.player, false);
  sessions.delete(sessionID);
}

function syncSpeakingRows() {
  const panel = document.getElementById('voiceParticipants');
  if(!panel)
    return;

  const { participants, selfSessionID } = participantMap();
  const seen = new Set();

  for(const row of panel.querySelectorAll('.voiceParticipant[data-session-id]')) {
    const sessionID = Number(row.dataset.sessionId);
    const player = participants.get(sessionID);
    if(!Number.isSafeInteger(sessionID) || !player)
      continue;

    seen.add(sessionID);
    const locallyMuted = sessionID === selfSessionID
      && row.querySelector('.voiceLocalState')?.textContent?.trim().toLowerCase() === 'muted';
    const detected = row.classList.contains('speaking') && !locallyMuted;
    setSessionSpeaking(sessionID, player, detected, locallyMuted);
  }

  for(const sessionID of [ ...sessions.keys() ])
    if(!participants.has(sessionID) || !seen.has(sessionID))
      forgetSession(sessionID);
}
