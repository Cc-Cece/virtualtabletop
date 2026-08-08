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
    id: 'voice-invite-test',
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

describe('voice invitations', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test('only a voice participant can invite another connected player', () => {
    const alice = makePlayer('Alice', 1);
    const bob = makePlayer('Bob', 2);
    const manager = voiceForRoom(makeRoom([ alice, bob ]));

    manager.handle(alice, 'voiceInvite', { targetPlayer: 'Bob' });

    expect(messages(alice, 'voiceError')).toContain('Join voice before inviting another player.');
    expect(messages(bob, 'voiceInvite')).toHaveLength(0);
  });

  test('an invitation is addressed to the player and reaches all of their sessions', () => {
    jest.useFakeTimers();
    const alice = makePlayer('Alice', 1);
    const bobPhone = makePlayer('Bob', 2);
    const bobDesktop = makePlayer('Bob', 3);
    const room = makeRoom([ alice, bobPhone, bobDesktop ]);
    const manager = voiceForRoom(room);
    manager.handle(alice, 'voiceJoin', {});
    alice.messages.length = bobPhone.messages.length = bobDesktop.messages.length = 0;

    manager.handle(alice, 'voiceInvite', { targetPlayer: 'Bob' });

    const phoneInvite = messages(bobPhone, 'voiceInvite')[0];
    const desktopInvite = messages(bobDesktop, 'voiceInvite')[0];
    expect(phoneInvite.inviteID).toBeTruthy();
    expect(desktopInvite.inviteID).toBe(phoneInvite.inviteID);
    expect(phoneInvite.fromPlayer).toBe('Alice');
    expect(messages(alice, 'voiceInviteStatus')[0]).toMatchObject({
      targetPlayer: 'Bob',
      status: 'sent',
      inviteID: phoneInvite.inviteID
    });

    manager.handle(bobDesktop, 'voiceInviteResponse', { inviteID: phoneInvite.inviteID, decision: 'reject' });
    expect(messages(bobPhone, 'voiceInviteResolved').at(-1)).toMatchObject({ inviteID: phoneInvite.inviteID, status: 'rejected' });
    expect(messages(bobDesktop, 'voiceInviteResolved').at(-1)).toMatchObject({ inviteID: phoneInvite.inviteID, status: 'rejected' });
    expect(messages(alice, 'voiceInviteStatus').at(-1)).toMatchObject({ targetPlayer: 'Bob', status: 'rejected' });
  });

  test('a target already in voice is not invited again', () => {
    const alice = makePlayer('Alice', 1);
    const bob = makePlayer('Bob', 2);
    const manager = voiceForRoom(makeRoom([ alice, bob ]));
    manager.handle(alice, 'voiceJoin', {});
    manager.handle(bob, 'voiceJoin', {});
    alice.messages.length = bob.messages.length = 0;

    manager.handle(alice, 'voiceInvite', { targetPlayer: 'Bob' });

    expect(messages(bob, 'voiceInvite')).toHaveLength(0);
    expect(messages(alice, 'voiceInviteStatus')[0]).toMatchObject({ targetPlayer: 'Bob', status: 'joined' });
  });

  test('one pending invitation per target prevents stacked call prompts', () => {
    jest.useFakeTimers();
    const alice = makePlayer('Alice', 1);
    const carol = makePlayer('Carol', 2);
    const bob = makePlayer('Bob', 3);
    const manager = voiceForRoom(makeRoom([ alice, carol, bob ]));
    manager.handle(alice, 'voiceJoin', {});
    manager.handle(carol, 'voiceJoin', {});
    alice.messages.length = carol.messages.length = bob.messages.length = 0;

    manager.handle(alice, 'voiceInvite', { targetPlayer: 'Bob' });
    const inviteID = messages(bob, 'voiceInvite')[0].inviteID;
    manager.handle(carol, 'voiceInvite', { targetPlayer: 'Bob' });

    expect(messages(bob, 'voiceInvite')).toHaveLength(1);
    expect(messages(carol, 'voiceInviteStatus')[0]).toMatchObject({ targetPlayer: 'Bob', status: 'pending', inviteID });

    manager.handle(bob, 'voiceInviteResponse', { inviteID, decision: 'reject' });
  });

  test('pending invitations expire after thirty seconds', () => {
    jest.useFakeTimers();
    const alice = makePlayer('Alice', 1);
    const bob = makePlayer('Bob', 2);
    const manager = voiceForRoom(makeRoom([ alice, bob ]));
    manager.handle(alice, 'voiceJoin', {});
    alice.messages.length = bob.messages.length = 0;

    manager.handle(alice, 'voiceInvite', { targetPlayer: 'Bob' });
    const inviteID = messages(bob, 'voiceInvite')[0].inviteID;
    jest.advanceTimersByTime(30000);

    expect(messages(bob, 'voiceInviteResolved').at(-1)).toMatchObject({ inviteID, status: 'expired' });
    expect(messages(alice, 'voiceInviteStatus').at(-1)).toMatchObject({ targetPlayer: 'Bob', status: 'expired' });
  });

  test('joining voice closes a pending invitation but accepting alone never impersonates a join', () => {
    jest.useFakeTimers();
    const alice = makePlayer('Alice', 1);
    const bob = makePlayer('Bob', 2);
    const manager = voiceForRoom(makeRoom([ alice, bob ]));
    manager.handle(alice, 'voiceJoin', {});
    alice.messages.length = bob.messages.length = 0;

    manager.handle(alice, 'voiceInvite', { targetPlayer: 'Bob' });
    const inviteID = messages(bob, 'voiceInvite')[0].inviteID;
    manager.handle(bob, 'voiceInviteResponse', { inviteID, decision: 'accept' });

    expect(manager.participants.has(bob)).toBe(false);
    expect(messages(alice, 'voiceInviteStatus').at(-1)).toMatchObject({ targetPlayer: 'Bob', status: 'accepted' });

    jest.advanceTimersByTime(10000);
    manager.handle(alice, 'voiceInvite', { targetPlayer: 'Bob' });
    const secondInvite = messages(bob, 'voiceInvite').at(-1);
    manager.handle(bob, 'voiceJoin', {});
    expect(manager.participants.has(bob)).toBe(true);
    expect(messages(alice, 'voiceInviteStatus').at(-1)).toMatchObject({ targetPlayer: 'Bob', status: 'joined', inviteID: secondInvite.inviteID });
  });
});
