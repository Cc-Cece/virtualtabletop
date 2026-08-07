function numericZ(widget) {
  return Number.isFinite(Number(widget?.z)) ? Number(widget.z) : 0;
}

function sortTopFirst(entries) {
  return [...entries].sort((a, b) => numericZ(b.widget) - numericZ(a.widget) || a.id.localeCompare(b.id));
}

export function getAdminPanels(state) {
  const meta = state?._meta;
  const active = meta?.activeState;
  const activeInfo = active && meta?.states?.[active.stateID];
  const panels = activeInfo?.adminPanels ?? meta?.info?.adminPanels;
  if(!Array.isArray(panels))
    return [];

  return panels.filter(panel => panel && typeof panel == 'object' && typeof panel.type == 'string');
}

export function resolveCardMetadata(state, card) {
  const deck = card?.deck && state?.[card.deck];
  const cardType = deck?.cardTypes?.[card?.cardType];
  return cardType && typeof cardType == 'object' ? cardType : {};
}

export function inspectHolder(state, holderID) {
  if(!state || typeof state != 'object')
    return null;

  const holder = state[holderID];
  if(!holder || typeof holder != 'object')
    return null;

  const childrenByParent = new Map();
  for(const [id, widget] of Object.entries(state)) {
    if(id == '_meta' || !widget || typeof widget != 'object' || Array.isArray(widget))
      continue;
    if(typeof widget.parent != 'string')
      continue;
    if(!childrenByParent.has(widget.parent))
      childrenByParent.set(widget.parent, []);
    childrenByParent.get(widget.parent).push({ id, widget });
  }

  for(const [parent, entries] of childrenByParent)
    childrenByParent.set(parent, sortTopFirst(entries));

  const allDirectChildren = childrenByParent.get(holderID) || [];
  const directChildren = allDirectChildren.filter(({ widget }) => widget.type == 'card' || widget.type == 'pile');
  const cards = [];
  const visited = new Set();
  let pileCount = 0;

  function collect(id, widget, ancestry = []) {
    if(visited.has(id))
      return;
    visited.add(id);

    if(widget.type == 'card') {
      const metadata = resolveCardMetadata(state, widget);
      cards.push({
        id,
        widget,
        metadata,
        ancestry,
        label: metadata.label || widget.label || widget.cardType || id,
      });
      return;
    }

    if(widget.type == 'pile') {
      pileCount += 1;
      for(const child of childrenByParent.get(id) || [])
        collect(child.id, child.widget, [...ancestry, id]);
    }
  }

  for(const child of directChildren)
    collect(child.id, child.widget);

  return {
    holderID,
    holder,
    directObjectCount: directChildren.length,
    ignoredDirectObjectCount: allDirectChildren.length - directChildren.length,
    directCardCount: directChildren.filter(({ widget }) => widget.type == 'card').length,
    directPileCount: directChildren.filter(({ widget }) => widget.type == 'pile').length,
    pileCount,
    physicalCardCount: cards.length,
    cards,
  };
}

export function physicalOrderKey(inspection) {
  return inspection?.cards?.map(card => card.id).join('\n') || '';
}
