/* 在线录屏工具（screen_recorder）- 浏览器原生 getDisplayMedia + MediaRecorder 录屏
 * 纯函数契约（失败约定沿用家族惯例：非法参数抛 Error，err.field 给出字段名，不静默钳制）：
 * 1) formatDuration(ms) → 'hh:mm:ss'
 *    - ms 须为有限非负数（typeof number 且 isFinite 且 >= 0），否则抛 Error（err.field="ms"）；
 *    - 毫秒向下取整到秒；小时不截断（可超过 99），不足两位补零。
 * 2) pickMimeType(candidates, isSupported) → 首个 isSupported(mime) 返回 true 的 mime
 *    - candidates 非数组抛 Error（err.field="candidates"）；
 *    - isSupported 非函数抛 Error（err.field="isSupported"）；
 *    - 空数组或全部不支持抛 Error（err.field="mimeType"）。
 * 3) buildDownloadName(date?, ext?) → 'screen-record-YYYYMMDD-HHmmss.<ext>'
 *    - date 缺省为当前时间；非 Date 实例或非法日期抛 Error（err.field="date"）；
 *    - ext 缺省 'webm'；须为仅含字母数字的非空字符串，否则抛 Error（err.field="ext"）。
 * 4) extensionFor(mime) → 'webm' | 'mp4'
 *    - mime 非字符串抛 Error（err.field="mime"）；未知容器抛 Error（err.field="mime"）。
 * 5) formatFileSize(bytes) → '1.5 KB' / '3.2 MB' 等
 *    - bytes 非有限非负数抛 Error（err.field="bytes")。
 * 6) recorderTransition(state, action) → 下一状态（纯状态机）
 *    - 合法转移：idle+start→recording；recording+pause→paused；paused+resume→recording；
 *      recording+stop→stopped；paused+stop→stopped；stopped+reset→idle；
 *    - 未知 state 抛 Error（err.field="state"）；未知 action 抛 Error（err.field="action"）；
 *      合法状态＋不允许的动作组合抛 Error（err.field="transition"）。
 * 零网络请求：本文件不发起任何 fetch / XHR；录屏内容只在浏览器本地处理，不上传。
 */
(function () {
'use strict';

/* ---------- 小工具 ---------- */
function badParam(field, message) {
  var e = new Error(message);
  e.field = field;
  return e;
}

function pad2(n) {
  return (n < 10 ? '0' : '') + n;
}

/* ---------- 纯函数 1：毫秒 → hh:mm:ss ---------- */
function formatDuration(ms) {
  if (typeof ms !== 'number' || !isFinite(ms) || ms < 0) {
    throw badParam('ms', 'formatDuration(ms)：ms 须为有限非负数，实得 ' + String(ms));
  }
  var total = Math.floor(ms / 1000);
  var h = Math.floor(total / 3600);
  var m = Math.floor((total % 3600) / 60);
  var s = total % 60;
  return pad2(h) + ':' + pad2(m) + ':' + pad2(s);
}

/* ---------- 纯函数 2：挑选浏览器支持的 mime ---------- */
function pickMimeType(candidates, isSupported) {
  if (!Array.isArray(candidates)) {
    throw badParam('candidates', 'pickMimeType：candidates 须为数组');
  }
  if (typeof isSupported !== 'function') {
    throw badParam('isSupported', 'pickMimeType：isSupported 须为函数');
  }
  for (var i = 0; i < candidates.length; i++) {
    if (isSupported(candidates[i])) return candidates[i];
  }
  throw badParam('mimeType', 'pickMimeType：候选列表中无可用 mime 类型');
}

/* ---------- 纯函数 3：下载文件名 ---------- */
function buildDownloadName(date, ext) {
  if (date === undefined || date === null) date = new Date();
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    throw badParam('date', 'buildDownloadName：date 须为合法 Date 实例');
  }
  if (ext === undefined || ext === null) ext = 'webm';
  if (typeof ext !== 'string' || ext.length === 0 || !/^[A-Za-z0-9]+$/.test(ext)) {
    throw badParam('ext', 'buildDownloadName：ext 须为仅含字母数字的非空字符串，实得 ' + String(ext));
  }
  return 'screen-record-' +
    date.getFullYear() + pad2(date.getMonth() + 1) + pad2(date.getDate()) + '-' +
    pad2(date.getHours()) + pad2(date.getMinutes()) + pad2(date.getSeconds()) +
    '.' + ext;
}

/* ---------- 纯函数 4：mime → 文件扩展名 ---------- */
function extensionFor(mime) {
  if (typeof mime !== 'string') {
    throw badParam('mime', 'extensionFor：mime 须为字符串');
  }
  var low = mime.toLowerCase();
  if (low.indexOf('mp4') !== -1) return 'mp4';
  if (low.indexOf('webm') !== -1) return 'webm';
  throw badParam('mime', 'extensionFor：未知 mime 类型 ' + mime);
}

/* ---------- 纯函数 5：字节数 → 可读大小 ---------- */
function formatFileSize(bytes) {
  if (typeof bytes !== 'number' || !isFinite(bytes) || bytes < 0) {
    throw badParam('bytes', 'formatFileSize：bytes 须为有限非负数，实得 ' + String(bytes));
  }
  if (bytes < 1024) return Math.floor(bytes) + ' B';
  var units = ['KB', 'MB', 'GB', 'TB'];
  var v = bytes, u = -1;
  do { v = v / 1024; u++; } while (v >= 1024 && u < units.length - 1);
  return (Math.round(v * 10) / 10).toFixed(1) + ' ' + units[u];
}

/* ---------- 纯函数 6：录制状态机 ---------- */
var RECORDER_TRANSITIONS = {
  idle:      { start: 'recording' },
  recording: { pause: 'paused', stop: 'stopped' },
  paused:    { resume: 'recording', stop: 'stopped' },
  stopped:   { reset: 'idle' }
};

function recorderTransition(state, action) {
  if (typeof state !== 'string' || !RECORDER_TRANSITIONS.hasOwnProperty(state)) {
    throw badParam('state', 'recorderTransition：未知状态 ' + String(state));
  }
  if (typeof action !== 'string') {
    throw badParam('action', 'recorderTransition：action 须为字符串');
  }
  var next = RECORDER_TRANSITIONS[state][action];
  if (next === undefined) {
    throw badParam('transition', 'recorderTransition：状态「' + state + '」不允许动作「' + action + '」');
  }
  return next;
}

/* ---------- 常量（页面与测试共用） ---------- */
var MIME_CANDIDATES = [
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
  'video/mp4'
];

var BITRATE_LEVELS = [
  { id: 'low',  label: '低（约 1 Mbps，体积小）', bps: 1000000 },
  { id: 'mid',  label: '中（约 2.5 Mbps，推荐）',  bps: 2500000 },
  { id: 'high', label: '高（约 5 Mbps，更清晰）',  bps: 5000000 }
];

/* node 测试导出（浏览器侧无 module，走下方 DOM 逻辑） */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    MIME_CANDIDATES: MIME_CANDIDATES,
    BITRATE_LEVELS: BITRATE_LEVELS,
    RECORDER_TRANSITIONS: RECORDER_TRANSITIONS,
    formatDuration: formatDuration,
    pickMimeType: pickMimeType,
    buildDownloadName: buildDownloadName,
    extensionFor: extensionFor,
    formatFileSize: formatFileSize,
    recorderTransition: recorderTransition
  };
}

/* ---------- DOM 逻辑（仅浏览器） ---------- */
function $(id) { return document.getElementById(id); }

function toast(msg, good) {
  var t = $('sr-toast');
  if (!t) return;
  t.textContent = msg;
  t.style.background = good === false ? '#b91c1c' : '#111827';
  t.classList.add('show');
  if (t._timer) clearTimeout(t._timer);
  t._timer = setTimeout(function () { t.classList.remove('show'); }, 4200);
}

function showError(msg) {
  var box = $('sr-error');
  if (!box) return;
  box.textContent = msg;
  box.hidden = false;
}

function currentBitrate() {
  var checked = document.querySelector('input[name="sr-bitrate"]:checked');
  var id = checked ? checked.value : 'mid';
  for (var i = 0; i < BITRATE_LEVELS.length; i++) {
    if (BITRATE_LEVELS[i].id === id) return BITRATE_LEVELS[i].bps;
  }
  return BITRATE_LEVELS[1].bps;
}

if (typeof document !== 'undefined') {
document.addEventListener('DOMContentLoaded', function () {
  if (!$('sr-start')) return; /* 非本工具页不初始化 */

  var canRecord = (typeof window.MediaRecorder !== 'undefined') &&
    !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);

  /* ---- 能力检测明示 ---- */
  var capBox = $('sr-capability');
  var actualMime = null;
  if (canRecord) {
    var probe = (typeof window.MediaRecorder.isTypeSupported === 'function')
      ? function (m) { return window.MediaRecorder.isTypeSupported(m); }
      : function () { return true; }; /* Safari 无 isTypeSupported，按可用处理 */
    try { actualMime = pickMimeType(MIME_CANDIDATES, probe); } catch (e) { actualMime = null; }
    capBox.innerHTML = '✅ 当前浏览器支持录屏' +
      (actualMime ? '，本次将以 <b>' + actualMime + '</b> 格式录制' : '，但未找到可用编码，请换 Chrome / Edge / Safari 试试') +
      '。<span class="sr-note">输出容器/编码取决于浏览器（见下方真限制说明）。</span>';
  } else {
    capBox.innerHTML = '❌ 当前浏览器不支持 MediaRecorder 或屏幕共享（getDisplayMedia），无法录屏。请使用新版 Chrome / Edge / Firefox / Safari。';
    $('sr-start').disabled = true;
  }

  var state = 'idle';
  var rec = null;
  var chunks = [];
  var streamRef = null;
  var timerInt = null;
  var startTime = 0;
  var pausedAt = 0;

  function setState(action) {
    state = recorderTransition(state, action);
    renderState();
  }

  function renderState() {
    var recordingCard = $('sr-recording-card');
    var resultCard = $('sr-result-card');
    var optionsCard = $('sr-options-card');
    var badge = $('sr-state-badge');
    var pauseBtn = $('sr-pause');
    var resumeBtn = $('sr-resume');
    if (state === 'idle') {
      optionsCard.hidden = false;
      recordingCard.hidden = true;
      resultCard.hidden = true;
      $('sr-start').disabled = !canRecord;
      $('sr-timer').textContent = '00:00:00';
    } else if (state === 'recording') {
      optionsCard.hidden = true;
      recordingCard.hidden = false;
      resultCard.hidden = true;
      badge.textContent = '● 录制中';
      badge.className = 'sr-badge sr-badge-rec';
      pauseBtn.hidden = false;
      resumeBtn.hidden = true;
      $('sr-start').disabled = true;
    } else if (state === 'paused') {
      badge.textContent = '⏸ 已暂停';
      badge.className = 'sr-badge sr-badge-pause';
      pauseBtn.hidden = true;
      resumeBtn.hidden = false;
    } else if (state === 'stopped') {
      recordingCard.hidden = true;
      resultCard.hidden = false;
    }
  }

  function tick() {
    $('sr-timer').textContent = formatDuration(Date.now() - startTime);
  }

  function cleanupStream() {
    if (streamRef) {
      streamRef.getTracks().forEach(function (t) { try { t.stop(); } catch (e) {} });
      streamRef = null;
    }
    if ($('sr-preview')) $('sr-preview').srcObject = null;
  }

  function buildResult() {
    var mime = (rec && rec.mimeType) ? rec.mimeType : (actualMime || 'video/webm');
    var blob = new Blob(chunks, { type: mime });
    var url = (window.URL || window.webkitURL).createObjectURL(blob);
    var ext = 'webm';
    try { ext = extensionFor(mime); } catch (e) { ext = 'webm'; }
    var name;
    try { name = buildDownloadName(new Date(), ext); }
    catch (e) { name = 'screen-record.webm'; }
    var playback = $('sr-playback');
    playback.src = url;
    playback.controls = true;
    var dl = $('sr-download');
    dl.href = url;
    dl.download = name;
    dl.textContent = '⬇️ 下载 ' + name;
    $('sr-size').textContent = '文件大小：' + formatFileSize(blob.size) + '　格式：' + mime;
    rec = null;
    chunks = [];
  }

  function finishRecording(autoEnded) {
    if (!rec) return;
    if (timerInt) { clearInterval(timerInt); timerInt = null; }
    try { rec.stop(); } catch (e) { /* 已停止则忽略 */ }
    cleanupStream();
    if (autoEnded) toast('检测到您停止了屏幕共享，录制已自动结束。', true);
  }

  /* ---- 开始录制 ---- */
  $('sr-start').addEventListener('click', function () {
    if (!canRecord) {
      showError('当前浏览器不支持录屏（缺少 MediaRecorder 或 getDisplayMedia），请换新版 Chrome / Edge / Firefox / Safari。');
      return;
    }
    $('sr-error').hidden = true;
    var wantSysAudio = $('sr-sysaudio').checked;
    var wantMic = $('sr-mic').checked;
    var bitrate = currentBitrate();
    $('sr-start').disabled = true;

    navigator.mediaDevices.getDisplayMedia({ video: true, audio: wantSysAudio })
      .then(function (dispStream) {
        /* 麦克风走独立的 getUserMedia，失败只降级不阻断 */
        var tracks = dispStream.getTracks().slice();
        if (!wantMic) return new MediaStream(tracks);
        return navigator.mediaDevices.getUserMedia({ audio: true }).then(
          function (micStream) {
            micStream.getAudioTracks().forEach(function (t) { tracks.push(t); });
            return new MediaStream(tracks);
          },
          function () {
            toast('⚠️ 麦克风授权失败，将仅录制屏幕声音（无麦克风）', false);
            return new MediaStream(tracks);
          }
        );
      })
      .then(function (stream) {
        streamRef = stream;
        var probe = (typeof window.MediaRecorder.isTypeSupported === 'function')
          ? function (m) { return window.MediaRecorder.isTypeSupported(m); }
          : function () { return true; };
        var mime = pickMimeType(MIME_CANDIDATES, probe);
        rec = new window.MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bitrate });
        chunks = [];
        rec.ondataavailable = function (e) {
          if (e.data && e.data.size > 0) chunks.push(e.data);
        };
        rec.onstop = function () { buildResult(); };
        rec.onerror = function (e) {
          toast('录制出错：' + ((e.error && e.error.name) || '未知错误'), false);
        };
        /* 用户在浏览器共享条点了「停止共享」→ video track ended → 自动结束 */
        stream.getVideoTracks().forEach(function (t) {
          t.onended = function () {
            if (state === 'recording' || state === 'paused') {
              setState('stop');
              finishRecording(true);
            }
          };
        });
        var preview = $('sr-preview');
        preview.muted = true;
        preview.srcObject = stream;
        if (preview.play) { try { preview.play(); } catch (e2) {} }
        rec.start(500);
        startTime = Date.now();
        tick();
        timerInt = setInterval(tick, 250);
        setState('start'); /* idle → recording */
        toast('✅ 录制已开始', true);
      })
      .catch(function (err) {
        /* pickMimeType / new MediaRecorder 的同步异常也会落到这里 */
        $('sr-start').disabled = false;
        cleanupStream();
        if (err && err.field === 'mimeType') {
          showError('当前浏览器没有可用的录制编码（MediaRecorder.isTypeSupported 全否），无法录制。请换新版 Chrome / Edge / Safari 试试。');
        } else if (err && err.name === 'NotAllowedError') {
          toast('您拒绝了屏幕共享授权：请重新点击「🎥 开始录制」，并在浏览器弹窗中选择要共享的屏幕 / 窗口 / 标签页后点「共享」。', false);
        } else if (err && err.name === 'NotFoundError') {
          toast('未找到可共享的屏幕源：请确认显示器正常连接后重试。', false);
        } else {
          toast('无法开始录制：' + ((err && err.message) || '未知错误') + '。请检查浏览器权限设置后重试。', false);
        }
      });
  });

  /* ---- 暂停 / 继续 / 结束 ---- */
  $('sr-pause').addEventListener('click', function () {
    if (!rec) return;
    try { rec.pause(); } catch (e) { toast('当前浏览器不支持暂停', false); return; }
    pausedAt = Date.now();
    if (timerInt) { clearInterval(timerInt); timerInt = null; }
    setState('pause'); /* recording → paused */
  });

  $('sr-resume').addEventListener('click', function () {
    if (!rec) return;
    try { rec.resume(); } catch (e) { toast('恢复录制失败', false); return; }
    startTime += Date.now() - pausedAt;
    timerInt = setInterval(tick, 250);
    setState('resume'); /* paused → recording */
  });

  $('sr-stop').addEventListener('click', function () {
    setState('stop'); /* recording/paused → stopped */
    finishRecording(false);
    toast('⏹ 录制已结束', true);
  });

  /* ---- 重新录制 ---- */
  $('sr-again').addEventListener('click', function () {
    setState('reset'); /* stopped → idle */
  });

  renderState();
});
}
})();
