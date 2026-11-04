/* ============================================================
* ofd.js — 极简 OFD（GB/T 33190-2016 版式文档）浏览器渲染内核 v1.0.0
*
*
* 本文件为本项目原创实现（MIT License，与本仓库一致），未复制任何
* 第三方 OFD 库源码。开发轮（2026-11-05）许可证核验过程与结论：
* 1) npm `ofd.js@1.5.0`（DLTech21）：包声明 Apache-2.0，但 dist 为 Vue
* 阅读器组件打包（4.9MB），运行时强依赖闭源核心 `parser_helper_x.js`
* （README 含 secret/digest「核心库授权」字段），且含 XHR/fetch 网络
* 行为——不符合「纯前端零上传、自包含 vendor」要求，弃用。
* 2) bestofdview（GitHub besthqs/bestofdview）：仓库未声明任何许可证
* （All Rights Reserved），不可合规引用，弃用。
* 3) OFDGo（github.com/xiaoqidun/ofdgo，Apache-2.0）：纯 Go 引擎，无现成
* WASM/浏览器构建，定制 WASM 桥接超出单轮开发范围，列为备选未采用。
* 结论：自研最小渲染内核，仅依赖站内已 vendor 的 JSZip 做解包，
* 无任何网络请求，许可证洁净（MIT）。
*
* 功能：ZIP 解包 → OFD.xml/Document.xml 解析 → 逐页 Content.xml 解析 →
* Canvas 2D 渲染（文本/矢量路径/图片/模板页/嵌入字体）。
* 坐标系：OFD 毫米、左上原点、Y 向下；渲染时 ctx 缩放至目标分辨率。
*
* 已知简化（页面「真限制」同步明示，属设计取舍非 bug）：
* - 嵌入字体缺失时回退系统字体（fontFallback），中西文字形可能有差异；
* - 渐变/底纹（AxialShd/RadialShd）按纯色填充回退；
* - CGTransform 字形重映射、复杂裁剪路径暂不支持；
* - TIFF/JB2/JPEG2000 图片浏览器无法解码，跳过该图元；
* - 加密 OFD 无法解密，给出明确错误提示。
*
* 对外 API（挂 window.OFD，Node 下 module.exports）：
* OFD.load(arrayBuffer) -> Promise<doc>
* doc.pageCount, doc.pageSize(i)->{wMm,hMm}, doc.renderPage(i,pxPerMm)->Promise<canvas>
* OFD.fontFallback(fontName) -> CSS font-family（纯函数，浏览器/Node 通用）
* OFD.hasZipMagic(u8arr) -> bool（纯函数）
* 错误：Error.code ∈ {ARG,NOT_ZIP,NO_JSZIP,NOT_OFD,XML_PARSE,NO_PAGES,BAD_PAGE,NO_IMAGE}
* ============================================================ */
(function (global) {
'use strict';

var MM_PER_INCH = 25.4;
var docSeq = 0;

/* ---------------- 通用小工具 ---------------- */

function err(code, message) {
var e = new Error(message);
e.code = code;
return e;
}

function localName(el) {
if (el.localName) return el.localName;
var n = el.nodeName || '';
var i = n.indexOf(':');
return i >= 0? n.slice(i + 1): n;
}

function childEls(el, name) {
var out = [], kids = el.childNodes || [];
for (var i = 0; i < kids.length; i++) {
if (kids[i].nodeType === 1 && localName(kids[i]) === name) out.push(kids[i]);
}
return out;
}

function firstChild(el, name) {
var r = childEls(el, name);
return r.length? r[0]: null;
}

function textOf(el) {
if (!el) return '';
return el.textContent || '';
}

function num(s, dflt) {
var v = parseFloat(s);
return isNaN(v)? dflt: v;
}

function parseNums(s) {
var out = [], parts = String(s == null? '': s).trim().split(/\s+/);
for (var i = 0; i < parts.length; i++) {
if (parts[i] === '') continue;
var v = parseFloat(parts[i]);
out.push(isNaN(v)? 0: v);
}
return out;
}

/* "x y w h" → {x,y,w,h}（毫米） */
function parseBox(s) {
var p = parseNums(s);
return { x: p[0] || 0, y: p[1] || 0, w: p[2] || 0, h: p[3] || 0};
}

/* "a b c d e f" → canvas transform 参数（OFD CTM 与 canvas 语义一致） */
function parseCTM(s) {
var p = parseNums(s);
if (p.length < 6) return null;
return [p[0], p[1], p[2], p[3], p[4], p[5]];
}

function dirOf(path) {
var i = path.lastIndexOf('/');
return i >= 0? path.slice(0, i): '';
}

function resolvePath(baseDir, rel) {
var parts = [], i, p;
var segs = (baseDir? baseDir + '/': '').split('/').concat(String(rel).split('/'));
for (i = 0; i < segs.length; i++) {
p = segs[i];
if (p === '' || p === '.') continue;
if (p === '..') { parts.pop(); continue;}
parts.push(p);
}
return parts.join('/');
}

function clamp255(v) {
v = Math.round(v);
return v < 0? 0: (v > 255? 255: v);
}

/* OFD 颜色值 → CSS 颜色。Value 形如 "R G B" / "G" / "C M Y K" */
function cssColor(value) {
var p = parseNums(value);
if (p.length >= 3) {
return 'rgb(' + clamp255(p[0]) + ',' + clamp255(p[1]) + ',' + clamp255(p[2]) + ')';
}
if (p.length === 1) {
var g = clamp255(p[0]);
return 'rgb(' + g + ',' + g + ',' + g + ')';
}
if (p.length >= 4) {
var c = p[0] / 100, m = p[1] / 100, y = p[2] / 100, k = p[3] / 100;
return 'rgb(' + clamp255(255 * (1 - c) * (1 - k)) + ',' +
clamp255(255 * (1 - m) * (1 - k)) + ',' + clamp255(255 * (1 - y) * (1 - k)) + ')';
}
return '#000000';
}

function fillOf(el) {
var n = firstChild(el, 'FillColor');
return n? cssColor(n.getAttribute('Value')): null;
}

function strokeOf(el) {
var n = firstChild(el, 'StrokeColor');
return n? cssColor(n.getAttribute('Value')): null;
}

/* ---------------- 纯函数：ZIP 文件头 / 字体回退 ---------------- */

function hasZipMagic(u8) {
if (!u8 || u8.length < 4) return false;
return u8[0] === 0x50 && u8[1] === 0x4B && u8[2] === 0x03 && u8[3] === 0x04;
}

/* OFD 字体名 → 系统字体回退栈（未知字体走默认栈；精确值由单元测试锁定） */
var FONT_MAP = {
'宋体': '"SimSun","Songti SC",serif',
'simsun': '"SimSun","Songti SC",serif',
'新宋体': '"NSimSun",serif',
'黑体': '"SimHei","PingFang SC",sans-serif',
'simhei': '"SimHei","PingFang SC",sans-serif',
'楷体': '"KaiTi","Kaiti SC",serif',
'kaiti': '"KaiTi","Kaiti SC",serif',
'仿宋': '"FangSong","STFangsong",serif',
'fangsong': '"FangSong","STFangsong",serif',
'隶书': '"LiSu",serif',
'幼圆': '"YouYuan",sans-serif',
'等线': '"DengXian","PingFang SC",sans-serif',
'dengxian': '"DengXian","PingFang SC",sans-serif',
'微软雅黑': '"Microsoft YaHei","PingFang SC",sans-serif',
'microsoftyahei': '"Microsoft YaHei","PingFang SC",sans-serif',
'arial': 'Arial,"Helvetica Neue",sans-serif',
'helvetica': 'Arial,"Helvetica Neue",sans-serif',
'times': '"Times New Roman",serif',
'timesnewroman': '"Times New Roman",serif',
'courier': '"Courier New",monospace',
'couriernew': '"Courier New",monospace'
};
var DEFAULT_FONT_STACK = '"Noto Sans SC","PingFang SC","Microsoft YaHei","SimSun",sans-serif';

function fontFallback(fontName) {
var key = String(fontName == null? '': fontName).trim().toLowerCase().replace(/[\s\-_]+/g, '');
if (FONT_MAP.hasOwnProperty(key)) return FONT_MAP[key];
return DEFAULT_FONT_STACK;
}

/* ---------------- XML 解析 ---------------- */

function parseXml(text, label) {
var doc;
try {
doc = new DOMParser().parseFromString(text, 'text/xml');
} catch (e) {
throw err('XML_PARSE', '解析 ' + label + ' 失败：' + e.message);
}
var perr = doc.getElementsByTagName('parsererror');
if (perr && perr.length) {
throw err('XML_PARSE', '解析 ' + label + ' 失败：文件可能已损坏或加密');
}
return doc;
}

/* ---------------- 文档模型构建 ---------------- */

function loadResFile(zip, absPath, fonts, media) {
return zip.file(absPath).async('string').then(function (text) {
var xml = parseXml(text, absPath);
var root = xml.documentElement;
var baseLoc = root.getAttribute('BaseLoc') || '';
var resDir = resolvePath(dirOf(absPath), baseLoc);
var i, j, fl;
var fontEls = root.getElementsByTagNameNS('*', 'Font');
for (i = 0; i < fontEls.length; i++) {
var f = fontEls[i], id = f.getAttribute('ID');
if (!id || fonts[id]) continue;
var ff = firstChild(f, 'FontFile');
fonts[id] = {
id: id,
name: f.getAttribute('FontName') || '',
family: f.getAttribute('FamilyName') || f.getAttribute('FontName') || '',
file: ff? resolvePath(resDir, textOf(ff)): ''
};
}
var mmEls = root.getElementsByTagNameNS('*', 'MultiMedia');
for (j = 0; j < mmEls.length; j++) {
var mm = mmEls[j], mid = mm.getAttribute('ID');
if (!mid || media[mid]) continue;
var mf = firstChild(mm, 'MediaFile');
media[mid] = {
id: mid,
type: mm.getAttribute('Type') || '',
format: (mm.getAttribute('Format') || '').toUpperCase(),
file: mf? resolvePath(resDir, textOf(mf)): ''
};
}
}, function () {
/* 资源文件缺失不致命：字体回退系统字体即可 */
return null;
});
}

function parseDocument(zip, docRootPath) {
var baseDir = dirOf(docRootPath);
var model = {
zip: zip, baseDir: baseDir, pages: [], templates: {},
fonts: {}, media: {}, embedded: {}, docId: ++docSeq
};
return zip.file(docRootPath).async('string').then(function (text) {
var xml = parseXml(text, 'Document.xml');
var root = xml.documentElement;
var common = firstChild(root, 'CommonData');
var defBox = { x: 0, y: 0, w: 210, h: 297};
if (common) {
var pa = firstChild(common, 'PageArea');
if (pa) {
var pb = firstChild(pa, 'PhysicalBox');
if (pb) { var b = parseBox(textOf(pb)); if (b.w > 0 && b.h > 0) defBox = b;}
}
}
/* 模板页 */
var tplEls = root.getElementsByTagNameNS('*', 'TemplatePage');
for (var ti = 0; ti < tplEls.length; ti++) {
var te = tplEls[ti], tid = te.getAttribute('ID');
if (tid) model.templates[tid] = resolvePath(baseDir, te.getAttribute('BaseLoc') || '');
}
/* 页面 */
var pageEls = root.getElementsByTagNameNS('*', 'Page');
for (var pi = 0; pi < pageEls.length; pi++) {
var pe = pageEls[pi];
/* 只收 Document/Pages 下的 Page（排除 Templates 下的 TemplatePage，已用 TemplatePage 标签区分） */
if (localName(pe.parentNode)!== 'Pages') continue;
model.pages.push({
id: pe.getAttribute('ID') || String(pi),
content: resolvePath(baseDir, pe.getAttribute('BaseLoc') || ''),
templateId: pe.getAttribute('TemplateID') || '',
wMm: defBox.w, hMm: defBox.h
});
}
if (!model.pages.length) throw err('NO_PAGES', '文档中未找到任何页面');
/* 资源 */
var resPaths = [];
if (common) {
['PublicRes', 'DocumentRes'].forEach(function (n) {
var r = firstChild(common, n);
if (r) resPaths.push(resolvePath(baseDir, textOf(r)));
});
}
var chain = Promise.resolve();
resPaths.forEach(function (rp) {
chain = chain.then(function () { return loadResFile(zip, rp, model.fonts, model.media);});
});
return chain.then(function () { return model;});
});
}

/* 嵌入字体 → FontFace 注册（失败则回退系统字体，不抛错） */
function loadEmbeddedFonts(model) {
if (typeof document === 'undefined' || typeof FontFace === 'undefined') return Promise.resolve();
var ids = Object.keys(model.fonts), chain = Promise.resolve();
ids.forEach(function (id) {
var f = model.fonts[id];
if (!f.file) return;
chain = chain.then(function () {
var zf = model.zip.file(f.file);
if (!zf) return null;
return zf.async('arraybuffer').then(function (buf) {
var fam = 'ofd-emb-' + model.docId + '-' + id;
var face = new FontFace(fam, buf);
return face.load().then(function (loaded) {
try { document.fonts.add(loaded);} catch (e) { /* 忽略 */}
model.embedded[id] = '"' + fam + '"';
});
}, function () { return null;});
});
});
return chain.then(function () { return null;});
}

/* ---------------- 图元渲染 ---------------- */

function applyCTM(ctx, el) {
var ctm = el.getAttribute('CTM');
if (!ctm) return;
var m = parseCTM(ctm);
if (m) ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
}

function renderTextObject(ctx, el, model) {
var fontId = el.getAttribute('Font');
var f = fontId? model.fonts[fontId]: null;
var family = (fontId && model.embedded[fontId]) ||
fontFallback(f? (f.family || f.name): '');
var size = num(el.getAttribute('Size'), 4);
if (!(size > 0)) size = 4;
var weight = num(el.getAttribute('Weight'), 400);
var italic = el.getAttribute('Italic') === 'true';
var hscale = num(el.getAttribute('HScale'), 1);
if (!(hscale > 0)) hscale = 1;
var doFill = el.getAttribute('Fill')!== 'false';
var doStroke = el.getAttribute('Stroke') === 'true';
var fillCss = fillOf(el) || '#000000';
var strokeCss = strokeOf(el) || '#000000';

ctx.save();
applyCTM(ctx, el);
ctx.font = (italic? 'italic ': '') + (weight >= 700? 'bold ': '') + size + 'px ' + family;
ctx.textBaseline = 'alphabetic';
ctx.textAlign = 'left';
if (doFill) ctx.fillStyle = fillCss;
if (doStroke) { ctx.strokeStyle = strokeCss; ctx.lineWidth = Math.max(0.1, size / 12);}

var codes = childEls(el, 'TextCode');
for (var ci = 0; ci < codes.length; ci++) {
var tc = codes[ci];
var x = num(tc.getAttribute('X'), 0), y = num(tc.getAttribute('Y'), 0);
var dx = parseNums(tc.getAttribute('DeltaX'));
var dy = parseNums(tc.getAttribute('DeltaY'));
var str = textOf(tc);
if (!str) continue;
var chars = str.split('');
ctx.save();
ctx.translate(x, y);
if (hscale!== 1) ctx.scale(hscale, 1);
var cx = 0, cy = 0;
if (dx.length >= chars.length || dy.length >= chars.length) {
/* 逐字定位 */
for (var gi = 0; gi < chars.length; gi++) {
if (doFill) ctx.fillText(chars[gi], cx, cy);
if (doStroke) ctx.strokeText(chars[gi], cx, cy);
var adv = (gi < dx.length)? dx[gi]: ctx.measureText(chars[gi]).width;
cx += adv;
if (gi < dy.length) cy += dy[gi];
}
} else {
if (doFill) ctx.fillText(str, 0, 0);
if (doStroke) ctx.strokeText(str, 0, 0);
}
ctx.restore();
}
ctx.restore();
}

/* OFD 圆弧（端点参数）→ 若干段三次贝塞尔。起点取 ctx 当前点。 */
function arcTo(ctx, rx, ry, phiDeg, largeArc, sweep, x1, y1) {
var p = ctx.__ofdArcPos;
var x0 = p? p[0]: x1, y0 = p? p[1]: y1;
rx = Math.abs(rx); ry = Math.abs(ry);
if (rx === 0 || ry === 0 || (x0 === x1 && y0 === y1)) { ctx.lineTo(x1, y1); return;}
var phi = phiDeg * Math.PI / 180;
var dx = (x0 - x1) / 2, dy = (y0 - y1) / 2;
var x1p = Math.cos(phi) * dx + Math.sin(phi) * dy;
var y1p = -Math.sin(phi) * dx + Math.cos(phi) * dy;
var lam = x1p * x1p / (rx * rx) + y1p * y1p / (ry * ry);
if (lam > 1) { var s = Math.sqrt(lam); rx *= s; ry *= s;}
var num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
var den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
var co = den === 0? 0: Math.sqrt(Math.max(0, num / den));
if (largeArc === sweep) co = -co;
var cxp = co * rx * y1p / ry, cyp = -co * ry * x1p / rx;
var cx = Math.cos(phi) * cxp - Math.sin(phi) * cyp + (x0 + x1) / 2;
var cy = Math.sin(phi) * cxp + Math.cos(phi) * cyp + (y0 + y1) / 2;
function vang(ux, uy, vx, vy) {
var dot = ux * vx + uy * vy;
var l = Math.sqrt(ux * ux + uy * uy) * Math.sqrt(vx * vx + vy * vy);
var a = Math.acos(Math.max(-1, Math.min(1, l === 0? 1: dot / l)));
return (ux * vy - uy * vx < 0)? -a: a;
}
var t1 = vang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
var dt = vang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
dt = dt % (Math.PI * 2);
if (!sweep && dt > 0) dt -= Math.PI * 2;
if (sweep && dt < 0) dt += Math.PI * 2;
var segs = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2)));
var cosPhi = Math.cos(phi), sinPhi = Math.sin(phi);
for (var k = 0; k < segs; k++) {
var a1 = t1 + dt * k / segs, a2 = t1 + dt * (k + 1) / segs;
var kk = 4 / 3 * Math.tan((a2 - a1) / 4);
var ex = cx + rx * Math.cos(a2), ey = cy + ry * Math.sin(a2);
var c1x = cx + rx * (Math.cos(a1) - kk * Math.sin(a1));
var c1y = cy + ry * (Math.sin(a1) + kk * Math.cos(a1));
var c2x = cx + rx * (Math.cos(a2) + kk * Math.sin(a2));
var c2y = cy + ry * (Math.sin(a2) - kk * Math.cos(a2));
/* 旋转回原坐标系 */
function rot(px, py) {
return [cx + cosPhi * (px - cx) - sinPhi * (py - cy),
cy + sinPhi * (px - cx) + cosPhi * (py - cy)];
}
var r1 = rot(c1x, c1y), r2 = rot(c2x, c2y), re = rot(ex, ey);
ctx.bezierCurveTo(r1[0], r1[1], r2[0], r2[1], re[0], re[1]);
}
}

function renderPathObject(ctx, el) {
var ab = firstChild(el, 'AbbreviatedData');
if (!ab) return;
ctx.save();
applyCTM(ctx, el);
ctx.__ofdArcPos = null;
var d = textOf(ab);
var tokens = String(d).trim().split(/[\s,]+/).filter(function (t) { return t!== '';});
var origArcTo = arcTo;
/* 逐段重放：遇到 A 时注入起点 */
ctx.beginPath();
var i = 0, px = 0, py = 0, sx = 0, sy = 0;
while (i < tokens.length) {
var cmd = tokens[i++];
if (cmd === 'M') { px = parseFloat(tokens[i++]); py = parseFloat(tokens[i++]); sx = px; sy = py; ctx.moveTo(px, py);}
else if (cmd === 'L') { px = parseFloat(tokens[i++]); py = parseFloat(tokens[i++]); ctx.lineTo(px, py);}
else if (cmd === 'Q') { var qx = parseFloat(tokens[i++]), qy = parseFloat(tokens[i++]); px = parseFloat(tokens[i++]); py = parseFloat(tokens[i++]); ctx.quadraticCurveTo(qx, qy, px, py);}
else if (cmd === 'B') { var a = parseFloat(tokens[i++]), b = parseFloat(tokens[i++]), e = parseFloat(tokens[i++]), f = parseFloat(tokens[i++]); px = parseFloat(tokens[i++]); py = parseFloat(tokens[i++]); ctx.bezierCurveTo(a, b, e, f, px, py);}
else if (cmd === 'A') {
var rx = parseFloat(tokens[i++]), ry = parseFloat(tokens[i++]), ph = parseFloat(tokens[i++]);
var la = parseFloat(tokens[i++]), sw = parseFloat(tokens[i++]);
var ex = parseFloat(tokens[i++]), ey = parseFloat(tokens[i++]);
ctx.__ofdArcPos = [px, py];
origArcTo(ctx, rx, ry, ph, la, sw, ex, ey);
ctx.__ofdArcPos = null;
px = ex; py = ey;
}
else if (cmd === 'C' || cmd === 'Z' || cmd === 'c' || cmd === 'z') { ctx.closePath(); px = sx; py = sy;}
else break;
}

var doFill = el.getAttribute('Fill') === 'true';
var doStroke = el.getAttribute('Stroke')!== 'false';
if (doFill) { ctx.fillStyle = fillOf(el) || '#000000'; ctx.fill();}
if (doStroke) {
ctx.strokeStyle = strokeOf(el) || '#000000';
ctx.lineWidth = Math.max(0.05, num(el.getAttribute('LineWidth'), 0.35));
var lj = el.getAttribute('LineJoin');
ctx.lineJoin = lj === '1'? 'round': (lj === '2'? 'bevel': 'miter');
var lc = el.getAttribute('LineCap');
ctx.lineCap = lc === '1'? 'round': (lc === '2'? 'square': 'butt');
var miter = num(el.getAttribute('MiterLimit'), 3.528);
if (miter > 0) ctx.miterLimit = miter;
var dash = el.getAttribute('DashPattern');
if (dash) {
var dp = parseNums(dash).filter(function (v) { return v > 0;});
if (dp.length) ctx.setLineDash(dp);
var off = num(el.getAttribute('DashOffset'), 0);
if (off) ctx.lineDashOffset = off;
}
ctx.stroke();
}
ctx.restore();
}

function renderImageObject(ctx, el, model) {
var rid = el.getAttribute('ResourceID');
var media = rid? model.media[rid]: null;
if (!media ||!media.file) return Promise.resolve(false);
var fmt = media.format;
if (fmt === 'TIFF' || fmt === 'TIF' || fmt === 'JB2' || fmt === 'JBIG2' || fmt === 'JP2' || fmt === 'JPEG2000') {
/* 浏览器无法解码：跳过（真限制「版式偏差」已明示） */
return Promise.resolve(false);
}
var zf = model.zip.file(media.file);
if (!zf) return Promise.resolve(false);
return zf.async('uint8array').then(function (u8) {
var mime = fmt === 'PNG'? 'image/png': (fmt === 'GIF'? 'image/gif': 'image/jpeg');
var blob = new Blob([u8], { type: mime});
var url = URL.createObjectURL(blob);
return new Promise(function (resolve) {
var img = new Image();
img.onload = function () {
URL.revokeObjectURL(url);
ctx.save();
var ctm = el.getAttribute('CTM');
if (ctm) {
var m = parseCTM(ctm);
if (m) ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
ctx.drawImage(img, 0, 0, 1, 1);
} else {
var b = parseBox(el.getAttribute('Boundary') || '0 0 10 10');
if (b.w > 0 && b.h > 0) ctx.drawImage(img, b.x, b.y, b.w, b.h);
}
ctx.restore();
resolve(true);
};
img.onerror = function () { URL.revokeObjectURL(url); resolve(false);};
img.src = url;
});
}, function () { return false;});
}

/* 递归渲染一个 Layer 下的全部图元（返回 Promise，适配图片异步解码） */
function renderLayer(ctx, layerEl, model) {
var chain = Promise.resolve();
var kids = layerEl.childNodes || [];
for (var i = 0; i < kids.length; i++) {
(function (node) {
if (node.nodeType!== 1) return;
var t = localName(node);
chain = chain.then(function () {
if (t === 'TextObject') { renderTextObject(ctx, node, model); return null;}
if (t === 'PathObject') { renderPathObject(ctx, node, model); return null;}
if (t === 'ImageObject') { return renderImageObject(ctx, node, model);}
if (t === 'CompositeObject') { return renderLayer(ctx, node, model);}
return null;
});
})(kids[i]);
}
return chain;
}

function renderContentXml(ctx, model, contentPath) {
var zf = model.zip.file(contentPath);
if (!zf) return Promise.resolve();
return zf.async('string').then(function (text) {
var xml = parseXml(text, contentPath);
var contents = xml.getElementsByTagNameNS('*', 'Content');
var chain = Promise.resolve();
for (var i = 0; i < contents.length; i++) {
(function (contentEl) {
var layers = childEls(contentEl, 'Layer');
layers.forEach(function (layer) {
chain = chain.then(function () { return renderLayer(ctx, layer, model);});
});
})(contents[i]);
}
return chain;
});
}

/* ---------------- 对外 API ---------------- */

function load(arrayBuffer) {
return new Promise(function (resolve, reject) {
try {
if (!arrayBuffer ||!(arrayBuffer instanceof ArrayBuffer)) {
throw err('ARG', '需要 ArrayBuffer 类型的 OFD 文件数据');
}
var u8 = new Uint8Array(arrayBuffer);
if (!hasZipMagic(u8)) throw err('NOT_ZIP', '不是有效的 OFD 文件（ZIP 文件头校验失败）');
if (typeof JSZip === 'undefined') throw err('NO_JSZIP', '缺少解包组件 JSZip');
} catch (e) { reject(e); return;}

JSZip.loadAsync(arrayBuffer).then(function (zip) {
var ofdEntry = zip.file('OFD.xml');
if (!ofdEntry) throw err('NOT_OFD', '压缩包内缺少 OFD.xml，不是有效的 OFD 文件');
return ofdEntry.async('string').then(function (text) {
var xml = parseXml(text, 'OFD.xml');
var bodies = xml.getElementsByTagNameNS('*', 'DocBody');
if (!bodies.length) throw err('NOT_OFD', 'OFD.xml 中缺少 DocBody，不是有效的 OFD 文件');
var docRoot = textOf(firstChild(bodies[0], 'DocRoot'));
if (!docRoot) throw err('NOT_OFD', 'OFD.xml 中缺少 DocRoot');
return parseDocument(zip, docRoot);
}).then(function (model) {
return loadEmbeddedFonts(model).then(function () { return model;});
});
}).then(function (model) {
var doc = {
pageCount: model.pages.length,
pageSize: function (i) {
if (i < 0 || i >= model.pages.length) throw err('BAD_PAGE', '页码越界');
return { wMm: model.pages[i].wMm, hMm: model.pages[i].hMm};
},
renderPage: function (i, pxPerMm) {
if (i < 0 || i >= model.pages.length) return Promise.reject(err('BAD_PAGE', '页码越界'));
if (!(pxPerMm > 0)) return Promise.reject(err('ARG', '分辨率参数非法'));
var pg = model.pages[i];
var wPx = Math.max(1, Math.round(pg.wMm * pxPerMm));
var hPx = Math.max(1, Math.round(pg.hMm * pxPerMm));
var canvas = document.createElement('canvas');
canvas.width = wPx; canvas.height = hPx;
var ctx = canvas.getContext('2d');
ctx.fillStyle = '#ffffff';
ctx.fillRect(0, 0, wPx, hPx);
ctx.save();
ctx.scale(pxPerMm, pxPerMm);
/* 页面裁剪 */
ctx.beginPath();
ctx.rect(0, 0, pg.wMm, pg.hMm);
ctx.clip();
var chain = Promise.resolve();
/* 模板页先画 */
if (pg.templateId && model.templates[pg.templateId]) {
chain = chain.then(function () {
return renderContentXml(ctx, model, model.templates[pg.templateId]);
});
}
chain = chain.then(function () { return renderContentXml(ctx, model, pg.content);});
return chain.then(function () { ctx.restore(); return canvas;});
}
};
resolve(doc);
}, reject);
});
}

var API = {
version: '1.0.0',
load: load,
hasZipMagic: hasZipMagic,
fontFallback: fontFallback,
DEFAULT_FONT_STACK: DEFAULT_FONT_STACK
};

if (typeof window!== 'undefined') {
window.OFD = API;
}
if (typeof module!== 'undefined' && module.exports) {
module.exports = API;
}

})(typeof window!== 'undefined'? window: (typeof global!== 'undefined'? global: this));
