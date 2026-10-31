/* 社媒标签生成器（hashtag_generator）- 纯前端标签策略引擎
* 纯函数契约（失败约定沿用家族惯例：非法参数抛 Error，err.field 给出字段名，不静默钳制）：
* 1) normalizeKeywords(input) → string[]
* - input 为 string：按换行 / 逗号 / 顿号 / 分号切分；为 string[]：逐项处理；
* - 清洗：trim、去空、去重（英文大小写不敏感）、保留前 20 个；
* - input 非字符串/数组、或清洗后为空 → 抛 Error（err.field="input"）。
* 2) matchTags(keyword) → [{tag, alias, heat, platforms, category}]
* - keyword 非字符串或 trim 为空 → 抛 Error（err.field="keyword"）；
* - 命中规则：tag 或任一 alias 与关键词完全相等，或互为子串（英文不区分大小写）；
* - 结果按 heat 降序（heat 相同按 tag 字典序，保证跨环境确定性）。
* 3) generateHashtags(keywords, opts) → {core, trending, niche}
* - keywords 非数组或为空 → 抛 Error（err.field="keywords"）；超过 20 截断前 20；
* - opts.platform 非法 → 抛 Error（err.field="platform"），合法值：
* xiaohongshu / douyin / instagram / youtube / general（缺省 general）；
* - opts.count 非法 → 抛 Error（err.field="count"），合法值 5/10/15/20
* （缺省按平台建议：小红书 10、抖音 5、Instagram 15、YouTube 10、通用 10）；
* - opts.heatPref 非法 → 抛 Error（err.field="heatPref"），合法值
* balanced / hot / niche（缺省 balanced）；
* - 三层策略：① alias 命中 → 核心组；② 品类关联 → 热门/长尾候选；
* ③ 平台热门补足 → 热门组；零命中时从关键词派生 #关键词 保底进核心组；
* - 每组元素形如 {tag:"#美妆", heat:92, badge:"🔥爆款"}，三组去重，总数向 count 看齐。
* 零网络请求：本文件不发起任何 fetch / XHR；标签库为内置静态快照，不上传。
*/
(function () {
'use strict';

function badParam(field, message) {
var e = new Error(message);
e.field = field;
return e;
}

/* ---------- 内置标签库（10 品类，静态快照 v1.0，非实时热度） ---------- */
var TAG_DB = [
/* 美妆护肤 */
{ tag: "美妆", alias: ["化妆", "彩妆", "美容", "makeup", "beauty"], heat: 92, platforms: ["xiaohongshu", "douyin", "instagram"], category: "美妆护肤"},
{ tag: "护肤", alias: ["skincare", "保养", "皮肤管理"], heat: 88, platforms: ["xiaohongshu", "douyin", "instagram", "youtube"], category: "美妆护肤"},
{ tag: "makeup", alias: ["美妆", "cosmetics"], heat: 85, platforms: ["instagram", "youtube"], category: "美妆护肤"},
{ tag: "口红试色", alias: ["口红", "lipstick", "试色"], heat: 75, platforms: ["xiaohongshu", "douyin"], category: "美妆护肤"},
{ tag: "成分党", alias: ["成分", "护肤成分", "skincareingredients"], heat: 62, platforms: ["xiaohongshu"], category: "美妆护肤"},
/* 时尚穿搭 */
{ tag: "穿搭", alias: ["ootd", "搭配", "服装", "outfit"], heat: 90, platforms: ["xiaohongshu", "douyin", "instagram"], category: "时尚穿搭"},
{ tag: "ootd", alias: ["穿搭", "每日穿搭"], heat: 88, platforms: ["instagram", "xiaohongshu"], category: "时尚穿搭"},
{ tag: "街头风", alias: ["streetwear", "街头", "潮流"], heat: 70, platforms: ["douyin", "instagram"], category: "时尚穿搭"},
{ tag: "复古穿搭", alias: ["复古", "vintage", "retro"], heat: 65, platforms: ["xiaohongshu", "instagram"], category: "时尚穿搭"},
/* 美食 */
{ tag: "美食", alias: ["food", "好吃的", "探店", "foodie"], heat: 93, platforms: ["xiaohongshu", "douyin", "instagram", "youtube"], category: "美食"},
{ tag: "探店", alias: ["美食探店", "餐厅", "foodreview"], heat: 82, platforms: ["xiaohongshu", "douyin"], category: "美食"},
{ tag: "烘焙", alias: ["baking", "蛋糕", "甜点", "dessert"], heat: 76, platforms: ["xiaohongshu", "douyin", "instagram"], category: "美食"},
{ tag: "减脂餐", alias: ["减肥餐", "健康餐", "mealprep"], heat: 68, platforms: ["xiaohongshu", "douyin"], category: "美食"},
/* 旅行 */
{ tag: "旅行", alias: ["旅游", "travel", "度假", "trip"], heat: 91, platforms: ["xiaohongshu", "douyin", "instagram", "youtube"], category: "旅行"},
{ tag: "攻略", alias: ["旅游攻略", "guide", "保姆级攻略"], heat: 80, platforms: ["xiaohongshu", "douyin"], category: "旅行"},
{ tag: "特种兵旅游", alias: ["特种兵", "穷游", "budgettravel"], heat: 72, platforms: ["xiaohongshu", "douyin"], category: "旅行"},
{ tag: "travelphotography", alias: ["旅行摄影", "旅拍"], heat: 66, platforms: ["instagram", "youtube"], category: "旅行"},
/* 健身运动 */
{ tag: "健身", alias: ["workout", "锻炼", "增肌", "gym"], heat: 89, platforms: ["xiaohongshu", "douyin", "instagram", "youtube"], category: "健身运动"},
{ tag: "减脂", alias: ["减肥", "weightloss", "瘦身"], heat: 84, platforms: ["xiaohongshu", "douyin"], category: "健身运动"},
{ tag: "马甲线", alias: ["腹肌", "abs", "核心训练"], heat: 71, platforms: ["xiaohongshu", "douyin"], category: "健身运动"},
{ tag: "瑜伽", alias: ["yoga", "普拉提"], heat: 69, platforms: ["xiaohongshu", "instagram", "youtube"], category: "健身运动"},
/* 数码科技 */
{ tag: "数码", alias: ["tech", "科技", "数码产品", "gadget"], heat: 87, platforms: ["xiaohongshu", "douyin", "youtube"], category: "数码科技"},
{ tag: "AI工具", alias: ["ai", "人工智能", "aitools"], heat: 83, platforms: ["xiaohongshu", "douyin", "youtube"], category: "数码科技"},
{ tag: "开箱", alias: ["unboxing", "测评", "review"], heat: 77, platforms: ["douyin", "youtube", "xiaohongshu"], category: "数码科技"},
{ tag: "手机摄影", alias: ["摄影", "拍照技巧", "mobilephotography"], heat: 74, platforms: ["xiaohongshu", "douyin"], category: "数码科技"},
/* 母婴育儿 */
{ tag: "育儿", alias: ["parenting", "带娃", "母婴", "baby"], heat: 81, platforms: ["xiaohongshu", "douyin"], category: "母婴育儿"},
{ tag: "早教", alias: ["启蒙", "earlyeducation", "亲子"], heat: 67, platforms: ["xiaohongshu", "douyin"], category: "母婴育儿"},
{ tag: "辅食", alias: ["宝宝辅食", "babyfood"], heat: 63, platforms: ["xiaohongshu", "douyin"], category: "母婴育儿"},
/* 宠物 */
{ tag: "宠物", alias: ["pets", "猫", "狗", "cat", "dog", "萌宠"], heat: 90, platforms: ["xiaohongshu", "douyin", "instagram", "youtube"], category: "宠物"},
{ tag: "吸猫", alias: ["猫咪", "catlover", "猫片"], heat: 78, platforms: ["xiaohongshu", "douyin", "instagram"], category: "宠物"},
{ tag: "训犬", alias: ["狗狗训练", "dogtraining"], heat: 58, platforms: ["douyin", "youtube"], category: "宠物"},
/* 摄影 */
{ tag: "摄影", alias: ["photography", "拍照", "人像"], heat: 86, platforms: ["xiaohongshu", "instagram", "youtube"], category: "摄影"},
{ tag: "氛围感", alias: ["氛围", "氛围感大片", "mood"], heat: 79, platforms: ["xiaohongshu", "douyin", "instagram"], category: "摄影"},
{ tag: "胶片", alias: ["film", "胶片机", "复古照片"], heat: 73, platforms: ["xiaohongshu", "instagram"], category: "摄影"},
/* 平台热门（跨品类通用高热标签） */
{ tag: "fyp", alias: ["foryoupage", "推荐", "上热门"], heat: 95, platforms: ["douyin", "youtube", "instagram"], category: "平台热门"},
{ tag: "种草", alias: ["好物分享", "推荐", "种草拔草"], heat: 85, platforms: ["xiaohongshu", "douyin"], category: "平台热门"},
{ tag: "日常", alias: ["vlog", "生活记录", "daily", "日常生活"], heat: 82, platforms: ["xiaohongshu", "douyin", "instagram", "youtube"], category: "平台热门"},
{ tag: "干货分享", alias: ["干货", "知识分享", "教程", "tutorial"], heat: 80, platforms: ["xiaohongshu", "douyin", "youtube"], category: "平台热门"},
{ tag: "治愈系", alias: ["治愈", "healing", "解压"], heat: 74, platforms: ["xiaohongshu", "douyin", "instagram"], category: "平台热门"}
];

var PLATFORMS = ["xiaohongshu", "douyin", "instagram", "youtube", "general"];
var COUNTS = [5, 10, 15, 20];
var HEAT_PREFS = ["balanced", "hot", "niche"];
var PLATFORM_DEFAULT_COUNT = { xiaohongshu: 10, douyin: 5, instagram: 15, youtube: 10, general: 10};
var MAX_KEYWORDS = 20;

/* 英文规范化：小写；中文原样 */
function normKey(s) {
return s.replace(/\s+/g, "").toLowerCase();
}

function badgeFor(heat) {
if (heat >= 85) return "🔥爆款";
if (heat >= 60) return "📈热门";
if (heat >= 30) return "🌱潜力";
return "💎长尾";
}

function toOutput(entry) {
return { tag: "#" + entry.tag, heat: entry.heat, badge: badgeFor(entry.heat)};
}

/* 按 heat 降序，heat 相同按 tag 字典序（跨环境确定性） */
function byHeatDesc(a, b) {
if (b.heat!== a.heat) return b.heat - a.heat;
return a.tag < b.tag? -1: (a.tag > b.tag? 1: 0);
}

/* ---------- 1) normalizeKeywords ---------- */
function normalizeKeywords(input) {
var raw;
if (typeof input === "string") {
raw = input.split(/[\r\n,，、；;|]+/);
} else if (Array.isArray(input)) {
raw = input.slice();
} else {
throw badParam("input", "normalizeKeywords: input 须为字符串或字符串数组");
}
var seen = {}, out = [];
for (var i = 0; i < raw.length; i++) {
var item = raw[i];
if (typeof item!== "string") {
throw badParam("input", "normalizeKeywords: 数组元素须为字符串（下标 " + i + "）");
}
var t = item.trim();
if (!t) continue;
var k = normKey(t);
if (seen[k]) continue;
seen[k] = true;
out.push(t);
if (out.length >= MAX_KEYWORDS) break;
}
if (out.length === 0) {
throw badParam("input", "normalizeKeywords: 关键词为空，请输入 1~20 个关键词");
}
return out;
}

/* ---------- 2) matchTags ---------- */
function matchTags(keyword) {
if (typeof keyword!== "string" ||!keyword.trim()) {
throw badParam("keyword", "matchTags: keyword 须为非空字符串");
}
var kw = normKey(keyword.trim());
var hits = [];
for (var i = 0; i < TAG_DB.length; i++) {
var e = TAG_DB[i];
var words = [e.tag].concat(e.alias);
var hit = false;
for (var j = 0; j < words.length; j++) {
var w = normKey(words[j]);
if (w === kw || w.indexOf(kw)!== -1 || kw.indexOf(w)!== -1) { hit = true; break;}
}
if (hit) hits.push(e);
}
hits.sort(byHeatDesc);
return hits;
}

/* ---------- 3) generateHashtags ---------- */
function generateHashtags(keywords, opts) {
if (!Array.isArray(keywords) || keywords.length === 0) {
throw badParam("keywords", "generateHashtags: keywords 须为非空数组");
}
opts = opts || {};
var platform = opts.platform === undefined? "general": opts.platform;
if (PLATFORMS.indexOf(platform) === -1) {
throw badParam("platform", "generateHashtags: platform 非法，须为 " + PLATFORMS.join("/"));
}
var count = opts.count === undefined? PLATFORM_DEFAULT_COUNT[platform]: opts.count;
if (COUNTS.indexOf(count) === -1) {
throw badParam("count", "generateHashtags: count 非法，须为 5/10/15/20");
}
var heatPref = opts.heatPref === undefined? "balanced": opts.heatPref;
if (HEAT_PREFS.indexOf(heatPref) === -1) {
throw badParam("heatPref", "generateHashtags: heatPref 非法，须为 balanced/hot/niche");
}

var kws = keywords.slice(0, MAX_KEYWORDS);

/* 第一层：alias 命中 */
var hitMap = {}, hits = [];
kws.forEach(function (kw) {
matchTags(kw).forEach(function (e) {
if (!hitMap[e.tag]) { hitMap[e.tag] = true; hits.push(e);}
});
});
hits.sort(byHeatDesc);

/* 第二层：品类关联（命中条目所在品类的其他条目） */
var cats = {}, related = [];
hits.forEach(function (e) { cats[e.category] = true;});
TAG_DB.forEach(function (e) {
if (cats[e.category] &&!hitMap[e.tag]) related.push(e);
});
related.sort(byHeatDesc);

/* 第三层：平台热门候选池 */
var pool = TAG_DB.filter(function (e) {
return platform === "general" || e.platforms.indexOf(platform)!== -1;
});
pool.sort(byHeatDesc);

var used = {};
function take(list, n) {
var r = [];
for (var i = 0; i < list.length && r.length < n; i++) {
if (!used[list[i].tag]) { used[list[i].tag] = true; r.push(list[i]);}
}
return r;
}

/* 核心组：alias 命中；零命中时从关键词派生 #关键词 保底 */
var corePool;
if (hits.length > 0) {
corePool = hits.slice();
} else {
corePool = kws.map(function (kw) {
var clean = kw.trim().replace(/\s+/g, "");
var disp = /[\u4e00-\u9fa5]/.test(clean)? clean: clean.toLowerCase();
return { tag: disp, alias: [], heat: 35, platforms: PLATFORMS.slice(), category: "派生"};
});
}

/* 热门组：heat≥60 的品类关联＋平台候选；长尾组：heat<60 的同类 */
var hotPool = related.concat(pool).filter(function (e) { return e.heat >= 60;});
var nichePool = related.concat(pool).filter(function (e) { return e.heat < 60;});
hotPool.sort(byHeatDesc);
nichePool.sort(byHeatDesc);

/* 按热度偏好分配三组配额 */
var ratio = { balanced: [0.4, 0.4], hot: [0.3, 0.55], niche: [0.3, 0.25]}[heatPref];
var coreTake = Math.min(corePool.length, Math.max(1, Math.round(count * ratio[0])));
var trendTake = Math.min(hotPool.length, Math.max(1, Math.round(count * ratio[1])));

var core = take(corePool, coreTake).map(toOutput);
var trending = take(hotPool, trendTake).map(toOutput);
var nicheLeft = count - core.length - trending.length;
var niche = take(nichePool, Math.max(0, nicheLeft)).map(toOutput);

/* 热度偏好只改变组内排序：hot 降序（默认），niche 升序 */
if (heatPref === "niche") {
var asc = function (a, b) { return a.heat - b.heat || (a.tag < b.tag? -1: 1);};
core.sort(asc); trending.sort(asc); niche.sort(asc);
}

return { core: core, trending: trending, niche: niche};
}

/* 下载文件名：hashtags-YYYYMMDD-HHmmss.txt */
function downloadFileName(d) {
d = d || new Date();
function p(n) { return (n < 10? "0": "") + n;}
return "hashtags-" + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) +
"-" + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()) + ".txt";
}

/* 三组拼装为可复制/下载文本 */
function formatAllText(res) {
function section(title, list) {
return "\n" + list.map(function (t) { return t.tag;}).join(" ") + "\n";
}
return section("核心标签", res.core) + "\n" + section("热门标签", res.trending) +
"\n" + section("长尾标签", res.niche);
}

/* node 测试导出（浏览器侧无 module，走下方 DOM 逻辑） */
if (typeof module!== 'undefined' && module.exports) {
module.exports = {
normalizeKeywords: normalizeKeywords,
matchTags: matchTags,
generateHashtags: generateHashtags,
badgeFor: badgeFor,
downloadFileName: downloadFileName,
formatAllText: formatAllText,
TAG_DB: TAG_DB,
PLATFORM_DEFAULT_COUNT: PLATFORM_DEFAULT_COUNT
};
}

/* ---------- DOM 逻辑（仅浏览器） ---------- */
if (typeof document!== 'undefined') {
document.addEventListener('DOMContentLoaded', function () {
'use strict';
function $(id) { return document.getElementById(id);}
var input = $('hg-input'), errBox = $('hg-error'),
platformSel = $('hg-platform'), countSel = $('hg-count'),
outWrap = $('hg-output-wrap');

function toast(msg) {
errBox.textContent = msg;
errBox.style.display = msg? 'block': 'none';
}

function currentOpts() {
var heatPref = 'balanced';
var radios = document.getElementsByName('hg-heat');
for (var i = 0; i < radios.length; i++) {
if (radios[i].checked) { heatPref = radios[i].value; break;}
}
return {
platform: platformSel.value,
count: parseInt(countSel.value, 10),
heatPref: heatPref
};
}

/* 平台切换时按平台默认建议同步数量档 */
platformSel.addEventListener('change', function () {
countSel.value = String(PLATFORM_DEFAULT_COUNT[platformSel.value] || 10);
});

var lastResult = null;

function chip(t) {
var s = document.createElement('span');
s.className = 'hg-chip';
var tagEl = document.createElement('span');
tagEl.className = 'hg-tag';
tagEl.textContent = t.tag;
var badgeEl = document.createElement('span');
badgeEl.className = 'hg-badge';
badgeEl.textContent = t.badge;
badgeEl.title = '热度 ' + t.heat + '（内置快照，非实时）';
s.appendChild(tagEl);
s.appendChild(badgeEl);
return s;
}

function renderGroup(title, desc, list, key) {
var box = document.createElement('div');
box.className = 'hg-group';
var head = document.createElement('div');
head.className = 'hg-group-head';
var h = document.createElement('h4');
h.textContent = title + '（' + list.length + '）';
h.title = desc;
head.appendChild(h);
var cp = document.createElement('button');
cp.className = 'btn btn-secondary hg-mini-btn';
cp.type = 'button';
    cp.textContent = '复制本组';
cp.addEventListener('click', function () {
copyText(list.map(function (t) { return t.tag;}).join(' '), '本组标签已复制');
});
head.appendChild(cp);
box.appendChild(head);
var chips = document.createElement('div');
chips.className = 'hg-chips';
list.forEach(function (t) { chips.appendChild(chip(t));});
box.appendChild(chips);
box.setAttribute('data-group', key);
return box;
}

function generate() {
toast('');
outWrap.innerHTML = '';
lastResult = null;
var kws;
try {
kws = normalizeKeywords(input.value);
} catch (e) {
toast('⚠ ' + e.message + '（每行一个关键词，1~20 个）');
input.focus();
return;
}
try {
lastResult = generateHashtags(kws, currentOpts());
} catch (e) {
toast('⚠ ' + e.message);
return;
}
var total = lastResult.core.length + lastResult.trending.length + lastResult.niche.length;
var meta = document.createElement('div');
meta.className = 'hg-meta';
meta.textContent = '共生成 ' + total + ' 个标签（关键词：' + kws.join('、') + '）';
outWrap.appendChild(meta);
outWrap.appendChild(renderGroup('核心标签', '与关键词直接命中的标签', lastResult.core, 'core'));
outWrap.appendChild(renderGroup('热门标签', '平台高热度通用标签', lastResult.trending, 'trending'));
outWrap.appendChild(renderGroup('长尾标签', '相关但相对小众的标签', lastResult.niche, 'niche'));
$('hg-actions').style.display = 'flex';
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
var el = $('hg-tip');
el.textContent = msg;
el.style.display = 'block';
clearTimeout(tipTimer);
tipTimer = setTimeout(function () { el.style.display = 'none';}, 1800);
}

$('hg-generate').addEventListener('click', generate);
$('hg-sample').addEventListener('click', function () {
input.value = '美妆\n旅行\n健身';
platformSel.value = 'xiaohongshu';
countSel.value = '10';
generate();
});
$('hg-clear').addEventListener('click', function () {
input.value = '';
outWrap.innerHTML = '';
$('hg-actions').style.display = 'none';
toast('');
input.focus();
});
$('hg-copy-all').addEventListener('click', function () {
if (!lastResult) { toast('⚠ 请先生成标签'); return;}
copyText(formatAllText(lastResult), '全部标签已复制');
});
$('hg-download').addEventListener('click', function () {
if (!lastResult) { toast('⚠ 请先生成标签'); return;}
var blob = new Blob([formatAllText(lastResult)], { type: 'text/plain;charset=utf-8'});
var a = document.createElement('a');
a.href = URL.createObjectURL(blob);
a.download = downloadFileName();
document.body.appendChild(a);
a.click();
setTimeout(function () { URL.revokeObjectURL(a.href); document.body.removeChild(a);}, 500);
alert2('已下载 ' + a.download);
});
});
}
})();
