import { getAdminPanels, inspectHolder, physicalOrderKey } from './admin/roomInspector.js';

const roomInput = document.querySelector('#room-id');
const connectButton = document.querySelector('#connect-room');
const statusNode = document.querySelector('#connection-status');
const roomSummary = document.querySelector('#room-summary');
const panelsRoot = document.querySelector('#admin-panels');

class PollingRoomStateSource {
  constructor(roomID, onState, onError, interval = 750) {
    this.roomID = roomID;
    this.onState = onState;
    this.onError = onError;
    this.interval = interval;
    this.timer = null;
    this.stopped = false;
    this.inFlight = false;
  }

  stateURL() {
    const base = new URL('.', location.href);
    return new URL(`state/${encodeURIComponent(this.roomID)}`, base);
  }

  async poll() {
    if(this.stopped || this.inFlight)
      return;
    this.inFlight = true;
    try {
      const response = await fetch(this.stateURL(), { cache: 'no-store' });
      if(!response.ok)
        throw new Error(`HTTP ${response.status}`);
      this.onState(await response.json());
    } catch(error) {
      this.onError(error);
    } finally {
      this.inFlight = false;
    }
  }

  start() {
    this.stopped = false;
    this.poll();
    this.timer = setInterval(() => this.poll(), this.interval);
  }

  stop() {
    this.stopped = true;
    if(this.timer)
      clearInterval(this.timer);
    this.timer = null;
  }
}

let source = null;
let renderVersion = 0;

function text(tag, value, className) {
  const node = document.createElement(tag);
  if(className)
    node.className = className;
  node.textContent = value;
  return node;
}

async function shortHash(value) {
  if(!globalThis.crypto?.subtle)
    return 'unavailable';
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

function renderOverview(state) {
  const widgetCount = Object.keys(state || {}).filter(id => id != '_meta').length;
  const values = [
    ['Room', roomInput.value.trim() || '—'],
    ['Widgets', String(widgetCount)],
    ['State version', String(state?._meta?.version ?? '—')],
  ];

  roomSummary.replaceChildren();
  for(const [label, value] of values) {
    const item = document.createElement('div');
    item.className = 'summary-item';
    item.append(text('span', label, 'summary-label'), text('strong', value));
    roomSummary.append(item);
  }
}

function cardDetail(card) {
  const sourceBits = [];
  if(card.metadata.sourceSequence != null)
    sourceBits.push(`#${card.metadata.sourceSequence}`);
  if(card.metadata.sourceCardId)
    sourceBits.push(String(card.metadata.sourceCardId));
  return sourceBits.join(' · ');
}

async function renderHolderPanel(panel, state, version) {
  const section = document.createElement('section');
  section.className = 'panel';
  section.append(text('h2', panel.title || panel.holder || 'Holder'));

  const inspection = inspectHolder(state, panel.holder);
  if(!inspection) {
    section.append(text('p', `Holder not found: ${panel.holder}`, 'warning'));
    return section;
  }

  const stats = document.createElement('div');
  stats.className = 'stats';
  for(const [label, value] of [
    ['Physical cards', inspection.physicalCardCount],
    ['Direct cards', inspection.directCardCount],
    ['Direct piles', inspection.directPileCount],
    ['Nested piles', inspection.pileCount],
    ['Ignored direct objects', inspection.ignoredDirectObjectCount],
  ]) {
    const item = document.createElement('div');
    item.className = 'stat';
    item.append(text('span', label), text('strong', String(value)));
    stats.append(item);
  }
  section.append(stats);

  const orderKey = physicalOrderKey(inspection);
  const hash = await shortHash(orderKey);
  if(version != renderVersion)
    return null;
  section.append(text('p', `Order SHA-256: ${hash}`, 'order-hash'));

  const details = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = `Show top → bottom order (${inspection.physicalCardCount})`;
  details.append(summary);

  const tableWrap = document.createElement('div');
  tableWrap.className = 'table-wrap';
  const table = document.createElement('table');
  const head = document.createElement('thead');
  const headRow = document.createElement('tr');
  for(const heading of ['#', 'Widget', 'Card', 'Source', 'z', 'Parent / pile'])
    headRow.append(text('th', heading));
  head.append(headRow);
  table.append(head);

  const body = document.createElement('tbody');
  inspection.cards.forEach((card, index) => {
    const row = document.createElement('tr');
    const parentPath = [...card.ancestry, card.widget.parent].filter(Boolean).join(' → ');
    const values = [
      String(index + 1),
      card.id,
      card.label,
      cardDetail(card),
      String(card.widget.z ?? 0),
      parentPath,
    ];
    for(const value of values)
      row.append(text('td', value));
    body.append(row);
  });
  table.append(body);
  tableWrap.append(table);
  details.append(tableWrap);
  section.append(details);
  return section;
}

async function renderState(state) {
  const version = ++renderVersion;
  renderOverview(state);
  statusNode.textContent = `Live · ${new Date().toLocaleTimeString()}`;
  statusNode.dataset.state = 'ok';

  const panels = getAdminPanels(state);
  const nextPanels = [];
  for(const panel of panels) {
    if(panel.type == 'holderInspector') {
      const rendered = await renderHolderPanel(panel, state, version);
      if(rendered)
        nextPanels.push(rendered);
    }
  }
  if(version != renderVersion)
    return;

  if(!nextPanels.length)
    nextPanels.push(text('p', 'This game does not declare any supported admin panels.', 'empty'));
  panelsRoot.replaceChildren(...nextPanels);
}

function connect() {
  const roomID = roomInput.value.trim();
  if(!roomID)
    return;

  const url = new URL(location.href);
  url.searchParams.set('room', roomID);
  history.replaceState(null, '', url);

  if(source)
    source.stop();
  statusNode.textContent = 'Connecting…';
  statusNode.dataset.state = 'pending';
  source = new PollingRoomStateSource(
    roomID,
    state => renderState(state),
    error => {
      statusNode.textContent = `Unavailable · ${error.message}`;
      statusNode.dataset.state = 'error';
    },
  );
  source.start();
}

const initialRoom = new URL(location.href).searchParams.get('room') || '';
roomInput.value = initialRoom;
connectButton.addEventListener('click', connect);
roomInput.addEventListener('keydown', event => {
  if(event.key == 'Enter')
    connect();
});
if(initialRoom)
  connect();
