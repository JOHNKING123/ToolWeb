/* URL 解析器纯逻辑单元测试（零依赖）：node tests/url_parser.test.js
 * 覆盖：四组手工复算用例、默认端口消隐、协议补齐、重复键、空值/无值区分、
 * 参数表编辑重组、重组往返、JSON 结构、非法输入、示例静态检查、注册与零网络请求。 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/url_parser.js");

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }

var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "url_parser.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "url_parser.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

/* ---------- 1. 用例 A：回调链接（手工复算） ---------- */
var A = M.parseUrl("https://app.example.com/oauth/callback?code=AbC123xyz&state=9f8e7d6c");
ok(A.valid, "用例 A 合法");
eq(A.protocol, "https:", "用例 A 协议");
eq(A.username, "", "用例 A 用户名空");
eq(A.password, "", "用例 A 密码空");
eq(A.hostname, "app.example.com", "用例 A 主机");
eq(A.port, "", "用例 A 端口空");
eq(A.portNote, "未指定", "用例 A 端口标注未指定");
eq(A.pathname, "/oauth/callback", "用例 A 路径");
eq(A.search, "?code=AbC123xyz&state=9f8e7d6c", "用例 A 查询");
eq(A.hash, "", "用例 A 片段空");
eq(A.queryParams.length, 2, "用例 A 参数 2 个");
eq(A.queryParams[0].key, "code", "用例 A 参数 1 键");
eq(A.queryParams[0].value, "AbC123xyz", "用例 A 参数 1 值");
eq(A.queryParams[1].key, "state", "用例 A 参数 2 键");
eq(A.protocolPrepended, false, "用例 A 未补齐协议");
eq(A.rebuilt, "https://app.example.com/oauth/callback?code=AbC123xyz&state=9f8e7d6c", "用例 A 重组与原串一致");

/* ---------- 2. 用例 B：带 utm 的分享链接 ---------- */
var B = M.parseUrl("https://news.example.com/article/2026-guide?utm_source=wechat&utm_medium=social&utm_campaign=spring_sale&ref=home");
ok(B.valid, "用例 B 合法");
eq(B.hostname, "news.example.com", "用例 B 主机");
eq(B.pathname, "/article/2026-guide", "用例 B 路径");
eq(B.queryParams.length, 4, "用例 B 参数 4 个");
eq(B.queryParams[0].key, "utm_source", "用例 B 参数顺序 1");
eq(B.queryParams[2].key, "utm_campaign", "用例 B 参数顺序 3");
eq(B.queryParams[3].value, "home", "用例 B ref 值");
eq(B.rebuilt, "https://news.example.com/article/2026-guide?utm_source=wechat&utm_medium=social&utm_campaign=spring_sale&ref=home", "用例 B 重组一致");

/* ---------- 3. 用例 C：含用户名/端口/片段的完整链接 ---------- */
var C = M.parseUrl("https://user:secret123@files.example.com:8443/docs/report.pdf?download=1#page=3");
ok(C.valid, "用例 C 合法");
eq(C.username, "user", "用例 C 用户名");
eq(C.password, "secret123", "用例 C 密码");
eq(C.hostname, "files.example.com", "用例 C 真正主机在 @ 之后");
eq(C.port, "8443", "用例 C 非默认端口保留");
eq(C.portNote, "", "用例 C 非默认端口无特殊标注");
eq(C.pathname, "/docs/report.pdf", "用例 C 路径");
eq(C.hash, "#page=3", "用例 C 片段");
eq(C.rebuilt, "https://user:secret123@files.example.com:8443/docs/report.pdf?download=1#page=3", "用例 C 重组一致");

/* ---------- 4. 用例 D：重复键与空值 ---------- */
var D = M.parseUrl("https://shop.example.com/search?tag=phone&tag=tablet&coupon=&promo&sort=price");
ok(D.valid, "用例 D 合法");
eq(D.queryParams.length, 5, "用例 D 参数 5 个");
eq(D.queryParams[0].key, "tag", "用例 D 重复键 1");
eq(D.queryParams[0].value, "phone", "用例 D 重复键 1 值");
eq(D.queryParams[1].key, "tag", "用例 D 重复键 2 分行保留");
eq(D.queryParams[1].value, "tablet", "用例 D 重复键 2 值");
eq(D.queryParams[2].key, "coupon", "用例 D 空值键");
eq(D.queryParams[2].value, "", "用例 D 空值为空串");
eq(D.queryParams[2].hasValue, true, "用例 D 空值 hasValue=true");
eq(D.queryParams[3].key, "promo", "用例 D 无值键");
eq(D.queryParams[3].value, "", "用例 D 无值也为空串");
eq(D.queryParams[3].hasValue, false, "用例 D 无值 hasValue=false");
eq(D.rebuilt, "https://shop.example.com/search?tag=phone&tag=tablet&coupon=&promo&sort=price", "用例 D 重组一致（空值留 =、无值不留 =）");

/* ---------- 5. 默认端口消隐 ---------- */
var E = M.parseUrl("https://example.com:443/a?b=1");
ok(E.valid, "用例 E 合法");
eq(E.port, "", "用例 E https 默认端口被浏览器归一化为空");
eq(E.isDefaultPort, true, "用例 E 识别为默认端口");
eq(E.portNote, "默认端口", "用例 E 端口标注默认端口");
eq(E.rebuilt, "https://example.com/a?b=1", "用例 E 重组消隐 443");
var F = M.parseUrl("http://example.com:80/a");
eq(F.isDefaultPort, true, "用例 F http 80 为默认端口");
eq(F.rebuilt, "http://example.com/a", "用例 F 重组消隐 80");
var G = M.parseUrl("http://example.com:8080/a");
eq(G.port, "8080", "用例 G 非默认端口保留");
eq(G.isDefaultPort, false, "用例 G 非默认端口不标注");
eq(G.rebuilt, "http://example.com:8080/a", "用例 G 重组保留 8080");
var FTPD = M.parseUrl("ftp://files.example.com:21/pub");
eq(FTPD.isDefaultPort, true, "ftp 21 识别为默认端口");
eq(FTPD.portNote, "默认端口", "ftp 21 端口标注默认端口");
eq(FTPD.rebuilt, "ftp://files.example.com/pub", "ftp 重组消隐 21");
var WSD = M.parseUrl("ws://example.com:80/x");
eq(WSD.isDefaultPort, true, "ws 80 识别为默认端口");
eq(WSD.portNote, "默认端口", "ws 80 端口标注默认端口");
eq(WSD.rebuilt, "ws://example.com/x", "ws 重组消隐 80");
var WSSD = M.parseUrl("wss://example.com:443/x");
eq(WSSD.isDefaultPort, true, "wss 443 识别为默认端口");
eq(WSSD.portNote, "默认端口", "wss 443 端口标注默认端口");
eq(WSSD.rebuilt, "wss://example.com/x", "wss 重组消隐 443");

/* ---------- 6. 协议补齐 ---------- */
var H = M.parseUrl("example.com/path?a=b&c=d");
ok(H.valid, "用例 H 无协议合法");
eq(H.protocolPrepended, true, "用例 H 补齐标记 true");
eq(H.protocol, "https:", "用例 H 补齐为 https");
eq(H.hostname, "example.com", "用例 H 主机");
eq(H.rebuilt, "https://example.com/path?a=b&c=d", "用例 H 重组为补齐后版本");
var I = M.parseUrl("example.com:8080/x?y=1");
eq(I.protocolPrepended, true, "用例 I 主机:端口形按无协议补齐（不误读为 scheme）");
eq(I.port, "8080", "用例 I 端口 8080");
var J = M.parseUrl("//example.com/x");
eq(J.protocolPrepended, true, "用例 J 协议相对链接补齐标记");
eq(J.protocol, "https:", "用例 J 协议相对补 https");
var K = M.parseUrl("localhost:3000/api?debug=1");
eq(K.protocolPrepended, true, "用例 K localhost:端口形补齐");
eq(K.hostname, "localhost", "用例 K 主机 localhost");
eq(K.port, "3000", "用例 K 端口 3000");
var FTP = M.parseUrl("ftp://files.example.com/pub");
ok(FTP.valid, "ftp 链接可解析");
eq(FTP.hostname, "files.example.com", "ftp 主机");

/* ---------- 7. 编码与表单语义 ---------- */
var L = M.parseUrl("https://example.com/a%20b?x=a%20b&y=a+b");
eq(L.pathname, "/a%20b", "编码路径原值保留");
eq(L.decodedDiffs.pathname, "/a b", "编码路径解码对照");
eq(L.queryParams[0].value, "a b", "参数 %20 解码为空格");
eq(L.queryParams[1].value, "a b", "参数 + 按表单语义解码为空格");
var L2 = M.parseUrl(L.rebuilt);
eq(L2.queryParams[1].value, "a b", "重组往返：+ 与 %20 语义相同，参数值不变");
var M1 = M.parseUrl("https://example.com/a?");
eq(M1.search, "", "尾随 ? 被 URL 原语归一化为空查询");
eq(M1.queryParams.length, 0, "尾随 ? 无参数");
eq(M1.rebuilt, "https://example.com/a", "尾随 ? 重组不留 ?");
var M2 = M.parseUrl("https://example.com/a");
eq(M2.queryParams.length, 0, "无查询参数为空数组");
eq(M2.rebuilt, "https://example.com/a", "无查询重组一致");

/* ---------- 8. 参数表编辑闭环 ---------- */
var editParams = D.queryParams.map(function (p) { return { key: p.key, value: p.value, hasValue: p.hasValue }; });
editParams[0].value = "watch";
editParams.splice(3, 1); /* 删掉无值 promo 行 */
editParams.push({ key: "page", value: "2", hasValue: true });
var R = M.rebuildUrl(D, editParams);
eq(R.errors.length, 0, "编辑后重组无错");
eq(R.url, "https://shop.example.com/search?tag=watch&tag=tablet&coupon=&sort=price&page=2", "编辑/删除/新增后重组一致");
var noVal = M.buildQuery([{ key: "promo", value: "ignored", hasValue: false }]);
eq(noVal.search, "?promo", "无值行重组只有键");
var emptyVal = M.buildQuery([{ key: "coupon", value: "", hasValue: true }]);
eq(emptyVal.search, "?coupon=", "空值行重组保留等号");

/* ---------- 9. 键校验与查询拼装错误 ---------- */
eq(M.validateParamKey(""), "键不能为空", "键校验：空键");
eq(M.validateParamKey("a b"), "键不能包含空格、&、=、#、?、/", "键校验：含空格");
eq(M.validateParamKey("a&b"), "键不能包含空格、&、=、#、?、/", "键校验：含 &");
eq(M.validateParamKey("a=b"), "键不能包含空格、&、=、#、?、/", "键校验：含 =");
eq(M.validateParamKey("a#b"), "键不能包含空格、&、=、#、?、/", "键校验：含 #");
eq(M.validateParamKey("utm_source"), "", "键校验：合法键通过");
eq(M.validateParamKey("a-b_c.d"), "", "键校验：连字符下划线圆点通过");
var badQ = M.buildQuery([{ key: "ok", value: "1", hasValue: true }, { key: "a b", value: "2", hasValue: true }]);
ok(badQ.errors.length === 1, "非法键整批报错 1 条");
eq(badQ.search, "", "非法键不输出畸形查询");

/* ---------- 10. 重组往返（默认端口消隐为例外并注明） ---------- */
/* 例外说明：E 的显式 :443 重组后消隐，再解析时 portNote 由「默认端口」变为「未指定」，
 * 其余八段与参数表均不变；往返比较排除 portNote 这一项。 */
[A, B, C, D].forEach(function (orig, idx) {
  var again = M.parseUrl(orig.rebuilt);
  ok(again.valid, "往返 " + idx + " 再解析合法");
  eq(again.hostname, orig.hostname, "往返 " + idx + " 主机不变");
  eq(again.pathname, orig.pathname, "往返 " + idx + " 路径不变");
  eq(JSON.stringify(again.queryParams), JSON.stringify(orig.queryParams), "往返 " + idx + " 参数表不变");
});
var againE = M.parseUrl(E.rebuilt);
eq(againE.hostname, E.hostname, "往返 E 主机不变");
eq(JSON.stringify(againE.queryParams), JSON.stringify(E.queryParams), "往返 E 参数表不变");
eq(againE.portNote, "未指定", "往返 E 端口标注变为未指定（默认端口消隐的已知例外）");

/* ---------- 11. 非法输入 ---------- */
var badInputs = ["", "   ", "https://", "://bad", "https://exa mple.com", "https://example.com:abc/", "mailto:a@b.com", "http://[::1"];
/* 注：http:///path 按 WHATWG 原语是合法链接（主机为 path），故不列入非法用例。 */
badInputs.forEach(function (s, idx) {
  var r = M.parseUrl(s);
  ok(!r.valid && r.errors.length > 0, "非法输入 " + idx + "（" + JSON.stringify(s) + "）有明确提示");
  eq(r.rebuilt, undefined, "非法输入 " + idx + " 不输出畸形重组");
});

/* ---------- 12. JSON 结构 ---------- */
var J1 = M.toJsonObject(A);
eq(J1.originalInput, "https://app.example.com/oauth/callback?code=AbC123xyz&state=9f8e7d6c", "JSON 原始输入");
eq(J1.protocolPrepended, false, "JSON 补齐标记");
eq(J1.protocol, "https:", "JSON 协议");
eq(J1.hostname, "app.example.com", "JSON 主机");
eq(J1.queryParams.length, 2, "JSON 参数数组");
eq(J1.queryParams[0].key, "code", "JSON 参数键");
eq(J1.rebuilt, A.rebuilt, "JSON 重组链接");
ok(JSON.parse(JSON.stringify(J1)).queryParams[1].value === "9f8e7d6c", "JSON 可序列化往返");
var J2 = M.toJsonObject(H);
eq(J2.protocolPrepended, true, "JSON 无协议补齐标记 true");

/* ---------- 13. 示例静态检查 ---------- */
eq(M.EXAMPLES.length, 4, "示例共 4 组");
var exChecks = [
  function (p) { return p.queryParams.some(function (x) { return x.key === "code"; }) && p.queryParams.some(function (x) { return x.key === "state"; }); },
  function (p) { return p.queryParams.some(function (x) { return x.key === "utm_source"; }); },
  function (p) { return p.username === "user" && p.port === "8443" && p.hash === "#page=3"; },
  function (p) { return p.queryParams.filter(function (x) { return x.key === "tag"; }).length === 2 &&
    p.queryParams.some(function (x) { return x.key === "coupon" && x.hasValue && x.value === ""; }) &&
    p.queryParams.some(function (x) { return x.key === "promo" && !x.hasValue; }); }
];
M.EXAMPLES.forEach(function (ex, idx) {
  var p = M.parseUrl(ex.url);
  ok(p.valid, "示例 " + idx + "（" + ex.name + "）可解析");
  ok(exChecks[idx](p), "示例 " + idx + " 内容符合设计");
});

/* ---------- 14. 注册、模板文案与零网络请求 ---------- */
ok(GO_SRC.indexOf('"url_parser"') !== -1, "注册 ID url_parser");
ok(GO_SRC.indexOf('"/tools/url-parser"') !== -1, "注册 Path /tools/url-parser");
ok(GO_SRC.indexOf('Category:    "编码转换"') !== -1, "编码转换品类存在");
var pathCount = {};
(GO_SRC.match(/"\/tools\/[^"]+"/g) || []).forEach(function (p) { pathCount[p] = true; });
eq(Object.keys(pathCount).length, 167, "注册 Path 总数 166→167");
ok(TPL_SRC.indexOf("url_parser") !== -1, "模板 define 名 url_parser");
ok(TPL_SRC.indexOf("请按需改写") !== -1, "模板含请按需改写");
ok(TPL_SRC.indexOf("@ 之前不是真正主机") !== -1, "模板含 @ 前非真正主机");
ok(TPL_SRC.indexOf("默认端口") !== -1, "模板含默认端口");
ok(TPL_SRC.indexOf("不验证链接可达性") !== -1, "模板含不验证可达性");
ok(TPL_SRC.indexOf("不展开短链") !== -1, "模板含不展开短链");
ok(TPL_SRC.indexOf("含密码链接勿外传") !== -1, "模板含密码勿外传");
ok(TPL_SRC.indexOf("文本不出浏览器") !== -1, "模板含文本不出浏览器");
ok(TPL_SRC.indexOf("掩码") !== -1, "模板含密码掩码文案");
ok(TPL_SRC.indexOf("/tools/url-codec") !== -1, "模板互链 URL 编码/解码");
ok(TPL_SRC.indexOf("/tools/url-tracker-cleaner") !== -1, "模板互链追踪参数清除器");
ok(TPL_SRC.indexOf("https://www.johnkingzcq123.xyz/tools/url-parser") !== -1, "模板 canonical");
ok(JS_SRC.indexOf("fetch(") === -1, "JS 零 fetch 调用");
ok(JS_SRC.indexOf("XMLHttpRequest") === -1, "JS 零 XHR 调用");
ok(JS_SRC.indexOf("••••••••") !== -1, "JS 密码默认掩码");

console.log("url_parser: " + pass + " passed, " + fail + " failed");
if (fail > 0) process.exit(1);
