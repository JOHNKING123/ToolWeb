/* 密码泄露查询（k-匿名版）纯函数 + 浏览器端查询逻辑。
 * 隐私设计：密码本身不出浏览器。浏览器内 WebCrypto SHA-1 后，仅把哈希前 5 位
 * 发往 https://api.pwnedpasswords.com/range/{prefix}，后缀在本地比对计次。
 * 本页不保存、不进 URL、不写浏览器存储；查完一键清除。
 * 导出：window.PasswordBreachChecker（浏览器）与 module.exports（node 测试，同步导出）。
 */
(function (global) {
  'use strict';

  function fail(field, message) {
    var e = new Error(message);
    e.field = field;
    return e;
  }

  function isHexString(s, len) {
    return typeof s === 'string' && s.length === len && /^[0-9a-fA-F]+$/.test(s);
  }

  /* splitHash(sha1Hex) -> {prefix, suffix}：前 5 位 + 后 35 位，统一大写。 */
  function splitHash(sha1Hex) {
    if (!isHexString(sha1Hex, 40)) {
      throw fail('sha1Hex', 'SHA-1 哈希必须是 40 位十六进制字符串');
    }
    var upper = sha1Hex.toUpperCase();
    return { prefix: upper.slice(0, 5), suffix: upper.slice(5) };
  }

  /* parseRangeResponse(text) -> [{suffix, count}]：非法行抛错，不静默跳过。
   * 响应行格式：35 位十六进制后缀:出现次数。末尾单个空行（尾换行）除外。 */
  function parseRangeResponse(text) {
    if (typeof text !== 'string') {
      throw fail('text', 'range 响应必须是字符串');
    }
    if (text === '') return [];
    var lines = text.split(/\r?\n/);
    if (lines.length && lines[lines.length - 1] === '') lines.pop();
    var out = [];
    for (var i = 0; i < lines.length; i++) {
      var m = /^([0-9a-fA-F]{35}):(\d+)$/.exec(lines[i]);
      if (!m) throw fail('text', 'range 响应第 ' + (i + 1) + ' 行格式非法');
      out.push({ suffix: m[1].toUpperCase(), count: parseInt(m[2], 10) });
    }
    return out;
  }

  /* findBreachCount(entries, suffix) -> number：未命中返回 0。 */
  function findBreachCount(entries, suffix) {
    if (!Array.isArray(entries)) {
      throw fail('entries', 'entries 必须为数组');
    }
    if (!isHexString(suffix, 35)) {
      throw fail('suffix', 'suffix 必须是 35 位十六进制字符串');
    }
    var target = suffix.toUpperCase();
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      if (e && typeof e.suffix === 'string' && e.suffix.toUpperCase() === target) {
        return e.count;
      }
    }
    return 0;
  }

  /* classifyCount(count) -> 'safe' | 'low' | 'high'：0 / 1-100 / >100。 */
  function classifyCount(count) {
    if (typeof count !== 'number' || !isFinite(count) ||
        Math.floor(count) !== count || count < 0) {
      throw fail('count', 'count 必须为非负整数');
    }
    if (count === 0) return 'safe';
    if (count <= 100) return 'low';
    return 'high';
  }

  /* buildAdvice(classification) -> string：各档关键文案。 */
  function buildAdvice(classification) {
    if (classification === 'safe') {
      return '未在 Have I Been Pwned 收录的泄露库中出现：该密码暂未出现在已知泄露数据中，仍建议每个网站使用不同密码。';
    }
    if (classification === 'low') {
      return '低频出现：该密码已在泄露数据中出现，建议更换为随机强密码，不要在其他网站复用。';
    }
    if (classification === 'high') {
      return '高频出现：请立即更换该密码，检查他处复用（凡是用过同一密码的账号一并更换），并开启双因素认证。';
    }
    throw fail('classification', 'classification 必须是 safe、low 或 high');
  }

  /* hashPassword(password) -> Promise<string>：浏览器 WebCrypto SHA-1，大写 hex。 */
  function hashPassword(password) {
    if (typeof password !== 'string' || password === '') {
      return Promise.reject(fail('password', '密码不能为空'));
    }
    var cryptoObj = (global.crypto || global.msCrypto || null);
    if (!cryptoObj || !cryptoObj.subtle || typeof cryptoObj.subtle.digest !== 'function') {
      return Promise.reject(fail('password', '当前浏览器不支持 WebCrypto SHA-1'));
    }
    var data;
    if (typeof TextEncoder !== 'undefined') {
      data = new TextEncoder().encode(password);
    } else {
      var bytes = [];
      for (var i = 0; i < password.length; i++) bytes.push(password.charCodeAt(i) & 0xff);
      data = new Uint8Array(bytes);
    }
    return cryptoObj.subtle.digest('SHA-1', data).then(function (buf) {
      var arr = new Uint8Array(buf);
      var hex = '';
      for (var i = 0; i < arr.length; i++) {
        hex += ('0' + arr[i].toString(16)).slice(-2);
      }
      return hex.toUpperCase();
    });
  }

  var api = {
    splitHash: splitHash,
    parseRangeResponse: parseRangeResponse,
    findBreachCount: findBreachCount,
    classifyCount: classifyCount,
    buildAdvice: buildAdvice,
    hashPassword: hashPassword
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.PasswordBreachChecker = api;

  /* ---------- 浏览器端 UI：仅在有 DOM 时绑定 ---------- */
  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', function () {
      var input = document.getElementById('pbc-password');
      var checkBtn = document.getElementById('pbc-check');
      var clearBtn = document.getElementById('pbc-clear');
      var toggleBtn = document.getElementById('pbc-toggle');
      var result = document.getElementById('pbc-result');
      if (!input || !checkBtn || !result) return;

      function setResult(html, cls) {
        result.className = 'pbc-result' + (cls ? ' ' + cls : '');
        result.innerHTML = html;
      }
      function clearAll() {
        input.value = '';
        result.className = 'pbc-result';
        result.innerHTML = '';
        input.focus();
      }
      if (clearBtn) clearBtn.addEventListener('click', clearAll);
      if (toggleBtn) toggleBtn.addEventListener('click', function () {
        var show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        toggleBtn.textContent = show ? '隐藏' : '显示';
      });
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') checkBtn.click();
      });

      checkBtn.addEventListener('click', function () {
        var password = input.value;
        if (!password) {
          setResult('<p>请先输入要查询的密码。</p>', 'pbc-warn');
          return;
        }
        checkBtn.disabled = true;
        setResult('<p>正在查询（仅发送哈希前 5 位）…</p>', '');
        var controller = null;
        var timeoutId = null;
        if (typeof AbortController !== 'undefined') {
          controller = new AbortController();
          timeoutId = setTimeout(function () { controller.abort(); }, 15000);
        }
        hashPassword(password).then(function (hash) {
          var parts = splitHash(hash);
          return fetch('https://api.pwnedpasswords.com/range/' + parts.prefix, {
            method: 'GET',
            signal: controller ? controller.signal : undefined
          }).then(function (resp) {
            if (!resp.ok) throw new Error('服务返回 ' + resp.status);
            return resp.text();
          }).then(function (text) {
            var count = findBreachCount(parseRangeResponse(text), parts.suffix);
            var level = classifyCount(count);
            var advice = buildAdvice(level);
            var head = level === 'safe'
              ? '未在已知泄露库中出现（出现次数：0）'
              : '已在泄露数据中出现 ' + count + ' 次';
            var link = level === 'safe' ? '' :
              '<p><a href="/tools/password-generator">去随机密码生成器生成一个新密码 →</a></p>';
            setResult('<p class="pbc-head">' + head + '</p><p>' + advice + '</p>' + link,
              level === 'safe' ? 'pbc-safe' : (level === 'low' ? 'pbc-warn' : 'pbc-danger'));
          });
        }).catch(function () {
          setResult('<p>未能连接到查询服务，本次未完成查询，结果不是安全的证明。' +
            '请检查网络后重试。</p>' +
            '<p><button class="pbc-btn" type="button" onclick="document.getElementById(\'pbc-check\').click()">重试</button></p>',
            'pbc-warn');
        }).then(function () {
          if (timeoutId) clearTimeout(timeoutId);
          checkBtn.disabled = false;
        });
      });
    });
  }
})(typeof window !== 'undefined' ? window : this);
