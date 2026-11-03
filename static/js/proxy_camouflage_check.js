/* 代理/VPN 伪装自查 - 纯前端工具：
* ① 复用已有后端接口 GET /tools/api/my-ip 取出口 IP＋归属国家＋IP 时区（不新增后端接口）
* ② 浏览器时区 vs IP 时区一致性检查（Intl.DateTimeFormat().resolvedOptions().timeZone）
* ③ 浏览器语言 vs IP 国家一致性检查（启发式语言-国家映射表，页面明示为启发式）
* ④ WebRTC 泄露检测：RTCPeerConnection 收集 ICE candidate，检出数字 IPv4/IPv6 记泄露（红灯）；
* 仅 mDNS.local 时报告「未见真实 IP（现代浏览器 mDNS 保护）」（绿灯＋说明）
* ⑤ 自动化信号：navigator.webdriver
* ⑥ Canvas/WebGL 指纹：Canvas 2D 绘制＋WebGL renderer 字符串做 SHA-256 哈希（展示前 16 位），
* 同会话二次采样对比稳定性
* ⑦ 输出：逐项红绿灯＋穿帮原因中文说明＋综合评分；一键复制报告；零上传
* （除复用 my-ip 接口外无数据外发；WebRTC 检测需向公共 STUN 服务器发起请求以收集 ICE 候选，
* 仅用于获取候选地址，不发送个人信息）
*
* 纯函数契约（浏览器/Node 通用；非法参数抛 Error，err.field 给出字段名，不静默钳制）：
* checkTimezone(ipTimezone, browserTimezone) -> {pass:boolean, detail:string}。
* 两时区字符串归一化（去首尾空白）后比对；空值分别 err.field='ipTimezone'/'browserTimezone'。
* checkLanguage(languages, countryCode) -> {pass:boolean, detail:string, heuristic:true}。
* languages 为浏览器语言数组（取首选语言主子标签）；countryCode 为 2 位 ISO 国家码；
* 启发式映射命中则 pass，否则 warn 口径（pass=false，detail 注明启发式）；
* languages 非法 err.field='languages'，countryCode 非法 err.field='countryCode'。
* parseIceCandidates(candidates) -> {leaked:boolean, ips:string[]}。
* 逐条解析 candidate 行提取 host：数字 IPv4/IPv6 记入 ips（leaked=true）；
*.local（mDNS）主机名过滤不计；无候选/全.local 时 leaked=false；
* candidates 非数组 err.field='candidates'，元素非字符串同 field。
* detectAutomation(webdriverFlag) -> {pass:boolean, detail:string}。
* webdriverFlag 须为布尔值，否则 err.field='webdriverFlag'；
* true=红灯（检测到自动化特征），false=绿灯。
* hashFingerprint(str) -> 64 位十六进制字符串（SHA-256，纯 JS 实现，UTF-8 编码输入）。
* 确定性哈希；空串/非字符串 err.field='input'。
* scoreReport(results) -> {score:number, level:string, summary:string}。
* results 为 [{status}] 数组，status ∈ pass(100)/warn(70)/unknown(50)/fail(0)，
* score 为均值四舍五入；level：≥90 A / ≥75 B / ≥60 C / 否则 D；
* 非法参数 err.field='results'。
*
* 浏览器内运行：文件尾部把 init 挂到 DOMContentLoaded；挂 window.ProxyCamouflageCheck。
* Node 自测：module.exports 暴露纯函数。
*/
(function () {
'use strict';

/* ---------------- 基础工具 ---------------- */

function mkErr(field, msg) {
var e = new Error(msg);
e.field = field;
return e;
}

/* ---------------- 纯函数：时区一致性 ---------------- */

function checkTimezone(ipTimezone, browserTimezone) {
if (typeof ipTimezone!== 'string' || ipTimezone.trim() === '') {
throw mkErr('ipTimezone', '出口 IP 时区必须为非空字符串');
}
if (typeof browserTimezone!== 'string' || browserTimezone.trim() === '') {
throw mkErr('browserTimezone', '浏览器时区必须为非空字符串');
}
var ipTz = ipTimezone.trim();
var brTz = browserTimezone.trim();
if (ipTz === brTz) {
return {pass: true, detail: '浏览器时区与出口 IP 时区一致（' + brTz + '），时区口径未穿帮'};
}
return {
pass: false,
detail: '浏览器时区为 ' + brTz + '，出口 IP 时区为 ' + ipTz + '，两者不一致——网站可据此判断你挂了代理/节点'
};
}

/* ---------------- 纯函数：语言-国家一致性（启发式） ---------------- */

/* 语言主子标签 -> 常见使用国家/地区（ISO 3166-1 alpha-2）。启发式规则，仅供参考。 */
var LANG_COUNTRY_MAP = {
zh: ['CN', 'TW', 'HK', 'MO', 'SG', 'MY'],
en: ['US', 'GB', 'CA', 'AU', 'NZ', 'IE', 'SG', 'IN', 'PH', 'ZA', 'NG', 'KE', 'GH', 'JM'],
ja: ['JP'],
ko: ['KR'],
de: ['DE', 'AT', 'CH', 'LI', 'LU', 'BE'],
fr: ['FR', 'BE', 'CH', 'LU', 'CA', 'MC', 'SN', 'CI'],
es: ['ES', 'MX', 'AR', 'CO', 'CL', 'PE', 'VE', 'EC', 'GT', 'CU', 'BO', 'DO', 'HN', 'PY', 'SV', 'NI', 'CR', 'PA', 'UY'],
pt: ['PT', 'BR', 'AO', 'MZ'],
ru: ['RU', 'BY', 'KZ', 'KG', 'UA', 'AM', 'AZ', 'MD', 'TJ', 'UZ'],
ar: ['SA', 'EG', 'AE', 'QA', 'KW', 'BH', 'OM', 'JO', 'IQ', 'MA', 'DZ', 'TN', 'LB', 'LY', 'SD', 'YE'],
hi: ['IN', 'NP', 'FJ'],
th: ['TH'],
vi: ['VN'],
id: ['ID'],
ms: ['MY', 'SG', 'BN'],
tr: ['TR', 'CY'],
it: ['IT', 'CH', 'SM'],
nl: ['NL', 'BE', 'SR'],
pl: ['PL'],
uk: ['UA'],
sv: ['SE', 'FI'],
no: ['NO'], nb: ['NO'], nn: ['NO'],
da: ['DK'],
fi: ['FI'],
el: ['GR', 'CY'],
he: ['IL'],
fa: ['IR', 'AF', 'TJ'],
ur: ['PK', 'IN'],
bn: ['BD', 'IN'],
ta: ['IN', 'LK', 'SG', 'MY'],
te: ['IN'], kn: ['IN'], ml: ['IN'], mr: ['IN'], gu: ['IN'], pa: ['IN', 'PK'],
ro: ['RO', 'MD'],
hu: ['HU'],
cs: ['CZ'],
sk: ['SK'],
bg: ['BG'],
hr: ['HR', 'BA'],
sr: ['RS', 'BA', 'ME'],
sl: ['SI'],
et: ['EE'],
lv: ['LV'],
lt: ['LT'],
ca: ['ES', 'AD'],
gl: ['ES'], eu: ['ES'],
fil: ['PH'], tl: ['PH'],
sw: ['KE', 'TZ', 'UG'],
ha: ['NG', 'NE'], yo: ['NG'], ig: ['NG'],
am: ['ET'],
ne: ['NP'],
si: ['LK'],
km: ['KH'],
lo: ['LA'],
my: ['MM'],
ka: ['GE'],
hy: ['AM'],
az: ['AZ'],
kk: ['KZ'],
uz: ['UZ'],
ky: ['KG'],
tg: ['TJ'],
mn: ['MN'],
ps: ['AF'],
ku: ['IQ', 'TR', 'SY', 'IR']
};

function checkLanguage(languages, countryCode) {
if (!Array.isArray(languages) || languages.length === 0) {
throw mkErr('languages', '浏览器语言列表必须为非空数组');
}
if (typeof countryCode!== 'string' ||!/^[A-Za-z]{2}$/.test(countryCode.trim())) {
throw mkErr('countryCode', '国家代码必须为 2 位 ISO 字母');
}
var first = String(languages[0]);
var primary = first.split('-')[0].split('_')[0].toLowerCase();
var cc = countryCode.trim().toUpperCase();
var likely = LANG_COUNTRY_MAP[primary];
if (!likely || likely.length === 0) {
return {pass: true, heuristic: true, detail: '语言「' + primary + '」暂无启发式映射数据，不做一致性判定'};
}
if (likely.indexOf(cc)!== -1) {
return {pass: true, heuristic: true, detail: '浏览器首选语言 ' + first + ' 与出口 IP 国家/地区 ' + cc + ' 相符（启发式）'};
}
return {
pass: false,
heuristic: true,
detail: '浏览器首选语言 ' + first + ' 的常见使用国家/地区不含 ' + cc + '（启发式规则，仅供参考：如 en-US 用户身处国外属正常）'
};
}

/* ---------------- 纯函数：ICE candidate 解析 ---------------- */

function isIPv4(s) {
var parts = s.split('.');
if (parts.length!== 4) { return false;}
for (var i = 0; i < 4; i++) {
if (!/^\d{1,3}$/.test(parts[i])) { return false;}
var n = parseInt(parts[i], 10);
if (n < 0 || n > 255) { return false;}
if (parts[i].length > 1 && parts[i].charAt(0) === '0') { return false;}
}
return true;
}

function isIPv6(s) {
// 含冒号且仅由十六进制/冒号/点组成（兼容 IPv4 映射的::ffff:1.2.3.4 形式）
return s.indexOf(':')!== -1 && /^[0-9a-fA-F:.]+$/.test(s);
}

/* 从单条 candidate 行提取 host 字段；
* 标准格式：candidate:<foundation> <component> <proto> <priority> <host> <port> typ <type>... */
function extractCandidateHost(line) {
var m = line.match(/^candidate:\S+\s+\d+\s+\S+\s+\d+\s+(\S+)\s+\d+/);
if (m) { return m[1];}
var parts = line.trim().split(/\s+/);
return parts.length > 0? parts[parts.length - 1]: '';
}

function parseIceCandidates(candidates) {
if (!Array.isArray(candidates)) {
throw mkErr('candidates', 'ICE 候选必须为数组');
}
var ips = [];
for (var i = 0; i < candidates.length; i++) {
var line = candidates[i];
if (typeof line!== 'string') {
throw mkErr('candidates', 'ICE 候选项必须为字符串（下标 ' + i + '）');
}
var host = extractCandidateHost(line);
if (!host) { continue;}
if (/\.local$/i.test(host)) { continue;} // mDNS 保护的主机名：不计泄露
if (isIPv4(host) || isIPv6(host)) {
if (ips.indexOf(host) === -1) { ips.push(host);}
}
}
return {leaked: ips.length > 0, ips: ips};
}

/* ---------------- 纯函数：自动化信号 ---------------- */

function detectAutomation(webdriverFlag) {
if (typeof webdriverFlag!== 'boolean') {
throw mkErr('webdriverFlag', 'webdriver 标志必须为布尔值');
}
if (webdriverFlag) {
return {pass: false, detail: '检测到 navigator.webdriver=true：浏览器正被自动化工具（Selenium/Puppeteer/Playwright 等）控制，网站可直接判定为机器流量'};
}
return {pass: true, detail: '未检测到自动化信号（navigator.webdriver 为 false）'};
}

/* ---------------- 纯函数：SHA-256（纯 JS 实现） ---------------- */

function utf8Bytes(str) {
var out = [];
for (var i = 0; i < str.length; i++) {
var c = str.charCodeAt(i);
if (c < 0x80) {
out.push(c);
} else if (c < 0x800) {
out.push((c >> 6) | 0xC0, (c & 0x3F) | 0x80);
} else if (c >= 0xD800 && c <= 0xDBFF && i + 1 < str.length) {
var lo = str.charCodeAt(i + 1);
if (lo >= 0xDC00 && lo <= 0xDFFF) {
var cp = 0x10000 + ((c - 0xD800) << 10) + (lo - 0xDC00);
out.push((cp >> 18) | 0xF0, ((cp >> 12) & 0x3F) | 0x80, ((cp >> 6) & 0x3F) | 0x80, (cp & 0x3F) | 0x80);
i++;
} else {
out.push((c >> 12) | 0xE0, ((c >> 6) & 0x3F) | 0x80, (c & 0x3F) | 0x80);
}
} else {
out.push((c >> 12) | 0xE0, ((c >> 6) & 0x3F) | 0x80, (c & 0x3F) | 0x80);
}
}
return out;
}

var SHA256_K = [
0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
];

function sha256Hex(str) {
var bytes = utf8Bytes(str);
var bitLen = bytes.length * 8;
bytes.push(0x80);
while (bytes.length % 64!== 56) { bytes.push(0);}
var hi = Math.floor(bitLen / 0x100000000), lo = bitLen >>> 0;
bytes.push((hi >>> 24) & 255, (hi >>> 16) & 255, (hi >>> 8) & 255, hi & 255,
(lo >>> 24) & 255, (lo >>> 16) & 255, (lo >>> 8) & 255, lo & 255);

var h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a,
h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
var w = new Array(64);
var i, t;

function rotr(x, n) { return (x >>> n) | (x << (32 - n));}

for (i = 0; i < bytes.length; i += 64) {
for (t = 0; t < 16; t++) {
w[t] = ((bytes[i + t * 4] << 24) | (bytes[i + t * 4 + 1] << 16) |
(bytes[i + t * 4 + 2] << 8) | bytes[i + t * 4 + 3]) >>> 0;
}
for (t = 16; t < 64; t++) {
var s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
var s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
}
var a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
for (t = 0; t < 64; t++) {
var S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
var ch = (e & f) ^ ((~e) & g);
var t1 = (h + S1 + ch + SHA256_K[t] + w[t]) >>> 0;
var S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
var maj = (a & b) ^ (a & c) ^ (b & c);
var t2 = (S0 + maj) >>> 0;
h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
}
h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
}

function hex8(x) {
var s = x.toString(16);
while (s.length < 8) { s = '0' + s;}
return s;
}
return hex8(h0) + hex8(h1) + hex8(h2) + hex8(h3) + hex8(h4) + hex8(h5) + hex8(h6) + hex8(h7);
}

function hashFingerprint(str) {
if (typeof str!== 'string' || str.length === 0) {
throw mkErr('input', '指纹输入必须为非空字符串');
}
return sha256Hex(str);
}

/* ---------------- 纯函数：综合评分 ---------------- */

var SCORE_WEIGHTS = {pass: 100, warn: 70, unknown: 50, fail: 0};

function scoreReport(results) {
if (!Array.isArray(results) || results.length === 0) {
throw mkErr('results', '检测结果必须为非空数组');
}
var sum = 0;
for (var i = 0; i < results.length; i++) {
var r = results[i];
if (!r || typeof r!== 'object') {
throw mkErr('results', '第 ' + i + ' 项检测结果必须为对象');
}
if (!(r.status in SCORE_WEIGHTS)) {
throw mkErr('results', '第 ' + i + ' 项 status 非法（须为 pass/warn/unknown/fail），实得 ' + r.status);
}
sum += SCORE_WEIGHTS[r.status];
}
var score = Math.round(sum / results.length);
var level, summary;
if (score >= 90) {
level = 'A'; summary = '伪装良好：各项一致性检查均通过，穿帮面小';
} else if (score >= 75) {
level = 'B'; summary = '基本过关：存在轻微不一致，建议检查警告项';
} else if (score >= 60) {
level = 'C'; summary = '有穿帮风险：部分检查项未通过，建议逐项排查';
} else {
level = 'D'; summary = '穿帮明显：多项检查未通过，当前伪装容易被网站识破';
}
return {score: score, level: level, summary: summary};
}

var ProxyCamouflageCheck = {
checkTimezone: checkTimezone,
checkLanguage: checkLanguage,
parseIceCandidates: parseIceCandidates,
detectAutomation: detectAutomation,
hashFingerprint: hashFingerprint,
scoreReport: scoreReport
};

/* ---------------- 浏览器 UI（非纯函数区） ---------------- */

var ICE_TIMEOUT_MS = 6000;
var STUN_SERVERS = [
'stun:stun.l.google.com:19302',
'stun:stun1.l.google.com:19302'
];

function $(id) { return document.getElementById(id);}

function escHtml(s) {
return String(s).replace(/[&<>"']/g, function (c) {
return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c];
});
}

var LIGHT = {pass: '🟢', warn: '🟡', fail: '🔴', unknown: '⚪'};
var STATUS_TEXT = {pass: '通过', warn: '警告', fail: '未通过', unknown: '未知'};

function collectIceCandidates() {
return new Promise(function (resolve) {
var RTC = window.RTCPeerConnection || window.webkitRTCPeerConnection;
if (!RTC) { resolve({supported: false, candidates: []}); return;}
var lines = [];
var done = false;
function finish(supported) {
if (done) { return;}
done = true;
try { pc.close();} catch (e) { /* 忽略 */}
resolve({supported: supported, candidates: lines});
}
var pc;
try {
pc = new RTC({iceServers: STUN_SERVERS.map(function (u) { return {urls: u};})});
} catch (e) {
resolve({supported: false, candidates: []});
return;
}
pc.onicecandidate = function (ev) {
if (ev.candidate && ev.candidate.candidate) {
lines.push(ev.candidate.candidate);
}
};
pc.onicegatheringstatechange = function () {
if (pc.iceGatheringState === 'complete') { finish(true);}
};
try {
pc.createDataChannel('pcc');
pc.createOffer().then(function (offer) { return pc.setLocalDescription(offer);}).catch(function () { finish(true);});
} catch (e) {
finish(false);
return;
}
setTimeout(function () { finish(true);}, ICE_TIMEOUT_MS);
});
}

function sampleFingerprint() {
// Canvas 2D 指纹
var canvasStr = '';
try {
var cv = document.createElement('canvas');
cv.width = 280; cv.height = 60;
var ctx = cv.getContext('2d');
if (ctx) {
ctx.textBaseline = 'top';
ctx.font = '16px "Arial", sans-serif';
ctx.fillStyle = '#f60';
ctx.fillRect(10, 10, 120, 30);
ctx.fillStyle = '#069';
ctx.fillText('ProxyCamouflageCheck 伪装自查 🎭', 8, 44);
ctx.strokeStyle = 'rgba(0,0,0,.6)';
ctx.beginPath();
ctx.arc(240, 30, 22, 0, Math.PI * 2);
ctx.stroke();
canvasStr = cv.toDataURL();
}
} catch (e) { canvasStr = 'canvas-error';}
// WebGL renderer 指纹
var glStr = '';
try {
var glc = document.createElement('canvas');
var gl = glc.getContext('webgl') || glc.getContext('experimental-webgl');
if (gl) {
var ext = gl.getExtension('WEBGL_debug_renderer_info');
if (ext) {
glStr = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) + '|' + gl.getParameter(ext.UNMASKED_VENDOR_WEBGL);
} else {
glStr = gl.getParameter(gl.RENDERER) + '|' + gl.getParameter(gl.VENDOR);
}
} else {
glStr = 'webgl-unsupported';
}
} catch (e) { glStr = 'webgl-error';}
return 'canvas=' + canvasStr + ';webgl=' + glStr +
';tz=' + Intl.DateTimeFormat().resolvedOptions().timeZone +
';lang=' + (navigator.languages || [navigator.language]).join(',');
}

function buildReportText(meta, items, report) {
var lines = [];
lines.push('');
lines.push('检测时间：' + meta.time);
lines.push('出口 IP：' + meta.ip + '（' + meta.country + ' · 时区 ' + meta.ipTimezone + ' · ' + meta.isp + '）');
lines.push('浏览器时区：' + meta.browserTimezone + ' ｜ 浏览器语言：' + meta.browserLangs);
lines.push('');
items.forEach(function (it, i) {
lines.push('检查' + (i + 1) + ' ' + it.label + '：' + LIGHT[it.status] + STATUS_TEXT[it.status]);
lines.push(' ' + it.detail);
});
lines.push('');
lines.push('综合评分：' + report.score + '/100（' + report.level + ' ' + report.summary + '）');
lines.push('说明：本报告由代理/VPN 伪装自查工具在本地生成，未上传任何数据。');
return lines.join('\n');
}

function copyText(text, okCb, failCb) {
function fallback() {
try {
var ta = document.createElement('textarea');
ta.value = text;
ta.style.position = 'fixed';
ta.style.opacity = '0';
document.body.appendChild(ta);
ta.select();
var ok = document.execCommand('copy');
document.body.removeChild(ta);
(ok? okCb: failCb)();
} catch (e) { failCb();}
}
if (navigator.clipboard && navigator.clipboard.writeText) {
navigator.clipboard.writeText(text).then(okCb, fallback);
} else {
fallback();
}
}

function toast(msg) {
var t = $('pcc-toast');
t.textContent = msg;
t.style.display = 'block';
setTimeout(function () { t.style.display = 'none';}, 2200);
}

var lastReportText = '';

function renderItems(items) {
var box = $('pcc-items');
box.innerHTML = '';
items.forEach(function (it) {
var div = document.createElement('div');
div.className = 'pcc-item pcc-' + it.status;
div.innerHTML = '<div class="pcc-item-head"><span class="pcc-light">' + LIGHT[it.status] +
'</span><b>' + escHtml(it.label) + '</b><span class="pcc-status">' + STATUS_TEXT[it.status] +
'</span></div><div class="pcc-detail">' + escHtml(it.detail) + '</div>';
box.appendChild(div);
});
}

function renderScore(report) {
var box = $('pcc-score');
box.style.display = 'block';
box.className = 'pcc-score pcc-level-' + report.level;
$('pcc-score-num').textContent = report.score + '/100';
$('pcc-score-level').textContent = report.level + ' 级';
$('pcc-score-summary').textContent = report.summary;
$('pcc-copy').style.display = 'inline-block';
}

function runCheck() {
var btn = $('pcc-start');
btn.disabled = true;
btn.textContent = '检测中…';
$('pcc-score').style.display = 'none';
$('pcc-copy').style.display = 'none';
$('pcc-items').innerHTML = '<div class="pcc-info">正在检测，请稍候（WebRTC 候选收集最多约 6 秒）…</div>';

fetch('/tools/api/my-ip').then(function (r) { return r.json();}).then(function (res) {
if (!res ||!res.success ||!res.data) {
throw new Error('出口 IP 查询失败：' + ((res && (res.msg || res.error)) || '未知错误'));
}
var d = res.data;
var meta = {
time: new Date().toLocaleString('zh-CN', {hour12: false}),
ip: res.ip || '',
country: (d.country || '') + (d.regionName? ' ' + d.regionName: '') + (d.city? ' ' + d.city: ''),
countryCode: d.countryCode || '',
ipTimezone: d.timezone || '',
isp: d.isp || '',
browserTimezone: (typeof Intl!== 'undefined' && Intl.DateTimeFormat)?
Intl.DateTimeFormat().resolvedOptions().timeZone: '',
browserLangs: (navigator.languages && navigator.languages.length? navigator.languages: [navigator.language || '']).join(', ')
};
var langs = (navigator.languages && navigator.languages.length)? navigator.languages.slice(): [navigator.language || ''];

$('pcc-ipinfo').style.display = 'block';
$('pcc-ipinfo').innerHTML =
'<div class="pcc-kv"><span>出口 IP</span><b>' + escHtml(meta.ip) + '</b></div>' +
'<div class="pcc-kv"><span>归属地</span><b>' + escHtml(meta.country || '未知') + '（' + escHtml(meta.countryCode || '?') + '）</b></div>' +
'<div class="pcc-kv"><span>IP 时区</span><b>' + escHtml(meta.ipTimezone || '未知') + '</b></div>' +
'<div class="pcc-kv"><span>运营商</span><b>' + escHtml(meta.isp || '未知') + '</b></div>' +
'<div class="pcc-kv"><span>浏览器时区</span><b>' + escHtml(meta.browserTimezone || '未知') + '</b></div>' +
'<div class="pcc-kv"><span>浏览器语言</span><b>' + escHtml(meta.browserLangs || '未知') + '</b></div>';

var items = [];

// ① 时区一致性
try {
var tz = ProxyCamouflageCheck.checkTimezone(meta.ipTimezone, meta.browserTimezone);
items.push({label: '时区一致性', status: tz.pass? 'pass': 'fail', detail: tz.detail});
} catch (e) {
items.push({label: '时区一致性', status: 'unknown', detail: '时区数据缺失，无法判定（' + e.message + '）'});
}

// ② 语言一致性（启发式：不判死刑，warn 口径）
try {
var lg = ProxyCamouflageCheck.checkLanguage(langs, meta.countryCode);
items.push({label: '语言-国家一致性（启发式）', status: lg.pass? 'pass': 'warn', detail: lg.detail});
} catch (e) {
items.push({label: '语言-国家一致性（启发式）', status: 'unknown', detail: '语言/国家数据缺失，无法判定（' + e.message + '）'});
}

// ③ WebRTC 泄露（异步）
return collectIceCandidates().then(function (ice) {
if (!ice.supported) {
items.push({label: 'WebRTC 真实 IP 泄露', status: 'unknown', detail: '当前浏览器不支持 WebRTC，无法检测（不代表安全）'});
} else if (ice.candidates.length === 0) {
items.push({label: 'WebRTC 真实 IP 泄露', status: 'unknown', detail: '未能采集到 ICE 候选（可能被浏览器策略拦截），无法判定'});
} else {
var parsed = ProxyCamouflageCheck.parseIceCandidates(ice.candidates);
if (parsed.leaked) {
items.push({
label: 'WebRTC 真实 IP 泄露',
status: 'fail',
detail: '检出数字 IP 泄露：' + parsed.ips.join('、') + '——即使挂着代理，网站仍可通过 WebRTC 拿到你的真实 IP，建议在浏览器中禁用 WebRTC 或使用防泄露插件'
});
} else {
items.push({
label: 'WebRTC 真实 IP 泄露',
status: 'pass',
detail: '仅发现 mDNS.local 主机名，未见真实数字 IP（现代浏览器 mDNS 保护生效，真实 IP 未泄露）'
});
}
}

// ④ 自动化信号
var auto = ProxyCamouflageCheck.detectAutomation(!!navigator.webdriver);
items.push({label: '自动化信号检测', status: auto.pass? 'pass': 'fail', detail: auto.detail});

// ⑤ 指纹同会话稳定性
try {
var fp1 = sampleFingerprint();
var h1 = ProxyCamouflageCheck.hashFingerprint(fp1);
var h2 = ProxyCamouflageCheck.hashFingerprint(sampleFingerprint());
if (h1 === h2) {
items.push({
label: 'Canvas/WebGL 指纹稳定性',
status: 'pass',
detail: '同会话内两次采样指纹一致（SHA-256 ' + h1.slice(0, 16) + '…），该指纹可在本次会话内稳定识别你的浏览器'
});
} else {
items.push({
label: 'Canvas/WebGL 指纹稳定性',
status: 'warn',
detail: '同会话内指纹发生变化（可能启用了指纹混淆/隐私插件），会话内识别不稳定'
});
}
} catch (e) {
items.push({label: 'Canvas/WebGL 指纹稳定性', status: 'unknown', detail: '指纹采样失败，无法判定（' + e.message + '）'});
}

var report = ProxyCamouflageCheck.scoreReport(items.map(function (it) { return {status: it.status};}));
renderItems(items);
renderScore(report);
lastReportText = buildReportText(meta, items, report);
});
}).catch(function (e) {
$('pcc-items').innerHTML = '<div class="pcc-error">检测失败：' + escHtml(e.message) + '</div>';
}).then(function () {
btn.disabled = false;
btn.textContent = '重新检测';
});
}

function init() {
$('pcc-start').addEventListener('click', runCheck);
$('pcc-copy').addEventListener('click', function () {
if (!lastReportText) { toast('请先完成一次检测'); return;}
copyText(lastReportText,
function () { toast('报告已复制到剪贴板');},
function () { toast('复制失败，请手动选择复制');});
});
}

if (typeof window!== 'undefined') {
window.ProxyCamouflageCheck = ProxyCamouflageCheck;
if (document.readyState === 'loading') {
document.addEventListener('DOMContentLoaded', init);
} else {
init();
}
}

if (typeof module!== 'undefined' && module.exports) {
module.exports = ProxyCamouflageCheck;
}

})();
