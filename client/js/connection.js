let lastTimeout = 1000;
let lastOverlay = null;
let connection;
let serverStart = null;
let userNavigatedAway = false;
let messageCallbacks = {};
let lastMessages = {};

//used by unit tests until jest supports mocking ESM static imports
export function mockConnection() {
  connection = {
    readyState: false
  }
}

export function startWebSocket() {
  let url = location.href.replace(/\/[^\/]*$/, '').replace(/^http/, 'ws');
  console.log(`connecting to ${url}`);
  connection = new WebSocket(url);

  connection.onopen = () => {
    showOverlay(null, true);
    showOverlay(lastOverlay);
    if(!urlProperties.askID) {
      toServer('room', { playerName, roomID });
      if(urlProperties.trace)
        toServer('enableTrace');
    }
  };

  connection.onerror = (error) => {
    console.log(`WebSocket error: ${error}`);
  };

  connection.onclose = () => {
    console.log(`WebSocket closed`);
    if(!userNavigatedAway) {
      lastOverlay = [...$a('.overlay')].filter(d=>d.style.display!='none').map(d=>d.id)[0] || null;
      showOverlay('connectionLostOverlay', true);
    }
    if(lastTimeout)
      setTimeout(startWebSocket, lastTimeout *= 2);
  };

  connection.onmessage = (e) => {
    let func, args;
    try {
      ({ func, args } = JSON.parse(e.data));
    } catch(error) {
      // A message that fails to parse was corrupted or truncated in transit
      // (some browsers occasionally deliver incomplete WebSocket frames).
      // Instead of crashing the whole client with an uncaught error, drop the
      // connection so the existing reconnect logic re-syncs the full room state.
      console.error('Could not parse message from server. Reconnecting.', error);
      connection.close();
      return;
    }

    lastMessages[func] = args;

    if(func == 'serverStart') {
      if(serverStart != null && serverStart != args) {
        console.log('Server restart detected. Reloading...')
        setTimeout(location.reload, rand()*10000);
        showOverlay('connectionLostOverlay', true);
        preventReconnect();
        connection.close();
      }
      serverStart = args;
    }

    for(const callback of (messageCallbacks[func] || []))
      callback(args);
  };
}

function onMessage(func, callback) {
  if(!messageCallbacks[func])
    messageCallbacks[func] = [];
  messageCallbacks[func].push(callback);
}

export function toServer(func, args) {
  if(connection.readyState === WebSocket.OPEN)
    connection.send(JSON.stringify({ func, args }));
}

function preventReconnect() {
  lastTimeout = null;
  userNavigatedAway = true;
}

function log(str) {
  toServer('trace', str);
}

function clientActivityIndicators() {
  const indicators = [];
  for(const widget of widgets.values()) {
    const config = widget.get('clientActivityIndicator');
    if(!config || typeof config != 'object' || Array.isArray(config))
      continue;
    const source = typeof config.source == 'string' ? config.source.trim() : '';
    const playerWidgetID = typeof config.playerWidget == 'string' ? config.playerWidget.trim() : '';
    const playerWidget = playerWidgetID ? widgets.get(playerWidgetID) : null;
    indicators.push({
      id: widget.id,
      source,
      playerWidget: playerWidgetID,
      player: playerWidget && typeof playerWidget.get('player') == 'string' ? playerWidget.get('player') : ''
    });
  }
  return indicators;
}

function setClientActivityIndicator(id, active) {
  const widget = widgets.get(id);
  if(!widget)
    return;
  widget.domElement.dataset.vttClientActivityIndicator = 'true';
  widget.domElement.dataset.vttClientActivityActive = active ? 'true' : 'false';
}

function loadClientModule(id, path, description) {
  if(document.getElementById(id))
    return;
  const module = document.createElement('script');
  module.id = id;
  module.type = 'module';
  module.src = new URL(path, document.baseURI).href;
  module.onerror = error=>console.error(`Could not load ${description}.`, error);
  document.head.appendChild(module);
}

// Voice is implemented as separately loaded browser modules so the core VTT bundle does not
// depend on WebRTC or LiveKit. The voice bridge deliberately exposes only the existing message
// bus. A second narrow bridge lets generic client-only activity indicators resolve their declared
// player widget and toggle only the indicator DOM node; it does not expose arbitrary game state.
if(typeof window != 'undefined') {
  window.vttVoiceTransport = {
    onMessage,
    toServer,
    lastMessage: func=>lastMessages[func],
    isOpen: ()=>connection?.readyState === WebSocket.OPEN
  };
  window.vttClientActivityTransport = {
    indicators: clientActivityIndicators,
    setIndicatorActive: setClientActivityIndicator
  };

  loadClientModule('clientActivityModule', 'js/clientActivity.js', 'client activity module');
  loadClientModule('voiceModule', 'js/voice.js', 'voice module');
  loadClientModule('voicePersistenceModule', 'js/voicePersistence.js', 'persistent voice state module');
  loadClientModule('voiceInviteModule', 'js/voiceInvite.js', 'voice invitation module');
  loadClientModule('voiceSpeakingActivityModule', 'js/voiceSpeakingActivity.js', 'voice speaking activity adapter');
}

window.onbeforeunload = function() {
  userNavigatedAway = true;
};