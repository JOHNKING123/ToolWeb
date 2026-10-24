/* URL 解析器（url_parser）- 纯前端本地解析
 * 用浏览器 URL 原语拆解长链接：协议 / 用户名 / 密码 / 主机 / 端口 / 路径 / 查询 / 片段
 * 八段；查询参数按出现顺序分行保留，重复键不合并，空值（key=）与无值（key）
 * 以 hasValue 区分。重组时默认端口消隐、空查询不留尾随 ?、无片段不留 #。
 * 纯函数经 module.exports 暴露供 node 测试；浏览器里走 DOM。
 * 零网络请求：本文件不发起任何网络请求。 */
(function () {
'use strict';

var KNOWN_SCHEMES = ['http', 'https', 'ftp', 'ws', 'wss'];
var DEFAULT_PORTS = { 'http:': '80', 'https:': '443' };

/* 安全解码：% 编码非法时原样返回，不抛错。 */
function safeDecode(v) {
  try { return decodeURIComponent(v); } catch (e) { return v; }
}

/* 参数键/值解码：表单语义下 + 表示空格，再做 % 解码。 */
function decodeParam(v) {
  var spaced = String(v).replace(/\+/g, ' ');
  try { return decodeURIComponent(spaced); } catch (e) { return spaced; }
}

/* 从候选链接里抠出显式端口（@ 后的主机部分冒号后的数字），无则返回 ''。 */
function explicitPortOf(candidate) {
  var m = candidate.match(/:\/\/[^/?#]*:(\d+)(?=[/?#]|$)/);
  return m ? m[1] : '';
}

/* 判断输入是否自带协议，并返回候选链接与是否补齐标记。
 * 规则：// 开头补 https:；scheme:// 原样；已知协议原样；其余一律补 https://。
 * 主机:端口形（如 example.com:8080/x）与 scheme 部含点的情况按无协议处理，
 * 避免被误读成 scheme；未知协议（如 mailto:）明确报错，不静默改写。 */
function toCandidate(raw) {
  var out = { candidate: '', protocolPrepended: false, error: '' };
  if (raw.indexOf('//') === 0) {
    out.candidate = 'https:' + raw;
    out.protocolPrepended = true;
    return out;
  }
  var m = raw.match(/^([A-Za-z][A-Za-z0-9+.-]*):(.*)$/);
  if (!m) {
    out.candidate = 'https://' + raw;
    out.protocolPrepended = true;
    return out;
  }
  var scheme = m[1].toLowerCase();
  var rest = m[2];
  if (rest.indexOf('//') === 0) return { candidate: raw, protocolPrepended: false, error: '' };
  if (scheme.indexOf('.') !== -1) {
    out.candidate = 'https://' + raw;
    out.protocolPrepended = true;
    return out;
  }
  if (/^\d+([/?#]|$)/.test(rest)) {
    out.candidate = 'https://' + raw;
    out.protocolPrepended = true;
    return out;
  }
  if (KNOWN_SCHEMES.indexOf(scheme) !== -1) {
    return { candidate: raw, protocolPrepended: false, error: '' };
  }
  out.error = '暂不支持该协议（' + scheme + '），请输入 http/https 链接';
  return out;
}

/* 解析查询串：按 & 切分，空段跳过；每段按首个 = 切分，hasValue 区分空值与无值。 */
function parseQueryParams(search) {
  var params = [];
  if (!search || search.charAt(0) !== '?') return params;
  var body = search.slice(1);
  if (body === '') return params;
  var segs = body.split('&');
  for (var i = 0; i < segs.length; i++) {
    var seg = segs[i];
    if (seg === '') continue;
    var eq = seg.indexOf('=');
    if (eq === -1) {
      params.push({ key: decodeParam(seg), value: '', hasValue: false });
    } else {
      params.push({ key: decodeParam(seg.slice(0, eq)), value: decodeParam(seg.slice(eq + 1)), hasValue: true });
    }
  }
  return params;
}

/* 校验参数键：空键、含空格及 & = # ? / 均非法。合法返回 ''，否则返回错误文案。 */
function validateParamKey(key) {
  if (key === null || key === undefined || String(key) === '') return '键不能为空';
  if (/[\s&=#?/]/.test(String(key))) return '键不能包含空格、&、=、#、?、/';
  return '';
}

/* 由参数表拼查询串；返回 {search, errors}，非法键整批报错、不输出畸形查询。 */
function buildQuery(params) {
  var errors = [];
  var parts = [];
  for (var i = 0; i < params.length; i++) {
    var p = params[i];
    var err = validateParamKey(p.key);
    if (err) { errors.push('第 ' + (i + 1) + ' 行：' + err); continue; }
    var k = encodeURIComponent(String(p.key));
    if (!p.hasValue) { parts.push(k); }
    else { parts.push(k + '=' + encodeURIComponent(String(p.value))); }
  }
  if (errors.length > 0) return { search: '', errors: errors };
  return { search: parts.length ? '?' + parts.join('&') : '', errors: [] };
}

/* 按 URL 规范重组：协议 + // + 用户信息 + 主机 + 端口 + 路径 + 查询 + 片段。
 * base 的各段须为 URL 规范化后的值；port 为 '' 时不写端口（默认端口天然消隐），
 * 查询为空不留尾随 ?，片段为空不留 #。 */
function rebuildUrl(base, params) {
  var q = buildQuery(params || []);
  if (q.errors.length > 0) return { url: '', errors: q.errors };
  var auth = '';
  if (base.username) {
    auth = base.username + (base.password ? ':' + base.password : '') + '@';
  }
  var portPart = base.port ? ':' + base.port : '';
  var path = base.pathname || '/';
  return { url: base.protocol + '//' + auth + base.hostname + portPart + path + q.search + (base.hash || ''), errors: [] };
}

/* 解析主函数。输入原始字符串，输出八段 + 参数数组 + 重组链接 + 补齐标记。
 * 非法输入返回 {valid:false, errors:[...]}，不输出畸形拆解。 */
function parseUrl(rawInput) {
  var out = { valid: false, errors: [] };
  var raw = (rawInput === null || rawInput === undefined) ? '' : String(rawInput).trim();
  if (raw === '') { out.errors.push('请输入要解析的 URL'); return out; }
  if (/[\s\u0000-\u001F\u007F]/.test(raw)) {
    out.errors.push('链接中不能包含空格或换行：请把折行的链接拼成一行后再解析');
    return out;
  }
  var cand = toCandidate(raw);
  if (cand.error) { out.errors.push(cand.error); return out; }
  var u;
  try { u = new URL(cand.candidate); } catch (e) {
    out.errors.push('无法解析该链接：请检查协议、主机与端口是否完整正确');
    return out;
  }
  if (!u.hostname) { out.errors.push('链接缺少主机名：请输入带主机的完整链接'); return out; }
  var explicit = explicitPortOf(cand.candidate);
  var isDefault = !!explicit && DEFAULT_PORTS[u.protocol] === explicit;
  var params = parseQueryParams(u.search);
  var rebuilt = rebuildUrl({
    protocol: u.protocol, username: u.username, password: u.password,
    hostname: u.hostname, port: u.port, pathname: u.pathname, hash: u.hash
  }, params);
  out.valid = true;
  out.originalInput = rawInput;
  out.protocolPrepended = cand.protocolPrepended;
  out.protocol = u.protocol;
  out.username = u.username;
  out.password = u.password;
  out.hostname = u.hostname;
  out.port = u.port;
  out.portNote = isDefault ? '默认端口' : (u.port ? '' : '未指定');
  out.explicitPort = explicit;
  out.isDefaultPort = isDefault;
  out.pathname = u.pathname;
  out.search = u.search;
  out.hash = u.hash;
  out.queryParams = params;
  out.rebuilt = rebuilt.url;
  /* 解码对照：仅收录解码后与原值不同的段，供界面展示「原始值 / 解码值」。 */
  var diffs = {};
  var fields = ['protocol', 'username', 'password', 'hostname', 'pathname', 'search', 'hash'];
  for (var i = 0; i < fields.length; i++) {
    var f = fields[i];
    var dec = safeDecode(out[f]);
    if (dec !== out[f]) diffs[f] = dec;
  }
  out.decodedDiffs = diffs;
  return out;
}

/* 结构化 JSON：八段 + 参数数组 + 原始输入 + 补齐标记 + 重组链接。 */
function toJsonObject(parsed, rebuiltOverride) {
  return {
    originalInput: parsed.originalInput,
    protocolPrepended: parsed.protocolPrepended,
    protocol: parsed.protocol,
    username: parsed.username,
    password: parsed.password,
    hostname: parsed.hostname,
    port: parsed.port,
    portNote: parsed.portNote,
    pathname: parsed.pathname,
    search: parsed.search,
    hash: parsed.hash,
    queryParams: parsed.queryParams.map(function (p) {
      return { key: p.key, value: p.value, hasValue: p.hasValue };
    }),
    rebuilt: (rebuiltOverride !== undefined && rebuiltOverride !== null) ? rebuiltOverride : parsed.rebuilt
  };
}

/* 4 组示例：回调 / 分享 / 完整链接 / 重复键与空值，载入后均可编辑再重组。 */
var EXAMPLES = [
  {
    name: '回调链接',
    url: 'https://app.example.com/oauth/callback?code=AbC123xyz&state=9f8e7d6c',
    note: '登录回调常带 code 与 state：拆开看参数名有没有拼错、state 是否回传。'
  },
  {
    name: '带 utm 的分享链接',
    url: 'https://news.example.com/article/2026-guide?utm_source=wechat&utm_medium=social&utm_campaign=spring_sale&ref=home',
    note: '分享链接里的 utm_ 三件套一目了然，改表可去掉追踪参数再重组。'
  },
  {
    name: '含用户名 / 端口 / 片段的完整链接',
    url: 'https://user:secret123@files.example.com:8443/docs/report.pdf?download=1#page=3',
    note: '@ 之前是用户信息、真正主机在 @ 之后；8443 是非默认端口，重组时保留。'
  },
  {
    name: '重复键与空值的链接',
    url: 'https://shop.example.com/search?tag=phone&tag=tablet&coupon=&promo&sort=price',
    note: 'tag 重复出现分行保留；coupon= 是空值、promo 是无值，两者含义不同。'
  }
];

var api = {
  parseUrl: parseUrl,
  parseQueryParams: parseQueryParams,
  validateParamKey: validateParamKey,
  buildQuery: buildQuery,
  rebuildUrl: rebuildUrl,
  toJsonObject: toJsonObject,
  safeDecode: safeDecode,
  decodeParam: decodeParam,
  EXAMPLES: EXAMPLES
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
} else {
  window.UrlParser = api;
  document.addEventListener('DOMContentLoaded', function () {
    var $ = function (id) { return document.getElementById(id); };
    var inputEl = $('up-input'), errorEl = $('up-errors'), resultEl = $('up-result');
    var noticeEl = $('up-notice'), segBody = $('up-seg-body'), paramBody = $('up-param-body');
    var rebuiltEl = $('up-rebuilt'), paramHintEl = $('up-param-hint');
    var showPassword = false;
    var current = null; /* {parts, params, originalInput, protocolPrepended} */
    var lastParsedInput = '';

    function toast(msg) {
      var t = $('up-toast');
      t.textContent = msg;
      t.style.display = 'block';
      setTimeout(function () { t.style.display = 'none'; }, 2600);
    }
    function showErrors(list) {
      errorEl.innerHTML = list.map(function (e) { return '<p style="margin:0;">' + e + '</p>'; }).join('');
      errorEl.style.display = 'block';
    }
    function hideErrors() { errorEl.style.display = 'none'; errorEl.innerHTML = ''; }
    function esc(s) {
      return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function maskPassword(pw) { return pw ? '••••••••' : '（无）'; }

    function renderSegments() {
      var p = current.parts;
      var rows = [
        ['协议', p.protocol, p.decodedDiffs.protocol || ''],
        ['用户名', p.username || '（无）', p.decodedDiffs.username || ''],
        ['密码', showPassword ? (p.password || '（无）') : maskPassword(p.password),
          !p.password ? '' : (showPassword ? (p.decodedDiffs.password || '') : '默认掩码显示，点「显示明文」可切换查看')],
        ['主机', p.hostname, p.decodedDiffs.hostname || ''],
        ['端口', p.port || (p.isDefaultPort ? '默认端口（' + p.explicitPort + '，重组时消隐）' : '未指定'), ''],
        ['路径', p.pathname, p.decodedDiffs.pathname || ''],
        ['查询', p.search || '（无查询）', p.decodedDiffs.search || ''],
        ['片段', p.hash || '（无片段）', p.decodedDiffs.hash || '']
      ];
      segBody.innerHTML = rows.map(function (r) {
        var note = r[2] ? '<div class="up-decoded">解码后：' + esc(r[2]) + '</div>' : '';
        return '<tr><th>' + r[0] + '</th><td><div class="up-cell">' + esc(r[1]) + '</div>' + note + '</td></tr>';
      }).join('');
      $('up-pw-toggle').textContent = showPassword ? '隐藏密码' : '显示明文';
      $('up-pw-toggle').style.display = p.password ? '' : 'none';
    }

    function readParamsFromDom() {
      var rows = paramBody.querySelectorAll('tr');
      var params = [];
      rows.forEach(function (tr) {
        var k = tr.querySelector('.up-pkey').value;
        var v = tr.querySelector('.up-pval').value;
        var hasValue = tr.querySelector('.up-phas').checked;
        params.push({ key: k, value: v, hasValue: hasValue });
      });
      return params;
    }

    function refreshRebuilt(showParamErrors) {
      var params = readParamsFromDom();
      var q = buildQuery(params);
      if (q.errors.length > 0) {
        if (showParamErrors) {
          paramHintEl.textContent = q.errors.join('；');
          paramHintEl.style.color = '#991b1b';
        }
        return;
      }
      paramHintEl.textContent = '提示：键不能包含空格、&、=、#、?、/；空值行重组为 key=，无值行重组为只有 key。';
      paramHintEl.style.color = '';
      var r = rebuildUrl(current.parts, params);
      rebuiltEl.value = r.url;
      current.params = params;
      current.rebuilt = r.url;
    }

    function renderParams() {
      paramBody.innerHTML = '';
      current.params.forEach(function (p, idx) {
        var tr = document.createElement('tr');
        var kind = p.hasValue ? (p.value === '' ? '空值' : '有值') : '无值';
        tr.innerHTML = '<td><input class="up-pkey" type="text" value="' + esc(p.key) + '" aria-label="参数键"></td>' +
          '<td><input class="up-pval" type="text" value="' + esc(p.value) + '" aria-label="参数值"' + (p.hasValue ? '' : ' disabled') + '></td>' +
          '<td><label style="font-size:.85rem;white-space:nowrap;"><input class="up-phas" type="checkbox"' + (p.hasValue ? ' checked' : '') + '> 有等号</label> <span class="up-kind">' + kind + '</span></td>' +
          '<td><button class="up-btn up-btn-danger" type="button" data-del="' + idx + '">删除</button></td>';
        paramBody.appendChild(tr);
      });
      paramBody.querySelectorAll('input').forEach(function (el) {
        el.addEventListener('input', onParamChange);
        el.addEventListener('change', onParamChange);
      });
      paramBody.querySelectorAll('[data-del]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var i = parseInt(btn.getAttribute('data-del'), 10);
          current.params.splice(i, 1);
          renderParams();
          refreshRebuilt(false);
        });
      });
      function onParamChange(ev) {
        var tr = ev.target.closest('tr');
        if (ev.target.classList.contains('up-phas')) {
          var valInput = tr.querySelector('.up-pval');
          valInput.disabled = !ev.target.checked;
          var kindEl = tr.querySelector('.up-kind');
          if (!ev.target.checked) kindEl.textContent = '无值';
          else kindEl.textContent = (valInput.value === '' ? '空值' : '有值');
        }
        if (ev.target.classList.contains('up-pval')) {
          var hasEl = tr.querySelector('.up-phas');
          if (hasEl.checked) tr.querySelector('.up-kind').textContent = (ev.target.value === '' ? '空值' : '有值');
        }
        refreshRebuilt(false);
      }
      if (current.params.length === 0) {
        var empty = document.createElement('tr');
        empty.innerHTML = '<td colspan="4" style="color:#6b7280;">暂无查询参数：点「新增参数」加一行，或直接在上方输入带 ? 的链接重新解析。</td>';
        paramBody.appendChild(empty);
      }
    }

    function doParse() {
      var raw = inputEl.value;
      var parsed = parseUrl(raw);
      if (!parsed.valid) {
        showErrors(parsed.errors);
        resultEl.style.display = 'none';
        return;
      }
      hideErrors();
      lastParsedInput = raw;
      current = {
        parts: parsed,
        params: parsed.queryParams.map(function (p) { return { key: p.key, value: p.value, hasValue: p.hasValue }; }),
        originalInput: parsed.originalInput,
        protocolPrepended: parsed.protocolPrepended,
        rebuilt: parsed.rebuilt
      };
      noticeEl.textContent = parsed.protocolPrepended
        ? '已自动补齐 https://：输入无协议，解析时按 https:// 补齐，结果与重组链接均为补齐后的版本。'
        : '未补齐协议：输入自带协议，解析结果即原始协议。';
      noticeEl.style.display = 'block';
      renderSegments();
      renderParams();
      rebuiltEl.value = parsed.rebuilt;
      resultEl.style.display = 'block';
    }

    function copyText(text, okMsg) {
      function fallback() {
        var ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        var ok = false;
        try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
        document.body.removeChild(ta);
        toast(ok ? okMsg : '复制失败，请手动选中输出框内容复制。');
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { toast(okMsg); }, fallback);
      } else { fallback(); }
    }

    $('up-parse').addEventListener('click', doParse);
    $('up-reset').addEventListener('click', function () {
      if (lastParsedInput) { inputEl.value = lastParsedInput; doParse(); }
      else { inputEl.value = ''; resultEl.style.display = 'none'; hideErrors(); noticeEl.style.display = 'none'; }
    });
    $('up-pw-toggle').addEventListener('click', function () {
      showPassword = !showPassword;
      renderSegments();
    });
    $('up-add-param').addEventListener('click', function () {
      if (!current) { toast('请先解析一个链接，再新增参数。'); return; }
      if (paramBody.querySelector('td[colspan]')) paramBody.innerHTML = '';
      current.params.push({ key: '', value: '', hasValue: true });
      renderParams();
      refreshRebuilt(false);
    });
    $('up-rebuild').addEventListener('click', function () {
      if (!current) { toast('请先解析一个链接。'); return; }
      refreshRebuilt(true);
      if (rebuiltEl.value) toast('已按当前参数表重组链接。');
    });
    $('up-copy-link').addEventListener('click', function () {
      if (!rebuiltEl.value) { toast('暂无可复制的链接，请先解析。'); return; }
      copyText(rebuiltEl.value, '已复制重组后的链接。');
    });
    $('up-copy-json').addEventListener('click', function () {
      if (!current) { toast('请先解析一个链接。'); return; }
      refreshRebuilt(false);
      var obj = toJsonObject(current.parts, rebuiltEl.value);
      obj.queryParams = current.params.map(function (p) { return { key: p.key, value: p.value, hasValue: p.hasValue }; });
      obj.search = buildQuery(current.params).search;
      copyText(JSON.stringify(obj, null, 2), '已复制结构化 JSON。');
    });
    document.querySelectorAll('[data-example]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var ex = EXAMPLES[parseInt(btn.getAttribute('data-example'), 10)];
        inputEl.value = ex.url;
        doParse();
      });
    });
    inputEl.addEventListener('keydown', function (ev) {
      if ((ev.ctrlKey || ev.metaKey) && ev.key === 'Enter') doParse();
    });
  });
}
})();
