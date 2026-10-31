/* ads.txt 校验器（ads_txt_validator）纯逻辑单元测试（零依赖）：
 * node tests/ads_txt_validator.test.js
 * 覆盖：规格确定性向量逐值命中（parseLine 字段切分、大小写严格、注释/空行分类、
 * 缺字段/多余字段/重复记录/可疑 TAG-ID、非法参数抛 Error 的 err.field）、
 * 变量记录（1.1 已知/1.0 旧版/未知）、两组示例结构与统计、
 * categories.go 注册（Path 总数 244→245）与零网络请求静态检查、
 * 模板真限制三条、与 robots.txt 生成器/校验与测试器双向互链（生成 vs 校验）、
 * Description 中英文双语、不链未交付工具。
 */
"use strict";
var fs = require("fs");
var path = require("path");
var A = require("../static/js/ads_txt_validator.js");

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function eqArr(a, b, name) {
  ok(Array.isArray(a) && a.length === b.length && a.every(function (v, i) { return v === b[i]; }),
    name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）");
}
function has(s, sub, name) { ok(s.indexOf(sub) !== -1, name); }
function notHas(s, sub, name) { ok(s.indexOf(sub) === -1, name); }
function throwsField(fn, field, name) {
  try { fn(); } catch (e) {
    ok(e instanceof Error && e.field === field,
      name + "（期望抛 Error 且 err.field=" + JSON.stringify(field) + "，实得 " +
      (e instanceof Error ? "Error field=" + JSON.stringify(e.field) : typeof e) + "）");
    return;
  }
  fail++; console.error("FAIL:", name + "（未抛出异常）");
}

var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "ads_txt_validator.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "ads_txt_validator.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");
var GEN_TPL = fs.readFileSync(path.join(ROOT, "templates", "robots_txt_generator.html"), "utf8");
var VAL_TPL = fs.readFileSync(path.join(ROOT, "templates", "robots_txt_validator.html"), "utf8");

/* ---------- 1. 确定性向量：标准四字段记录 ---------- */
var p1 = A.parseLine("google.com, pub-12345, DIRECT, f08c47fec0942fa0", 1);
eq(p1.type, "record", "向量1：类型为 record");
eqArr(p1.fields, ["google.com", "pub-12345", "DIRECT", "f08c47fec0942fa0"], "向量1：四字段切分逐值命中");
eq(p1.domain, "google.com", "向量1：命名字段 domain");
eq(p1.accountId, "pub-12345", "向量1：命名字段 accountId");
eq(p1.accountType, "DIRECT", "向量1：命名字段 accountType");
eq(p1.caId, "f08c47fec0942fa0", "向量1：命名字段 caId");
eq(p1.line, 1, "向量1：行号 1");
var v1 = A.validateAdsTxt("google.com, pub-12345, DIRECT, f08c47fec0942fa0");
eq(v1.errors.length, 0, "向量1：错误 0 个");
eq(v1.warnings.length, 0, "向量1：警告 0 个");

/* ---------- 2. 确定性向量：账号类型大小写严格 ---------- */
var vLower = A.validateAdsTxt("google.com, pub-12345, direct, f08c47fec0942fa0");
eq(vLower.errors.length, 1, "向量2：小写 direct 判错（错误 1 个）");
ok(vLower.errors[0].message.indexOf("DIRECT") >= 0 && vLower.errors[0].message.indexOf("大小写") >= 0, "向量2：错误信息点名 DIRECT 与大小写");
eq(vLower.errors[0].line, 1, "向量2：错误带行号 1");
var vReseller = A.validateAdsTxt("appnexus.com, 1234, RESELLER");
eq(vReseller.errors.length, 0, "向量2对照：全大写 RESELLER 无错误");

/* ---------- 3. 确定性向量：缺字段判错 ---------- */
var vShort = A.validateAdsTxt("rubiconproject.com, 12345");
eq(vShort.errors.length, 1, "向量3：2 字段判错（错误 1 个）");
ok(vShort.errors[0].message.indexOf("3 个字段") >= 0, "向量3：错误信息点名至少 3 个字段");

/* ---------- 4. 确定性向量：注释/空行分类 ---------- */
eq(A.parseLine("# 这是注释", 5).type, "comment", "向量4：# 开头为注释");
eq(A.parseLine("   ", 6).type, "blank", "向量4：纯空白为行空行");
eq(A.parseLine("\t # 缩进注释", 7).type, "comment", "向量4：前导空白＋# 仍为注释");
var vBlank = A.validateAdsTxt("# c\n\n# d");
eq(vBlank.stats.comments, 2, "向量4：注释计 2");
eq(vBlank.stats.blanks, 1, "向量4：空行计 1");
eq(vBlank.errors.length + vBlank.warnings.length, 0, "向量4：注释/空行无错误警告");

/* ---------- 5. 确定性向量：多余字段/重复记录/可疑 TAG-ID 判警告 ---------- */
var vExtra = A.validateAdsTxt("openx.com, 1234, RESELLER, f08c47fec0942fa0, 多余字段");
eq(vExtra.errors.length, 0, "向量5：多余字段不判错");
ok(vExtra.warnings.some(function (w) { return w.message.indexOf("多余字段") >= 0; }), "向量5：多余字段判警告");
var vDup = A.validateAdsTxt("appnexus.com, 1234, RESELLER\nappnexus.com, 1234, RESELLER");
eq(vDup.errors.length, 0, "向量5：重复记录不判错");
eq(vDup.warnings.length, 1, "向量5：重复记录警告 1 个");
ok(vDup.warnings[0].message.indexOf("重复") >= 0 && vDup.warnings[0].line === 2, "向量5：重复警告带第 2 行行号");
var vCa = A.validateAdsTxt("suspicious-exchange.com, 999, DIRECT, 不是TAGID");
eq(vCa.errors.length, 0, "向量5：可疑 TAG-ID 不判错");
ok(vCa.warnings.some(function (w) { return w.message.indexOf("认证机构 ID") >= 0; }), "向量5：可疑认证机构 ID 判警告");

/* ---------- 6. 确定性向量：非法参数抛 Error（err.field） ---------- */
throwsField(function () { A.validateAdsTxt(123); }, "text", "向量6：validateAdsTxt(123) 抛 Error，err.field=text");
throwsField(function () { A.validateAdsTxt(null); }, "text", "向量6：validateAdsTxt(null) 抛 Error，err.field=text");
throwsField(function () { A.parseLine(123, 1); }, "text", "向量6：parseLine(123,1) 抛 Error，err.field=text");
throwsField(function () { A.parseLine("x", 0); }, "lineNo", "向量6：parseLine 行号 0 抛 Error，err.field=lineNo");
throwsField(function () { A.parseLine("x", "a"); }, "lineNo", "向量6：parseLine 行号非数字抛 Error，err.field=lineNo");

/* ---------- 7. 变量记录：1.1 已知 / 1.0 旧版 / 未知 ---------- */
var pv = A.parseLine("OWNERDOMAIN=example.com", 2);
eq(pv.type, "variable", "变量：OWNERDOMAIN= 识别为 variable");
eq(pv.name, "OWNERDOMAIN", "变量：变量名 OWNERDOMAIN");
eq(pv.value, "example.com", "变量：变量值 example.com");
eq(A.validateAdsTxt("OWNERDOMAIN=example.com").warnings.length, 0, "变量：1.1 已知变量无警告");
var vLegacy = A.validateAdsTxt("CONTACT=ads@example.com");
ok(vLegacy.warnings.some(function (w) { return w.message.indexOf("旧版") >= 0; }), "变量：1.0 旧版 CONTACT 判警告");
var vUnknown = A.validateAdsTxt("SOMEVAR=实验性字段");
ok(vUnknown.warnings.some(function (w) { return w.message.indexOf("未知变量") >= 0; }), "变量：未知变量名判警告");

/* ---------- 8. 两组示例结构与统计 ---------- */
ok(A.EXAMPLES.typical.indexOf("google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0") >= 0, "示例一含标准四字段记录");
ok(A.EXAMPLES.problem.indexOf("pub-12345, direct") >= 0, "示例二含小写 direct 问题行");
var st = A.validateAdsTxt(A.EXAMPLES.typical).stats;
eq(st.records, 4, "示例一：数据记录 4 条");
eq(st.variables, 1, "示例一：变量 1 条");
eq(st.comments, 2, "示例一：注释 2 条");
eq(st.blanks, 1, "示例一：空行 1 条");
eq(st.errors, 0, "示例一：错误 0 个");
eq(st.warnings, 0, "示例一：警告 0 个");
var sp = A.validateAdsTxt(A.EXAMPLES.problem);
eq(sp.errors.length, 2, "示例二：错误 2 个（小写 direct＋缺字段）");
eq(sp.warnings.length, 4, "示例二：警告 4 个（多余字段＋重复＋可疑TAG-ID＋未知变量）");
eq(sp.stats.records, 6, "示例二：数据记录 6 条");
var sEmpty = A.validateAdsTxt("").stats;
eq(sEmpty.total, 1, "空文本：总行数 1（单个空行）");
eq(sEmpty.blanks, 1, "空文本：空行 1");

/* ---------- 9. categories.go 注册 ---------- */
var adsIdx = GO_SRC.indexOf('"ads_txt_validator"');
ok(adsIdx >= 0, "注册 ID ads_txt_validator");
ok(GO_SRC.indexOf('"/tools/ads-txt-validator"') >= 0, "注册 Path /tools/ads-txt-validator");
ok(GO_SRC.slice(adsIdx, adsIdx + 900).indexOf('Icon:        "ads_click"') >= 0, "注册 Icon ads_click");
ok(GO_SRC.slice(adsIdx, adsIdx + 900).indexOf("New:         true") >= 0, "注册 New 为 true");
ok(GO_SRC.slice(adsIdx, adsIdx + 900).indexOf('Category:    "营销工具"') >= 0, "注册 Category 为营销工具");
ok(GO_SRC.indexOf("Ads.txt validator") >= 0, "Description 中英文双语（含英文）");
var robotsValIdx = GO_SRC.indexOf('"robots_txt_validator"');
ok(robotsValIdx >= 0 && adsIdx > robotsValIdx, "注册紧邻 robots_txt_validator 之后（家族相邻）");
var pathRe = /"\/tools\/[^"]+"/g, seen = {}, m, pathCount = 0;
while ((m = pathRe.exec(GO_SRC)) !== null) { if (!seen[m[0]]) { seen[m[0]] = true; pathCount++; } }
eq(pathCount, 245, "注册 Path 总数 244→245");

/* ---------- 10. 模板：真限制/互链/零网络 ---------- */
has(TPL_SRC, "https://www.johnkingzcq123.xyz/tools/ads-txt-validator", "模板 canonical 含新 Path");
has(TPL_SRC, "不验证卖方账号真实性", "真限制①：不验证卖方账号真实性");
has(TPL_SRC, "旧版字段", "真限制②：旧版字段警告口径");
has(TPL_SRC, "内容不出浏览器", "真限制③：内容不出浏览器");
has(TPL_SRC, "/tools/robots-txt-generator", "互链：robots.txt 生成器");
has(TPL_SRC, "/tools/robots-txt-validator", "互链：robots.txt 校验与测试器");
notHas(TPL_SRC, "slug", "不链未交付工具：无 slug 相关");
notHas(TPL_SRC, "/tools/proportion", "不链未交付工具：无比例求解器");
has(TPL_SRC, "atv-input", "模板含粘贴区 atv-input");
has(TPL_SRC, "atv-table", "模板含字段明细表 atv-table");
has(TPL_SRC, "atv-stats", "模板含统计条 atv-stats");
ok(TPL_SRC.indexOf("未发现问题") >= 0 || JS_SRC.indexOf("未发现问题") >= 0, "无问题时明示未发现问题");
notHas(JS_SRC, "fetch(", "零网络：JS 无 fetch 调用");
notHas(JS_SRC, "XMLHttpRequest", "零网络：JS 无 XHR");
notHas(TPL_SRC, "fonts.googleapis", "模板零 CDN");
has(GEN_TPL, "/tools/ads-txt-validator", "双向互链：生成器模板回链 ads.txt 校验器");
has(VAL_TPL, "/tools/ads-txt-validator", "双向互链：校验器模板回链 ads.txt 校验器");

console.log("PASS " + pass + " / FAIL " + fail);
if (fail > 0) process.exit(1);
