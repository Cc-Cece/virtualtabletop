import voiceForRoom from '../../server/voice.mjs';

function makePlayer(name, sessionID) {
  return {
    name,
    sessionID,
    messages: [],
    send(func, args) {
      this.messages.push({ func, args });
    }
  };
}

function makeRoom(player, gameSettings = {}) {
  return {
    id: `voice-global-${player.sessionID}`,
    players: [ player ],
    state: {
      _meta: {
        gameSettings
      }
    }
  };
}

describe('server-wide voice availability', () => {
  test.each([
    [ 'without a game voice declaration', {} ],
    [ 'when the game explicitly disables voice', { voice: { enabled: false } } ]
  ])('%s', (_description, gameSettings) => {
    const alice = makePlayer('Alice', Math.floor(Math.random() * 1000000) + 1);
    const manager = voiceForRoom(makeRoom(alice, gameSettings));

    expect(manager.stateFor(alice).enabled).toBe(true);

    manager.handle(alice, 'voiceJoin', {});

    expect(manager.participants.has(alice)).toBe(true);
    expect(alice.messages.at(-1)).toMatchObject({
      func: 'voiceState',
      args: {
        enabled: true,
        joined: true
      }
    });
  });
});