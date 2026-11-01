/* 批量随机数生成器 - 整数区间＋小数位(0~6)＋数量(1~10000)＋去重＋排序 → 列表实时展示／一键复制／CSV 下载
 * 零后端、零 fetch/XHR、零 CDN。随机源默认 crypto.getRandomValues（浏览器），Node 自测可注入确定性 rand。
 * 纯函数契约（浏览器/Node 通用，非法参数抛 Error，err.field 给出字段名，不静默钳制）：
 * validateRange(min, max, decimals, count, unique)
 * -> 规范化参数 {min,max,decimals,count,unique}
 * （min/max 非有限整数 → err.field='min'/'max'；min>max → err.field='min'；
 * decimals 非 0~6 整数 → err.field='decimals'；count 非 1~10000 整数 → err.field='count'；
 * 去重时 count 超出区间容量 → err.field='count'，拒绝生成不静默截断）
 * genBatch({min,max,decimals,count,unique,sort}, rand)
 * -> 字符串数组（decimals=0 为整数串，否则 toFixed(decimals)；sort: 'none'/'asc'/'desc'，默认 'none'；
 * rand 缺省用 crypto 随机源；unique 用格式化串去重＋拒绝采样）
 * formatBatch(values) -> 复制用文本（一行一个）
 * buildCsvFileName(now) -> 'random_numbers_YYYYMMDD_HHmmss.csv'（now 缺省为 new Date()）
 * buildCsvContent(values) -> UTF-8 BOM ＋ 值（一行一个，\r\n 分隔）
 * Node 自测：module.exports 暴露纯函数。
 */
(function () {
'use strict';

function err(field, msg) {
var e = new Error(msg);
e.field = field;
return e;
}

function isInt(v) {
return typeof v === 'number' && isFinite(v) && Math.floor(v) === v;
}

/* 去重容量：整数模式为区间整数个数；小数模式为该精度下可表示的不同值个数 */
function uniqueCapacity(min, max, decimals) {
if (decimals === 0) { return max - min + 1;}
return Math.round((max - min) * Math.pow(10, decimals)) + 1;
}

/* 参数校验＋规范化；非法抛 Error（err.field 命名），不静默钳制 */
function validateRange(min, max, decimals, count, unique) {
if (!isInt(min)) { throw err('min', 'validateRange: min 必须为有限整数');}
if (!isInt(max)) { throw err('max', 'validateRange: max 必须为有限整数');}
if (min > max) { throw err('min', 'validateRange: min 不能大于 max（区间非法）');}
if (!isInt(decimals) || decimals < 0 || decimals > 6) {
throw err('decimals', 'validateRange: decimals 必须为 0~6 的整数');
}
if (!isInt(count) || count < 1 || count > 10000) {
throw err('count', 'validateRange: count 必须为 1~10000 的整数');
}
var uq = !!unique;
if (uq) {
var cap = uniqueCapacity(min, max, decimals);
if (count > cap) {
throw err('count', 'validateRange: 去重开启时数量(' + count + ')超出区间容量(' + cap + ')，已拒绝生成');
}
}
return {min: min, max: max, decimals: decimals, count: count, unique: uq};
}

/* 默认随机源：crypto.getRandomValues（无 crypto 时回落 Math.random） */
function cryptoRand() {
if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
var buf = new Uint32Array(1);
crypto.getRandomValues(buf);
return buf[0] / 4294967296;
}
return Math.random();
}

/* 批量生成；rand 为注入的确定性随机函数（供测试），缺省 cryptoRand */
function genBatch(params, rand) {
if (!params || typeof params !== 'object') { throw err('min', 'genBatch: params 必须为参数对象');}
var p = validateRange(params.min, params.max, params.decimals, params.count, params.unique);
var sort = params.sort === undefined || params.sort === null ? 'none' : params.sort;
if (sort !== 'none' && sort !== 'asc' && sort !== 'desc') {
throw err('sort', 'genBatch: sort 必须为 none/asc/desc 之一');
}
var r = (typeof rand === 'function') ? rand : cryptoRand;

var out = [];
var seen = {};
var span = p.max - p.min;
var guard = p.count * 100 + 1000; /* 拒绝采样安全上限（校验后理论上不会触发） */
while (out.length < p.count) {
if (guard-- <= 0) { throw err('count', 'genBatch: 去重采样超出安全上限');}
var s;
if (p.decimals === 0) {
s = String(Math.floor(r() * (span + 1)) + p.min);
} else {
s = (p.min + r() * span).toFixed(p.decimals);
}
if (p.unique) {
if (seen[s]) { continue;}
seen[s] = true;
}
out.push(s);
}
if (sort !== 'none') {
out.sort(function (a, b) {
var d = parseFloat(a) - parseFloat(b);
return sort === 'asc' ? d : -d;
});
}
return out;
}

/* 复制用文本：一行一个 */
function formatBatch(values) {
if (!Array.isArray(values)) { throw err('values', 'formatBatch: values 必须为数组');}
return values.join('\n');
}

/* CSV 文件名：random_numbers_YYYYMMDD_HHmmss.csv */
function buildCsvFileName(now) {
var d = (now instanceof Date) ? now : new Date();
function pad(n) { return (n < 10 ? '0' : '') + n;}
return 'random_numbers_' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) +
'_' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds()) + '.csv';
}

/* CSV 内容：UTF-8 BOM ＋ 值（一行一个，\r\n 分隔，Excel 双击不乱码） */
function buildCsvContent(values) {
if (!Array.isArray(values)) { throw err('values', 'buildCsvContent: values 必须为数组');}
return '\uFEFF' + values.join('\r\n');
}

/* node 单元测试导出 */
if (typeof module !== 'undefined' && module.exports) {
module.exports = {
validateRange: validateRange,
genBatch: genBatch,
formatBatch: formatBatch,
buildCsvFileName: buildCsvFileName,
buildCsvContent: buildCsvContent,
uniqueCapacity: uniqueCapacity,
cryptoRand: cryptoRand
};
}

/* ============ 浏览器 UI（DOM 存在时才挂载） ============ */
if (typeof document !== 'undefined') {

function $(id) { return document.getElementById(id);}

function toast(msg, ok) {
var t = $('brg-toast');
if (!t) { return;}
t.textContent = msg;
t.className = 'brg-toast show ' + (ok === false ? 'fail' : 'ok');
clearTimeout(toast._timer);
toast._timer = setTimeout(function () { t.className = 'brg-toast';}, 2400);
}

/* 复制：Clipboard API 优先，降级 execCommand */
function copyText(text, cb) {
if (navigator.clipboard && navigator.clipboard.writeText) {
navigator.clipboard.writeText(text).then(function () { cb(true);}, function () { cb(false);});
} else {
var ta = document.createElement('textarea');
ta.value = text;
ta.style.position = 'fixed'; ta.style.opacity = '0';
document.body.appendChild(ta);
ta.select();
var ok = false;
try { ok = document.execCommand('copy');} catch (e) { ok = false;}
document.body.removeChild(ta);
cb(ok);
}
}

var lastValues = [];

/* 主刷新：读表单 → 纯函数校验＋生成 → 列表实时展示 */
function refresh() {
var errBox = $('brg-err');
var listBox = $('brg-list');
var countBox = $('brg-count');
var copyBtn = $('brg-copy');
var csvBtn = $('brg-csv');

var min = parseInt($('brg-min').value, 10);
var max = parseInt($('brg-max').value, 10);
var decimals = parseInt($('brg-decimals').value, 10);
var count = parseInt($('brg-count-input').value, 10);
var unique = $('brg-unique').checked;
var sort = $('brg-sort').value;

var values;
try {
values = genBatch({min: min, max: max, decimals: decimals, count: count, unique: unique, sort: sort});
} catch (e) {
lastValues = [];
errBox.style.display = 'block';
errBox.textContent = (e && e.message) ? e.message : '参数有误';
listBox.textContent = '参数不合法，修正后自动重新生成';
countBox.textContent = '共 0 个';
copyBtn.disabled = true;
csvBtn.disabled = true;
return;
}

lastValues = values;
errBox.style.display = 'none';
errBox.textContent = '';
countBox.textContent = '共 ' + values.length + ' 个' +
(unique ? '（已去重）' : '') +
(sort === 'asc' ? '（升序）' : sort === 'desc' ? '（降序）' : '');
listBox.textContent = values.join('\n');
copyBtn.disabled = false;
csvBtn.disabled = false;
}

document.addEventListener('DOMContentLoaded', function () {
['brg-min', 'brg-max', 'brg-decimals', 'brg-count-input', 'brg-sort'].forEach(function (id) {
$(id).addEventListener('input', refresh);
$(id).addEventListener('change', refresh);
});
$('brg-unique').addEventListener('change', refresh);

/* 填入示例 */
$('brg-sample').addEventListener('click', function () {
$('brg-min').value = '1';
$('brg-max').value = '100';
$('brg-decimals').value = '0';
$('brg-count-input').value = '20';
$('brg-unique').checked = true;
$('brg-sort').value = 'asc';
refresh();
toast('已填入示例：1~100 整数、20 个去重升序', true);
});

/* 一键复制 */
$('brg-copy').addEventListener('click', function () {
if (!lastValues.length) { return;}
copyText(formatBatch(lastValues), function (ok) {
toast(ok ? '✅ 已复制 ' + lastValues.length + ' 个随机数' : '❌ 复制失败，请手动选择复制', ok);
});
});

/* CSV 下载（UTF-8 BOM，Excel 中文不乱码） */
$('brg-csv').addEventListener('click', function () {
if (!lastValues.length) { return;}
var blob = new Blob([buildCsvContent(lastValues)], {type: 'text/csv;charset=utf-8'});
var a = document.createElement('a');
a.href = URL.createObjectURL(blob);
a.download = buildCsvFileName();
document.body.appendChild(a);
a.click();
setTimeout(function () {
URL.revokeObjectURL(a.href);
document.body.removeChild(a);
}, 500);
toast('✅ CSV 已开始下载', true);
});

refresh();
});

} /* typeof document !== 'undefined' */
})();
