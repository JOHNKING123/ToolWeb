/* 文本信息提取器（text_info_extractor）- 纯前端零上传文本信息提取
* 多行粘贴文本／本地.txt 读取 → 8 条内置规则多选提取＋自定义正则
* → 按规则分组清单（去重附次数／按序全列）＋HTML 转义后高亮。
* 真限制：正则只是近似提取，命中≠真实有效；不承诺 100% 召回；
* 不提取身份证号、银行卡号；只处理用户主动粘贴的文本；不发请求验活。
* 零网络请求：本文件不发起任何请求；高亮一律先转义原文再插 mark，
* 输入里的 <script> 等 HTML 只显示为文本，不会执行。
* 浏览器与 node 测试共用同一纯函数；浏览器绑定只在有 document 时执行。 */
(function () {
'use strict';

var RULE_COLORS = ['#dbeafe', '#fef3c7', '#dcfce7', '#fce7f3',
'#ede9fe', '#ffedd5', '#cffafe', '#fee2e2'];

function escapeHtml(s) {
return String(s == null? '': s)
.replace(/&/g, '&amp;')
.replace(/</g, '&lt;')
.replace(/>/g, '&gt;')
.replace(/"/g, '&quot;')
.replace(/'/g, '&#39;');
}

/* 按正则全局扫描，返回 [{value, start, end}]；validate 可再校验语义合法性。 */
function collect(re, text, validate) {
var out = [];
var m;
re.lastIndex = 0;
while ((m = re.exec(text))!== null) {
if (m[0] === '') { re.lastIndex++; continue;}
var item = { value: m[0], start: m.index, end: m.index + m[0].length, groups: m.slice(1)};
if (!validate || validate(item)) out.push({ value: item.value, start: item.start, end: item.end});
if (re.lastIndex === m.index) re.lastIndex++;
}
return out;
}

function daysInMonth(y, m) {
var table = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
if (m === 2) return ((y % 4 === 0 && y % 100!== 0) || y % 400 === 0)? 29: 28;
return table[m - 1] || 0;
}
function isValidDateParts(y, m, d) {
return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}

/* 链接尾部标点不计入：句号、逗号、分号、问号、感叹号与中文标点、右括号类。 */
var LINK_TRAILING = '.,;:!?，。；：、）】」』"\'';
function trimLink(v) {
while (v.length > 0 && LINK_TRAILING.indexOf(v.charAt(v.length - 1))!== -1) {
v = v.slice(0, -1);
}
return v;
}

var BUILTIN_RULES = [
{ id: 'email', name: '邮箱',
desc: '常规邮箱格式：local@domain.tld，只验格式不验域名是否真实存在。',
example: 'wang@example.com',
extract: function (text) {
return collect(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g, text);
}},
{ id: 'mobile', name: '手机号',
desc: '1[3-9] 开头的 11 位号码，只验号段格式不验归属运营商。',
example: '13812345678',
extract: function (text) {
return collect(/(?<!\d)1[3-9]\d{9}(?!\d)/g, text);
}},
{ id: 'landline', name: '固定电话',
desc: '区号-号码格式，如 010-12345678、0755-1234567。',
example: '010-12345678',
extract: function (text) {
return collect(/(?<!\d)0\d{2,3}-\d{7,8}(?!\d)/g, text);
}},
{ id: 'url', name: '链接',
desc: 'http／https 链接，尾部句号、逗号等标点不计入链接。无协议的裸域名不提取。',
example: 'https://example.com/order/2026-10-26',
extract: function (text) {
var raw = collect(/https?:\/\/[^\s<>"'）)\]}]+/g, text);
return raw.map(function (m) {
var v = trimLink(m.value);
return { value: v, start: m.start, end: m.start + v.length};
}).filter(function (m) { return m.value.length > 0;});
}},
{ id: 'date', name: '日期',
desc: 'YYYY-MM-DD、YYYY/MM/DD、YYYY年MM月DD日，月份与日期须真实存在。',
example: '2026-10-26',
extract: function (text) {
var out = [];
collect(/(?<!\d)(\d{4})([-/])(\d{2})\2(\d{2})(?!\d)/g, text, function (it) {
return isValidDateParts(+it.groups[0], +it.groups[2], +it.groups[3]);
}).forEach(function (m) { out.push(m);});
collect(/(?<!\d)(\d{4})年(\d{1,2})月(\d{1,2})日(?!\d)/g, text, function (it) {
return isValidDateParts(+it.groups[0], +it.groups[1], +it.groups[2]);
}).forEach(function (m) { out.push(m);});
return out;
}},
{ id: 'time', name: '时间',
desc: 'HH:MM 或 HH:MM:SS，小时 00–23、分与秒 00–59。',
example: '14:30:00',
extract: function (text) {
return collect(/(?<!\d)(\d{2}):(\d{2})(?::(\d{2}))?(?!\d)/g, text, function (it) {
var h = +it.groups[0], mi = +it.groups[1], s = it.groups[2] == null? 0: +it.groups[2];
return h <= 23 && mi <= 59 && s <= 59;
});
}},
{ id: 'ipv4', name: 'IPv4',
desc: '四段点分十进制地址，每段 0–255。',
example: '192.168.1.1',
extract: function (text) {
return collect(/(?<!\d)(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?!\d)(?!\.\d)/g, text, function (it) {
return it.groups.every(function (g) { return +g <= 255;});
});
}},
{ id: 'amount', name: '金额',
desc: '¥／￥／$ 前缀或「元」后缀，含千分位逗号与最多 2 位小数。',
example: '¥1,234.56',
extract: function (text) {
var out = collect(/(?:¥|￥|\$)\s*\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?(?![\d.,])/g, text);
var suffixed = collect(/(?<!\d)\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?元(?!\d)/g, text);
suffixed.forEach(function (m) {
var overlap = out.some(function (o) { return m.start < o.end && o.start < m.end;});
if (!overlap) out.push(m);
});
return out;
}}
];

function overlaps(a, b) { return a.start < b.end && b.start < a.end;}

/* 自定义正则：不含分隔符，默认全局匹配；非法时返回中文报错，不抛异常。 */
function validateCustom(name, pattern) {
if (!name ||!String(name).trim()) return { ok: false, error: '请填写自定义规则名称'};
if (!pattern ||!String(pattern).trim()) return { ok: false, error: '请填写正则表达式'};
try {
new RegExp(pattern, 'g');
} catch (e) {
return { ok: false, error: '正则表达式非法：' + e.message + '，请检查括号、量词与转义是否成对'};
}
return { ok: true, error: ''};
}

function extractCustom(text, pattern) {
var out = [];
var re;
try { re = new RegExp(pattern, 'g');} catch (e) { return out;}
var m, guard = 0;
while ((m = re.exec(text))!== null && guard < 5000) {
guard++;
if (m[0] === '') { re.lastIndex++; continue;}
out.push({ value: m[0], start: m.index, end: m.index + m[0].length});
if (re.lastIndex === m.index) re.lastIndex++;
}
return out;
}

/* 提取全部规则。清单里各规则独立列出；高亮区间按规则顺序归属在先者：
* 内置规则按上表顺序，自定义规则按添加顺序；后出现的重叠区间高亮跳过。 */
function extractAll(text, enabledIds, customRules) {
text = String(text == null? '': text);
var entries = [];
BUILTIN_RULES.forEach(function (r) {
if (!enabledIds || enabledIds.indexOf(r.id)!== -1) {
entries.push({ id: r.id, name: r.name, builtin: true, rule: r});
}
});
(customRules || []).forEach(function (c) {
entries.push({ id: 'custom:' + c.name, name: c.name, builtin: false, custom: c});
});
var claimed = [];
return entries.map(function (entry) {
var raw = entry.builtin? entry.rule.extract(text): extractCustom(text, entry.custom.pattern);
raw.sort(function (a, b) { return a.start - b.start || b.end - a.end;});
var kept = [];
raw.forEach(function (m) {
if (!kept.some(function (k) { return overlaps(m, k);})) kept.push(m);
});
var matches = kept.map(function (m) {
var hl =!claimed.some(function (c) { return overlaps(m, c);});
if (hl) claimed.push(m);
return { value: m.value, start: m.start, end: m.end, highlighted: hl};
});
return { id: entry.id, name: entry.name, builtin: entry.builtin, matches: matches};
});
}

/* 分组清单：去重开时同值只列一次附次数；关时按出现顺序全列。 */
function groupItems(matches, dedupe) {
if (!dedupe) return matches.map(function (m) { return { value: m.value, count: 1};});
var order = [];
var map = {};
matches.forEach(function (m) {
if (!map[m.value]) { map[m.value] = { value: m.value, count: 0}; order.push(map[m.value]);}
map[m.value].count++;
});
return order;
}

function visibleGroups(groups, filterId) {
if (!filterId) return groups;
return groups.filter(function (g) { return g.id === filterId;});
}

function buildListText(groups, dedupe, filterId) {
var lines = [];
visibleGroups(groups, filterId).forEach(function (g) {
var items = groupItems(g.matches, dedupe);
lines.push('（共' + items.length + '条）');
items.forEach(function (it) {
lines.push(it.count > 1? it.value + ' ×' + it.count: it.value);
});
lines.push('');
});
while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
return lines.join('\n');
}

function csvCell(v) {
v = String(v);
if (/[",\n]/.test(v)) return '"' + v.replace(/"/g, '""') + '"';
return v;
}

function buildCsv(groups, dedupe, filterId) {
var lines = ['规则,值,出现次数'];
visibleGroups(groups, filterId).forEach(function (g) {
groupItems(g.matches, dedupe).forEach(function (it) {
lines.push(csvCell(g.name) + ',' + csvCell(it.value) + ',' + it.count);
});
});
return lines.join('\n');
}

/* 高亮 HTML：先转义原文，再把归属在先规则的区间包进 mark；筛选时只留该组。 */
function buildHighlightHtml(text, groups, filterId) {
text = String(text == null? '': text);
var segs = [];
visibleGroups(groups, filterId).forEach(function (g, gi) {
var color = RULE_COLORS[(groups.indexOf(g)) % RULE_COLORS.length];
g.matches.forEach(function (m) {
if (m.highlighted) segs.push({ start: m.start, end: m.end, name: g.name, color: color});
});
});
segs.sort(function (a, b) { return a.start - b.start;});
var html = '';
var pos = 0;
segs.forEach(function (s) {
if (s.start < pos) return;
html += escapeHtml(text.slice(pos, s.start));
html += '<mark style="background:' + s.color + ';border-radius:3px;padding:0 2px;" title="' +
escapeHtml(s.name) + '">' + escapeHtml(text.slice(s.start, s.end)) + '</mark>';
pos = s.end;
});
html += escapeHtml(text.slice(pos));
return html;
}

var EXAMPLES = [
{ label: '聊天记录',
text: 'Hi，我是客服小王，邮箱 wang@example.com，手机 13812345678，备用座机 010-12345678；' +
'订单金额 ¥1,234.56，详情见 https://example.com/order/2026-10-26 ，活动截止 2026-10-26 18:30，' +
'咨询请发邮件到 help@example.com，重复一次 13812345678。'},
{ label: '服务器日志',
text: '2026-10-26 08:15:32 INFO 10.0.0.8 用户 zhang@example.com 登录；' +
'2026-10-26 08:16:01 WARN 192.168.1.100 连接超时，联系 13987654321 或拨打 0755-1234567，' +
'账单 $99.50，文档 https://example.com/docs/log 。'}
];

var api = {
BUILTIN_RULES: BUILTIN_RULES, RULE_COLORS: RULE_COLORS,
escapeHtml: escapeHtml, trimLink: trimLink, isValidDateParts: isValidDateParts,
validateCustom: validateCustom, extractCustom: extractCustom,
extractAll: extractAll, groupItems: groupItems,
buildListText: buildListText, buildCsv: buildCsv,
buildHighlightHtml: buildHighlightHtml, EXAMPLES: EXAMPLES
};
if (typeof module!== 'undefined' && module.exports) module.exports = api;
if (typeof window!== 'undefined') window.TextInfoExtractor = api;

/* ---------- 浏览器绑定（只在有 document 时执行） ---------- */
if (typeof document!== 'undefined') {
var $ = function (id) { return document.getElementById(id);};
var customs = [];
var filterId = null;
var lastGroups = [];
var lastText = '';

function toast(msg) {
var t = $('tie-toast');
if (!t) return;
t.textContent = msg;
t.style.display = 'block';
clearTimeout(t._timer);
t._timer = setTimeout(function () { t.style.display = 'none';}, 3500);
}

function enabledIds() {
return BUILTIN_RULES.filter(function (r) {
var box = $('tie-rule-' + r.id);
return!box || box.checked;
}).map(function (r) { return r.id;});
}

function renderRules() {
var box = $('tie-rules');
if (!box) return;
var html = '';
BUILTIN_RULES.forEach(function (r) {
html += '<label class="tie-rule"><input type="checkbox" id="tie-rule-' + r.id +
'" checked> <button type="button" class="tie-rule-name" data-filter="' + r.id + '">' +
escapeHtml(r.name) + '</button><span class="tie-rule-desc">' + escapeHtml(r.desc) +
' 正例：' + escapeHtml(r.example) + '</span></label>';
});
box.innerHTML = html;
Array.prototype.forEach.call(box.querySelectorAll('input[type=checkbox]'), function (cb) {
cb.addEventListener('change', renderAll);
});
Array.prototype.forEach.call(box.querySelectorAll('.tie-rule-name'), function (btn) {
btn.addEventListener('click', function () {
var id = btn.getAttribute('data-filter');
filterId = (filterId === id)? null: id;
renderAll();
});
});
}

function renderCustoms() {
var box = $('tie-custom-list');
if (!box) return;
if (customs.length === 0) {
box.innerHTML = '<p class="tie-hint">暂无自定义规则。名称与表达式必填；表达式不含分隔符，默认全局匹配。</p>';
return;
}
var html = '';
customs.forEach(function (c, i) {
html += '<div class="tie-custom"><button type="button" class="tie-rule-name" data-filter="custom:' +
escapeHtml(c.name) + '">' + escapeHtml(c.name) + '</button><code>' +
escapeHtml(c.pattern) + '</code><button type="button" class="tie-btn tie-btn-sm" data-del="' +
i + '">删除</button></div>';
});
box.innerHTML = html;
Array.prototype.forEach.call(box.querySelectorAll('[data-del]'), function (btn) {
btn.addEventListener('click', function () {
customs.splice(+btn.getAttribute('data-del'), 1);
renderAll();
});
});
Array.prototype.forEach.call(box.querySelectorAll('.tie-rule-name'), function (btn) {
btn.addEventListener('click', function () {
var id = btn.getAttribute('data-filter');
filterId = (filterId === id)? null: id;
renderAll();
});
});
}

function renderAll() {
var input = $('tie-input');
lastText = input? input.value: '';
var dedupe =!$('tie-dedupe') || $('tie-dedupe').checked;
lastGroups = extractAll(lastText, enabledIds(), customs);
if (filterId && !lastGroups.some(function (g) { return g.id === filterId; })) filterId = null;
renderCustoms();
var filterNote = $('tie-filter-note');
if (filterNote) {
filterNote.textContent = filterId?
('当前只看「' + lastGroups.filter(function (g) { return g.id === filterId;})[0].name +
'」一组，点击该规则名或「清除筛选」恢复全部。'):
'点击任意规则名可只看该组清单与高亮，再点一次恢复全部。';
}
var listBox = $('tie-list');
var hlBox = $('tie-highlight');
if (!lastText.trim()) {
if (listBox) listBox.innerHTML = '<p class="tie-hint">暂无输入：请粘贴文本、读取本地.txt，或载入一组示例。</p>';
if (hlBox) hlBox.textContent = '暂无高亮：请先输入文本。';
return;
}
var shown = visibleGroups(lastGroups, filterId);
var total = 0;
shown.forEach(function (g) { total += groupItems(g.matches, dedupe).length;});
if (listBox) {
var html = '';
shown.forEach(function (g) {
var items = groupItems(g.matches, dedupe);
html += '<div class="tie-group"><div class="tie-group-head"><button type="button" class="tie-rule-name" data-gfilter="' +
g.id + '">' + escapeHtml(g.name) + '</button><span>共 ' + items.length + ' 条</span>' +
'<button type="button" class="tie-btn tie-btn-sm" data-copy-group="' + g.id + '">复制本组</button></div>';
if (items.length === 0) { html += '<p class="tie-hint">本组无命中。</p>';}
else {
html += '<ul class="tie-items">';
items.forEach(function (it) {
html += '<li>' + escapeHtml(it.value) + (it.count > 1? ' <span class="tie-count">×' + it.count + '</span>': '') + '</li>';
});
html += '</ul>';
}
html += '</div>';
});
html += '<p class="tie-hint">共 ' + total + ' 条（按当前去重与筛选口径）。清单里各规则独立列出；高亮里同一区间只归属顺序在先的规则，两处口径差异见真限制第 4 条。</p>';
listBox.innerHTML = html;
Array.prototype.forEach.call(listBox.querySelectorAll('[data-copy-group]'), function (btn) {
btn.addEventListener('click', function () {
copyText(buildListText(lastGroups, dedupe, btn.getAttribute('data-copy-group')));
});
});
Array.prototype.forEach.call(listBox.querySelectorAll('[data-gfilter]'), function (btn) {
btn.addEventListener('click', function () {
var id = btn.getAttribute('data-gfilter');
filterId = (filterId === id)? null: id;
renderAll();
});
});
}
if (hlBox) hlBox.innerHTML = buildHighlightHtml(lastText, lastGroups, filterId);
}

function copyText(text) {
if (!text) { toast('暂无可复制的清单，请先输入文本'); return;}
function fallback() {
try {
var ta = document.createElement('textarea');
ta.value = text;
ta.style.position = 'fixed';
ta.style.opacity = '0';
document.body.appendChild(ta);
ta.focus(); ta.select();
if (document.execCommand('copy')) { toast('已复制到剪贴板');}
else { toast('复制失败，请手动选中清单内容按 Ctrl+C 复制');}
document.body.removeChild(ta);
} catch (e) {
toast('复制失败，请手动选中清单内容按 Ctrl+C 复制');
}
}
if (navigator.clipboard && navigator.clipboard.writeText) {
navigator.clipboard.writeText(text).then(function () {
toast('已复制到剪贴板');
}, fallback);
} else fallback();
}

function download(filename, text, type) {
if (!text) { toast('暂无可下载的清单，请先输入文本'); return;}
var blob = new Blob([text], { type: type + ';charset=utf-8'});
var url = URL.createObjectURL(blob);
var a = document.createElement('a');
a.href = url; a.download = filename;
document.body.appendChild(a); a.click();
document.body.removeChild(a);
setTimeout(function () { URL.revokeObjectURL(url);}, 500);
toast('已下载 ' + filename);
}

function bindPage() {
renderRules();
var input = $('tie-input');
if (input) input.addEventListener('input', renderAll);
var dedupe = $('tie-dedupe');
if (dedupe) dedupe.addEventListener('change', renderAll);
var clearFilter = $('tie-clear-filter');
if (clearFilter) clearFilter.addEventListener('click', function () { filterId = null; renderAll();});
var clearBtn = $('tie-clear');
if (clearBtn) clearBtn.addEventListener('click', function () {
if (input) input.value = '';
filterId = null;
renderAll();
});
Array.prototype.forEach.call(document.querySelectorAll('[data-example]'), function (btn) {
btn.addEventListener('click', function () {
var ex = EXAMPLES[+btn.getAttribute('data-example')];
if (ex && input) { input.value = ex.text; filterId = null; renderAll(); toast('已载入示例：' + ex.label);}
});
});
var fileInput = $('tie-file');
if (fileInput) fileInput.addEventListener('change', function () {
var f = fileInput.files && fileInput.files[0];
if (!f) return;
var reader = new FileReader();
reader.onload = function () {
if (input) input.value = String(reader.result || '');
filterId = null;
renderAll();
toast('已读取本地文件：' + f.name + '（未上传）');
};
reader.onerror = function () { toast('读取本地文件失败，请重试');};
reader.readAsText(f);
});
var addBtn = $('tie-custom-add');
if (addBtn) addBtn.addEventListener('click', function () {
var nameEl = $('tie-custom-name');
var patEl = $('tie-custom-pattern');
var errEl = $('tie-custom-error');
var v = validateCustom(nameEl? nameEl.value: '', patEl? patEl.value: '');
if (!v.ok) {
if (errEl) { errEl.textContent = v.error; errEl.style.display = 'block';}
else toast(v.error);
renderAll();
return;
}
if (errEl) errEl.style.display = 'none';
customs.push({ name: nameEl.value.trim(), pattern: patEl.value.trim()});
if (nameEl) nameEl.value = '';
if (patEl) patEl.value = '';
renderAll();
toast('已添加自定义规则：' + customs[customs.length - 1].name);
});
var copyAll = $('tie-copy-all');
if (copyAll) copyAll.addEventListener('click', function () {
var dedupeOn =!$('tie-dedupe') || $('tie-dedupe').checked;
copyText(buildListText(lastGroups, dedupeOn, filterId));
});
var dlTxt = $('tie-download-txt');
if (dlTxt) dlTxt.addEventListener('click', function () {
var dedupeOn =!$('tie-dedupe') || $('tie-dedupe').checked;
download('text-info-extract.txt', buildListText(lastGroups, dedupeOn, filterId), 'text/plain');
});
var dlCsv = $('tie-download-csv');
if (dlCsv) dlCsv.addEventListener('click', function () {
var dedupeOn =!$('tie-dedupe') || $('tie-dedupe').checked;
download('text-info-extract.csv', buildCsv(lastGroups, dedupeOn, filterId), 'text/csv');
});
renderAll();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindPage);
else bindPage();
}
})();
