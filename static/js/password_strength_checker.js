/* 密码强度检测纯函数 + 浏览器端实时检测逻辑。
 * 算法口径（与随机密码生成器内联强度条不同）：生成器强度条只对刚生成的
 * 密码按 长度×log2(所选字符集大小) 估算熵值给标签；本工具分析用户输入的
 * 任意密码：字符集按实际出现字符检测（小写 26／大写 26／数字 10／符号 33），
 * 熵值＝长度×log2(字符集大小)，再计入弱模式扣分与常见密码封顶，给出 0–100
 * 评分＋五级强度、离线破解时间估算（10^10 次／秒假设）与逐项检查清单。
 * 隐私：全程浏览器本地计算，零上传、零外部接口；不保存、不进 URL、
 * 不写浏览器存储；不提供密码复制按钮。
 * 导出：window.PasswordStrengthChecker（浏览器）与 module.exports（node 测试，同步导出）。
 */
(function (global) {
  'use strict';

  function fail(field, message) {
    var e = new Error(message);
    e.field = field;
    return e;
  }

  function requirePassword(password) {
    if (typeof password !== 'string') {
      throw fail('password', '密码必须是字符串');
    }
    return password;
  }

  var CHARSET_SIZES = { lower: 26, upper: 26, digit: 10, symbol: 33 };
  var CLASS_ORDER = ['lower', 'upper', 'digit', 'symbol'];

  /* detectCharset(password) -> {size, classes}：按实际出现字符检测字符集。
   * 小写 a-z 26／大写 A-Z 26／数字 0-9 10／其余字符（符号、空格、非 ASCII）
   * 归入符号类，按 33 个可打印 ASCII 符号计（保守估计）。空串返回 {size:0, classes:[]}。 */
  function detectCharset(password) {
    requirePassword(password);
    var seen = {};
    var classes = [];
    for (var i = 0; i < password.length; i++) {
      var c = password.charAt(i);
      var cls;
      if (c >= 'a' && c <= 'z') cls = 'lower';
      else if (c >= 'A' && c <= 'Z') cls = 'upper';
      else if (c >= '0' && c <= '9') cls = 'digit';
      else cls = 'symbol';
      if (!seen[cls]) { seen[cls] = true; classes.push(cls); }
    }
    classes.sort(function (a, b) { return CLASS_ORDER.indexOf(a) - CLASS_ORDER.indexOf(b); });
    var size = 0;
    for (var j = 0; j < classes.length; j++) size += CHARSET_SIZES[classes[j]];
    return { size: size, classes: classes };
  }

  function round2(x) { return Math.round(x * 100) / 100; }

  /* calcEntropyBits(password) -> number：熵值 bits＝长度×log2(字符集大小)，保留 2 位小数。 */
  function calcEntropyBits(password) {
    requirePassword(password);
    var cs = detectCharset(password);
    if (cs.size === 0) return 0;
    return round2(password.length * (Math.log(cs.size) / Math.log(2)));
  }

  /* 常见密码表（小写比对）：命中即封顶极弱。收录口令与常见弱口令变体。 */
  var COMMON_PASSWORDS = [
    'password', '123456', '123456789', '12345', '12345678', 'qwerty',
    '1234567', '111111', '1234567890', '123123', 'abc123', '1234',
    'password1', 'iloveyou', '1q2w3e4r', 'qwerty123', 'admin', 'letmein',
    'welcome', 'monkey', 'dragon', '000000', '666666', '888888', '123321',
    'qwertyuiop', '1qaz2wsx', 'sunshine', 'master', 'football', '123qwe',
    'princess', 'solo', 'passw0rd', 'shadow', 'superman', 'michael',
    '654321', 'charlie', 'aa123456', 'donald', '123456a', '00000000',
    '121212', 'qazwsx', '1234qwer', '1qazxsw2', 'zxcvbnm', 'asdfghjkl'
  ];

  /* isCommonPassword(password) -> boolean：大小写不敏感命中常见密码表。 */
  function isCommonPassword(password) {
    requirePassword(password);
    return COMMON_PASSWORDS.indexOf(password.toLowerCase()) !== -1;
  }

  var KEYBOARD_ROWS = [
    'qwertyuiop', 'asdfghjkl', 'zxcvbnm', '1234567890',
    '1qaz', '2wsx', '3edc', '4rfv', '5tgb', '6yhn', '7ujm', '8ik,', '9ol.', '0p;/'
  ];

  function hasKeyboardSequence(lower) {
    for (var r = 0; r < KEYBOARD_ROWS.length; r++) {
      var row = KEYBOARD_ROWS[r];
      var rev = row.split('').reverse().join('');
      for (var i = 0; i + 3 <= lower.length; i++) {
        var tri = lower.slice(i, i + 3);
        if (row.indexOf(tri) !== -1 || rev.indexOf(tri) !== -1) return true;
      }
    }
    return false;
  }

  function hasSequence(lower) {
    for (var i = 0; i + 3 <= lower.length; i++) {
      var a = lower.charCodeAt(i), b = lower.charCodeAt(i + 1), c = lower.charCodeAt(i + 2);
      var letters = a >= 97 && a <= 122 && b >= 97 && b <= 122 && c >= 97 && c <= 122;
      var digits = a >= 48 && a <= 57 && b >= 48 && b <= 57 && c >= 48 && c <= 57;
      if (!letters && !digits) continue;
      if ((b === a + 1 && c === b + 1) || (b === a - 1 && c === b - 1)) return true;
    }
    return false;
  }

  function hasRepeat(password) {
    if (/(.)\1{2,}/.test(password)) return true;
    if (password.length >= 4) {
      var m = /^(.+?)\1+$/.exec(password);
      if (m) return true;
    }
    return false;
  }

  /* detectWeakPatterns(password) -> string[]：固定顺序
   * ['repeat','sequence','keyboard','only-digits','only-letters'] 的子集。
   * repeat：同一字符连续 3 次以上，或整串由短片段重复构成；
   * sequence：3 位连续递增／递减字母或数字（如 abc、123、cba）；
   * keyboard：键盘行／列上连续 3 键（如 qwerty、1qaz）；
   * only-digits／only-letters：长度≥2 且全为数字／全为字母。 */
  function detectWeakPatterns(password) {
    requirePassword(password);
    var out = [];
    var lower = password.toLowerCase();
    if (hasRepeat(password)) out.push('repeat');
    if (hasSequence(lower)) out.push('sequence');
    if (hasKeyboardSequence(lower)) out.push('keyboard');
    if (password.length >= 2 && /^[0-9]+$/.test(password)) out.push('only-digits');
    if (password.length >= 2 && /^[A-Za-z]+$/.test(password)) out.push('only-letters');
    return out;
  }

  /* estimateCrackSeconds(bits) -> number：离线破解秒数＝2^bits ÷ 1e10（10^10 次／秒假设）。 */
  function estimateCrackSeconds(bits) {
    if (typeof bits !== 'number' || isNaN(bits) || !isFinite(bits) || bits < 0) {
      throw fail('bits', 'bits 必须为非负有限数字');
    }
    return Math.pow(2, bits) / 1e10;
  }

  /* formatDuration(seconds) -> string：中文可读时长；Infinity 视为超过 1 亿年。 */
  function formatDuration(seconds) {
    if (typeof seconds !== 'number' || isNaN(seconds) || seconds < 0) {
      throw fail('seconds', 'seconds 必须为非负数字');
    }
    if (!isFinite(seconds)) return '超过 1 亿年';
    if (seconds < 1) return '不到 1 秒';
    if (seconds < 60) return '约 ' + Math.floor(seconds) + ' 秒';
    var minutes = Math.round(seconds / 60);
    if (minutes < 60) return '约 ' + minutes + ' 分钟';
    var hours = Math.round(seconds / 3600);
    if (hours < 24) return '约 ' + hours + ' 小时';
    var days = Math.round(seconds / 86400);
    if (days < 365) return '约 ' + days + ' 天';
    var years = seconds / 31557600;
    if (years < 10) return '约 ' + (Math.round(years * 10) / 10) + ' 年';
    if (years < 10000) return '约 ' + Math.round(years) + ' 年';
    if (years < 1e8) return '约 ' + (Math.round(years / 1e4 * 10) / 10) + ' 万年';
    return '约 ' + (Math.round(years / 1e8 * 10) / 10) + ' 亿年';
  }

  var LEVEL_LABELS = {
    'very-weak': '极弱', 'weak': '弱', 'medium': '一般', 'strong': '强', 'very-strong': '极强'
  };

  /* classifyStrength(score) -> 'very-weak'|'weak'|'medium'|'strong'|'very-strong'：
   * 边界 0–19／20–39／40–59／60–79／80–100。 */
  function classifyStrength(score) {
    if (typeof score !== 'number' || isNaN(score) || !isFinite(score) || score < 0 || score > 100) {
      throw fail('score', 'score 必须为 0–100 的数字');
    }
    if (score < 20) return 'very-weak';
    if (score < 40) return 'weak';
    if (score < 60) return 'medium';
    if (score < 80) return 'strong';
    return 'very-strong';
  }

  var PATTERN_DEDUCTION = { 'repeat': 10, 'sequence': 10, 'keyboard': 10, 'only-digits': 15, 'only-letters': 10 };

  var CHECK_DEFS = [
    { id: 'length-8', label: '长度至少 8 位' },
    { id: 'length-12', label: '长度至少 12 位' },
    { id: 'lower', label: '包含小写字母（a–z）' },
    { id: 'upper', label: '包含大写字母（A–Z）' },
    { id: 'digit', label: '包含数字（0–9）' },
    { id: 'symbol', label: '包含符号（如 ! @ # $ %）' },
    { id: 'not-common', label: '不是常见密码' },
    { id: 'no-patterns', label: '无弱模式（连续／重复／键盘序列／纯数字／纯字母）' }
  ];

  function findCheck(checks, id) {
    for (var i = 0; i < checks.length; i++) {
      if (checks[i] && checks[i].id === id) return checks[i];
    }
    return null;
  }

  function checkPassed(checks, id) {
    var c = findCheck(checks, id);
    return !!c && c.passed === true;
  }

  /* buildSuggestions(checks, patterns, isCommon) -> string[]：按未通过项逐项给改进建议；
   * 全部通过时返回一条防复用提醒。顺序：常见密码 → 长度 → 字符类 → 弱模式。 */
  function buildSuggestions(checks, patterns, isCommon) {
    if (!Array.isArray(checks)) throw fail('checks', 'checks 必须为数组');
    if (!Array.isArray(patterns)) throw fail('patterns', 'patterns 必须为数组');
    if (typeof isCommon !== 'boolean') throw fail('isCommon', 'isCommon 必须为布尔值');
    var out = [];
    if (isCommon) out.push('这是常见密码（命中常见密码表），请立即更换为随机生成的强密码');
    if (!checkPassed(checks, 'length-8')) {
      out.push('密码太短：至少 8 位，建议 12 位以上');
    } else if (!checkPassed(checks, 'length-12')) {
      out.push('建议把长度增加到 12 位以上，长度是强度最稳的来源');
    }
    if (!checkPassed(checks, 'lower')) out.push('加入小写字母（a–z）');
    if (!checkPassed(checks, 'upper')) out.push('加入大写字母（A–Z）');
    if (!checkPassed(checks, 'digit')) out.push('加入数字（0–9）');
    if (!checkPassed(checks, 'symbol')) out.push('加入符号（如 ! @ # $ %）');
    if (patterns.indexOf('repeat') !== -1) out.push('避免同一字符连续重复 3 次以上（如 aaa、111）');
    if (patterns.indexOf('sequence') !== -1) out.push('避免连续递增或递减的字符（如 abc、123、cba）');
    if (patterns.indexOf('keyboard') !== -1) out.push('避免键盘上相邻的按键序列（如 qwerty、1qaz）');
    if (patterns.indexOf('only-digits') !== -1) out.push('不要只用数字：混合大小写字母与符号');
    if (patterns.indexOf('only-letters') !== -1) out.push('不要只用字母：加入数字与符号');
    if (out.length === 0) out.push('已通过全部检查：仍请勿在多个网站复用同一密码，并开启双因素认证');
    return out;
  }

  /* scorePassword(password) -> {score, level, bits, crackSeconds, checks, suggestions}：
   * 基础分＝min(熵值, 100)，弱模式逐项扣分，命中常见密码封顶 10 分（极弱）。 */
  function scorePassword(password) {
    requirePassword(password);
    var bits = calcEntropyBits(password);
    var cs = detectCharset(password);
    var patterns = detectWeakPatterns(password);
    var isCommon = isCommonPassword(password);
    var score = Math.min(100, bits);
    for (var i = 0; i < patterns.length; i++) score -= PATTERN_DEDUCTION[patterns[i]] || 0;
    if (isCommon) score = Math.min(score, 10);
    score = Math.max(0, Math.round(score));
    var passed = {
      'length-8': password.length >= 8,
      'length-12': password.length >= 12,
      'lower': cs.classes.indexOf('lower') !== -1,
      'upper': cs.classes.indexOf('upper') !== -1,
      'digit': cs.classes.indexOf('digit') !== -1,
      'symbol': cs.classes.indexOf('symbol') !== -1,
      'not-common': !isCommon,
      'no-patterns': patterns.length === 0
    };
    var checks = CHECK_DEFS.map(function (d) {
      return { id: d.id, label: d.label, passed: passed[d.id] };
    });
    return {
      score: score,
      level: classifyStrength(score),
      bits: bits,
      crackSeconds: estimateCrackSeconds(bits),
      checks: checks,
      suggestions: buildSuggestions(checks, patterns, isCommon)
    };
  }

  var api = {
    detectCharset: detectCharset,
    calcEntropyBits: calcEntropyBits,
    isCommonPassword: isCommonPassword,
    detectWeakPatterns: detectWeakPatterns,
    estimateCrackSeconds: estimateCrackSeconds,
    formatDuration: formatDuration,
    classifyStrength: classifyStrength,
    scorePassword: scorePassword,
    buildSuggestions: buildSuggestions,
    levelLabels: LEVEL_LABELS
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.PasswordStrengthChecker = api;

  /* ---------- 浏览器端 UI：仅在有 DOM 时绑定 ---------- */
  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', function () {
      var input = document.getElementById('psc-password');
      var toggleBtn = document.getElementById('psc-toggle');
      var clearBtn = document.getElementById('psc-clear');
      var result = document.getElementById('psc-result');
      if (!input || !result) return;

      var LEVEL_COLORS = {
        'very-weak': '#dc2626', 'weak': '#ea580c', 'medium': '#d97706',
        'strong': '#65a30d', 'very-strong': '#16a34a'
      };

      function escapeHtml(s) {
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      }

      function render() {
        var password = input.value;
        if (!password) {
          result.className = 'psc-result';
          result.innerHTML = '<p class="psc-hint">输入密码后实时显示强度分析。密码只在你的浏览器里计算，不会上传或保存。</p>';
          return;
        }
        var r = scorePassword(password);
        var color = LEVEL_COLORS[r.level];
        var label = LEVEL_LABELS[r.level];
        var cs = detectCharset(password);
        var common = isCommonPassword(password);
        var weak = r.score < 60 || common;
        var html = '';
        html += '<div class="psc-score"><span class="psc-level" style="color:' + color + '">' +
          label + ' ' + r.score + ' / 100</span>' +
          '<div class="psc-bar"><div class="psc-fill" style="width:' + r.score + '%;background:' + color + '"></div></div></div>';
        if (common) {
          html += '<p class="psc-common">⚠ 这是常见密码：已命中常见密码表，极易被猜中或撞库，请立即更换。</p>';
        }
        html += '<p>熵值约 <b>' + r.bits + ' bit</b>（字符集大小 ' + cs.size +
          '，按实际出现字符检测：' + escapeHtml(cs.classes.join('、') || '无') + '）</p>';
        html += '<p>离线破解约需 <b>' + formatDuration(r.crackSeconds) +
          '</b>（按 10^10 次／秒估算，仅供参考）</p>';
        html += '<h4>逐项检查</h4><ul class="psc-checks">' +
          r.checks.map(function (c) {
            return '<li class="' + (c.passed ? 'psc-pass' : 'psc-fail') + '">' +
              (c.passed ? '✓ ' : '✗ ') + escapeHtml(c.label) + '</li>';
          }).join('') + '</ul>';
        html += '<h4>改进建议</h4><ol class="psc-suggest">' +
          r.suggestions.map(function (s) { return '<li>' + escapeHtml(s) + '</li>'; }).join('') + '</ol>';
        if (weak) {
          html += '<p class="psc-links">密码偏弱？<a href="/tools/password-generator">去随机密码生成器生成一个强密码 →</a> ' +
            '<a href="/tools/password-breach-checker">去密码泄露查询查一下它是否已被泄露 →</a></p>';
        }
        result.className = 'psc-result psc-' + r.level;
        result.innerHTML = html;
      }

      input.addEventListener('input', render);
      if (toggleBtn) toggleBtn.addEventListener('click', function () {
        var show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        toggleBtn.textContent = show ? '隐藏' : '显示';
      });
      if (clearBtn) clearBtn.addEventListener('click', function () {
        input.value = '';
        render();
        input.focus();
      });
      render();
    });
  }
})(typeof window !== 'undefined' ? window : this);
