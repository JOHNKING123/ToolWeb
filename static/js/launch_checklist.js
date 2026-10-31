/* 网站上线检查清单（launch_checklist）- 上线前逐项核对，纯前端本地计算
* 纯函数契约（失败约定沿用家族惯例：非法参数抛 Error，err.field 给出字段名，不静默钳制）：
* CHECKLIST 常量：[{id, name, items:[{id, text, hint, weight, blocker}]}]
* 五大分类、31 项、6 项必做阻断项、权重 1-3（供界面渲染与向量断言）
* computeReadiness(state) -> {score, ready, blockersPending, categories}
* state 为 {itemId: bool}；非对象 / 含未知键抛 Error（err.field）
* score = Σ(权重×已勾选)/Σ(权重)×100（四舍五入取整）
* ready = 阻断项全完成 且 score >= READY_THRESHOLD(80)
* categories: [{id, name, score, done, total}]（done/total 为项数）
* exportReport(state, nowIso) -> Markdown 字符串
* 含总分、就绪判定、分类得分、未完成阻断项、未完成普通项、已完成列表；
* 时间戳由调用方传入保持纯性（不传则取当前时间）
* 进度持久：localStorage 版本化键 toolweb.launch_checklist.v1
* 零网络请求：本文件不发起任何 fetch / XHR。 */
(function () {
'use strict';

var READY_THRESHOLD = 80;
var LS_KEY = 'toolweb.launch_checklist.v1';
var LS_VERSION = 1;

/* ---------- CHECKLIST 常量：五大分类，31 项，6 阻断，总权重 60 ---------- */
var CHECKLIST = [
{ id: 'domain', name: '域名可达性', items: [
{ id: 'dns-resolve', text: '域名 DNS 解析正常（www＋裸域）',
hint: '多地 ping / nslookup 确认 www 与裸域都解析到正确 IP', weight: 3, blocker: true},
{ id: 'domain-canonical', text: '裸域与 www 已统一（301 重定向到其一）',
hint: '只保留一个主域名，另一个 301，避免权重分散', weight: 2, blocker: false},
{ id: 'multi-isp', text: '境内外主流线路可访问（无 DNS 劫持、CDN 覆盖）',
hint: '移动 / 电信 / 联通＋境外抽查，确认无劫持到错误页面', weight: 2, blocker: false},
{ id: 'custom-error', text: '404 / 50x 有自定义错误页',
hint: '错误页带站内导航和返回首页入口，而非服务器默认页', weight: 1, blocker: false},
{ id: 'domain-expiry', text: '域名到期时间已登记续费',
hint: '半年内到期的先续费，顺手打开自动续费', weight: 1, blocker: false}
]},
{ id: 'https', name: 'HTTPS 与安全', items: [
{ id: 'https-force', text: '全站 HTTPS，HTTP 强制 301 跳转',
hint: 'http:// 直接 301 到 https://，无混合内容（mixed content）告警', weight: 3, blocker: true},
{ id: 'cert-valid', text: '证书有效且开启自动续签（到期前 30 天有提醒）',
hint: '证书链完整，续签脚本或平台自动续签已实际验证过', weight: 2, blocker: true},
{ id: 'security-headers', text: '安全响应头已配置（CSP / HSTS / X-Content-Type-Options）',
hint: '不会配 CSP 可用站内 CSP 安全头生成器生成；配完用 HTTP 响应头分析器验证是否真实生效', weight: 2, blocker: false},
{ id: 'hsts-age', text: 'HSTS max-age ≥ 31536000（含 subDomains）',
hint: '先小值试水再拉长，避免锁死后回滚不了 http', weight: 1, blocker: false},
{ id: 'debug-closed', text: '测试 / 调试页面已下线（不暴露 admin / test / dev 路径）',
hint: '后台管理入口改名或加白名单，测试账号已删除', weight: 3, blocker: false},
{ id: 'error-mask', text: '5xx 错误页已脱敏（不泄露堆栈 / 版本号）',
hint: '生产环境关闭 debug 模式，报错页只给友好提示', weight: 2, blocker: false},
{ id: 'anti-abuse', text: '登录 / 注册等表单有基础防刷（限流或验证码）',
hint: '短信 / 登录接口先做频率限制，避免被刷爆', weight: 2, blocker: false}
]},
{ id: 'seo', name: '抓取与索引', items: [
{ id: 'robots-ok', text: 'robots.txt 正确（收录路径＋Sitemap 声明）',
hint: '写完用站内 robots.txt 校验与测试器实际测一遍', weight: 2, blocker: false},
{ id: 'sitemap-ok', text: 'sitemap.xml 可访问且已更新',
hint: '单文件 URL ≤ 50000 条，lastmod 与线上内容一致', weight: 2, blocker: false},
{ id: 'meta-complete', text: '关键页 title / description / OG / canonical 完整',
hint: '首页 / 落地页 / 文章页三类抽查，分享到微信看卡片是否正常', weight: 2, blocker: false},
{ id: 'no-deadlink', text: '站内无死链 / 重定向链',
hint: '导航 / 页脚 / 文章内链点一遍，404 立刻修', weight: 1, blocker: false},
{ id: 'webmaster', text: '已提交搜索引擎站长平台（百度 / 必应 / Search Console）',
hint: '提交 sitemap，顺手看抓取异常报告', weight: 1, blocker: false},
{ id: 'noindex-removed', text: '测试期 noindex / Disallow 屏蔽已摘掉',
hint: '最容易漏的一条：上线前全局搜 noindex 和 robots 屏蔽规则', weight: 3, blocker: true}
]},
{ id: 'perf', name: '性能与体验', items: [
{ id: 'lcp', text: '首屏 LCP < 2.5s（弱网 / 手机复测）',
hint: '4G 节流＋低端安卓各测一遍，首屏图片懒加载', weight: 2, blocker: false},
{ id: 'compression', text: '静态资源开启 gzip / brotli 压缩',
hint: '看响应头 content-encoding，文本资源压缩率应 > 60%', weight: 2, blocker: false},
{ id: 'image-opt', text: '图片已压缩＋尺寸适配（无 MB 级原图直链）',
hint: '首屏图转 webp / avif，srcset 按屏宽给多尺寸', weight: 1, blocker: false},
{ id: 'cache-policy', text: '缓存策略合理（静态长缓存＋hash，HTML 不缓存）',
hint: '带 hash 的资源 cache 一年，index.html 必须 no-cache', weight: 2, blocker: false},
{ id: 'mobile-ok', text: '移动端排版正常（无横向滚动、按钮可点）',
hint: '375px 宽度真机或模拟器逐页滑一遍', weight: 3, blocker: true},
{ id: 'form-flow', text: '核心表单全流程走通（注册 / 登录 / 支付 / 提交）',
hint: '用真实账号走完一遍，别只测 happy path', weight: 2, blocker: false},
{ id: 'console-clean', text: '浏览器控制台无红错（JS Error / 404 资源）',
hint: 'F12 Console 清空后刷新，红字逐条消灭', weight: 2, blocker: false}
]},
{ id: 'ops', name: '内容合规与运维', items: [
{ id: 'icp', text: 'ICP 备案号 / 公安备案已展示（面向境内用户）',
hint: '页脚展示备案号并链到工信部，公安备案按属地要求', weight: 3, blocker: true},
{ id: 'legal-pages', text: '联系方式 / 隐私政策 / 用户协议页面齐全',
hint: '有用户注册 / 收集信息就必须有隐私政策', weight: 2, blocker: false},
{ id: 'monitor', text: '监控告警已接入（可用性 / 错误率 / 证书到期）',
hint: '至少 1 分钟级可用性拨测＋证书到期提前 14 天告警', weight: 2, blocker: false},
{ id: 'backup', text: '备份与回滚方案就绪（数据库＋静态资源）',
hint: '备份实际恢复演练过一次，回滚能在 10 分钟内完成', weight: 1, blocker: false},
{ id: 'deploy-drill', text: '发布流程已演练（灰度 / 回滚开关可用）',
hint: '紧急回滚按钮提前试过，别等到线上才第一次点', weight: 1, blocker: false},
{ id: 'third-party', text: '第三方 key / 配额已检查（支付 / 短信 / 地图）',
hint: '生产 key 已替换测试 key，短信 / 支付余额充足', weight: 2, blocker: false}
]}
];

/* 阻断项 id（按 CHECKLIST 顺序）：dns-resolve, https-force, cert-valid,
* noindex-removed, mobile-ok, icp —— 共 6 项，总权重 60。 */

/* ---------- 内部工具 ---------- */
function fail(field, msg) {
var e = new Error(msg);
e.field = field;
throw e;
}

var ALL_IDS = {};
var ITEM_BY_ID = {};
CHECKLIST.forEach(function (cat) {
cat.items.forEach(function (it) {
ALL_IDS[it.id] = true;
ITEM_BY_ID[it.id] = { catId: cat.id, catName: cat.name, item: it};
});
});

function pct(doneW, totalW) {
return totalW <= 0? 0: Math.round(doneW / totalW * 100);
}

/* ---------- computeReadiness：权重就绪得分 ---------- */
function computeReadiness(state) {
if (!state || typeof state!== 'object' || Array.isArray(state)) {
fail('state', 'state 必须为对象 {itemId: bool}');
}
Object.keys(state).forEach(function (k) {
if (!ALL_IDS[k]) fail(k, '未知检查项：' + k);
});
var doneW = 0, totalW = 0;
var blockersPending = [];
var categories = [];
var doneCount = 0, totalCount = 0;
CHECKLIST.forEach(function (cat) {
var cw = 0, cd = 0, cDone = 0;
cat.items.forEach(function (it) {
totalW += it.weight;
cw += it.weight;
totalCount++;
if (state[it.id] === true) {
doneW += it.weight;
cd += it.weight;
cDone++;
doneCount++;
} else if (it.blocker) {
blockersPending.push(it.id);
}
});
categories.push({
id: cat.id, name: cat.name,
score: pct(cd, cw), done: cDone, total: cat.items.length
});
});
var score = pct(doneW, totalW);
return {
score: score,
ready: blockersPending.length === 0 && score >= READY_THRESHOLD,
blockersPending: blockersPending,
categories: categories,
doneCount: doneCount,
totalCount: totalCount
};
}

/* ---------- exportReport：Markdown 报告 ---------- */
function exportReport(state, nowIso) {
var r = computeReadiness(state);
var when = nowIso || new Date().toISOString();
var lines = [];
lines.push('# 网站上线检查报告');
lines.push('');
lines.push('- 检查时间：' + when);
lines.push('- 就绪得分：' + r.score + ' / 100');
lines.push('- 就绪判定：' + (r.ready? '✅ 可以上线': '❌ 暂缓上线') +
(r.blockersPending.length? '（' + r.blockersPending.length + ' 项阻断未完成）': ''));
lines.push('- 完成进度：' + r.doneCount + ' / ' + r.totalCount + ' 项');
lines.push('');
lines.push('## 分类得分');
lines.push('');
r.categories.forEach(function (c) {
lines.push('- ' + c.name + '：' + c.score + ' 分（' + c.done + '/' + c.total + ' 项）');
});
lines.push('');
lines.push('## 未完成阻断项（' + r.blockersPending.length + '）');
lines.push('');
if (r.blockersPending.length === 0) {
lines.push('（无，阻断项已全部完成）');
} else {
r.blockersPending.forEach(function (id) {
var e = ITEM_BY_ID[id];
lines.push('- [] ' + e.item.text + '');
});
}
lines.push('');
lines.push('## 未完成普通项');
lines.push('');
var normalPending = [];
CHECKLIST.forEach(function (cat) {
cat.items.forEach(function (it) {
if (state[it.id]!== true &&!it.blocker) normalPending.push({ catName: cat.name, item: it});
});
});
lines.push('（共 ' + normalPending.length + ' 项）');
normalPending.forEach(function (e) {
lines.push('- [] ' + e.item.text + '');
});
lines.push('');
lines.push('## 已完成（' + r.doneCount + '）');
lines.push('');
var doneItems = [];
CHECKLIST.forEach(function (cat) {
cat.items.forEach(function (it) {
if (state[it.id] === true) doneItems.push({ catName: cat.name, item: it});
});
});
if (doneItems.length === 0) {
lines.push('（无）');
} else {
doneItems.forEach(function (e) {
lines.push('- [x] ' + e.item.text + '');
});
}
lines.push('');
lines.push('> 说明：本清单为静态核对＋自评打分，不做真实联网检测；权重与 80 分阈值为经验参考值，非审计标准。');
lines.push('> 由 ToolWeb 网站上线检查清单生成：https://www.johnkingzcq123.xyz/tools/launch-checklist');
return lines.join('\n');
}

/* ---------- 浏览器 UI ---------- */
function $(id) { return document.getElementById(id);}

function loadState() {
try {
var raw = localStorage.getItem(LS_KEY);
if (!raw) return {};
var p = JSON.parse(raw);
if (!p || p.v!== LS_VERSION ||!p.state || typeof p.state!== 'object') return {};
var clean = {};
Object.keys(p.state).forEach(function (k) {
if (ALL_IDS[k] && p.state[k] === true) clean[k] = true;
});
return clean;
} catch (e) {
return {};
}
}

function saveState(state) {
try {
localStorage.setItem(LS_KEY, JSON.stringify({ v: LS_VERSION, state: state, savedAt: new Date().toISOString()}));
} catch (e) { /* 配额满等情况静默忽略，不打断使用 */}
}

function nowIsoLocal() {
var d = new Date();
function p(n) { return (n < 10? '0': '') + n;}
var off = -d.getTimezoneOffset();
var sign = off >= 0? '+': '-';
var a = Math.abs(off);
return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' +
p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()) +
sign + p(Math.floor(a / 60)) + ':' + p(a % 60);
}

function init() {
var listBox = $('lc-list');
if (!listBox) return; /* node 环境无 DOM，直接跳过。 */
var state = loadState();
var banner = $('lc-banner');
var scoreNum = $('lc-score-num');
var ringFg = $('lc-ring-fg');
var readyLabel = $('lc-ready');
var barsBox = $('lc-bars');
var statusBox = $('lc-status');
var RING_C = 2 * Math.PI * 54;

/* 渲染清单 DOM（按 CHECKLIST 常量）。 */
CHECKLIST.forEach(function (cat, ci) {
var det = document.createElement('details');
det.className = 'lc-cat';
det.open = true;
det.id = 'lc-cat-' + cat.id;
var sum = document.createElement('summary');
sum.className = 'lc-cat-head';
sum.innerHTML = '<span class="lc-cat-name">' + cat.name + '</span>' +
'<span class="lc-cat-meta"><span class="lc-cat-count"></span><span class="lc-bar"><i></i></span></span>';
det.appendChild(sum);
var ul = document.createElement('ul');
ul.className = 'lc-items';
cat.items.forEach(function (it) {
var li = document.createElement('li');
li.className = 'lc-item' + (it.blocker? ' is-blocker': '');
li.innerHTML =
'<label class="lc-check"><input type="checkbox" data-item="' + it.id + '"' +
(state[it.id] === true? ' checked': '') + '>' +
'<span class="lc-text">' + it.text + '</span></label>' +
'<span class="lc-badges">' +
(it.blocker? '<span class="lc-badge lc-badge-blocker">必做·阻断</span>': '') +
'<span class="lc-badge">权重 ' + it.weight + '</span></span>' +
'<div class="lc-hint">' + it.hint + '</div>';
ul.appendChild(li);
});
det.appendChild(ul);
listBox.appendChild(det);
});

function currentState() {
return state;
}

function update() {
var r = computeReadiness(state);
scoreNum.textContent = r.score;
ringFg.style.strokeDashoffset = String(RING_C * (1 - r.score / 100));
ringFg.setAttribute('stroke', r.ready? '#059669': (r.blockersPending.length? '#dc2626': '#d97706'));
if (r.ready) {
readyLabel.innerHTML = '<b class="lc-ok">✅ 就绪：可以上线</b><span>阻断项已全部完成，就绪得分 ≥ ' + READY_THRESHOLD + ' 分</span>';
} else if (r.blockersPending.length) {
readyLabel.innerHTML = '<b class="lc-bad">❌ 暂缓上线</b><span>' + r.blockersPending.length + ' 项阻断未完成</span>';
} else {
readyLabel.innerHTML = '<b class="lc-warn">⚠️ 分数未达标</b><span>阻断项已完成，但就绪得分 ' + r.score + ' < ' + READY_THRESHOLD + ' 分</span>';
}
if (r.blockersPending.length) {
banner.style.display = '';
$('lc-banner-n').textContent = r.blockersPending.length;
} else {
banner.style.display = 'none';
}
/* 分类得分条。 */
barsBox.innerHTML = '';
r.categories.forEach(function (c) {
var row = document.createElement('div');
row.className = 'lc-bar-row';
row.innerHTML = '<span class="lc-bar-name">' + c.name + '</span>' +
'<span class="lc-bar-track"><i style="width:' + c.score + '%"></i></span>' +
'<span class="lc-bar-val">' + c.score + ' 分 · ' + c.done + '/' + c.total + ' 项</span>';
barsBox.appendChild(row);
});
/* 分类头计数。 */
CHECKLIST.forEach(function (cat) {
var det = $('lc-cat-' + cat.id);
var done = cat.items.filter(function (it) { return state[it.id] === true;}).length;
det.querySelector('.lc-cat-count').textContent = done + '/' + cat.items.length + ' 项';
var pctv = cat.items.length? Math.round(done / cat.items.length * 100): 0;
det.querySelector('.lc-bar i').style.width = pctv + '%';
});
statusBox.textContent = '已完成 ' + r.doneCount + ' / ' + r.totalCount + ' 项 · 进度已自动保存到本浏览器';
saveState(state);
}

listBox.addEventListener('change', function (ev) {
var t = ev.target;
if (t && t.getAttribute && t.getAttribute('data-item')) {
var id = t.getAttribute('data-item');
if (t.checked) state[id] = true;
else delete state[id];
update();
}
});

function done() { /* 复制/下载后状态提示 */}

/* 复制 Markdown 报告。 */
$('lc-copy').addEventListener('click', function () {
var txt = exportReport(currentState(), nowIsoLocal());
function ok() { statusBox.textContent = 'Markdown 报告已复制到剪贴板';}
if (navigator.clipboard && navigator.clipboard.writeText) {
navigator.clipboard.writeText(txt).then(ok, function () { fallbackCopy(txt); ok();});
} else { fallbackCopy(txt); ok();}
});
function fallbackCopy(txt) {
var ta = document.createElement('textarea');
ta.value = txt;
ta.style.position = 'fixed'; ta.style.opacity = '0';
document.body.appendChild(ta);
ta.select();
try { document.execCommand('copy');} catch (e) { /* 忽略 */}
document.body.removeChild(ta);
}

/* 下载.md。 */
$('lc-download').addEventListener('click', function () {
var txt = exportReport(currentState(), nowIsoLocal());
var blob = new Blob([txt], { type: 'text/markdown;charset=utf-8'});
var a = document.createElement('a');
a.href = URL.createObjectURL(blob);
a.download = '网站上线检查报告.md';
document.body.appendChild(a);
a.click();
setTimeout(function () {
URL.revokeObjectURL(a.href);
document.body.removeChild(a);
}, 500);
statusBox.textContent = '报告已下载（网站上线检查报告.md）';
});

/* 打印。 */
$('lc-print').addEventListener('click', function () { window.print();});
window.addEventListener('beforeprint', function () {
var dets = listBox.querySelectorAll('details');
for (var i = 0; i < dets.length; i++) dets[i].open = true;
});

/* 重置（二次确认）。 */
$('lc-reset').addEventListener('click', function () {
if (!window.confirm('确定要清空全部勾选吗？\n进度将从本浏览器删除，此操作不可撤销。')) return;
state = {};
var boxes = listBox.querySelectorAll('input[type="checkbox"]');
for (var i = 0; i < boxes.length; i++) boxes[i].checked = false;
update();
statusBox.textContent = '已重置：全部勾选已清空';
});

update();
}

if (typeof document!== 'undefined' && document.readyState) {
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
}

if (typeof module!== 'undefined' && module.exports) {
module.exports = {
CHECKLIST: CHECKLIST,
READY_THRESHOLD: READY_THRESHOLD,
LS_KEY: LS_KEY,
LS_VERSION: LS_VERSION,
computeReadiness: computeReadiness,
exportReport: exportReport
};
}
})();
