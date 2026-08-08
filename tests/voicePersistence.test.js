import fs from 'fs';
import path from 'path';

const root = process.cwd();
const connectionSource = fs.readFileSync(path.join(root, 'client/js/connection.js'), 'utf8');
const persistenceSource = fs.readFileSync(path.join(root, 'client/js/voicePersistence.js'), 'utf8');
const serverSource = fs.readFileSync(path.join(root, 'server/voice.mjs'), 'utf8');

describe('persistent voice state', () => {
  test('loads persistence as a separate client voice module', () => {
    expect(connectionSource).toContain("loadClientModule('voicePersistenceModule', 'js/voicePersistence.js', 'persistent voice state module')");
  });

  test('persists room-scoped membership, self mute, microphone and per-player mute preferences', () => {
    expect(persistenceSource).toContain("const STORAGE_PREFIX = 'vtt.voice.preferences:'");
    expect(persistenceSource).toContain("location.pathname");
    expect(persistenceSource).toContain('joined: false');
    expect(persistenceSource).toContain('selfMuted: false');
    expect(persistenceSource).toContain("microphoneDeviceId: ''");
    expect(persistenceSource).toContain('remoteMutedPlayers: {}');
    expect(persistenceSource).toContain('localStorage.setItem');
  });

  test('only explicit leave clears persistent membership while failures keep it', () => {
    expect(persistenceSource).toContain('state.prefs.joined = false');
    expect(persistenceSource).toContain("'Your saved voice membership was kept.'");
    expect(persistenceSource).not.toMatch(/voiceError[\s\S]{0,400}prefs\.joined\s*=\s*false/);
  });

  test('auto-restores through the existing Join Voice control and offers a non-blocking Leave action', () => {
    expect(persistenceSource).toContain('state.ui.join.click()');
    expect(persistenceSource).toContain("'Voice reconnected automatically.'");
    expect(persistenceSource).toContain("'Leave voice'");
    expect(persistenceSource).toContain('voiceRestoreToast');
  });

  test('reconnect grace is transient server presence rather than room state', () => {
    expect(serverSource).toContain('VOICE_RECONNECT_GRACE_MS = 8000');
    expect(serverSource).toContain('this.disconnectedPresence = new Map()');
    expect(serverSource).not.toMatch(/room\.state\.voicePresence|room\.state\.voiceJoined|state\?\.voiceJoined/);
  });
});
