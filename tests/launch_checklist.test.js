/* 网站上线检查清单纯逻辑单元测试（零依赖）：node tests/launch_checklist.test.js
 * 覆盖：CHECKLIST 常量完整性（5 分类/31 项/6 阻断/权重 1-3）、
 * computeReadiness 确定性向量逐值命中（全选 100、全空 0、单 blocker 未选 ready=false、
 * 分类得分、加权分数手算值）、非法 state 抛 Error（含 err.field）、
 * exportReport 内容断言、READY_THRESHOLD、
 * categories.go 注册（Path 总数 243→244）与零网络请求静态检查、
 * 真限制三条明示、互链合规（CSP/HTTP 响应头分析器/robots.txt 校验与测试器/ads.txt 校验器双向）。 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/launch_checklist.js");

var pass = 0, fail = 0;
function sval(v) { return JSON.stringify(v); }
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + sval(b) + "，实得 " + sval(a) + "）"); }
function deepEq(a, b, name) { ok(sval(a) === sval(b), name + "（期望 " + sval(b) + "，实得 " + sval(a) + "）"); }
function has(src, sub, name) { ok(src.indexOf(sub) >= 0, name + "（缺：" + sub + "）"); }
function notHas(src, sub, name) { ok(src.indexOf(sub) < 0, name + "（不应含：" + sub + "）"); }
function throwsWithField(fn, field, name) {
  try { fn(); } catch (e) {
    ok(e instanceof Error, name + "：抛出 Error 类型");
    eq(e.field, field, name + "：err.field");
    return;
  }
  fail++; console.error("FAIL:", name + "：未抛出异常");
}
function throwsAny(fn, name) {
  try { fn(); } catch (e) {
    ok(e instanceof Error, name + "：抛出 Error 类型");
    ok(e.field !== undefined && e.field !== null && e.field !== "", name + "：err.field 非空");
    return;
  }
  fail++; console.error("FAIL:", name + "：未抛出异常");
}

var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "launch_checklist.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "launch_checklist.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

/* ---------- 1. CHECKLIST 常量完整性 ---------- */
eq(M.CHECKLIST.length, 5, "CHECKLIST 共 5 个分类");
deepEq(M.CHECKLIST.map(function (c) { return c.id; }),
  ["domain", "https", "seo", "perf", "ops"], "五分类 id 顺序");
deepEq(M.CHECKLIST.map(function (c) { return c.name; }),
  ["域名可达性", "HTTPS 与安全", "抓取与索引", "性能与体验", "内容合规与运维"], "五分类中文名");
var itemCount = 0, blockerCount = 0, totalWeight = 0;
var ids = {}, weightOk = true, shapeOk = true;
M.CHECKLIST.forEach(function (cat) {
  ok(typeof cat.id === "string" && typeof cat.name === "string" && Array.isArray(cat.items), "分类结构：" + cat.id);
  cat.items.forEach(function (it) {
    itemCount++;
    if (ids[it.id]) shapeOk = false;
    ids[it.id] = true;
    if (typeof it.text !== "string" || typeof it.hint !== "string") shapeOk = false;
    if (!(it.weight >= 1 && it.weight <= 3)) weightOk = false;
    if (typeof it.blocker !== "boolean") shapeOk = false;
    totalWeight += it.weight;
    if (it.blocker) blockerCount++;
  });
});
eq(itemCount, 31, "CHECKLIST 共 31 项");
eq(blockerCount, 6, "阻断项共 6 项");
eq(totalWeight, 60, "总权重 = 60（手算：9+15+11+14+11）");
ok(weightOk, "全部项权重在 1–3 之间");
ok(shapeOk, "项结构完整（id 唯一、text/hint 字符串、blocker 布尔）");
deepEq(M.CHECKLIST.map(function (c) { return c.items.length; }),
  [5, 7, 6, 7, 6], "各分类项数 5/7/6/7/6");

/* ---------- 2. 确定性向量：全选 / 全空 / 单阻断未选 ---------- */
function allSelected() {
  var s = {};
  M.CHECKLIST.forEach(function (cat) {
    cat.items.forEach(function (it) { s[it.id] = true; });
  });
  return s;
}
var BLOCKER_IDS = ["dns-resolve", "https-force", "cert-valid", "noindex-removed", "mobile-ok", "icp"];
var r = M.computeReadiness(allSelected());
eq(r.score, 100, "向量：全选 → score=100");
eq(r.ready, true, "向量：全选 → ready=true");
deepEq(r.blockersPending, [], "向量：全选 → blockersPending=[]");
eq(r.doneCount, 31, "全选 → doneCount=31");
eq(r.totalCount, 31, "全选 → totalCount=31");

r = M.computeReadiness({});
eq(r.score, 0, "向量：全空 → score=0");
eq(r.ready, false, "向量：全空 → ready=false");
deepEq(r.blockersPending, BLOCKER_IDS, "向量：全空 → blockersPending 为全部 6 阻断（CHECKLIST 顺序）");

var almostAll = allSelected();
delete almostAll["icp"];
r = M.computeReadiness(almostAll);
eq(r.score, 95, "向量：单阻断未选（缺 icp）→ score=95（(60-3)/60×100）");
eq(r.ready, false, "向量：单阻断未选 → ready=false");
deepEq(r.blockersPending, ["icp"], "向量：单阻断未选 → blockersPending=['icp']");

/* ---------- 3. 分类得分与加权手算 ---------- */
var domainOnly = {};
M.CHECKLIST[0].items.forEach(function (it) { domainOnly[it.id] = true; });
r = M.computeReadiness(domainOnly);
eq(r.score, 15, "加权手算：仅域名分类全选 → 9/60×100=15");
eq(r.categories[0].score, 100, "分类：域名全选 → 该分类 score=100");
eq(r.categories[0].done, 5, "分类：域名全选 → done=5");
eq(r.categories[0].total, 5, "分类：域名全选 → total=5");
eq(r.categories[1].score, 0, "分类：HTTPS 全空 → score=0");
eq(r.categories.length, 5, "categories 共 5 项");
deepEq(r.categories.map(function (c) { return c.id; }),
  ["domain", "https", "seo", "perf", "ops"], "categories 顺序与 CHECKLIST 一致");

r = M.computeReadiness({ "dns-resolve": true, "https-force": true });
eq(r.score, 10, "加权手算：dns-resolve(3)+https-force(3) → 6/60×100=10");
r = M.computeReadiness({ "cert-valid": true, "hsts-age": true });
eq(r.score, 5, "加权手算：cert-valid(2)+hsts-age(1) → 3/60×100=5");
var mix = {};
M.CHECKLIST[0].items.forEach(function (it) { mix[it.id] = true; });
mix["cert-valid"] = true;
r = M.computeReadiness(mix);
eq(r.score, 18, "加权手算：域名全选(9)+cert-valid(2) → 11/60×100≈18（四舍五入）");

/* 阻断全完成但分数 <80 → ready=false（阈值门槛独立生效）。 */
var onlyBlockers = {};
BLOCKER_IDS.forEach(function (id) { onlyBlockers[id] = true; });
r = M.computeReadiness(onlyBlockers);
eq(r.score, 28, "仅 6 阻断完成 → (3+3+2+3+3+3)/60×100≈28");
eq(r.ready, false, "阻断全完成但 28<80 → ready=false");
deepEq(r.blockersPending, [], "仅阻断完成 → blockersPending=[]");

/* ---------- 4. READY_THRESHOLD ---------- */
eq(M.READY_THRESHOLD, 80, "READY_THRESHOLD=80");

/* ---------- 5. 非法 state 抛 Error（含 err.field） ---------- */
throwsWithField(function () { M.computeReadiness(null); }, "state", "computeReadiness(null)");
throwsWithField(function () { M.computeReadiness(undefined); }, "state", "computeReadiness(undefined)");
throwsWithField(function () { M.computeReadiness("dns-resolve"); }, "state", "computeReadiness(字符串)");
throwsWithField(function () { M.computeReadiness([]); }, "state", "computeReadiness(数组)");
throwsAny(function () { M.computeReadiness({ "not-a-real-item": true }); }, "含未知键抛 Error（err.field 非空）");
try { M.computeReadiness({ "zzz-unknown": true }); }
catch (e) { eq(e.field, "zzz-unknown", "未知键 err.field 即为该键名"); }

/* ---------- 6. exportReport 内容断言 ---------- */
var ISO = "2026-10-31T09:00:00+08:00";
var rep = M.exportReport({}, ISO);
has(rep, "# 网站上线检查报告", "报告含「# 网站上线检查报告」标题");
has(rep, ISO, "报告含调用方传入的时间戳");
has(rep, "0 / 100", "全空报告含总分 0 / 100");
has(rep, "暂缓上线", "全空报告判定为暂缓上线");
has(rep, "未完成阻断项（6）", "全空报告列出 6 项未完成阻断");
has(rep, "ICP 备案号", "报告含阻断项文本（icp）");
has(rep, "noindex", "报告含阻断项文本（noindex-removed）");
has(rep, "分类得分", "报告含分类得分小节");
has(rep, "域名可达性", "报告含分类名");
var repFull = M.exportReport(allSelected(), ISO);
has(repFull, "100 / 100", "全选报告总分 100 / 100");
has(repFull, "可以上线", "全选报告判定为可以上线");
has(repFull, "未完成阻断项（0）", "全选报告阻断项为 0");
has(repFull, "静态核对", "报告含真限制说明（静态核对）");
var repBlocker = M.exportReport(almostAll, ISO);
has(repBlocker, "95 / 100", "单阻断未选报告总分 95 / 100");
has(repBlocker, "未完成阻断项（1）", "单阻断未选报告阻断项为 1");

/* ---------- 7. 注册与静态检查 ---------- */
has(GO_SRC, '"launch_checklist"', "categories.go 注册 ID");
has(GO_SRC, '"/tools/launch-checklist"', "categories.go 注册 Path");
var idx = GO_SRC.indexOf('"launch_checklist"');
var block = GO_SRC.slice(idx, idx + 1400);
has(block, 'Category:    "开发工具"', "注册 Category 为开发工具");
has(block, "New:         true", "注册 New 为 true");
has(block, 'Icon:        "checklist"', "注册 Icon 为 checklist");
ok(/·\s*[A-Za-z]/.test(block), "注册 Description 中英文双语（· 分隔）");
var pathCount = 0, m;
var re = /"\/tools\/[^"]+"/g, seen = {};
while ((m = re.exec(GO_SRC)) !== null) { if (!seen[m[0]]) { seen[m[0]] = true; pathCount++; } }
eq(pathCount, 244, "注册 Path 总数 243→244");
ok(JS_SRC.indexOf("fetch(") < 0 && JS_SRC.indexOf("XMLHttpRequest") < 0, "JS 零 fetch/XHR");
notHas(TPL_SRC, 'src="http', "模板无外部脚本引用");
ok(!/href="https?:\/\/(?!www\.johnkingzcq123\.xyz)/.test(TPL_SRC), "模板无外部超链接（站内 canonical 除外）");
has(TPL_SRC, "https://www.johnkingzcq123.xyz/tools/launch-checklist", "canonical 正确");
has(TPL_SRC, "og:title", "含 OG 标签");
has(TPL_SRC, "application/ld+json", "含 JSON-LD");
has(JS_SRC, "localStorage", "JS 含 localStorage 进度持久");
has(JS_SRC, M.LS_KEY, "localStorage 键版本化（toolweb.launch_checklist.v1）");
has(JS_SRC, "confirm(", "重置有二次确认（confirm）");
has(TPL_SRC, "@media print", "模板含打印样式");

/* ---------- 8. 真限制三条页面明示 ---------- */
has(TPL_SRC, "静态核对", "模板含真限制①：静态核对不做真实联网检测");
has(TPL_SRC, "不做真实联网检测", "模板含真限制①明细");
has(TPL_SRC, "经验参考值", "模板含真限制②：权重/80 分为经验参考值");
has(TPL_SRC, "仅保存在当前浏览器", "模板含真限制③：进度仅存当前浏览器");
has(TPL_SRC, "使用说明", "模板含使用说明");
has(TPL_SRC, "常见问题", "模板含 FAQ");

/* ---------- 9. 互链合规：四工具双向，不链未交付 ---------- */
has(TPL_SRC, "/tools/csp-builder", "互链：CSP 安全头生成器");
has(TPL_SRC, "/tools/http-header-analyzer", "互链：HTTP 响应头分析器");
has(TPL_SRC, "/tools/robots-txt-validator", "互链：robots.txt 校验与测试器");
has(TPL_SRC, "/tools/ads-txt-validator", "互链：ads.txt 校验器");
has(TPL_SRC, "robots.txt 写对了吗", "互链文案口径：robots.txt");
var CSB = fs.readFileSync(path.join(ROOT, "templates", "csp_builder.html"), "utf8");
var HHA = fs.readFileSync(path.join(ROOT, "templates", "http_header_analyzer.html"), "utf8");
var RTV = fs.readFileSync(path.join(ROOT, "templates", "robots_txt_validator.html"), "utf8");
var ATV = fs.readFileSync(path.join(ROOT, "templates", "ads_txt_validator.html"), "utf8");
has(CSB, "/tools/launch-checklist", "双向：CSP 安全头生成器页链回");
has(HHA, "/tools/launch-checklist", "双向：HTTP 响应头分析器页链回");
has(RTV, "/tools/launch-checklist", "双向：robots.txt 校验与测试器页链回");
has(ATV, "/tools/launch-checklist", "双向：ads.txt 校验器页链回");
notHas(TPL_SRC, "违禁", "不链未交付：违禁词检测器");
notHas(TPL_SRC, "批量打开", "不链未交付：网址批量打开工具");
/* 模板内所有 /tools/xxx 外链必须已在 categories.go 注册（不链未交付工具）。 */
var hrefRe = /href="(\/tools\/[a-z0-9\-\/]+)"/g;
var hm, bad = [];
while ((hm = hrefRe.exec(TPL_SRC)) !== null) {
  if (hm[1] === "/tools/static") continue;
  if (GO_SRC.indexOf('"' + hm[1] + '"') < 0) bad.push(hm[1]);
}
eq(bad.length, 0, "模板外链全部已注册（实得未注册：" + sval(bad) + "）");

console.log("launch_checklist: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
