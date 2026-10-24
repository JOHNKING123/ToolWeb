/* 极简专注写作 - 纯前端本地写作页
 * 零第三方依赖，不向服务器发任何请求：标题＋正文只存在本机 localStorage，
 * 复制/下载全部在浏览器本地完成。
 * 纯逻辑部分（字数统计 / 键名与序列化 / 文件名清洗 / 导出内容组装）
 * 经由 module.exports 暴露，供 node 单元测试 require；浏览器里则走 DOM。 */
(function () {
'use strict';

/* ---------- 常量 ---------- */
var STORAGE_KEY = 'focus_writer_draft_v1';

/* ---------- 字数统计 ---------- */
/* 规则（页面文案固定写明：仅统计正文，不含标题）：
 * 字数：每个汉字计 1 个字，每个连续英文字母/数字串计 1 个词（如 hello、123 各计 1）；
 * 字符数：正文字符总数（含空格与标点，不含换行符），与手工数法一致。 */
function countStats(body) {
  var text = (body === null || body === undefined) ? '' : String(body);
  var chars = text.replace(/\r\n|\r|\n/g, '').length;
  var matches = text.match(/[\u4e00-\u9fff\u3400-\u4dbf]|[A-Za-z0-9]+/g);
  return { words: matches ? matches.length : 0, chars: chars };
}

/* ---------- localStorage 草稿序列化 ---------- */
function serializeDraft(title, body, savedAt) {
  return JSON.stringify({
    title: (title === null || title === undefined) ? '' : String(title),
    body: (body === null || body === undefined) ? '' : String(body),
    savedAt: savedAt || new Date().toISOString()
  });
}
function parseDraft(raw) {
  if (!raw) return null;
  try {
    var d = JSON.parse(raw);
    if (!d || typeof d !== 'object') return null;
    return {
      title: typeof d.title === 'string' ? d.title : '',
      body: typeof d.body === 'string' ? d.body : '',
      savedAt: typeof d.savedAt === 'string' ? d.savedAt : ''
    };
  } catch (e) { return null; }
}
function formatSavedTime(iso) {
  if (!iso) return '';
  var d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  function p(n) { return n < 10 ? '0' + n : '' + n; }
  return p(d.getHours()) + ':' + p(d.getMinutes());
}

/* ---------- 文件名清洗 ---------- */
/* Windows/macOS/Linux 通用非法字符 / \ : * ? " < > | 与控制字符一律换成 -；
 * 首尾的空格、点、横线去掉；连续横线压成一个；超长截断到 50 字；空结果回落 untitled。 */
function sanitizeTitleForFilename(title) {
  var s = (title === null || title === undefined) ? '' : String(title).trim();
  s = s.replace(/[\\\/:*?"<>|\u0000-\u001f\u007f]/g, '-');
  s = s.replace(/-+/g, '-').replace(/^[\s.\-]+|[\s.\-]+$/g, '');
  if (s.length > 50) s = s.slice(0, 50).replace(/[\s.\-]+$/g, '');
  return s || 'untitled';
}
function formatDate(d) {
  function p(n) { return n < 10 ? '0' + n : '' + n; }
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
function buildDownloadFilename(title, ext, date) {
  var d = date || new Date();
  return 'focus-writer-' + sanitizeTitleForFilename(title) + '-' + formatDate(d) + '.' + ext;
}

/* ---------- 导出内容组装 ---------- */
/* 内容 = 标题＋正文原样：.md 标题行加 # 前缀，.txt 标题行原样；无标题时只有正文。 */
function buildMarkdownContent(title, body) {
  var t = (title === null || title === undefined) ? '' : String(title);
  var b = (body === null || body === undefined) ? '' : String(body);
  return t ? '# ' + t + '\n\n' + b : b;
}
function buildTextContent(title, body) {
  var t = (title === null || title === undefined) ? '' : String(title);
  var b = (body === null || body === undefined) ? '' : String(body);
  return t ? t + '\n\n' + b : b;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    STORAGE_KEY: STORAGE_KEY,
    countStats: countStats,
    serializeDraft: serializeDraft,
    parseDraft: parseDraft,
    formatSavedTime: formatSavedTime,
    sanitizeTitleForFilename: sanitizeTitleForFilename,
    formatDate: formatDate,
    buildDownloadFilename: buildDownloadFilename,
    buildMarkdownContent: buildMarkdownContent,
    buildTextContent: buildTextContent
  };
}

/* ---------- 浏览器 DOM 逻辑（node 环境下 document 不存在，自动跳过） ---------- */
if (typeof document === 'undefined') return;

function $(id) { return document.getElementById(id); }
var titleEl, bodyEl, saveEl, statsEl, statsText, toastTimer;

function toast(msg) {
  var el = $('fw-toast');
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { el.style.display = 'none'; }, 3200);
}

function refreshStats() {
  if (!statsText) return;
  var s = countStats(bodyEl.value);
  statsText.textContent = '字数 ' + s.words + ' · 字符 ' + s.chars + '（仅统计正文，不含标题）';
}

var saveTimer = null;
function scheduleSave() {
  if (saveEl) saveEl.textContent = '正在保存…';
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(function () {
    try {
      localStorage.setItem(STORAGE_KEY, serializeDraft(titleEl.value, bodyEl.value, new Date().toISOString()));
      if (saveEl) saveEl.textContent = '已保存 ' + formatSavedTime(new Date().toISOString());
    } catch (e) {
      if (saveEl) saveEl.textContent = '保存失败：浏览器存储不可用，请先下载备份';
    }
  }, 500);
}

function copyText(text, okMsg) {
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
      if (ok) { toast(okMsg); return; }
    } catch (e) { /* fall through */ }
    toast('复制失败，请手动全选复制：点进写作面按 Ctrl+A（Mac 为 Cmd+A）再按 Ctrl+C');
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function () { toast(okMsg); }, fallback);
  } else { fallback(); }
}

function downloadFile(filename, content, mime) {
  var blob = new Blob([content], { type: mime });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(url); }, 500);
  toast('已下载 ' + filename);
}

document.addEventListener('DOMContentLoaded', function () {
  titleEl = $('fw-title');
  bodyEl = $('fw-body');
  saveEl = $('fw-save');
  statsEl = $('fw-stats');
  statsText = $('fw-stats-text');
  if (!titleEl || !bodyEl) return;

  /* 恢复草稿 */
  try {
    var draft = parseDraft(localStorage.getItem(STORAGE_KEY));
    if (draft) {
      titleEl.value = draft.title;
      bodyEl.value = draft.body;
      if (saveEl && draft.savedAt) saveEl.textContent = '已恢复草稿 · 上次保存于 ' + formatSavedTime(draft.savedAt);
      else if (saveEl) saveEl.textContent = '已恢复草稿';
    }
  } catch (e) { /* 存储不可用时静默，写作本身不受影响 */ }
  refreshStats();

  titleEl.addEventListener('input', function () { scheduleSave(); });
  bodyEl.addEventListener('input', function () { scheduleSave(); refreshStats(); });

  var toggle = $('fw-stats-toggle');
  if (toggle) toggle.addEventListener('change', function () {
    if (statsEl) statsEl.style.display = toggle.checked ? 'block' : 'none';
    if (toggle.checked) refreshStats();
  });

  var fsBtn = $('fw-fullscreen');
  var exitBtn = $('fw-exit-fullscreen');
  function enterFullscreen() { document.body.classList.add('fw-fullscreen'); if (bodyEl) bodyEl.focus(); }
  function exitFullscreen() { document.body.classList.remove('fw-fullscreen'); }
  if (fsBtn) fsBtn.addEventListener('click', enterFullscreen);
  if (exitBtn) exitBtn.addEventListener('click', exitFullscreen);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && document.body.classList.contains('fw-fullscreen')) exitFullscreen();
  });

  var copyBtn = $('fw-copy');
  if (copyBtn) copyBtn.addEventListener('click', function () {
    copyText(buildTextContent(titleEl.value, bodyEl.value), '全文已复制到剪贴板');
  });
  var mdBtn = $('fw-download-md');
  if (mdBtn) mdBtn.addEventListener('click', function () {
    downloadFile(buildDownloadFilename(titleEl.value, 'md'), buildMarkdownContent(titleEl.value, bodyEl.value), 'text/markdown;charset=utf-8');
  });
  var txtBtn = $('fw-download-txt');
  if (txtBtn) txtBtn.addEventListener('click', function () {
    downloadFile(buildDownloadFilename(titleEl.value, 'txt'), buildTextContent(titleEl.value, bodyEl.value), 'text/plain;charset=utf-8');
  });
  var clearBtn = $('fw-clear');
  if (clearBtn) clearBtn.addEventListener('click', function () {
    if (!window.confirm('确定清空草稿吗？标题和正文都会被清除，且无法恢复。')) return;
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
    titleEl.value = '';
    bodyEl.value = '';
    if (saveEl) saveEl.textContent = '草稿已清空';
    refreshStats();
    toast('草稿已清空');
  });
});
})();
