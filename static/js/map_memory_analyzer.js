/* MAP 文件内存分析器（map_memory_analyzer）- 纯前端本地解析 GCC ld -Map 输出
* 纯函数（双模式导出供 node 测试）：
* detectMapFormat(text) → 'gcc' | null（缺 Memory Configuration / Linker script and memory map 标记即 null）
* parseMemoryRegions(text) → [{name, origin, length, attrs}]（跳过 *default* 行）
* parseMapSections(text) → [{name, vma, size, loadVma|null, entries:[{name, vma, size, file, isFill}]}]
* computeRegionUsage(regions, sections) → [{name, origin, length, used, free, pct}]
* topObjects(sections, n) → [[file, size]] 降序（完整路径聚合，fill 不计入）
* summarizeMap(text) → {regions, sections, regionUsage, topObjects, totals, sectionCount, objectCount}
* formatBytes(n) → 中文可读（500 B / 1.5 KB / 1.00 MB）
* generateExampleMap() → 固定示例 map 文本（确定性向量 SAMPLE）
* 失败约定：非法参数抛 Error，err.field 给出字段名（input / n），不静默钳制。
* 真限制：① 仅 GCC ld -Map，ARMCC/IAR 暂不支持；② 只有输入节粒度（.text.main 级），无单符号大小；
* ③.data 类初始化段同时占 Flash（load 镜像）与 RAM，口径见 computeRegionUsage；④ 全程本地解析零上传。
* 零网络请求：本文件不发起任何 fetch / XHR。 */
(function () {
'use strict';

/* ---------- 失败构造 ---------- */
function fail(field, msg) {
var e = new Error(msg);
e.field = field;
throw e;
}

/* ---------- 工具 ---------- */
function isString(v) { return typeof v === 'string';}
function parseHexNum(tok) {
if (!/^0[xX][0-9a-fA-F]+$/.test(tok)) return null;
return parseInt(tok, 16);
}
function baseName(p) {
var i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
return i >= 0? p.slice(i + 1): p;
}

/* ---------- 示例 map（确定性向量 SAMPLE） ---------- */
var SAMPLE_MAP = [
'Memory Configuration',
'',
'Name Origin Length Attributes',
'*default* 0x00000000 0xffffffff',
'FLASH 0x08000000 0x00040000 xr',
'RAM 0x20000000 0x00008000 xrw',
'*default* 0x00000000 0xffffffff',
'',
'Linker script and memory map',
'',
'.text 0x08000000 0x120',
' 0x08000000 0x80 /build/startup.o',
' 0x08000080 0x40 /build/main.o',
' *fill* 0x080000c0 0x4 ',
'.rodata 0x08000120 0x20',
' 0x08000120 0x20 /build/main.o',
'.data 0x20000000 0x10 load address 0x08000144',
' 0x20000000 0x10 /build/main.o',
'.bss 0x20000010 0x30',
' 0x20000010 0x30 /build/main.o',
'',
'OUTPUT(firmware.elf elf32-littlearm)'
].join('\n');

function generateExampleMap() { return SAMPLE_MAP;}

/* ---------- detectMapFormat ---------- */
var MARK_MEMCFG = 'Memory Configuration';
var MARK_MAP = 'Linker script and memory map';

function detectMapFormat(text) {
if (!isString(text)) return null;
if (text.indexOf(MARK_MEMCFG) === -1) return null;
if (text.indexOf(MARK_MAP) === -1) return null;
return 'gcc';
}

/* ---------- parseMemoryRegions ---------- */
/* 解析 Memory Configuration 表：name origin length attrs；*default* 行跳过 */
var REGION_RE = /^\s*(\S+)\s+(0[xX][0-9a-fA-F]+)\s+(0[xX][0-9a-fA-F]+)(?:\s+(\S+))?\s*$/;

function parseMemoryRegions(text) {
if (!isString(text)) fail('input', '输入必须为字符串。');
var lines = text.split(/\r?\n/);
var inCfg = false, regions = [], i, m;
for (i = 0; i < lines.length; i++) {
var line = lines[i];
if (!inCfg) {
if (line.indexOf(MARK_MEMCFG)!== -1) inCfg = true;
continue;
}
if (line.indexOf(MARK_MAP)!== -1) break;
m = line.match(REGION_RE);
if (!m) continue;
if (m[1] === '*default*') continue;
regions.push({
name: m[1],
origin: parseInt(m[2], 16),
length: parseInt(m[3], 16),
attrs: m[4] || ''
});
}
return regions;
}

/* ---------- parseMapSections ---------- */
/* 段首行：顶格、名以. 开头、三字段（名/0x VMA/0x 大小），容忍尾部 load address 0x…；
* 明细行：缩进 + 0x 地址 + 0x 大小 + 对象文件路径（末 token），*fill* 记 isFill；
* Discarded input sections 及之后整块跳过；其它杂行跳过。 */
var SEC_HEAD_RE = /^(\.\S+)\s+(0[xX][0-9a-fA-F]+)\s+(0[xX][0-9a-fA-F]+)(?:\s+load\s+address\s+(0[xX][0-9a-fA-F]+))?\s*$/;
var ENTRY_RE = /^\s+(0[xX][0-9a-fA-F]+)\s+(0[xX][0-9a-fA-F]+)\s*(.*)$/;
var FILL_RE = /^\s*\*fill\*\s+(0[xX][0-9a-fA-F]+)\s+(0[xX][0-9a-fA-F]+)\s*$/;

function parseMapSections(text) {
if (!isString(text)) fail('input', '输入必须为字符串。');
if (detectMapFormat(text)!== 'gcc') {
fail('input', '无法识别为 GCC ld -Map 输出：缺少「Memory Configuration」或「Linker script and memory map」标记。本工具仅支持 GCC ld -Map 格式，ARMCC／IAR 暂不支持。');
}
var lines = text.split(/\r?\n/);
var inMap = false, sections = [], cur = null, i, line, m;
for (i = 0; i < lines.length; i++) {
line = lines[i];
if (!inMap) {
if (line.indexOf(MARK_MAP)!== -1) inMap = true;
continue;
}
if (/^Discarded input sections/.test(line)) break;
m = line.match(SEC_HEAD_RE);
if (m) {
cur = {
name: m[1],
vma: parseInt(m[2], 16),
size: parseInt(m[3], 16),
loadVma: m[4]? parseInt(m[4], 16): null,
entries: []
};
sections.push(cur);
continue;
}
if (cur === null) continue;
m = line.match(FILL_RE);
if (m) {
cur.entries.push({ name: '*fill*', vma: parseInt(m[1], 16), size: parseInt(m[2], 16), file: '', isFill: true});
continue;
}
m = line.match(ENTRY_RE);
if (m) {
var rest = m[3].trim().split(/\s+/).filter(function (t) { return t!== '';});
var entry = { name: '', vma: parseInt(m[1], 16), size: parseInt(m[2], 16), file: '', isFill: false};
if (rest.length > 0 && rest[0] === '*fill*') {
entry.name = '*fill*';
entry.isFill = true;
} else if (rest.length > 0) {
entry.file = rest[rest.length - 1];
entry.name = rest.slice(0, -1).join(' ');
}
cur.entries.push(entry);
}
/* 其它杂行（.text.startup 等缩进标签行、Archive member 行等）跳过 */
}
return sections;
}

/* ---------- computeRegionUsage ---------- */
/* 段按 VMA 落入 region 区间计 used；loadVma 与 VMA 不同 region 时 size 另计入 load 所在
* region（即 Flash 占用含.data 初始化镜像）；pct 保留两位小数。 */
function findRegion(regions, addr) {
for (var i = 0; i < regions.length; i++) {
if (addr >= regions[i].origin && addr < regions[i].origin + regions[i].length) return regions[i];
}
return null;
}

function computeRegionUsage(regions, sections) {
if (!Array.isArray(regions)) fail('regions', 'regions 必须为数组。');
if (!Array.isArray(sections)) fail('sections', 'sections 必须为数组。');
var usage = regions.map(function (r) {
return { name: r.name, origin: r.origin, length: r.length, attrs: r.attrs, used: 0, free: r.length, pct: 0};
});
sections.forEach(function (s) {
var r = findRegion(usage, s.vma);
if (r) r.used += s.size;
if (s.loadVma!== null && s.loadVma!== s.vma) {
var rl = findRegion(usage, s.loadVma);
if (rl && rl!== r) rl.used += s.size;
}
});
usage.forEach(function (u) {
u.free = u.length - u.used;
u.pct = u.length > 0? Math.round(u.used * 10000 / u.length) / 100: 0;
});
return usage;
}

/* ---------- topObjects ---------- */
/* 按完整路径聚合输入节大小降序；fill 项不计入文件。 */
function topObjects(sections, n) {
if (!Array.isArray(sections)) fail('sections', 'sections 必须为数组。');
if (typeof n!== 'number' ||!isFinite(n) || Math.floor(n)!== n || n < 1) {
fail('n', 'n 必须为正整数。');
}
var acc = {};
sections.forEach(function (s) {
(s.entries || []).forEach(function (e) {
if (e.isFill ||!e.file) return;
acc[e.file] = (acc[e.file] || 0) + e.size;
});
});
var rows = Object.keys(acc).map(function (f) { return [f, acc[f]];});
rows.sort(function (a, b) { return b[1] - a[1];});
return rows.slice(0, n);
}

/* ---------- summarizeMap ---------- */
function sectionBucket(name) {
if (/^\.text/.test(name)) return 'text';
if (/^\.rodata/.test(name)) return 'rodata';
if (/^\.data/.test(name)) return 'data';
if (/^\.bss/.test(name)) return 'bss';
return 'other';
}

function summarizeMap(text) {
if (!isString(text)) fail('input', '输入必须为字符串。');
if (detectMapFormat(text)!== 'gcc') {
fail('input', '无法识别为 GCC ld -Map 输出：缺少「Memory Configuration」或「Linker script and memory map」标记。本工具仅支持 GCC ld -Map 格式，ARMCC／IAR 暂不支持。');
}
var regions = parseMemoryRegions(text);
var sections = parseMapSections(text);
var totals = { text: 0, rodata: 0, data: 0, bss: 0, fill: 0};
var files = {};
sections.forEach(function (s) {
var b = sectionBucket(s.name);
if (totals.hasOwnProperty(b)) totals[b] += s.size;
(s.entries || []).forEach(function (e) {
if (e.isFill) { totals.fill += e.size; return;}
if (e.file) files[e.file] = true;
});
});
return {
regions: regions,
sections: sections,
regionUsage: computeRegionUsage(regions, sections),
topObjects: topObjects(sections, 20),
totals: totals,
sectionCount: sections.length,
objectCount: Object.keys(files).length
};
}

/* ---------- formatBytes ---------- */
function formatBytes(n) {
if (typeof n!== 'number' ||!isFinite(n) || n < 0) fail('n', '字节数必须为非负有限数。');
if (n < 1024) return n + ' B';
if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
return (n / 1024 / 1024).toFixed(2) + ' MB';
}

/* ---------- 双模式导出 ---------- */
var api = {
detectMapFormat: detectMapFormat,
parseMemoryRegions: parseMemoryRegions,
parseMapSections: parseMapSections,
computeRegionUsage: computeRegionUsage,
topObjects: topObjects,
summarizeMap: summarizeMap,
formatBytes: formatBytes,
generateExampleMap: generateExampleMap,
baseName: baseName
};

if (typeof module!== 'undefined' && module.exports) {
module.exports = api;
} else {
window.__mapMemoryAnalyzer = api;
}

/* ---------- 浏览器 DOM ---------- */
if (typeof document!== 'undefined') {
(function () {
function $(id) { return document.getElementById(id);}

var toastEl;
function toast(msg) {
if (!toastEl) toastEl = $('mm-toast');
toastEl.textContent = msg;
toastEl.style.display = 'block';
clearTimeout(toastEl._t);
toastEl._t = setTimeout(function () { toastEl.style.display = 'none';}, 2400);
}

function copyText(text, done) {
if (navigator.clipboard && navigator.clipboard.writeText) {
navigator.clipboard.writeText(text).then(function () { done(true);}, function () { fallbackCopy(text, done);});
} else { fallbackCopy(text, done);}
}
function fallbackCopy(text, done) {
var ta = document.createElement('textarea');
ta.value = text;
ta.style.position = 'fixed'; ta.style.opacity = '0';
document.body.appendChild(ta);
ta.select();
var ok = false;
try { ok = document.execCommand('copy');} catch (e) { ok = false;}
document.body.removeChild(ta);
done(ok);
}

function hex(n) { return '0x' + n.toString(16).toUpperCase();}

var lastSummary = null;
var secSort = { key: 'size', dir: -1};
var objSort = { key: 'size', dir: -1};

function el(tag, cls, text) {
var d = document.createElement(tag);
if (cls) d.className = cls;
if (text!== undefined && text!== null) d.textContent = text;
return d;
}

/* ----- 报告文本 ----- */
function buildReport(sum) {
var L = [];
L.push('MAP 文件内存分析报告（GCC ld -Map，浏览器本地解析，零上传）');
L.push('');
L.push('');
sum.regionUsage.forEach(function (u) {
L.push('- ' + u.name + '：已用 ' + u.used + ' B（' + api.formatBytes(u.used) + '）/ 总 ' +
u.length + ' B（' + api.formatBytes(u.length) + '），占比 ' + u.pct.toFixed(2) +
'%，剩余 ' + u.free + ' B（' + api.formatBytes(u.free) + '）');
});
L.push('');
L.push('');
var secs = sum.sections.slice().sort(function (a, b) { return b.size - a.size;});
secs.forEach(function (s) {
var extra = s.loadVma!== null && s.loadVma!== s.vma? '，load address ' + hex(s.loadVma): '';
L.push('- ' + s.name + ' VMA ' + hex(s.vma) + ' 大小 ' + s.size + ' B（' +
api.formatBytes(s.size) + '）' + extra);
});
L.push('');
L.push('');
sum.topObjects.forEach(function (row, i) {
L.push((i + 1) + '. ' + row[0] + ' ' + row[1] + ' B（' + api.formatBytes(row[1]) + '）');
});
L.push('');
L.push('');
L.push('- 仅支持 GCC ld -Map 输出格式；ARMCC / IAR 暂不支持。');
L.push('- 统计粒度为输入节（如.text.main 级），ld map 默认无单符号大小，符号级请用 nm / size。');
L.push('-.data 类初始化段同时占用 Flash（load 镜像）与 RAM（运行地址），已按 load address 分别计入。');
L.push('- 全程浏览器本地解析，map 文本未上传。');
return L.join('\n');
}

/* ----- 结果渲染 ----- */
function renderOverview(sum) {
var box = $('mm-overview');
box.textContent = '';
sum.regionUsage.forEach(function (u) {
var card = el('div', 'mm-region');
card.appendChild(el('div', 'mm-region-name', u.name + '　' + api.formatBytes(u.used) + ' / ' + api.formatBytes(u.length) + '（' + u.pct.toFixed(2) + '%）'));
var bar = el('div', 'mm-bar');
var fillEl = el('div', 'mm-bar-fill');
fillEl.style.width = Math.min(100, u.pct) + '%';
bar.appendChild(fillEl);
card.appendChild(bar);
card.appendChild(el('div', 'mm-region-sub', '已用 ' + u.used + ' B · 剩余 ' + api.formatBytes(u.free) + ' · 起始 ' + hex(u.origin)));
box.appendChild(card);
});
}

function sortRows(rows, key, dir, accessors) {
var arr = rows.slice();
arr.sort(function (a, b) {
var va = accessors[key](a), vb = accessors[key](b);
if (typeof va === 'string') return dir * va.localeCompare(vb);
return dir * (va - vb);
});
return arr;
}

function renderSecTable(sum) {
var tbl = $('mm-sec-table');
while (tbl.firstChild) tbl.removeChild(tbl.firstChild);
var thead = el('thead'), tr = el('tr');
var cols = [
['name', '段名'], ['vma', 'VMA 地址'], ['size', '大小'], ['pct', '占比'], ['load', 'Load 地址']
];
cols.forEach(function (c) {
var th = el('th', 'mm-sortable', c[1] + (secSort.key === c[0]? (secSort.dir > 0? ' ▲': ' ▼'): ''));
th.setAttribute('data-key', c[0]);
th.addEventListener('click', function () {
if (secSort.key === c[0]) secSort.dir = -secSort.dir;
else { secSort.key = c[0]; secSort.dir = -1;}
renderSecTable(lastSummary);
});
tr.appendChild(th);
});
thead.appendChild(tr);
tbl.appendChild(thead);
var total = sum.regionUsage.reduce(function (a, u) { return a + u.used;}, 0) || 1;
var acc = {
name: function (s) { return s.name;},
vma: function (s) { return s.vma;},
size: function (s) { return s.size;},
pct: function (s) { return s.size / total * 100;},
load: function (s) { return s.loadVma === null? -1: s.loadVma;}
};
var body = el('tbody');
sortRows(sum.sections, secSort.key, secSort.dir, acc).forEach(function (s) {
var r = el('tr');
r.appendChild(el('td', null, s.name));
r.appendChild(el('td', 'mm-num', hex(s.vma)));
r.appendChild(el('td', 'mm-num', api.formatBytes(s.size) + '（' + s.size + ' B）'));
r.appendChild(el('td', 'mm-num', (s.size / total * 100).toFixed(2) + '%'));
r.appendChild(el('td', 'mm-num', s.loadVma === null? '—': hex(s.loadVma)));
body.appendChild(r);
});
tbl.appendChild(body);
}

function renderObjTable(sum) {
var tbl = $('mm-obj-table');
while (tbl.firstChild) tbl.removeChild(tbl.firstChild);
var thead = el('thead'), tr = el('tr');
var total = sum.topObjects.reduce(function (a, r) { return a + r[1];}, 0) || 1;
var cols = [['file', '对象文件'], ['size', '大小'], ['pct', '占比']];
cols.forEach(function (c) {
var th = el('th', 'mm-sortable', c[1] + (objSort.key === c[0]? (objSort.dir > 0? ' ▲': ' ▼'): ''));
th.setAttribute('data-key', c[0]);
th.addEventListener('click', function () {
if (objSort.key === c[0]) objSort.dir = -objSort.dir;
else { objSort.key = c[0]; objSort.dir = -1;}
renderObjTable(lastSummary);
});
tr.appendChild(th);
});
thead.appendChild(tr);
tbl.appendChild(thead);
var acc = {
file: function (r) { return r[0];},
size: function (r) { return r[1];},
pct: function (r) { return r[1] / total * 100;}
};
var body = el('tbody');
sortRows(sum.topObjects, objSort.key, objSort.dir, acc).forEach(function (row) {
var r = el('tr');
var tdF = el('td');
tdF.appendChild(el('code', null, api.baseName(row[0])));
tdF.title = row[0];
r.appendChild(tdF);
r.appendChild(el('td', 'mm-num', api.formatBytes(row[1]) + '（' + row[1] + ' B）'));
r.appendChild(el('td', 'mm-num', (row[1] / total * 100).toFixed(2) + '%'));
body.appendChild(r);
});
tbl.appendChild(body);
}

function renderDetails(sum) {
var box = $('mm-details');
box.textContent = '';
sum.sections.forEach(function (s) {
var det = el('details', 'mm-detail');
var sm = el('summary', null, s.name + '　' + api.formatBytes(s.size) + '（' + s.size + ' B）　VMA ' + hex(s.vma) +
(s.loadVma!== null && s.loadVma!== s.vma? '　load ' + hex(s.loadVma): '') +
'　输入节 ' + s.entries.length + ' 个');
det.appendChild(sm);
if (s.entries.length === 0) {
det.appendChild(el('p', 'mm-note', '该段无输入节明细。'));
} else {
var tbl = el('table', 'mm-table');
var thead = el('thead'), tr = el('tr');
['地址', '大小', '类型', '对象文件'].forEach(function (h) { tr.appendChild(el('th', null, h));});
thead.appendChild(tr);
tbl.appendChild(thead);
var body = el('tbody');
s.entries.forEach(function (e) {
var r = el('tr');
r.appendChild(el('td', 'mm-num', hex(e.vma)));
r.appendChild(el('td', 'mm-num', api.formatBytes(e.size) + '（' + e.size + ' B）'));
r.appendChild(el('td', null, e.isFill? '填充（fill）': '输入节'));
var tdF = el('td');
if (e.isFill) {
tdF.appendChild(el('span', 'mm-fill-tag', '*fill*'));
} else {
tdF.appendChild(el('code', null, api.baseName(e.file) || e.name || '—'));
tdF.title = e.file || e.name;
}
r.appendChild(tdF);
body.appendChild(r);
});
tbl.appendChild(body);
det.appendChild(tbl);
}
box.appendChild(det);
});
}

function doParse() {
var raw = $('mm-input').value;
try {
var sum = api.summarizeMap(raw);
lastSummary = sum;
$('mm-msg').textContent = '';
renderOverview(sum);
renderSecTable(sum);
renderObjTable(sum);
renderDetails(sum);
$('mm-result-card').style.display = 'block';
$('mm-result-card').scrollIntoView({ behavior: 'smooth', block: 'start'});
toast('解析完成：' + sum.sectionCount + ' 个段，' + sum.objectCount + ' 个对象文件。');
} catch (e) {
lastSummary = null;
$('mm-result-card').style.display = 'none';
$('mm-msg').textContent = '解析失败：' + (e && e.message? e.message: String(e));
}
}

document.addEventListener('DOMContentLoaded', function () {
$('mm-parse').addEventListener('click', doParse);
$('mm-example').addEventListener('click', function () {
$('mm-input').value = api.generateExampleMap();
$('mm-msg').textContent = '';
toast('已载入示例，点击「解析内存占用」查看结果。');
});
$('mm-clear').addEventListener('click', function () {
$('mm-input').value = '';
$('mm-msg').textContent = '';
$('mm-result-card').style.display = 'none';
lastSummary = null;
});
$('mm-file').addEventListener('change', function (ev) {
var f = ev.target.files && ev.target.files[0];
if (!f) return;
var rd = new FileReader();
rd.onload = function () {
$('mm-input').value = String(rd.result || '');
$('mm-msg').textContent = '';
toast('已读取本地文件 ' + f.name + '（仅本地解析，未上传）。');
};
rd.onerror = function () { toast('文件读取失败，请重试。');};
rd.readAsText(f);
ev.target.value = '';
});
$('mm-copy').addEventListener('click', function () {
if (!lastSummary) { toast('暂无解析结果，请先解析。'); return;}
copyText(buildReport(lastSummary), function (ok) {
toast(ok? '中文占用报告已复制到剪贴板。': '复制失败，请手动选择复制。');
});
});
$('mm-download').addEventListener('click', function () {
if (!lastSummary) { toast('暂无解析结果，请先解析。'); return;}
var blob = new Blob([buildReport(lastSummary)], { type: 'text/plain;charset=utf-8'});
var a = document.createElement('a');
a.href = URL.createObjectURL(blob);
a.download = 'map-memory-report.txt';
document.body.appendChild(a);
a.click();
setTimeout(function () { URL.revokeObjectURL(a.href); a.remove();}, 500);
toast('已下载 map-memory-report.txt。');
});
});
})();
}
})();
