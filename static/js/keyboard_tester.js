/* 键盘按键测试（keyboard_tester）- 可视化键盘布局渲染＋keydown/keyup 三态高亮＋连击检测＋测试报告，纯前端零上传
* 纯函数契约（失败约定沿用家族惯例：非法参数抛 Error，err.field 给出字段名，不静默钳制）：
* LAYOUT_SIZES = [87, 104, 108]；layoutLabel(104) -> '104 键（全尺寸）'
* getLayoutKeys(layout) -> [{code, label, x, y, w, h}]（x/y/w/h 以标准键位 u 为单位；87/104/108 键数精确）
* 87 键：主区＋功能区＋方向区（无数字区）；104 键：87＋17 键数字区；108 键：104＋顶部 4 颗媒体键（静音/音量-/音量+/邮件）
* layout 非 87/104/108 抛 Error（err.field='layout'）
* getLayoutCodes(layout) -> [code...]（布局内全部按键 code，按渲染顺序）
* validateKeyboardConfig(config) -> {ok:true}；config.layout 非 87/104/108 抛 Error（err.field='layout'）
* recordKeyEvent(events, event) -> 新数组（追加 {code, type, time, repeat}）
* events 非数组抛 Error（err.field='events'）；event 非对象或缺 code 抛 Error（err.field='event'）
* type 非 'keyup' 一律记 'keydown'；time 非数字取 Date.now()；repeat 非真值记 false
* detectChatter(events, thresholdMs) -> [{code, presses, chatterCount, hits:[{time, prevTime, gap}]}]
* 同一 code 的 keydown 时间戳升序排列，相邻按下间隔 gap < thresholdMs 即记一次连击嫌疑
* thresholdMs 非有限数字或超出 [1,2000] 抛 Error（err.field='thresholdMs'）；events 非数组抛 Error（err.field='events'）
* buildKeyReport(events, layout, opts) -> 文本测试报告
* 章节：布局/生成时间/连击阈值、统计（总数/已触发/未触发/事件数）、触发按键序列、连击嫌疑、未触发按键
* opts={thresholdMs, nowText}；nowText 不传取当前本地时间（调用方传入固定值可保证确定性）
* layout 非法抛 Error（err.field='layout'）；thresholdMs 非法抛 Error（err.field='thresholdMs'）
* buildKeyboardFileName(date) -> 'keyboard_test_report_YYYYMMDD_HHmmss.txt'（date 不传取当前时间）
* CHATTER_DEFAULT_MS=200（连击阈值默认），CHATTER_MIN_MS=1，CHATTER_MAX_MS=2000
* 布局/阈值持久：localStorage 版本化键 toolweb.keyboard_tester.v1
* 零网络请求：本文件不发起任何 fetch / XHR；复制走 navigator.clipboard（带降级），下载走 Blob＋a[download]。 */
(function () {
  'use strict';

  /* ---------- 常量 ---------- */
  var LAYOUT_SIZES = [87, 104, 108];
  var LAYOUT_NAMES = {
    87: 'TKL·无数字区',
    104: '全尺寸',
    108: '全尺寸＋媒体键'
  };
  function layoutLabel(layout) { return layout + ' 键（' + LAYOUT_NAMES[layout] + '）';}
  /* 章节括号(U+3010/U+3011)：文件写入管线会吞掉该字面量，运行时用 codepoint 构造 */
  var SEC_L = String.fromCharCode(0x3010), SEC_R = String.fromCharCode(0x3011);
  function secHead(name) { return SEC_L + name + SEC_R;}
  var CHATTER_DEFAULT_MS = 200;
  var CHATTER_MIN_MS = 1;
  var CHATTER_MAX_MS = 2000;
  var LS_KEY = 'toolweb.keyboard_tester.v1';
  var LS_VERSION = 1;

  /* ---------- 布局数据（u = 标准键位单位） ----------
  * 主区行宽 15u；功能行 16u（Esc＋F1-F12＋PrtSc/ScrLk/Pause，组间 0.5u 间隔）；
  * 方向区宽 3u；数字区宽 4u；簇间距 1u。108 键在功能行 Pause 右侧追加 4 颗媒体键。 */
  function funcRowKeys() {
    var keys = [{ code: 'Escape', label: 'Esc', x: 0, y: 0, w: 1, h: 1}];
    for (var i = 1; i <= 12; i++) {
      var x = 2 + (i - 1);
      if (i > 4) x += 0.5;
      if (i > 8) x += 0.5;
      keys.push({ code: 'F' + i, label: 'F' + i, x: x, y: 0, w: 1, h: 1});
    }
    keys.push({ code: 'PrintScreen', label: 'PrtSc', x: 15.5, y: 0, w: 1, h: 1});
    keys.push({ code: 'ScrollLock', label: 'ScrLk', x: 16.5, y: 0, w: 1, h: 1});
    keys.push({ code: 'Pause', label: 'Pause', x: 17.5, y: 0, w: 1, h: 1});
    return keys;
  }

  function mediaRowKeys(baseX) {
    return [
    { code: 'VolumeMute', label: '静音', x: baseX, y: 0, w: 1, h: 1},
    { code: 'VolumeDown', label: '音量-', x: baseX + 1, y: 0, w: 1, h: 1},
    { code: 'VolumeUp', label: '音量+', x: baseX + 2, y: 0, w: 1, h: 1},
    { code: 'LaunchMail', label: '邮件', x: baseX + 3, y: 0, w: 1, h: 1}
    ];
  }

  function mainRowKeys() {
    var keys = [];
    /* y=1：` 1..0 - = Backspace(2u) */
    keys.push({ code: 'Backquote', label: '`', x: 0, y: 1, w: 1, h: 1});
    var digits = '1234567890';
    for (var i = 0; i < 10; i++) keys.push({ code: 'Digit' + digits[i], label: digits[i], x: 1 + i, y: 1, w: 1, h: 1});
    keys.push({ code: 'Minus', label: '-', x: 11, y: 1, w: 1, h: 1});
    keys.push({ code: 'Equal', label: '=', x: 12, y: 1, w: 1, h: 1});
    keys.push({ code: 'Backspace', label: 'Back', x: 13, y: 1, w: 2, h: 1});
    /* y=2：Tab(1.5u) Q..P [] \(1.5u) */
    keys.push({ code: 'Tab', label: 'Tab', x: 0, y: 2, w: 1.5, h: 1});
    var row2 = 'QWERTYUIOP';
    for (var j = 0; j < 10; j++) keys.push({ code: 'Key' + row2[j], label: row2[j], x: 1.5 + j, y: 2, w: 1, h: 1});
    keys.push({ code: 'BracketLeft', label: '[', x: 11.5, y: 2, w: 1, h: 1});
    keys.push({ code: 'BracketRight', label: ']', x: 12.5, y: 2, w: 1, h: 1});
    keys.push({ code: 'Backslash', label: '\\', x: 13.5, y: 2, w: 1.5, h: 1});
    /* y=3：CapsLock(1.75u) A..L; ' Enter(2.25u) */
    keys.push({ code: 'CapsLock', label: 'Caps', x: 0, y: 3, w: 1.75, h: 1});
    var row3 = 'ASDFGHJKL';
    for (var k = 0; k < 9; k++) keys.push({ code: 'Key' + row3[k], label: row3[k], x: 1.75 + k, y: 3, w: 1, h: 1});
    keys.push({ code: 'Semicolon', label: ';', x: 10.75, y: 3, w: 1, h: 1});
    keys.push({ code: 'Quote', label: "'", x: 11.75, y: 3, w: 1, h: 1});
    keys.push({ code: 'Enter', label: 'Enter', x: 12.75, y: 3, w: 2.25, h: 1});
    /* y=4：Shift(2.25u) Z..M,. / Shift(2.75u) */
    keys.push({ code: 'ShiftLeft', label: 'Shift', x: 0, y: 4, w: 2.25, h: 1});
    var row4 = 'ZXCVBNM';
    for (var m = 0; m < 7; m++) keys.push({ code: 'Key' + row4[m], label: row4[m], x: 2.25 + m, y: 4, w: 1, h: 1});
    keys.push({ code: 'Comma', label: ',', x: 9.25, y: 4, w: 1, h: 1});
    keys.push({ code: 'Period', label: '.', x: 10.25, y: 4, w: 1, h: 1});
    keys.push({ code: 'Slash', label: '/', x: 11.25, y: 4, w: 1, h: 1});
    keys.push({ code: 'ShiftRight', label: 'Shift', x: 12.25, y: 4, w: 2.75, h: 1});
    /* y=5：Ctrl(1.25u) Win(1.25u) Alt(1.25u) Space(6.25u) Alt(1.25u) Win(1.25u) Menu(1.25u) Ctrl(1.25u) */
    keys.push({ code: 'ControlLeft', label: 'Ctrl', x: 0, y: 5, w: 1.25, h: 1});
    keys.push({ code: 'MetaLeft', label: 'Win', x: 1.25, y: 5, w: 1.25, h: 1});
    keys.push({ code: 'AltLeft', label: 'Alt', x: 2.5, y: 5, w: 1.25, h: 1});
    keys.push({ code: 'Space', label: 'Space', x: 3.75, y: 5, w: 6.25, h: 1});
    keys.push({ code: 'AltRight', label: 'Alt', x: 10, y: 5, w: 1.25, h: 1});
    keys.push({ code: 'MetaRight', label: 'Win', x: 11.25, y: 5, w: 1.25, h: 1});
    keys.push({ code: 'ContextMenu', label: 'Menu', x: 12.5, y: 5, w: 1.25, h: 1});
    keys.push({ code: 'ControlRight', label: 'Ctrl', x: 13.75, y: 5, w: 1.25, h: 1});
    return keys;
  }

  function navKeys(baseX) {
    return [
    { code: 'Insert', label: 'Ins', x: baseX, y: 1, w: 1, h: 1},
    { code: 'Home', label: 'Home', x: baseX + 1, y: 1, w: 1, h: 1},
    { code: 'PageUp', label: 'PgUp', x: baseX + 2, y: 1, w: 1, h: 1},
    { code: 'Delete', label: 'Del', x: baseX, y: 2, w: 1, h: 1},
    { code: 'End', label: 'End', x: baseX + 1, y: 2, w: 1, h: 1},
    { code: 'PageDown', label: 'PgDn', x: baseX + 2, y: 2, w: 1, h: 1},
    { code: 'ArrowUp', label: 'Up', x: baseX + 1, y: 4, w: 1, h: 1},
    { code: 'ArrowLeft', label: 'Left', x: baseX, y: 5, w: 1, h: 1},
    { code: 'ArrowDown', label: 'Down', x: baseX + 1, y: 5, w: 1, h: 1},
    { code: 'ArrowRight', label: 'Right', x: baseX + 2, y: 5, w: 1, h: 1}
    ];
  }

  function numpadKeys(baseX) {
    return [
    { code: 'NumLock', label: 'Num', x: baseX, y: 1, w: 1, h: 1},
    { code: 'NumpadDivide', label: '/', x: baseX + 1, y: 1, w: 1, h: 1},
    { code: 'NumpadMultiply', label: '*', x: baseX + 2, y: 1, w: 1, h: 1},
    { code: 'NumpadSubtract', label: '-', x: baseX + 3, y: 1, w: 1, h: 1},
    { code: 'Numpad7', label: '7', x: baseX, y: 2, w: 1, h: 1},
    { code: 'Numpad8', label: '8', x: baseX + 1, y: 2, w: 1, h: 1},
    { code: 'Numpad9', label: '9', x: baseX + 2, y: 2, w: 1, h: 1},
    { code: 'NumpadAdd', label: '+', x: baseX + 3, y: 2, w: 1, h: 2},
    { code: 'Numpad4', label: '4', x: baseX, y: 3, w: 1, h: 1},
    { code: 'Numpad5', label: '5', x: baseX + 1, y: 3, w: 1, h: 1},
    { code: 'Numpad6', label: '6', x: baseX + 2, y: 3, w: 1, h: 1},
    { code: 'Numpad1', label: '1', x: baseX, y: 4, w: 1, h: 1},
    { code: 'Numpad2', label: '2', x: baseX + 1, y: 4, w: 1, h: 1},
    { code: 'Numpad3', label: '3', x: baseX + 2, y: 4, w: 1, h: 1},
    { code: 'NumpadEnter', label: 'Enter', x: baseX + 3, y: 4, w: 1, h: 2},
    { code: 'Numpad0', label: '0', x: baseX, y: 5, w: 2, h: 1},
    { code: 'NumpadDecimal', label: '.', x: baseX + 2, y: 5, w: 1, h: 1}
    ];
  }

  /* 按渲染顺序拼装布局键位：功能行 → y=1..5（主区/方向区/数字区交错）。 */
  function buildLayoutKeys(size) {
    var keys = funcRowKeys();
    var navBase = 19.5, numpadBase = 23.5;
    if (size === 108) {
      keys = keys.concat(mediaRowKeys(19.5));
      navBase = 24.5;
      numpadBase = 28.5;
    }
    var main = mainRowKeys();
    var nav = navKeys(navBase);
    var numpad = size >= 104? numpadKeys(numpadBase): [];
    for (var y = 1; y <= 5; y++) {
      var i;
      for (i = 0; i < main.length; i++) if (main[i].y === y) keys.push(main[i]);
      for (i = 0; i < nav.length; i++) if (nav[i].y === y) keys.push(nav[i]);
      for (i = 0; i < numpad.length; i++) if (numpad[i].y === y) keys.push(numpad[i]);
    }
    return keys;
  }

  var LAYOUT_CACHE = {};
  function getLayoutKeys(layout) {
    validateKeyboardConfig({ layout: layout});
    if (!LAYOUT_CACHE[layout]) LAYOUT_CACHE[layout] = buildLayoutKeys(layout);
    return LAYOUT_CACHE[layout].slice();
  }

  function getLayoutCodes(layout) {
    return getLayoutKeys(layout).map(function (k) { return k.code;});
  }

  function errOf(field, message) {
    var e = new Error(message);
    e.field = field;
    return e;
  }

  /* ---------- 纯函数：配置校验 ---------- */
  function validateKeyboardConfig(config) {
    var layout = config && config.layout;
    if (layout!== 87 && layout!== 104 && layout!== 108) {
      throw errOf('layout', 'layout 须为 87、104 或 108（实得 ' + String(layout) + '）');
    }
    return { ok: true};
  }

  /* ---------- 纯函数：事件追加 ---------- */
  function recordKeyEvent(events, event) {
    if (!Array.isArray(events)) throw errOf('events', 'events 须为数组');
    if (!event || typeof event!== 'object' || typeof event.code!== 'string' || event.code === '') {
      throw errOf('event', 'event 须为含非空 code 的对象');
    }
    var rec = {
      code: event.code,
      type: event.type === 'keyup'? 'keyup': 'keydown',
      time: typeof event.time === 'number'? event.time: Date.now(),
      repeat:!!event.repeat
    };
    var out = events.slice();
    out.push(rec);
    return out;
  }

  /* ---------- 纯函数：连击检测 ---------- */
  function validateChatterThreshold(thresholdMs) {
    if (typeof thresholdMs!== 'number' ||!isFinite(thresholdMs) ||
    thresholdMs < CHATTER_MIN_MS || thresholdMs > CHATTER_MAX_MS) {
      throw errOf('thresholdMs', 'thresholdMs 须为 ' + CHATTER_MIN_MS + '–' + CHATTER_MAX_MS + ' 之间的有限数字（实得 ' + String(thresholdMs) + '）');
    }
  }

  function detectChatter(events, thresholdMs) {
    if (!Array.isArray(events)) throw errOf('events', 'events 须为数组');
    validateChatterThreshold(thresholdMs);
    var byCode = {}, order = [];
    for (var i = 0; i < events.length; i++) {
      var e = events[i];
      if (!e || e.type === 'keyup' || typeof e.code!== 'string') continue;
      if (!byCode[e.code]) { byCode[e.code] = []; order.push(e.code);}
      if (typeof e.time === 'number') byCode[e.code].push(e.time);
    }
    var result = [];
    for (var j = 0; j < order.length; j++) {
      var code = order[j];
      var times = byCode[code].slice().sort(function (a, b) { return a - b;});
      var hits = [];
      for (var k = 1; k < times.length; k++) {
        var gap = times[k] - times[k - 1];
        if (gap < thresholdMs) hits.push({ time: times[k], prevTime: times[k - 1], gap: gap});
      }
      if (hits.length > 0) {
        result.push({ code: code, presses: times.length, chatterCount: hits.length, hits: hits});
      }
    }
    return result;
  }

  /* ---------- 纯函数：报告与文件名 ---------- */
  function pad2(n) { return (n < 10? '0': '') + n;}
  function formatLocal(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' +
    pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
  }

  function buildKeyboardFileName(date) {
    var d = date instanceof Date? date: new Date();
    return 'keyboard_test_report_' + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) +
    '_' + pad2(d.getHours()) + pad2(d.getMinutes()) + pad2(d.getSeconds()) + '.txt';
  }

  function buildKeyReport(events, layout, opts) {
    if (!Array.isArray(events)) throw errOf('events', 'events 须为数组');
    validateKeyboardConfig({ layout: layout});
    opts = opts || {};
    var thresholdMs = opts.thresholdMs === undefined? CHATTER_DEFAULT_MS: opts.thresholdMs;
    validateChatterThreshold(thresholdMs);
    var nowText = typeof opts.nowText === 'string'? opts.nowText: formatLocal(new Date());

    var codes = getLayoutCodes(layout);
    var seen = {};
    var seqLines = [];
    for (var i = 0; i < events.length; i++) {
      var e = events[i];
      if (!e || typeof e.code!== 'string') continue;
      seen[e.code] = true;
      seqLines.push((i + 1) + '. [' + e.time + 'ms] ' + e.code + ' ' + (e.type === 'keyup'? '松开': '按下') + (e.repeat? '（自动重复）': ''));
    }
    var triggeredCount = Object.keys(seen).length;
    var untriggered = [];
    for (var j = 0; j < codes.length; j++) if (!seen[codes[j]]) untriggered.push(codes[j]);
    var rate = codes.length > 0? (triggeredCount / codes.length * 100).toFixed(1): '0.0';

    var chatters = detectChatter(events, thresholdMs);
    var chatterLines = [];
    if (chatters.length === 0) {
      chatterLines.push('无（全部按键按下间隔均 ≥' + thresholdMs + 'ms）');
    } else {
      for (var k = 0; k < chatters.length; k++) {
        var c = chatters[k];
        var gaps = c.hits.map(function (h) { return h.gap + 'ms';}).join('、');
        chatterLines.push('- ' + c.code + '：按下 ' + c.presses + ' 次，其中 ' + c.chatterCount +
        ' 次按下间隔 ' + gaps + '（<' + thresholdMs + 'ms），疑似连击');
      }
    }

    var lines = [];
    lines.push('键盘按键测试报告');
    lines.push('================');
    lines.push('布局：' + layoutLabel(layout));
    lines.push('生成时间：' + nowText);
    lines.push('连击检测阈值：' + thresholdMs + 'ms');
    lines.push('');
    lines.push(secHead('统计'));
    lines.push('测试按键总数：' + codes.length);
    lines.push('已触发按键：' + triggeredCount + '（' + rate + '%）');
    lines.push('未触发按键：' + untriggered.length);
    lines.push('记录事件总数：' + events.length);
    lines.push('');
    lines.push(secHead('触发按键序列'));
    if (seqLines.length === 0) lines.push('（暂无按键事件）');
    else lines.push(seqLines.join('\n'));
    lines.push('');
    lines.push(secHead('连击嫌疑'));
    lines.push(chatterLines.join('\n'));
    lines.push('');
    lines.push(secHead('未触发按键（' + untriggered.length + ' 个）'));
    lines.push(untriggered.length === 0? '无（全部按键均已触发）': untriggered.join(', '));
    return lines.join('\n');
  }

  /* ---------- 浏览器交互（node 下不执行） ---------- */
  function $(id) { return document.getElementById(id);}

  function loadPersist() {
    try {
      var raw = window.localStorage.getItem(LS_KEY);
      if (!raw) return null;
      var o = JSON.parse(raw);
      return (o && o.v === LS_VERSION)? o: null;
    } catch (e) { return null;}
  }
  function savePersist(layout, thresholdMs) {
    try { window.localStorage.setItem(LS_KEY, JSON.stringify({ v: LS_VERSION, layout: layout, thresholdMs: thresholdMs}));}
    catch (e) { /* 忽略：隐私模式等 */}
  }

  function init() {
    var persisted = loadPersist();
    var layout = (persisted && (persisted.layout === 87 || persisted.layout === 104 || persisted.layout === 108))? persisted.layout: 104;
    var thresholdMs = (persisted && typeof persisted.thresholdMs === 'number')? persisted.thresholdMs: CHATTER_DEFAULT_MS;
    if (!(thresholdMs >= CHATTER_MIN_MS && thresholdMs <= CHATTER_MAX_MS)) thresholdMs = CHATTER_DEFAULT_MS;

    var events = [];
    var pressed = {};
    var unknownCodes = {};

    var board = $('kt-board');
    var statsBox = $('kt-stats');
    var unhitBox = $('kt-unhit');
    var unknownBox = $('kt-unknown');
    var recentBox = $('kt-recent');
    var chatterBox = $('kt-chatter');
    var reportBox = $('kt-report');
    var statusBox = $('kt-status');
    var thresholdInput = $('kt-threshold');
    var thresholdVal = $('kt-threshold-val');
    var keyEls = {};

    function setStatus(msg, ok) {
      statusBox.textContent = msg;
      statusBox.style.color = ok === false? '#dc2626': '#059669';
    }

    function keySize() {
      return window.innerWidth <= 640? 34: 46;
    }

    function renderBoard() {
      var keys = getLayoutKeys(layout);
      var u = keySize(), gap = 4;
      var maxX = 0, maxY = 0, i;
      for (i = 0; i < keys.length; i++) {
        if (keys[i].x + keys[i].w > maxX) maxX = keys[i].x + keys[i].w;
        if (keys[i].y + keys[i].h > maxY) maxY = keys[i].y + keys[i].h;
      }
      board.innerHTML = '';
      board.style.width = (maxX * u) + 'px';
      board.style.height = (maxY * u) + 'px';
      keyEls = {};
      var frag = document.createDocumentFragment();
      for (i = 0; i < keys.length; i++) {
        var k = keys[i];
        var el = document.createElement('div');
        el.className = 'kt-key';
        el.setAttribute('data-code', k.code);
        el.title = k.code;
        el.style.left = (k.x * u) + 'px';
        el.style.top = (k.y * u) + 'px';
        el.style.width = (k.w * u - gap) + 'px';
        el.style.height = (k.h * u - gap) + 'px';
        var lb = document.createElement('span');
        lb.className = 'kt-key-label';
        lb.textContent = k.label;
        el.appendChild(lb);
        frag.appendChild(el);
        keyEls[k.code] = el;
      }
      board.appendChild(frag);
    }

    function renderLayoutBtns() {
      var wrap = $('kt-layouts');
      var btns = wrap.querySelectorAll('button');
      for (var i = 0; i < btns.length; i++) {
        btns[i].classList.toggle('active', parseInt(btns[i].getAttribute('data-layout'), 10) === layout);
      }
      $('kt-layout-name').textContent = layoutLabel(layout);
    }

    function refreshReport() {
      reportBox.value = buildKeyReport(events, layout, { thresholdMs: thresholdMs});
    }

    function updateStats() {
      var codes = getLayoutCodes(layout);
      var seen = {};
      for (var i = 0; i < events.length; i++) if (events[i] && events[i].code) seen[events[i].code] = true;
      var triggered = 0, j;
      var unhit = [];
      for (j = 0; j < codes.length; j++) {
        if (seen[codes[j]]) triggered++;
        else unhit.push(codes[j]);
      }
      var chatters = detectChatter(events, thresholdMs);
      var rate = codes.length > 0? (triggered / codes.length * 100).toFixed(1): '0.0';
      statsBox.innerHTML =
      '<div class="kt-stat"><b>' + codes.length + '</b><small>测试按键总数</small></div>' +
      '<div class="kt-stat ok"><b>' + triggered + '</b><small>已触发（' + rate + '%）</small></div>' +
      '<div class="kt-stat todo"><b>' + unhit.length + '</b><small>未触发</small></div>' +
      '<div class="kt-stat"><b>' + events.length + '</b><small>记录事件数</small></div>' +
      '<div class="kt-stat warn"><b>' + chatters.length + '</b><small>连击嫌疑按键</small></div>';
      unhitBox.innerHTML = '';
      for (j = 0; j < unhit.length; j++) {
        var chip = document.createElement('span');
        chip.className = 'kt-chip';
        chip.textContent = unhit[j];
        unhitBox.appendChild(chip);
      }
      $('kt-unhit-count').textContent = unhit.length;
      var ukeys = Object.keys(unknownCodes);
      unknownBox.innerHTML = '';
      for (j = 0; j < ukeys.length; j++) {
        var uchip = document.createElement('span');
        uchip.className = 'kt-chip kt-chip-unknown';
        uchip.textContent = ukeys[j];
        unknownBox.appendChild(uchip);
      }
      $('kt-unknown-wrap').style.display = ukeys.length > 0? '': 'none';
      chatterBox.innerHTML = '';
      if (chatters.length === 0) {
        chatterBox.innerHTML = '<span class="kt-muted">暂无连击嫌疑（按下间隔均 ≥' + thresholdMs + 'ms）</span>';
      } else {
        for (j = 0; j < chatters.length; j++) {
          var c = chatters[j];
          var row = document.createElement('div');
          row.className = 'kt-chatter-row';
          var rb = document.createElement('b');
          rb.textContent = c.code;
          var rs = document.createElement('span');
          rs.textContent = '按下 ' + c.presses + ' 次，' + c.chatterCount +
          ' 次间隔 <' + thresholdMs + 'ms（' + c.hits.map(function (h) { return h.gap + 'ms';}).join('、') + '）';
          row.appendChild(rb);
          row.appendChild(rs);
          chatterBox.appendChild(row);
        }
      }
      refreshReport();
    }

    function paintKey(code, down) {
      var el = keyEls[code];
      if (!el) return;
      if (down) {
        el.classList.add('is-down');
        el.classList.add('is-hit');
      } else {
        el.classList.remove('is-down');
      }
    }

    function reset(silent) {
      events = [];
      pressed = {};
      unknownCodes = {};
      renderBoard();
      recentBox.innerHTML = '<span class="kt-muted">按下任意按键开始测试…</span>';
      if (!silent) setStatus('已重置：事件与统计已清空');
      updateStats();
    }

    function onKeyDown(e) {
      var tag = (e.target && e.target.tagName) || '';
      var inField = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      if (e.code === 'Tab' || (e.code === 'Space' &&!inField)) e.preventDefault();
      if (!e.code) return;
      events = recordKeyEvent(events, { code: e.code, type: 'keydown', time: Date.now(), repeat: e.repeat});
      pressed[e.code] = true;
      if (!keyEls[e.code]) unknownCodes[e.code] = true;
      paintKey(e.code, true);
      recentBox.innerHTML = '';
      var items = [
      ['code', e.code],
      ['key', String(e.key)],
      ['keyCode', String(e.keyCode)],
      ['location', String(e.location)],
      ['repeat', e.repeat? '是（按住自动重复）': '否']
      ];
      for (var i = 0; i < items.length; i++) {
        var d = document.createElement('div');
        d.className = 'kt-recent-item';
        var b = document.createElement('b');
        b.textContent = items[i][0];
        var s = document.createElement('span');
        s.textContent = items[i][1];
        d.appendChild(b);
        d.appendChild(s);
        recentBox.appendChild(d);
      }
      updateStats();
    }

    function onKeyUp(e) {
      if (!e.code) return;
      events = recordKeyEvent(events, { code: e.code, type: 'keyup', time: Date.now(), repeat: false});
      delete pressed[e.code];
      paintKey(e.code, false);
      updateStats();
    }

    /* 布局切换 */
    var layoutBtns = $('kt-layouts').querySelectorAll('button');
    for (var bi = 0; bi < layoutBtns.length; bi++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          var l = parseInt(btn.getAttribute('data-layout'), 10);
          validateKeyboardConfig({ layout: l});
          layout = l;
          savePersist(layout, thresholdMs);
          renderLayoutBtns();
          reset(true);
          setStatus('已切换到' + layoutLabel(layout) + '，事件已清空，请重新测试');
        });
      })(layoutBtns[bi]);
    }

    /* 连击阈值 */
    thresholdInput.value = thresholdMs;
    thresholdVal.textContent = thresholdMs + 'ms';
    thresholdInput.addEventListener('input', function () {
      var v = parseInt(thresholdInput.value, 10);
      if (!(v >= CHATTER_MIN_MS && v <= CHATTER_MAX_MS)) return;
      thresholdMs = v;
      thresholdVal.textContent = v + 'ms';
      savePersist(layout, thresholdMs);
      updateStats();
    });

    /* 复制 / 下载 / 重置 */
    $('kt-copy').addEventListener('click', function () {
      var text = reportBox.value;
      function done() { setStatus('测试报告已复制到剪贴板');}
      function fallback() {
        reportBox.focus();
        reportBox.select();
        try {
          var ok = document.execCommand('copy');
          setStatus(ok? '测试报告已复制到剪贴板': '复制失败：请手动全选报告文本复制', ok);
        } catch (err) { setStatus('复制失败：请手动全选报告文本复制', false);}
        if (window.getSelection) window.getSelection().removeAllRanges();
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, fallback);
      } else { fallback();}
    });
    $('kt-download').addEventListener('click', function () {
      var blob = new Blob([reportBox.value], { type: 'text/plain;charset=utf-8'});
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = buildKeyboardFileName();
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove();}, 500);
      setStatus('测试报告已开始下载：' + a.download);
    });
    $('kt-reset').addEventListener('click', function () {
      if (!window.confirm('确定要清空全部按键事件与统计吗？\n此操作不可撤销。')) return;
      reset(false);
    });

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', function () {
      for (var code in pressed) paintKey(code, false);
      pressed = {};
    });
    window.addEventListener('resize', function () {
      var stillDown = {};
      for (var code in pressed) stillDown[code] = true;
      renderBoard();
      for (var c2 in stillDown) paintKey(c2, true);
    });

    renderLayoutBtns();
    renderBoard();
    updateStats();
  }

  if (typeof document!== 'undefined' && document.readyState) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }

  if (typeof module!== 'undefined' && module.exports) {
    module.exports = {
      LAYOUT_SIZES: LAYOUT_SIZES,
      LAYOUT_NAMES: LAYOUT_NAMES,
      layoutLabel: layoutLabel,
      secHead: secHead,
      CHATTER_DEFAULT_MS: CHATTER_DEFAULT_MS,
      CHATTER_MIN_MS: CHATTER_MIN_MS,
      CHATTER_MAX_MS: CHATTER_MAX_MS,
      LS_KEY: LS_KEY,
      LS_VERSION: LS_VERSION,
      getLayoutKeys: getLayoutKeys,
      getLayoutCodes: getLayoutCodes,
      validateKeyboardConfig: validateKeyboardConfig,
      recordKeyEvent: recordKeyEvent,
      detectChatter: detectChatter,
      buildKeyReport: buildKeyReport,
      buildKeyboardFileName: buildKeyboardFileName
    };
  }
})();
