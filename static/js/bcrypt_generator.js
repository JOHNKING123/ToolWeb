/* Bcrypt 生成与验证器（bcrypt_generator）- 纯前端本地计算
 * 哈希算法由本地 vendor 的 bcryptjs（static/vendor/bcrypt.min.js）提供，
 * 本文件不发起任何 fetch / XHR，不加载任何 CDN 资源。
 * 口径：只做 $2b$。bcryptjs 默认产出 $2a$ 盐，本文件生成时统一把盐的
 * 版本段改写为 $2b$ 再哈希，实测 bcryptjs 接受 $2b$ 盐并输出 $2b$ 哈希，
 * compareSync 对 $2b$ 哈希同样有效；固定盐复现逐字相同。
 * 哈希结构：$2b$ + 两位成本 + $ + 22 字符盐 + 31 字符哈希体 = 60 字符。
 * 盐与哈希体均使用 bcrypt Base64 字母表 ./A-Za-z0-9（注意顺序与标准
 * Base64 不同：'.' 为 0，'/' 为 1）。bcrypt 不可逆，拆解只做展示。
 * 纯函数经 module.exports 暴露供 node 测试；浏览器里走 DOM。 */
(function () {
'use strict';

/* ---------- bcrypt 库解析 ---------- */

/* 浏览器里 vendor 脚本挂在 window.dcodeIO.bcrypt；node 里直接 require。
 * 未加载时返回 null，调用生成/验证会抛出明确错误，不静默失败。 */
var bcryptLib = null;
if (typeof window !== 'undefined' && window.dcodeIO && window.dcodeIO.bcrypt) {
  bcryptLib = window.dcodeIO.bcrypt;
} else if (typeof dcodeIO !== 'undefined' && dcodeIO.bcrypt) {
  bcryptLib = dcodeIO.bcrypt;
} else if (typeof module !== 'undefined' && module.exports) {
  try { bcryptLib = require('../vendor/bcrypt.min.js'); } catch (e) { bcryptLib = null; }
}

function libOrThrow(lib) {
  var lib = lib || bcryptLib;
  if (!lib) throw new Error('bcrypt 库未加载，请检查 static/vendor/bcrypt.min.js 是否可访问');
  return lib;
}

/* ---------- 常量与校验 ---------- */

/* bcrypt Base64 字母表（顺序固定：'.' '/' 'A'-'Z' 'a'-'z' '0'-'9'）。 */
var BCRYPT_B64 = './ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

var MIN_COST = 4;
var MAX_COST = 15;
/* 拆解/验证接受的成本上限放宽到 31（bcrypt 协议上限），生成滑杆只到 15。 */
var MAX_PARSE_COST = 31;

/* 成本显示：两位数字，不足补零（$2b$04$ 这种写法）。 */
function padCost(cost) {
  var n = Number(cost);
  return (n < 10 ? '0' : '') + n;
}

/* 成本是否为生成滑杆范围内的整数（4–15）。 */
function isGenerateCost(cost) {
  var n = Number(cost);
  return Number.isInteger ? Number.isInteger(n) && n >= MIN_COST && n <= MAX_COST
    : (Math.floor(n) === n && n >= MIN_COST && n <= MAX_COST);
}

/* 固定盐是否合法：恰好 22 字符且全部落在 bcrypt Base64 字母表内。 */
function isValidSalt22(salt) {
  if (typeof salt !== 'string' || salt.length !== 22) return false;
  for (var i = 0; i < salt.length; i++) {
    if (BCRYPT_B64.indexOf(salt.charAt(i)) === -1) return false;
  }
  return true;
}

/* ---------- 哈希解析与拆解 ---------- */

/* 解析 $2b$ 哈希：成功返回 {version, cost, salt, body, hash}，
 * cost 为数字；非法返回 null（不抛错，调用方按场景给报错文案）。 */
function parseHash(hash) {
  if (typeof hash !== 'string') return null;
  var s = hash.trim();
  var m = /^\$(2b)\$(\d{2})\$(.{22})(.{31})$/.exec(s);
  if (!m) return null;
  var cost = parseInt(m[2], 10);
  if (cost < MIN_COST || cost > MAX_PARSE_COST) return null;
  if (!isValidSalt22(m[3])) return null;
  for (var i = 0; i < m[4].length; i++) {
    if (BCRYPT_B64.indexOf(m[4].charAt(i)) === -1) return null;
  }
  return { version: m[1], cost: cost, salt: m[3], body: m[4], hash: s };
}

/* 哈希格式报错文案：区分空值、版本、长度、成本段、字符集，便于定位。 */
function hashError(hash) {
  if (typeof hash !== 'string' || hash.trim() === '') return '哈希不能为空';
  var s = hash.trim();
  if (s.length !== 60) return '哈希格式错误：长度应为 60 字符，当前为 ' + s.length + ' 字符';
  if (s.slice(0, 4) !== '$2b$') return '哈希格式错误：本工具只做 $2b$ 口径，当前版本段不是 $2b$';
  var costText = s.slice(4, 6);
  if (!/^\d{2}$/.test(costText)) return '哈希格式错误：成本段应为两位数字';
  var cost = parseInt(costText, 10);
  if (cost < MIN_COST || cost > MAX_PARSE_COST) return '哈希格式错误：成本因子超出范围（应为 ' + MIN_COST + '–' + MAX_PARSE_COST + '）';
  if (s.charAt(6) !== '$') return '哈希格式错误：成本段后应为 $ 分隔符';
  var salt = s.slice(7, 29);
  if (!isValidSalt22(salt)) return '哈希格式错误：盐应为 22 字符 bcrypt Base64（./A-Za-z0-9）';
  var body = s.slice(29, 60);
  for (var i = 0; i < body.length; i++) {
    if (BCRYPT_B64.indexOf(body.charAt(i)) === -1) return '哈希格式错误：哈希体含非法字符（应为 bcrypt Base64）';
  }
  return null;
}

/* 拆解：合法返回四段对象，非法抛出 hashError 文案（不展示残段）。 */
function dissectHash(hash) {
  var err = hashError(hash);
  if (err) throw new Error(err);
  return parseHash(hash);
}

/* 四段拼接还原：应逐字等于原哈希（去首尾空白后）。 */
function joinParts(parts) {
  return '$' + parts.version + '$' + padCost(parts.cost) + '$' + parts.salt + parts.body;
}

/* ---------- 生成与验证 ---------- */

/* 拼盐串：随机盐走 bcryptjs genSaltSync 再改 $2a$→$2b$；固定盐直接拼。
 * 固定盐非法时抛出明确错误；成本非法时同样抛出，不静默钳制。 */
function makeSalt(cost, fixedSalt, lib) {
  var lib = libOrThrow(lib);
  if (!isGenerateCost(cost)) throw new Error('成本因子超出范围（应为 ' + MIN_COST + '–' + MAX_COST + '）');
  if (fixedSalt !== null && fixedSalt !== undefined && String(fixedSalt).trim() !== '') {
    var salt = String(fixedSalt).trim();
    if (!isValidSalt22(salt)) throw new Error('固定盐格式错误：应为 22 字符 bcrypt Base64（./A-Za-z0-9）');
    return '$2b$' + padCost(cost) + '$' + salt;
  }
  return lib.genSaltSync(Number(cost)).replace('$2a$', '$2b$');
}

/* 同步生成：返回 {hash, cost, salt, elapsedMs}；空口令/非法输入抛错。
 * elapsedMs 为实测毫秒数（Date.now 前后差值）。 */
function generateHashSync(password, cost, fixedSalt, lib) {
  if (typeof password !== 'string' || password === '') throw new Error('口令不能为空');
  var lib = libOrThrow(lib);
  var salt = makeSalt(cost, fixedSalt, lib);
  var start = Date.now();
  var hash = lib.hashSync(password, salt);
  return { hash: hash, cost: Number(cost), salt: salt, elapsedMs: Date.now() - start };
}

/* 同步验证：返回 {match, cost, elapsedMs}；非法哈希抛错，不判不匹配；
 * 空口令抛错。结论只有匹配/不匹配二值，不回显口令、不输出新哈希。 */
function verifyHashSync(password, hash, lib) {
  if (typeof password !== 'string' || password === '') throw new Error('口令不能为空');
  var err = hashError(hash);
  if (err) throw new Error(err);
  var lib = libOrThrow(lib);
  var parsed = parseHash(hash);
  var start = Date.now();
  var match = lib.compareSync(password, parsed.hash);
  return { match: !!match, cost: parsed.cost, elapsedMs: Date.now() - start };
}

/* ---------- 示例 ---------- */

/* 示例 1：载入生成模式（口令 demo1234、成本 10；随机盐，每次结果不同）。
 * 示例 2：载入验证模式的已知口令＋哈希对（固定盐算出，可复现验证）。 */
var EXAMPLES = [
  { id: 1, mode: 'generate', password: 'demo1234', cost: 10,
    note: '每次生成因随机盐不同而结果不同，请以实测为准' },
  { id: 2, mode: 'verify', password: 'demo-verify',
    hash: '$2b$10$abcdefghijklmnopqrstuug6DiuB7U1GMAQeSYEnwZG6uqcCKNidK',
    note: '已知口令＋哈希对，验证应得“匹配”' }
];

/* ---------- 导出 ---------- */

var api = {
  BCRYPT_B64: BCRYPT_B64,
  MIN_COST: MIN_COST,
  MAX_COST: MAX_COST,
  padCost: padCost,
  isGenerateCost: isGenerateCost,
  isValidSalt22: isValidSalt22,
  parseHash: parseHash,
  hashError: hashError,
  dissectHash: dissectHash,
  joinParts: joinParts,
  makeSalt: makeSalt,
  generateHashSync: generateHashSync,
  verifyHashSync: verifyHashSync,
  EXAMPLES: EXAMPLES
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
} else if (typeof window !== 'undefined') {
  window.BcryptGenerator = api;
}

/* ---------- 浏览器 DOM 绑定 ---------- */

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', function () {
    function $(id) { return document.getElementById(id); }
    function toast(msg) {
      var t = $('bg-toast');
      if (!t) return;
      t.textContent = msg;
      t.style.display = 'block';
      clearTimeout(t._timer);
      t._timer = setTimeout(function () { t.style.display = 'none'; }, 3200);
    }
    function setError(el, msg) { if (el) el.textContent = msg || ''; }
    function setBusy(btn, busy, busyText) {
      if (!btn) return;
      btn.disabled = !!busy;
      if (busy) { btn.dataset.label = btn.textContent; btn.textContent = busyText; }
      else if (btn.dataset.label) { btn.textContent = btn.dataset.label; }
    }
    function copyText(text, okMsg) {
      function fallback() {
        toast('复制失败，请手动选中结果复制');
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { toast(okMsg || '已复制'); }, fallback);
      } else { fallback(); }
    }
    function renderParts(box, parts) {
      if (!box || !parts) return;
      box.innerHTML = '';
      var rows = [
        ['版本', '$' + parts.version + '$'],
        ['成本因子', String(parts.cost)],
        ['盐（22 字符）', parts.salt],
        ['哈希体（31 字符）', parts.body]
      ];
      rows.forEach(function (r) {
        var div = document.createElement('div');
        div.className = 'bg-part-row';
        var k = document.createElement('span');
        k.className = 'bg-part-key';
        k.textContent = r[0];
        var v = document.createElement('code');
        v.className = 'bg-part-val';
        v.textContent = r[1];
        div.appendChild(k);
        div.appendChild(v);
        box.appendChild(div);
      });
    }
    function renderSummary() {
      var genHash = $('bg-gen-hash') ? $('bg-gen-hash').textContent : '';
      var genMeta = $('bg-gen-meta') ? $('bg-gen-meta').textContent : '';
      var verResult = $('bg-verify-result') ? $('bg-verify-result').textContent : '';
      var verMeta = $('bg-verify-meta') ? $('bg-verify-meta').textContent : '';
      var lines = ['Bcrypt 生成与验证结果摘要'];
      if (genHash) { lines.push('生成哈希：' + genHash); if (genMeta) lines.push(genMeta); }
      if (verResult) { lines.push('验证结论：' + verResult); if (verMeta) lines.push(verMeta); }
      if (lines.length === 1) lines.push('（暂无结果，请先生成或验证）');
      var el = $('bg-summary');
      if (el) el.textContent = lines.join('\n');
    }

    /* 成本滑杆数值同步。 */
    var costInput = $('bg-cost');
    var costVal = $('bg-cost-val');
    if (costInput && costVal) {
      costInput.addEventListener('input', function () { costVal.textContent = costInput.value; });
    }

    /* 口令显示/隐藏切换（生成与验证两路独立）。 */
    [['bg-gen-show', 'bg-gen-password'], ['bg-verify-show', 'bg-verify-password']].forEach(function (pair) {
      var cb = $(pair[0]), input = $(pair[1]);
      if (cb && input) {
        cb.addEventListener('change', function () { input.type = cb.checked ? 'text' : 'password'; });
      }
    });

    /* 生成：先让“生成中”状态 paints，再跑同步哈希，避免按钮假死无反馈。 */
    var genBtn = $('bg-generate');
    if (genBtn) {
      genBtn.addEventListener('click', function () {
        var password = $('bg-gen-password').value;
        var cost = parseInt(costInput.value, 10);
        var fixedSalt = $('bg-gen-salt').value;
        setError($('bg-gen-error'), '');
        if (password === '') { setError($('bg-gen-error'), '口令不能为空，请输入口令再生成'); return; }
        setBusy(genBtn, true, '生成中…');
        setError($('bg-gen-status'), '生成中，请稍候…');
        setTimeout(function () {
          try {
            var r = generateHashSync(password, cost, fixedSalt);
            $('bg-gen-hash').textContent = r.hash;
            $('bg-gen-meta').textContent = '成本 ' + r.cost + ' · 耗时 ' + r.elapsedMs + ' 毫秒 · 长度 ' + r.hash.length + ' 字符';
            setError($('bg-gen-status'), '');
            renderParts($('bg-gen-parts'), dissectHash(r.hash));
            renderSummary();
          } catch (e) {
            setError($('bg-gen-error'), e.message);
            setError($('bg-gen-status'), '');
          }
          setBusy(genBtn, false);
        }, 30);
      });
    }

    /* 生成结果复制。 */
    var genCopy = $('bg-gen-copy');
    if (genCopy) {
      genCopy.addEventListener('click', function () {
        var h = $('bg-gen-hash').textContent;
        if (!h) { toast('暂无生成结果，请先生成哈希'); return; }
        copyText(h, '哈希已复制');
      });
    }

    /* 验证：只给匹配/不匹配二值结论，不回显口令、不输出新哈希。 */
    var verBtn = $('bg-verify');
    if (verBtn) {
      verBtn.addEventListener('click', function () {
        var password = $('bg-verify-password').value;
        var hash = $('bg-verify-hash').value;
        setError($('bg-verify-error'), '');
        if (password === '') { setError($('bg-verify-error'), '口令不能为空，请输入口令再验证'); return; }
        setBusy(verBtn, true, '验证中…');
        setError($('bg-verify-status'), '验证中，请稍候…');
        setTimeout(function () {
          try {
            var r = verifyHashSync(password, hash);
            var badge = $('bg-verify-result');
            badge.textContent = r.match ? '✓ 匹配' : '✗ 不匹配';
            badge.className = 'bg-badge ' + (r.match ? 'bg-match' : 'bg-nomatch');
            $('bg-verify-meta').textContent = '成本 ' + r.cost + ' · 耗时 ' + r.elapsedMs + ' 毫秒';
            setError($('bg-verify-status'), '');
            renderParts($('bg-verify-parts'), dissectHash(hash));
            renderSummary();
          } catch (e) {
            setError($('bg-verify-error'), e.message);
            setError($('bg-verify-status'), '');
            var badge2 = $('bg-verify-result');
            badge2.textContent = '';
            badge2.className = 'bg-badge';
          }
          setBusy(verBtn, false);
        }, 30);
      });
    }

    /* 示例载入：载入后仍可编辑再操作；示例仅为起点，请按需改写。 */
    var ex1 = $('bg-example-1');
    if (ex1) {
      ex1.addEventListener('click', function () {
        $('bg-gen-password').value = 'demo1234';
        costInput.value = '10';
        costVal.textContent = '10';
        $('bg-gen-salt').value = '';
        toast('示例 1 已载入生成模式：口令 demo1234、成本 10，点“生成哈希”即可（每次随机盐结果不同）');
      });
    }
    var ex2 = $('bg-example-2');
    if (ex2) {
      ex2.addEventListener('click', function () {
        $('bg-verify-password').value = 'demo-verify';
        $('bg-verify-hash').value = '$2b$10$abcdefghijklmnopqrstuug6DiuB7U1GMAQeSYEnwZG6uqcCKNidK';
        toast('示例 2 已载入验证模式：口令 demo-verify 与已知哈希对，点“验证”应得“匹配”');
      });
    }

    /* 摘要复制与重置。 */
    var sumCopy = $('bg-summary-copy');
    if (sumCopy) {
      sumCopy.addEventListener('click', function () {
        renderSummary();
        var t = $('bg-summary').textContent;
        if (!t || t.indexOf('暂无结果') !== -1) { toast('暂无结果可复制，请先生成或验证'); return; }
        copyText(t, '结果摘要已复制');
      });
    }
    var resetBtn = $('bg-reset');
    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        $('bg-gen-password').value = '';
        costInput.value = '10';
        costVal.textContent = '10';
        $('bg-gen-salt').value = '';
        $('bg-gen-hash').textContent = '';
        $('bg-gen-meta').textContent = '';
        $('bg-gen-parts').innerHTML = '';
        setError($('bg-gen-error'), '');
        setError($('bg-gen-status'), '');
        $('bg-verify-password').value = '';
        $('bg-verify-hash').value = '';
        var badge = $('bg-verify-result');
        badge.textContent = '';
        badge.className = 'bg-badge';
        $('bg-verify-meta').textContent = '';
        $('bg-verify-parts').innerHTML = '';
        setError($('bg-verify-error'), '');
        setError($('bg-verify-status'), '');
        renderSummary();
        toast('已重置为默认状态');
      });
    }
    renderSummary();
  });
}

})();
