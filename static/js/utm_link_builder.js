/* UTM 链接生成器：给推广链接拼 utm_source/medium/campaign/term/content。
* 锚点：https://example.com/page + wechat/social/summer_sale →
* https://example.com/page?utm_source=wechat&utm_medium=social&utm_campaign=summer_sale；
* 已有查询串用 & 续接、参数插在 #hash 之前、值按 encodeURIComponent 编码、
* 空选填参数省略、参数固定顺序 source→medium→campaign→term→content。
* 导出：window.UtmLinkBuilder（浏览器）与 module.exports（node 测试，同步导出）。
*/
(function (global) {
'use strict';

function fail(field, message) {
var e = new Error(message);
e.field = field;
return e;
}

function clone(v) { return JSON.parse(JSON.stringify(v)); }

var MAX_PARAM_LEN = 200;
var UTM_FIELDS = ['source', 'medium', 'campaign', 'term', 'content'];
var REQUIRED_FIELDS = ['source', 'medium', 'campaign'];

/* ---------------- 常用渠道预设（每组只填 source + medium，campaign 按活动填） ---------------- */
var PRESETS = [
{ id: 'wechat-article', name: '微信公众号文章', source: 'wechat', medium: 'social', note: '公众号图文、菜单栏、自动回复里放的推广链接' },
{ id: 'wechat-moments', name: '微信朋友圈', source: 'wechat', medium: 'moments', note: '朋友圈文案配的落地页链接，区分于公众号渠道' },
{ id: 'weibo', name: '微博', source: 'weibo', medium: 'social', note: '微博正文、置顶、粉丝头条里放的推广链接' },
{ id: 'douyin', name: '抖音', source: 'douyin', medium: 'short_video', note: '抖音短视频、主页简介、评论区置顶的落地页' },
{ id: 'xiaohongshu', name: '小红书', source: 'xiaohongshu', medium: 'social', note: '小红书笔记、合集、主页里放的推广链接' },
{ id: 'zhihu', name: '知乎', source: 'zhihu', medium: 'social', note: '知乎回答、文章、专栏里放的推广链接' },
{ id: 'bilibili', name: '哔哩哔哩', source: 'bilibili', medium: 'video', note: 'B站视频简介、评论区置顶、动态里放的落地页' },
{ id: 'email', name: '邮件 newsletter', source: 'email', medium: 'email', note: '邮件订阅、EDM 群发里的推广链接' },
{ id: 'sms', name: '短信', source: 'sms', medium: 'sms', note: '短信群发里的短链落地页，留意短信字数与链接长度' },
{ id: 'baidu', name: '百度搜索广告', source: 'baidu', medium: 'cpc', note: '百度推广、搜索广告落地页，与自然搜索流量区分' },
{ id: 'google-ads', name: 'Google Ads', source: 'google', medium: 'cpc', note: 'Google 搜索/展示广告落地页，与自然搜索流量区分' }
];

function listPresets() { return clone(PRESETS); }

function getPresetById(id) {
if (typeof id !== 'string' || !id) throw fail('id', '预设 id 须为非空字符串');
for (var i = 0; i < PRESETS.length; i++) {
if (PRESETS[i].id === id) return clone(PRESETS[i]);
}
throw fail('id', '不存在的预设 id：' + id);
}

/* 基础链接：去首尾空白，须为 http(s) URL，否则抛错 err.field='baseUrl'。 */
function normalizeBaseUrl(url) {
if (typeof url !== 'string') throw fail('baseUrl', '基础链接须为字符串');
var s = url.trim();
if (!s) throw fail('baseUrl', '基础链接不能为空');
var u;
try { u = new URL(s); } catch (e) { throw fail('baseUrl', '基础链接不是有效的 URL'); }
if (u.protocol !== 'http:' && u.protocol !== 'https:') throw fail('baseUrl', '基础链接须为 http(s) 链接');
return u.toString();
}

/* UTM 五参数：source/medium/campaign 必填非空，term/content 选填缺省 ''；
* 值须为字符串且长度 ≤200，否则 err.field 为对应字段名。 */
function normalizeParams(params) {
if (!params || typeof params !== 'object' || Array.isArray(params)) throw fail('source', 'UTM 参数须为对象');
var out = {};
UTM_FIELDS.forEach(function (f) {
var v = params[f];
if (v === undefined || v === null) {
if (REQUIRED_FIELDS.indexOf(f) !== -1) throw fail(f, 'utm_' + f + ' 为必填项');
out[f] = '';
return;
}
if (typeof v !== 'string') throw fail(f, 'utm_' + f + ' 须为字符串');
var t = v.trim();
if (REQUIRED_FIELDS.indexOf(f) !== -1 && !t) throw fail(f, 'utm_' + f + ' 为必填项');
if (t.length > MAX_PARAM_LEN) throw fail(f, 'utm_' + f + ' 最长 ' + MAX_PARAM_LEN + ' 个字符');
out[f] = t;
});
return out;
}

function splitHash(s) {
var i = s.indexOf('#');
if (i === -1) return { head: s, hash: '' };
return { head: s.slice(0, i), hash: s.slice(i) };
}

/* 拼接：保留原有查询串（& 续接）、参数插 #hash 前、值 encodeURIComponent 编码、
* 空选填省略、固定顺序 source→medium→campaign→term→content。 */
function buildTaggedUrl(baseUrl, params) {
var base = normalizeBaseUrl(baseUrl);
var p = normalizeParams(params);
var parts = splitHash(base);
var head = parts.head;
var q = '';
var qi = head.indexOf('?');
var baseHead = head;
if (qi !== -1) {
baseHead = head.slice(0, qi);
q = head.slice(qi + 1);
}
var utm = [];
UTM_FIELDS.forEach(function (f) {
if (p[f]) utm.push('utm_' + f + '=' + encodeURIComponent(p[f]));
});
var query = utm.join('&');
if (q) query = q + '&' + query;
return baseHead + '?' + query + parts.hash;
}

function decodePart(s) {
try { return decodeURIComponent(s.replace(/\+/g, ' ')); } catch (e) { return s; }
}

/* 解析：utm_* 进 params（缺失为 ''），其余查询参数原样进 otherParams；
* #hash 不计入；url 非法 err.field='url'。 */
function parseTaggedUrl(url) {
if (typeof url !== 'string') throw fail('url', '链接须为字符串');
var s = url.trim();
if (!s) throw fail('url', '链接不能为空');
var parts = splitHash(s);
var head = parts.head;
var qi = head.indexOf('?');
var basePart = qi === -1 ? head : head.slice(0, qi);
var query = qi === -1 ? '' : head.slice(qi + 1);
var baseUrl;
try { baseUrl = normalizeBaseUrl(basePart); } catch (e) { throw fail('url', '链接不是有效的 http(s) URL'); }
var params = { source: '', medium: '', campaign: '', term: '', content: '' };
var otherParams = [];
if (query) {
query.split('&').forEach(function (seg) {
if (!seg) return;
var eq = seg.indexOf('=');
var rawKey = eq === -1 ? seg : seg.slice(0, eq);
var rawVal = eq === -1 ? '' : seg.slice(eq + 1);
var key = decodePart(rawKey);
var value = decodePart(rawVal);
var lower = key.toLowerCase();
if (lower === 'utm_source' || lower === 'utm_medium' || lower === 'utm_campaign' ||
lower === 'utm_term' || lower === 'utm_content') {
params[lower.slice(4)] = value;
} else {
otherParams.push({ key: key, value: value });
}
});
}
return { baseUrl: baseUrl, params: params, otherParams: otherParams };
}

var api = {
listPresets: listPresets,
getPresetById: getPresetById,
normalizeBaseUrl: normalizeBaseUrl,
normalizeParams: normalizeParams,
buildTaggedUrl: buildTaggedUrl,
parseTaggedUrl: parseTaggedUrl
};

if (typeof module !== 'undefined' && module.exports) module.exports = api;
global.UtmLinkBuilder = api;

/* ---------- 浏览器端 UI：仅在有 DOM 时绑定 ---------- */
if (typeof document !== 'undefined') {

function $(id) { return document.getElementById(id); }

function escHtml(s) {
return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
.replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function toast(msg) {
var el = $('ulb-toast');
el.textContent = msg; el.classList.add('show');
clearTimeout(el._t);
el._t = setTimeout(function () { el.classList.remove('show'); }, 2200);
}

function showError(msg) {
var el = $('ulb-error');
if (!msg) { el.style.display = 'none'; el.textContent = ''; return; }
el.style.display = 'block'; el.textContent = msg;
}

function copyText(text, done) {
if (navigator.clipboard && navigator.clipboard.writeText) {
navigator.clipboard.writeText(text).then(function () { done(true); }, function () { fallback(); });
} else { fallback(); }
function fallback() {
var ta = document.createElement('textarea');
ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
document.body.appendChild(ta); ta.select();
var ok = false;
try { ok = document.execCommand('copy'); } catch (e) {}
document.body.removeChild(ta); done(ok);
}
}

function readParams() {
return {
source: $('ulb-source').value,
medium: $('ulb-medium').value,
campaign: $('ulb-campaign').value,
term: $('ulb-term').value,
content: $('ulb-content').value
};
}

function fillParams(p) {
$('ulb-source').value = p.source || '';
$('ulb-medium').value = p.medium || '';
$('ulb-campaign').value = p.campaign || '';
$('ulb-term').value = p.term || '';
$('ulb-content').value = p.content || '';
}

function renderOtherParams(list) {
var box = $('ulb-other');
if (!list || !list.length) { box.innerHTML = ''; return; }
var html = '<div class="ulb-other-title">其余查询参数（已保留，未丢失）：</div><ul>';
list.forEach(function (o) {
html += '<li><code>' + escHtml(o.key) + '</code> = ' + escHtml(o.value) + '</li>';
});
box.innerHTML = html + '</ul>';
}

function doGenerate() {
showError('');
var base = $('ulb-base').value;
try {
var out = buildTaggedUrl(base, readParams());
$('ulb-output').value = out;
renderOtherParams([]);
toast('已生成 tagged 链接');
} catch (e) {
$('ulb-output').value = '';
toast(e.message || '生成失败');
showError(e.message || '生成失败');
}
}

function doParseBackfill() {
showError('');
var raw = $('ulb-paste').value.trim();
if (!raw) { toast('请先粘贴一条已带 utm 参数的链接'); return; }
try {
var r = parseTaggedUrl(raw);
var hashIdx = raw.indexOf('#');
$('ulb-base').value = r.baseUrl + (hashIdx === -1 ? '' : raw.slice(hashIdx));
fillParams(r.params);
renderOtherParams(r.otherParams);
$('ulb-output').value = '';
toast('已回填表单' + (r.otherParams.length ? '，其余 ' + r.otherParams.length + ' 个参数见下方' : ''));
} catch (e) {
toast(e.message || '解析失败');
showError(e.message || '解析失败');
}
}

document.addEventListener('DOMContentLoaded', function () {
/* 预设 chips：一键填 source + medium */
var wrap = $('ulb-presets');
listPresets().forEach(function (p) {
var b = document.createElement('button');
b.type = 'button';
b.className = 'ulb-chip';
b.title = p.note;
b.textContent = p.name;
b.addEventListener('click', function () {
$('ulb-source').value = p.source;
$('ulb-medium').value = p.medium;
toast('已填入预设：' + p.name + '（source=' + p.source + '，medium=' + p.medium + '）');
});
wrap.appendChild(b);
});

$('ulb-generate-btn').addEventListener('click', doGenerate);
$('ulb-parse-btn').addEventListener('click', doParseBackfill);

$('ulb-copy-btn').addEventListener('click', function () {
var v = $('ulb-output').value;
if (!v) { toast('还没有生成的链接，先点「生成 tagged 链接」'); return; }
copyText(v, function (ok) { toast(ok ? '已复制 tagged 链接' : '复制失败，请手动选择复制'); });
});

$('ulb-clear-btn').addEventListener('click', function () {
$('ulb-base').value = ''; fillParams({ source: '', medium: '', campaign: '', term: '', content: '' });
$('ulb-output').value = ''; $('ulb-paste').value = '';
renderOtherParams([]); showError(''); $('ulb-base').focus();
});

$('ulb-example-btn').addEventListener('click', function () {
$('ulb-base').value = 'https://example.com/page?id=123';
fillParams({ source: 'wechat', medium: 'social', campaign: 'summer_sale', term: '', content: '' });
doGenerate();
});

/* 生成区互链：跳二维码工具 / 清除器 */
var q = $('ulb-to-qrcode');
if (q) q.addEventListener('click', function () {
var v = $('ulb-output').value;
if (!v) { toast('先生成链接，再跳二维码工具生成推广码'); return; }
window.open('/tools/qrcode', '_blank');
});
var c = $('ulb-to-cleaner');
if (c) c.addEventListener('click', function () {
window.open('/tools/url-tracker-cleaner', '_blank');
});
});
}
})(typeof window !== 'undefined' ? window : this);
