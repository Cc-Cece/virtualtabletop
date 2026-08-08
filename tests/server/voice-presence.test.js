import { jest } from '@jest/globals';

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

function makeRoom(players) {
  return {
    id: 'voice-presence-test',
    players,
    state: {
      _meta: {
        gameSettings: {
          voice: {
            enabled: true,
            p2pMaxParticipants: 4
          }
        }
      }
    }
  };
}

function messages(player, func) {
  return player.messages.filter(message=>message.func == func).map(message=>message.args);
}

describe('voice reconnect presence grace', () => {
  afterEach(() => jest.useRealTimers());

  test('a disconnected participant remains visible for eight seconds without a leave broadcast', () => {
    jest.useFakeTimers();
    const alice = makePlayer('Alice', 1);
    const bob = makePlayer('Bob', 2);
    const room = makeRoom([ alice, bob ]);
    const manager = voiceForRoom(room);
    manager.handle(alice, 'voiceJoin', {});
    alice.messages.length = bob.messages.length = 0;

    manager.disconnect(alice);
    room.players = [ bob ];

    expect(manager.participants.has(alice)).toBe(false);
    expect(manager.stateFor(bob).participants).toContainEqual({ sessionID: 1, player: 'Alice' });
    expect(messages(bob, 'voiceState')).toHaveLength(0);

    jest.advanceTimersByTime(7999);
    expect(manager.stateFor(bob).participants).toContainEqual({ sessionID: 1, player: 'Alice' });
    expect(messages(bob, 'voiceState')).toHaveLength(0);

    jest.advanceTimersByTime(1);
    expect(manager.stateFor(bob).participants).not.toContainEqual({ sessionID: 1, player: 'Alice' });
    expect(messages(bob, 'voiceState')).toHaveLength(1);
  });

  test('rejoining during grace replaces the old session without an intermediate visible leave', () => {
    jest.useFakeTimers();
    const alice = makePlayer('Alice', 1);
    const bob = makePlayer('Bob', 2);
    const room = makeRoom([ alice, bob ]);
    const manager = voiceForRoom(room);
    manager.handle(alice, 'voiceJoin', {});
    alice.messages.length = bob.messages.length = 0;

    manager.disconnect(alice);
    const reloadedAlice = makePlayer('Alice', 3);
    room.players = [ reloadedAlice, bob ];
    manager.handle(reloadedAlice, 'voiceJoin', {});

    const participants = manager.stateFor(bob).participants;
    expect(participants).toContainEqual({ sessionID: 3, player: 'Alice' });
    expect(participants).not.toContainEqual({ sessionID: 1, player: 'Alice' });
    expect(manager.participants.has(reloadedAlice)).toBe(true);

    jest.advanceTimersByTime(8000);
    expect(manager.stateFor(bob).participants).toContainEqual({ sessionID: 3, player: 'Alice' });
  });

  test('explicit Leave Voice bypasses reconnect grace', () => {
    jest.useFakeTimers();
    const alice = makePlayer('Alice', 1);
    const bob = makePlayer('Bob', 2);
    const manager = voiceForRoom(makeRoom([ alice, bob ]));
    manager.handle(alice, 'voiceJoin', {});
    alice.messages.length = bob.messages.length = 0;

    manager.handle(alice, 'voiceLeave', {});

    expect(manager.stateFor(bob).participants).not.toContainEqual({ sessionID: 1, player: 'Alice' });
    expect(messages(bob, 'voiceState')).toHaveLength(1);
    jest.advanceTimersByTime(8000);
    expect(messages(bob, 'voiceState')).toHaveLength(1);
  });
});
