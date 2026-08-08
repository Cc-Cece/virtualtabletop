# Simplified Chinese i18n MVP plan

## Goal

Add a small, dependency-free localization layer to the normal player-facing VirtualTabletop experience. The first release supports English (`en`) and Simplified Chinese (`zh-CN`) and keeps all existing games and room files compatible.

The MVP covers:

- the normal room toolbar and common player-facing overlays;
- the Game Shelf / public library browsing flow;
- the game-link welcome / create-room flow;
- localized game `name` and `description` metadata where translations are available;
- a visible language selector, browser-language detection, persistence, and English fallback.

The MVP intentionally does **not** translate game-internal content (cards, labels, routines, rule text authored by individual games), the advanced game editor, or the long legal/license text in About.

## Design principles

1. **No breaking schema change.** Existing VTT/VTTS/VTTC files and public-library games must continue to work without any modification.
2. **English remains the source fallback.** Missing Chinese strings always display the existing English text rather than an empty label.
3. **No new runtime dependency.** The client is currently bundled as plain JavaScript by `server/minify.mjs`; the MVP uses a small native JS module instead of adding an i18n package.
4. **Localization is presentation-only.** Game IDs, public-library paths, room IDs, save filenames, network messages, and internal metadata keys remain unchanged.
5. **Search remains bilingual.** A localized game must still be discoverable with its original English name/text as well as its Chinese display text.
6. **Future languages remain possible.** The API uses locale dictionaries and locale-tagged game metadata rather than hard-coding Chinese-only branches through the application.

## Locale selection and persistence

Locale resolution order:

1. the saved `localStorage` preference;
2. browser language (`navigator.languages` / `navigator.language`), mapping Chinese locales to `zh-CN` for the MVP;
3. `en` fallback.

Changing the language:

- updates `<html lang>`;
- persists the selection;
- reapplies static UI translations;
- dispatches a `vtt-languagechange` event so dynamic overlays can refresh.

The selector offers:

- English
- 简体中文

## UI translation architecture

Create `client/js/i18n.js` and bundle it immediately after `domhelpers.js` so the normal room UI can call `t()` before overlay code initializes.

The module provides:

- `getLocale()`
- `setLocale(locale)`
- `t(key, variables?)`
- `applyUITranslations()`
- `localizeGameMeta(state)`
- `localizeGameField(state, field)`

Static HTML stays English for graceful no-JS/failure fallback. `applyUITranslations()` targets stable IDs/classes already present in `room.html`, changing only text, title, placeholder and accessibility labels.

Dynamic JavaScript strings in the high-frequency player flows use `t()` directly.

## Game metadata localization

Game localization is resolved in this order:

1. optional per-game metadata: `state.i18n[locale]`;
2. built-in client-side locale overrides for selected important public-library games;
3. original English metadata.

Supported localized fields in the MVP:

```json
{
  "i18n": {
    "zh-CN": {
      "name": "国际象棋",
      "description": "……"
    }
  }
}
```

No game is required to contain this object.

`localizeGameMeta()` returns a presentation copy and never mutates the canonical state object. This prevents localization from changing save files, server state, sorting identifiers, links, downloads, or edit data.

For built-in overrides, prefer the stable `publicLibrary` path when known, with the original English `name` as a fallback key. The first catalog focuses on widely recognizable games; future additions require dictionary-only changes.

## Game Shelf behavior

Localized presentation applies to:

- shelf tile name;
- shelf tile “Similar to …” prefix;
- details-overlay game name;
- details-overlay description;
- shared-game welcome heading / browser title;
- text search.

Search text contains both original and localized name/description so users can search either language.

Sorting by name uses the localized display name while the selected locale is active. Other sort modes continue to use their existing canonical metadata.

## Core UI coverage

Translate the commonly used normal-player surfaces:

- toolbar tooltips: Game Shelf, Active Game, Players, About, Edit Mode, Sound, Lights, Zoom, Fullscreen, toolbar visibility;
- room loading / basic join prompts;
- Players heading, common column labels, add/share controls and primary action tooltips;
- Game Shelf search/filter labels, sort options, empty states and primary Add/Save/Update actions;
- game details labels used during normal browsing/play (time, mode, skill, play, previous/next, share/load/delete confirmations where implemented dynamically);
- shared-game welcome/create-room flow and common errors/progress states;
- common confirmation/cancel vocabulary.

Not translated in this MVP:

- editor bundle and editor-only property labels;
- author-provided game rule/help/attribution HTML;
- individual game widgets/cards/scripts;
- full About legal/license prose;
- server/admin pages.

## Files expected to change

Primary implementation:

- `client/js/i18n.js` (new)
- `server/minify.mjs`
- `client/js/overlays/states.js`
- `client/js/overlays/welcome.js`
- `client/js/overlays/players.js` only where runtime strings need localization
- `tests/i18n.test.js` (new)
- this plan document

Avoid changing hundreds of public-library game files in the MVP.

## Compatibility requirements

- Rooms created before this change load normally.
- Public-library entries without translations display exactly their original metadata.
- Saving/downloading a game does not write the client-side built-in translation catalog into the game.
- User-edited names remain canonical; localization affects presentation only.
- Links and `PL:*` IDs are unchanged.
- `en` renders the same canonical game metadata as before.
- Switching locale must not reconnect the websocket or reload the room.

## Validation plan

### Automated checks

Add source-level/Jest coverage for:

- `i18n.js` is included before overlay modules in the room bundle;
- supported locale normalization and English fallback;
- placeholder interpolation;
- per-game `i18n.zh-CN` metadata takes precedence over built-in overrides;
- untranslated games preserve the original name/description;
- localized search logic retains both English and Chinese text;
- locale preference is persisted without affecting room/game IDs.

Run the repository test suite where the execution environment permits. At minimum, syntax-check all changed JavaScript.

### Manual regression checklist

English:

- open an empty room;
- Game Shelf opens and filters/sorts;
- public games load;
- Players overlay works;
- shared-game URL can create/join a room;
- save/add/load operations retain existing metadata.

Chinese:

- browser `zh-*` defaults to Simplified Chinese when no preference exists;
- selector changes immediately without reload;
- preference survives reload;
- core toolbar / shelf / welcome UI is Chinese;
- translated game tiles/details show Chinese;
- untranslated games fall back to English;
- searching translated games works with both Chinese and English names.

## Acceptance criteria

The MVP is complete when:

1. English and Simplified Chinese can be switched from the player UI and the choice persists.
2. The common room/Game Shelf/welcome flows are usable in Chinese without changing server or game logic.
3. Important game names can be translated centrally, and any game may supply its own `i18n.zh-CN.name/description` metadata.
4. Missing translations always fall back to the current English content.
5. Existing game files remain valid and unchanged by merely viewing them in Chinese.
6. Automated tests cover the fallback/localization contract and all changed JS passes syntax validation.

## Follow-up phases (not part of this PR)

- expand the Chinese public-game catalog;
- move individual game translations into their game metadata as maintainers touch those games;
- translate advanced editor UI;
- add additional locales (`zh-TW`, Japanese, etc.);
- introduce contributor tooling to report untranslated keys/metadata.
