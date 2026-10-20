'use strict';
/*
 * URL 追踪参数清除器（URL Tracker Cleaner）—— 纯前端、零依赖、零上传
 *
 * 能力：
 * 1. 粘贴单条或多行批量 URL，一键剔除追踪参数（utm_* / fbclid / gclid / spm / from 等）
 * 2. 内置黑名单 + 用户自定义追加剔除参数；白名单（业务参数如商品 id / 视频 id）优先保留
 * 3. 剔除清单逐项展示，可勾选保留单个参数
 * 4. 短链展开还原：客户端 fetch，CORS 受限时如实标记「未展开」并提供手动粘贴入口
 * 5. 干净链接一键复制（Clipboard API + 降级）/ 批量下载 .txt
 * 6. 自定义规则经 localStorage 持久化
 */
(function () {
  var $ = function (id) { return document.getElementById(id); };

  /* ---------- 内置黑名单（全部小写存储，匹配时忽略大小写） ---------- */
  var DEFAULT_BLACKLIST = [
    // 通用 UTM 系列
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
    'utm_id', 'utm_source_platform', 'utm_creative_format', 'utm_marketing_tactic',
    // Google / 微软 / 广告归因
    'gclid', 'gclsrc', 'dclid', 'gbraid', 'wbraid', 'msclkid', 'srsltid',
    // 社媒 click id
    'fbclid', 'ttclid', 'ttd_pid', 'li_fat_id', 'igshid', 'yclid', 'ysmclid',
    // 邮件 / 营销自动化
    'mc_cid', 'mc_eid', '_hsenc', '_hsmi', 'hsctatracking', 'mkt_tok',
    'vero_id', 'vero_conv', '_openstat', '_ijt',
    'sc_campaign', 'sc_channel', 'sc_content', 'sc_medium', 'sc_outcome',
    'sc_regionid', 'sc_trk',
    // 中国场景：淘宝 / 拼多多 / 微信 / 抖音 / 小红书
    'spm', 'scm', 'from', 'from_source', 'from_url', 'sfrom',
    'share_from', 'share_id', 'share_source', 'share_app_name', 'share_token',
    'weixin', 'wxshare', 'ug_source', 'sec_source', 'xhs_share'
  ];

  /* ---------- 默认白名单：常见业务参数，永远保留（用户可追加） ---------- */
  var DEFAULT_KEEP = [
    'id', 'pid', 'gid', 'vid', 'aid', 'cid', 'mid', 'oid', 'uid',
    'item_id', 'goods_id', 'product_id', 'sku_id', 'spu_id',
    'aweme_id', 'video_id', 'note_id', 'xsec_token', 'xsec_source',
    'bv', 'av', 'bvid', 'doc_id', 'page', 'p', 'q', 'keyword', 'wd', 'search'
  ];

  var LS_BLACK = 'url_tracker_cleaner_black_extra';
  var LS_KEEP = 'url_tracker_cleaner_keep_extra';

  function loadList(key) {
    try {
      var v = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(v) ? v.filter(function (x) { return typeof x === 'string' && x; }) : [];
    } catch (e) { return []; }
  }
  function saveList(key, arr) {
    try { localStorage.setItem(key, JSON.stringify(arr)); } catch (e) {}
  }

  var userBlack = loadList(LS_BLACK);
  var userKeep = loadList(LS_KEEP);

  function blacklist() { return DEFAULT_BLACKLIST.concat(userBlack); }
  function keeplist() { return DEFAULT_KEEP.concat(userKeep); }

  function isTracked(name) {
    var n = String(name).toLowerCase();
    if (n.indexOf('utm_') === 0) return true; // 兜底：任何 utm_ 开头都算追踪参数
    return blacklist().indexOf(n) !== -1;
  }
  function isBusiness(name) {
    return keeplist().indexOf(String(name).toLowerCase()) !== -1;
  }

  /* ---------- 短链域名识别 ---------- */
  var SHORT_DOMAINS = [
    't.cn', 'bit.ly', 'tinyurl.com', 'goo.gl', 'is.gd', 't.co', 'ow.ly',
    'buff.ly', 'cutt.ly', 'rebrand.ly', 'shorturl.at', 'tiny.cc',
    'url.cn', 'dwz.cn', 'suo.im', 'sinaurl.cn', '163.fm', 'b23.tv',
    'v.douyin.com', 'xhslink.com', 'xhs.com.cn'
  ];
  function isShortDomain(host) {
    host = String(host).toLowerCase();
    return SHORT_DOMAINS.some(function (d) { return host === d || host.endsWith('.' + d); });
  }

  /* ---------- 工具函数 ---------- */
  function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function normalizeInput(raw) {
    var s = String(raw).trim();
    if (!s) return null;
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(s)) {
      if (/^[\w.-]+\.[a-z]{2,}(\/|$|\?)/i.test(s)) s = 'https://' + s; // 省略协议的补 https
      else return null;
    }
    try { return new URL(s); } catch (e) { return null; }
  }
  function stampName() {
    var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return 'clean-urls-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' +
      p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()) + '.txt';
  }
  function copyText(text, done) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, function () { fallback(); });
    } else { fallback(); }
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(ta); done(ok);
    }
  }
  function toast(msg) {
    var el = $('utc-toast');
    el.textContent = msg; el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove('show'); }, 2200);
  }

  /* ---------- 核心：解析一条 URL，拆出参数清单 ---------- */
  function analyze(raw) {
    var u = normalizeInput(raw);
    if (!u) return { ok: false, raw: raw, error: '不是有效的 URL（请检查格式）' };
    var params = [];
    // 用 entries 保留重复参数；逐个访问避免遍历中删除的问题
    u.searchParams.forEach(function (value, key) {
      var tracked = isTracked(key);
      var business = isBusiness(key);
      params.push({ key: key, value: value, tracked: tracked && !business, keep: false });
      // 白名单业务参数即使命中黑名单也优先保留
    });
    return { ok: true, raw: raw, url: u, params: params };
  }

  function buildClean(entry) {
    var u = new URL(entry.url.toString());
    u.search = '';
    entry.params.forEach(function (p) {
      if (p.tracked && !p.keep) return; // 被剔除
      u.searchParams.append(p.key, p.value);
    });
    return u.toString();
  }
  function removedCount(entry) {
    return entry.params.filter(function (p) { return p.tracked && !p.keep; }).length;
  }

  /* ---------- 渲染 ---------- */
  var entries = []; // [{...analyze 结果, expanded: bool, expandedFrom}]

  function renderStats() {
    var okCount = entries.filter(function (e) { return e.ok; }).length;
    var total = entries.reduce(function (n, e) { return n + (e.ok ? removedCount(e) : 0); }, 0);
    var el = $('utc-stats');
    if (!entries.length) { el.style.display = 'none'; return; }
    el.style.display = 'flex';
    el.innerHTML =
      '<span class="utc-stat"><b>' + okCount + '</b> 条链接解析成功</span>' +
      '<span class="utc-stat"><b>' + total + '</b> 个追踪参数被清除</span>' +
      '<span class="utc-stat"><b>' + entries.filter(function (e) { return e.ok && removedCount(e) === 0; }).length + '</b> 条本来就很干净</span>';
  }

  function renderResults() {
    var box = $('utc-results');
    box.innerHTML = '';
    entries.forEach(function (entry, idx) {
      var card = document.createElement('div');
      card.className = 'utc-card' + (entry.ok ? '' : ' utc-card-err');
      if (!entry.ok) {
        card.innerHTML =
          '<div class="utc-card-head"><span class="utc-idx">#' + (idx + 1) + '</span>' +
          '<span class="utc-err">' + escHtml(entry.error) + '</span></div>' +
          '<div class="utc-raw">' + escHtml(entry.raw.slice(0, 200)) + '</div>';
        box.appendChild(card); return;
      }
      var removed = entry.params.filter(function (p) { return p.tracked; });
      var clean = buildClean(entry);
      var html = '<div class="utc-card-head"><span class="utc-idx">#' + (idx + 1) + '</span>';
      if (entry.expandedFrom) {
        html += '<span class="utc-badge utc-badge-ok">已由短链展开</span>';
      } else if (entry.unexpanded) {
        html += '<span class="utc-badge utc-badge-warn">短链未展开（CORS 受限）</span>';
      }
      html += '<span class="utc-clean-count">' + removedCount(entry) + ' 个追踪参数已清除</span></div>';
      html += '<div class="utc-row"><span class="utc-label">干净链接</span>' +
        '<code class="utc-clean">' + escHtml(clean) + '</code>' +
        '<button type="button" class="utc-mini" data-act="copy" data-idx="' + idx + '">复制</button></div>';
      if (removed.length) {
        html += '<div class="utc-removed"><span class="utc-label">剔除清单（勾选可保留）</span><ul>';
        removed.forEach(function (p, pi) {
          html += '<li><label><input type="checkbox" data-act="keep" data-idx="' + idx +
            '" data-pi="' + pi + '"' + (p.keep ? ' checked' : '') + '> 保留</label>' +
            '<code>' + escHtml(p.key) + '</code><span class="utc-val">' +
            escHtml(p.value.length > 60 ? p.value.slice(0, 60) + '…' : p.value) + '</span></li>';
        });
        html += '</ul></div>';
      }
      if (isShortDomain(entry.url.hostname) && !entry.expandedFrom) {
        html += '<div class="utc-expandrow">' +
          '<button type="button" class="utc-mini" data-act="expand" data-idx="' + idx + '">尝试展开短链</button>' +
          '<span class="utc-hint">浏览器直接请求目标站；若目标站拒绝跨域请求，会如实标记「未展开」，可手动粘贴展开后的链接到下方：</span>' +
          '<div class="utc-manual"><input type="text" data-manual="' + idx + '" placeholder="手动粘贴展开后的完整链接…">' +
          '<button type="button" class="utc-mini" data-act="manual" data-idx="' + idx + '">用此链接替换</button></div></div>';
      }
      card.innerHTML = html;
      box.appendChild(card);
    });
    renderStats();
    bindCardEvents(box);
  }

  function bindCardEvents(box) {
    box.querySelectorAll('[data-act="keep"]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        var e = entries[+cb.dataset.idx];
        e.params.filter(function (p) { return p.tracked; })[+cb.dataset.pi].keep = cb.checked;
        renderResults();
      });
    });
    box.querySelectorAll('[data-act="copy"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var e = entries[+btn.dataset.idx];
        copyText(buildClean(e), function (ok) { toast(ok ? '已复制干净链接' : '复制失败，请手动选择复制'); });
      });
    });
    box.querySelectorAll('[data-act="expand"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = +btn.dataset.idx;
        btn.disabled = true; btn.textContent = '展开中…';
        expandShort(entries[idx].url.toString(), function (finalUrl) {
          if (finalUrl && finalUrl !== entries[idx].url.toString()) {
            var ne = analyze(finalUrl);
            ne.expandedFrom = entries[idx].url.toString();
            entries[idx] = ne;
            toast('短链已展开并重新清除追踪参数');
          } else {
            entries[idx].unexpanded = true;
            toast('目标站拒绝跨域请求，短链未展开（已如实标记）');
          }
          renderResults();
        });
      });
    });
    box.querySelectorAll('[data-act="manual"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = +btn.dataset.idx;
        var input = box.querySelector('[data-manual="' + idx + '"]');
        var v = input.value.trim();
        if (!v) { toast('请先粘贴展开后的链接'); return; }
        var ne = analyze(v);
        if (!ne.ok) { toast('粘贴的链接无效'); return; }
        ne.expandedFrom = entries[idx].url.toString() + '（手动）';
        entries[idx] = ne;
        renderResults(); toast('已替换为手动展开的链接');
      });
    });
  }

  /* ---------- 短链展开：客户端 fetch；失败即诚实降级 ---------- */
  function expandShort(url, cb) {
    var done = false;
    var ctrl;
    try { ctrl = new AbortController(); } catch (e) {}
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); finish(null); }, 8000);
    function finish(finalUrl) {
      if (done) return; done = true; clearTimeout(timer); cb(finalUrl);
    }
    try {
      fetch(url, { method: 'GET', redirect: 'follow', mode: 'cors', signal: ctrl ? ctrl.signal : undefined })
        .then(function (resp) { finish(resp.url || null); })
        .catch(function () { finish(null); });
    } catch (e) { finish(null); }
  }

  /* ---------- 自定义规则管理 ---------- */
  function refreshRuleLists() {
    $('utc-black-list').textContent = userBlack.length ? userBlack.join('、') : '（暂无，你追加的将显示在这里）';
    $('utc-keep-list').textContent = userKeep.length ? userKeep.join('、') : '（暂无，你追加的将显示在这里）';
  }
  function addRules(inputId, arr, key) {
    var raw = $(inputId).value.trim();
    if (!raw) { toast('请输入参数名，多个用逗号或空格分隔'); return; }
    var added = 0;
    raw.split(/[\s,，;；]+/).forEach(function (x) {
      x = x.trim().toLowerCase();
      if (x && arr.indexOf(x) === -1 && DEFAULT_BLACKLIST.indexOf(x) === -1 && DEFAULT_KEEP.indexOf(x) === -1) {
        arr.push(x); added++;
      }
    });
    saveList(key, arr); $(inputId).value = ''; refreshRuleLists();
    toast(added ? '已追加 ' + added + ' 条自定义规则' : '这些参数名已在规则中');
  }

  /* ---------- 事件绑定 ---------- */
  document.addEventListener('DOMContentLoaded', function () {
    refreshRuleLists();

    $('utc-clean-btn').addEventListener('click', function () {
      var lines = $('utc-input').value.split('\n').map(function (s) { return s.trim(); })
        .filter(function (s) { return s.length > 0; });
      if (!lines.length) { toast('请先粘贴至少一条链接'); return; }
      entries = lines.map(analyze);
      renderResults();
      $('utc-results').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    $('utc-clear-btn').addEventListener('click', function () {
      $('utc-input').value = ''; entries = [];
      $('utc-results').innerHTML = ''; renderStats(); $('utc-input').focus();
    });

    $('utc-copyall-btn').addEventListener('click', function () {
      var ok = entries.filter(function (e) { return e.ok; });
      if (!ok.length) { toast('还没有可复制的干净链接'); return; }
      copyText(ok.map(buildClean).join('\n'), function (ok2) {
        toast(ok2 ? '已复制 ' + ok.length + ' 条干净链接' : '复制失败，请手动选择复制');
      });
    });

    $('utc-dl-btn').addEventListener('click', function () {
      var ok = entries.filter(function (e) { return e.ok; });
      if (!ok.length) { toast('还没有可下载的干净链接'); return; }
      var blob = new Blob([ok.map(buildClean).join('\n') + '\n'], { type: 'text/plain;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = stampName();
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
      toast('已下载 ' + ok.length + ' 条干净链接');
    });

    $('utc-expandall-btn').addEventListener('click', function () {
      var targets = [];
      entries.forEach(function (e, i) {
        if (e.ok && isShortDomain(e.url.hostname) && !e.expandedFrom && !e.unexpanded) targets.push(i);
      });
      if (!targets.length) { toast('没有可展开的短链（或已处理过）'); return; }
      toast('开始展开 ' + targets.length + ' 条短链…');
      (function next(k) {
        if (k >= targets.length) { renderResults(); toast('短链展开完成'); return; }
        var idx = targets[k];
        expandShort(entries[idx].url.toString(), function (finalUrl) {
          if (finalUrl && finalUrl !== entries[idx].url.toString()) {
            var ne = analyze(finalUrl);
            ne.expandedFrom = entries[idx].url.toString();
            entries[idx] = ne;
          } else { entries[idx].unexpanded = true; }
          next(k + 1);
        });
      })(0);
    });

    $('utc-black-add').addEventListener('click', function () { addRules('utc-black-input', userBlack, LS_BLACK); });
    $('utc-keep-add').addEventListener('click', function () { addRules('utc-keep-input', userKeep, LS_KEEP); });
    $('utc-black-reset').addEventListener('click', function () {
      userBlack = []; saveList(LS_BLACK, userBlack); refreshRuleLists(); toast('自定义剔除规则已清空');
    });
    $('utc-keep-reset').addEventListener('click', function () {
      userKeep = []; saveList(LS_KEEP, userKeep); refreshRuleLists(); toast('自定义保留规则已清空');
    });

    // Ctrl+Enter 快速清除
    $('utc-input').addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); $('utc-clean-btn').click(); }
    });

    // 示例按钮
    document.querySelectorAll('[data-sample]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        $('utc-input').value = btn.dataset.sample;
        $('utc-clean-btn').click();
      });
    });
  });
})();
