/* 批量图片转文字 - 纯前端批量 OCR（tesseract.js v6 + tessdata_fast 语言包）
 * 流程：多图上传（点击选择/拖拽多选）→ 文件队列（缩略图/文件名/大小/状态徽标）→
 * tesseract.js WASM 本地识别（jsdelivr CDN 懒加载，chi_sim+eng 语言包 IndexedDB 缓存，
 * 单 worker 复用、队列逐个识别、逐张释放图片对象防内存堆积）→
 * 合并 .txt 一键导出（BOM、每段前标注原文件名）/ 逐个复制·下载 / JSZip 打包 zip。
 * 全程不上传服务器，无新增后端接口；CDN/单张失败均给出可读中文报错，队列继续，页面不白屏。
 *
 * TODO(长期)：本文件从 ocr-image-text.js 复制了引擎初始化与 CDN 懒加载逻辑
 * （ensureLibFromList、tesseract v6 createWorker 参数、tessdata_fast 语言包 CDN），
 * 待有档期时抽取公共模块 static/js/ocr-engine.js 供单文件版与批量版共用，
 * 避免逻辑分叉无人认领。（与 pdf-to-word-batch.js 的 pdf-text-extract TODO 同口径）
 */
(function () {
'use strict';

/* ---------------- 常量 ---------------- */
var TESS_CDN = 'https://cdn.jsdelivr.net/npm/tesseract.js@6/dist/tesseract.min.js';
var LANG_PATH = 'https://cdn.jsdelivr.net/gh/tesseract-ocr/tessdata_fast@main';
var JSZIP_CDNS = [
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
  'https://cdn.npmmirror.com/packages/jszip/3.10.1/jszip.min.js'
];
var BIG_FILE = 50 * 1024 * 1024;      // 超过仅提示，不硬拦截
var RECOGNIZE_TIMEOUT_MS = 180000;    // 单张识别超时（3 分钟），Node 测试可经 __obTest 调小

var STATUS_LABEL = { pending: '待处理', working: '识别中', done: '完成', failed: '失败' };
var STATUS_CLASS = { pending: 'ob-st-pending', working: 'ob-st-working', done: 'ob-st-done', failed: 'ob-st-failed' };

/* ---------------- 通用小工具 ---------------- */
function $(id) { return document.getElementById(id); }
function fmtSize(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(2) + ' MB';
}
function pad2(n) { return (n < 10 ? '0' : '') + n; }
function fmtStamp(d) {  // YYYYMMDD_HHmm
  return d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + '_' + pad2(d.getHours()) + pad2(d.getMinutes());
}
function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function isBigFile(size) { return size > BIG_FILE; }
function baseName(name) { return String(name || 'file').replace(/\.[^.\\/]*$/, ''); }
function perFileName(name) { return baseName(name) + '_ocr.txt'; }
function downloadBlob(blob, name) {
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
}
function toast(m) {
  var el = document.createElement('div');
  el.textContent = m;
  el.style.cssText = 'position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);background:#111827;color:#fff;padding:.6rem 1.2rem;border-radius:.5rem;z-index:9999;font-size:.9rem;max-width:86vw;text-align:center;';
  document.body.appendChild(el);
  setTimeout(function () { if (el.parentNode) document.body.removeChild(el); }, 3000);
}
function tick() { return new Promise(function (r) { setTimeout(r, 0); }); }  // 让出主线程，进度可刷新
function checkedVal(name) {
  var el = document.querySelector('input[name="' + name + '"]:checked');
  return el ? el.value : '';
}

/* ---------------- 状态区 ---------------- */
function setStatus(m) { $('ob-status').textContent = m || ''; }
function setError(m) { $('ob-error').textContent = m || ''; }
function setLibError(m) {
  var el = $('ob-lib-error');
  if (m) { el.style.display = 'block'; el.textContent = m; }
  else { el.style.display = 'none'; el.textContent = ''; }
}
function showProgress(text, frac) {
  $('ob-progress').style.display = 'block';
  $('ob-progress-bar').style.width = Math.round(frac * 100) + '%';
  $('ob-progress-txt').textContent = text;
}
function hideProgress() {
  $('ob-progress').style.display = 'none';
  $('ob-progress-bar').style.width = '0';
  $('ob-progress-txt').textContent = '';
}

/* ---------------- CDN 懒加载（多源依次尝试，复制自 pdf-to-word-batch.js 口径） ---------------- */
function ensureLibFromList(list, globalName) {
  return new Promise(function (resolve, reject) {
    if (window[globalName]) { resolve(); return; }
    var idx = 0;
    function tryNext() {
      if (idx >= list.length) { reject(new Error('all failed')); return; }
      var src = list[idx++];
      var s = document.createElement('script');
      var done = false;
      var timer = setTimeout(function () {
        if (!done) { done = true; s.remove(); tryNext(); }
      }, 25000);
      s.onload = function () {
        if (done) return;
        done = true; clearTimeout(timer);
        if (window[globalName]) resolve();
        else { s.remove(); tryNext(); }
      };
      s.onerror = function () {
        if (done) return;
        done = true; clearTimeout(timer); s.remove(); tryNext();
      };
      s.src = src;
      document.head.appendChild(s);
    }
    tryNext();
  });
}
function ensureTesseract() { return ensureLibFromList([TESS_CDN], 'Tesseract'); }
function ensureJSZip() { return ensureLibFromList(JSZIP_CDNS, 'JSZip'); }

/* ---------------- 错误分类 → 可读中文 ---------------- */
function classifyOcrError(e) {
  if (e && e.kind === 'timeout') {
    return '单张识别超时（超过 3 分钟，图片可能过大或浏览器后台被节流），已跳过该图片，队列继续。';
  }
  var msg = String((e && e.message) || '');
  if (msg === 'decode' || (/decode/i.test(msg) && /invalid|error|fail/i.test(msg))) {
    return '图片读取失败，请换一张图片重试。';
  }
  if (/failed to fetch|network|load failed|ERR_/i.test(msg)) {
    return '网络异常（语言包/引擎资源下载失败），请检查网络后重试。';
  }
  if (/empty/i.test(msg)) {
    return '未识别到文字（图片可能过暗/过曝、文字过小或为纯色图），已跳过。';
  }
  return '识别失败' + (msg ? '（' + msg + '）' : '') + '，已跳过该图片，队列继续。';
}

/* ---------------- 队列 ---------------- */
var queue = [];       // [{file,name,size,status,frac,text,conf,error,thumbURL,el}]
var busy = false;     // 批量识别中
var cancelFlag = false;
var runId = 0;        // 识别轮次，防竞态/超时后旧日志串扰
var worker = null;    // 复用的 tesseract worker
var workerLangs = '';

function langCode() {
  return checkedVal('ob-lang') === 'eng' ? 'eng' : 'chi_sim+eng';
}
function langLabel(code) {
  return code === 'eng' ? '英文' : '中文';
}

function addFiles(files) {
  if (!files || !files.length) return;
  var added = 0, rejected = 0;
  for (var i = 0; i < files.length; i++) {
    var f = files[i];
    if (!f || !/^image\//.test(f.type || '')) { rejected++; continue; }
    queue.push({
      file: f, name: f.name || ('图片' + (queue.length + 1)),
      size: f.size || 0, status: 'pending', frac: 0,
      text: '', conf: 0, error: '', thumbURL: null, el: null
    });
    added++;
  }
  if (rejected) setError('已跳过 ' + rejected + ' 个非图片文件。');
  else setError('');
  if (added) {
    setStatus('已加入 ' + added + ' 张图片，点击「开始批量识别」。');
    renderList();
  }
  refreshButtons();
  updateBigNote();
}

function updateBigNote() {
  var n = queue.filter(function (q) { return isBigFile(q.size); }).length;
  var el = $('ob-bignote');
  if (n > 0) {
    el.style.display = 'block';
    el.textContent = '其中有 ' + n + ' 张图片超过 50MB：仅提示，识别会慢一些，不拦截。';
  } else {
    el.style.display = 'none';
    el.textContent = '';
  }
}

function renderList() {
  var box = $('ob-listbox'), list = $('ob-list');
  if (!queue.length) { box.style.display = 'none'; list.innerHTML = ''; return; }
  box.style.display = 'block';
  list.innerHTML = '';
  queue.forEach(function (item, idx) {
    if (!item.thumbURL) {
      try { item.thumbURL = URL.createObjectURL(item.file); } catch (e) { item.thumbURL = ''; }
    }
    var row = document.createElement('div');
    row.className = 'ob-row';
    var sub = fmtSize(item.size);
    if (isBigFile(item.size)) sub += ' · 图片较大，识别可能较慢';
    row.innerHTML =
      (item.thumbURL
        ? '<img class="ob-thumb" src="' + item.thumbURL + '" alt="缩略图">'
        : '<span class="ob-thumb ob-thumb-ph"><i class="material-icons">image</i></span>') +
      '<div class="ob-meta">' +
        '<div class="ob-nm" title="' + escHtml(item.name) + '">' + escHtml(item.name) + '</div>' +
        '<div class="ob-sub">' + escHtml(sub) + '</div>' +
        '<div class="ob-rowbar" style="display:none;"><i></i></div>' +
      '</div>' +
      '<span class="ob-st ' + STATUS_CLASS[item.status] + '">' + STATUS_LABEL[item.status] + '</span>' +
      '<div class="ob-ops">' +
        '<button type="button" data-act="copy" data-idx="' + idx + '" title="复制识别文字"><span class="material-icons">content_copy</span></button>' +
        '<button type="button" data-act="dl" data-idx="' + idx + '" title="下载该张 .txt"><span class="material-icons">download</span></button>' +
        '<button type="button" data-act="rm" data-idx="' + idx + '" class="ob-rm" title="移除"><span class="material-icons">close</span></button>' +
      '</div>';
    list.appendChild(row);
    item.el = row;
    updateRow(item);
  });
  refreshButtons();
}

function rowEls(item) {
  if (!item.el) return null;
  return {
    badge: item.el.querySelector('.ob-st'),
    sub: item.el.querySelector('.ob-sub'),
    bar: item.el.querySelector('.ob-rowbar'),
    barFill: item.el.querySelector('.ob-rowbar i'),
    btnCopy: item.el.querySelector('button[data-act="copy"]'),
    btnDl: item.el.querySelector('button[data-act="dl"]'),
    btnRm: item.el.querySelector('button[data-act="rm"]')
  };
}

function updateRow(item) {
  var r = rowEls(item);
  if (!r) return;
  r.badge.className = 'ob-st ' + STATUS_CLASS[item.status];
  r.badge.textContent = STATUS_LABEL[item.status];
  var base = fmtSize(item.size) + (isBigFile(item.size) ? ' · 图片较大，识别可能较慢' : '');
  if (item.status === 'failed' && item.error) {
    r.sub.innerHTML = escHtml(base) + '<br><span class="ob-errmsg">' + escHtml(item.error) + '</span>';
  } else if (item.status === 'done') {
    var n = item.text.replace(/\s/g, '').length;
    r.sub.textContent = base + ' · 识别出 ' + n + ' 字' + (item.conf ? '（置信度 ' + item.conf + '%）' : '');
  } else {
    r.sub.textContent = base;
  }
  if (item.status === 'working') {
    r.bar.style.display = 'block';
    r.barFill.style.width = Math.round(item.frac * 100) + '%';
  } else {
    r.bar.style.display = 'none';
  }
  var canUse = item.status === 'done' && !!item.text;
  r.btnCopy.disabled = !canUse;
  r.btnDl.disabled = !canUse;
  r.btnRm.disabled = busy;
  refreshButtons();
}

function refreshButtons() {
  var hasAny = queue.length > 0;
  var hasPending = queue.some(function (q) { return q.status === 'pending'; });
  var hasDone = queue.some(function (q) { return q.status === 'done' && q.text; });
  $('ob-start').disabled = busy || !hasPending;
  $('ob-merge').disabled = busy || !hasDone;
  $('ob-zip').disabled = busy || !hasDone;
  $('ob-clear').disabled = busy || !hasAny;
  $('ob-cancel').style.display = busy ? '' : 'none';
  var radios = document.querySelectorAll('input[name="ob-lang"]');
  for (var i = 0; i < radios.length; i++) radios[i].disabled = busy;
}

function successItems() {
  return queue.filter(function (q) { return q.status === 'done' && q.text; });
}

/* ---------------- 合并文本 ---------------- */
function buildMergeText(items) {
  var parts = [];
  items.forEach(function (it, i) {
    parts.push('===== ' + (i + 1) + '. ' + it.name + ' =====\n' + it.text);
  });
  return '﻿' + parts.join('\n\n') + '\n';
}

function mergeFileName() { return '批量OCR_' + fmtStamp(new Date()) + '.txt'; }
function zipFileName() { return '批量OCR_' + fmtStamp(new Date()) + '.zip'; }

function exportMerge() {
  var items = successItems();
  if (!items.length) { toast('还没有识别成功的内容可导出'); return; }
  var blob = new Blob([buildMergeText(items)], { type: 'text/plain;charset=utf-8' });
  downloadBlob(blob, mergeFileName());
  toast('已导出合并 .txt（共 ' + items.length + ' 张）');
}

async function exportZip() {
  var items = successItems();
  if (!items.length) { toast('还没有识别成功的内容可打包'); return; }
  setLibError('');
  try {
    await ensureJSZip();
  } catch (e) {
    setLibError('打包组件（JSZip）加载失败：cdnjs / npmmirror CDN 都不可达，请检查网络后重试；也可以先逐个单独下载。');
    return;
  }
  try {
    var zip = new window.JSZip();
    var used = {};
    items.forEach(function (it) {
      var base = baseName(it.name);
      var key = base.toLowerCase();
      var n = used[key] || 0;
      used[key] = n + 1;
      var fname = n === 0 ? base + '.txt' : base + '(' + (n + 1) + ').txt';
      zip.file(fname, '﻿' + it.text);
    });
    var blob = await zip.generateAsync({ type: 'blob' });
    downloadBlob(blob, zipFileName());
    toast('已打包下载 zip（共 ' + items.length + ' 个 .txt）');
  } catch (e) {
    setLibError('打包失败：' + (e && e.message ? e.message : '未知错误') + '，请重试或逐个单独下载。');
  }
}

function copyText(t, okMsg) {
  if (!t) { toast('没有可复制的内容'); return; }
  function done() { toast(okMsg || '已复制到剪贴板'); }
  function fallback() {
    var ta = document.createElement('textarea');
    ta.value = t;
    ta.style.cssText = 'position:fixed;opacity:0;';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); done(); }
    catch (e) { toast('复制失败，请手动选择复制'); }
    ta.remove();
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(t).then(done, fallback);
  } else fallback();
}

/* ---------------- tesseract worker（单 worker 复用，语言切换即重建） ---------------- */
function engineStatusText(status, code) {
  if (status === 'loading tesseract core') return '正在加载识别引擎…';
  if (status === 'initializing tesseract') return '正在初始化识别引擎…';
  if (status === 'loading language traineddata') return '正在加载' + langLabel(code) + '语言包…（约' + (code === 'eng' ? '4' : '7') + 'MB，首次稍慢，之后自动缓存）';
  if (status === 'recognizing text') return '正在识别…';
  return '准备中…';
}

async function ensureWorker(code, myRun) {
  if (worker && workerLangs === code) return worker;
  if (worker) { try { await worker.terminate(); } catch (e) {} worker = null; }
  var T = window.Tesseract;
  var w = await T.createWorker(code, T.OEM.LSTM_ONLY, {
    langPath: LANG_PATH,
    gzip: false,                 // tessdata_fast 提供未压缩 .traineddata，直传
    cacheMethod: 'write',        // IndexedDB 缓存语言包，二次打开免下载
    logger: function (m) {
      if (myRun !== runId || cancelFlag) return;
      if (m.status === 'recognizing text') {
        if (currentItem) {
          currentItem.frac = m.progress || 0;
          updateRow(currentItem);
          updateGlobalProgress();
        }
      } else {
        setStatus(engineStatusText(m.status, code) + Math.round((m.progress || 0) * 100) + '%');
      }
    }
  });
  if (myRun !== runId || cancelFlag) { try { await w.terminate(); } catch (e) {} throw new Error('cancelled'); }
  worker = w; workerLangs = code;
  return w;
}

function loadImage(url) {
  return new Promise(function (resolve, reject) {
    var img = new Image();
    img.onload = function () {
      if (!img.naturalWidth || !img.naturalHeight) { reject(new Error('decode')); return; }
      resolve(img);
    };
    img.onerror = function () { reject(new Error('decode')); };
    img.src = url;
  });
}

function recognizeWithTimeout(w, img, ms) {
  return new Promise(function (resolve, reject) {
    var settled = false;
    var timer = setTimeout(function () {
      if (settled) return; settled = true;
      reject({ kind: 'timeout' });
    }, ms);
    w.recognize(img).then(function (res) {
      if (settled) return; settled = true; clearTimeout(timer); resolve(res);
    }, function (e) {
      if (settled) return; settled = true; clearTimeout(timer); reject(e);
    });
  });
}

var currentItem = null;   // 正在识别的条目（供 logger 更新单张进度）
var batchTotal = 0;
var batchDone = 0;

function updateGlobalProgress() {
  if (!batchTotal) return;
  var cur = currentItem ? currentItem.frac : 0;
  var frac = (batchDone + cur) / batchTotal;
  var n = batchDone + 1;
  var nm = currentItem ? currentItem.name : '';
  showProgress('正在识别第 ' + n + ' / ' + batchTotal + ' 张' + (nm ? '（' + nm + '）' : '') + '…' + Math.round(cur * 100) + '%', frac);
}

async function processOne(item, code, myRun) {
  item.status = 'working';
  item.frac = 0;
  item.error = '';
  currentItem = item;
  updateRow(item);
  updateGlobalProgress();
  await tick();

  var url = null;
  var img = null;
  try {
    url = URL.createObjectURL(item.file);
    img = await loadImage(url);
    if (myRun !== runId || cancelFlag) throw new Error('cancelled');
    var w = await ensureWorker(code, myRun);
    if (myRun !== runId || cancelFlag) throw new Error('cancelled');
    var res = await recognizeWithTimeout(w, img, RECOGNIZE_TIMEOUT_MS);
    if (myRun !== runId || cancelFlag) throw new Error('cancelled');
    var text = (res.data.text || '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    if (!text) throw new Error('empty');
    item.text = text;
    item.conf = Math.round(res.data.confidence || 0);
    item.status = 'done';
    item.frac = 1;
  } catch (e) {
    if (myRun !== runId || cancelFlag || String(e && e.message) === 'cancelled') {
      throw e;  // 取消/超时已处理过 worker，这里直接向上传递
    }
    if (e && e.kind === 'timeout') {
      // 超时：worker 可能已卡死，干掉重建，后续图片不受影响
      runId++;
      myRun = runId;
      if (worker) { try { await worker.terminate(); } catch (err) {} worker = null; workerLangs = ''; }
      item.error = classifyOcrError(e);
      item.status = 'failed';
    } else {
      item.error = classifyOcrError(e);
      item.status = 'failed';
    }
    item.frac = 0;
  } finally {
    // 逐张释放页面对象，防内存堆积
    if (url) { try { URL.revokeObjectURL(url); } catch (e) {} }
    img = null;
    if (currentItem === item) currentItem = null;
  }
  // 超时分支里 runId 已自增；这里把 myRun 同步给外层循环
  return myRun;
}

async function startBatch() {
  if (busy) return;
  var items = queue.filter(function (q) { return q.status === 'pending'; });
  if (!items.length) { toast('请先添加图片'); return; }
  setError('');
  setLibError('');
  $('ob-summary').style.display = 'none';

  var myRun = ++runId;
  cancelFlag = false;
  busy = true;
  refreshButtons();
  $('ob-awake').style.display = 'block';
  var code = langCode();

  batchTotal = items.length;
  batchDone = 0;
  currentItem = null;
  setStatus('正在加载识别引擎…');
  showProgress('正在加载识别引擎…', 0);

  try {
    await ensureTesseract();
  } catch (e) {
    setLibError('识别引擎（tesseract.js）加载失败：jsdelivr CDN 不可达，请检查网络后重试（页面本身不受影响）。');
    finishBatch(myRun, items, true);
    return;
  }

  for (var i = 0; i < items.length; i++) {
    if (cancelFlag || myRun !== runId) break;
    try {
      myRun = await processOne(items[i], code, myRun);
    } catch (e) {
      // 取消或 worker 初始化失败
      if (cancelFlag || myRun !== runId) break;
      var msg = String((e && e.message) || '');
      if (/failed to fetch|network|load failed|ERR_/i.test(msg)) {
        // 语言包下载失败：后续图片必然同样失败，直接停掉队列，保留 pending 可重试
        setError('语言包下载失败（网络问题），队列已停止；请检查网络后重新点击「开始批量识别」。');
        break;
      }
      items[i].error = classifyOcrError(e);
      items[i].status = 'failed';
    }
    batchDone++;
    updateRow(items[i]);
    await tick();
  }
  finishBatch(myRun, items, false);
}

function finishBatch(myRun, items, engineFailed) {
  if (myRun !== runId) return;
  busy = false;
  cancelFlag = false;
  currentItem = null;
  batchTotal = 0; batchDone = 0;
  hideProgress();
  $('ob-awake').style.display = 'none';
  var ok = items.filter(function (q) { return q.status === 'done' && q.text; });
  var failed = items.filter(function (q) { return q.status === 'failed'; });
  var pendingLeft = items.filter(function (q) { return q.status === 'pending'; });
  if (!engineFailed) {
    setStatus('批量识别完成：成功 ' + ok.length + ' 张' +
      (failed.length ? '，失败 ' + failed.length + ' 张' : '') +
      (pendingLeft.length ? '，' + pendingLeft.length + ' 张未执行（可重新开始）' : '') + '。');
  }
  // 汇总（全部失败也不白屏）
  var box = $('ob-summary');
  if (ok.length || failed.length) {
    box.style.display = 'block';
    box.className = 'ob-summary' + (ok.length === 0 ? ' ob-summary-fail' : '');
    var html = '<div class="cmp">批量识别完成：成功 <b>' + ok.length + '</b> 张' +
      (failed.length ? '，失败 <b>' + failed.length + '</b> 张' : '') + '。</div>';
    if (failed.length) {
      html += '<div class="ob-fails">';
      failed.forEach(function (q) {
        html += '<div class="ob-fail"><span class="nm">' + escHtml(q.name) + '</span><span class="rs">' + escHtml(q.error || '识别失败') + '</span></div>';
      });
      html += '</div>';
    }
    if (ok.length) {
      html += '<div class="hint">可一键导出合并 .txt（每段前标注原文件名），或逐个复制/下载，也可以打包成 zip 一次带走。</div>';
    }
    $('ob-summary-text').innerHTML = html;
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  items.forEach(updateRow);
  refreshButtons();
}

async function cancelBatch() {
  if (!busy) return;
  cancelFlag = true;
  runId++;
  setStatus('正在取消…');
  if (worker) { try { await worker.terminate(); } catch (e) {} worker = null; workerLangs = ''; }
  busy = false;
  currentItem = null;
  batchTotal = 0; batchDone = 0;
  hideProgress();
  $('ob-awake').style.display = 'none';
  setStatus('已取消；未执行的图片仍为「待处理」，可重新开始。');
  refreshButtons();
}

function removeItem(idx) {
  if (busy) return;
  var item = queue[idx];
  if (!item) return;
  if (item.thumbURL) { try { URL.revokeObjectURL(item.thumbURL); } catch (e) {} }
  queue.splice(idx, 1);
  renderList();
  updateBigNote();
  setStatus(queue.length ? '已移除 1 张，还剩 ' + queue.length + ' 张。' : '');
}

function clearAll() {
  if (busy) return;
  queue.forEach(function (item) {
    if (item.thumbURL) { try { URL.revokeObjectURL(item.thumbURL); } catch (e) {} }
  });
  queue = [];
  $('ob-file').value = '';
  $('ob-summary').style.display = 'none';
  setStatus('');
  setError('');
  updateBigNote();
  renderList();
  refreshButtons();
}

/* ---------------- Node 端到端验证钩子（生产无影响） ---------------- */
function getState() {
  return {
    busy: busy,
    items: queue.map(function (q) {
      return { name: q.name, status: q.status, error: q.error, frac: q.frac, textLen: (q.text || '').length, conf: q.conf };
    }),
    globalTxt: $('ob-progress-txt').textContent,
    statusTxt: $('ob-status').textContent,
    errorTxt: $('ob-error').textContent,
    libErrorTxt: $('ob-lib-error').textContent,
    libErrorShown: $('ob-lib-error').style.display !== 'none',
    bignoteShown: $('ob-bignote').style.display !== 'none',
    summaryShown: $('ob-summary').style.display !== 'none',
    summaryHtml: $('ob-summary-text').innerHTML || ''
  };
}
window.__obTest = {
  addFiles: addFiles,
  start: startBatch,
  cancel: cancelBatch,
  doMerge: exportMerge,
  doZip: exportZip,
  state: getState,
  buildMergeText: buildMergeText,
  mergeFileName: mergeFileName,
  zipFileName: zipFileName,
  classifyOcrError: classifyOcrError,
  fmtStamp: fmtStamp,
  perFileName: perFileName,
  baseName: baseName,
  isBigFile: isBigFile,
  setTimeoutMs: function (ms) { RECOGNIZE_TIMEOUT_MS = ms; },
  setLang: function (v) {
    var radios = document.querySelectorAll('input[name="ob-lang"]');
    for (var i = 0; i < radios.length; i++) radios[i].checked = (radios[i].value === v);
  },
  consts: { TESS_CDN: TESS_CDN, LANG_PATH: LANG_PATH, JSZIP_CDNS: JSZIP_CDNS, BIG_FILE: BIG_FILE }
};

/* ---------------- 事件绑定 ---------------- */
document.addEventListener('DOMContentLoaded', function () {
  var up = $('ob-upload'), fi = $('ob-file');
  up.addEventListener('click', function () { fi.click(); });
  up.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fi.click(); } });
  fi.addEventListener('change', function () {
    if (fi.files && fi.files.length) { addFiles(Array.prototype.slice.call(fi.files)); fi.value = ''; }
  });
  ['dragover', 'dragenter'].forEach(function (ev) {
    up.addEventListener(ev, function (e) { e.preventDefault(); up.classList.add('dragover'); });
  });
  ['dragleave', 'drop'].forEach(function (ev) {
    up.addEventListener(ev, function (e) { e.preventDefault(); up.classList.remove('dragover'); });
  });
  up.addEventListener('drop', function (e) {
    var files = e.dataTransfer && e.dataTransfer.files;
    if (files && files.length) addFiles(Array.prototype.slice.call(files));
  });

  $('ob-list').addEventListener('click', function (e) {
    var btn = e.target && e.target.closest ? e.target.closest('button[data-act]') : null;
    if (!btn || btn.disabled) return;
    var idx = parseInt(btn.getAttribute('data-idx'), 10);
    var item = queue[idx];
    if (!item) return;
    var act = btn.getAttribute('data-act');
    if (act === 'copy') copyText(item.text);
    else if (act === 'dl') {
      downloadBlob(new Blob(['﻿' + item.text], { type: 'text/plain;charset=utf-8' }), perFileName(item.name));
      toast('已下载 ' + perFileName(item.name));
    }
    else if (act === 'rm') removeItem(idx);
  });

  $('ob-start').addEventListener('click', function () { startBatch(); });
  $('ob-cancel').addEventListener('click', function () { cancelBatch(); });
  $('ob-merge').addEventListener('click', exportMerge);
  $('ob-zip').addEventListener('click', exportZip);
  $('ob-clear').addEventListener('click', clearAll);

  var radios = document.querySelectorAll('input[name="ob-lang"]');
  for (var i = 0; i < radios.length; i++) {
    radios[i].addEventListener('change', function () {
      if (worker) { var w = worker; worker = null; workerLangs = ''; w.terminate().catch(function () {}); }
      setStatus('已切换为「' + (langCode() === 'eng' ? '仅英文' : '中英文混排') + '」，下次识别时加载对应语言包。');
    });
  }
  refreshButtons();
});
})();
