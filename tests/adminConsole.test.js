import { getAdminPanels, inspectHolder, physicalOrderKey } from '../client/js/admin/roomInspector.js';

describe('room admin holder inspector', () => {
  const state = {
    _meta: {
      activeState: { stateID: 'game', variantID: '0' },
      states: {
        game: {
          adminPanels: [
            { id: 'draw', type: 'holderInspector', title: 'Draw pile', holder: 'draw-pile' },
          ],
        },
      },
    },
    'draw-pile': { type: 'holder' },
    'main-deck': {
      type: 'deck',
      parent: 'draw-pile',
      cardTypes: {
        'type-1': { label: 'Slash', sourceSequence: 1, sourceCardId: 'A' },
        'type-2': { label: 'Dodge', sourceSequence: 2, sourceCardId: 'B' },
        'type-3': { label: 'Peach', sourceSequence: 3, sourceCardId: 'C' },
      },
    },
    'card-1': { type: 'card', parent: 'draw-pile', deck: 'main-deck', cardType: 'type-1', z: 30 },
    'pile-1': { type: 'pile', parent: 'draw-pile', z: 20 },
    'card-2': { type: 'card', parent: 'pile-1', deck: 'main-deck', cardType: 'type-2', z: 12 },
    'card-3': { type: 'card', parent: 'pile-1', deck: 'main-deck', cardType: 'type-3', z: 11 },
  };

  test('reads declarations from active game metadata', () => {
    expect(getAdminPanels(state)).toEqual([
      { id: 'draw', type: 'holderInspector', title: 'Draw pile', holder: 'draw-pile' },
    ]);
  });

  test('ignores deck definitions and flattens physical cards top first', () => {
    const result = inspectHolder(state, 'draw-pile');
    expect(result.directObjectCount).toBe(2);
    expect(result.ignoredDirectObjectCount).toBe(1);
    expect(result.directCardCount).toBe(1);
    expect(result.directPileCount).toBe(1);
    expect(result.physicalCardCount).toBe(3);
    expect(result.cards.map(card => card.id)).toEqual(['card-1', 'card-2', 'card-3']);
    expect(result.cards.map(card => card.label)).toEqual(['Slash', 'Dodge', 'Peach']);
    expect(physicalOrderKey(result)).toBe('card-1\ncard-2\ncard-3');
  });
});
