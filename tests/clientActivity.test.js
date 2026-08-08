import fs from 'fs';
import path from 'path';

const connectionSource = fs.readFileSync(path.join(process.cwd(), 'client/js/connection.js'), 'utf8');
const activitySource = fs.readFileSync(path.join(process.cwd(), 'client/js/clientActivity.js'), 'utf8');
const voiceActivitySource = fs.readFileSync(path.join(process.cwd(), 'client/js/voiceSpeakingActivity.js'), 'utf8');
const layoutSource = fs.readFileSync(path.join(process.cwd(), 'client/css/layout.css'), 'utf8');

describe('client activity indicators', () => {
  test('loads a generic client activity layer and a separate voice adapter', () => {
    expect(connectionSource).toContain("loadClientModule('clientActivityModule', 'js/clientActivity.js'");
    expect(connectionSource).toContain("loadClientModule('voiceSpeakingActivityModule', 'js/voiceSpeakingActivity.js'");
    expect(connectionSource).toContain('window.vttClientActivityTransport');
    expect(connectionSource).toContain("widget.get('clientActivityIndicator')");
    expect(connectionSource).toContain("playerWidget.get('player')");
  });

  test('keeps activity transient and local to indicator DOM state', () => {
    expect(activitySource).toContain("const EVENT_NAME = 'vtt-client-activity';");
    expect(activitySource).toContain('transport.indicators()');
    expect(activitySource).toContain('playerIsActive(indicator.source, indicator.player)');
    expect(activitySource).toContain('data-vtt-client-activity-active');
    expect(activitySource).not.toContain("toServer('");
    expect(activitySource).not.toMatch(/sanguosha|player-module|play-phase/i);
  });

  test('lets an active indicator override the normal hidden widget rule', () => {
    expect(layoutSource).toContain('body:not(.edit) .widget.foreign, body:not(.edit) .widget.hidden');
    expect(activitySource).toContain(
      'body:not(.edit) .widget.hidden[data-vtt-client-activity-indicator="true"][data-vtt-client-activity-active="true"]'
    );
    expect(activitySource).toContain('display: block !important;');
  });

  test('aggregates player activity by session', () => {
    expect(activitySource).toContain("return activity.sessionID == null ? 'player' : `session:${activity.sessionID}`;");
    expect(activitySource).toContain('sessions.add(sessionKey(activity));');
    expect(activitySource).toContain('sessions.delete(sessionKey(activity));');
    expect(activitySource).toContain('sessions.clear();');
  });

  test('publishes smoothed voice speaking activity without game semantics', () => {
    expect(voiceActivitySource).toContain("const ACTIVITY_SOURCE = 'voice.speaking';");
    expect(voiceActivitySource).toContain('const RELEASE_DELAY_MS = 350;');
    expect(voiceActivitySource).toContain("transport.lastMessage?.('voiceState')");
    expect(voiceActivitySource).toContain("row.classList.contains('speaking')");
    expect(voiceActivitySource).toContain("row.querySelector('.voiceLocalState')");
    expect(voiceActivitySource).toContain("subject: 'player'");
    expect(voiceActivitySource).not.toContain("toServer('");
    expect(voiceActivitySource).not.toMatch(/sanguosha|player-module|play-phase/i);
  });
});
