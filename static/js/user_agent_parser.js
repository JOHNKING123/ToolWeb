/* User-Agent 解析器（user_agent_parser）- 纯前端零上传
 * 手写规则解析，无依赖：粘贴单条 UA 文本 → 浏览器（名＋版本）、
 * 操作系统（名＋版本）、设备类型、渲染引擎、原始 UA 回显。
 * 检测顺序（铁律，顺序即语义，绝不调换）：
 *   机器人优先 → Edge（Edg 系）在 Chrome 前 → Opera（OPR）在 Chrome 前 →
 *   三星浏览器 → Chrome（含 CriOS）→ Firefox（含 FxiOS）→ Safari → IE → 未知。
 * 真限制（页面首屏同步明示）：
 *   UA 可伪造，仅供参考；Windows NT 10.0 无法区分 Win10/11，一律标
 *   “Windows 10 / 11”；iOS 上所有浏览器引擎一律 WebKit（系统强制）；
 *   不做指纹识别，不推断用户身份。
 * 不编造原则：Linux 无发行版 token 时只写 Linux、不猜发行版；
 *   识别不出的字段一律“未知”，不猜测、不补全。
 * 本文件不发起任何 fetch / XHR，不加载任何 CDN 资源。
 * 纯函数经 module.exports 暴露供 node 测试；浏览器里走 DOM。 */
(function () {
'use strict';

/* ---------- 小工具 ---------- */
function majorOf(version) {
  if (!version) return '';
  var m = String(version).match(/^(\d+)/);
  return m ? m[1] : '';
}

/* 从 UA 里取 token/版本号：re 须含一个捕获组（版本号）。 */
function tokenVersion(ua, re) {
  var m = ua.match(re);
  return m ? m[1] : null;
}

/* ---------- 机器人判定（最优先） ---------- */
/* 机器人名：优先取具名爬虫（如 Googlebot），否则泛化为“机器人·爬虫”。 */
var KNOWN_BOTS = [
  ['Googlebot', /Googlebot\/([0-9.]+)/i],
  ['Bingbot', /bingbot\/([0-9.]+)/i],
  ['Baiduspider', /Baiduspider\/([0-9.]+)/i],
  ['YandexBot', /YandexBot\/([0-9.]+)/i],
  ['DuckDuckBot', /DuckDuckBot\/([0-9.]+)/i],
  ['Sogou', /Sogou (?:web )?spider\/([0-9.]+)/i],
  ['Applebot', /Applebot\/([0-9.]+)/i],
  ['facebookexternalhit', /facebookexternalhit\/([0-9.]+)/i],
  ['Twitterbot', /Twitterbot\/([0-9.]+)/i],
  ['AhrefsBot', /AhrefsBot\/([0-9.]+)/i],
  ['SemrushBot', /SemrushBot\/([0-9.]+)/i],
  ['MJ12bot', /MJ12bot\/([0-9.]+)/i],
  ['DotBot', /DotBot\/([0-9.]+)/i],
  ['PetalBot', /PetalBot\/([0-9.]+)/i],
  ['Slurp', /Slurp/i]
];
/* 泛机器人信号：具名爬虫之外，含 bot / crawler / spider / 爬虫类 token 即判机器人。 */
var BOT_SIGNAL = /(bot|crawler|spider|crawling|scraper)/i;

function detectBot(ua) {
  for (var i = 0; i < KNOWN_BOTS.length; i++) {
    var m = ua.match(KNOWN_BOTS[i][1]);
    if (m) return { name: KNOWN_BOTS[i][0], version: m[1] || '' };
  }
  if (BOT_SIGNAL.test(ua)) return { name: '机器人·爬虫', version: '' };
  return null;
}

/* ---------- 命令行工具（curl / wget 等）：有名字、无从属设备 ---------- */
var CLI_TOOLS = [
  ['curl', /curl\/([0-9.]+)/i],
  ['Wget', /Wget\/([0-9.]+)/i],
  ['python-requests', /python-requests\/([0-9.]+)/i],
  ['PostmanRuntime', /PostmanRuntime\/([0-9.]+)/i],
  ['HTTPie', /HTTPie\/([0-9.]+)/i]
];

function detectCli(ua) {
  for (var i = 0; i < CLI_TOOLS.length; i++) {
    var m = ua.match(CLI_TOOLS[i][1]);
    if (m) return { name: CLI_TOOLS[i][0], version: m[1] || '' };
  }
  return null;
}

/* ---------- 浏览器判定（顺序即规范） ---------- */
function detectBrowser(ua) {
  var v;
  /* 1. Edge：Edg/（Chromium 内核）、EdgA（Android）、EdgiOS、旧版 Edge/，一律在 Chrome 前。 */
  v = tokenVersion(ua, /Edg(?:e|A|iOS)?\/([0-9.]+)/);
  if (v) return { name: 'Edge', version: v, legacy: /Edge\//.test(ua) && !/Edg\//.test(ua) };
  v = tokenVersion(ua, /Edge\/([0-9.]+)/);
  if (v) return { name: 'Edge', version: v, legacy: true };
  /* 2. Opera：OPR/ 与旧版 Opera/，在 Chrome 前。 */
  v = tokenVersion(ua, /OPR\/([0-9.]+)/);
  if (v) return { name: 'Opera', version: v, legacy: false };
  v = tokenVersion(ua, /Opera\/([0-9.]+)/);
  if (v) return { name: 'Opera', version: v, legacy: false };
  /* 3. 三星浏览器。 */
  v = tokenVersion(ua, /SamsungBrowser\/([0-9.]+)/);
  if (v) return { name: 'Samsung Internet', version: v, legacy: false };
  /* 4. Chrome：桌面 Chrome/ 与 iOS CriOS/。 */
  v = tokenVersion(ua, /CriOS\/([0-9.]+)/);
  if (v) return { name: 'Chrome', version: v, legacy: false, ios: true };
  v = tokenVersion(ua, /Chrome\/([0-9.]+)/);
  if (v) return { name: 'Chrome', version: v, legacy: false };
  /* 5. Firefox：桌面 Firefox/ 与 iOS FxiOS/。 */
  v = tokenVersion(ua, /FxiOS\/([0-9.]+)/);
  if (v) return { name: 'Firefox', version: v, legacy: false, ios: true };
  v = tokenVersion(ua, /Firefox\/([0-9.]+)/);
  if (v) return { name: 'Firefox', version: v, legacy: false };
  /* 6. Safari：优先 Version/，无 Version/ 时退回 Safari/ token。 */
  if (/Safari\//.test(ua)) {
    v = tokenVersion(ua, /Version\/([0-9.]+)/) || tokenVersion(ua, /Safari\/([0-9.]+)/);
    if (v) return { name: 'Safari', version: v, legacy: false };
  }
  /* 7. IE：MSIE 或 Trident + rv:。 */
  v = tokenVersion(ua, /MSIE ([0-9.]+)/);
  if (v) return { name: 'Internet Explorer', version: v, legacy: false };
  if (/Trident\//.test(ua)) {
    v = tokenVersion(ua, /rv:([0-9.]+)/);
    return { name: 'Internet Explorer', version: v || '', legacy: false };
  }
  return { name: '未知', version: '', legacy: false };
}

/* ---------- 操作系统判定 ---------- */
var WIN_NT = {
  '10.0': '10 / 11', '6.3': '8.1', '6.2': '8', '6.1': '7',
  '6.0': 'Vista', '5.2': 'XP x64', '5.1': 'XP', '5.0': '2000'
};
/* 仅当发行版 token 字面出现在 UA 里才认，不猜测。 */
var LINUX_DISTROS = ['Ubuntu', 'Fedora', 'Debian', 'openSUSE', 'Arch Linux', 'CentOS', 'Red Hat Enterprise Linux', 'Linux Mint', 'Gentoo'];

function detectOS(ua) {
  var m, v;
  /* Windows Phone 先于桌面 Windows（其 UA 也含 Windows NT / Windows Phone token）。 */
  m = ua.match(/Windows Phone (?:OS )?([0-9.]+)/);
  if (m) return { name: 'Windows Phone', version: m[1] };
  m = ua.match(/Windows NT ([0-9.]+)/);
  if (m) return { name: 'Windows', version: WIN_NT[m[1]] || m[1] };
  /* iOS：iPhone / iPad / iPod 的 OS token；下划线转点。 */
  m = ua.match(/(?:iPhone OS|CPU (?:iPhone )?OS) ([0-9_]+)/);
  if (m) return { name: 'iOS', version: m[1].replace(/_/g, '.') };
  /* macOS。 */
  m = ua.match(/Mac OS X ([0-9_]+)/);
  if (m) return { name: 'macOS', version: m[1].replace(/_/g, '.') };
  if (/Macintosh/.test(ua)) return { name: 'macOS', version: '' };
  /* Android（在 Linux 前：Android UA 也含 Linux token）。 */
  m = ua.match(/Android ([0-9.]+)/);
  if (m) return { name: 'Android', version: m[1] };
  /* ChromeOS。 */
  m = ua.match(/CrOS [^ ]+ ([0-9.]+)/);
  if (m) return { name: 'ChromeOS', version: m[1] };
  /* Linux：有字面发行版 token 才认发行版，否则只写 Linux。 */
  if (/Linux/.test(ua)) {
    for (var i = 0; i < LINUX_DISTROS.length; i++) {
      if (ua.indexOf(LINUX_DISTROS[i]) >= 0) return { name: LINUX_DISTROS[i], version: '' };
    }
    return { name: 'Linux', version: '' };
  }
  if (/FreeBSD/.test(ua)) return { name: 'FreeBSD', version: '' };
  if (/OpenBSD/.test(ua)) return { name: 'OpenBSD', version: '' };
  return { name: '未知', version: '' };
}

/* ---------- 设备类型判定 ---------- */
function detectDevice(ua, browser, isBot, isCli) {
  if (isBot) return '机器人·爬虫';
  if (isCli) return '未知';
  if (/\biPad\b/.test(ua)) return '平板';
  if (/\bTablet\b/i.test(ua)) return '平板';
  /* Android 无 Mobile token 按平板惯例（手机 UA 一律带 Mobile）。 */
  if (/Android/.test(ua) && !/Mobile/.test(ua)) return '平板';
  if (/\biPhone\b|\biPod\b|Windows Phone/.test(ua)) return '手机';
  if (/Mobile/.test(ua)) return '手机';
  if (browser.name !== '未知' || detectOS(ua).name !== '未知') return '桌面';
  return '未知';
}

/* ---------- 渲染引擎判定 ---------- */
function detectEngine(ua, browser, os) {
  /* iOS 强制 WebKit：系统不允许第三方引擎，无论 CriOS / FxiOS / EdgiOS。 */
  if (browser.ios || os.name === 'iOS') return 'WebKit';
  if (browser.name === 'Firefox') return 'Gecko';
  if (browser.name === 'Internet Explorer') return 'Trident';
  if (browser.name === 'Edge') return browser.legacy ? '未知' : 'Blink';
  if (browser.name === 'Chrome' || browser.name === 'Opera' || browser.name === 'Samsung Internet') return 'Blink';
  if (browser.name === 'Safari') return 'WebKit';
  /* 未知浏览器时的兜底：仅凭字面引擎 token，不凭“like Gecko”猜测。 */
  if (/Trident\//.test(ua)) return 'Trident';
  if (/Gecko\/[0-9]/.test(ua) && /Firefox\//.test(ua)) return 'Gecko';
  if (/AppleWebKit\//.test(ua) && /Safari\//.test(ua) && !/Chrome\//.test(ua)) return 'WebKit';
  return '未知';
}

/* ---------- 主入口 ---------- */
/* 返回 {browser, browserVersion, browserMajor, os, osVersion, device, engine, raw}。
 * 空输入返回 null（调用方显示空态）；无意义输入各字段为“未知”，不抛错。 */
function parseUserAgent(input) {
  if (input == null) return null;
  var raw = String(input);
  if (raw.replace(/\s+/g, '') === '') return null;
  var ua = raw;
  var bot = detectBot(ua);
  var cli = bot ? null : detectCli(ua);
  var browser, os, device, engine;
  if (bot) {
    browser = { name: bot.name, version: bot.version };
    os = detectOS(ua);
    device = '机器人·爬虫';
    engine = detectEngine(ua, { name: '未知' }, os);
  } else if (cli) {
    browser = { name: cli.name, version: cli.version };
    os = detectOS(ua);
    device = '未知';
    engine = '未知';
  } else {
    browser = detectBrowser(ua);
    os = detectOS(ua);
    device = detectDevice(ua, browser, false, false);
    engine = detectEngine(ua, browser, os);
  }
  return {
    browser: browser.name,
    browserVersion: browser.version || '',
    browserMajor: majorOf(browser.version),
    os: os.name,
    osVersion: os.version || '',
    device: device,
    engine: engine,
    raw: raw
  };
}

/* 展示用：空版本显示“未知”，不留空白。 */
function displayValue(v) {
  return v ? v : '未知';
}

function formatResult(r) {
  if (!r) return '';
  return '浏览器：' + r.browser + ' ' + displayValue(r.browserVersion) + '\n' +
    '操作系统：' + r.os + (r.osVersion ? ' ' + r.osVersion : '') + '\n' +
    '设备类型：' + r.device + '\n' +
    '渲染引擎：' + r.engine + '\n' +
    '原始 UA：' + r.raw;
}

/* ---------- 预设（8 组，可载入、可编辑再解析） ---------- */
var PRESETS = [
  {
    label: 'Chrome / Windows',
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
  },
  {
    label: 'Edge / Windows',
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.2903.86'
  },
  {
    label: 'Safari / macOS',
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15'
  },
  {
    label: 'Safari / iPhone',
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1'
  },
  {
    label: 'Chrome / Android',
    ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.6778.87 Mobile Safari/537.36'
  },
  {
    label: 'Firefox / Linux',
    ua: 'Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0'
  },
  {
    label: 'Googlebot',
    ua: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
  },
  {
    label: 'curl',
    ua: 'curl/8.5.0'
  }
];

/* ---------- 浏览器 DOM ---------- */
function copyText(text, msgEl, okMsg) {
  function fallback() {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      if (ok) { if (msgEl) msgEl.textContent = okMsg; return; }
    } catch (e) { /* fall through */ }
    if (msgEl) msgEl.textContent = '复制失败：浏览器未允许剪贴板访问，请手动全选上方结果复制。';
  }
  if (navigator.clipboard && window.isSecureContext !== false) {
    navigator.clipboard.writeText(text).then(function () {
      if (msgEl) msgEl.textContent = okMsg;
    }).catch(fallback);
  } else {
    fallback();
  }
}

function bindUI() {
  var inputEl = document.getElementById('uap-input');
  var emptyEl = document.getElementById('uap-empty');
  var resultEl = document.getElementById('uap-result');
  var copyMsg = document.getElementById('uap-copy-msg');
  if (!inputEl || !resultEl) return;

  function setCell(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function render() {
    var r = parseUserAgent(inputEl.value);
    if (!r) {
      if (emptyEl) emptyEl.style.display = 'block';
      resultEl.style.display = 'none';
      return;
    }
    if (emptyEl) emptyEl.style.display = 'none';
    resultEl.style.display = 'block';
    setCell('uap-browser', r.browser);
    setCell('uap-browser-version', displayValue(r.browserVersion));
    setCell('uap-os', r.os + (r.osVersion ? ' ' + r.osVersion : ''));
    setCell('uap-device', r.device);
    setCell('uap-engine', r.engine);
    setCell('uap-raw', r.raw);
  }

  function loadPreset(ua) {
    inputEl.value = ua;
    if (copyMsg) copyMsg.textContent = '';
    render();
    inputEl.focus();
  }

  inputEl.addEventListener('input', render);
  var btn = function (id, fn) { var el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
  btn('uap-parse', render);
  btn('uap-current', function () {
    if (typeof navigator !== 'undefined' && navigator.userAgent) loadPreset(navigator.userAgent);
  });
  btn('uap-copy', function () {
    var r = parseUserAgent(inputEl.value);
    if (r) copyText(formatResult(r), copyMsg, '解析结果已复制。');
  });
  btn('uap-reset', function () {
    inputEl.value = '';
    if (copyMsg) copyMsg.textContent = '';
    render();
    inputEl.focus();
  });
  document.querySelectorAll('[data-uap-preset]').forEach(function (el) {
    el.addEventListener('click', function () { loadPreset(el.getAttribute('data-uap-preset')); });
  });

  render();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindUI);
  else bindUI();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    parseUserAgent: parseUserAgent, formatResult: formatResult, displayValue: displayValue,
    detectBot: detectBot, detectBrowser: detectBrowser, detectOS: detectOS,
    detectDevice: detectDevice, detectEngine: detectEngine, PRESETS: PRESETS
  };
} else if (typeof window !== 'undefined') {
  window.UserAgentParser = { parseUserAgent: parseUserAgent, formatResult: formatResult, PRESETS: PRESETS };
}
})();
