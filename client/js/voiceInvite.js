const transport = window.vttVoiceTransport;

if(!transport) {
  console.warn('Voice invitation module loaded without VTT transport bridge.');
} else {
  const state = {
    voice: null,
    inbound: new Map(),
    outbound: new Map(),
    currentSessionID: null
  };

  const prompt = createPrompt();
  installStyles();
  wireTransport();
  wirePrompt();
  wirePlayerOverlay();

  const cachedSessionID = transport.lastMessage && transport.lastMessage('sessionID');
  if(cachedSessionID != null)
    state.currentSessionID = Number(cachedSessionID) || null;
  const cachedVoiceState = transport.lastMessage && transport.lastMessage('voiceState');
  if(cachedVoiceState)
    onVoiceState(cachedVoiceState);

  function installStyles() {
    if(document.getElementById('voiceInviteStyles'))
      return;
    const link = document.createElement('link');
    link.id = 'voiceInviteStyles';
    link.rel = 'stylesheet';
    link.href = new URL('css/voiceInvite.css', document.baseURI).href;
    document.head.appendChild(link);
  }

  function createPrompt() {
    const root = document.createElement('section');
    root.id = 'voiceInvitePrompt';
    root.className = 'voiceInvitePrompt voiceInviteHidden';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-live', 'assertive');
    root.innerHTML = `
      <div class="voiceInvitePromptIcon"><i class="material-symbols">call</i></div>
      <div class="voiceInvitePromptBody">
        <strong id="voiceInvitePromptTitle">Voice invitation</strong>
        <span id="voiceInvitePromptText"></span>
      </div>
      <div class="voiceInvitePromptActions">
        <button id="voiceInviteReject" type="button">Decline</button>
        <button id="voiceInviteAccept" type="button" class="primary">Join voice</button>
      </div>
    `;
    document.body.appendChild(root);
    return {
      root,
      title: root.querySelector('#voiceInvitePromptTitle'),
      text: root.querySelector('#voiceInvitePromptText'),
      reject: root.querySelector('#voiceInviteReject'),
      accept: root.querySelector('#voiceInviteAccept')
    };
  }

  function wireTransport() {
    transport.onMessage('sessionID', sessionID=>{
      state.currentSessionID = Number(sessionID) || null;
      scheduleDecorate();
    });
    transport.onMessage('meta', scheduleDecorate);
    transport.onMessage('state', scheduleDecorate);
    transport.onMessage('delta', scheduleDecorate);
    transport.onMessage('voiceState', onVoiceState);
    transport.onMessage('voiceInvite', onInvite);
    transport.onMessage('voiceInviteResolved', onInviteResolved);
    transport.onMessage('voiceInviteStatus', onInviteStatus);
  }

  function wirePrompt() {
    prompt.reject.addEventListener('click', ()=>respondToCurrent('reject'));
    prompt.accept.addEventListener('click', ()=>{
      const invite = currentInvite();
      if(!invite)
        return;
      transport.toServer('voiceInviteResponse', { inviteID: invite.inviteID, decision: 'accept' });
      state.inbound.delete(invite.inviteID);
      renderPrompt();

      if(!state.voice?.joined) {
        // Reuse the existing Voice module's normal join action. Calling click() synchronously from
        // this user gesture preserves the browser permission flow used by the regular Join button.
        const joinButton = document.getElementById('voiceJoin');
        if(joinButton && !joinButton.disabled)
          joinButton.click();
      }
    });
    document.addEventListener('keydown', event=>{
      if(event.key == 'Escape' && !prompt.root.classList.contains('voiceInviteHidden'))
        respondToCurrent('reject');
    });
  }

  function wirePlayerOverlay() {
    const button = document.getElementById('playersButton');
    if(button)
      button.addEventListener('click', scheduleDecorate);
  }

  function onVoiceState(serverState) {
    if(!serverState || typeof serverState != 'object')
      return;
    state.voice = serverState;
    state.currentSessionID = Number(serverState.selfSessionID) || state.currentSessionID;

    const joinedPlayers = new Set((serverState.participants || []).map(p=>p.player));
    for(const [ target ] of state.outbound)
      if(joinedPlayers.has(target))
        state.outbound.delete(target);

    if(serverState.joined && state.inbound.size) {
      for(const invite of state.inbound.values())
        transport.toServer('voiceInviteResponse', { inviteID: invite.inviteID, decision: 'accept' });
      state.inbound.clear();
      renderPrompt();
    }
    scheduleDecorate();
  }

  function onInvite(invite) {
    if(!invite || typeof invite.inviteID != 'string' || typeof invite.fromPlayer != 'string')
      return;
    state.inbound.set(invite.inviteID, {
      inviteID: invite.inviteID,
      fromPlayer: invite.fromPlayer,
      expiresAt: Number(invite.expiresAt) || Date.now() + 30000,
      receivedAt: Date.now()
    });
    renderPrompt();
  }

  function onInviteResolved(args) {
    if(args && typeof args.inviteID == 'string')
      state.inbound.delete(args.inviteID);
    renderPrompt();
  }

  function onInviteStatus(args) {
    if(!args || typeof args.targetPlayer != 'string' || typeof args.status != 'string')
      return;
    const target = args.targetPlayer;
    const status = args.status;
    if([ 'sent', 'pending', 'requesting', 'cooldown', 'accepted', 'busy' ].includes(status)) {
      state.outbound.set(target, {
        status,
        inviteID: args.inviteID || '',
        expiresAt: Number(args.expiresAt) || 0,
        retryAt: Number(args.retryAt) || 0
      });
      const until = status == 'accepted' ? 5000 : Math.max(1000, (Number(args.expiresAt) || Number(args.retryAt) || Date.now() + 3000) - Date.now());
      setTimeout(()=>{
        const current = state.outbound.get(target);
        if(current && current.status == status) {
          state.outbound.delete(target);
          decoratePlayerList();
        }
      }, until + 50);
    } else {
      state.outbound.delete(target);
    }
    scheduleDecorate();
  }

  function currentInvite() {
    return [ ...state.inbound.values() ].sort((a,b)=>a.receivedAt-b.receivedAt)[0] || null;
  }

  function respondToCurrent(decision) {
    const invite = currentInvite();
    if(!invite)
      return;
    transport.toServer('voiceInviteResponse', { inviteID: invite.inviteID, decision });
    state.inbound.delete(invite.inviteID);
    renderPrompt();
  }

  function renderPrompt() {
    const invite = currentInvite();
    if(!invite || state.voice?.joined) {
      prompt.root.classList.add('voiceInviteHidden');
      return;
    }
    prompt.title.textContent = `${invite.fromPlayer} invited you to voice`;
    prompt.text.textContent = 'Join the room voice chat?';
    prompt.root.classList.remove('voiceInviteHidden');
  }

  let decorateScheduled = false;
  function scheduleDecorate() {
    if(decorateScheduled)
      return;
    decorateScheduled = true;
    setTimeout(()=>{
      decorateScheduled = false;
      decoratePlayerList();
    }, 0);
  }

  function selfPlayerName(meta) {
    const sessionID = Number(state.voice?.selfSessionID || state.currentSessionID);
    return (meta?.sessions || []).find(s=>Number(s.sessionID) == sessionID)?.player || '';
  }

  function decoratePlayerList() {
    const table = document.getElementById('playersTable');
    const metaMessage = transport.lastMessage && transport.lastMessage('meta');
    if(!table || !metaMessage)
      return;

    const sessions = metaMessage.sessions || [];
    const selfName = selfPlayerName(metaMessage);
    const joinedPlayers = new Set((state.voice?.participants || []).map(p=>p.player));

    for(const row of table.querySelectorAll('tbody tr')) {
      const nameInput = row.querySelector('.playerName');
      if(!nameInput)
        continue;
      const targetPlayer = nameInput.value;
      const sessionLabel = row.querySelector('.sessionLabel');
      const host = sessionLabel?.parentElement || row.lastElementChild;
      if(!host)
        continue;

      let slot = host.querySelector('.voiceInviteRosterSlot');
      if(!slot) {
        slot = document.createElement('span');
        slot.className = 'voiceInviteRosterSlot';
        host.appendChild(slot);
      }
      slot.replaceChildren();

      const connected = sessions.some(s=>s.player == targetPlayer);
      if(joinedPlayers.has(targetPlayer)) {
        const badge = document.createElement('span');
        badge.className = 'voiceInviteInVoice';
        badge.title = `${targetPlayer} is in voice`;
        badge.setAttribute('aria-label', badge.title);
        badge.innerHTML = '<i class="material-symbols">mic</i>';
        slot.appendChild(badge);
        continue;
      }

      if(!state.voice?.enabled || !state.voice?.joined || !connected || !targetPlayer || targetPlayer == selfName)
        continue;

      const pending = state.outbound.get(targetPlayer);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'voiceInviteAction';
      button.dataset.player = targetPlayer;
      button.innerHTML = '<i class="material-symbols">mic</i><span class="voiceInvitePlus">+</span>';

      if(pending) {
        button.disabled = true;
        button.classList.add('pending');
        if(pending.status == 'accepted')
          button.title = `${targetPlayer} accepted and is joining voice…`;
        else if(pending.status == 'busy')
          button.title = `${targetPlayer} already has a pending voice invitation`;
        else if(pending.status == 'cooldown')
          button.title = `Please wait before inviting ${targetPlayer} again`;
        else
          button.title = `Voice invitation sent to ${targetPlayer}`;
      } else {
        button.title = `Invite ${targetPlayer} to voice`;
        button.setAttribute('aria-label', button.title);
        button.addEventListener('click', ()=>{
          state.outbound.set(targetPlayer, { status: 'requesting' });
          decoratePlayerList();
          transport.toServer('voiceInvite', { targetPlayer });
        });
      }
      slot.appendChild(button);
    }
  }
}
