/* cURL → Python Requests 转换器纯逻辑单元测试（零依赖）：node tests/curl_to_requests.test.js
 * 覆盖：
 *  1. shell 词法切分（单双引号嵌套、转义、行尾续行、$'...' ANSI 引号、引号未闭合）
 *  2. 参数映射（-X、--url、-H、--data-raw JSON、-d 表单、-F、-u、-k、-b、-A、--compressed、--max-time）
 *  3. 代码生成快照（json= / data= / files= / auth= / verify=False / timeout / params 提示）
 *  4. 未知参数诊断（不静默丢弃）
 */
"use strict";
var C = require("../static/js/curl_to_requests.js");

var pass = 0, fail = 0;
function ok(cond, name) {
    if (cond) { pass++; }
    else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function contains(s, sub, name) { ok(String(s).indexOf(sub) !== -1, name + "（期望包含 " + JSON.stringify(sub) + "，实得 " + JSON.stringify(s).slice(0, 200) + "）"); }

/* ---------- 1. 词法切分 ---------- */

(function () {
    var t = C.tokenize("curl -H 'X-A: a\"b' \"c'd\" end");
    eq(t.tokens.length, 5, "引号嵌套切分 token 数");
    eq(t.tokens[2], "X-A: a\"b", "单引号内双引号原样保留");
    eq(t.tokens[3], "c'd", "双引号内单引号原样保留");
    eq(t.errors.length, 0, "引号嵌套无错误");
})();

(function () {
    var t = C.tokenize("curl 'https://a.com' \\\n  -H 'X: 1' \\\n  --data 'x=1'");
    eq(t.tokens.length, 6, "续行折叠后 token 数");
    eq(t.tokens[1], "https://a.com", "续行后 URL 正确");
    eq(t.tokens[3], "X: 1", "续行后 header 正确");
})();

(function () {
    var t = C.tokenize("curl --data-raw $'a\\nb'");
    eq(t.tokens[2], "a\nb", "$'...' 中 \\n 展开为换行");
})();

(function () {
    var t = C.tokenize('curl -H "X: a\\"b"');
    eq(t.tokens[2], 'X: a"b', "双引号内转义双引号");
})();

(function () {
    var t = C.tokenize("curl -H 'X: 1");
    ok(t.errors.length > 0, "单引号未闭合报错");
    ok(t.tokens.length >= 1, "未闭合时仍产出 token");
})();

(function () {
    var t = C.tokenize("curl 'https://a.com'; rm -rf /");
    ok(t.tokens.__truncated === true, "分号后命令被截断");
    eq(t.tokens[1], "https://a.com", "截断前 URL 保留");
})();

/* ---------- 2. 参数映射：GET 带 headers ---------- */

(function () {
    var r = C.parseCurl("curl 'https://api.example.com/v1/users?page=2' -H 'Accept: application/json' -H 'Authorization: Bearer abc' --compressed");
    eq(r.method, "GET", "无数据时方法推断为 GET");
    eq(r.url, "https://api.example.com/v1/users?page=2", "URL 解析");
    eq(r.headers.length, 3, "headers 数量（2 个 -H + compressed 注入 Accept-Encoding）");
    eq(r.headers[0].name, "Accept", "header 名解析");
    eq(r.headers[0].value, "application/json", "header 值解析");
    var ae = r.headers.filter(function (h) { return h.name === "Accept-Encoding"; });
    eq(ae.length, 1, "--compressed 注入 Accept-Encoding");
    eq(ae[0].value, "gzip, deflate", "Accept-Encoding 值为 gzip, deflate");
})();

/* ---------- 3. POST --data-raw JSON ---------- */

(function () {
    var r = C.parseCurl("curl -X POST 'https://api.example.com/v1/users' -H 'Content-Type: application/json' --data-raw '{\"name\": \"张三\", \"age\": 30, \"tags\": [\"a\"], \"ok\": true}'");
    eq(r.method, "POST", "-X POST 方法");
    eq(r.methodExplicit, true, "方法标记为显式指定");
    eq(r.data.length, 1, "data 收集 1 条");
    var g = C.generateCode(r);
    contains(g.code, "json=payload", "JSON 数据使用 json= 参数");
    contains(g.code, "'name': '张三'", "json payload 含中文名");
    contains(g.code, "True", "Python 布尔 True");
    contains(g.code, "requests.post(", "调用 requests.post");
    contains(g.code, "Content-Type: application/json", "生成代码注释说明 json= 自动设 Content-Type");
})();

/* ---------- 4. -d 表单数据（非 JSON） ---------- */

(function () {
    var r = C.parseCurl("curl https://api.example.com/login -d 'user=admin' -d 'pass=123' -A 'MyAgent/1.0'");
    eq(r.method, "POST", "有 data 时方法推断为 POST");
    eq(r.data.length, 2, "两次 -d 合并收集");
    var g = C.generateCode(r);
    contains(g.code, "data=data", "非 JSON 使用 data= 参数");
    contains(g.code, "data = 'user=admin&pass=123'", "多次 -d 用 & 连接");
    contains(g.code, "'User-Agent': 'MyAgent/1.0'", "-A 映射为 User-Agent 请求头");
    ok(g.code.indexOf("json=") === -1, "非 JSON 不出现 json=");
})();

/* ---------- 5. -F multipart（含文件） ---------- */

(function () {
    var r = C.parseCurl("curl -X POST https://api.example.com/upload -F 'title=测试' -F 'file=@/tmp/a.png' --max-time 30");
    eq(r.formFields.length, 1, "-F 普通字段");
    eq(r.formFiles.length, 1, "-F @file 文件字段");
    eq(r.timeout, 30, "--max-time 映射为 timeout");
    var g = C.generateCode(r);
    contains(g.code, "files = {", "生成 files 字典");
    contains(g.code, "open('/tmp/a.png', 'rb')", "文件以 rb 模式打开");
    contains(g.code, "timeout=30", "timeout 参数");
    contains(g.code, "multipart/form-data", "注释说明 multipart 形态");
})();

/* ---------- 6. -u 认证 + -k ---------- */

(function () {
    var r = C.parseCurl("curl -k -u 'user:p@ss' https://self-signed.example.com/api");
    eq(r.auth.user, "user", "auth 用户名");
    eq(r.auth.pass, "p@ss", "auth 密码");
    eq(r.insecure, true, "-k 标记 insecure");
    var g = C.generateCode(r);
    contains(g.code, "auth=('user', 'p@ss')", "生成 auth 元组");
    contains(g.code, "verify=False", "生成 verify=False");
    contains(g.code, "仅用于自签名/测试环境", "-k 附中文安全警告注释");
})();

/* ---------- 7. Cookie 解析 ---------- */

(function () {
    var r = C.parseCurl("curl https://a.com -b 's=abc; t=123' -H 'Cookie: k=v'");
    eq(r.cookies.length, 3, "-b 与 Cookie 头合并解析");
    var g = C.generateCode(r);
    contains(g.code, "cookies = {", "生成 cookies 字典");
    contains(g.code, "'s': 'abc'", "cookie s");
})();

/* ---------- 8. 未知参数诊断 ---------- */

(function () {
    var r = C.parseCurl("curl https://a.com --proxy http://p:8080 --retry 3 --fancy-flag");
    eq(r.unhandled.length, 3, "3 个未知参数全部进入诊断");
    eq(r.unhandled[0].opt, "--proxy", "未知参数名记录");
    eq(r.unhandled[0].arg, "http://p:8080", "未知参数值被消费记录");
    var g = C.generateCode(r);
    contains(g.code, "未处理参数：--proxy http://p:8080", "代码注释含未处理参数诊断");
    contains(g.code, "未处理参数：--fancy-flag", "无值未知参数也诊断");
})();

/* ---------- 9. GET 带 data 提示 ---------- */

(function () {
    var r = C.parseCurl("curl -X GET https://a.com -d 'q=1'");
    eq(r.method, "GET", "显式 GET");
    ok(r.warnings.some(function (w) { return w.indexOf("params=") !== -1; }), "GET 带 data 提示改用 params=");
    var g = C.generateCode(r);
    contains(g.code, "params=", "警告注释含 params= 建议");
})();

/* ---------- 10. 特殊方法与 URL 形态 ---------- */

(function () {
    var r = C.parseCurl("curl --request DELETE --url https://a.com/items/1");
    eq(r.method, "DELETE", "--request 映射方法");
    eq(r.url, "https://a.com/items/1", "--url 映射地址");
    var g = C.generateCode(r);
    contains(g.code, "requests.delete(url)", "DELETE 调用 requests.delete");
})();

(function () {
    var r = C.parseCurl("curl --request PROPFIND https://a.com/x");
    var g = C.generateCode(r);
    contains(g.code, "requests.request('PROPFIND', url)", "非常见方法走 requests.request");
})();

/* ---------- 11. pyStr 转义 ---------- */

(function () {
    eq(C.pyStr("a'b\\c"), "'a\\'b\\\\c'", "单引号与反斜杠转义");
    eq(C.pyStr("line1\nline2"), "'line1\\nline2'", "换行转义");
})();

/* ---------- 12. 缺 URL 报错 ---------- */

(function () {
    var r = C.parseCurl("curl -H 'X: 1'");
    ok(r.errors.length > 0, "缺 URL 时 errors 非空");
    var g = C.generateCode(r);
    contains(g.code, "无法生成代码", "缺 URL 时生成占位注释");
})();

console.log("\n通过 " + pass + " / 失败 " + fail + "（共 " + (pass + fail) + "）");
process.exit(fail ? 1 : 0);
