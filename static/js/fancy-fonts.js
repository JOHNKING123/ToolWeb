/* 花体字生成器 - 纯前端 Unicode 字符映射逻辑
* 全部码位已用 Python unicodedata 校验为已分配字符，无未分配空洞。
* 中文/emoji 等非拉丁字符保持原样输出，不乱码。 */
(function () {
'use strict';

/* ---------- 通用工具 ---------- */
function $(id) { return document.getElementById(id);}

function esc(s) {
return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
.replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function toast(msg) {
var el = document.createElement('div');
el.textContent = msg;
el.style.cssText = 'position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);' +
'background:#111827;color:#fff;padding:.6rem 1.2rem;border-radius:.5rem;z-index:9999;font-size:.9rem;' +
'max-width:86vw;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
document.body.appendChild(el);
setTimeout(function () { if (el.parentNode) document.body.removeChild(el);}, 1600);
}

function copyText(t, okMsg) {
if (navigator.clipboard) {
navigator.clipboard.writeText(t).then(
function () { toast(okMsg || '已复制');},
function () { toast('复制失败，请手动复制');});
} else {
var ta = document.createElement('textarea');
ta.value = t; document.body.appendChild(ta); ta.select();
try { document.execCommand('copy'); toast(okMsg || '已复制');}
catch (e) { toast('复制失败，请手动复制');}
document.body.removeChild(ta);
}
}

function cp(n) { return String.fromCodePoint(n);}

/* ---------- 风格映射 ---------- */

/* 连续区间风格：capsBase/lowerBase/digitsBase 为 'A'/'a'/'0' 对应的码位，
* exc 为例外映射（部分字母历史上已占用 Letterlike Symbols 区）。 */
function rangeStyle(capsBase, lowerBase, digitsBase, exc) {
exc = exc || {};
return function (ch) {
if (Object.prototype.hasOwnProperty.call(exc, ch)) return cp(exc[ch]);
var code = ch.charCodeAt(0);
if (code >= 65 && code <= 90 && capsBase) return cp(capsBase + code - 65);
if (code >= 97 && code <= 122 && lowerBase) return cp(lowerBase + code - 97);
if (code >= 48 && code <= 57 && digitsBase) return cp(digitsBase + code - 48);
return ch;
};
}

/* 手写花体：区块不连续，用显式映射表（已逐个校验） */
var SCRIPT_MAP = {
A: 0x1D49C, B: 0x212C, C: 0x1D49E, D: 0x1D49F, E: 0x2130, F: 0x2131,
G: 0x1D4A2, H: 0x210B, I: 0x2110, J: 0x1D4A5, K: 0x1D4A6, L: 0x2112,
M: 0x2133, N: 0x1D4A9, O: 0x1D4AA, P: 0x1D4AB, Q: 0x1D4AC, R: 0x211B,
S: 0x1D4AE, T: 0x1D4AF, U: 0x1D4B0, V: 0x1D4B1, W: 0x1D4B2, X: 0x1D4B3,
Y: 0x1D4B4, Z: 0x1D4B5,
a: 0x1D4B6, b: 0x1D4B7, c: 0x1D4B8, d: 0x1D4B9, e: 0x212F, f: 0x1D4BB,
g: 0x210A, h: 0x1D4BD, i: 0x1D4BE, j: 0x1D4BF, k: 0x1D4C0, l: 0x1D4C1,
m: 0x1D4C2, n: 0x1D4C3, o: 0x2134, p: 0x1D4C5, q: 0x1D4C6, r: 0x1D4C7,
s: 0x1D4C8, t: 0x1D4C9, u: 0x1D4CA, v: 0x1D4CB, w: 0x1D4CC, x: 0x1D4CD,
y: 0x1D4CE, z: 0x1D4CF
};
function scriptStyle(ch) {
return Object.prototype.hasOwnProperty.call(SCRIPT_MAP, ch)? cp(SCRIPT_MAP[ch]): ch;
}

/* 气泡字：ⒶⒷⓐⓑ①② */
function circledStyle(ch) {
var code = ch.charCodeAt(0);
if (code >= 65 && code <= 90) return cp(0x24B6 + code - 65);
if (code >= 97 && code <= 122) return cp(0x24D0 + code - 97);
if (code >= 49 && code <= 57) return cp(0x2460 + code - 49);
if (ch === '0') return cp(0x24EA);
return ch;
}

/* 方框字：🄰🄱（仅大写；小写先转大写） */
function squaredStyle(ch) {
var code = ch.charCodeAt(0);
if (code >= 97 && code <= 122) code -= 32;
if (code >= 65 && code <= 90) return cp(0x1F130 + code - 65);
return ch;
}

/* 全宽字：ＡＢａｂ１２（空格转为全角空格） */
function fullwidthStyle(ch) {
var code = ch.charCodeAt(0);
if (code >= 65 && code <= 90) return cp(0xFF21 + code - 65);
if (code >= 97 && code <= 122) return cp(0xFF41 + code - 97);
if (code >= 48 && code <= 57) return cp(0xFF10 + code - 48);
if (ch === ' ') return cp(0x3000);
return ch;
}

/* 小型大写：ᴀʙᴄ（先转大写再查表） */
var SMALLCAPS = {
A: 'ᴀ', B: 'ʙ', C: 'ᴄ', D: 'ᴅ', E: 'ᴇ', F: 'ғ', G: 'ɢ', H: 'ʜ',
I: 'ɪ', J: 'ᴊ', K: 'ᴋ', L: 'ʟ', M: 'ᴍ', N: 'ɴ', O: 'ᴏ', P: 'ᴘ',
Q: 'ǫ', R: 'ʀ', S: 's', T: 'ᴛ', U: 'ᴜ', V: 'ᴠ', W: 'ᴡ', X: 'x',
Y: 'ʏ', Z: 'ᴢ'
};
function smallcapsStyle(ch) {
var up = ch.toUpperCase();
return Object.prototype.hasOwnProperty.call(SMALLCAPS, up)? SMALLCAPS[up]: ch;
}

/* 翻转镜像：先转小写查表再整体反转 */
var FLIP_MAP = {
a: 'ɐ', b: 'q', c: 'ɔ', d: 'p', e: 'ǝ', f: 'ɟ', g: 'ƃ', h: 'ɥ',
i: 'ı', j: 'ɾ', k: 'ʞ', l: 'ן', m: 'ɯ', n: 'u', o: 'o', p: 'd',
q: 'b', r: 'ɹ', s: 's', t: 'ʇ', u: 'n', v: 'ʌ', w: 'ʍ', x: 'x',
y: 'ʎ', z: 'z',
'0': '0', '1': 'Ɩ', '2': 'ᄅ', '3': 'Ɛ', '4': 'ᔭ', '5': 'ϛ',
'6': '9', '7': 'ㄥ', '8': '8', '9': '6'
};
function flipTransform(text) {
var mapped = [];
Array.from(text.toLowerCase()).forEach(function (ch) {
mapped.push(Object.prototype.hasOwnProperty.call(FLIP_MAP, ch)? FLIP_MAP[ch]: ch);
});
return mapped.reverse().join('');
}

/* 组合字符风格：删除线 U+0336 / 下划线 U+0332 */
function combiningStyle(mark) {
return function (text) {
var out = [];
Array.from(text).forEach(function (ch) {
out.push(ch === ' ' || ch === '\n'? ch: ch + mark);
});
return out.join('');
};
}

/* 按字符映射的通用转换（处理代理对） */
function mapChars(text, fn) {
var out = [];
Array.from(text).forEach(function (ch) { out.push(fn(ch));});
return out.join('');
}

/* ---------- 18 种风格 ---------- */
var STYLES = [
{ id: 'bold', name: '粗体', fn: function (t) { return mapChars(t, rangeStyle(0x1D400, 0x1D41A, 0x1D7CE));}},
{ id: 'italic', name: '斜体', fn: function (t) { return mapChars(t, rangeStyle(0x1D434, 0x1D44E, null, { h: 0x210E}));}},
{ id: 'bolditalic', name: '粗斜体', fn: function (t) { return mapChars(t, rangeStyle(0x1D468, 0x1D482, 0x1D7CE));}},
{ id: 'fraktur', name: '哥特体', fn: function (t) { return mapChars(t, rangeStyle(0x1D504, 0x1D51E, null, { C: 0x212D, H: 0x210C, I: 0x2111, R: 0x211C, Z: 0x2128}));}},
{ id: 'boldfraktur', name: '粗哥特体', fn: function (t) { return mapChars(t, rangeStyle(0x1D56C, 0x1D586, null));}},
{ id: 'doublestruck', name: '双线体', fn: function (t) { return mapChars(t, rangeStyle(0x1D538, 0x1D552, 0x1D7D8, { C: 0x2102, H: 0x210D, N: 0x2115, P: 0x2119, Q: 0x211A, R: 0x211D, Z: 0x2124}));}},
{ id: 'script', name: '手写花体', fn: function (t) { return mapChars(t, scriptStyle);}},
{ id: 'boldscript', name: '粗花体', fn: function (t) { return mapChars(t, rangeStyle(0x1D4D0, 0x1D4EA, null));}},
{ id: 'monospace', name: '等宽体', fn: function (t) { return mapChars(t, rangeStyle(0x1D670, 0x1D68A, 0x1D7F6));}},
{ id: 'sansbold', name: '无衬线粗体', fn: function (t) { return mapChars(t, rangeStyle(0x1D5D4, 0x1D5EE, 0x1D7EC));}},
{ id: 'sansitalic', name: '无衬线斜体', fn: function (t) { return mapChars(t, rangeStyle(0x1D608, 0x1D622, null));}},
{ id: 'circled', name: '气泡字', fn: function (t) { return mapChars(t, circledStyle);}},
{ id: 'squared', name: '方框字', fn: function (t) { return mapChars(t, squaredStyle);}},
{ id: 'fullwidth', name: '全宽字', fn: function (t) { return mapChars(t, fullwidthStyle);}},
{ id: 'smallcaps', name: '小型大写', fn: function (t) { return mapChars(t, smallcapsStyle);}},
{ id: 'flip', name: '翻转镜像', fn: flipTransform},
{ id: 'strike', name: '删除线', fn: combiningStyle('̶')},
{ id: 'underline', name: '下划线', fn: combiningStyle('̲')}
];

/* ---------- 昵称符号装饰模板 ---------- */
var DECOS = [
{ name: '花瓣框', wrap: function (t) { return '꧁༺' + t + '༻꧂';}},
{ name: '藏文框', wrap: function (t) { return '༺' + t + '༻';}},
{ name: '黑方框', wrap: function (t) { return '\u3010' + t + '\u3011';}},
{ name: '白方框', wrap: function (t) { return '『' + t + '』';}},
{ name: '星星', wrap: function (t) { return '★' + t + '★';}},
{ name: '樱花', wrap: function (t) { return '✿' + t + '✿';}},
{ name: '音符', wrap: function (t) { return '♪' + t + '♪';}},
{ name: '花朵', wrap: function (t) { return '๑' + t + '๑';}},
{ name: '颜文字', wrap: function (t) { return '(｡･ω･｡)' + t + '(｡･ω･｡)';}},
{ name: '箭头', wrap: function (t) { return '➹' + t + '➹';}},
{ name: '翅膀', wrap: function (t) { return '꒰' + t + '꒱';}},
{ name: '闪光', wrap: function (t) { return '✧' + t + '✧';}}
];

/* ---------- 渲染 ---------- */
var PLACEHOLDER = '在这里输入文字，上方 18 种风格将实时生成…';
var lastInput = '';

function renderStyles(text) {
var html = '';
STYLES.forEach(function (st, i) {
var out = text? st.fn(text): PLACEHOLDER;
html += '<div class="ff-row">' +
'<div class="ff-row-head"><span class="ff-name">' + esc(st.name) + '</span>' +
'<button class="btn btn-secondary ff-copy" data-kind="style" data-idx="' + i + '">' +
'<i class="material-icons">content_copy</i>复制</button></div>' +
'<div class="ff-out" id="ff-out-' + i + '">' + esc(out) + '</div></div>';
});
$('ff-styles').innerHTML = html;
}

function renderDecos(text) {
var html = '';
DECOS.forEach(function (d, i) {
var out = text? d.wrap(text): PLACEHOLDER;
html += '<div class="ff-deco">' +
'<div class="ff-deco-name">' + esc(d.name) + '</div>' +
'<div class="ff-out ff-deco-out">' + esc(out) + '</div>' +
'<button class="btn btn-secondary ff-copy" data-kind="deco" data-idx="' + i + '">' +
'<i class="material-icons">content_copy</i>复制</button></div>';
});
$('ff-decos').innerHTML = html;
}

function render() {
var text = $('ff-input').value;
lastInput = text;
$('ff-count').textContent = '已输入 ' + Array.from(text).length + ' 个字符';
renderStyles(text);
renderDecos(text);
}

function doCopy(kind, idx) {
var text = lastInput;
if (!text) { toast('请先输入文字'); return;}
var out, label;
if (kind === 'style') {
out = STYLES[idx].fn(text);
label = STYLES[idx].name;
} else {
out = DECOS[idx].wrap(text);
label = DECOS[idx].name;
}
copyText(out, '已复制' + label + '：' + (out.length > 24? Array.from(out).slice(0, 24).join('') + '…': out));
}

/* ---------- 初始化 ---------- */
document.addEventListener('DOMContentLoaded', function () {
$('ff-input').addEventListener('input', render);
$('ff-clear').addEventListener('click', function () {
$('ff-input').value = '';
render();
$('ff-input').focus();
});
$('ff-sample').addEventListener('click', function () {
$('ff-input').value = 'Hello World 123';
render();
});
document.addEventListener('click', function (e) {
var btn = e.target.closest? e.target.closest('.ff-copy'): null;
if (btn) doCopy(btn.getAttribute('data-kind'), parseInt(btn.getAttribute('data-idx'), 10));
});
render();
});

/* 暴露给自测 */
window.__ffTest = { styles: STYLES, decos: DECOS};
})();
