/* GB/T 7714 参考文献生成器纯逻辑单元测试（零依赖）：node tests/gbt7714_reference_generator.test.js
 * 覆盖：formatCitationAPA（期刊确定性向量逐字＋21 作者省略号规则＋3 作者串行逗号＋
 * 图书/版次/网页形态逐字、err.field=fields/author/title/year/url）、
 * formatCitationMLA（期刊/2 作者/3+ 作者 et al./图书/网页日期逐字、err.field）、
 * formatCitationChicago（期刊/含期号/图书出版地/网页 Accessed 日期逐字、err.field）、
 * 现有纯函数回归（buildBody 顺序编码/著者-出版年 SAMPLES 抽检、SAMPLES 十类、TYPES 十类）、
 * 模板（五选一制式、类型置灰提示、真限制三条文案、SEO 增补、脚本 v2）、
 * 注册不动（ID/Path/Icon/Category/New 不动、Path 总数 268）、零网络请求。 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/gbt7714_reference_generator.js");

var pass = 0, fail = 0;
function ok(cond, name) {
if (cond) { pass++; }
else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function has(s, sub, name) { ok(String(s).indexOf(sub) !== -1, name + "（应包含 " + JSON.stringify(sub) + "）"); }
function notHas(s, sub, name) { ok(String(s).indexOf(sub) === -1, name + "（不应包含 " + JSON.stringify(sub) + "）"); }
function throwsField(fn, field, name) {
try { fn(); }
catch (e) { eq(e && e.field, field, name); return; }
fail++; console.error("FAIL:", name + "（应抛错，未抛）");
}

var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "gbt7714_reference_generator.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "gbt7714_reference_generator.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");
var EN_DASH = "–"; // U+2013，APA 页码连字符统一字形

/* ---------- 1. formatCitationAPA 确定性向量 ---------- */
var apaJ = M.formatCitationAPA({ authors: ["Zhang, S.", "Li, W."], year: 2024, title: "Deep learning for NLP", journal: "AI Review", volume: 12, issue: 3, pages: "45-67", doi: "10.1/abc" });
eq(apaJ, "Zhang, S., & Li, W. (2024). Deep learning for NLP. AI Review, 12(3), 45" + EN_DASH + "67. https://doi.org/10.1/abc", "APA：期刊条目逐字固定");
var apa3 = M.formatCitationAPA({ authors: ["Zhang, S.", "Li, W.", "Wang, F."], year: 2024, title: "T", journal: "J" });
has(apa3, "Zhang, S., Li, W., & Wang, F. (2024).", "APA：3 作者串行逗号 + &");
var apa1 = M.formatCitationAPA({ authors: ["Zhang, S."], year: 2024, title: "Deep learning", publisher: "AI Press" });
eq(apa1, "Zhang, S. (2024). Deep learning. AI Press.", "APA：图书条目逐字固定");
var apaEd = M.formatCitationAPA({ authors: ["Zhang, S."], year: 2024, title: "Deep learning", edition: "4th ed.", publisher: "AI Press" });
eq(apaEd, "Zhang, S. (2024). Deep learning (4th ed.). AI Press.", "APA：图书版次紧跟题名");
var apaW = M.formatCitationAPA({ authors: ["Zhang, S."], year: 2024, title: "China internet report", sitename: "CNNIC", url: "https://www.cnnic.cn/" });
eq(apaW, "Zhang, S. (2024). China internet report. CNNIC. https://www.cnnic.cn/", "APA：网页条目逐字固定");
var apaUrl = M.formatCitationAPA({ authors: ["Zhang, S."], year: 2024, title: "T", journal: "J", url: "https://example.com/a" });
has(apaUrl, "https://example.com/a", "APA：无 DOI 时回落 URL");
var many = [];
for (var i = 1; i <= 21; i++) many.push("Au" + i + ", X.");
var apa21 = M.formatCitationAPA({ authors: many, year: 2024, title: "T", journal: "J" });
has(apa21, "Au1, X., Au2, X.", "APA：21 作者保留前 19 开头");
has(apa21, ", ... Au21, X. (2024).", "APA：21 作者第 20 位后省略号 + 末作者");
notHas(apa21, "Au20, X.", "APA：21 作者省略第 20 位");
var apa20 = M.formatCitationAPA({ authors: many.slice(0, 20), year: 2024, title: "T", journal: "J" });
has(apa20, "& Au20, X. (2024).", "APA：20 作者仍全列 + &");
throwsField(function () { M.formatCitationAPA(null); }, "fields", "APA：null 入参 err.field=fields");
throwsField(function () { M.formatCitationAPA("x"); }, "fields", "APA：字符串入参 err.field=fields");
throwsField(function () { M.formatCitationAPA({ title: "x", year: 2024 }); }, "author", "APA：缺 author err.field=author");
throwsField(function () { M.formatCitationAPA({ authors: [], title: "x", year: 2024 }); }, "author", "APA：空 authors err.field=author");
throwsField(function () { M.formatCitationAPA({ authors: ["A"], year: 2024 }); }, "title", "APA：缺 title err.field=title");
throwsField(function () { M.formatCitationAPA({ authors: ["A"], title: "x" }); }, "year", "APA：缺 year err.field=year");
throwsField(function () { M.formatCitationAPA({ authors: ["A"], title: "x", year: 2024 }); }, "url", "APA：网页缺 url err.field=url");

/* ---------- 2. formatCitationMLA 确定性向量 ---------- */
var mlaJ = M.formatCitationMLA({ authors: ["Zhang, Shan"], year: 2024, title: "Deep learning for NLP", journal: "AI Review", volume: 12, issue: 3, pages: "45-67" });
eq(mlaJ, "Zhang, Shan. \"Deep learning for NLP.\" AI Review, vol. 12, no. 3, 2024, pp. 45-67.", "MLA：期刊条目逐字固定");
var mla2 = M.formatCitationMLA({ authors: ["Zhang, Shan", "Wei Li"], year: 2024, title: "T", journal: "J" });
has(mla2, "Zhang, Shan, and Wei Li. \"T.\"", "MLA：2 作者 and 连接");
var mla3 = M.formatCitationMLA({ authors: ["Zhang, Shan", "Wei Li", "Fang Wang"], year: 2024, title: "T", journal: "J" });
has(mla3, "Zhang, Shan, et al. \"T.\"", "MLA：3+ 作者 et al.");
var mlaB = M.formatCitationMLA({ authors: ["Zhang, Shan"], year: 2024, title: "Deep learning", publisher: "AI Press" });
eq(mlaB, "Zhang, Shan. Deep learning. AI Press, 2024.", "MLA：图书条目逐字固定");
var mlaW = M.formatCitationMLA({ authors: ["Zhang, Shan"], year: 2024, title: "China internet report", sitename: "CNNIC", accessDate: "2026-11-02", url: "https://www.cnnic.cn/" });
eq(mlaW, "Zhang, Shan. \"China internet report.\" CNNIC, 2 Nov. 2026, https://www.cnnic.cn/.", "MLA：网页条目逐字固定");
var mlaDoi = M.formatCitationMLA({ authors: ["Zhang, Shan"], year: 2024, title: "T", journal: "J", doi: "10.1/abc" });
has(mlaDoi, "https://doi.org/10.1/abc", "MLA：DOI 自动补全链接");
throwsField(function () { M.formatCitationMLA(null); }, "fields", "MLA：null 入参 err.field=fields");
throwsField(function () { M.formatCitationMLA({ authors: ["A"], year: 2024 }); }, "title", "MLA：缺 title err.field=title");
throwsField(function () { M.formatCitationMLA({ title: "x", year: 2024 }); }, "author", "MLA：缺 author err.field=author");

/* ---------- 3. formatCitationChicago 确定性向量 ---------- */
var chiJ = M.formatCitationChicago({ authors: ["Zhang, Shan"], year: 2024, title: "Deep learning for NLP", journal: "AI Review", volume: 12, pages: "45-67" });
eq(chiJ, "Zhang, Shan. 2024. \"Deep learning for NLP.\" AI Review 12: 45-67.", "Chicago：期刊条目逐字固定");
var chiI = M.formatCitationChicago({ authors: ["Zhang, Shan"], year: 2024, title: "T", journal: "J", volume: 12, issue: 3, pages: "45-67", doi: "10.1/abc" });
eq(chiI, "Zhang, Shan. 2024. \"T.\" J 12 (3): 45-67. https://doi.org/10.1/abc", "Chicago：期刊含期号 + DOI");
var chi2 = M.formatCitationChicago({ authors: ["Zhang, Shan", "Wei Li"], year: 2024, title: "T", publisher: "AI Press" });
has(chi2, "Zhang, Shan, and Wei Li. 2024. T. AI Press.", "Chicago：2 作者图书");
var chiB = M.formatCitationChicago({ authors: ["Zhang, Shan"], year: 2024, title: "Deep learning", place: "Beijing", publisher: "AI Press" });
eq(chiB, "Zhang, Shan. 2024. Deep learning. Beijing: AI Press.", "Chicago：图书出版地逐字固定");
var chiW = M.formatCitationChicago({ authors: ["Zhang, Shan"], year: 2024, title: "China internet report", sitename: "CNNIC", accessDate: "2026-11-02", url: "https://www.cnnic.cn/" });
eq(chiW, "Zhang, Shan. 2024. \"China internet report.\" CNNIC. Accessed November 2, 2026. https://www.cnnic.cn/.", "Chicago：网页条目逐字固定");
throwsField(function () { M.formatCitationChicago(null); }, "fields", "Chicago：null 入参 err.field=fields");
throwsField(function () { M.formatCitationChicago({ authors: ["A"], title: "x" }); }, "year", "Chicago：缺 year err.field=year");
throwsField(function () { M.formatCitationChicago({ authors: ["A"], title: "x", year: 2024 }); }, "url", "Chicago：网页缺 url err.field=url");

/* ---------- 4. 现有纯函数回归（GB/T 7714 双制式无损） ---------- */
var bodyJ = M.buildBody("J", M.SAMPLES.J, "seq");
has(bodyJ, "张三, 李四, 王五, 等. ", "回归：顺序编码制作者 >3 取前3 + 等");
has(bodyJ, "深度学习在图像识别中的应用[J]. 计算机学报, 2023, 46(5): 1234-1245.", "回归：顺序编码制期刊条目形态");
var bodyJay = M.buildBody("J", M.SAMPLES.J, "ay");
has(bodyJay, "张三, 李四, 王五, 等, 2023. ", "回归：著者-出版年制作者年前缀");
var bodyM = M.buildBody("M", M.SAMPLES.M, "seq");
has(bodyM, "谭浩强. C程序设计[M]. 4版. 北京: 清华大学出版社, 2010.", "回归：顺序编码制专著条目形态");
var bodyEb = M.buildBody("EB/OL", M.SAMPLES["EB/OL"], "seq");
has(bodyEb, "[EB/OL].", "回归：电子文献标识");
eq(Object.keys(M.SAMPLES).length, 10, "回归：SAMPLES 十类齐全");
eq(M.TYPES.length, 10, "回归：TYPES 十类齐全");
eq(typeof M.formatCitationAPA, "function", "导出：formatCitationAPA 为函数");
eq(typeof M.formatCitationMLA, "function", "导出：formatCitationMLA 为函数");
eq(typeof M.formatCitationChicago, "function", "导出：formatCitationChicago 为函数");
has(JS_SRC, "window.GBT7714", "导出：挂 window.GBT7714");
has(JS_SRC, "formatCitationAPA: formatCitationAPA", "导出：window.GBT7714 含 APA");
has(JS_SRC, "formatCitationChicago: formatCitationChicago", "导出：window.GBT7714 含 Chicago");

/* ---------- 5. 模板：五选一制式＋置灰提示＋真限制＋SEO ---------- */
has(TPL_SRC, "value=\"apa\"", "模板：制式五选一含 APA");
has(TPL_SRC, "value=\"mla\"", "模板：制式五选一含 MLA");
has(TPL_SRC, "value=\"chicago\"", "模板：制式五选一含 Chicago");
has(TPL_SRC, "value=\"seq\"", "模板：保留顺序编码制");
has(TPL_SRC, "value=\"ay\"", "模板：保留著者-出版年制");
has(TPL_SRC, "gbt-type-card.disabled", "模板：类型卡置灰样式");
has(JS_SRC, "英文三格式暂不支持", "置灰：JS 渲染置灰提示文案");
has(TPL_SRC, "id=\"gbt-ennote\"", "模板：英文作者录入规则提示条");
has(TPL_SRC, "仅覆盖期刊 / 图书 / 网页三类", "真限制：仅三类文献文案");
has(TPL_SRC, "不做语义分词", "真限制：作者不做语义分词文案");
has(TPL_SRC, "零上传", "真限制：纯本地零上传文案");
has(TPL_SRC, "引文一条龙", "互链：引文一条龙文案");
has(TPL_SRC, "APA 7th", "SEO：含 APA 7th 关键词");
has(TPL_SRC, "MLA 9th", "SEO：含 MLA 9th 关键词");
has(TPL_SRC, "Chicago 17th", "SEO：含 Chicago 17th 关键词");
has(TPL_SRC, "APA citation generator", "SEO：含英文 APA 关键词");
has(TPL_SRC, "gbt7714_reference_generator.js?v=2", "模板：JS 版本号 v2");
has(JS_SRC, "$('gbt-ennote')", "渲染：JS 取 gbt-ennote 元素");
has(JS_SRC, "EN_REQUIRED[curType]", "渲染：英文制式必填校验");
has(JS_SRC, "EN_MODES[mode]", "渲染：英文制式分支");
has(JS_SRC, "renderEnNote", "渲染：英文提示条渲染函数");

/* ---------- 6. 注册不动：Path 总数保持 268 ---------- */
has(GO_SRC, "\"gbt7714_reference_generator\"", "注册：ID 不变");
has(GO_SRC, "\"/tools/gbt7714-reference-generator\"", "注册：Path 不变");
has(GO_SRC, "\"menu_book\"", "注册：Icon 不变");
var catBlock = GO_SRC.split("\"gbt7714_reference_generator\"")[1].split("},")[0];
has(catBlock, "Category:    \"文本工具\"", "注册：Category 不变");
has(catBlock, "New:         true", "注册：New 标记不动");
has(catBlock, "APA 7th / MLA 9th / Chicago 17th", "注册：Description 增补三格式一句");
var pathCount = (GO_SRC.match(/"\/tools\/[^"]+"/g) || []).filter(function (v, i, a) { return a.indexOf(v) === i; }).length;
eq(pathCount, 269, "注册：Path 总数 268→269");

/* ---------- 7. 零网络请求 ---------- */
notHas(JS_SRC, "fetch(", "零网络：JS 无 fetch");
notHas(JS_SRC, "XMLHttpRequest", "零网络：JS 无 XHR");
notHas(TPL_SRC, "fetch(", "零网络：模板无 fetch");
notHas(TPL_SRC, "http://", "零 CDN：模板无 http 外链");
// 模板内 https:// 仅限改动前已存在的三处（字体 CDN / JSON-LD 上下文 / 本站 canonical），本轮未新增外部请求
var tplHosts = {};
(TPL_SRC.match(/https:\/\/[a-zA-Z0-9.-]+/g) || []).forEach(function (u) { tplHosts[u.replace(/^https:\/\//, "")] = 1; });
eq(Object.keys(tplHosts).sort().join(","), "doi.org,fonts.googleapis.com,schema.org,www.johnkingzcq123.xyz", "零新增：模板外链主机集合与改动前一致");

/* ---------- 8. enSplitAuthors 集成（页面录入规则：姓, 名首字母＋分号分隔） ---------- */
// 直接把表单字符串喂给 enSplitAuthors（与 enInput/compareEN 相同链路），再喂给纯函数渲染
eq(JSON.stringify(M.enSplitAuthors("Zhang, S.; Li, W.")), JSON.stringify(["Zhang, S.", "Li, W."]), "enSplitAuthors：双作者按分号切、逗号不切");
eq(JSON.stringify(M.enSplitAuthors("Zhang, S.")), JSON.stringify(["Zhang, S."]), "enSplitAuthors：单作者「姓, 名首字母」保持整体");
eq(JSON.stringify(M.enSplitAuthors("Zhang, Shan; Wei Li")), JSON.stringify(["Zhang, Shan", "Wei Li"]), "enSplitAuthors：MLA/Chicago 姓, 名亦按分号切");
eq(JSON.stringify(M.enSplitAuthors("Zhang, S.\nLi, W.")), JSON.stringify(["Zhang, S.", "Li, W."]), "enSplitAuthors：换行也切分");
eq(JSON.stringify(M.enSplitAuthors("Zhang, S.；Li, W.；")), JSON.stringify(["Zhang, S.", "Li, W."]), "enSplitAuthors：全角分号＋尾部分号容错");
eq(JSON.stringify(M.enSplitAuthors("")), JSON.stringify([]), "enSplitAuthors：空串得空数组");
eq(JSON.stringify(M.enSplitAuthors("  ;  ")), JSON.stringify([]), "enSplitAuthors：纯分隔符得空数组");
// 集成：UI 链路（enInput 口径：表单字符串→enSplitAuthors）渲染 APA 逐字等于规格向量
var viaUi = M.formatCitationAPA({ authors: M.enSplitAuthors("Zhang, S.; Li, W."), year: 2024, title: "Deep learning for NLP", journal: "AI Review", volume: 12, issue: 3, pages: "45-67", doi: "10.1/abc" });
eq(viaUi, "Zhang, S., & Li, W. (2024). Deep learning for NLP. AI Review, 12(3), 45" + EN_DASH + "67. https://doi.org/10.1/abc", "集成：UI 切分→APA 期刊逐字＝规格向量");
var viaUi1 = M.formatCitationAPA({ authors: M.enSplitAuthors("Zhang, S."), year: 2024, title: "Deep learning", publisher: "AI Press" });
eq(viaUi1, "Zhang, S. (2024). Deep learning. AI Press.", "集成：UI 切分→APA 单作者图书逐字");
var viaUiMla = M.formatCitationMLA({ authors: M.enSplitAuthors("Zhang, Shan; Wei Li"), year: 2024, title: "T", journal: "J", volume: 12, pages: "45-67" });
eq(viaUiMla, "Zhang, Shan, and Wei Li. \"T.\" J, vol. 12, 2024, pp. 45-67.", "集成：UI 切分→MLA 双作者逐字（不误判 et al.）");

console.log("gbt7714_reference_generator: pass=" + pass + " fail=" + fail);
if (fail > 0) process.exit(1);
