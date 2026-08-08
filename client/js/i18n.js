const VTT_I18N_STORAGE_KEY = 'vttLocale';
const VTT_I18N_SUPPORTED = [ 'en', 'zh-CN' ];

const VTT_I18N_MESSAGES = {
  en: {
    'language.label': 'Language',
    'toolbar.gameShelf': 'Game Shelf',
    'toolbar.activeGame': 'Active Game',
    'toolbar.players': 'Players',
    'toolbar.playersCount': 'Players: {count}',
    'toolbar.about': 'About',
    'toolbar.editMode': 'Edit Mode',
    'toolbar.sound': 'Sound',
    'toolbar.lights': 'Lights',
    'toolbar.fullscreen': 'Fullscreen',
    'toolbar.hide': 'Hide Toolbar',
    'toolbar.show': 'Show Toolbar',
    'room.loading': 'Loading room...',
    'room.play': 'Play',
    'room.askID': 'Please enter an ID and ask your friend to enter the same one:',
    'room.return': 'Return',
    'room.returnHint': 'In order to switch games, please return to the main server:',
    'input.button': 'Button Input',
    'input.waiting': 'Waiting on other players',
    'input.waitingHint': 'No action required. Pressing the Cancel button will force close the input for everyone and all choices will be lost.',
    'common.search': 'Search',
    'common.any': 'Any',
    'common.none': 'None',
    'common.cancel': 'Cancel',
    'common.save': 'Save',
    'common.delete': 'Delete',
    'common.keep': 'Keep',
    'common.share': 'Share',
    'common.upload': 'Upload files',
    'common.close': 'Close',
    'players.title': 'Players',
    'players.player': 'Player',
    'players.connections': 'Connections',
    'players.addPlaceholder': 'Add a player who shares this device',
    'players.addTitle': 'Add a player who shares this device',
    'players.addSwitchTitle': 'Add a player and switch this browser tab to them',
    'players.shareTitle': 'Share the room URL so other players can join',
    'players.renameTitle': 'Rename this player and update all references to it in the game',
    'players.viewTitle': 'View the game as this player: only this browser tab switches over and the game stays unchanged',
    'players.removeTitle': 'Remove this player',
    'players.invite': 'Invite players to',
    'players.connected': 'connected',
    'players.notConnected': 'not connected',
    'players.connection': 'Connection {count}',
    'players.you': 'you',
    'players.urlCopied': 'Room URL copied to clipboard.',
    'players.urlShared': 'Room URL shared.',
    'players.helpTogether': 'Help: playing together',
    'players.helpButtons': 'Help: what the buttons do',
    'library.inProgress': 'In-Progress Games',
    'library.gameShelf': 'Game Shelf',
    'library.publicLibrary': 'Public Library',
    'library.games': 'Games',
    'library.tutorials': 'Tutorials',
    'library.searchPlaceholder': 'Search',
    'library.noAi': 'No AI imagery',
    'library.usesAi': 'Uses AI imagery',
    'library.sortName': 'by Name',
    'library.sortSimilarName': 'by Similar Name',
    'library.sortStars': 'by Stars',
    'library.sortPopularity': 'by Popularity',
    'library.sortUpdated': 'by Last Updated',
    'library.sortYear': 'by Year',
    'library.updateLoaded': 'Update loaded game',
    'library.saveActive': 'Save active game',
    'library.addGame': 'Add game',
    'library.empty': 'Your personal game library is currently empty.<br>Use the stars below to pin public library games, use the "Add game" button above or drag VTT files here.',
    'library.emptyNoPublic': 'Your personal game library is currently empty.<br>Use the "Add game" button above or drag VTT files here.',
    'library.noResults': 'No games displayed.<br>Adjust the filters above to show them.',
    'library.similarTo': 'Similar to {name}',
    'library.similarPrefix': 'Similar to:',
    'library.time': 'Time:',
    'library.minutes': 'minutes',
    'library.mode': 'Mode:',
    'library.skill': 'Skill:',
    'library.play': 'Play',
    'library.importNotes': 'Import notes',
    'library.howToPlay': 'How to play the game',
    'library.howToUse': 'How to use this implementation',
    'library.attribution': 'Attribution',
    'library.aiNotice': 'This game uses AI generated imagery.',
    'addGame.title': 'Add game',
    'addGame.link': 'Add link',
    'addGame.saveRoom': 'Save room state',
    'saveGame.title': 'Save game',
    'saveGame.button': 'Save game',
    'share.title': 'Share link',
    'share.publicInfo': 'Use this link to tell your friends about this specific game in the public library.',
    'welcome.roomUrl': 'Room URL:',
    'welcome.playerName': 'Player name:',
    'welcome.createRoom': 'Create room',
    'welcome.game': 'game',
    'welcome.tutorial': 'tutorial',
    'welcome.startPlaying': 'start playing it',
    'welcome.checkOut': 'check it out',
    'welcome.notFound': 'Game not found!',
    'welcome.invalidName': 'Invalid game name!',
    'welcome.emptyRoom': 'Create an empty room',
    'welcome.joining': 'Joining room...',
    'welcome.adding': 'Adding game...',
    'about.title': 'About VirtualTabletop.io'
  },
  'zh-CN': {
    'language.label': '语言',
    'toolbar.gameShelf': '游戏架',
    'toolbar.activeGame': '当前游戏',
    'toolbar.players': '玩家',
    'toolbar.playersCount': '玩家：{count}',
    'toolbar.about': '关于',
    'toolbar.editMode': '编辑模式',
    'toolbar.sound': '声音',
    'toolbar.lights': '灯光',
    'toolbar.fullscreen': '全屏',
    'toolbar.hide': '隐藏工具栏',
    'toolbar.show': '显示工具栏',
    'room.loading': '正在加载房间…',
    'room.play': '开始游戏',
    'room.askID': '请输入一个 ID，并让朋友输入相同的 ID：',
    'room.return': '返回',
    'room.returnHint': '如需切换游戏，请返回主服务器：',
    'input.button': '按钮输入',
    'input.waiting': '正在等待其他玩家',
    'input.waitingHint': '当前无需操作。按下“取消”会强制关闭所有人的输入，本次所有选择都会丢失。',
    'common.search': '搜索',
    'common.any': '不限',
    'common.none': '无',
    'common.cancel': '取消',
    'common.save': '保存',
    'common.delete': '删除',
    'common.keep': '保留',
    'common.share': '分享',
    'common.upload': '上传文件',
    'common.close': '关闭',
    'players.title': '玩家',
    'players.player': '玩家',
    'players.connections': '连接',
    'players.addPlaceholder': '添加一名共用此设备的玩家',
    'players.addTitle': '添加一名共用此设备的玩家',
    'players.addSwitchTitle': '添加玩家并将当前浏览器标签切换为该玩家',
    'players.shareTitle': '分享房间链接，让其他玩家加入',
    'players.renameTitle': '重命名该玩家，并更新游戏中对该玩家的引用',
    'players.viewTitle': '以该玩家视角查看游戏；仅切换当前浏览器标签，不改变游戏状态',
    'players.removeTitle': '移除该玩家',
    'players.invite': '邀请玩家加入',
    'players.connected': '已连接',
    'players.notConnected': '未连接',
    'players.connection': '连接 {count}',
    'players.you': '你',
    'players.urlCopied': '房间链接已复制到剪贴板。',
    'players.urlShared': '房间链接已分享。',
    'players.helpTogether': '帮助：一起游玩',
    'players.helpButtons': '帮助：按钮说明',
    'library.inProgress': '进行中的游戏',
    'library.gameShelf': '游戏架',
    'library.publicLibrary': '公共游戏库',
    'library.games': '游戏',
    'library.tutorials': '教程',
    'library.searchPlaceholder': '搜索游戏',
    'library.noAi': '不含 AI 图像',
    'library.usesAi': '使用 AI 图像',
    'library.sortName': '按名称',
    'library.sortSimilarName': '按相似游戏名称',
    'library.sortStars': '按收藏数',
    'library.sortPopularity': '按热度',
    'library.sortUpdated': '按最近更新',
    'library.sortYear': '按年份',
    'library.updateLoaded': '更新已加载游戏',
    'library.saveActive': '保存当前游戏',
    'library.addGame': '添加游戏',
    'library.empty': '你的个人游戏库目前为空。<br>可以收藏下方公共游戏库中的游戏、点击上方“添加游戏”，或将 VTT 文件拖到这里。',
    'library.emptyNoPublic': '你的个人游戏库目前为空。<br>可以点击上方“添加游戏”，或将 VTT 文件拖到这里。',
    'library.noResults': '没有符合条件的游戏。<br>请调整上方筛选条件。',
    'library.similarTo': '类似于 {name}',
    'library.similarPrefix': '类似于：',
    'library.time': '时长：',
    'library.minutes': '分钟',
    'library.mode': '模式：',
    'library.skill': '难度：',
    'library.play': '开始',
    'library.importNotes': '导入说明',
    'library.howToPlay': '游戏玩法',
    'library.howToUse': '此实现的使用说明',
    'library.attribution': '署名与来源',
    'library.aiNotice': '此游戏使用了 AI 生成图像。',
    'addGame.title': '添加游戏',
    'addGame.link': '添加链接',
    'addGame.saveRoom': '保存房间状态',
    'saveGame.title': '保存游戏',
    'saveGame.button': '保存游戏',
    'share.title': '分享链接',
    'share.publicInfo': '使用此链接向朋友分享公共游戏库中的这个游戏。',
    'welcome.roomUrl': '房间链接：',
    'welcome.playerName': '玩家名称：',
    'welcome.createRoom': '创建房间',
    'welcome.game': '游戏',
    'welcome.tutorial': '教程',
    'welcome.startPlaying': '开始游玩',
    'welcome.checkOut': '查看教程',
    'welcome.notFound': '未找到该游戏！',
    'welcome.invalidName': '游戏名称无效！',
    'welcome.emptyRoom': '创建空房间',
    'welcome.joining': '正在加入房间…',
    'welcome.adding': '正在添加游戏…',
    'about.title': '关于 VirtualTabletop.io'
  }
};

const VTT_ZH_GAME_TRANSLATIONS = {
  'Chess': { name: '国际象棋', description: '经典的双人策略棋类游戏。' },
  'Checkers': { name: '西洋跳棋', description: '经典的双人跳棋游戏。' },
  'Backgammon': { name: '西洋双陆棋', description: '经典的双人双陆棋游戏。' },
  "Nine Men's Morris": { name: '九子棋', description: '双方通过布子和移动棋子形成三连并吃掉对方棋子。' },
  'Go': { name: '围棋', description: '双方在棋盘上落子并争夺领地的经典策略棋类游戏。' },
  'Reversi': { name: '黑白棋', description: '通过夹住对方棋子并翻转颜色来争夺棋盘。' },
  'Othello': { name: '黑白棋', description: '通过夹住对方棋子并翻转颜色来争夺棋盘。' },
  'Connect Four': { name: '四子棋', description: '率先将四枚棋子连成一线即可获胜。' },
  'Tic-Tac-Toe': { name: '井字棋', description: '经典的三连棋游戏。' },
  'Poker': { name: '扑克', description: '使用标准扑克牌进行的经典纸牌游戏。' },
  'Blackjack': { name: '二十一点', description: '目标是在不超过 21 点的情况下尽量接近 21 点。' },
  'Hearts': { name: '红心大战', description: '经典的四人吃墩类纸牌游戏。' },
  'Spades': { name: '黑桃王', description: '以黑桃为固定将牌的经典吃墩类纸牌游戏。' },
  'Bridge': { name: '桥牌', description: '经典的四人搭档制吃墩纸牌游戏。' },
  'Whist': { name: '惠斯特牌', description: '经典的四人搭档制吃墩纸牌游戏。' },
  'Jass': { name: '亚斯牌', description: '流行于瑞士及周边地区的传统吃墩纸牌游戏。' },
  'Doppelkopf': { name: '双头牌', description: '德国传统的四人吃墩纸牌游戏。' },
  'Mahjong': { name: '麻将', description: '使用麻将牌进行的传统桌面游戏。' },
  'Dominoes': { name: '多米诺骨牌', description: '使用点数骨牌进行匹配和出牌的经典游戏。' },
  'Ludo': { name: '飞行棋（Ludo）', description: '通过掷骰子让自己的棋子率先到达终点。' },
  'Mancala': { name: '播棋（Mancala）', description: '以棋子分配和收集为核心的传统棋盘游戏。' },
  'Battleship': { name: '战舰', description: '通过猜测坐标寻找并击沉对方舰队。' },
  'UNO': { name: 'UNO（优诺牌）', description: '按颜色或数字匹配出牌，并利用功能牌改变局势的经典纸牌游戏。' },
  'Uno': { name: 'UNO（优诺牌）', description: '按颜色或数字匹配出牌，并利用功能牌改变局势的经典纸牌游戏。' }
};

const VTT_I18N_STATIC_BINDINGS = [
  [ '#statesButton .tooltip', 'textContent', 'toolbar.gameShelf' ],
  [ '#activeGameButton .tooltip', 'textContent', 'toolbar.activeGame' ],
  [ '#aboutButton .tooltip', 'textContent', 'toolbar.about' ],
  [ '#editButton .tooltip', 'textContent', 'toolbar.editMode' ],
  [ '#optionsButton .tooltip', 'textContent', 'toolbar.sound' ],
  [ '#lightsButton .tooltip', 'textContent', 'toolbar.lights' ],
  [ '#fullscreenButton .tooltip', 'textContent', 'toolbar.fullscreen' ],
  [ '#hideToolbarButton .tooltip', 'textContent', 'toolbar.hide' ],
  [ '#showToolbarButton', 'title', 'toolbar.show' ],
  [ '#showToolbarButton', 'aria-label', 'toolbar.show' ],
  [ '#loadingRoomIndicator', 'textContent', 'room.loading' ],
  [ '#askIDoverlay p', 'textContent', 'room.askID' ],
  [ '#askIDoverlay button', 'textContent', 'room.play' ],
  [ '#buttonInputOverlay h1', 'textContent', 'input.button' ],
  [ '#inputBlockOverlay h1', 'textContent', 'input.waiting' ],
  [ '#inputBlockGuidance', 'textContent', 'input.waitingHint' ],
  [ '#inputBlockCancel label', 'textContent', 'common.cancel' ],
  [ '#playerOverlay .heading h1', 'textContent', 'players.title' ],
  [ '#playersTable thead th:nth-child(2)', 'textContent', 'players.player' ],
  [ '#playersTable thead th:nth-child(4)', 'textContent', 'players.connections' ],
  [ '#localPlayerName', 'placeholder', 'players.addPlaceholder' ],
  [ '#addLocalPlayerButton', 'title', 'players.addTitle' ],
  [ '#playersShareButton', 'title', 'players.shareTitle' ],
  [ '#playersHelp > summary', 'textContent', 'players.helpTogether' ],
  [ '#playersButtonHelp > summary', 'textContent', 'players.helpButtons' ],
  [ '#returnOverlay p', 'textContent', 'room.returnHint' ],
  [ '#returnOverlay button', 'textContent', 'room.return' ],
  [ '#filterByText', 'placeholder', 'library.searchPlaceholder' ],
  [ '#filterByPlayers option:first-child', 'textContent', 'common.any' ],
  [ '#filterByDuration option:first-child', 'textContent', 'common.any' ],
  [ '#filterByLanguage option:first-child', 'textContent', 'common.any' ],
  [ '#filterByMode option:first-child', 'textContent', 'common.any' ],
  [ '#filterByAi option:first-child', 'textContent', 'common.any' ],
  [ '#filterByAi option[value="no-ai"]', 'textContent', 'library.noAi' ],
  [ '#filterByAi option[value="ai"]', 'textContent', 'library.usesAi' ],
  [ '#librarySort option[value="name"]', 'textContent', 'library.sortName' ],
  [ '#librarySort option[value="similarName"]', 'textContent', 'library.sortSimilarName' ],
  [ '#librarySort option[value="stars"]', 'textContent', 'library.sortStars' ],
  [ '#librarySort option[value="timePlayed"]', 'textContent', 'library.sortPopularity' ],
  [ '#librarySort option[value="lastUpdate"]', 'textContent', 'library.sortUpdated' ],
  [ '#librarySort option[value="year"]', 'textContent', 'library.sortYear' ],
  [ '#updateSaveState', 'textContent', 'library.updateLoaded' ],
  [ '#saveState', 'textContent', 'library.saveActive' ],
  [ '#addState', 'textContent', 'library.addGame' ],
  [ '#emptyLibrary', 'innerHTML', 'library.empty' ],
  [ '#emptyLibraryByFilter', 'innerHTML', 'library.noResults' ],
  [ '#stateAddOverlay h1', 'textContent', 'addGame.title' ],
  [ '#stateAddOverlay button[icon="upload"]', 'textContent', 'common.upload' ],
  [ '#stateAddOverlay button[icon="link"]', 'textContent', 'addGame.link' ],
  [ '#stateAddOverlay button[icon="save"]', 'textContent', 'addGame.saveRoom' ],
  [ '#stateSaveOverlay h1', 'textContent', 'saveGame.title' ],
  [ '#stateSaveOverlay button[icon="undo"]', 'textContent', 'common.cancel' ],
  [ '#stateSaveOverlay button[icon="save"]', 'textContent', 'saveGame.button' ],
  [ '#helpTexts h3[data-showfor="importerWarnings"]', 'textContent', 'library.importNotes' ],
  [ '#helpTexts h3[data-showfor="ruleText"]', 'textContent', 'library.howToPlay' ],
  [ '#helpTexts h3[data-showfor="helpText"]', 'textContent', 'library.howToUse' ],
  [ '#helpTexts h3[data-showfor="attribution"]', 'textContent', 'library.attribution' ],
  [ '#shareLinkOverlay h1', 'textContent', 'share.title' ],
  [ '#shareLinkOverlay .plGameInfo', 'textContent', 'share.publicInfo' ],
  [ '#shareLinkOverlay button[icon="share"]', 'textContent', 'common.share' ],
  [ '#welcomePlayButton', 'textContent', 'welcome.createRoom' ],
  [ '#linkDetailsOverlay .ai-imagery-notice span', 'textContent', 'library.aiNotice' ],
  [ '#aboutOverlay .about_title h1', 'textContent', 'about.title' ]
];

const VTT_I18N_ORIGINAL_VALUES = new WeakMap();
let vttI18nLocale = resolveInitialLocale();
let vttI18nStates = null;
let vttI18nWelcomeState = null;
let vttI18nRefreshQueued = false;
let vttI18nNeedsLibraryUpdate = false;

export function normalizeLocale(locale) {
  const value = String(locale || '').trim();
  if(/^zh(?:-|$)/i.test(value))
    return 'zh-CN';
  return VTT_I18N_SUPPORTED.includes(value) ? value : 'en';
}

function resolveInitialLocale() {
  try {
    const stored = typeof localStorage != 'undefined' && localStorage.getItem(VTT_I18N_STORAGE_KEY);
    if(stored)
      return normalizeLocale(stored);
  } catch(e) {}

  if(typeof navigator != 'undefined') {
    const languages = Array.isArray(navigator.languages) && navigator.languages.length ? navigator.languages : [ navigator.language ];
    for(const language of languages)
      if(/^zh(?:-|$)/i.test(String(language || '')))
        return 'zh-CN';
  }
  return 'en';
}

export function getLocale() {
  return vttI18nLocale;
}

export function translateMessage(locale, key, variables = {}) {
  const normalized = normalizeLocale(locale);
  let value = VTT_I18N_MESSAGES[normalized] && VTT_I18N_MESSAGES[normalized][key];
  if(value === undefined)
    value = VTT_I18N_MESSAGES.en[key];
  if(value === undefined)
    return key;
  return String(value).replace(/\{([A-Za-z0-9_]+)\}/g, (match, name)=>variables[name] === undefined ? match : String(variables[name]));
}

export function t(key, variables = {}) {
  return translateMessage(vttI18nLocale, key, variables);
}

export function localizeGameMetaForLocale(state, locale) {
  state = state || {};
  const normalized = normalizeLocale(locale);
  if(normalized == 'en')
    return { ...state };

  const inline = state.i18n && state.i18n[normalized] || state.translations && state.translations[normalized] || {};
  const builtIn = normalized == 'zh-CN'
    ? VTT_ZH_GAME_TRANSLATIONS[state.publicLibrary] || VTT_ZH_GAME_TRANSLATIONS[state.name] || {}
    : {};
  const similarBuiltIn = normalized == 'zh-CN' && VTT_ZH_GAME_TRANSLATIONS[state.similarName] || {};

  return {
    ...state,
    name: inline.name || builtIn.name || state.name,
    description: inline.description || builtIn.description || state.description,
    similarName: inline.similarName || similarBuiltIn.name || state.similarName
  };
}

export function localizeGameMeta(state) {
  return localizeGameMetaForLocale(state, vttI18nLocale);
}

export function localizeGameField(state, field) {
  const localized = localizeGameMeta(state);
  return localized[field] === undefined ? state && state[field] : localized[field];
}

function setBoundValue(node, property, value) {
  if(!node)
    return;
  let originals = VTT_I18N_ORIGINAL_VALUES.get(node);
  if(!originals) {
    originals = {};
    VTT_I18N_ORIGINAL_VALUES.set(node, originals);
  }
  if(!(property in originals))
    originals[property] = property == 'aria-label' ? node.getAttribute(property) : node[property];

  const nextValue = vttI18nLocale == 'en' ? originals[property] : value;
  if(property == 'aria-label') {
    if(nextValue == null)
      node.removeAttribute(property);
    else if(node.getAttribute(property) != nextValue)
      node.setAttribute(property, nextValue);
  } else if(node[property] != nextValue) {
    node[property] = nextValue;
  }
}

function translateStaticBindings() {
  if(typeof document == 'undefined')
    return;
  for(const [ selector, property, key ] of VTT_I18N_STATIC_BINDINGS)
    setBoundValue(document.querySelector(selector), property, t(key));

  const emptyLibrary = document.querySelector('#emptyLibrary');
  if(vttI18nLocale != 'en' && emptyLibrary && !Object.keys(typeof config == 'undefined' ? {} : config.libraries || {}).length)
    emptyLibrary.innerHTML = t('library.emptyNoPublic');
}

function translateInlineLabels() {
  if(typeof document == 'undefined')
    return;

  const textMappings = vttI18nLocale == 'zh-CN' ? {
    'Similar to:': t('library.similarPrefix'),
    'Time:': t('library.time'),
    'minutes': t('library.minutes'),
    'Mode:': t('library.mode'),
    'Skill:': t('library.skill'),
    'Room URL:': t('welcome.roomUrl'),
    'Player name:': t('welcome.playerName')
  } : {};

  for(const root of [ document.querySelector('#mainDetails .details'), document.querySelector('#similarDetails .details'), document.querySelector('#linkDetailsOverlay .details'), document.querySelector('#linkDetailsOverlay .welcomeInput') ]) {
    if(!root)
      continue;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while(walker.nextNode()) {
      const node = walker.currentNode;
      const trimmed = node.nodeValue.trim();
      if(!trimmed)
        continue;
      if(!node.__vttI18nOriginal)
        node.__vttI18nOriginal = node.nodeValue;
      if(vttI18nLocale == 'en') {
        if(node.nodeValue != node.__vttI18nOriginal)
          node.nodeValue = node.__vttI18nOriginal;
      } else if(textMappings[trimmed]) {
        const leading = node.nodeValue.match(/^\s*/)[0];
        const trailing = node.nodeValue.match(/\s*$/)[0];
        const next = leading + textMappings[trimmed] + trailing;
        if(node.nodeValue != next)
          node.nodeValue = next;
      }
    }
  }
}

function ensureLanguageSelector() {
  if(typeof document == 'undefined')
    return;
  const host = document.querySelector('#aboutOverlay .about_title');
  if(!host)
    return;

  let wrapper = document.querySelector('#vttLanguageSetting');
  if(!wrapper) {
    wrapper = document.createElement('label');
    wrapper.id = 'vttLanguageSetting';
    wrapper.style.display = 'flex';
    wrapper.style.alignItems = 'center';
    wrapper.style.gap = '8px';
    wrapper.style.marginTop = '10px';

    const text = document.createElement('span');
    text.className = 'languageLabel';
    wrapper.appendChild(text);

    const select = document.createElement('select');
    select.id = 'languageSelect';
    for(const [ value, label ] of [ [ 'en', 'English' ], [ 'zh-CN', '简体中文' ] ]) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      select.appendChild(option);
    }
    select.addEventListener('change', event=>setLocale(event.target.value));
    wrapper.appendChild(select);
    host.appendChild(wrapper);
  }

  wrapper.querySelector('.languageLabel').textContent = t('language.label');
  wrapper.querySelector('select').value = vttI18nLocale;
}

function translateGeneratedCategories() {
  if(typeof document == 'undefined')
    return;
  const mappings = {
    'In-Progress Games': 'library.inProgress',
    'Game Shelf': 'library.gameShelf',
    'Public Library': 'library.publicLibrary',
    'Games': 'library.games',
    'Tutorials': 'library.tutorials'
  };

  for(const node of document.querySelectorAll('#statesList h2.title, .libraryTypeTabs button, #filterByType option')) {
    if(!node.dataset.i18nCanonical)
      node.dataset.i18nCanonical = node.textContent.trim();
    const canonical = node.dataset.i18nCanonical;
    const key = mappings[canonical];
    const next = vttI18nLocale == 'en' ? canonical : key ? t(key) : canonical;
    if(node.textContent.trim() != next)
      node.textContent = next;
  }
}

function translateGeneratedPlayerText() {
  if(typeof document == 'undefined')
    return;

  for(const label of document.querySelectorAll('#playersTable .sessionLabel')) {
    if(!label.dataset.i18nCanonical || /^Connection [0-9]+/.test(label.textContent) || [ 'connected', 'not connected' ].includes(label.textContent))
      label.dataset.i18nCanonical = label.textContent;
    const canonical = label.dataset.i18nCanonical;
    let next = canonical;
    if(vttI18nLocale != 'en') {
      if(canonical == 'connected')
        next = t('players.connected');
      else if(canonical == 'not connected')
        next = t('players.notConnected');
      else {
        const match = canonical.match(/^Connection ([0-9]+)( \(you\))?$/);
        if(match)
          next = t('players.connection', { count: match[1] }) + (match[2] ? `（${t('players.you')}）` : '');
      }
    }
    if(label.textContent != next)
      label.textContent = next;
  }

  const playerTooltip = document.querySelector('#playersButton .tooltip');
  if(playerTooltip) {
    const englishCount = playerTooltip.textContent.match(/^Players: ([0-9]+)$/);
    if(englishCount)
      playerTooltip.dataset.i18nCount = englishCount[1];
    const count = playerTooltip.dataset.i18nCount;
    const next = count ? (vttI18nLocale == 'en' ? `Players: ${count}` : t('toolbar.playersCount', { count })) : t('toolbar.players');
    if(playerTooltip.textContent != next)
      playerTooltip.textContent = next;
  }

  for(const row of document.querySelectorAll('#playersTable tbody tr')) {
    const rename = row.querySelector('.renamePlayer');
    const view = row.querySelector('.viewPlayer');
    const remove = row.querySelector('.removePlayer');
    if(rename)
      setBoundValue(rename, 'title', t('players.renameTitle'));
    if(view && !view.classList.contains('unavailable'))
      setBoundValue(view, 'title', t('players.viewTitle'));
    if(remove && !remove.title.startsWith('Remove ') || remove && remove.title == VTT_I18N_MESSAGES.en['players.removeTitle'])
      setBoundValue(remove, 'title', t('players.removeTitle'));
  }

  const addButton = document.querySelector('#addLocalPlayerButton');
  if(addButton && vttI18nLocale != 'en' && addButton.title == VTT_I18N_MESSAGES.en['players.addSwitchTitle'])
    addButton.title = t('players.addSwitchTitle');

  const inviteStatus = document.querySelector('#playerInviteStatus');
  if(inviteStatus && vttI18nLocale != 'en') {
    if(inviteStatus.textContent == VTT_I18N_MESSAGES.en['players.urlCopied'])
      inviteStatus.textContent = t('players.urlCopied');
    else if(inviteStatus.textContent == VTT_I18N_MESSAGES.en['players.urlShared'])
      inviteStatus.textContent = t('players.urlShared');
  }
}

function refreshLocalizedGameDOM() {
  if(typeof document == 'undefined')
    return;

  if(vttI18nStates) {
    for(const entry of document.querySelectorAll('#statesList .roomState[data-id]')) {
      const state = vttI18nStates[entry.dataset.id];
      if(!state)
        continue;
      const display = localizeGameMeta(state);
      const title = entry.querySelector('h3');
      if(title && title.textContent != (display.name || ''))
        title.textContent = display.name || '';

      const subtitle = entry.querySelector('h4');
      if(subtitle && !state.savePlayers) {
        const nextSubtitle = display.similarName && display.name != display.similarName ? t('library.similarTo', { name: display.similarName }) : '';
        if(subtitle.textContent != nextSubtitle)
          subtitle.textContent = nextSubtitle;
      }

      entry.dataset.name = display.name || state.name || '';
      entry.dataset.similarName = display.similarName || state.similarName || '';
      if(!entry.dataset.i18nBaseText)
        entry.dataset.i18nBaseText = entry.dataset.text || '';
      entry.dataset.text = `${entry.dataset.i18nBaseText} ${display.name || ''} ${display.description || ''} ${display.similarName || ''}`.toLowerCase();
    }

    const details = document.querySelector('#stateDetailsOverlay');
    if(details) {
      const state = vttI18nStates[details.dataset.id];
      if(state) {
        // Editing always exposes the canonical metadata. This is essential: a Chinese display
        // translation must never be saved back as the game's real name or description merely
        // because the user opened the metadata editor while the UI language was Chinese.
        const display = details.classList.contains('editing') ? state : localizeGameMeta(state);
        const name = details.querySelector('#mainDetails [data-field="name"]');
        const description = details.querySelector('#mainDetails [data-field="description"]');
        const similarName = details.querySelector('#similarDetails [data-field="similarName"]');
        if(name && name.textContent != (display.name || ''))
          name.textContent = display.name || '';
        if(description && description.textContent != (display.description || ''))
          description.textContent = display.description || '';
        if(similarName && similarName.textContent != (display.similarName || ''))
          similarName.textContent = display.similarName || '';
      }

      for(const button of details.querySelectorAll('.variant [icon="play_arrow"]'))
        setBoundValue(button, 'textContent', t('library.play'));
    }
  }

  if(vttI18nWelcomeState) {
    const display = localizeGameMeta(vttI18nWelcomeState);
    for(const node of document.querySelectorAll('#linkDetailsOverlay [data-field="name"], #welcomeGameName'))
      if(node.textContent != (display.name || ''))
        node.textContent = display.name || '';
    const description = document.querySelector('#linkDetailsOverlay [data-field="description"]');
    if(description && description.textContent != (display.description || ''))
      description.textContent = display.description || '';
    const similar = document.querySelector('#linkDetailsOverlay [data-field="similarName"]');
    if(similar && display.similarName !== undefined && similar.textContent != display.similarName)
      similar.textContent = display.similarName || '';
    if(display.name && typeof config != 'undefined') {
      const tabSuffix = config.customTab || config.serverName || 'VirtualTabletop.io';
      document.title = `${display.name} - ${tabSuffix}`;
    }
  }
}

function updateLocalizedLibraryBehavior() {
  if(!vttI18nNeedsLibraryUpdate)
    return;
  vttI18nNeedsLibraryUpdate = false;

  if(typeof resortStatesList == 'function')
    resortStatesList();
  if(typeof updateLibraryFilter == 'function')
    updateLibraryFilter();

  // updateLibraryFilter() owns the canonical English empty-state copy, so reapply the
  // presentation translation after it has recomputed the visibility hints.
  translateStaticBindings();
}

export function setI18nWelcomeState(state) {
  vttI18nWelcomeState = state || null;
  queueI18nRefresh();
}

function queueI18nRefresh() {
  if(vttI18nRefreshQueued || typeof window == 'undefined')
    return;
  vttI18nRefreshQueued = true;
  setTimeout(function() {
    vttI18nRefreshQueued = false;
    applyUITranslations();
  }, 0);
}

export function applyUITranslations() {
  if(typeof document == 'undefined')
    return;
  document.documentElement.lang = vttI18nLocale;
  translateStaticBindings();
  ensureLanguageSelector();
  translateGeneratedCategories();
  translateGeneratedPlayerText();
  refreshLocalizedGameDOM();
  translateInlineLabels();
  updateLocalizedLibraryBehavior();
}

export function setLocale(locale) {
  const next = normalizeLocale(locale);
  if(next == vttI18nLocale) {
    applyUITranslations();
    return;
  }
  vttI18nLocale = next;
  vttI18nNeedsLibraryUpdate = true;
  try {
    if(typeof localStorage != 'undefined')
      localStorage.setItem(VTT_I18N_STORAGE_KEY, next);
  } catch(e) {}
  applyUITranslations();
  if(typeof window != 'undefined')
    window.dispatchEvent(new CustomEvent('vtt-languagechange', { detail: { locale: next } }));
}

if(typeof window != 'undefined' && typeof onLoad != 'undefined') {
  onLoad(function() {
    applyUITranslations();

    if(typeof onMessage != 'undefined') {
      onMessage('meta', function(args) {
        vttI18nStates = args && args.meta && args.meta.states || null;
        vttI18nNeedsLibraryUpdate = true;
        queueI18nRefresh();
      });
    }

    for(const selector of [ '#statesList', '#stateDetailsOverlay', '#playerOverlay', '#linkDetailsOverlay' ]) {
      const root = document.querySelector(selector);
      if(!root)
        continue;
      const options = { childList: true, subtree: true, characterData: true };
      if(selector == '#stateDetailsOverlay') {
        options.attributes = true;
        options.attributeFilter = [ 'class', 'data-id' ];
      }
      new MutationObserver(queueI18nRefresh).observe(root, options);
    }

    window.addEventListener('vtt-languagechange', queueI18nRefresh);
  });
}
