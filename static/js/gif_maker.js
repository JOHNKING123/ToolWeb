/* GIF 合成器（gif_maker）- 纯前端、零依赖、零上传
 *
 * 能力：
 * 1. 上传／拖拽多张图片（PNG/JPG/WebP/GIF 静态图，最多 60 帧）→ 拖拽排序
 *    （HTML5 拖放＋上移／下移／删除按钮兜底，移动端可用）。
 * 2. 参数：逐帧时长 10~10000ms、循环开关（NETSCAPE2.0；关=只播一次）、
 *    尺寸上限 64~1920px（按长边等比缩放，只缩小不放大）。
 * 3. canvas 统一尺寸（取各帧缩放后最大宽高，全帧居中绘制）→ ImageData →
 *    复用 gif_compress 自研编码器（window.GifCompress：median-cut 自适应 256 色
 *    量化 → 自研 LZW 编码 GIF89a，含 NETSCAPE2.0 循环扩展）。
 * 4. 逐帧预览播放（canvas 定时播放＋帧指示器／进度条）→ 最终 GIF <img> 预览 →
 *    下载 .gif（Blob，文件名 gif_maker_YYYYMMDD_HHmmss.gif）。
 * 5. 纯函数经 module.exports 暴露供 node 测试；浏览器里走 DOM＋canvas 双预览。
 * 零网络请求：本文件不发起任何网络请求。
 */
(function () {
'use strict';

/* ---------- 错误（家族惯例：非法参数抛 Error，err.field 给出字段名） ---------- */
function gifError(message, field) {
  var e = new Error(message);
  e.field = field;
  return e;
}

/* ---------- 纯函数：配置校验 ----------
 * cfg = { frameCount, frameDelayMs, maxSize, loop? }。
 * 返回归一化 { frameCount, frameDelayMs(取整), maxSize, loop(缺省 true) }。
 * frameCount 非 1..60 整数 → err.field='frameCount'；
 * frameDelayMs 非 10..10000 数字 → err.field='frameDelayMs'；
 * maxSize 非 64..1920 整数 → err.field='maxSize'；
 * cfg 非对象 → err.field='config'。 */
function validateGifConfig(cfg) {
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) {
    throw gifError('config 必须为对象。', 'config');
  }
  var fc = cfg.frameCount;
  if (typeof fc !== 'number' || !isFinite(fc) || Math.floor(fc) !== fc || fc < 1 || fc > 60) {
    throw gifError('frameCount 必须为 1..60 的整数。', 'frameCount');
  }
  var fd = cfg.frameDelayMs;
  if (typeof fd !== 'number' || !isFinite(fd) || fd < 10 || fd > 10000) {
    throw gifError('frameDelayMs 必须为 10..10000 的数字（毫秒）。', 'frameDelayMs');
  }
  var ms = cfg.maxSize;
  if (typeof ms !== 'number' || !isFinite(ms) || Math.floor(ms) !== ms || ms < 64 || ms > 1920) {
    throw gifError('maxSize 必须为 64..1920 的整数（像素）。', 'maxSize');
  }
  return {
    frameCount: fc,
    frameDelayMs: Math.round(fd),
    maxSize: ms,
    loop: cfg.loop === undefined ? true : !!cfg.loop
  };
}

/* ---------- 纯函数：帧列表校验 ----------
 * frames：数组，每项须为图片（File／Blob 风格对象，type 以 'image/' 开头）。
 * 非数组／空数组／任一项非图片 → 抛 Error（err.field='frames'）。
 * 校验通过原样返回该数组（供调用方继续处理）。 */
function normalizeGifFrames(frames) {
  if (!Array.isArray(frames) || frames.length === 0) {
    throw gifError('frames 必须为包含图片的非空数组。', 'frames');
  }
  for (var i = 0; i < frames.length; i++) {
    var f = frames[i];
    if (!f || typeof f.type !== 'string' || f.type.indexOf('image/') !== 0) {
      throw gifError('frames[' + i + '] 不是图片（type=' + (f && f.type) + '）。', 'frames');
    }
  }
  return frames;
}

/* ---------- 纯函数：下载文件名 ----------
 * now 缺省为当前时间；非 Date／非法日期 → err.field='now'。
 * 格式：gif_maker_YYYYMMDD_HHmmss.gif */
function buildGifFileName(now) {
  var d = (now === undefined || now === null) ? new Date() : now;
  if (!(d instanceof Date) || isNaN(d.getTime())) {
    throw gifError('now 必须为有效 Date。', 'now');
  }
  function p(n) { return (n < 10 ? '0' : '') + n; }
  return 'gif_maker_' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '_' +
    p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()) + '.gif';
}

var api = {
  validateGifConfig: validateGifConfig,
  normalizeGifFrames: normalizeGifFrames,
  buildGifFileName: buildGifFileName
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
} else {
  /* ================= 浏览器交互 ================= */
  document.addEventListener('DOMContentLoaded', function () {
    var $ = function (id) { return document.getElementById(id); };
    var dropEl = $('gm-drop'), fileEl = $('gm-file'),
        listEl = $('gm-list'), countEl = $('gm-count'),
        delayEl = $('gm-delay'), loopEl = $('gm-loop'), maxSizeEl = $('gm-maxsize'),
        previewCanvas = $('gm-preview'), playBtn = $('gm-play'), pauseBtn = $('gm-pause'),
        frameInfoEl = $('gm-frame-info'), scrubEl = $('gm-scrub'),
        encodeBtn = $('gm-encode'),
        progWrap = $('gm-progress-wrap'), progBar = $('gm-progress-bar'), progText = $('gm-progress-text'),
        resultEl = $('gm-result'), resultImg = $('gm-result-img'),
        resultInfoEl = $('gm-result-info'), dlBtn = $('gm-download'),
        warnEl = $('gm-warn'), errEl = $('gm-error'), toastEl = $('gm-toast');

    if (!window.GifCompress || !window.GifCompress.encodeGif) {
      showError('GIF 编码器（gif_compress.js）加载失败，请刷新页面重试。');
      return;
    }

    var frames = [];          /* { file, url, w, h } */
    var resultBytes = null;   /* Uint8Array */
    var resultUrl = null;
    var playing = false, playTimer = null, playIndex = 0;
    var MAX_FRAMES = 60;

    function toast(msg) {
      toastEl.textContent = msg;
      toastEl.style.display = 'block';
      setTimeout(function () { toastEl.style.display = 'none'; }, 2600);
    }
    function showError(msg) {
      errEl.textContent = msg;
      errEl.style.display = 'block';
    }
    function hideError() {
      errEl.style.display = 'none';
      errEl.textContent = '';
    }
    function showWarn(msg) {
      warnEl.innerHTML = msg;
      warnEl.style.display = 'block';
    }
    function hideWarn() {
      warnEl.style.display = 'none';
      warnEl.innerHTML = '';
    }
    function fmtBytes(n) {
      if (n < 1024) return n + ' B';
      if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
      return (n / 1048576).toFixed(1) + ' MB';
    }
    function tick() { return new Promise(function (r) { setTimeout(r, 0); }); }

    /* ---------- 上传 ---------- */
    function addFiles(fileList) {
      hideError();
      var incoming = [];
      for (var i = 0; i < fileList.length; i++) incoming.push(fileList[i]);
      try {
        normalizeGifFrames(incoming);
      } catch (e) {
        showError('只能添加图片文件（PNG／JPG／WebP／GIF 静态图）。');
        return;
      }
      if (frames.length + incoming.length > MAX_FRAMES) {
        showWarn('最多支持 <b>60</b> 帧，已忽略超出部分（当前 ' + frames.length + ' 帧）。');
        incoming = incoming.slice(0, MAX_FRAMES - frames.length);
      }
      if (incoming.length === 0) return;
      var pending = incoming.length;
      incoming.forEach(function (f) {
        var url = URL.createObjectURL(f);
        var img = new Image();
        img.onload = function () {
          frames.push({ file: f, w: img.naturalWidth || 1, h: img.naturalHeight || 1 });
          URL.revokeObjectURL(url); /* 缩略图改用 dataURL，避免对象 URL 堆积 */
          var c = document.createElement('canvas');
          var s = Math.min(1, 160 / Math.max(img.naturalWidth, img.naturalHeight));
          c.width = Math.max(1, Math.round(img.naturalWidth * s));
          c.height = Math.max(1, Math.round(img.naturalHeight * s));
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          frames[frames.length - 1].thumb = c.toDataURL('image/png');
          if (--pending === 0) { renderList(); drawPreview(0); toast('已添加 ' + incoming.length + ' 张，共 ' + frames.length + ' 帧。'); }
        };
        img.onerror = function () {
          URL.revokeObjectURL(url);
          if (--pending === 0) { renderList(); drawPreview(0); }
          showError('图片「' + (f.name || '未知') + '」无法解码，已跳过。');
        };
        img.src = url;
      });
    }

    dropEl.addEventListener('click', function () { fileEl.click(); });
    fileEl.addEventListener('change', function () {
      addFiles(fileEl.files);
      fileEl.value = '';
    });
    ['dragenter', 'dragover'].forEach(function (ev) {
      dropEl.addEventListener(ev, function (e) { e.preventDefault(); dropEl.classList.add('gm-dragover'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      dropEl.addEventListener(ev, function (e) { e.preventDefault(); dropEl.classList.remove('gm-dragover'); });
    });
    dropEl.addEventListener('drop', function (e) {
      var fs = e.dataTransfer && e.dataTransfer.files;
      if (fs && fs.length) addFiles(fs);
    });

    /* ---------- 帧列表（拖拽排序＋按钮兜底） ---------- */
    var dragIdx = -1;
    function renderList() {
      listEl.innerHTML = '';
      countEl.textContent = frames.length + ' / ' + MAX_FRAMES + ' 帧';
      encodeBtn.disabled = frames.length === 0;
      playBtn.disabled = frames.length === 0;
      if (frames.length === 0) {
        listEl.innerHTML = '<div class="gm-empty">尚未添加图片，点击上方上传区或拖拽图片到此处添加。</div>';
        return;
      }
      frames.forEach(function (fr, i) {
        var item = document.createElement('div');
        item.className = 'gm-frame';
        item.draggable = true;
        item.dataset.idx = i;
        item.innerHTML =
          '<span class="gm-badge">' + (i + 1) + '</span>' +
          '<img class="gm-thumb" alt="第' + (i + 1) + '帧">' +
          '<span class="gm-meta">' + fr.w + '×' + fr.h + '</span>' +
          '<span class="gm-btns">' +
          '<button type="button" data-act="up" title="上移" ' + (i === 0 ? 'disabled' : '') + '>↑</button>' +
          '<button type="button" data-act="down" title="下移" ' + (i === frames.length - 1 ? 'disabled' : '') + '>↓</button>' +
          '<button type="button" data-act="del" title="删除">✕</button>' +
          '</span>';
        item.querySelector('.gm-thumb').src = fr.thumb || '';
        item.addEventListener('dragstart', function (e) {
          dragIdx = i;
          e.dataTransfer.effectAllowed = 'move';
          item.classList.add('gm-dragging');
        });
        item.addEventListener('dragend', function () { item.classList.remove('gm-dragging'); dragIdx = -1; });
        item.addEventListener('dragover', function (e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; });
        item.addEventListener('drop', function (e) {
          e.preventDefault();
          if (dragIdx < 0 || dragIdx === i) return;
          var moved = frames.splice(dragIdx, 1)[0];
          frames.splice(i, 0, moved);
          renderList(); drawPreview(0); stopPlay();
        });
        item.querySelectorAll('button').forEach(function (btn) {
          btn.addEventListener('click', function (ev) {
            ev.stopPropagation();
            var act = btn.dataset.act;
            if (act === 'del') { frames.splice(i, 1); }
            else if (act === 'up' && i > 0) { var t = frames[i - 1]; frames[i - 1] = frames[i]; frames[i] = t; }
            else if (act === 'down' && i < frames.length - 1) { var t2 = frames[i + 1]; frames[i + 1] = frames[i]; frames[i] = t2; }
            renderList(); drawPreview(0); stopPlay();
          });
        });
        item.addEventListener('click', function () { drawPreview(i); });
        listEl.appendChild(item);
      });
    }

    /* ---------- 预览播放 ---------- */
    function currentDelay() {
      var v = parseInt(delayEl.value, 10);
      return (isFinite(v) && v >= 10 && v <= 10000) ? v : 500;
    }
    function drawPreview(i) {
      if (!frames.length) return;
      playIndex = Math.max(0, Math.min(i, frames.length - 1));
      var fr = frames[playIndex];
      var maxSide = 420;
      var s = Math.min(1, maxSide / Math.max(fr.w, fr.h));
      previewCanvas.width = Math.max(1, Math.round(fr.w * s));
      previewCanvas.height = Math.max(1, Math.round(fr.h * s));
      var ctx = previewCanvas.getContext('2d');
      /* 用原图绘制，保证预览清晰度 */
      var hi = new Image();
      var hiUrl = URL.createObjectURL(fr.file);
      hi.onload = function () {
        ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
        ctx.drawImage(hi, 0, 0, previewCanvas.width, previewCanvas.height);
        URL.revokeObjectURL(hiUrl);
      };
      hi.onerror = function () { URL.revokeObjectURL(hiUrl); };
      hi.src = hiUrl;
      frameInfoEl.textContent = '第 ' + (playIndex + 1) + ' / ' + frames.length + ' 帧 · ' + currentDelay() + 'ms／帧';
      scrubEl.max = frames.length - 1;
      scrubEl.value = playIndex;
    }
    function stopPlay() {
      playing = false;
      if (playTimer) { clearTimeout(playTimer); playTimer = null; }
      playBtn.style.display = '';
      pauseBtn.style.display = 'none';
    }
    function stepPlay() {
      if (!playing || !frames.length) return;
      drawPreview((playIndex + 1) % frames.length);
      playTimer = setTimeout(stepPlay, currentDelay());
    }
    playBtn.addEventListener('click', function () {
      if (!frames.length) return;
      playing = true;
      playBtn.style.display = 'none';
      pauseBtn.style.display = '';
      stepPlay();
    });
    pauseBtn.addEventListener('click', stopPlay);
    scrubEl.addEventListener('input', function () {
      stopPlay();
      drawPreview(parseInt(scrubEl.value, 10) || 0);
    });

    /* ---------- 合成编码 ---------- */
    function setProgress(pct, text) {
      progWrap.style.display = 'block';
      progBar.style.width = pct + '%';
      progText.textContent = text;
    }
    encodeBtn.addEventListener('click', function () {
      hideError(); hideWarn();
      var cfg;
      try {
        cfg = validateGifConfig({
          frameCount: frames.length,
          frameDelayMs: parseFloat(delayEl.value),
          maxSize: parseInt(maxSizeEl.value, 10),
          loop: loopEl.checked
        });
      } catch (e) {
        showError(e.message + '（字段：' + e.field + '）');
        return;
      }
      if (frames.length === 0) { showError('请先添加图片。'); return; }
      encodeBtn.disabled = true;
      resultEl.style.display = 'none';
      /* 各帧缩放尺寸（只缩小不放大）→ 统一画布取最大宽高 */
      var dims = frames.map(function (fr) {
        var s = Math.min(1, cfg.maxSize / Math.max(fr.w, fr.h));
        return { w: Math.max(1, Math.round(fr.w * s)), h: Math.max(1, Math.round(fr.h * s)) };
      });
      var W = 0, H = 0, i;
      for (i = 0; i < dims.length; i++) {
        if (dims[i].w > W) W = dims[i].w;
        if (dims[i].h > H) H = dims[i].h;
      }
      var totalPx = W * H * frames.length;
      if (totalPx > 48 * 1048576) {
        showWarn('当前共约 ' + (totalPx / 1048576).toFixed(1) + 'M 像素，可能超出<b>浏览器内存限制</b>导致失败；建议调小「尺寸上限」或减少帧数。');
      }
      setProgress(5, '绘制帧到 canvas（统一 ' + W + '×' + H + '）…');
      var work = document.createElement('canvas');
      work.width = W; work.height = H;
      var wctx = work.getContext('2d', { willReadFrequently: true });
      var pxFrames = [];
      var chain = Promise.resolve();
      frames.forEach(function (fr, fi) {
        chain = chain.then(function () {
          return new Promise(function (resolve, reject) {
            var url = URL.createObjectURL(fr.file);
            var img = new Image();
            img.onload = function () {
              wctx.clearRect(0, 0, W, H);
              var dw = dims[fi].w, dh = dims[fi].h;
              wctx.drawImage(img, Math.round((W - dw) / 2), Math.round((H - dh) / 2), dw, dh);
              URL.revokeObjectURL(url);
              var id = wctx.getImageData(0, 0, W, H);
              pxFrames.push({ pixels: id.data, width: W, height: H, delayMs: cfg.frameDelayMs });
              setProgress(5 + Math.round(55 * (fi + 1) / frames.length), '绘制帧 ' + (fi + 1) + ' / ' + frames.length + '…');
              resolve();
            };
            img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('第 ' + (fi + 1) + ' 帧图片解码失败。')); };
            img.src = url;
          }).then(tick);
        });
      });
      chain.then(function () {
        setProgress(65, '自适应 256 色量化（median-cut）…');
        return tick().then(function () {
          return window.GifCompress.quantizeFrames(pxFrames, 256);
        });
      }).then(function (q) {
        setProgress(85, '自研 LZW 编码 GIF89a…');
        return tick().then(function () {
          return window.GifCompress.encodeGif(q.frames, {
            width: q.width, height: q.height,
            loopCount: cfg.loop ? 0 : 1
          });
        });
      }).then(function (bytes) {
        /* 文件头校验：GIF89a */
        var magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5]);
        if (magic !== 'GIF89a') throw new Error('编码输出文件头异常（' + magic + '），请重试。');
        resultBytes = bytes;
        if (resultUrl) URL.revokeObjectURL(resultUrl);
        resultUrl = URL.createObjectURL(new Blob([bytes], { type: 'image/gif' }));
        resultImg.src = resultUrl;
        var totalMs = cfg.frameDelayMs * frames.length;
        resultInfoEl.innerHTML =
          '文件头校验：<b>GIF89a ✓</b>　尺寸 <b>' + W + '×' + H + '</b>　帧数 <b>' + frames.length + '</b>' +
          '　每帧 <b>' + cfg.frameDelayMs + 'ms</b>　总时长 <b>' + (totalMs / 1000).toFixed(1) + 's</b>' +
          '　循环 <b>' + (cfg.loop ? '无限（NETSCAPE2.0）' : '仅一次') + '</b>　体积 <b>' + fmtBytes(bytes.length) + '</b>';
        resultEl.style.display = 'block';
        setProgress(100, '完成。');
        setTimeout(function () { progWrap.style.display = 'none'; }, 800);
        toast('GIF 合成完成，可预览或下载。');
      }).catch(function (err) {
        progWrap.style.display = 'none';
        showError('合成失败：' + err.message);
      }).then(function () {
        encodeBtn.disabled = frames.length === 0;
      });
    });

    dlBtn.addEventListener('click', function () {
      if (!resultBytes) { toast('暂无合成结果，请先合成。'); return; }
      var blob = new Blob([resultBytes], { type: 'image/gif' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      try { a.download = buildGifFileName(); } catch (e) { a.download = 'gif_maker.gif'; }
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      toast('已下载 ' + a.download + '。');
    });

    renderList();
  });
}
})();
