'use strict';
/*
 * 文件夹对比（Folder Compare）—— 纯前端、零依赖、零上传
 * 只读取文件名 / 文件大小 / 修改时间，不读取文件内容，不发起任何网络请求。
 */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var tick = function () { return new Promise(function (r) { setTimeout(r, 0); }); };

  var STATE_LABEL = { added: '新增', removed: '删除', modified: '修改', same: '相同' };

  function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function fmtBytes(n) {
    if (n == null || isNaN(n)) return '—';
    if (n === 0) return '0 B';
    var units = ['B', 'KB', 'MB', 'GB', 'TB'];
    var i = 0, v = n;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    return (i === 0 ? v : v.toFixed(v >= 100 ? 0 : 1)) + ' ' + units[i];
  }

  function fmtTime(ms) {
    if (!ms) return '—';
    var d = new Date(ms);
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
      ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }

  function stampName() {
    var d = new Date();
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' +
      p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
  }

  function download(filename, text, mime) {
    var blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 300);
  }

  // ---------------- 状态 ----------------
  var S = {
    A: { name: '', entries: new Map(), loaded: false },
    B: { name: '', entries: new Map(), loaded: false },
    diff: [],
    opts: { ignoreCase: false, sizeOnly: false, excludeHidden: false },
    show: { added: true, removed: true, modified: true, same: false },
    search: '',
    groupByDir: true,
    collapsed: {},   // dirname -> true
    expanded: {},     // row key -> true
    renderedCount: 0
  };

  // ---------------- 路径归一化 ----------------
  function normPath(p) {
    return String(p || '').replace(/\\/g, '/').replace(/^\s+|\s+$/g, '')
      .replace(/^\/+/, '').replace(/\/+$/, '');
  }
  function isHidden(p) {
    return p.split('/').some(function (seg) { return seg.length > 1 && seg.charAt(0) === '.'; });
  }
  function keyOf(p) {
    return S.opts.ignoreCase ? p.toLowerCase() : p;
  }
  function dirOf(p) {
    var i = p.lastIndexOf('/');
    return i < 0 ? '（根目录）' : p.slice(0, i);
  }

  // ---------------- 载入：三种入口 ----------------
  function resetSide(side) {
    side.name = ''; side.entries = new Map(); side.loaded = false;
    $('fc-result').style.display = 'none'; // 清除一侧后隐藏旧对比结果，避免展示过期内容
    renderZone(side === S.A ? 'A' : 'B');
    updateCompareBtn();
  }

  function setProgress(which, pct, text) {
    var bar = $('fc-prog-' + which.toLowerCase());
    if (!bar) return;
    bar.style.display = pct == null ? 'none' : 'block';
    if (pct != null) {
      bar.querySelector('.fc-prog-fill').style.width = Math.min(100, pct) + '%';
      bar.querySelector('.fc-prog-text').textContent = text || '';
    }
  }

  var BATCH = 300; // 每扫描 N 个条目让出一次 UI 线程

  // 入口 1：File System Access API（Chrome/Edge 优先）
  async function pickViaFSAPI(which) {
    if (!window.showDirectoryPicker) return false;
    var dir;
    try {
      dir = await window.showDirectoryPicker();
    } catch (e) {
      return true; // 用户取消或被拒绝：视为已处理，不再降级
    }
    var side = which === 'A' ? S.A : S.B;
    side.name = dir.name || '文件夹';
    side.entries = new Map();
    side.loaded = false;
    renderZone(which);
    var scanned = 0, dirs = 0;
    setProgress(which, 0, '正在扫描…');
    async function walk(handle, prefix) {
      for await (var pair of handle.values()) {
        var name = pair[0], h = pair[1];
        var rel = prefix ? prefix + '/' + name : name;
        if (h.kind === 'directory') {
          dirs++;
          side.entries.set('D\x00' + rel, { path: rel, size: null, mtime: null, isDir: true });
          await walk(h, rel);
        } else {
          var f = await h.getFile(); // 只取元数据（size/lastModified），不读取内容
          side.entries.set('F\x00' + rel, { path: rel, size: f.size, mtime: f.lastModified, isDir: false });
        }
        scanned++;
        if (scanned % BATCH === 0) {
          setProgress(which, null, ''); // 脉冲式：条数未知时只显示文案
          var bar = $('fc-prog-' + which.toLowerCase());
          if (bar) { bar.style.display = 'block'; bar.querySelector('.fc-prog-text').textContent = '正在扫描… ' + scanned + ' 个条目'; }
          await tick();
        }
      }
    }
    try {
      await walk(dir, '');
    } catch (e) {
      flash('扫描文件夹时出错：' + (e && e.message ? e.message : e), 'err');
      setProgress(which, null);
      return true;
    }
    side.loaded = true;
    setProgress(which, null);
    renderZone(which);
    updateCompareBtn();
    autoCompare();
    return true;
  }

  // 入口 2：<input webkitdirectory> 降级
  function ingestWebkitFiles(which, fileList) {
    var side = which === 'A' ? S.A : S.B;
    side.entries = new Map();
    side.name = '';
    var n = 0;
    for (var i = 0; i < fileList.length; i++) {
      var f = fileList[i];
      var rel = f.webkitRelativePath || f.name;
      var p = normPath(rel);
      var seg = p.split('/');
      if (seg.length > 1) seg.shift(); // 去掉根文件夹名本身
      p = seg.join('/');
      if (!p) continue;
      if (!side.name) side.name = rel.split('/')[0] || '文件夹';
      side.entries.set('F\x00' + p, { path: p, size: f.size, mtime: f.lastModified, isDir: false });
      n++;
    }
    side.loaded = n > 0;
    renderZone(which);
    updateCompareBtn();
    autoCompare();
    if (n === 0) flash('未读取到任何文件，请重新选择文件夹。', 'warn');
  }

  // 入口 3：拖拽（文件夹 / 文件）
  async function ingestDrop(which, dataTransfer) {
    var items = dataTransfer.items;
    var side = which === 'A' ? S.A : S.B;
    side.entries = new Map();
    side.name = '';
    setProgress(which, 0, '正在读取…');
    var scanned = 0;

    async function readDirEntry(dirEntry, prefix) {
      return new Promise(function (resolve, reject) {
        var reader = dirEntry.createReader();
        var entries = [];
        (function readBatch() {
          reader.readEntries(function (batch) {
            if (!batch.length) { resolve(entries); return; }
            entries = entries.concat(Array.prototype.slice.call(batch));
            readBatch();
          }, reject);
        })();
      }).then(async function (entries) {
        for (var i = 0; i < entries.length; i++) {
          var e = entries[i];
          var rel = prefix ? prefix + '/' + e.name : e.name;
          if (e.isDirectory) {
            side.entries.set('D\x00' + rel, { path: rel, size: null, mtime: null, isDir: true });
            await readDirEntry(e, rel);
          } else {
            var file = await new Promise(function (res, rej) { e.file(res, rej); });
            side.entries.set('F\x00' + rel, { path: rel, size: file.size, mtime: file.lastModified, isDir: false });
          }
          scanned++;
          if (scanned % BATCH === 0) {
            var bar = $('fc-prog-' + which.toLowerCase());
            if (bar) { bar.style.display = 'block'; bar.querySelector('.fc-prog-text').textContent = '正在读取… ' + scanned + ' 个条目'; }
            await tick();
          }
        }
      });
    }

    try {
      if (items && items.length && items[0].webkitGetAsEntry) {
        for (var i = 0; i < items.length; i++) {
          var entry = items[i].webkitGetAsEntry();
          if (!entry) continue;
          if (entry.isDirectory) {
            if (!side.name) side.name = entry.name;
            side.entries.set('D\x00' + entry.name, { path: entry.name, size: null, mtime: null, isDir: true });
            await readDirEntry(entry, entry.name);
            // 拖入的顶层文件夹本身作为根：把 "根名/..." 前缀去掉
            stripTopPrefix(side, entry.name);
          } else if (entry.isFile) {
            var f0 = await new Promise(function (res, rej) { entry.file(res, rej); });
            side.entries.set('F\x00' + entry.name, { path: entry.name, size: f0.size, mtime: f0.lastModified, isDir: false });
          }
        }
      } else {
        var files = dataTransfer.files || [];
        var segs = [];
        for (var j = 0; j < files.length; j++) {
          segs.push(normPath(files[j].webkitRelativePath || files[j].name).split('/'));
        }
        // 降级分支（无 webkitGetAsEntry）：仅当所有文件共享同一首段时去掉它
        // （拖入单个文件夹的情形），使 A/B 根对齐；多来源混合拖入则保持原样
        var strip = segs.length > 0 && segs.every(function (s) { return s.length > 1 && s[0] === segs[0][0]; });
        for (var k = 0; k < files.length; k++) {
          var fj = files[k];
          var pj = strip ? segs[k].slice(1) : segs[k];
          side.entries.set('F\x00' + pj.join('/'), { path: pj.join('/'), size: fj.size, mtime: fj.lastModified, isDir: false });
          scanned++;
        }
      }
    } catch (e) {
      flash('读取拖入内容时出错：' + (e && e.message ? e.message : e), 'err');
      setProgress(which, null);
      return;
    }
    if (!side.name) side.name = '拖入内容';
    side.loaded = side.entries.size > 0;
    setProgress(which, null);
    renderZone(which);
    updateCompareBtn();
    autoCompare();
  }

  // 拖入单文件夹时：把 "根文件夹名/..." 前缀统一去掉，使 A/B 根对齐
  function stripTopPrefix(side, top) {
    var next = new Map();
    side.entries.forEach(function (v, k) {
      var p = v.path === top ? '' : (v.path.indexOf(top + '/') === 0 ? v.path.slice(top.length + 1) : v.path);
      if (!p) return;
      v.path = p;
      next.set((v.isDir ? 'D\x00' : 'F\x00') + p, v);
    });
    side.entries = next;
  }

  // ---------------- 对比引擎 ----------------
  function compare() {
    var pairs = new Map(); // key -> {a, b}
    [['A', S.A], ['B', S.B]].forEach(function (t) {
      var tag = t[0], side = t[1];
      side.entries.forEach(function (e) {
        if (S.opts.excludeHidden && isHidden(e.path)) return;
        var k = keyOf(e.path) + (e.isDir ? '\x00D' : '\x00F');
        if (!pairs.has(k)) pairs.set(k, {});
        pairs.get(k)[tag.toLowerCase()] = e;
      });
    });
    var diff = [];
    pairs.forEach(function (pr, k) {
      var a = pr.a, b = pr.b, state, note = '';
      if (a && !b) { state = 'removed'; }
      else if (!a && b) { state = 'added'; }
      else if (a.isDir && b.isDir) { state = 'same'; }
      else if (a.isDir !== b.isDir) { state = 'modified'; note = '类型变化：目录 ↔ 文件'; }
      else if (a.size !== b.size) { state = 'modified'; note = '大小变化'; }
      else if (!S.opts.sizeOnly && a.mtime !== b.mtime) { state = 'modified'; note = '修改时间变化'; }
      else { state = 'same'; }
      diff.push({ key: k, path: (a || b).path, state: state, note: note, a: a || null, b: b || null });
    });
    diff.sort(function (x, y) { return x.key < y.key ? -1 : (x.key > y.key ? 1 : 0); });
    S.diff = diff;
  }

  function stats() {
    var r = { added: 0, addedBytes: 0, removed: 0, removedBytes: 0, modified: 0, same: 0 };
    S.diff.forEach(function (d) {
      if (d.state === 'added') { r.added++; if (d.b && !d.b.isDir) r.addedBytes += d.b.size; }
      else if (d.state === 'removed') { r.removed++; if (d.a && !d.a.isDir) r.removedBytes += d.a.size; }
      else if (d.state === 'modified') { r.modified++; }
      else { r.same++; }
    });
    return r;
  }

  // ---------------- 渲染 ----------------
  function renderZone(which) {
    var side = which === 'A' ? S.A : S.B;
    var el = $('fc-zone-' + which.toLowerCase());
    var files = 0, dirs = 0;
    side.entries.forEach(function (e) { e.isDir ? dirs++ : files++; });
    var status = $('fc-status-' + which.toLowerCase());
    if (side.loaded) {
      status.innerHTML = '✅ <b>' + escHtml(side.name || '文件夹') + '</b>：' +
        files + ' 个文件' + (dirs ? '、' + dirs + ' 个空目录' : '') + ' <button class="fc-mini" data-clear="' + which + '">✕ 清除</button>';
      el.classList.add('fc-loaded');
    } else {
      status.innerHTML = '尚未选择';
      el.classList.remove('fc-loaded');
    }
  }

  function updateCompareBtn() {
    var btn = $('fc-compare');
    var ok = S.A.loaded && S.B.loaded;
    btn.disabled = !ok;
    btn.textContent = ok ? '🔍 开始对比' : '🔍 开始对比（请先载入两侧文件夹）';
  }

  var comparedOnce = false;
  function autoCompare() {
    if (S.A.loaded && S.B.loaded) { doCompare(); }
  }

  function doCompare() {
    comparedOnce = true;
    compare();
    S.expanded = {};
    renderStats();
    renderList();
    var sec = $('fc-result');
    sec.style.display = 'block';
    sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderStats() {
    var r = stats();
    $('fc-stats').innerHTML =
      statCard('added', '🟢 新增', r.added + ' 个', r.added ? '共 ' + fmtBytes(r.addedBytes) : '') +
      statCard('removed', '🔴 删除', r.removed + ' 个', r.removed ? '共 ' + fmtBytes(r.removedBytes) : '') +
      statCard('modified', '🟡 修改', r.modified + ' 个', '') +
      statCard('same', '⚪ 相同', r.same + ' 个', '');
    $('fc-statline').textContent =
      '共 ' + S.diff.length + ' 个条目：新增 ' + r.added + ' / 删除 ' + r.removed +
      ' / 修改 ' + r.modified + ' / 相同 ' + r.same;
  }

  function statCard(cls, title, big, sub) {
    return '<div class="fc-stat fc-' + cls + '"><div class="fc-stat-t">' + title +
      '</div><div class="fc-stat-n">' + big + '</div>' +
      (sub ? '<div class="fc-stat-s">' + escHtml(sub) + '</div>' : '') + '</div>';
  }

  function filtered() {
    var q = S.search.trim().toLowerCase();
    return S.diff.filter(function (d) {
      if (!S.show[d.state]) return false;
      if (q && d.path.toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }

  function rowHtml(d) {
    var badge = '<span class="fc-badge fc-b-' + d.state + '">' + STATE_LABEL[d.state] + '</span>';
    var dirTag = d.a && d.a.isDir ? '<span class="fc-dirt">📁</span>' : '';
    var key = d.key;
    var open = S.expanded[d.key];
    var h = '<div class="fc-row fc-r-' + d.state + '" data-key="' + escHtml(key) + '" role="button" tabindex="0">' +
      '<span class="fc-caret">' + (open ? '▾' : '▸') + '</span>' + badge +
      '<span class="fc-path">' + dirTag + escHtml(d.path) + '</span>';
    if (d.state === 'modified' && d.note) h += '<span class="fc-note">' + escHtml(d.note) + '</span>';
    h += '</div>';
    if (open) h += detailHtml(d);
    return h;
  }

  function sideCell(e, tag) {
    if (!e) return '<td class="fc-na">—</td><td class="fc-na">—</td><td class="fc-na">—</td>';
    return '<td>' + escHtml(e.path) + '</td>' +
      '<td>' + (e.isDir ? '目录' : fmtBytes(e.size)) + '</td>' +
      '<td>' + (e.isDir ? '—' : fmtTime(e.mtime)) + '</td>';
  }

  function detailHtml(d) {
    return '<div class="fc-detail"><table class="fc-dtab">' +
      '<thead><tr><th></th><th>路径</th><th>大小</th><th>修改时间</th></tr></thead><tbody>' +
      '<tr><td><b>A 侧' + (S.A.name ? '（' + escHtml(S.A.name) + '）' : '') + '</b></td>' + sideCell(d.a) + '</tr>' +
      '<tr><td><b>B 侧' + (S.B.name ? '（' + escHtml(S.B.name) + '）' : '') + '</b></td>' + sideCell(d.b) + '</tr>' +
      '</tbody></table></div>';
  }

  function renderList() {
    var list = filtered();
    var box = $('fc-list');
    if (!list.length) {
      box.innerHTML = '<div class="fc-empty">没有符合当前过滤条件的条目。</div>';
      $('fc-count').textContent = '0 条';
      return;
    }
    $('fc-count').textContent = list.length + ' 条';
    var h = '';
    if (S.groupByDir) {
      var groups = {};
      list.forEach(function (d) {
        var g = dirOf(d.path);
        (groups[g] = groups[g] || []).push(d);
      });
      var names = Object.keys(groups).sort(function (a, b) { return a < b ? -1 : 1; });
      names.forEach(function (g) {
        var items = groups[g];
        var c = { added: 0, removed: 0, modified: 0, same: 0 };
        items.forEach(function (d) { c[d.state]++; });
        var collapsed = !!S.collapsed[g];
        h += '<div class="fc-group"><div class="fc-ghead" data-group="' + escHtml(g) + '" role="button" tabindex="0">' +
          '<span class="fc-caret">' + (collapsed ? '▸' : '▾') + '</span>' +
          '<span class="fc-gname">📁 ' + escHtml(g) + '</span>' +
          '<span class="fc-gcounts">' +
          (c.added ? '<i class="fc-b-added">+' + c.added + '</i>' : '') +
          (c.removed ? '<i class="fc-b-removed">−' + c.removed + '</i>' : '') +
          (c.modified ? '<i class="fc-b-modified">~' + c.modified + '</i>' : '') +
          (c.same ? '<i class="fc-b-same">' + c.same + '</i>' : '') +
          '</span></div>';
        if (!collapsed) {
          h += '<div class="fc-gbody">';
          items.forEach(function (d) { h += rowHtml(d); });
          h += '</div>';
        }
        h += '</div>';
      });
    } else {
      list.forEach(function (d) { h += rowHtml(d); });
    }
    box.innerHTML = h;
  }

  function flash(msg, kind) {
    var el = $('fc-flash');
    el.textContent = msg;
    el.className = 'fc-flash fc-flash-' + (kind || 'info');
    el.style.display = 'block';
    clearTimeout(flash._t);
    flash._t = setTimeout(function () { el.style.display = 'none'; }, 6000);
  }

  // ---------------- 导出 ----------------
  function exportMD() {
    if (!S.diff.length) { flash('还没有对比结果，请先载入两侧文件夹并对比。', 'warn'); return; }
    var r = stats();
    var L = [];
    L.push('# 文件夹对比报告');
    L.push('');
    L.push('- 生成时间：' + fmtTime(Date.now()));
    L.push('- 文件夹 A：' + (S.A.name || '—') + '（' + S.A.entries.size + ' 个条目）');
    L.push('- 文件夹 B：' + (S.B.name || '—') + '（' + S.B.entries.size + ' 个条目）');
    L.push('- 对比选项：' + [
      S.opts.ignoreCase ? '忽略大小写' : '区分大小写',
      S.opts.sizeOnly ? '只比较大小' : '比较大小+修改时间',
      S.opts.excludeHidden ? '排除隐藏文件' : '含隐藏文件'
    ].join(' / '));
    L.push('');
    L.push('## 统计');
    L.push('');
    L.push('- 新增：' + r.added + ' 个（共 ' + fmtBytes(r.addedBytes) + '）');
    L.push('- 删除：' + r.removed + ' 个（共 ' + fmtBytes(r.removedBytes) + '）');
    L.push('- 修改：' + r.modified + ' 个');
    L.push('- 相同：' + r.same + ' 个');
    L.push('');
    var cell = function (s) { return String(s == null ? '—' : s).replace(/\|/g, '\\|'); };
    ['added', 'removed', 'modified', 'same'].forEach(function (st) {
      var items = S.diff.filter(function (d) { return d.state === st; });
      L.push('## ' + STATE_LABEL[st] + '（' + items.length + '）');
      L.push('');
      if (!items.length) { L.push('_无_'); L.push(''); return; }
      L.push('| 路径 | A 大小 | A 修改时间 | B 大小 | B 修改时间 |');
      L.push('|---|---|---|---|---|');
      items.forEach(function (d) {
        L.push('| ' + cell(d.path) + ' | ' +
          cell(d.a ? (d.a.isDir ? '目录' : fmtBytes(d.a.size)) : '—') + ' | ' +
          cell(d.a && !d.a.isDir ? fmtTime(d.a.mtime) : '—') + ' | ' +
          cell(d.b ? (d.b.isDir ? '目录' : fmtBytes(d.b.size)) : '—') + ' | ' +
          cell(d.b && !d.b.isDir ? fmtTime(d.b.mtime) : '—') + ' |');
      });
      L.push('');
    });
    L.push('_本报告由「文件夹对比」工具在本地生成，未上传任何文件内容。_');
    download('folder-compare-report-' + stampName() + '.md', '\ufeff' + L.join('\n'), 'text/markdown;charset=utf-8');
    flash('Markdown 报告已下载。', 'info');
  }

  function exportCSV() {
    if (!S.diff.length) { flash('还没有对比结果，请先载入两侧文件夹并对比。', 'warn'); return; }
    var q = function (s) {
      s = String(s == null ? '' : s);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    var L = ['\ufeff路径,状态,A大小(字节),A修改时间,B大小(字节),B修改时间'];
    S.diff.forEach(function (d) {
      L.push([
        q(d.path), q(STATE_LABEL[d.state]),
        q(d.a && !d.a.isDir ? d.a.size : ''), q(d.a && !d.a.isDir && d.a.mtime ? fmtTime(d.a.mtime) : ''),
        q(d.b && !d.b.isDir ? d.b.size : ''), q(d.b && !d.b.isDir && d.b.mtime ? fmtTime(d.b.mtime) : '')
      ].join(','));
    });
    download('folder-compare-report-' + stampName() + '.csv', L.join('\r\n'), 'text/csv;charset=utf-8');
    flash('CSV 报告已下载。', 'info');
  }

  // ---------------- 示例数据 ----------------
  function loadSample() {
    var T = Date.now();
    var H = 3600 * 1000, D = 24 * H;
    function E(path, size, ageMs, isDir) {
      return { path: path, size: size, mtime: isDir ? null : T - ageMs, isDir: !!isDir };
    }
    var A = [
      E('docs/需求说明书.md', 24576, 3 * D),
      E('docs/旧方案-v1.md', 18200, 10 * D),          // 删除
      E('docs/会议纪要/', 0, 0, true),
      E('src/app.js', 48210, 2 * D),                  // 修改（大小不同）
      E('src/util.js', 12340, 5 * D),                 // 相同
      E('src/config.json', 2048, 6 * D),              // 修改（仅 mtime 不同）
      E('assets/logo.png', 156200, 20 * D),           // 相同
      E('assets/banner-old.png', 301000, 15 * D),      // 删除
      E('.gitignore', 320, 30 * D),                   // 隐藏文件
      E('backup-2024/', 0, 0, true)                   // 空目录：仅 A 有
    ];
    var B = [
      E('docs/需求说明书.md', 24576, 3 * D),
      E('docs/新方案-v2.md', 19800, 1 * D),           // 新增
      E('docs/会议纪要/', 0, 0, true),
      E('src/app.js', 48900, 1 * D),
      E('src/util.js', 12340, 5 * D),
      E('src/config.json', 2048, 1 * H),              // mtime 变了
      E('assets/logo.png', 156200, 20 * D),
      E('assets/banner-new.png', 298500, 2 * D),      // 新增
      E('assets/icons/', 0, 0, true),                 // 空目录：仅 B 有
      E('.gitignore', 320, 30 * D),
      E('README.md', 1200, 12 * H)                    // 新增
    ];
    S.A.name = '示例文件夹 A（旧备份）';
    S.B.name = '示例文件夹 B（新备份）';
    S.A.entries = new Map(); S.B.entries = new Map();
    A.forEach(function (e) { S.A.entries.set((e.isDir ? 'D\x00' : 'F\x00') + e.path, e); });
    B.forEach(function (e) { S.B.entries.set((e.isDir ? 'D\x00' : 'F\x00') + e.path, e); });
    S.A.loaded = S.B.loaded = true;
    renderZone('A'); renderZone('B');
    updateCompareBtn();
    doCompare();
    flash('已载入示例数据：含新增 / 删除 / 修改（含仅 mtime 变化）/ 相同 / 隐藏文件 / 空目录。', 'info');
  }

  // ---------------- 事件绑定 ----------------
  function bindZone(which) {
    var low = which.toLowerCase();
    var zone = $('fc-zone-' + low);
    var input = $('fc-input-' + low);

    zone.addEventListener('click', function (ev) {
      if (ev.target.closest('[data-clear]')) return;
      if (window.showDirectoryPicker) {
        pickViaFSAPI(which);
      } else {
        input.click(); // 降级：webkitdirectory
      }
    });
    zone.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); zone.click(); }
    });
    input.addEventListener('change', function () {
      ingestWebkitFiles(which, input.files);
      input.value = '';
    });

    ['dragenter', 'dragover'].forEach(function (t) {
      zone.addEventListener(t, function (ev) { ev.preventDefault(); zone.classList.add('fc-dragover'); });
    });
    ['dragleave', 'drop'].forEach(function (t) {
      zone.addEventListener(t, function (ev) { ev.preventDefault(); zone.classList.remove('fc-dragover'); });
    });
    zone.addEventListener('drop', function (ev) { ingestDrop(which, ev.dataTransfer); });
  }

  function init() {
    bindZone('A');
    bindZone('B');

    $('fc-compare').addEventListener('click', doCompare);
    $('fc-sample').addEventListener('click', loadSample);
    $('fc-export-md').addEventListener('click', exportMD);
    $('fc-export-csv').addEventListener('click', exportCSV);

    [['fc-opt-ignorecase', 'ignoreCase'], ['fc-opt-sizeonly', 'sizeOnly'], ['fc-opt-nohidden', 'excludeHidden']]
      .forEach(function (p) {
        $(p[0]).addEventListener('change', function (ev) {
          S.opts[p[1]] = ev.target.checked;
          if (comparedOnce && S.A.loaded && S.B.loaded) doCompareKeepScroll();
        });
      });

    [['fc-f-added', 'added'], ['fc-f-removed', 'removed'], ['fc-f-modified', 'modified'], ['fc-f-same', 'same']]
      .forEach(function (p) {
        $(p[0]).addEventListener('change', function (ev) {
          S.show[p[1]] = ev.target.checked;
          renderList();
        });
      });

    $('fc-group').addEventListener('change', function (ev) {
      S.groupByDir = ev.target.checked;
      renderList();
    });

    var searchTimer = null;
    $('fc-search').addEventListener('input', function (ev) {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function () { S.search = ev.target.value; renderList(); }, 180);
    });

    // 列表事件委托：展开明细 / 分组折叠 / 清除
    $('fc-list').addEventListener('click', function (ev) {
      var g = ev.target.closest('[data-group]');
      if (g) {
        var name = g.getAttribute('data-group');
        if (S.collapsed[name]) delete S.collapsed[name]; else S.collapsed[name] = true;
        renderList();
        return;
      }
      var row = ev.target.closest('[data-key]');
      if (row) {
        var k = row.getAttribute('data-key');
        if (S.expanded[k]) delete S.expanded[k]; else S.expanded[k] = true;
        renderList();
      }
    });
    $('fc-list').addEventListener('keydown', function (ev) {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      var t = ev.target.closest('[data-key],[data-group]');
      if (t) { ev.preventDefault(); t.click(); }
    });
    document.addEventListener('click', function (ev) {
      var c = ev.target.closest('[data-clear]');
      if (c) resetSide(c.getAttribute('data-clear') === 'A' ? S.A : S.B);
    });

    renderZone('A');
    renderZone('B');
    updateCompareBtn();
  }

  // 对比选项变更时重算但不滚动（避免打断浏览）
  function doCompareKeepScroll() {
    compare();
    renderStats();
    renderList();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
