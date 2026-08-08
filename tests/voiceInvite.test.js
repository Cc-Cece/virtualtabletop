import fs from 'fs';
import path from 'path';

const root = process.cwd();
const connectionSource = fs.readFileSync(path.join(root, 'client/js/connection.js'), 'utf8');
const inviteSource = fs.readFileSync(path.join(root, 'client/js/voiceInvite.js'), 'utf8');
const serverSource = fs.readFileSync(path.join(root, 'server/voice.mjs'), 'utf8');

describe('voice invitation client integration', () => {
  test('loads invitations as a separate voice module', () => {
    expect(connectionSource).toContain("loadClientModule('voiceInviteModule', 'js/voiceInvite.js', 'voice invitation module')");
    expect(inviteSource).toContain("transport.onMessage('voiceInvite', onInvite)");
    expect(inviteSource).toContain("transport.onMessage('voiceInviteStatus', onInviteStatus)");
  });

  test('integrates invitations into the existing Players overlay and normal Join Voice action', () => {
    expect(inviteSource).toContain("document.getElementById('playersTable')");
    expect(inviteSource).toContain("document.getElementById('voiceJoin')");
    expect(inviteSource).toContain("transport.toServer('voiceInvite', { targetPlayer })");
    expect(inviteSource).toContain("transport.toServer('voiceInviteResponse'");
  });

  test('does not add game-package or LiveKit-specific invitation behavior', () => {
    expect(inviteSource).not.toMatch(/sanguosha|seat-\d|player-module/i);
    expect(inviteSource).not.toMatch(/LiveKit|RTCPeerConnection|getUserMedia/);
    expect(serverSource).not.toMatch(/sanguosha|seat-\d|player-module/i);
  });

  test('keeps invitations transient instead of writing them into room state', () => {
    expect(serverSource).toContain('this.pendingInvites = new Map()');
    expect(serverSource).not.toMatch(/state\?\.voiceInvite|state\.voiceInvite|room\.state\.voiceInvite/);
    expect(serverSource).toContain('VOICE_INVITE_TTL_MS = 30000');
    expect(serverSource).toContain('VOICE_INVITE_PAIR_COOLDOWN_MS = 10000');
  });
});
