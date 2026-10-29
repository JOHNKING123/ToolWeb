/* GIF 压缩优化器（gif_compress）- 纯前端、零依赖、零上传
 *
 * 能力：
 * 1. 自研 GIF89a 解析器：LSD／全局／局部调色板、GCE（delay／disposal／透明色索引）、
 *    NETSCAPE2.0 循环扩展、隔行扫描；按 disposal 0-3 合成完整 RGBA 帧。
 * 2. 自研 LZW 编解码：clear／EOI 规范实现，编码与解码共用同一套码长递增约定
 *    （表满一格后递增码长，码表满 4096 时发 clear 重置）。
 * 3. 自研 GIF 编码器：Header＋LSD＋NETSCAPE 循环扩展＋逐帧 GCE＋局部调色板＋
 *    LZW 图像数据＋Trailer。
 * 4. 处理管线（纯函数，正交组合）：dropFrames（抽帧，被抽帧 delay 累加到保留帧，
 *    总时长不变）→ resizeFrames（最近邻重采样，确定性无模糊）→
 *    quantizeFrames（median-cut 自适应调色板，透明像素固定占 palette[0]）。
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
function fileError(message) { return gifError(message, 'file'); }

/* ---------- LZW 解码 ----------
 * minCodeSize：LZW 最小编码位数；data：拼接后的图像数据字节（Uint8Array 或数组）。
 * 返回像素索引数组（number[]）。clear 码重置字典与码长；codeSize 递增与
 * lzwEncode 严格镜像——编码器每次输出后建表（含 clear 后首个字面量），其
 * nextCode 恒比解码器大 1，故解码器用 nextCode+1 做“> 2^codeSize”检查
 * （<12 位封顶；码表满 4096 项时编码器发 clear 重置）。 */
function lzwDecode(minCodeSize, data) {
  var n = data.length;
  function byteAt(i) { return i < n ? data[i] : 0; }
  var clear = 1 << minCodeSize;
  var eoi = clear + 1;
  /* 字典用 prefix/suffix 链表表示：entry(code) = entry(prefix[code]) + suffix[code] */
  var prefix = new Array(4096);
  var suffix = new Array(4096);
  var codeSize, nextCode;
  function reset() {
    var i;
    for (i = 0; i < clear; i++) { prefix[i] = -1; suffix[i] = i; }
    codeSize = minCodeSize + 1;
    nextCode = eoi + 1;
  }
  reset();
  var out = [];
  var pos = 0; /* 位游标 */
  function readCode() {
    var code = 0;
    for (var b = 0; b < codeSize; b++) {
      var bytePos = pos >> 3;
      if (bytePos >= n) return -1;
      code |= ((byteAt(bytePos) >> (pos & 7)) & 1) << b;
      pos++;
    }
    return code;
  }
  function firstChar(code) {
    var c = code;
    while (prefix[c] !== -1) c = prefix[c];
    return suffix[c];
  }
  function emitChain(code) {
    var stack = [];
    var c = code;
    while (c !== -1) { stack.push(suffix[c]); c = prefix[c]; }
    for (var i = stack.length - 1; i >= 0; i--) out.push(stack[i]);
  }
  var prev = -1, prevFirst = 0;
  for (;;) {
    var code = readCode();
    if (code < 0 || code === eoi) break;
    if (code === clear) { reset(); prev = -1; continue; }
    if (code > nextCode) throw fileError('LZW 数据损坏：遇到非法编码。');
    var isKwKwK = (code === nextCode);
    if (isKwKwK && prev === -1) throw fileError('LZW 数据损坏：KwKwK 异常无前码。');
    var first = isKwKwK ? prevFirst : firstChar(code);
    if (isKwKwK) { emitChain(prev); out.push(prevFirst); }
    else { emitChain(code); }
    if (prev !== -1) {
      prefix[nextCode] = prev;
      suffix[nextCode] = first;
      nextCode++;
    }
    /* 码长递增（按编码器视角）：编码器每次输出后都建表（含 clear 后首个字面量），
     * 其 nextCode 恒比解码器大 1；故用 nextCode+1 做“> 2^codeSize”检查。
     * 这同时覆盖 minCodeSize=1 时首个表项触发的递增（编码器在 E:4→5 时递增，
     * 解码器此时 D=4，4+1>4 同步递增）；对 min>=2 与“>=”规则完全等价。 */
    if (nextCode + 1 > (1 << codeSize) && codeSize < 12) codeSize++;
    prev = code;
    prevFirst = first;
  }
  return out;
}

/* ---------- LZW 编码 ----------
 * indices：像素索引数组（Uint8Array 或数组）；返回 LZW 压缩字节（Uint8Array，
 * 未分子块，调用方负责切 sub-block）。码长递增约定与 lzwDecode 镜像。 */
function lzwEncode(minCodeSize, indices) {
  var count = indices.length;
  var clear = 1 << minCodeSize;
  var eoi = clear + 1;
  var codeSize, nextCode, dict;
  function resetDict() {
    dict = {};
    codeSize = minCodeSize + 1;
    nextCode = eoi + 1;
  }
  resetDict();
  var out = [];
  var cur = 0, bits = 0;
  function emit(code) {
    cur |= code << bits;
    bits += codeSize;
    while (bits >= 8) { out.push(cur & 0xff); cur >>= 8; bits -= 8; }
  }
  emit(clear);
  if (count === 0) {
    emit(eoi);
    if (bits > 0) out.push(cur & 0xff);
    return new Uint8Array(out);
  }
  var prefix = indices[0];
  for (var i = 1; i < count; i++) {
    var k = indices[i];
    var key = prefix * 256 + k;
    if (dict[key] !== undefined) {
      prefix = dict[key];
    } else {
      emit(prefix);
      /* 码表已满（4096 项）则先发 clear 重置，再建新表项；码 4096 本身非法，
       * 不可先赋值再清。 */
      if (nextCode >= 4096) { emit(clear); resetDict(); }
      dict[key] = nextCode;
      nextCode++;
      if (nextCode > (1 << codeSize) && codeSize < 12) { codeSize++; }
      prefix = k;
    }
  }
  emit(prefix);
  emit(eoi);
  if (bits > 0) out.push(cur & 0xff);
  return new Uint8Array(out);
}

/* ---------- GIF89a 解析 ----------
 * bytes：Uint8Array。返回 { width, height, loopCount, frames }，
 * frames[i] = { pixels: Uint8ClampedArray(RGBA，全画布), width, height,
 *               delayMs, left, top, disposal }。
 * 非 GIF 魔数抛 Error（err.field='file'）。 */
function parseGif(bytes) {
  var data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (data.length < 13) throw fileError('文件太小，不是有效的 GIF 文件。');
  var magic = String.fromCharCode(data[0], data[1], data[2], data[3], data[4], data[5]);
  if (magic !== 'GIF87a' && magic !== 'GIF89a') {
    throw fileError('文件头不是 GIF87a/GIF89a（魔数不匹配），请选择 .gif 文件。');
  }
  var pos = 6;
  function u16() { var v = data[pos] | (data[pos + 1] << 8); pos += 2; return v; }
  function readPalette(at, count) {
    var pal = [];
    for (var i = 0; i < count; i++) {
      pal.push([data[at + i * 3], data[at + i * 3 + 1], data[at + i * 3 + 2]]);
    }
    return pal;
  }
  function skipSubBlocks() {
    for (;;) { var n = data[pos++]; if (n === 0) break; pos += n; }
  }
  function readSubBlocks() {
    var chunks = [], total = 0;
    for (;;) {
      var n = data[pos++];
      if (n === 0) break;
      chunks.push(data.subarray(pos, pos + n));
      total += n;
      pos += n;
    }
    var out = new Uint8Array(total), off = 0;
    for (var i = 0; i < chunks.length; i++) { out.set(chunks[i], off); off += chunks[i].length; }
    return out;
  }
  var width = u16(), height = u16();
  if (width === 0 || height === 0) throw fileError('GIF 逻辑屏幕尺寸为 0，文件损坏。');
  var packed = data[pos++];
  var bgIndex = data[pos++];
  pos++; /* pixel aspect ratio，忽略 */
  var gct = null;
  if (packed & 0x80) {
    var gctCount = 1 << ((packed & 0x07) + 1);
    gct = readPalette(pos, gctCount);
    pos += gctCount * 3;
  }
  var bgColor = (gct && bgIndex < gct.length) ? gct[bgIndex] : null;
  var loopCount = 0; /* 缺省无限循环；NETSCAPE2.0 扩展可覆盖 */
  var frames = [];
  var canvas = new Uint8ClampedArray(width * height * 4);
  var gce = null; /* 待处理的图形控制扩展 */

  function drawIndices(left, top, iw, ih, indices, table, interlaced, hasTrans, transIdx) {
    var rowOrder = null, r;
    if (interlaced) {
      /* 隔行四遍：起始行 0/4/2/1，步长 8/8/4/2 */
      rowOrder = [];
      var starts = [0, 4, 2, 1], steps = [8, 8, 4, 2];
      for (var p = 0; p < 4; p++) {
        for (r = starts[p]; r < ih; r += steps[p]) rowOrder.push(r);
      }
    }
    var total = iw * ih;
    for (var i = 0; i < total; i++) {
      /* 隔行数据按行组存放：第 (i/iw) 个行组对应 rowOrder 中的实际行，组内按列排 */
      var row = rowOrder ? rowOrder[(i / iw) | 0] : ((i / iw) | 0);
      var col = i % iw;
      var x = left + col, y = top + row;
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      var idx = indices[i] || 0;
      if (hasTrans && idx === transIdx) continue; /* 透明：保留画布原像素 */
      var c = table[idx] || [0, 0, 0];
      var o = (y * width + x) * 4;
      canvas[o] = c[0]; canvas[o + 1] = c[1]; canvas[o + 2] = c[2]; canvas[o + 3] = 255;
    }
  }
  function fillRectTransparent(left, top, iw, ih) {
    for (var y = top; y < top + ih && y < height; y++) {
      if (y < 0) continue;
      for (var x = left; x < left + iw && x < width; x++) {
        if (x < 0) continue;
        var o = (y * width + x) * 4;
        if (bgColor) { canvas[o] = bgColor[0]; canvas[o + 1] = bgColor[1]; canvas[o + 2] = bgColor[2]; canvas[o + 3] = 255; }
        else { canvas[o] = 0; canvas[o + 1] = 0; canvas[o + 2] = 0; canvas[o + 3] = 0; }
      }
    }
  }

  while (pos < data.length) {
    var sep = data[pos++];
    if (sep === 0x3B) break; /* Trailer */
    if (sep === 0x21) { /* 扩展块 */
      var label = data[pos++];
      if (label === 0xF9) { /* 图形控制扩展 */
        pos++; /* block size = 4，固定跳过 */
        var p = data[pos++];
        var delay = data[pos] | (data[pos + 1] << 8);
        pos += 2;
        var transIdx = data[pos++];
        pos++; /* block terminator */
        gce = {
          disposal: (p >> 2) & 0x07,
          delay: delay,
          transFlag: (p & 0x01) !== 0,
          transIdx: transIdx
        };
      } else if (label === 0xFF) { /* 应用扩展 */
        var appLen = data[pos++];
        var appId = '';
        for (var a = 0; a < appLen; a++) appId += String.fromCharCode(data[pos++]);
        if (appId === 'NETSCAPE2.0') {
          var sub = readSubBlocks();
          if (sub.length >= 3 && sub[0] === 1) loopCount = sub[1] | (sub[2] << 8);
        } else {
          skipSubBlocks();
        }
      } else { /* 注释／纯文本等扩展：跳过 */
        skipSubBlocks();
      }
    } else if (sep === 0x2C) { /* 图像描述块 */
      var left = u16(), top = u16(), iw = u16(), ih = u16();
      if (iw === 0 || ih === 0) throw fileError('图像块尺寸为 0，文件损坏。');
      var ipacked = data[pos++];
      var interlaced = (ipacked & 0x40) !== 0;
      var lct = null;
      if (ipacked & 0x80) {
        var lctCount = 1 << ((ipacked & 0x07) + 1);
        lct = readPalette(pos, lctCount);
        pos += lctCount * 3;
      }
      var table = lct || gct;
      if (!table) throw fileError('图像块缺少调色板，文件损坏。');
      var minCodeSize = data[pos++];
      if (minCodeSize < 1 || minCodeSize > 8) throw fileError('LZW 最小编码位数非法，文件损坏。');
      var imgData = readSubBlocks();
      var indices = lzwDecode(minCodeSize, imgData);
      var disp = gce ? gce.disposal : 0;
      var delayMs = gce ? gce.delay * 10 : 0;
      var hasTrans = gce ? gce.transFlag : false;
      var transIdx2 = gce ? gce.transIdx : 0;
      var backup = (disp === 3) ? canvas.slice() : null; /* disposal 3：先备份 */
      drawIndices(left, top, iw, ih, indices, table, interlaced, hasTrans, transIdx2);
      frames.push({
        pixels: canvas.slice(), width: width, height: height,
        delayMs: delayMs, left: left, top: top, disposal: disp
      });
      if (disp === 2) fillRectTransparent(left, top, iw, ih); /* disposal 2：恢复背景色 */
      else if (disp === 3 && backup) canvas.set(backup);     /* disposal 3：还原前帧 */
      gce = null;
    } else {
      throw fileError('遇到未知块标识，文件可能损坏。');
    }
  }
  return { width: width, height: height, loopCount: loopCount, frames: frames };
}

/* ---------- 抽帧 ----------
 * 每 keepEvery 帧保留第 1 帧，被抽掉帧的 delayMs 累加到同组保留帧上，
 * 总时长不变。返回新数组，不修改原数组。keepEvery 非法抛 Error（field='keepEvery'）。 */
function dropFrames(frames, keepEvery) {
  if (typeof keepEvery !== 'number' || !isFinite(keepEvery) ||
      Math.floor(keepEvery) !== keepEvery || keepEvery < 1) {
    throw gifError('keepEvery 必须为 ≥1 的整数。', 'keepEvery');
  }
  var out = [];
  for (var i = 0; i < frames.length; i += keepEvery) {
    var f = frames[i];
    var delay = 0;
    var end = Math.min(i + keepEvery, frames.length);
    for (var j = i; j < end; j++) delay += frames[j].delayMs;
    out.push({
      pixels: f.pixels, width: f.width, height: f.height,
      delayMs: delay, left: f.left, top: f.top, disposal: f.disposal
    });
  }
  return out;
}

/* ---------- 最近邻缩放 ----------
 * scale>0；新尺寸按等比取整（最小 1px）。返回新帧数组（新像素缓冲）。
 * scale 非法抛 Error（field='scale'）。 */
function resizeFrames(frames, scale) {
  if (typeof scale !== 'number' || !isFinite(scale) || scale <= 0) {
    throw gifError('scale 必须为 >0 的数字。', 'scale');
  }
  var out = [];
  for (var fi = 0; fi < frames.length; fi++) {
    var f = frames[fi];
    var nw = Math.max(1, Math.round(f.width * scale));
    var nh = Math.max(1, Math.round(f.height * scale));
    var dst = new Uint8ClampedArray(nw * nh * 4);
    for (var y = 0; y < nh; y++) {
      var sy = Math.min(f.height - 1, Math.floor(y / scale));
      for (var x = 0; x < nw; x++) {
        var sx = Math.min(f.width - 1, Math.floor(x / scale));
        var s = (sy * f.width + sx) * 4, d = (y * nw + x) * 4;
        dst[d] = f.pixels[s]; dst[d + 1] = f.pixels[s + 1];
        dst[d + 2] = f.pixels[s + 2]; dst[d + 3] = f.pixels[s + 3];
      }
    }
    out.push({
      pixels: dst, width: nw, height: nh,
      delayMs: f.delayMs, left: 0, top: 0, disposal: f.disposal
    });
  }
  return out;
}

/* ---------- median-cut 自适应调色板（确定性） ---------- */
function medianCut(colors, maxBoxes) {
  /* colors: [{r,g,b,n}]；返回 boxes 数组，每 box 为颜色数组 */
  if (colors.length === 0 || maxBoxes < 1) return [];
  var boxes = [colors.slice()];
  while (boxes.length < maxBoxes) {
    var bi = -1, bch = 0, brange = -1;
    for (var i = 0; i < boxes.length; i++) {
      var box = boxes[i];
      if (box.length < 2) continue;
      var mn = [255, 255, 255], mx = [0, 0, 0];
      for (var j = 0; j < box.length; j++) {
        var c = box[j];
        if (c.r < mn[0]) mn[0] = c.r; if (c.r > mx[0]) mx[0] = c.r;
        if (c.g < mn[1]) mn[1] = c.g; if (c.g > mx[1]) mx[1] = c.g;
        if (c.b < mn[2]) mn[2] = c.b; if (c.b > mx[2]) mx[2] = c.b;
      }
      var ranges = [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]];
      var ch = 0;
      if (ranges[1] > ranges[ch]) ch = 1;
      if (ranges[2] > ranges[ch]) ch = 2;
      if (ranges[ch] > brange) { brange = ranges[ch]; bi = i; bch = ch; }
    }
    if (bi < 0) break;
    var target = boxes[bi];
    var key = bch === 0 ? 'r' : (bch === 1 ? 'g' : 'b');
    target.sort(function (a, b2) { return a[key] - b2[key]; });
    var total = 0, t;
    for (t = 0; t < target.length; t++) total += target[t].n;
    var acc = 0, mid = 0;
    for (t = 0; t < target.length; t++) {
      acc += target[t].n;
      if (acc * 2 >= total) { mid = t; break; }
    }
    if (mid >= target.length - 1) mid = target.length - 2;
    if (mid < 0) mid = 0;
    boxes[bi] = target.slice(0, mid + 1);
    boxes.push(target.slice(mid + 1));
  }
  return boxes;
}
function boxAverage(box) {
  var r = 0, g = 0, b = 0, n = 0;
  for (var i = 0; i < box.length; i++) {
    r += box[i].r * box[i].n; g += box[i].g * box[i].n; b += box[i].b * box[i].n;
    n += box[i].n;
  }
  if (n === 0) n = 1;
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
}

/* ---------- 调色板量化 ----------
 * 自适应调色板（median-cut），输出 { width, height, frames }，
 * frames[i] = { indices: Uint8Array, palette: [[r,g,b]...], width, height,
 *               delayMs, hasTransparent }。
 * 透明像素（alpha<128）固定映射到 palette[0]（透明占位色），编码时写透明标志。
 * maxColors 非法（非 1..256 整数）抛 Error（field='maxColors'）。 */
function quantizeFrames(frames, maxColors) {
  if (typeof maxColors !== 'number' || !isFinite(maxColors) ||
      Math.floor(maxColors) !== maxColors || maxColors < 1 || maxColors > 256) {
    throw gifError('maxColors 必须为 1..256 的整数。', 'maxColors');
  }
  if (!frames || frames.length === 0) throw gifError('frames 为空，无法量化。', 'frames');
  var hist = {};
  var anyTransparent = false;
  var fi, i;
  for (fi = 0; fi < frames.length; fi++) {
    var px = frames[fi].pixels;
    for (i = 0; i < px.length; i += 4) {
      if (px[i + 3] < 128) { anyTransparent = true; continue; }
      var key = (px[i] << 16) | (px[i + 1] << 8) | px[i + 2];
      hist[key] = (hist[key] || 0) + 1;
    }
  }
  var colors = [];
  for (var k in hist) {
    if (!Object.prototype.hasOwnProperty.call(hist, k)) continue;
    var v = +k;
    colors.push({ r: (v >> 16) & 0xff, g: (v >> 8) & 0xff, b: v & 0xff, n: hist[k] });
  }
  var slots = anyTransparent ? maxColors - 1 : maxColors;
  if (slots < 1) slots = 1;
  var boxes = medianCut(colors, slots);
  var palette = [];
  if (anyTransparent) palette.push([0, 0, 0]); /* 索引 0：透明占位 */
  for (var bxi = 0; bxi < boxes.length; bxi++) palette.push(boxAverage(boxes[bxi]));
  if (palette.length === 0) palette.push([0, 0, 0]);
  /* 像素→调色板索引（按颜色缓存，保证确定性与速度） */
  var cache = {};
  function nearestIndex(r, g, b) {
    var key = (r << 16) | (g << 8) | b;
    if (cache[key] !== undefined) return cache[key];
    var best = anyTransparent ? 1 : 0, bestD = Infinity;
    var start = anyTransparent ? 1 : 0;
    for (var p = start; p < palette.length; p++) {
      var dr = r - palette[p][0], dg = g - palette[p][1], db = b - palette[p][2];
      var d = dr * dr + dg * dg + db * db;
      if (d < bestD) { bestD = d; best = p; }
    }
    cache[key] = best;
    return best;
  }
  var qframes = [];
  for (fi = 0; fi < frames.length; fi++) {
    var f = frames[fi];
    var np = f.width * f.height;
    var idx = new Uint8Array(np);
    var frameTrans = false;
    for (i = 0; i < np; i++) {
      var o = i * 4;
      if (f.pixels[o + 3] < 128) { idx[i] = 0; frameTrans = true; }
      else idx[i] = nearestIndex(f.pixels[o], f.pixels[o + 1], f.pixels[o + 2]);
    }
    qframes.push({
      indices: idx, palette: palette, width: f.width, height: f.height,
      delayMs: f.delayMs, hasTransparent: frameTrans
    });
  }
  return { width: frames[0].width, height: frames[0].height, frames: qframes };
}

/* ---------- GIF 编码 ----------
 * frames[i] = { indices, palette:[[r,g,b]...], width, height, delayMs, hasTransparent }；
 * meta = { width, height, loopCount }（loopCount 缺省 0=无限循环）。
 * 返回 Uint8Array（GIF89a）。frames 为空抛 Error（field='frames'）。 */
function encodeGif(frames, meta) {
  if (!frames || frames.length === 0) throw gifError('frames 为空，无法编码。', 'frames');
  meta = meta || {};
  var W = meta.width || frames[0].width;
  var H = meta.height || frames[0].height;
  var loop = meta.loopCount == null ? 0 : meta.loopCount;
  var out = [];
  function byte(b) { out.push(b & 0xff); }
  function u16(v) { byte(v & 0xff); byte((v >> 8) & 0xff); }
  function ascii(s) { for (var i = 0; i < s.length; i++) byte(s.charCodeAt(i)); }
  ascii('GIF89a');
  u16(W); u16(H);
  byte(0x70); /* 无全局调色表 */
  byte(0); byte(0);
  /* NETSCAPE2.0 循环扩展（恒写；loop=0 表示无限循环） */
  byte(0x21); byte(0xFF); byte(11);
  ascii('NETSCAPE2.0');
  byte(3); byte(1); u16(loop); byte(0);
  for (var fi = 0; fi < frames.length; fi++) {
    var f = frames[fi];
    var pal = f.palette && f.palette.length ? f.palette : [[0, 0, 0]];
    var n = Math.max(1, pal.length);
    var bits = 1;
    while ((1 << bits) < n) bits++;
    /* 图形控制扩展 */
    byte(0x21); byte(0xF9); byte(4);
    byte(f.hasTransparent ? 0x01 : 0x00);
    u16(Math.max(0, Math.round((f.delayMs || 0) / 10)));
    byte(0); /* 透明色索引 = 0（与 quantizeFrames 约定一致） */
    byte(0);
    /* 图像描述块（全画布帧） */
    byte(0x2C);
    u16(0); u16(0); u16(f.width); u16(f.height);
    byte(0x80 | (bits - 1)); /* 局部调色表标志＋尺寸 */
    var tableSize = 1 << bits;
    for (var pi = 0; pi < tableSize; pi++) {
      var c = pal[pi] || [0, 0, 0];
      byte(c[0]); byte(c[1]); byte(c[2]);
    }
    /* LZW 图像数据（分子块） */
    var minCodeSize = Math.max(2, bits);
    var lzw = lzwEncode(minCodeSize, f.indices);
    byte(minCodeSize);
    for (var o = 0; o < lzw.length; o += 255) {
      var chunk = Math.min(255, lzw.length - o);
      byte(chunk);
      for (var j = 0; j < chunk; j++) byte(lzw[o + j]);
    }
    byte(0);
  }
  byte(0x3B); /* Trailer */
  return new Uint8Array(out);
}

/* ---------- 字节数→中文可读 ---------- */
function formatBytes(n) {
  n = Math.max(0, Math.floor(+n || 0));
  if (n < 1024) return n + ' B';
  if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1048576).toFixed(1) + ' MB';
}

/* ---------- 示例 GIF ----------
 * 用 encodeGif 合成固定示例：4 帧 32×32 色块动画（每帧纯色底＋移动黑块），
 * delay 100ms，loop 无限。确定性：同样调用永远得到同样字节。 */
function generateExampleGif() {
  var W = 32, H = 32, N = 4;
  var palette = [[0, 0, 0], [255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 255]];
  var frames = [];
  for (var f = 0; f < N; f++) {
    var indices = new Uint8Array(W * H);
    var bg = f + 1;
    var i;
    for (i = 0; i < W * H; i++) indices[i] = bg;
    var ox = f * 8, oy = f * 8;
    for (var y = 0; y < 8; y++) {
      for (var x = 0; x < 8; x++) indices[(oy + y) * W + (ox + x)] = 0;
    }
    frames.push({
      indices: indices, palette: palette, width: W, height: H,
      delayMs: 100, hasTransparent: false
    });
  }
  return encodeGif(frames, { width: W, height: H, loopCount: 0 });
}

var api = {
  parseGif: parseGif,
  dropFrames: dropFrames,
  resizeFrames: resizeFrames,
  quantizeFrames: quantizeFrames,
  encodeGif: encodeGif,
  lzwDecode: lzwDecode,
  lzwEncode: lzwEncode,
  formatBytes: formatBytes,
  generateExampleGif: generateExampleGif
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
} else {
  window.GifCompress = api;
  document.addEventListener('DOMContentLoaded', function () {
    var $ = function (id) { return document.getElementById(id); };
    var dropEl = $('gc-drop'), fileEl = $('gc-file'),
        loadExEl = $('gc-load-example'), dlExEl = $('gc-download-example'),
        warnEl = $('gc-warn'), errEl = $('gc-error'),
        infoEl = $('gc-info'), compressBtn = $('gc-compress'),
        progWrap = $('gc-progress-wrap'), progBar = $('gc-progress-bar'), progText = $('gc-progress-text'),
        resultEl = $('gc-result'), toastEl = $('gc-toast');

    var originalBytes = null;   /* Uint8Array */
    var originalName = '';
    var parsed = null;          /* parseGif 结果 */
    var resultBytes = null;     /* Uint8Array */
    var resultFrames = null;    /* 结果重解析帧（用于预览） */
    var MAX_SUGGEST = 20 * 1048576; /* 20MB 建议上限 */

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
    function fmtMs(ms) {
      if (ms < 1000) return ms + 'ms';
      return (ms / 1000).toFixed(1) + 's';
    }
    function copyText(text, done) {
      function fallback() {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        var ok = false;
        try { ok = document.execCommand('copy'); } catch (e) {}
        document.body.removeChild(ta);
        done(ok);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { done(true); }, function () { fallback(); });
      } else { fallback(); }
    }
    function downloadBytes(bytes, filename) {
      var blob = new Blob([bytes], { type: 'image/gif' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    }
    function stopAnim(canvas) {
      if (canvas && canvas._gcTimer) { clearTimeout(canvas._gcTimer); canvas._gcTimer = null; }
    }
    /* canvas 逐帧动画预览 */
    function playAnimation(canvas, frames) {
      stopAnim(canvas);
      if (!frames || !frames.length) return;
      var ctx = canvas.getContext('2d');
      var f0 = frames[0];
      canvas.width = f0.width;
      canvas.height = f0.height;
      var i = 0;
      function tick() {
        var f = frames[i];
        try { ctx.putImageData(new ImageData(f.pixels, f.width, f.height), 0, 0); } catch (e) {}
        i = (i + 1) % frames.length;
        canvas._gcTimer = setTimeout(tick, Math.max(20, f.delayMs || 100));
      }
      tick();
    }
    function currentScale() {
      var checked = document.querySelector('input[name="gc-scale"]:checked');
      var customW = parseInt(($('gc-custom-w').value || '').trim(), 10);
      if (checked && checked.value === 'custom') {
        if (!customW || customW < 1) { showError('自定义宽度请输入 ≥1 的整数像素值。'); return null; }
        if (customW > parsed.width) { showError('自定义宽度不能超过原图宽度（' + parsed.width + 'px）。'); return null; }
        return customW / parsed.width;
      }
      return parseFloat(checked ? checked.value : '1');
    }
    function currentOptions() {
      var keep = parseInt((document.querySelector('input[name="gc-keep"]:checked') || {}).value || '1', 10);
      var colors = parseInt((document.querySelector('input[name="gc-colors"]:checked') || {}).value || '256', 10);
      var scale = currentScale();
      if (scale === null) return null;
      return { scale: scale, keepEvery: keep, maxColors: colors };
    }
    function optionSummary(opts) {
      var pct = Math.round(opts.scale * 100);
      var keepTxt = opts.keepEvery === 1 ? '保留全部' : '1/' + opts.keepEvery;
      return '尺寸 ' + pct + '%／帧率 ' + keepTxt + '／颜色数 ≤' + opts.maxColors;
    }
    function loadBytes(bytes, name) {
      hideError();
      var p;
      try {
        p = api.parseGif(bytes);
      } catch (e) {
        originalBytes = null; parsed = null;
        infoEl.style.display = 'none';
        resultEl.style.display = 'none';
        showError((e && e.message) ? e.message : 'GIF 解析失败，请确认文件为有效的 .gif。');
        return;
      }
      if (!p.frames.length) {
        showError('该 GIF 不含任何图像帧，无法处理。');
        return;
      }
      originalBytes = bytes;
      originalName = name;
      parsed = p;
      stopAnim($('gc-prev-orig'));
      stopAnim($('gc-prev-new'));
      resultEl.style.display = 'none';
      resultBytes = null;
      /* 原图信息卡 */
      $('gc-info-size').textContent = api.formatBytes(bytes.length);
      $('gc-info-dims').textContent = p.width + '×' + p.height + ' px';
      $('gc-info-frames').textContent = p.frames.length + ' 帧';
      var totalMs = 0, fi;
      for (fi = 0; fi < p.frames.length; fi++) totalMs += p.frames[fi].delayMs;
      $('gc-info-duration').textContent = fmtMs(totalMs);
      $('gc-info-loop').textContent = p.loopCount === 0 ? '无限循环' : '循环 ' + p.loopCount + ' 次';
      infoEl.style.display = 'block';
      /* 大文件提示 */
      if (bytes.length > MAX_SUGGEST || p.frames.length > 200) {
        warnEl.style.display = 'block';
        warnEl.textContent = '提醒：该文件较大（' + api.formatBytes(bytes.length) + '／' + p.frames.length +
          ' 帧），纯前端逐帧解码内存占用较高、处理可能较慢，建议先拆小再压缩；仍可继续。';
      } else {
        warnEl.style.display = 'none';
      }
      playAnimation($('gc-prev-orig'), p.frames);
      $('gc-prev-new').width = 0;
      toast('已载入 ' + name + '（' + p.frames.length + ' 帧），可调整选项后开始压缩。');
    }
    function setProgress(pct, text) {
      progWrap.style.display = 'block';
      progBar.style.width = pct + '%';
      progText.textContent = text;
    }
    function tick() { /* 让出主线程，保证进度条渲染 */
      return new Promise(function (res) { setTimeout(res, 30); });
    }
    function doCompress() {
      hideError();
      if (!parsed) { showError('请先上传 GIF 文件，或点「载入示例」。'); return; }
      var opts = currentOptions();
      if (!opts) return;
      compressBtn.disabled = true;
      resultEl.style.display = 'none';
      var pipeline;
      setProgress(4, '解析 GIF…');
      tick().then(function () {
        pipeline = parsed.frames;
        setProgress(18, '帧率抽稀（保留 1/' + opts.keepEvery + '）…');
        return tick();
      }).then(function () {
        pipeline = api.dropFrames(pipeline, opts.keepEvery);
        var sc = Math.round(opts.scale * 100);
        setProgress(38, '尺寸缩放（' + sc + '%，最近邻）…');
        return tick();
      }).then(function () {
        pipeline = api.resizeFrames(pipeline, opts.scale);
        setProgress(58, '调色板量化（≤' + opts.maxColors + ' 色，median-cut）…');
        return tick();
      }).then(function () {
        var q = api.quantizeFrames(pipeline, opts.maxColors);
        setProgress(80, 'LZW 编码输出 GIF…');
        return tick().then(function () { return q; });
      }).then(function (q) {
        resultBytes = api.encodeGif(q.frames, {
          width: q.width, height: q.height, loopCount: parsed.loopCount
        });
        resultFrames = api.parseGif(resultBytes).frames; /* 回读校验＋供预览 */
        setProgress(100, '完成');
        renderResult(opts, q);
        compressBtn.disabled = false;
        setTimeout(function () { progWrap.style.display = 'none'; }, 800);
      }).catch(function (e) {
        compressBtn.disabled = false;
        progWrap.style.display = 'none';
        showError('压缩失败：' + ((e && e.message) ? e.message : '未知错误'));
      });
    }
    function renderResult(opts, q) {
      var origSize = originalBytes.length;
      var newSize = resultBytes.length;
      var ratio = Math.round(newSize / origSize * 1000) / 10;
      var saved = origSize - newSize;
      var savedPct = Math.round((1 - newSize / origSize) * 1000) / 10;
      $('gc-r-orig').textContent = api.formatBytes(origSize);
      $('gc-r-new').textContent = api.formatBytes(newSize);
      $('gc-r-ratio').textContent = '为原来的 ' + ratio + '%（体积减少 ' + savedPct + '%）';
      $('gc-r-saved').textContent = '节省 ' + api.formatBytes(Math.max(0, saved));
      $('gc-r-detail').textContent = '尺寸 ' + parsed.width + '×' + parsed.height + ' → ' +
        q.width + '×' + q.height + '；帧数 ' + parsed.frames.length + ' → ' + q.frames.length +
        '；选项：' + optionSummary(opts);
      resultEl.style.display = 'block';
      playAnimation($('gc-prev-new'), resultFrames);
      resultEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      toast('压缩完成：' + api.formatBytes(origSize) + ' → ' + api.formatBytes(newSize) + '。');
    }
    function buildReport() {
      var origSize = originalBytes.length;
      var newSize = resultBytes.length;
      var ratio = Math.round(newSize / origSize * 1000) / 10;
      var savedPct = Math.round((1 - newSize / origSize) * 1000) / 10;
      var lines = [];
      lines.push('GIF 压缩报告（GIF 压缩优化器·本地压缩）');
      lines.push('原文件：' + originalName + '（' + api.formatBytes(origSize) + '，' +
        parsed.width + '×' + parsed.height + '，' + parsed.frames.length + ' 帧）');
      lines.push('压缩后：' + api.formatBytes(newSize) + '（为原来的 ' + ratio +
        '%，体积减少 ' + savedPct + '%，节省 ' + api.formatBytes(Math.max(0, origSize - newSize)) + '）');
      lines.push('输出文件：gif-compressed.gif');
      lines.push('说明：全程浏览器本地处理，未上传任何数据。');
      return lines.join('\n');
    }

    /* 上传：文件选择＋拖放 */
    fileEl.addEventListener('change', function () {
      var f = fileEl.files && fileEl.files[0];
      if (!f) return;
      var rd = new FileReader();
      rd.onload = function () { loadBytes(new Uint8Array(rd.result), f.name); };
      rd.onerror = function () { showError('文件读取失败，请重试。'); };
      rd.readAsArrayBuffer(f);
      fileEl.value = '';
    });
    dropEl.addEventListener('click', function () { fileEl.click(); });
    ['dragenter', 'dragover'].forEach(function (ev) {
      dropEl.addEventListener(ev, function (e) { e.preventDefault(); dropEl.classList.add('gc-dragover'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      dropEl.addEventListener(ev, function (e) { e.preventDefault(); dropEl.classList.remove('gc-dragover'); });
    });
    dropEl.addEventListener('drop', function (e) {
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (!f) return;
      var rd = new FileReader();
      rd.onload = function () { loadBytes(new Uint8Array(rd.result), f.name); };
      rd.onerror = function () { showError('文件读取失败，请重试。'); };
      rd.readAsArrayBuffer(f);
    });
    /* 示例 */
    loadExEl.addEventListener('click', function () {
      loadBytes(api.generateExampleGif(), '示例.gif（内置 4 帧 32×32）');
    });
    dlExEl.addEventListener('click', function () {
      downloadBytes(api.generateExampleGif(), 'example.gif');
      toast('示例 GIF 已下载，可拖回上传区测试拖放上传。');
    });
    /* 自定义宽度与预设互斥 */
    var customWEl = $('gc-custom-w');
    customWEl.addEventListener('input', function () {
      if (customWEl.value.trim() !== '') {
        var r = document.querySelector('input[name="gc-scale"][value="custom"]');
        if (r) r.checked = true;
      }
    });
    /* 压缩／下载／复制报告 */
    compressBtn.addEventListener('click', doCompress);
    $('gc-download').addEventListener('click', function () {
      if (!resultBytes) { toast('暂无压缩结果，请先压缩。'); return; }
      downloadBytes(resultBytes, 'gif-compressed.gif');
      toast('已下载 gif-compressed.gif。');
    });
    $('gc-copy-report').addEventListener('click', function () {
      if (!resultBytes) { toast('暂无压缩结果，请先压缩。'); return; }
      copyText(buildReport(), function (ok) {
        toast(ok ? '体积报告已复制到剪贴板。' : '复制失败，请手动记录。');
      });
    });
  });
}
})();
