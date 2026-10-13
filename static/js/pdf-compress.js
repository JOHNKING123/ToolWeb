/* PDF 压缩 - 纯前端本地处理（智能压缩 + 扫描件压缩双模式）
 *
 * 智能模式：pdf-lib 解析重建 —— 嵌入图片按压缩强度档 JPEG 重采样重嵌（只换更小的，
 *           透明/CMYK/特殊图片原样保留）+ 按页复制重建清理冗余对象 + 元数据清理；
 *           文字保持可选、链接注解/表单域/页面尺寸保留。
 * 扫描件模式：pdf.js 逐页渲染为图片（150/100/72 DPI 三档）→ pdf-lib 新建 PDF 重嵌；
 *           重绘后文字不可选中，适用于纯扫描件。
 * pdf-lib 1.17.1 / pdf.js 3.11.174 均经 cdnjs 懒加载；文件只在浏览器本地处理，不上传服务器。
 */
(function () {
'use strict';

/* ---------------- 常量 ---------------- */
var PDFLIB_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js';
var PDFJS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
var PDFJS_WORKER_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
var BIG_FILE = 50 * 1024 * 1024;      // 超过仅提示，不硬拦截
var IMG_MIN_BYTES = 10 * 1024;        // 小于此的嵌入图跳过重压（收益太小）
var MAX_SCAN_PX = 40000000;           // 扫描件单页渲染像素上限（防内存爆掉）
var RECOMMEND_TEXT_CHARS = 100;       // 前3页可提文字超过此数 → 推荐智能压缩

var SMART_LEVELS = {
  high:   { label: '高（图片质量优先）', maxSide: 2048, quality: 0.85, estSave: 0.25 },
  medium: { label: '中（推荐，均衡）',   maxSide: 1536, quality: 0.70, estSave: 0.50 },
  low:    { label: '低（体积优先）',     maxSide: 1024, quality: 0.55, estSave: 0.70 }
};
var SCAN_LEVELS = {
  high:   { label: '高（150 DPI，打印清晰）', dpi: 150, quality: 0.80 },
  medium: { label: '中（100 DPI，推荐）',     dpi: 100, quality: 0.72 },
  low:    { label: '低（72 DPI，体积最小）',  dpi: 72,  quality: 0.62 }
};

/* ---------------- 通用小工具 ---------------- */
function $(id) { return document.getElementById(id); }
function fmtSize(n) {
  if (n !== 0 && !n) return '-';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(2) + ' MB';
}
function baseName(name) { return String(name || 'file').replace(/\.pdf$/i, ''); }
function downloadBlob(blob, name) {
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
}
function canvasToBlob(canvas, type, quality) {
  return new Promise(function (resolve) {
    if (canvas.toBlob) canvas.toBlob(function (b) { resolve(b); }, type, quality);
    else resolve(null);
  });
}
/* 页码范围解析（与 pdf-merge-split.js 同口径）：如 1-5,8 */
function parseRange(text, total) {
  if (!text || !String(text).trim()) return { error: '请先输入页码范围，例如 1-5,8' };
  var cleaned = String(text).replace(/，/g, ',').replace(/[－–—]/g, '-').replace(/\s+/g, '');
  if (!cleaned) return { error: '请先输入页码范围，例如 1-5,8' };
  var set = {};
  var tokens = cleaned.split(',');
  for (var i = 0; i < tokens.length; i++) {
    var tk = tokens[i];
    if (!tk) return { error: '页码范围里有空段（多余的逗号），请检查后重试' };
    var m = tk.match(/^(\d+)-(\d+)$/);
    if (m) {
      var a = Number(m[1]), b = Number(m[2]);
      if (a < 1 || a > total || b < 1 || b > total) return { error: '区间 ' + tk + ' 超出范围：该 PDF 共 ' + total + ' 页，页码须在 1-' + total + ' 之间' };
      if (a > b) return { error: '区间 ' + tk + ' 写反了：起始页不能大于结束页' };
      for (var p = a; p <= b; p++) set[p] = true;
    } else if (/^\d+$/.test(tk)) {
      var n = Number(tk);
      if (n < 1 || n > total) return { error: '页码 ' + n + ' 超出范围：该 PDF 共 ' + total + ' 页，页码须在 1-' + total + ' 之间' };
      set[n] = true;
    } else {
      return { error: '无法识别「' + tk + '」：请用数字与短横线，如 1-5,8' };
    }
  }
  var pages = Object.keys(set).map(Number).sort(function (x, y) { return x - y; });
  if (!pages.length) return { error: '没有选中任何页面，请检查页码范围' };
  return { pages: pages };
}

/* ---------------- CDN 懒加载（与 pdf-manage.js 同款） ---------------- */
function ensureLib(src, globalName) {
  return new Promise(function (resolve, reject) {
    if (window[globalName]) { resolve(); return; }
    var s = document.createElement('script');
    var done = false;
    var timer = setTimeout(function () {
      if (!done) { done = true; s.remove(); reject(new Error('timeout')); }
    }, 25000);
    s.onload = function () {
      if (!done) { done = true; clearTimeout(timer); window[globalName] ? resolve() : reject(new Error('bad lib')); }
    };
    s.onerror = function () {
      if (!done) { done = true; clearTimeout(timer); reject(new Error('load failed')); }
    };
    s.src = src;
    document.head.appendChild(s);
  });
}
function ensurePdfLib() { return ensureLib(PDFLIB_CDN, 'PDFLib'); }
function ensurePdfJs() {
  return ensureLib(PDFJS_CDN, 'pdfjsLib').then(function () {
    if (window.pdfjsLib.GlobalWorkerOptions && !window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_CDN;
    }
  });
}
function ensurePdfLibUI() {
  return ensurePdfLib().catch(function () { throw { kind: 'lib', what: 'PDF 处理组件（pdf-lib CDN）' }; });
}
function ensurePdfJsUI() {
  return ensurePdfJs().catch(function () { throw { kind: 'lib', what: 'PDF 渲染组件（pdf.js CDN）' }; });
}

/* ---------------- PDF 读取错误分类 ---------------- */
function classifyPdfError(e) {
  var name = (e && e.name) || '';
  var msg = String((e && e.message) || '');
  if (name === 'PasswordException' || /password|encrypt/i.test(msg)) {
    return { kind: 'encrypted', text: '该 PDF 已加密（带打开密码），无法读取，请先解密后再试' };
  }
  if (name === 'InvalidPDFException' || name === 'MissingPDFException' || /invalid|missing|format|parse|header|trailer|xref/i.test(msg)) {
    return { kind: 'invalid', text: '文件损坏或不是有效的 PDF，请换一个文件试试' };
  }
  return { kind: 'unknown', text: '无法读取该 PDF 文件（' + (msg || '未知错误') + '），请换一个文件试试' };
}

/* ---------------- 图片收集（含嵌套 Form XObject，防循环） ---------------- */
function collectImages(doc, P) {
  var found = [];
  var visitedForm = {};
  function walkResources(resDict, pageIdx) {
    if (!resDict || !(resDict instanceof P.PDFDict)) return;
    var xobj = resDict.lookup(P.PDFName.of('XObject'));
    if (!xobj || !(xobj instanceof P.PDFDict)) return;
    var keys = xobj.keys();
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var ref = xobj.get(k);
      var obj;
      try { obj = xobj.lookup(k); } catch (e) { continue; }
      if (!obj || !(obj instanceof P.PDFStream)) continue;
      var subtype = obj.dict.lookup(P.PDFName.of('Subtype'));
      if (subtype === P.PDFName.of('Image')) {
        found.push({ key: k, holder: xobj, ref: (ref instanceof P.PDFRef) ? ref : null, stream: obj, pageIdx: pageIdx });
      } else if (subtype === P.PDFName.of('Form')) {
        var tag = ref ? ref.toString() : '';
        if (tag && visitedForm[tag]) continue;
        if (tag) visitedForm[tag] = true;
        try { walkResources(obj.dict.lookup(P.PDFName.of('Resources')), pageIdx); } catch (e) {}
      }
    }
  }
  var pages = doc.getPages();
  for (var p = 0; p < pages.length; p++) {
    try { walkResources(pages[p].node.Resources(), p); } catch (e) {}
  }
  return found;
}

function numVal(P, dict, name) {
  var v = dict.lookup(P.PDFName.of(name));
  return (v instanceof P.PDFNumber) ? v.asNumber() : 0;
}

/* 颜色空间解析：返回 {comps, palette?, palComps?}，不支持的返回 null（原样保留） */
function resolveColorSpace(P, dict) {
  var cs = dict.lookup(P.PDFName.of('ColorSpace'));
  if (!cs) return null;
  if (cs === P.PDFName.of('DeviceRGB')) return { comps: 3 };
  if (cs === P.PDFName.of('DeviceGray')) return { comps: 1 };
  if (cs instanceof P.PDFArray) {
    var kind = null;
    try { kind = cs.lookup(0); } catch (e) {}
    if (kind === P.PDFName.of('Indexed')) {
      var base = null, baseComps = 0;
      try { base = cs.lookup(1); } catch (e) {}
      if (base === P.PDFName.of('DeviceRGB')) baseComps = 3;
      else if (base === P.PDFName.of('DeviceGray')) baseComps = 1;
      else return null;
      var lookupObj = null, pal = null;
      try { lookupObj = cs.lookup(3); } catch (e) {}
      if (lookupObj instanceof P.PDFString || lookupObj instanceof P.PDFHexString) {
        try { pal = lookupObj.asBytes(); } catch (e) { pal = null; }
      }
      if (!pal) return null;
      return { comps: 1, palette: pal, palComps: baseComps };
    }
    if (kind === P.PDFName.of('ICCBased')) {
      var iccDict = null, nObj = null;
      try { iccDict = cs.lookup(1); } catch (e) {}
      if (iccDict && iccDict.lookup) {
        try { nObj = iccDict.lookup(P.PDFName.of('N')); } catch (e) {}
      }
      var n = (nObj instanceof P.PDFNumber) ? nObj.asNumber() : 0;
      if (n === 3) return { comps: 3 };
      if (n === 1) return { comps: 1 };
      return null;
    }
  }
  return null; // DeviceCMYK / Separation / Pattern 等暂不支持，原样保留
}

function getPredictor(P, dict) {
  var parms = null;
  try { parms = dict.lookup(P.PDFName.of('DecodeParms')); } catch (e) {}
  if (parms instanceof P.PDFArray) { try { parms = parms.lookup(0); } catch (e) { parms = null; } }
  if (parms instanceof P.PDFDict) {
    var pr = parms.lookup(P.PDFName.of('Predictor'));
    if (pr instanceof P.PDFNumber) return pr.asNumber();
  }
  return 1;
}

/* PNG predictor 解包（filter type 0-4，仅 8 bit） */
function unfilterPng(raw, w, h, rowBytes) {
  var out = new Uint8Array(h * rowBytes);
  var prev = new Uint8Array(rowBytes);
  var pos = 0;
  var bpp = Math.max(1, Math.ceil(rowBytes / w));
  for (var y = 0; y < h; y++) {
    if (pos >= raw.length) return null;
    var f = raw[pos++];
    var cur = new Uint8Array(rowBytes);
    for (var i = 0; i < rowBytes; i++) cur[i] = (pos < raw.length) ? raw[pos++] : 0;
    var recon = new Uint8Array(rowBytes);
    for (var x = 0; x < rowBytes; x++) {
      var a = x >= bpp ? recon[x - bpp] : 0;
      var b = prev[x];
      var c = x >= bpp ? prev[x - bpp] : 0;
      var v = cur[x], r;
      if (f === 1) r = v + a;
      else if (f === 2) r = v + b;
      else if (f === 3) r = v + ((a + b) >> 1);
      else if (f === 4) {
        var p = a + b - c;
        var pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        var pr = (pa <= pb && pa <= pc) ? a : ((pb <= pc) ? b : c);
        r = v + pr;
      } else r = v;
      recon[x] = r & 255;
    }
    out.set(recon, y * rowBytes);
    prev = recon;
  }
  return out;
}

/* 原始像素 → ImageData（8 bit 快道；1/2/4 bit 位展开；Indexed 查表） */
function pixelsToImageData(px, w, h, csInfo, bpc) {
  var comps = csInfo.comps;
  var data = new Uint8ClampedArray(w * h * 4);
  var total = w * h, i, o;
  if (bpc === 8) {
    var p = 0, r, g, b;
    for (i = 0; i < total; i++) {
      if (csInfo.palette) {
        var idx = px[p++] * csInfo.palComps;
        if (csInfo.palComps === 3) { r = csInfo.palette[idx] || 0; g = csInfo.palette[idx + 1] || 0; b = csInfo.palette[idx + 2] || 0; }
        else { r = g = b = csInfo.palette[idx] || 0; }
      } else if (comps === 3) { r = px[p++]; g = px[p++]; b = px[p++]; }
      else { r = g = b = px[p++]; }
      o = i * 4;
      data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = 255;
    }
  } else if (bpc === 1 || bpc === 2 || bpc === 4) {
    var mask = (1 << bpc) - 1, sc = 255 / mask;
    var byteIdx = 0, cur = 0, bitsLeft = 0;
    for (i = 0; i < total; i++) {
      var vals = [];
      for (var cIdx = 0; cIdx < comps; cIdx++) {
        if (bitsLeft < bpc) { cur = px[byteIdx++]; bitsLeft = 8; }
        bitsLeft -= bpc;
        vals.push((cur >> bitsLeft) & mask);
      }
      var rr, gg, bb;
      if (comps === 3) { rr = vals[0]; gg = vals[1]; bb = vals[2]; }
      else { rr = gg = bb = vals[0]; }
      o = i * 4;
      data[o] = Math.round(rr * sc); data[o + 1] = Math.round(gg * sc);
      data[o + 2] = Math.round(bb * sc); data[o + 3] = 255;
    }
  } else {
    return null;
  }
  return new ImageData(data, w, h);
}

/* 把一个嵌入图片解码为 canvas；不可解码/太小返回 null（调用方原样保留） */
function decodeImage(P, stream) {
  var dict = stream.dict;
  var w = numVal(P, dict, 'Width'), h = numVal(P, dict, 'Height'), bpc = numVal(P, dict, 'BitsPerComponent');
  if (!w || !h || w <= 0 || h <= 0 || w > 12000 || h > 12000) return Promise.resolve(null);
  if (dict.lookup(P.PDFName.of('ImageMask'))) return Promise.resolve(null);
  if (dict.lookup(P.PDFName.of('SMask'))) return Promise.resolve(null);
  var encoded;
  try { encoded = stream.getContents(); } catch (e) { return Promise.resolve(null); }
  if (!encoded || encoded.length < IMG_MIN_BYTES) return Promise.resolve(null);
  var filter = dict.lookup(P.PDFName.of('Filter'));
  var fname = (filter instanceof P.PDFName) ? filter.toString() : '';
  if (fname === '/DCTDecode') {
    // JPEG 由浏览器直接解码
    var blob = new Blob([encoded], { type: 'image/jpeg' });
    return createImageBitmap(blob).then(function (bmp) {
      var c = document.createElement('canvas');
      c.width = bmp.width || w; c.height = bmp.height || h;
      c.getContext('2d').drawImage(bmp, 0, 0);
      if (bmp.close) { try { bmp.close(); } catch (e) {} }
      return { canvas: c };
    }).then(function (r) { return r; }, function () { return null; });
  }
  if (fname === '/FlateDecode' || fname === '/LZWDecode' || fname === '') {
    if (bpc !== 8 && bpc !== 1 && bpc !== 2 && bpc !== 4) return Promise.resolve(null);
    var csInfo = resolveColorSpace(P, dict);
    if (!csInfo) return Promise.resolve(null);
    var rowBytes = Math.ceil(w * csInfo.comps * bpc / 8);
    var predictor = getPredictor(P, dict);
    var expected = (predictor >= 10 ? rowBytes + 1 : rowBytes) * h;
    var raw;
    try { raw = P.decodePDFRawStream({ dict: dict, contents: encoded }).getBytes(); }
    catch (e) { return Promise.resolve(null); }
    if (!raw || raw.length < expected) return Promise.resolve(null);
    var px = raw;
    if (predictor >= 10) {
      if (bpc !== 8) return Promise.resolve(null);
      px = unfilterPng(raw, w, h, rowBytes);
      if (!px) return Promise.resolve(null);
    } else {
      px = raw.subarray(0, h * rowBytes);
    }
    var imgData = pixelsToImageData(px, w, h, csInfo, bpc);
    if (!imgData) return Promise.resolve(null);
    var c2 = document.createElement('canvas');
    c2.width = w; c2.height = h;
    c2.getContext('2d').putImageData(imgData, 0, 0);
    return Promise.resolve({ canvas: c2 });
  }
  return Promise.resolve(null); // JPXDecode / CCITTFaxDecode / JBIG2 等：原样保留
}

/* 快速判断图片是否可重压（分析/预估用，不实际解码） */
function isDecodable(P, stream) {
  var dict = stream.dict;
  var w = numVal(P, dict, 'Width'), h = numVal(P, dict, 'Height'), bpc = numVal(P, dict, 'BitsPerComponent');
  if (!w || !h || w > 12000 || h > 12000) return false;
  if (dict.lookup(P.PDFName.of('ImageMask'))) return false;
  if (dict.lookup(P.PDFName.of('SMask'))) return false;
  var filter = dict.lookup(P.PDFName.of('Filter'));
  var fname = (filter instanceof P.PDFName) ? filter.toString() : '';
  if (fname === '/DCTDecode') return true;
  if (fname === '/FlateDecode' || fname === '/LZWDecode' || fname === '') {
    if (bpc !== 8 && bpc !== 1 && bpc !== 2 && bpc !== 4) return false;
    return !!resolveColorSpace(P, dict);
  }
  return false;
}

/* ---------------- 智能压缩：图片重采样重嵌（逐页推进度） ---------------- */
async function recompressImages(doc, P, level, onProgress) {
  var lvl = SMART_LEVELS[level] || SMART_LEVELS.medium;
  var found = collectImages(doc, P);
  var pages = doc.getPages();
  var seen = {};
  var stats = { images: 0, recompressed: 0, skipped: 0, savedBytes: 0 };
  found.forEach(function (f, i) {
    var t = f.ref ? f.ref.toString() : ('n' + i);
    if (!seen[t]) { seen[t] = 1; stats.images++; }
  });
  seen = {};
  for (var pi = 0; pi < pages.length; pi++) {
    if (onProgress) onProgress(pi / pages.length, '正在处理第 ' + (pi + 1) + '/' + pages.length + ' 页…');
    var pageItems = found.filter(function (f) { return f.pageIdx === pi; });
    for (var i = 0; i < pageItems.length; i++) {
      var f = pageItems[i];
      var tag = f.ref ? f.ref.toString() : ('p' + pi + 'i' + i);
      if (seen[tag]) continue;
      seen[tag] = 1;
      var dec = await decodeImage(P, f.stream);
      if (!dec || !dec.canvas) { stats.skipped++; continue; }
      var canvas = dec.canvas;
      var scale = 1, longSide = Math.max(canvas.width, canvas.height);
      if (longSide > lvl.maxSide) scale = lvl.maxSide / longSide;
      var out = canvas;
      if (scale < 1) {
        out = document.createElement('canvas');
        out.width = Math.max(1, Math.round(canvas.width * scale));
        out.height = Math.max(1, Math.round(canvas.height * scale));
        var ox = out.getContext('2d');
        ox.fillStyle = '#ffffff';
        ox.fillRect(0, 0, out.width, out.height);
        ox.drawImage(canvas, 0, 0, out.width, out.height);
      }
      var blob = await canvasToBlob(out, 'image/jpeg', lvl.quality);
      if (!blob) { stats.skipped++; continue; }
      var bytes = new Uint8Array(await blob.arrayBuffer());
      var origLen = 0;
      try { origLen = f.stream.getContents().length; } catch (e) {}
      if (!origLen || bytes.length >= origLen) { stats.skipped++; continue; } // 只换更小的，不增大
      var emb = await doc.embedJpg(bytes);
      var targets;
      if (f.ref) {
        targets = found.filter(function (g) { return g.ref && g.ref.toString() === tag; });
      } else {
        targets = [f];
      }
      targets.forEach(function (t) { try { t.holder.set(t.key, emb.ref); } catch (e) {} });
      if (f.ref) { try { doc.context.delete(f.ref); } catch (e) {} }
      stats.recompressed++;
      stats.savedBytes += (origLen - bytes.length);
    }
  }
  if (onProgress) onProgress(1, '图片处理完成');
  return stats;
}

/* ---------------- 元数据处理 ---------------- */
function applyMetadata(P, src, out, meta) {
  var ctx = out.context;
  function clearInfo() {
    var info = null;
    try {
      var infoRef = ctx.trailerInfo && ctx.trailerInfo.Info;
      info = infoRef && ctx.lookup(infoRef);
    } catch (e) {}
    if (info instanceof P.PDFDict) {
      ['Title', 'Author', 'Subject', 'Keywords', 'Creator', 'Producer', 'CreationDate', 'ModDate', 'Trapped'].forEach(function (k) {
        try { info.delete(P.PDFName.of(k)); } catch (e) {}
      });
    }
  }
  // XMP 元数据流一律清理（体积 + 隐私）
  try {
    if (out.catalog.get(P.PDFName.of('Metadata'))) out.catalog.delete(P.PDFName.of('Metadata'));
  } catch (e) {}
  if (meta && meta.strip === false && src) {
    // 保留：从原文档复制常用字段
    try {
      var t = src.getTitle(); if (t) out.setTitle(t);
      var a = src.getAuthor(); if (a) out.setAuthor(a);
      var s = src.getSubject(); if (s) out.setSubject(s);
      var kw = src.getKeywords(); if (kw) out.setKeywords(kw);
      var pr = src.getProducer(); if (pr) out.setProducer(pr);
      var cr = src.getCreator(); if (cr) out.setCreator(cr);
    } catch (e) {}
  } else {
    clearInfo();
    try {
      if (meta && meta.title) out.setTitle(meta.title);
      if (meta && meta.author) out.setAuthor(meta.author);
      if (meta && meta.subject) out.setSubject(meta.subject);
    } catch (e) {}
  }
}

/* ---------------- 智能压缩主流程 ---------------- */
async function smartCompress(buf, opts, onProgress) {
  await ensurePdfLibUI();
  var P = window.PDFLib;
  var src = await P.PDFDocument.load(buf, { ignoreEncryption: false });
  var total = src.getPageCount();
  var idxArr = opts.pages || Array.from({ length: total }, function (_, i) { return i; });
  var out = await P.PDFDocument.create();
  var copied = await out.copyPages(src, idxArr);
  copied.forEach(function (p) { out.addPage(p); });
  // 表单域尽力保留（AcroForm 整体复制）
  try {
    var acro = src.catalog.get(P.PDFName.of('AcroForm'));
    if (acro) {
      var copier = P.PDFObjectCopier.for(src.context, out.context);
      out.catalog.set(P.PDFName.of('AcroForm'), copier.copy(acro));
    }
  } catch (e) {}
  var stats = await recompressImages(out, P, opts.level, function (frac, text) {
    if (onProgress) onProgress(frac * 0.85, text);
  });
  applyMetadata(P, src, out, opts.meta);
  if (onProgress) onProgress(0.92, '正在生成 PDF…');
  var bytes = await out.save({ useObjectStreams: true });
  if (onProgress) onProgress(1, '完成');
  return { bytes: bytes, stats: stats, pages: idxArr.length };
}

/* ---------------- 扫描件压缩主流程（渲染 + 嵌入两阶段） ---------------- */
async function scanCompress(buf, opts, onProgress) {
  await ensurePdfJsUI();
  await ensurePdfLibUI();
  var P = window.PDFLib;
  var pdfjs = window.pdfjsLib;
  var pdf;
  try {
    pdf = await pdfjs.getDocument({ data: buf.slice(0) }).promise;
  } catch (e) {
    throw classifyPdfError(e);
  }
  var total = pdf.numPages;
  var oneBased = opts.pages || Array.from({ length: total }, function (_, i) { return i + 1; });
  var lvl = SCAN_LEVELS[opts.level] || SCAN_LEVELS.medium;
  var scale = lvl.dpi / 72;
  var out = await P.PDFDocument.create();
  // 第一阶段：逐页渲染
  var rendered = [];
  for (var i = 0; i < oneBased.length; i++) {
    var pnum = oneBased[i];
    if (onProgress) onProgress((i / oneBased.length) * 0.5, '正在渲染第 ' + pnum + ' 页（' + lvl.dpi + ' DPI）…（' + (i + 1) + '/' + oneBased.length + '）');
    var page;
    try { page = await pdf.getPage(pnum); }
    catch (e) { throw { kind: 'render', text: '第 ' + pnum + ' 页渲染失败（' + (e.message || '未知错误') + '），请换一档或缩小范围重试' }; }
    var vp0 = page.getViewport({ scale: 1 });
    var vp = page.getViewport({ scale: scale });
    var cw = Math.ceil(vp.width), ch = Math.ceil(vp.height);
    if (cw * ch > MAX_SCAN_PX) {
      throw { kind: 'oom', text: '第 ' + pnum + ' 页在 ' + lvl.dpi + ' DPI 下太大（约 ' + Math.round(cw * ch / 1e6) + ' 百万像素），内存可能不足。请改用更低的压缩强度档，或缩小页码范围后重试' };
    }
    var canvas = document.createElement('canvas');
    canvas.width = cw; canvas.height = ch;
    var ctx2d = canvas.getContext('2d');
    ctx2d.fillStyle = '#ffffff';
    ctx2d.fillRect(0, 0, cw, ch);
    try {
      await page.render({ canvasContext: ctx2d, viewport: vp }).promise;
    } catch (e) {
      throw { kind: 'oom', text: '第 ' + pnum + ' 页渲染时内存不足（' + (e.message || '未知错误') + '）。请改用更低的压缩强度档，或缩小页码范围后重试' };
    }
    var blob = await canvasToBlob(canvas, 'image/jpeg', lvl.quality);
    canvas.width = 0; canvas.height = 0; // 立即释放
    try { page.cleanup(); } catch (e) {}
    if (!blob) throw { kind: 'render', text: '第 ' + pnum + ' 页转图片失败，请重试' };
    rendered.push({ blob: blob, w: vp0.width, h: vp0.height });
  }
  // 第二阶段：嵌入为新 PDF
  for (var j = 0; j < rendered.length; j++) {
    if (onProgress) onProgress(0.5 + (j / rendered.length) * 0.45, '正在嵌入第 ' + (j + 1) + '/' + rendered.length + ' 页…');
    var r = rendered[j];
    var ab = await r.blob.arrayBuffer();
    var img = await out.embedJpg(new Uint8Array(ab));
    var pg = out.addPage([r.w, r.h]);
    pg.drawImage(img, { x: 0, y: 0, width: r.w, height: r.h });
    rendered[j] = null;
  }
  applyMetadata(P, null, out, opts.meta);
  if (onProgress) onProgress(0.98, '正在生成 PDF…');
  var bytes = await out.save({ useObjectStreams: true });
  try { pdf.destroy(); } catch (e) {}
  if (onProgress) onProgress(1, '完成');
  return { bytes: bytes, stats: { pages: oneBased.length, dpi: lvl.dpi } };
}

/* ---------------- 智能模式分析（预估用） ---------------- */
async function analyzeSmart(buf, pages /* 0-based 数组或 null */) {
  await ensurePdfLibUI();
  var P = window.PDFLib;
  var src = await P.PDFDocument.load(buf, { ignoreEncryption: false });
  var total = src.getPageCount();
  var idxArr = pages || Array.from({ length: total }, function (_, i) { return i; });
  var out = await P.PDFDocument.create();
  var copied = await out.copyPages(src, idxArr);
  copied.forEach(function (p) { out.addPage(p); });
  var found = collectImages(out, P);
  var seen = {}, imageCount = 0, decodableCount = 0, imageBytes = 0, decodableBytes = 0;
  for (var i = 0; i < found.length; i++) {
    var f = found[i];
    var tag = f.ref ? f.ref.toString() : ('a' + i);
    if (seen[tag]) continue;
    seen[tag] = 1;
    var len = 0;
    try { len = f.stream.getContents().length; } catch (e) {}
    if (!len) continue;
    imageCount++;
    imageBytes += len;
    if (len >= IMG_MIN_BYTES && isDecodable(P, f.stream)) {
      decodableCount++;
      decodableBytes += len;
    }
  }
  return { pages: total, imageCount: imageCount, decodableCount: decodableCount, imageBytes: imageBytes, decodableBytes: decodableBytes };
}

/* ---------------- 文本层采样（自动推荐用）：前 N 页可提文字数 ---------------- */
async function sampleText(buf, maxPages) {
  await ensurePdfJs();
  var pdfjs = window.pdfjsLib;
  var pdf = await pdfjs.getDocument({ data: buf.slice(0) }).promise;
  var n = Math.min(pdf.numPages, maxPages || 3);
  var chars = 0;
  for (var i = 1; i <= n; i++) {
    var page = await pdf.getPage(i);
    var tc = await page.getTextContent();
    (tc.items || []).forEach(function (it) {
      if (it.str) chars += String(it.str).replace(/\s+/g, '').length;
    });
    try { page.cleanup(); } catch (e) {}
  }
  try { pdf.destroy(); } catch (e) {}
  return { chars: chars, sampled: n };
}

/* ---------------- 预置测试 PDF（文本型 / 扫描件型，供用户自测） ---------------- */
async function makeSamplePdf(kind) {
  await ensurePdfLibUI();
  var P = window.PDFLib;
  var doc = await P.PDFDocument.create();
  var font = await doc.embedFont(P.StandardFonts.Helvetica);
  var i, j;
  if (kind === 'text') {
    for (var p = 0; p < 3; p++) {
      var page = doc.addPage([595, 842]);
      page.drawText('Sample Text PDF - Page ' + (p + 1), { x: 50, y: 790, size: 22, font: font });
      var y = 748;
      for (var k = 0; k < 6; k++) {
        page.drawText('Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor.', { x: 50, y: y, size: 11, font: font, maxWidth: 495 });
        y -= 20;
        page.drawText('Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip.', { x: 50, y: y, size: 11, font: font, maxWidth: 495 });
        y -= 26;
      }
      // 一张 canvas 生成的大 JPEG（渐变 + 噪点，体积大、可压缩）
      var c = document.createElement('canvas');
      c.width = 1200; c.height = 800;
      var x = c.getContext('2d');
      var grd = x.createLinearGradient(0, 0, 1200, 800);
      grd.addColorStop(0, '#1e3a8a'); grd.addColorStop(0.5, '#7c3aed'); grd.addColorStop(1, '#db2777');
      x.fillStyle = grd; x.fillRect(0, 0, 1200, 800);
      var id = x.getImageData(0, 0, 1200, 800), dd = id.data;
      for (i = 0; i < dd.length; i += 4) { var nz = (Math.random() * 40) | 0; dd[i] += nz; dd[i + 1] += nz; dd[i + 2] += nz; }
      x.putImageData(id, 0, 0);
      x.fillStyle = '#ffffff'; x.font = 'bold 90px sans-serif';
      x.fillText('SAMPLE PHOTO ' + (p + 1), 250, 420);
      var blob = await canvasToBlob(c, 'image/jpeg', 0.95);
      var ab = await blob.arrayBuffer();
      var img = await doc.embedJpg(new Uint8Array(ab));
      page.drawImage(img, { x: 50, y: 130, width: 495, height: 330 });
      page.drawText('Page ' + (p + 1) + ' / 3', { x: 280, y: 30, size: 10, font: font });
      if (p === 0) {
        var link = doc.context.obj({
          Type: 'Annot', Subtype: 'Link', Rect: [50, 60, 300, 80],
          A: { Type: 'Action', S: 'URI', URI: 'https://example.com' }
        });
        page.node.set(P.PDFName.of('Annots'), doc.context.obj([doc.context.register(link)]));
        page.drawText('Example link: https://example.com', { x: 50, y: 62, size: 11, font: font });
      }
    }
    doc.setTitle('Sample Text PDF');
    return await doc.save();
  }
  // 扫描件型：canvas 画"纸张"（米黄底 + 文字行 + 噪点）→ JPEG 全页嵌入
  for (var q = 0; q < 3; q++) {
    var c2 = document.createElement('canvas');
    c2.width = 1240; c2.height = 1754;
    var x2 = c2.getContext('2d');
    x2.fillStyle = '#f5f1e8'; x2.fillRect(0, 0, 1240, 1754);
    var id2 = x2.getImageData(0, 0, 1240, 1754), dd2 = id2.data;
    for (j = 0; j < dd2.length; j += 16) { var nz2 = (Math.random() * 24) | 0; dd2[j] += nz2; dd2[j + 1] += nz2; dd2[j + 2] += nz2; }
    x2.putImageData(id2, 0, 0);
    x2.fillStyle = '#222222';
    for (var ln = 0; ln < 38; ln++) {
      var yy = 150 + ln * 40, xx = 120;
      while (xx < 1050) {
        var ww = 40 + Math.random() * 90;
        x2.fillRect(xx, yy, Math.min(ww, 1120 - xx), 14);
        xx += ww + 18;
      }
    }
    x2.fillStyle = '#b00000'; x2.font = 'bold 44px sans-serif';
    x2.fillText('SCANNED PAGE ' + (q + 1), 400, 90);
    var blob2 = await canvasToBlob(c2, 'image/jpeg', 0.9);
    var ab2 = await blob2.arrayBuffer();
    var img2 = await doc.embedJpg(new Uint8Array(ab2));
    var pg = doc.addPage([595, 842]);
    pg.drawImage(img2, { x: 0, y: 0, width: 595, height: 842 });
  }
  doc.setTitle('Sample Scanned PDF');
  return await doc.save();
}

/* 对外暴露（可测试） */
window.PdfCompress = {
  smartCompress: smartCompress,
  scanCompress: scanCompress,
  analyzeSmart: analyzeSmart,
  sampleText: sampleText,
  makeSamplePdf: makeSamplePdf,
  parseRange: parseRange,
  classifyPdfError: classifyPdfError,
  SMART_LEVELS: SMART_LEVELS,
  SCAN_LEVELS: SCAN_LEVELS
};

/* ---------------- 页面状态与绑定 ---------------- */
var fileBuf = null, fileName = '', fileSize = 0, pageCount = 0;
var mode = 'smart';        // 'smart' | 'scan'
var recommended = '';
var analyzing = false, working = false;
var lastResult = null;     // {bytes, name}
var estimateTimer = null;

function setStatus(m) { var el = $('pcz-status'); if (el) el.textContent = m || ''; }
function showError(m) { var el = $('pcz-error'); if (el) el.innerHTML = m || ''; }
function showLibError(what) {
  var el = $('pcz-lib-error');
  if (!el) return;
  el.style.display = 'block';
  el.textContent = what + '加载失败，请检查网络连接后重试（页面其他部分不受影响）。';
}
function hideLibError() { var el = $('pcz-lib-error'); if (el) { el.style.display = 'none'; el.textContent = ''; } }
function setExportEnabled(en) { var b = $('pcz-export'); if (b) b.disabled = !en; }
function showProgress(frac, text) {
  var box = $('pcz-progress');
  if (!box) return;
  box.style.display = 'block';
  $('pcz-progress-bar').style.width = Math.round(frac * 100) + '%';
  $('pcz-progress-txt').textContent = text || '';
}
function hideProgress() {
  var box = $('pcz-progress');
  if (!box) return;
  box.style.display = 'none';
  $('pcz-progress-bar').style.width = '0';
  $('pcz-progress-txt').textContent = '';
}
function currentLevel() {
  var r = document.querySelector('input[name="pcz-level"]:checked');
  return r ? r.value : 'medium';
}
/* 页码：返回 {zeroBased(0-based数组|null), oneBased(1-based数组|null), error} */
function currentPages() {
  var custom = document.querySelector('input[name="pcz-range"]:checked');
  if (!custom || custom.value === 'all') return { zeroBased: null, oneBased: null };
  var r = parseRange($('pcz-range-input').value, pageCount);
  if (r.error) return { error: r.error };
  return {
    zeroBased: r.pages.map(function (p) { return p - 1; }),
    oneBased: r.pages.slice()
  };
}

function renderFileInfo() {
  var fi = $('pcz-fileinfo');
  fi.style.display = 'flex';
  $('pcz-file-name').textContent = fileName;
  $('pcz-file-sub').textContent = fmtSize(fileSize) + ' · 共 ' + pageCount + ' 页';
}

function syncLevelLabels() {
  var lvls = mode === 'smart' ? SMART_LEVELS : SCAN_LEVELS;
  ['high', 'medium', 'low'].forEach(function (k) {
    var el = $('pcz-level-' + k + '-label');
    if (el) el.textContent = lvls[k].label;
  });
  var hint = $('pcz-level-hint');
  if (hint) hint.textContent = mode === 'smart'
    ? '智能模式：按此档对嵌入图片重采样并以 JPEG 重嵌（只换更小的；透明/CMYK/特殊图片原样保留）。'
    : '扫描件模式：按此分辨率逐页渲染为图片后重嵌。DPI 越高越清晰、体积越大。';
}
function syncModeUI() {
  var radios = document.querySelectorAll('input[name="pcz-mode"]');
  for (var i = 0; i < radios.length; i++) radios[i].checked = (radios[i].value === mode);
  $('pcz-card-smart').classList.toggle('active', mode === 'smart');
  $('pcz-card-scan').classList.toggle('active', mode === 'scan');
  $('pcz-card-smart').setAttribute('aria-checked', mode === 'smart' ? 'true' : 'false');
  $('pcz-card-scan').setAttribute('aria-checked', mode === 'scan' ? 'true' : 'false');
  $('pcz-badge-smart').style.display = (recommended === 'smart') ? 'inline-block' : 'none';
  $('pcz-badge-scan').style.display = (recommended === 'scan') ? 'inline-block' : 'none';
  $('pcz-scan-warn').style.display = (mode === 'scan') ? 'block' : 'none';
  syncLevelLabels();
}

function showEstimateText(el, estNew, basis) {
  estNew = Math.max(0, Math.round(estNew));
  var pct = fileSize > 0 ? Math.round((1 - estNew / fileSize) * 100) : 0;
  if (pct <= 2) {
    el.innerHTML = '预估：压缩收益可能很小（该 PDF 可能已高度压缩或图片占比很低）。' + basis + '，实际以导出为准，仍可导出验证。';
  } else {
    el.innerHTML = '预估压缩后约 <b>' + fmtSize(estNew) + '</b>（−' + pct + '%）。' + basis + '，实际以导出为准。';
  }
}

function renderSampleSize(oneBased) {
  return ensurePdfJsUI().then(function () {
    var pdfjs = window.pdfjsLib;
    return pdfjs.getDocument({ data: fileBuf.slice(0) }).promise;
  }).then(function (pdf) {
    var pnum = (oneBased && oneBased[0]) || 1;
    var lvl = SCAN_LEVELS[currentLevel()];
    return pdf.getPage(pnum).then(function (page) {
      var vp = page.getViewport({ scale: lvl.dpi / 72 });
      var canvas = document.createElement('canvas');
      canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      return page.render({ canvasContext: ctx, viewport: vp }).promise.then(function () {
        return canvasToBlob(canvas, 'image/jpeg', lvl.quality);
      }).then(function (blob) {
        canvas.width = 0; canvas.height = 0;
        try { pdf.destroy(); } catch (e) {}
        if (!blob) throw new Error('blob');
        return blob.size;
      });
    });
  });
}

function updateEstimate() {
  var el = $('pcz-estimate');
  if (!el || !fileBuf) return Promise.resolve();
  el.style.display = 'block';
  el.textContent = '正在估算压缩效果…';
  var cp = currentPages();
  if (cp.error) { el.textContent = cp.error; return Promise.resolve(); }
  if (mode === 'smart') {
    return analyzeSmart(fileBuf, cp.zeroBased).then(function (a) {
      var lvl = SMART_LEVELS[currentLevel()];
      var estNew = fileSize - a.decodableBytes * lvl.estSave;
      showEstimateText(el, estNew, '基于 ' + a.decodableCount + ' 张可重压图片（共 ' + a.imageCount + ' 张嵌入图）的分析估算');
    }).catch(function () { el.textContent = '预估失败，不影响导出。'; });
  }
  return renderSampleSize(cp.oneBased).then(function (onePageBytes) {
    var n = (cp.oneBased || Array.from({ length: pageCount }, function (_, i) { return i + 1; })).length;
    var estNew = onePageBytes * n + 50 * 1024;
    showEstimateText(el, estNew, '基于第 1 页实际渲染（' + SCAN_LEVELS[currentLevel()].dpi + ' DPI）测算');
  }).catch(function () { el.textContent = '预估失败，不影响导出。'; });
}
function scheduleEstimate() {
  if (estimateTimer) clearTimeout(estimateTimer);
  estimateTimer = setTimeout(function () { updateEstimate(); }, 600);
}

function analyze() {
  analyzing = true;
  setExportEnabled(false);
  hideLibError();
  ensurePdfLibUI().then(function () {
    var P = window.PDFLib;
    return P.PDFDocument.load(fileBuf, { ignoreEncryption: false });
  }).then(function (doc) {
    pageCount = doc.getPageCount();
    renderFileInfo();
    $('pcz-modebox').style.display = 'block';
    $('pcz-params').style.display = 'block';
    setStatus('正在分析文档类型（采样前 3 页）…');
    return sampleText(fileBuf, 3).then(function (r) {
      recommended = (r.chars >= RECOMMEND_TEXT_CHARS) ? 'smart' : 'scan';
      mode = recommended;
      syncModeUI();
      var tip = $('pcz-recommend-tip');
      if (recommended === 'smart') {
        tip.innerHTML = '已采样 ' + r.sampled + ' 页，检测到可提取文字（约 ' + r.chars + ' 字），<b>推荐「智能压缩」</b>：保留文字可选、链接与表单域。你也可以手动切换模式。';
      } else {
        tip.innerHTML = '已采样 ' + r.sampled + ' 页，几乎无文字层，<b>推荐「扫描件压缩」</b>：逐页重绘为图片再压缩。注意重绘后文字不可选中；如文件实为文字型 PDF，请手动切换回智能压缩。';
      }
      return updateEstimate();
    }, function () {
      recommended = 'smart'; mode = 'smart'; syncModeUI();
      $('pcz-recommend-tip').textContent = '文档类型自动检测失败，已默认选择「智能压缩」，你也可以手动切换模式。';
      return updateEstimate();
    });
  }).then(function () {
    setStatus('就绪：调整参数后点「压缩并导出」。');
    setExportEnabled(true);
    analyzing = false;
  }).catch(function (e) {
    analyzing = false;
    setStatus('');
    setExportEnabled(false);
    if (e && e.kind === 'lib') {
      showLibError(e.what || 'PDF 处理组件');
    } else {
      var c = classifyPdfError(e);
      if (c.kind === 'encrypted') {
        showError('该 PDF 已加密（带打开密码），无法读取。请先用 <a href="/tools/pdf-encrypt">PDF 加密/解密</a> 解除密码后再压缩。');
      } else {
        showError(c.text);
      }
    }
    $('pcz-modebox').style.display = 'none';
    $('pcz-params').style.display = 'none';
  });
}

function handleFile(file) {
  if (!file || working) return;
  hideLibError(); showError(''); setStatus('');
  $('pcz-result').style.display = 'none';
  $('pcz-preview-box').style.display = 'none';
  lastResult = null;
  fileName = file.name || 'file.pdf';
  fileSize = file.size || 0;
  var bn = $('pcz-bignote');
  if (fileSize > BIG_FILE) {
    bn.style.display = 'block';
    bn.textContent = '文件较大（' + fmtSize(fileSize) + '），处理可能较慢，但仍可继续，不拦截。';
  } else {
    bn.style.display = 'none';
  }
  setStatus('正在读取 PDF…');
  var reader = new FileReader();
  reader.onload = function () { fileBuf = reader.result; analyze(); };
  reader.onerror = function () { showError('文件读取失败，请重试。'); setStatus(''); };
  reader.readAsArrayBuffer(file);
}

function makeSample(kind) {
  if (working || analyzing) return;
  hideLibError(); showError(''); setStatus('');
  $('pcz-result').style.display = 'none';
  $('pcz-preview-box').style.display = 'none';
  setStatus('正在生成示例 PDF…');
  PdfCompress.makeSamplePdf(kind).then(function (bytes) {
    fileBuf = bytes;
    fileName = kind === 'text' ? '示例-文本型.pdf' : '示例-扫描件型.pdf';
    fileSize = bytes.length;
    $('pcz-bignote').style.display = 'none';
    analyze();
  }).catch(function (e) {
    if (e && e.kind === 'lib') showLibError(e.what || 'PDF 处理组件');
    else showError('示例 PDF 生成失败，请重试。');
    setStatus('');
  });
}

function onExport() {
  if (working || analyzing || !fileBuf) return;
  showError('');
  var cp = currentPages();
  if (cp.error) { showError(cp.error); return; }
  var meta = {
    strip: $('pcz-stripmeta').checked,
    title: $('pcz-meta-title').value.trim(),
    author: $('pcz-meta-author').value.trim(),
    subject: $('pcz-meta-subject').value.trim()
  };
  var level = currentLevel();
  working = true;
  setExportEnabled(false);
  showProgress(0, '开始压缩…');
  var job = mode === 'smart'
    ? PdfCompress.smartCompress(fileBuf, { pages: cp.zeroBased, level: level, meta: meta }, showProgress)
    : PdfCompress.scanCompress(fileBuf, { pages: cp.oneBased, level: level, meta: meta }, showProgress);
  job.then(function (res) {
    hideProgress();
    working = false;
    var outName = 'compressed_' + baseName(fileName) + '.pdf';
    downloadBlob(new Blob([res.bytes], { type: 'application/pdf' }), outName);
    lastResult = { bytes: res.bytes, name: outName };
    showResult(res);
    setExportEnabled(true);
  }).catch(function (e) {
    hideProgress();
    working = false;
    setExportEnabled(true);
    if (e && e.kind === 'lib') showLibError(e.what || 'PDF 处理组件');
    else if (e && e.text) showError(e.text);
    else showError(classifyPdfError(e).text);
  });
}

function showResult(res) {
  var box = $('pcz-result');
  box.style.display = 'block';
  var pct = fileSize > 0 ? Math.round((1 - res.bytes.length / fileSize) * 100) : 0;
  var pctTxt = pct >= 0 ? '−' + pct + '%' : '+' + (-pct) + '%';
  $('pcz-result-text').innerHTML = fmtSize(fileSize) + ' → <b>' + fmtSize(res.bytes.length) + '</b>（' + pctTxt + '）';
  var extra = '';
  if (res.stats) {
    if (mode === 'smart') extra = '共发现 ' + res.stats.images + ' 张嵌入图，重压 ' + res.stats.recompressed + ' 张，跳过 ' + res.stats.skipped + ' 张；';
    else extra = '共 ' + res.stats.pages + ' 页，' + res.stats.dpi + ' DPI；';
  }
  $('pcz-result-sub').textContent = extra + '已自动下载：' + lastResult.name;
  renderPreview(res.bytes);
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function renderPreview(resultBytes) {
  var box = $('pcz-preview-box');
  box.style.display = 'block';
  var jobs = [
    { data: fileBuf.slice(0), canvas: $('pcz-prev-before') },
    { data: resultBytes.slice(0), canvas: $('pcz-prev-after') }
  ];
  ensurePdfJsUI().then(function () {
    var pdfjs = window.pdfjsLib;
    return Promise.all(jobs.map(function (j) {
      return pdfjs.getDocument({ data: j.data }).promise.then(function (pdf) {
        return pdf.getPage(1).then(function (page) {
          var vp0 = page.getViewport({ scale: 1 });
          var scale = Math.min(1.5, 360 / vp0.width);
          var vp = page.getViewport({ scale: scale });
          j.canvas.width = Math.ceil(vp.width);
          j.canvas.height = Math.ceil(vp.height);
          return page.render({ canvasContext: j.canvas.getContext('2d'), viewport: vp }).promise.then(function () {
            try { pdf.destroy(); } catch (e) {}
          });
        });
      });
    }));
  }).catch(function () { box.style.display = 'none'; });
}

function resetForRecompress() {
  $('pcz-result').style.display = 'none';
  $('pcz-preview-box').style.display = 'none';
  lastResult = null;
  showError('');
  setStatus('已就绪：换一档压缩强度后，可再压一次。');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function clearFile() {
  fileBuf = null; fileName = ''; fileSize = 0; pageCount = 0;
  lastResult = null; recommended = ''; mode = 'smart';
  $('pcz-file').value = '';
  $('pcz-fileinfo').style.display = 'none';
  $('pcz-bignote').style.display = 'none';
  $('pcz-modebox').style.display = 'none';
  $('pcz-params').style.display = 'none';
  $('pcz-result').style.display = 'none';
  $('pcz-preview-box').style.display = 'none';
  $('pcz-estimate').style.display = 'none';
  showError(''); setStatus(''); hideProgress(); hideLibError();
  setExportEnabled(false);
}

/* ---------------- 初始化绑定 ---------------- */
function init() {
  if (!$('pcz-upload')) return; // 非工具页（如测试页）只暴露 window.PdfCompress
  var zone = $('pcz-upload'), input = $('pcz-file');
  zone.addEventListener('click', function () { input.click(); });
  zone.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
  });
  ['dragenter', 'dragover'].forEach(function (ev) {
    zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.add('dragover'); });
  });
  ['dragleave', 'drop'].forEach(function (ev) {
    zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.remove('dragover'); });
  });
  zone.addEventListener('drop', function (e) {
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) handleFile(f);
  });
  input.addEventListener('change', function () {
    if (input.files && input.files[0]) handleFile(input.files[0]);
  });
  $('pcz-clear').addEventListener('click', clearFile);
  $('pcz-sample-text').addEventListener('click', function () { makeSample('text'); });
  $('pcz-sample-scan').addEventListener('click', function () { makeSample('scan'); });

  var radios = document.querySelectorAll('input[name="pcz-mode"]');
  for (var i = 0; i < radios.length; i++) {
    radios[i].addEventListener('change', function () {
      var checked = document.querySelector('input[name="pcz-mode"]:checked');
      if (checked && checked.value !== mode) {
        mode = checked.value;
        syncModeUI();
        showError('');
        updateEstimate();
      }
    });
  }
  var cards = [['pcz-card-smart', 'smart'], ['pcz-card-scan', 'scan']];
  cards.forEach(function (pair) {
    var card = $(pair[0]);
    card.setAttribute('tabindex', '0');
    card.setAttribute('role', 'radio');
    function select() {
      if (mode !== pair[1]) { mode = pair[1]; syncModeUI(); showError(''); updateEstimate(); }
    }
    card.addEventListener('click', function (e) {
      if (e.target && e.target.tagName === 'INPUT') return;
      select();
    });
    card.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(); }
    });
  });

  var lvls = document.querySelectorAll('input[name="pcz-level"]');
  for (var j = 0; j < lvls.length; j++) {
    lvls[j].addEventListener('change', function () { scheduleEstimate(); });
  }
  var rr = document.querySelectorAll('input[name="pcz-range"]');
  for (var k = 0; k < rr.length; k++) {
    rr[k].addEventListener('change', function () {
      $('pcz-range-input').style.display = document.querySelector('input[name="pcz-range"]:checked').value === 'custom' ? '' : 'none';
      showError('');
      scheduleEstimate();
    });
  }
  $('pcz-range-input').addEventListener('input', function () { showError(''); scheduleEstimate(); });
  $('pcz-stripmeta').addEventListener('change', function () {
    $('pcz-meta-fields').style.display = $('pcz-stripmeta').checked ? '' : 'none';
  });

  $('pcz-export').addEventListener('click', onExport);
  $('pcz-download').addEventListener('click', function () {
    if (lastResult) downloadBlob(new Blob([lastResult.bytes], { type: 'application/pdf' }), lastResult.name);
  });
  $('pcz-recompress').addEventListener('click', resetForRecompress);

  syncModeUI();
  setExportEnabled(false);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

})();
