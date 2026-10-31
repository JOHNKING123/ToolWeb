/* 社媒标题/简介生成器（social_title_generator）- 纯前端标题模板引擎
* 纯函数契约（失败约定沿用家族惯例：非法参数抛 Error，err.field 给出字段名，不静默钳制）：
* 1) normalizeKeywords(raw) → string[]
* - raw 须为 string：按换行 / 逗号 / 顿号 / 分号 / 空格 / 竖线切分；
* - 清洗：trim、去空、去重（英文大小写不敏感）、保留前 3 个；
* - raw 非字符串、或清洗后为空 → 抛 Error（err.field="keywords"）。
* 2) pickTemplates(platform, tone) → string[]
* - platform 仅 xiaohongshu / douyin / instagram / youtube；
* - tone 仅 plant（种草）/ guide（干货）/ fun（搞笑）/ formal（正式）；
* - 非法 → 抛 Error（err.field="platform" / "tone"）；
* - 返回该 平台×语气 组合的标题模板数组（非空，每条含 {k1} 槽位）。
* 3) renderTitle(tpl, keywords) → string
* - tpl 非字符串、或不含 {kN} 槽位（N=1..3）→ 抛 Error（err.field="tpl"）；
* - keywords 为 string 时视为单关键词；非字符串/数组、或空 → 抛 Error（err.field="keywords"）；
* - {k1}/{k2}/{k3} 依次替换为 keywords[0/1/2]，缺项回退为 keywords[0]（跨环境确定性）。
* 4) buildDownloadName(dt) → string
* - social-title-YYYYMMDD-HHmmss.txt 格式；
* - dt 省略时取当前时间；dt 非 Date、或为无效日期 → 抛 Error（err.field="dt")。
* 三层模板库（品类钩子＋平台话术＋关键词槽位）：
* - 品类钩子：种草/避雷/测评/教程/整活等通用钩子词缀；
* - 平台话术：小红书（姐妹体/emoji/）、抖音（钩子前置/建议收藏）、
* Instagram（中英混搭/lifestyle）、YouTube（长标题/）；
* - 关键词槽位：{k1}/{k2}/{k3}，生成时按用户关键词逐项替换。
* 零网络请求：本文件不发起任何 fetch / XHR；模板库为内置静态数据，不上传。
*/
(function () {
'use strict';

function badParam(field, message) {
var e = new Error(message);
e.field = field;
return e;
}

var PLATFORMS = ["xiaohongshu", "douyin", "instagram", "youtube"];
var TONES = ["plant", "guide", "fun", "formal"];
var PLATFORM_NAMES = {
xiaohongshu: "小红书",
douyin: "抖音",
instagram: "Instagram",
youtube: "YouTube"
};
var TONE_NAMES = {
plant: "种草",
guide: "干货",
fun: "搞笑",
formal: "正式"
};
var MAX_KEYWORDS = 3;
var TITLES_PER_PLATFORM = 5;

/* ---------- 三层标题模板库：平台 × 语气，每组 5 条，每条必含 {k1} ---------- */
var TPL_DB = {
/* 小红书：姐妹体 / emoji / */
xiaohongshu: {
plant: [
"姐妹们！{k1}我真的闭眼入！挖到宝了✨",
"【{k1}】种草攻略｜这篇帮你省下好多冤枉钱💰",
"{k1}真香现场！用完我只想说：相见恨晚🥹",
"被问爆的{k1}！平价好物分享，闭眼抄作业📝",
"{k1}｜挖到宝藏好物，快乐直接翻倍🎉"
],
guide: [
"{k1}保姆级教程｜从入门到精通，一篇讲透📚",
"【{k1}】干货合集｜建议收藏，错过拍大腿",
"{k1}避坑指南｜新手必看的5个关键点⚠️",
"手把手教你玩转{k1}｜小白也能看懂的干货帖",
"{k1}深度解析｜看完这篇你就是半个专家🔍"
],
fun: [
"{k1}：我本以为是青铜，结果是王者🤣",
"关于{k1}，我笑得满地找头哈哈哈哈哈",
"{k1}大型翻车现场？不，是大型真香现场😂",
"家人们谁懂啊！{k1}居然这么好笑🤪",
"挑战用{k1}整活100天，第1天我就破防了"
],
formal: [
"{k1}使用评测报告｜客观数据，理性参考",
"关于{k1}的深度体验与选购建议",
"{k1}｜专业视角下的全面解析",
"{k1}选购白皮书：关键指标一次讲清",
"实测{k1}：优缺点全记录，供参考"
]
},
/* 抖音：钩子前置 / 建议收藏 / 数字悬念 */
douyin: {
plant: [
"{k1}闭眼入不踩雷！建议收藏📌",
"全网都在推的{k1}，到底值不值得买？",
"{k1}真香警告⚠️看完这条你就懂了",
"花小钱办大事！{k1}平替天花板🔥",
"{k1}｜用过的人都说好，不服来辩"
],
guide: [
"{k1}教程来了！3分钟学会，包教包会",
"99%的人都不知道的{k1}隐藏用法",
"{k1}｜新手避坑，这3点一定要记住",
"手把手教学：{k1}从0到1全流程",
"{k1}干货｜建议反复观看，太实用了"
],
fun: [
"挑战：用{k1}整活，路人反应笑死我🤣",
"{k1}翻车合集，看完我笑到头掉",
"当我妈第一次用{k1}……结局意想不到😂",
"{k1}｜这波操作我给满分，不接受反驳",
"听说{k1}很火？我试了一下，结果……"
],
formal: [
"{k1}深度测评｜数据说话，客观公正",
"{k1}选购指南：看这几点就够了",
"专业解读{k1}：原理、用法与注意事项",
"{k1}｜一期视频讲透，值得收藏",
"实测对比：{k1}到底哪款更值得"
]
},
/* Instagram：中英混搭 / lifestyle */
instagram: {
plant: [
"{k1} obsessed ✨ my new holy grail, trust me on this",
"POV: you finally found the perfect {k1} 💕",
"{k1} haul 🌿 affordable finds that actually work",
"can't gatekeep this {k1} anymore, you're welcome 😉",
"{k1} favorites ✨ adding to cart as we speak"
],
guide: [
"{k1} 101 📖 everything you need to know (save this!)",
"how to master {k1} in 5 steps 👇 beginner friendly",
"{k1} tips nobody talks about 🤫 save for later",
"the ultimate {k1} guide — bookmark this 🔖",
"{k1} mistakes to avoid ⚠️ learn from my fails"
],
fun: [
"me vs {k1}: a love-hate story 😂",
"{k1} said \"trust the process\" and I said \"bet\" 🤪",
"rating my {k1} era: 10/10 would embarrass myself again",
"{k1} gone wrong (gone hilarious) 💀",
"day 1 of {k1}: already regretting nothing lol"
],
formal: [
"{k1} — an honest review after 30 days",
"a closer look at {k1}: specs, pros & cons",
"{k1} buying guide: what actually matters",
"testing {k1} so you don't have to 📊",
"{k1} deep dive: is it worth it?"
]
},
/* YouTube：长标题 / / EP */
youtube: {
plant: [
"【开箱】{k1}深度体验！这波真的种草了🌱",
"{k1}｜用了一个月，真心话大冒险式分享",
"为什么人人都在推{k1}？看完你就明白了",
"{k1}平价好物合集｜每一件都值得拥有",
"【真香】{k1}实测分享｜闭眼入系列"
],
guide: [
"【教程】{k1}从入门到精通｜完整版一次讲透",
"{k1}｜新手必看！避开这5个坑",
"【干货】{k1}隐藏技巧大公开，建议收藏",
"{k1}全攻略 EP1：基础篇（超详细）",
"【保姆级】{k1}手把手教学｜小白友好"
],
fun: [
"【整活】挑战用{k1}生存24小时，结果笑死",
"{k1}翻车名场面合集｜看完快乐一整天",
"我用{k1}整蛊朋友，结局出乎意料😂",
"【搞笑】关于{k1}的10个离谱瞬间",
"{k1}｜当社恐遇到社牛，场面一度失控"
],
formal: [
"【评测】{k1}深度测评｜数据实测，客观分析",
"{k1}｜专业选购指南：参数详解与横向对比",
"【解析】{k1}的工作原理与适用场景",
"{k1}长期使用报告｜优缺点全记录",
"【对比】{k1}选购不迷路：关键指标解读"
]
}
};

/* ---------- 配套简介模板：平台 × 语气，每组 1 段 ---------- */
var BIO_DB = {
xiaohongshu: {
plant: "本期分享我的{k1}心头好✨从挑选到使用全流程记录，姐妹们抄作业不迷路～觉得有用记得点赞收藏，评论区聊聊你的{k1}体验！",
guide: "这篇把{k1}讲透了：原理、步骤、避坑点一次说清，建议先收藏再看。看完还有疑问欢迎评论区提问，看到都会回～",
fun: "关于{k1}的快乐谁懂啊哈哈哈！本期纯属整活，博君一笑～喜欢这种风格记得关注，下期更离谱！",
formal: "本篇为{k1}的客观体验记录与选购参考，内容基于实际使用整理，仅供参考，不构成购买建议。"
},
douyin: {
plant: "{k1}闭眼入系列来了！好用才敢推，记得点赞收藏，关注我解锁更多好物～",
guide: "{k1}保姆级教程，建议反复观看！学会了评论区扣1，有问题直接问～",
fun: "整活预警！本期{k1}纯属搞笑，认真你就输了哈哈哈，关注我每天快乐加倍！",
formal: "本视频为{k1}客观测评，数据实测、观点中立，仅供选购参考。"
},
instagram: {
plant: "new {k1} obsession ✨ save this post & tag a friend who needs it! 💕",
guide: "your ultimate {k1} guide 📖 save for later — you'll thank me 😉",
fun: "just here for the {k1} chaos 😂 follow for more unhinged content",
formal: "honest {k1} review — 30 days of testing, full breakdown in caption. 📊"
},
youtube: {
plant: "本期视频分享我的{k1}使用体验：开箱、实测、真心话全都有！喜欢记得一键三连，评论区聊聊你的看法～",
guide: "本期为{k1}完整教程：从入门到进阶一次讲透，时间轴已放简介，欢迎跳转观看。订阅频道不错过下期干货！",
fun: "本期整活警告⚠️关于{k1}的离谱挑战全记录，笑到最后算我输！订阅频道，快乐不迷路～",
formal: "本期为{k1}深度测评：测试方法、数据结论均在视频中呈现，观点仅供参考。"
}
};

var SLOT_RE = /\{k([123])\}/;

/* ---------- 1) normalizeKeywords ---------- */
function normalizeKeywords(raw) {
if (typeof raw!== "string") {
throw badParam("keywords", "normalizeKeywords: raw 须为字符串");
}
var parts = raw.split(/[\r\n,，、；;| \t]+/);
var seen = {}, out = [];
for (var i = 0; i < parts.length; i++) {
var t = parts[i].trim();
if (!t) continue;
var k = t.toLowerCase();
if (seen[k]) continue;
seen[k] = true;
out.push(t);
if (out.length >= MAX_KEYWORDS) break;
}
if (out.length === 0) {
throw badParam("keywords", "normalizeKeywords: 关键词为空，请输入 1~3 个关键词");
}
return out;
}

/* ---------- 2) pickTemplates ---------- */
function pickTemplates(platform, tone) {
if (PLATFORMS.indexOf(platform) === -1) {
throw badParam("platform", "pickTemplates: platform 非法，须为 " + PLATFORMS.join("/"));
}
if (TONES.indexOf(tone) === -1) {
throw badParam("tone", "pickTemplates: tone 非法，须为 " + TONES.join("/"));
}
return TPL_DB[platform][tone].slice();
}

/* ---------- 3) renderTitle ---------- */
function renderTitle(tpl, keywords) {
if (typeof tpl!== "string" ||!SLOT_RE.test(tpl)) {
throw badParam("tpl", "renderTitle: tpl 须为含 {k1}/{k2}/{k3} 槽位的字符串");
}
var kws;
if (typeof keywords === "string") {
kws = [keywords.trim()];
} else if (Array.isArray(keywords)) {
kws = keywords.slice();
} else {
throw badParam("keywords", "renderTitle: keywords 须为字符串或字符串数组");
}
kws = kws.filter(function (k) { return typeof k === "string" && k.trim();})
.map(function (k) { return k.trim();});
if (kws.length === 0) {
throw badParam("keywords", "renderTitle: keywords 为空");
}
return tpl.replace(/\{k([123])\}/g, function (m, n) {
var v = kws[Number(n) - 1];
return v === undefined? kws[0]: v;
});
}

/* 简介渲染：复用槽位替换规则（缺简介模板时回退通用简介） */
function renderBio(platform, tone, keywords) {
var tpl = (BIO_DB[platform] || {})[tone];
if (!tpl) {
tpl = "本期分享{k1}相关内容，觉得有用记得点赞收藏～";
}
return renderTitle(tpl, keywords);
}

/* ---------- 4) buildDownloadName ---------- */
function buildDownloadName(dt) {
if (dt === undefined) {
dt = new Date();
}
if (!(dt instanceof Date) || isNaN(dt.getTime())) {
throw badParam("dt", "buildDownloadName: dt 须为有效 Date 对象");
}
function p(n) { return (n < 10? "0": "") + n;}
return "social-title-" + dt.getFullYear() + p(dt.getMonth() + 1) + p(dt.getDate()) +
"-" + p(dt.getHours()) + p(dt.getMinutes()) + p(dt.getSeconds()) + ".txt";
}

/* 平台 × 语气 一次生成：标题 5 条 ＋ 简介 1 段 */
function generateFor(platform, tone, keywords) {
var tpls = pickTemplates(platform, tone);
var titles = [];
for (var i = 0; i < tpls.length && titles.length < TITLES_PER_PLATFORM; i++) {
titles.push(renderTitle(tpls[i], keywords));
}
return {
platform: platform,
platformName: PLATFORM_NAMES[platform],
tone: tone,
toneName: TONE_NAMES[tone],
titles: titles,
bio: renderBio(platform, tone, keywords)
};
}

/* 全量文本（复制全部 / 下载用）：按平台分组 */
function formatAllText(groups) {
var lines = [];
groups.forEach(function (g) {
lines.push("【" + g.platformName + " · " + g.toneName + "】");
g.titles.forEach(function (t, i) { lines.push((i + 1) + ". " + t);});
lines.push("");
lines.push("简介：");
lines.push(g.bio);
lines.push("");
});
return lines.join("\n");
}

/* node 测试导出（浏览器侧无 module，走下方 DOM 逻辑） */
if (typeof module!== 'undefined' && module.exports) {
module.exports = {
normalizeKeywords: normalizeKeywords,
pickTemplates: pickTemplates,
renderTitle: renderTitle,
renderBio: renderBio,
buildDownloadName: buildDownloadName,
generateFor: generateFor,
formatAllText: formatAllText,
TPL_DB: TPL_DB,
BIO_DB: BIO_DB,
PLATFORMS: PLATFORMS,
TONES: TONES,
PLATFORM_NAMES: PLATFORM_NAMES,
TONE_NAMES: TONE_NAMES,
MAX_KEYWORDS: MAX_KEYWORDS,
TITLES_PER_PLATFORM: TITLES_PER_PLATFORM
};
}

/* ---------- DOM 逻辑（仅浏览器） ---------- */
if (typeof document!== 'undefined') {
document.addEventListener('DOMContentLoaded', function () {
'use strict';
function $(id) { return document.getElementById(id);}
var input = $('stg-input'), errBox = $('stg-error'),
outWrap = $('stg-output-wrap'), actions = $('stg-actions');

function toast(msg) {
errBox.textContent = msg;
errBox.style.display = msg? 'block': 'none';
}

function currentPlatforms() {
var list = [];
var boxes = document.querySelectorAll('input[name="stg-platform"]:checked');
for (var i = 0; i < boxes.length; i++) list.push(boxes[i].value);
return list;
}

function currentTone() {
var radios = document.getElementsByName('stg-tone');
for (var i = 0; i < radios.length; i++) {
if (radios[i].checked) return radios[i].value;
}
return 'plant';
}

var lastGroups = null;

function titleRow(text) {
var row = document.createElement('div');
row.className = 'stg-title-row';
var span = document.createElement('span');
span.className = 'stg-title-text';
span.textContent = text;
var cp = document.createElement('button');
cp.className = 'btn btn-secondary stg-mini-btn';
cp.type = 'button';
cp.textContent = '复制';
cp.addEventListener('click', function () {
copyText(text, '已复制：' + (text.length > 18? text.slice(0, 18) + '…': text));
});
row.appendChild(span);
row.appendChild(cp);
return row;
}

function generate() {
toast('');
outWrap.innerHTML = '';
lastGroups = null;
actions.style.display = 'none';
var kws;
try {
kws = normalizeKeywords(input.value);
} catch (e) {
toast('⚠ ' + e.message);
input.focus();
return;
}
var platforms = currentPlatforms();
if (platforms.length === 0) {
toast('⚠ 请至少选择一个目标平台');
return;
}
var tone = currentTone();
lastGroups = [];
try {
platforms.forEach(function (p) {
lastGroups.push(generateFor(p, tone, kws));
});
} catch (e) {
toast('⚠ ' + e.message);
return;
}

var meta = document.createElement('div');
meta.className = 'stg-meta';
meta.textContent = '关键词：' + kws.join('、') + '｜语气：' + TONE_NAMES[tone] +
'｜共 ' + lastGroups.length + ' 个平台 × 每平台 ' + TITLES_PER_PLATFORM + ' 条标题 ＋ 1 段简介';
outWrap.appendChild(meta);

lastGroups.forEach(function (g) {
var box = document.createElement('div');
box.className = 'stg-group';
var head = document.createElement('div');
head.className = 'stg-group-head';
var h = document.createElement('h4');
h.textContent = g.platformName + ' · ' + g.toneName;
head.appendChild(h);
var cpGroup = document.createElement('button');
cpGroup.className = 'btn btn-secondary stg-mini-btn';
cpGroup.type = 'button';
cpGroup.textContent = '复制本组';
cpGroup.addEventListener('click', function () {
var text = '【' + g.platformName + ' · ' + g.toneName + '】\n' +
g.titles.map(function (t, i) { return (i + 1) + '. ' + t;}).join('\n') +
'\n\n简介：\n' + g.bio;
copyText(text, g.platformName + '分组已复制');
});
head.appendChild(cpGroup);
box.appendChild(head);

var ol = document.createElement('div');
ol.className = 'stg-titles';
g.titles.forEach(function (t) { ol.appendChild(titleRow(t));});
box.appendChild(ol);

var bioBox = document.createElement('div');
bioBox.className = 'stg-bio';
var bioHead = document.createElement('div');
bioHead.className = 'stg-bio-head';
var b = document.createElement('b');
b.textContent = '配套简介';
bioHead.appendChild(b);
var cpBio = document.createElement('button');
cpBio.className = 'btn btn-secondary stg-mini-btn';
cpBio.type = 'button';
cpBio.textContent = '复制简介';
cpBio.addEventListener('click', function () { copyText(g.bio, '简介已复制');});
bioHead.appendChild(cpBio);
bioBox.appendChild(bioHead);
var bioP = document.createElement('p');
bioP.textContent = g.bio;
bioBox.appendChild(bioP);
box.appendChild(bioBox);

outWrap.appendChild(box);
});
actions.style.display = 'flex';
}

function copyText(text, okMsg) {
function done() { toast(''); alert2(okMsg);}
function fail() { toast('⚠ 复制失败，请手动选择复制');}
if (navigator.clipboard && navigator.clipboard.writeText) {
navigator.clipboard.writeText(text).then(done, fail);
} else {
var ta = document.createElement('textarea');
ta.value = text;
document.body.appendChild(ta);
ta.select();
try { document.execCommand('copy'); done();} catch (e) { fail();}
document.body.removeChild(ta);
}
}

/* 轻量提示（不依赖外部库） */
var tipTimer = null;
function alert2(msg) {
var el = $('stg-tip');
el.textContent = msg;
el.style.display = 'block';
clearTimeout(tipTimer);
tipTimer = setTimeout(function () { el.style.display = 'none';}, 1800);
}

$('stg-generate').addEventListener('click', generate);
$('stg-sample').addEventListener('click', function () {
input.value = '咖啡，拉花';
document.querySelector('input[name="stg-platform"][value="xiaohongshu"]').checked = true;
document.querySelector('input[name="stg-platform"][value="douyin"]').checked = false;
document.querySelector('input[name="stg-platform"][value="instagram"]').checked = false;
document.querySelector('input[name="stg-platform"][value="youtube"]').checked = false;
document.querySelector('input[name="stg-tone"][value="plant"]').checked = true;
generate();
});
$('stg-clear').addEventListener('click', function () {
input.value = '';
outWrap.innerHTML = '';
actions.style.display = 'none';
toast('');
input.focus();
});
$('stg-copy-all').addEventListener('click', function () {
if (!lastGroups) { toast('⚠ 请先生成标题'); return;}
copyText(formatAllText(lastGroups), '全部标题＋简介已复制');
});
$('stg-download').addEventListener('click', function () {
if (!lastGroups) { toast('⚠ 请先生成标题'); return;}
var blob = new Blob([formatAllText(lastGroups)], { type: 'text/plain;charset=utf-8'});
var a = document.createElement('a');
a.href = URL.createObjectURL(blob);
a.download = buildDownloadName();
document.body.appendChild(a);
a.click();
setTimeout(function () { URL.revokeObjectURL(a.href); document.body.removeChild(a);}, 500);
alert2('已下载 ' + a.download);
});
});
}
})();
