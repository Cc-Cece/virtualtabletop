const transport = window.vttClientActivityTransport;
const EVENT_NAME = 'vtt-client-activity';
const STYLE_ID = 'clientActivityStyles';
const ACTIVE_REFRESH_INTERVAL_MS = 250;

const activeBySource = new Map();
let refreshTimer = null;
let refreshFrame = null;

if(!transport) {
  console.warn('Client activity module loaded without VTT activity transport bridge.');
} else {
  installStyles();
  installDomObserver();
  document.addEventListener(EVENT_NAME, event=>applyActivity(event.detail));

  window.vttClientActivity = Object.freeze({
    publish: detail=>document.dispatchEvent(new CustomEvent(EVENT_NAME, { detail })),
    refresh: ()=>refreshIndicators()
  });

  scheduleRefresh();
}

function installStyles() {
  if(document.getElementById(STYLE_ID))
    return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    [data-vtt-client-activity-indicator="true"][data-vtt-client-activity-active="false"] {
      display: none !important;
    }
    body:not(.edit) .widget.hidden[data-vtt-client-activity-indicator="true"][data-vtt-client-activity-active="true"],
    [data-vtt-client-activity-indicator="true"][data-vtt-client-activity-active="true"] {
      display: block !important;
    }
  `;
  document.head.appendChild(style);
}

function installDomObserver() {
  const observe = () => {
    if(!document.body)
      return;
    const observer = new MutationObserver(()=>scheduleRefresh());
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  };

  if(document.body)
    observe();
  else
    document.addEventListener('DOMContentLoaded', observe, { once: true });
}

function normalizeActivity(detail) {
  if(!detail || typeof detail != 'object' || Array.isArray(detail))
    return null;
  const source = typeof detail.source == 'string' ? detail.source.trim() : '';
  const subject = detail.subject == null ? 'player' : String(detail.subject).trim();
  const player = typeof detail.player == 'string' ? detail.player.trim() : '';
  const sessionID = Number(detail.sessionID);
  if(!source || subject != 'player' || !player || typeof detail.active != 'boolean')
    return null;
  return {
    source: source.slice(0, 128),
    subject: 'player',
    player: player.slice(0, 256),
    sessionID: Number.isSafeInteger(sessionID) && sessionID > 0 ? sessionID : null,
    active: detail.active
  };
}

function sessionKey(activity) {
  return activity.sessionID == null ? 'player' : `session:${activity.sessionID}`;
}

function sourcePlayers(source, create = false) {
  let players = activeBySource.get(source);
  if(!players && create) {
    players = new Map();
    activeBySource.set(source, players);
  }
  return players;
}

function applyActivity(detail) {
  const activity = normalizeActivity(detail);
  if(!activity)
    return;

  const players = sourcePlayers(activity.source, activity.active);
  if(!players) {
    scheduleRefresh();
    return;
  }

  let sessions = players.get(activity.player);
  if(activity.active) {
    if(!sessions) {
      sessions = new Set();
      players.set(activity.player, sessions);
    }
    sessions.add(sessionKey(activity));
  } else if(sessions) {
    if(activity.sessionID == null)
      sessions.clear();
    else
      sessions.delete(sessionKey(activity));
    if(!sessions.size)
      players.delete(activity.player);
  }

  if(!players.size)
    activeBySource.delete(activity.source);

  updateActiveRefreshTimer();
  scheduleRefresh();
}

function playerIsActive(source, player) {
  if(!source || !player)
    return false;
  return (sourcePlayers(source)?.get(player)?.size || 0) > 0;
}

function refreshIndicators() {
  if(!transport)
    return;
  for(const indicator of transport.indicators()) {
    const valid = indicator
      && typeof indicator.id == 'string'
      && typeof indicator.source == 'string'
      && indicator.source
      && typeof indicator.playerWidget == 'string'
      && indicator.playerWidget;
    const active = !!valid
      && typeof indicator.player == 'string'
      && indicator.player
      && playerIsActive(indicator.source, indicator.player);
    if(indicator?.id)
      transport.setIndicatorActive(indicator.id, active);
  }
}

function scheduleRefresh() {
  if(refreshFrame != null)
    return;
  const schedule = typeof requestAnimationFrame == 'function'
    ? requestAnimationFrame
    : callback=>setTimeout(callback, 0);
  refreshFrame = schedule(()=>{
    refreshFrame = null;
    refreshIndicators();
  });
}

function updateActiveRefreshTimer() {
  if(activeBySource.size && refreshTimer == null) {
    refreshTimer = setInterval(refreshIndicators, ACTIVE_REFRESH_INTERVAL_MS);
  } else if(!activeBySource.size && refreshTimer != null) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}
