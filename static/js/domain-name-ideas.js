/* 域名创意生成器（domain_name_ideas）- 纯前端域名组合创意引擎
* 纯函数契约（失败约定沿用家族惯例：非法参数抛 Error，err.field 给出字段名，不静默钳制）：
* 1) normalizeKeywords(input) → string[]
* - input 为 string：按逗号/空格/换行/顿号/分号切分；为 string[]：逐项处理；
* - 清洗：trim、去空、去重（英文大小写不敏感，保留首次出现形式）、截断 3 个；
* - input 非字符串/数组、数组元素非字符串、或清洗后为空 → 抛 Error（err.field="input"）。
* 2) toPinyin(word) → string
* - word 须为字符串（空字符串亦非法，err.field="word"）；
* - 中文字符按内置常用字表转小写拼音（无声调，借鉴 slug_generator 字表方案＋域名常用字增补）；
* - 字表未收录的生僻字原样保留（真限制②：转写可能不准）；
* - 非中文字符（字母/数字/空格等）转小写原样保留。
* 3) combineIdeas(keywords, opts) → string[]
* - keywords 非数组或为空 → 抛 Error（err.field="keywords"）；元素非字符串/空 → 抛 Error（err.field="keywords"）；
* - opts.styles：风格子集数组，合法值 prefix/suffix/concat/transform（缺省全选）；
* 非数组/空数组/含非法值 → 抛 Error（err.field="styles"）；
* - opts.perStyle：每风格条数，缺省 10，须为 1~60 整数 → 否则抛 Error（err.field="perStyle"）；
* - 四组生成器（固定库顺序，保证跨环境确定性）：
* 前缀法：PREFIXES × 关键词轮询（get+kafei）；后缀法：关键词 × SUFFIXES 轮询（kafei+hub）；
* 拼接组合：关键词有序对连写＋短横连接（kafeishop / kafei-shop）；单关键词时自配对；
* 创意变形：去元音（kafei→kf）/ 末字母双写（kafei→kafeii）/ 常用替换 e→3、o→0、s→z（kafei→kaf3i）；
* - 输出按前缀→后缀→拼接→变形顺序拼接，各组内部经 isValidLabel 过滤＋全局去重。
* 4) buildDomainLabels(ideas, tlds) → string[]（形如 label.tld）
* - ideas 非数组 → 抛 Error（err.field="ideas"）；元素非字符串/空 → 抛 Error（err.field="ideas"）；
* - tlds 非数组/空数组 → 抛 Error（err.field="tlds"）；元素须为字符串（允许前导点），
* 去点转小写后须匹配 /^[a-z0-9-]+$/，否则抛 Error（err.field="tlds"）；
* - ideas × tlds 笛卡尔展开，去重，顺序为 ideas 主序、tlds 次序。
* 5) isValidLabel(label) → boolean（LDH 规则）
* - 仅含 a-z0-9-、不以连字符开头或结尾、长度 1~63、全小写；非字符串 → false。
* 零网络请求：本文件不发起任何 fetch / XHR；拼音字表为内置静态快照，不上传。
*/
(function () {
'use strict';

function badParam(field, message) {
var e = new Error(message);
e.field = field;
return e;
}

/* ---------- 内置拼音字表（借鉴 slug_generator 字表方案，增补域名常用字；静态快照，非实时） ---------- */
var PINYIN_RAW =
'工:gong 具:ju 网:wang 站:zhan 优:you 化:hua 实:shi 战:zhan 的:de 是:shi 在:zai ' +
'有:you 和:he 不:bu 我:wo 你:ni 他:ta 她:ta 们:men 这:zhe 那:na 个:ge 一:yi 二:er ' +
'三:san 四:si 五:wu 六:liu 七:qi 八:ba 九:jiu 十:shi 百:bai 千:qian 万:wan 年:nian ' +
'月:yue 日:ri 天:tian 人:ren 大:da 小:xiao 中:zhong 国:guo 上:shang 下:xia 左:zuo ' +
'右:you 前:qian 后:hou 内:nei 外:wai 来:lai 去:qu 到:dao 回:hui 走:zou 跑:pao 飞:fei ' +
'吃:chi 喝:he 睡:shui 看:kan 听:ting 说:shuo 读:du 写:xie 学:xue 校:xiao 生:sheng ' +
'老:lao 新:xin 好:hao 高:gao 低:di 长:chang 短:duan 快:kuai 慢:man 多:duo 全:quan ' +
'每:mei 点:dian 分:fen 时:shi 今:jin 明:ming 昨:zuo 早:zao 晚:wan 手:shou 机:ji ' +
'电:dian 脑:nao 视:shi 频:pin 音:yin 乐:le 图:tu 片:pian 文:wen 章:zhang 标:biao ' +
'题:ti 容:rong 搜:sou 索:suo 引:yin 擎:qing 排:pai 名:ming 关:guan 键:jian 词:ci ' +
'流:liu 量:liang 击:ji 转:zhuan 换:huan 率:lu 析:xi 报:bao 告:gao 作:zuo 项:xiang ' +
'目:mu 团:tuan 队:dui 理:li 开:kai 发:fa 测:ce 试:shi 版:ban 本:ben 布:bu 线:xian ' +
'修:xiu 复:fu 问:wen 答:da 帮:bang 助:zhu 如:ru 何:he 什:shen 么:me 为:wei 以:yi ' +
'下:xia 除:chu 包:bao 含:han 使:shi 用:yong 户:hu 访:fang 客:ke 注:zhu 册:ce ' +
'登:deng 录:lu 退:tui 出:chu 密:mi 码:ma 账:zhang 号:hao 设:she 置:zhi 默:mo ' +
'认:ren 选:xuan 择:ze 添:tian 加:jia 删:shan 改:gai 查:cha 询:xun 找:zhao 创:chuang ' +
'建:jian 存:cun 取:qu 消:xiao 确:que 提:ti 交:jiao 送:song 接:jie 收:shou 请:qing ' +
'求:qiu 响:xiang 应:ying 服:fu 务:wu 器:qi 数:shu 据:ju 库:ku 表:biao 单:dan ' +
'页:ye 面:mian 首:shou 尾:wei 头:tou 末:mo 始:shi 终:zhong 过:guo 程:cheng 结:jie ' +
'果:guo 方:fang 法:fa 步:bu 骤:zhou 操:cao 指:zhi 南:nan 案:an 公:gong 司:si ' +
'产:chan 品:pin 牌:pai 市:shi 场:chang 营:ying 销:xiao 售:shou 推:tui 广:guang ' +
'活:huo 动:dong 惠:hui 价:jia 格:ge 钱:qian 免:mian 费:fei 付:fu 款:kuan 订:ding ' +
'物:wu 仓:cang 储:chu 运:yun 输:shu 递:di 配:pei 达:da 裹:guo 件:jian 货:huo ' +
'架:jia 完:wan 成:cheng 功:gong 能:neng 效:xiao ' +
/* 域名常用字增补 */
'咖:ka 啡:fei 奶:nai 茶:cha 云:yun 智:zhi 购:gou 游:you 店:dian 行:xing 达:da ' +
'车:che 房:fang 酒:jiu 医:yi 药:yao 宠:chong 婚:hun 婴:ying 童:tong 书:shu 画:hua ' +
'歌:ge 影:ying 剧:ju 游:you 玩:wan 赛:sai 球:qiu 跑:pao 骑:qi 钓:diao 拍:pai';

var pinyinTable = null;

function loadPinyinTable() {
if (pinyinTable) return pinyinTable;
pinyinTable = {};
var parts = PINYIN_RAW.split(' ');
for (var i = 0; i < parts.length; i++) {
var kv = parts[i].split(':');
if (kv.length === 2 && kv[0] && kv[1] &&!pinyinTable[kv[0]]) pinyinTable[kv[0]] = kv[1];
}
return pinyinTable;
}

function isCjk(cp) {
return (cp >= 0x3400 && cp <= 0x4DBF) || /* 扩展 A */
(cp >= 0x4E00 && cp <= 0x9FFF) || /* 基本区 */
(cp >= 0xF900 && cp <= 0xFAFF) || /* 兼容 */
(cp >= 0x20000 && cp <= 0x2EBEF); /* 扩展 B–F */
}

/* ---------- 风格库（固定顺序，确定性） ---------- */
var STYLES = ["prefix", "suffix", "concat", "transform"];
var STYLE_NAMES = {
prefix: "前缀创意",
suffix: "后缀创意",
concat: "组合拼接",
transform: "创意变形"
};
var PREFIXES = ["get", "my", "go", "try", "pro", "i", "e", "hey", "top", "neo"];
var SUFFIXES = ["hub", "lab", "ly", "io", "fy", "app", "zone", "works", "studio", "pro"];
var TLDS = ["com", "cn", "net", "io", "dev", "xyz"];
var MAX_KEYWORDS = 3;
var DEFAULT_PER_STYLE = 10;
var MAX_PER_STYLE = 60;
/* LDH：仅 a-z0-9-、不首尾连字符、长度 1~63、全小写 */
var LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
var TLD_RE = /^[a-z0-9-]+$/;

/* ---------- 1) normalizeKeywords ---------- */
function normalizeKeywords(input) {
var raw;
if (typeof input === "string") {
raw = input.split(/[\s,，、；;|]+/);
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
var k = t.toLowerCase();
if (seen[k]) continue;
seen[k] = true;
out.push(t);
if (out.length >= MAX_KEYWORDS) break;
}
if (out.length === 0) {
throw badParam("input", "normalizeKeywords: 关键词为空，请输入 1~3 个关键词");
}
return out;
}

/* ---------- 2) toPinyin ---------- */
function toPinyin(word) {
if (typeof word!== "string" ||!word) {
throw badParam("word", "toPinyin: word 须为非空字符串");
}
var table = loadPinyinTable();
var out = [];
for (var i = 0; i < word.length; i++) {
var ch = word.charAt(i), cp = word.charCodeAt(i);
if (isCjk(cp)) {
out.push(table[ch] || ch); /* 字表未收录的生僻字原样保留（真限制②） */
} else {
out.push(ch.toLowerCase());
}
}
return out.join("");
}

/* ---------- 3) combineIdeas ---------- */
function stripVowels(s) {
var r = s.replace(/[aeiou]/g, "");
return r.length >= 2? r: "";
}
function doubleLast(s) {
return s + s.charAt(s.length - 1);
}
function leetSpeak(s) {
return s.replace(/e/g, "3").replace(/o/g, "0").replace(/s/g, "z");
}

function genPrefix(kws, n) {
var out = [];
for (var p = 0; p < PREFIXES.length && out.length < n; p++) {
for (var k = 0; k < kws.length && out.length < n; k++) {
out.push(PREFIXES[p] + kws[k]);
}
}
return out;
}

function genSuffix(kws, n) {
var out = [];
for (var s = 0; s < SUFFIXES.length && out.length < n; s++) {
for (var k = 0; k < kws.length && out.length < n; k++) {
out.push(kws[k] + SUFFIXES[s]);
}
}
return out;
}

function genConcat(kws, n) {
var out = [];
function push2(a, b) {
if (out.length < n) out.push(a);
if (out.length < n) out.push(b);
}
if (kws.length < 2) {
push2(kws[0] + kws[0], kws[0] + "-" + kws[0]);
return out;
}
for (var i = 0; i < kws.length && out.length < n; i++) {
for (var j = 0; j < kws.length && out.length < n; j++) {
if (i === j) continue;
push2(kws[i] + kws[j], kws[i] + "-" + kws[j]);
}
}
return out;
}

function genTransform(kws, n) {
var kinds = [stripVowels, doubleLast, leetSpeak];
var out = [];
for (var t = 0; t < kinds.length && out.length < n; t++) {
for (var k = 0; k < kws.length && out.length < n; k++) {
var v = kinds[t](kws[k]);
if (v && v!== kws[k]) out.push(v);
}
}
return out;
}

var STYLE_GEN = {
prefix: genPrefix,
suffix: genSuffix,
concat: genConcat,
transform: genTransform
};

function combineIdeas(keywords, opts) {
if (!Array.isArray(keywords) || keywords.length === 0) {
throw badParam("keywords", "combineIdeas: keywords 须为非空数组");
}
opts = opts || {};
var styles = opts.styles === undefined? STYLES.slice(): opts.styles;
if (!Array.isArray(styles) || styles.length === 0) {
throw badParam("styles", "combineIdeas: styles 须为非空数组");
}
for (var s = 0; s < styles.length; s++) {
if (STYLES.indexOf(styles[s]) === -1) {
throw badParam("styles", "combineIdeas: styles 非法值 " + JSON.stringify(styles[s]) +
"，合法值 " + STYLES.join("/"));
}
}
var perStyle = opts.perStyle === undefined? DEFAULT_PER_STYLE: opts.perStyle;
if (typeof perStyle!== "number" || perStyle % 1!== 0 || perStyle < 1 || perStyle > MAX_PER_STYLE) {
throw badParam("perStyle", "combineIdeas: perStyle 须为 1~" + MAX_PER_STYLE + " 的整数");
}

var kws = [];
for (var i = 0; i < keywords.length; i++) {
var kw = keywords[i];
if (typeof kw!== "string" ||!kw.trim()) {
throw badParam("keywords", "combineIdeas: keywords 元素须为非空字符串（下标 " + i + "）");
}
kws.push(kw.trim().toLowerCase());
}

var result = [];
var ordered = STYLES.filter(function (st) { return styles.indexOf(st)!== -1;});
ordered.forEach(function (st) {
var list = STYLE_GEN[st](kws, perStyle);
for (var j = 0; j < list.length; j++) {
var label = list[j];
if (isValidLabel(label) && result.indexOf(label) === -1) result.push(label);
}
});
return result;
}

/* ---------- 4) buildDomainLabels ---------- */
function buildDomainLabels(ideas, tlds) {
if (!Array.isArray(ideas)) {
throw badParam("ideas", "buildDomainLabels: ideas 须为数组");
}
if (!Array.isArray(tlds) || tlds.length === 0) {
throw badParam("tlds", "buildDomainLabels: tlds 须为非空数组");
}
var cleanTlds = [];
for (var i = 0; i < tlds.length; i++) {
var t = tlds[i];
if (typeof t!== "string") {
throw badParam("tlds", "buildDomainLabels: tlds 元素须为字符串（下标 " + i + "）");
}
t = t.trim().toLowerCase();
if (t.charAt(0) === ".") t = t.slice(1);
if (!TLD_RE.test(t)) {
throw badParam("tlds", "buildDomainLabels: tlds 非法值 " + JSON.stringify(tlds[i]));
}
cleanTlds.push(t);
}
var out = [], seen = {};
for (var j = 0; j < ideas.length; j++) {
var label = ideas[j];
if (typeof label!== "string" ||!label) {
throw badParam("ideas", "buildDomainLabels: ideas 元素须为非空字符串（下标 " + j + "）");
}
for (var k = 0; k < cleanTlds.length; k++) {
var d = label + "." + cleanTlds[k];
if (!seen[d]) { seen[d] = true; out.push(d);}
}
}
return out;
}

/* ---------- 5) isValidLabel ---------- */
function isValidLabel(label) {
if (typeof label!== "string") return false;
return LABEL_RE.test(label);
}

/* 下载文件名：domain-ideas-YYYYMMDD-HHmmss.txt */
function downloadFileName(d) {
d = d || new Date();
function p(n) { return (n < 10? "0": "") + n;}
return "domain-ideas-" + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) +
"-" + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()) + ".txt";
}

/* 四组拼装为可复制/下载文本（形如 label.tld） */
function formatAllText(groups) {
var lines = [];
STYLES.forEach(function (st) {
var list = groups[st] || [];
if (list.length === 0) return;
lines.push("");
for (var i = 0; i < list.length; i++) lines.push(list[i]);
lines.push("");
});
return lines.join("\n");
}

/* node 测试导出（浏览器侧无 module，走下方 DOM 逻辑） */
if (typeof module!== 'undefined' && module.exports) {
module.exports = {
normalizeKeywords: normalizeKeywords,
toPinyin: toPinyin,
combineIdeas: combineIdeas,
buildDomainLabels: buildDomainLabels,
isValidLabel: isValidLabel,
downloadFileName: downloadFileName,
formatAllText: formatAllText,
PREFIXES: PREFIXES,
SUFFIXES: SUFFIXES,
TLDS: TLDS,
STYLES: STYLES,
STYLE_NAMES: STYLE_NAMES,
MAX_KEYWORDS: MAX_KEYWORDS
};
}

/* ---------- DOM 逻辑（仅浏览器） ---------- */
if (typeof document!== 'undefined') {
document.addEventListener('DOMContentLoaded', function () {
'use strict';
function $(id) { return document.getElementById(id);}
var input = $('dny-input'), errBox = $('dny-error'), tipBox = $('dny-tip'),
outWrap = $('dny-output-wrap');

var GROUP_DESC = {
prefix: "关键词前加 get/my/go… 等前缀",
suffix: "关键词后加 hub/lab/ly… 等后缀",
concat: "多关键词连写或短横连接",
transform: "去元音 / 末字母双写 / 形近替换"
};

function toast(msg) {
errBox.textContent = msg;
errBox.style.display = msg? 'block': 'none';
}

function checkedValues(name) {
var out = [];
var boxes = document.getElementsByName(name);
for (var i = 0; i < boxes.length; i++) {
if (boxes[i].checked) out.push(boxes[i].value);
}
return out;
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

var tipTimer = null;
function alert2(msg) {
tipBox.textContent = msg;
tipBox.style.display = 'block';
clearTimeout(tipTimer);
tipTimer = setTimeout(function () { tipBox.style.display = 'none';}, 1800);
}

var lastGroups = null;

function domainRow(domain) {
var row = document.createElement('div');
row.className = 'dny-row';
var name = document.createElement('span');
name.className = 'dny-domain';
name.textContent = domain;
var cp = document.createElement('button');
cp.className = 'btn btn-secondary dny-mini-btn';
cp.type = 'button';
cp.textContent = '复制';
cp.addEventListener('click', function () {
copyText(domain, '已复制 ' + domain);
});
row.appendChild(name);
row.appendChild(cp);
return row;
}

function renderGroup(styleKey, domains) {
var box = document.createElement('div');
box.className = 'dny-group';
box.setAttribute('data-group', styleKey);
var head = document.createElement('div');
head.className = 'dny-group-head';
var h = document.createElement('h4');
h.textContent = STYLE_NAMES[styleKey] + '（' + domains.length + '）';
h.title = GROUP_DESC[styleKey];
head.appendChild(h);
var cp = document.createElement('button');
cp.className = 'btn btn-secondary dny-mini-btn';
cp.type = 'button';
cp.textContent = '复制本组';
cp.addEventListener('click', function () {
copyText(domains.join('\n'), STYLE_NAMES[styleKey] + '已复制（' + domains.length + ' 条）');
});
head.appendChild(cp);
box.appendChild(head);
var list = document.createElement('div');
list.className = 'dny-list';
domains.forEach(function (d) { list.appendChild(domainRow(d));});
box.appendChild(list);
return box;
}

function generate() {
toast('');
outWrap.innerHTML = '';
lastGroups = null;
var kws;
try {
kws = normalizeKeywords(input.value);
} catch (e) {
toast('⚠ ' + e.message + '（关键词 1~3 个，逗号/空格/换行分隔）');
input.focus();
return;
}
var styles = checkedValues('dny-style');
if (styles.length === 0) {
toast('⚠ 请至少勾选一种组合风格');
return;
}
var tlds = checkedValues('dny-tld');
if (tlds.length === 0) {
toast('⚠ 请至少勾选一个 TLD');
return;
}
/* 中文关键词先转拼音（纯前端本地字表） */
var latin = kws.map(function (w) { return toPinyin(w);});
lastGroups = {};
var total = 0;
styles.slice().sort(function (a, b) { return STYLES.indexOf(a) - STYLES.indexOf(b);})
.forEach(function (st) {
var labels;
try {
labels = combineIdeas(latin, { styles: [st], perStyle: DEFAULT_PER_STYLE});
} catch (e) {
labels = [];
}
var domains = buildDomainLabels(labels, tlds);
lastGroups[st] = domains;
total += domains.length;
});
var meta = document.createElement('div');
meta.className = 'dny-meta';
meta.textContent = '关键词：' + kws.join('、') +
(latin.join('、')!== kws.join('、')? '（转写：' + latin.join('、') + '）': '') +
'，共生成 ' + total + ' 个域名创意';
outWrap.appendChild(meta);
STYLES.forEach(function (st) {
if (lastGroups[st] && lastGroups[st].length > 0) {
outWrap.appendChild(renderGroup(st, lastGroups[st]));
}
});
$('dny-actions').style.display = total > 0? 'flex': 'none';
}

$('dny-generate').addEventListener('click', generate);
$('dny-sample').addEventListener('click', function () {
input.value = '咖啡\n奶茶';
var boxes = document.getElementsByName('dny-style');
for (var i = 0; i < boxes.length; i++) boxes[i].checked = true;
var tlds = document.getElementsByName('dny-tld');
for (var j = 0; j < tlds.length; j++) tlds[j].checked = true;
generate();
});
$('dny-clear').addEventListener('click', function () {
input.value = '';
outWrap.innerHTML = '';
$('dny-actions').style.display = 'none';
toast('');
input.focus();
});
$('dny-copy-all').addEventListener('click', function () {
if (!lastGroups) { toast('⚠ 请先生成创意'); return;}
copyText(formatAllText(lastGroups), '全部域名创意已复制');
});
$('dny-download').addEventListener('click', function () {
if (!lastGroups) { toast('⚠ 请先生成创意'); return;}
var blob = new Blob(["域名创意生成器\r\n生成时间：" + new Date().toLocaleString() + "\r\n\r\n" +
formatAllText(lastGroups)], { type: 'text/plain;charset=utf-8'});
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
