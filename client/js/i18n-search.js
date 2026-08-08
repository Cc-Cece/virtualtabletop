let i18nSearchStates = null;
let i18nSearchRefreshQueued = false;

function i18nCanonicalVariantText(state) {
  return Object.values(state.variants || {}).map(variant=>{
    if(variant.plStateID && i18nSearchStates && i18nSearchStates[variant.plStateID])
      variant = i18nSearchStates[variant.plStateID].variants[variant.plVariantID];
    return variant && variant.variant;
  }).filter(Boolean).join(' ');
}

function i18nCanonicalSearchText(state) {
  return [
    state.name,
    state.similarName,
    state.description,
    state.similarDesigner,
    state.similarAwards,
    state.savePlayers,
    state.helpText,
    state.attribution,
    i18nCanonicalVariantText(state)
  ].filter(value=>value !== undefined && value !== null).join(' ');
}

function refreshI18nSearchIndex() {
  i18nSearchRefreshQueued = false;
  if(!i18nSearchStates)
    return;

  for(const entry of $a('#statesList .roomState[data-id]')) {
    const state = i18nSearchStates[entry.dataset.id];
    if(!state)
      continue;
    const display = localizeGameMeta(state);
    entry.dataset.text = [
      i18nCanonicalSearchText(state),
      display.name,
      display.similarName,
      display.description
    ].filter(Boolean).join(' ').toLowerCase();
  }

  if(typeof updateLibraryFilter == 'function')
    updateLibraryFilter();
}

function queueI18nSearchRefresh() {
  if(i18nSearchRefreshQueued)
    return;
  i18nSearchRefreshQueued = true;
  setTimeout(refreshI18nSearchIndex, 0);
}

onLoad(function() {
  onMessage('meta', function(args) {
    i18nSearchStates = args && args.meta && args.meta.states || null;
    queueI18nSearchRefresh();
  });

  const statesList = $('#statesList');
  if(statesList)
    new MutationObserver(queueI18nSearchRefresh).observe(statesList, { childList: true, subtree: true });

  window.addEventListener('vtt-languagechange', queueI18nSearchRefresh);
});
