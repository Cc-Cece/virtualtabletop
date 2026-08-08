import fs from 'fs';
import path from 'path';

import { localizeGameMetaForLocale, normalizeLocale, translateMessage } from '../client/js/i18n.js';

const minifySource = fs.readFileSync(path.join(process.cwd(), 'server/minify.mjs'), 'utf8');
const i18nSource = fs.readFileSync(path.join(process.cwd(), 'client/js/i18n.js'), 'utf8');
const welcomeSource = fs.readFileSync(path.join(process.cwd(), 'client/js/overlays/welcome.js'), 'utf8');

describe('client i18n', () => {
  test('normalizes Chinese browser locales and falls back to English', () => {
    expect(normalizeLocale('zh-CN')).toBe('zh-CN');
    expect(normalizeLocale('zh-SG')).toBe('zh-CN');
    expect(normalizeLocale('zh-Hans')).toBe('zh-CN');
    expect(normalizeLocale('en')).toBe('en');
    expect(normalizeLocale('fr-FR')).toBe('en');
  });

  test('falls back to the English message and interpolates variables', () => {
    expect(translateMessage('fr-FR', 'toolbar.gameShelf')).toBe('Game Shelf');
    expect(translateMessage('zh-CN', 'toolbar.playersCount', { count: 4 })).toBe('玩家：4');
    expect(translateMessage('zh-CN', 'missing.key')).toBe('missing.key');
  });

  test('keeps canonical metadata unchanged when using English', () => {
    const state = { name: 'Chess', description: 'Original description', publicLibrary: 'games/Chess' };
    const localized = localizeGameMetaForLocale(state, 'en');

    expect(localized.name).toBe('Chess');
    expect(localized.description).toBe('Original description');
    expect(state.name).toBe('Chess');
  });

  test('uses built-in Chinese game metadata when available', () => {
    const localized = localizeGameMetaForLocale({ name: 'Chess', description: 'Original description' }, 'zh-CN');

    expect(localized.name).toBe('国际象棋');
    expect(localized.description).toBe('经典的双人策略棋类游戏。');
  });

  test('per-game Chinese metadata overrides the built-in catalog', () => {
    const state = {
      name: 'Chess',
      description: 'Original description',
      i18n: {
        'zh-CN': {
          name: '自定义中文棋名',
          description: '游戏包自带的中文简介。'
        }
      }
    };
    const localized = localizeGameMetaForLocale(state, 'zh-CN');

    expect(localized.name).toBe('自定义中文棋名');
    expect(localized.description).toBe('游戏包自带的中文简介。');
  });

  test('untranslated games preserve their original metadata', () => {
    const state = { name: 'A Game Without Translation', description: 'Keep this text.' };
    const localized = localizeGameMetaForLocale(state, 'zh-CN');

    expect(localized.name).toBe(state.name);
    expect(localized.description).toBe(state.description);
  });

  test('bundles i18n after core helpers and before overlay code', () => {
    const connectionIndex = minifySource.indexOf("'client/js/connection.js'");
    const i18nIndex = minifySource.indexOf("'client/js/i18n.js'");
    const statesIndex = minifySource.indexOf("'client/js/overlays/states.js'");

    expect(connectionIndex).toBeGreaterThan(-1);
    expect(i18nIndex).toBeGreaterThan(connectionIndex);
    expect(statesIndex).toBeGreaterThan(i18nIndex);
  });

  test('keeps search bilingual and localization presentation-only', () => {
    expect(i18nSource).toContain('entry.dataset.i18nBaseText');
    expect(i18nSource).toContain("${display.name || ''} ${display.description || ''} ${display.similarName || ''}");
    expect(i18nSource).toContain('return { ...state };');
    expect(i18nSource).not.toContain("toServer('");
  });

  test('restores canonical game metadata while editing', () => {
    expect(i18nSource).toContain("details.classList.contains('editing') ? state : localizeGameMeta(state)");
  });

  test('reapplies filtering and sorting after localized metadata changes', () => {
    expect(i18nSource).toContain("typeof resortStatesList == 'function'");
    expect(i18nSource).toContain("typeof updateLibraryFilter == 'function'");
    expect(i18nSource).toContain('vttI18nNeedsLibraryUpdate = true;');
  });

  test('localizes the shared-game welcome path using the same metadata resolver', () => {
    expect(welcomeSource).toContain('setI18nWelcomeState(state);');
    expect(welcomeSource).toContain('const displayState = localizeGameMeta(state);');
    expect(welcomeSource).toContain("updateProgress(t('welcome.joining'));");
    expect(welcomeSource).toContain("updateProgress(t('welcome.adding'));");
  });
});
