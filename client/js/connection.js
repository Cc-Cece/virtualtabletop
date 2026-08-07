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

// Voice is implemented as a separately loaded browser module so the core VTT bundle does not
// depend on WebRTC or LiveKit. This bridge deliberately exposes only the existing message bus.
// No game state or private widget data is made available to the voice module.
if(typeof window != 'undefined') {
  window.vttVoiceTransport = {
    onMessage,
    toServer,
    lastMessage: func=>lastMessages[func],
    isOpen: ()=>connection?.readyState === WebSocket.OPEN
  };
  if(!document.getElementById('voiceModule')) {
    const voiceModule = document.createElement('script');
    voiceModule.id = 'voiceModule';
    voiceModule.type = 'module';
    voiceModule.src = new URL('js/voice.js', document.baseURI).href;
    voiceModule.onerror = error=>console.error('Could not load voice module.', error);
    document.head.appendChild(voiceModule);
  }
}

window.onbeforeunload = function() {
  userNavigatedAway = true;
};
