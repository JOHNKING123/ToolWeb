/* AI 提示词脱敏器纯逻辑单元测试（零依赖）：node tests/prompt_sanitizer.test.js
 * 覆盖：
 *  1. PEM 私钥块识别（RSA/OPENSSH/跨行/非贪婪）
 *  2. 数据库连接串识别（postgres/mongodb+srv/mysql/redis/尾部标点剥离/误报）
 *  3. JWT 识别（标准三段/过短拒识/嵌入句子）
 *  4. Bearer Token 识别（仅替换 token 部分）
 *  5. API Key 各前缀识别（sk-/ghp_/AKIA/xoxb-/AIza/ya29./glpat-/npm_）与误报
 *  6. 通用密钥对识别（key 名启发/短值拒识/误报）
 *  7. 冲突去重（PEM 内 JWT 不双报、连接串内密码不双报、sk- 在 KV 中优先）
 *  8. 占位符替换（按类型编号、逐条确认忽略、顺序）
 *  9. 还原往返（__API_KEY_10__ 前缀陷阱、多次出现、未命中占位符不动）
 * 10. 映射表存储（存取清往返、空值兜底）
 * 11. 零上传：脚本内无 fetch/XHR/WebSocket/EventSource
 */
"use strict";
var P = require("../static/js/prompt_sanitizer.js");
var fs = require("fs");

var pass = 0, fail = 0;
function ok(cond, name) {
    if (cond) { pass++; }
    else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function contains(s, sub, name) { ok(String(s).indexOf(sub) !== -1, name + "（期望包含 " + JSON.stringify(sub) + "）"); }
function notContains(s, sub, name) { ok(String(s).indexOf(sub) === -1, name + "（不应包含 " + JSON.stringify(sub) + "）"); }
function typesOf(hits) { return hits.map(function (h) { return h.type; }); }

/* ================= 1. PEM 私钥块 ================= */
(function () {
    var pem = "-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA7b8c\n-----END RSA PRIVATE KEY-----";
    var hits = P.detectSecrets(pem, ["pem"]);
    eq(hits.length, 1, "RSA 私钥块识别 1 处");
    eq(hits[0].type, "pem", "类型为 pem");
    eq(hits[0].value, pem, "整块为值");

    var openssh = "-----BEGIN OPENSSH PRIVATE KEY-----\nAAAAC3NzaC1lZDI1NTE5\n-----END OPENSSH PRIVATE KEY-----";
    hits = P.detectSecrets("key:\n" + openssh + "\ndone", ["pem"]);
    eq(hits.length, 1, "OPENSSH 私钥块识别");

    var two = pem + "\nxxx\n" + openssh;
    hits = P.detectSecrets(two, ["pem"]);
    eq(hits.length, 2, "两块私钥各识别 1 处（非贪婪不跨块）");

    var broken = "-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA7b8c\n（没有结束行）";
    hits = P.detectSecrets(broken, ["pem"]);
    eq(hits.length, 0, "无 END 行不识别");

    hits = P.detectSecrets("-----BEGIN CERTIFICATE-----\nABC\n-----END CERTIFICATE-----", ["pem"]);
    eq(hits.length, 0, "证书块不是私钥，不识别");
})();

/* ================= 2. 数据库连接串 ================= */
(function () {
    var pg = "DATABASE_URL=postgres://admin:P%40ssw0rd!2026@db.internal:5432/appdb?sslmode=require";
    var hits = P.detectSecrets(pg, ["dbconn"]);
    eq(hits.length, 1, "postgres 连接串识别 1 处");
    eq(hits[0].value, "postgres://admin:P%40ssw0rd!2026@db.internal:5432/appdb?sslmode=require", "连接串值完整");

    var mongo = "uri=mongodb+srv://reader:Secret123%21@cluster0.ab12c.mongodb.net/logs";
    hits = P.detectSecrets(mongo, ["dbconn"]);
    eq(hits.length, 1, "mongodb+srv 连接串识别");

    hits = P.detectSecrets("db=mysql://root:123456@localhost:3306/blog;", ["dbconn"]);
    eq(hits.length, 1, "mysql 连接串识别");
    eq(hits[0].value, "mysql://root:123456@localhost:3306/blog", "尾部分号被剥离");

    hits = P.detectSecrets("缓存地址：redis://:pass123@127.0.0.1:6379/0。", ["dbconn"]);
    eq(hits.length, 1, "redis 连接串识别");
    eq(hits[0].value, "redis://:pass123@127.0.0.1:6379/0", "尾部中文句号被剥离");

    hits = P.detectSecrets("见 https://example.com/docs 和 http://a.b/c", ["dbconn"]);
    eq(hits.length, 0, "http/https 不是数据库连接串");

    hits = P.detectSecrets("postgres://", ["dbconn"]);
    eq(hits.length, 0, "裸 scheme 无主机不识别");

    hits = P.detectSecrets('conn="postgresql://u:p@host/db" tail', ["dbconn"]);
    eq(hits.length, 1, "postgresql 别名识别");
    eq(hits[0].value, "postgresql://u:p@host/db", "尾部引号不计入");
})();

/* ================= 3. JWT ================= */
(function () {
    var jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
    var hits = P.detectSecrets("token=" + jwt, ["jwt"]);
    eq(hits.length, 1, "标准 JWT 识别");
    eq(hits[0].value, jwt, "JWT 值完整");
    eq(hits[0].start, 6, "JWT 起始位置正确（token= 之后）");

    hits = P.detectSecrets("请用这个 " + jwt + " 去调用接口。", ["jwt"]);
    eq(hits.length, 1, "句中 JWT 识别");
    eq(hits[0].value, jwt, "句末句号不计入");

    hits = P.detectSecrets("eyJhYg.eyJjZA.eyJ", ["jwt"]);
    eq(hits.length, 0, "过短三段不识别");

    hits = P.detectSecrets("eyJhbGciOiJIUzI1NiJ9", ["jwt"]);
    eq(hits.length, 0, "只有一段不识别");

    hits = P.detectSecrets("ordinary text without token", ["jwt"]);
    eq(hits.length, 0, "普通文本无误报");
})();

/* ================= 4. Bearer Token ================= */
(function () {
    var hits = P.detectSecrets("Authorization: Bearer abcdefghijklmnop1234", ["bearer"]);
    eq(hits.length, 1, "Bearer token 识别");
    eq(hits[0].value, "abcdefghijklmnop1234", "只取 token 部分");
    eq(hits[0].start, 22, "替换起点在 Bearer 空格之后");

    hits = P.detectSecrets("bearer ZYXWvutsrqponmlkji9876", ["bearer"]);
    eq(hits.length, 1, "小写 bearer 识别");

    hits = P.detectSecrets("Bearer short", ["bearer"]);
    eq(hits.length, 0, "过短 token 不识别");

    hits = P.detectSecrets("the bearers are coming", ["bearer"]);
    eq(hits.length, 0, "bearers 单词不误报");
})();

/* ================= 5. API Key 各前缀 ================= */
(function () {
    function one(text, expect, name) {
        var hits = P.detectSecrets(text, ["apikey"]);
        eq(hits.length, expect ? 1 : 0, name);
        if (expect && hits.length) eq(hits[0].type, "apikey", name + "（类型）");
    }
    one("key=sk-proj-9f8K2mQvX7nR4tLwP3sA6dF1gH5", true, "sk-proj- 识别");
    one("key=sk-live-9f8K2mQvX7nR4tLwP3sA6dF1gH5j", true, "sk-live- 识别");
    one("key=sk-9f8K2mQvX7nR4tLwP3sA6dF1gH5jK8lZ", true, "裸 sk- 识别");
    one("t=ghp_9f8K2mQvX7nR4tLwP3sA6dF1gH5jK8", true, "ghp_ 识别");
    one("t=gho_9f8K2mQvX7nR4tLwP3sA6dF1gH5jK8ab", true, "gho_ 识别");
    one("t=github_pat_11ABCDEFGH_0123456789abcdefghij", true, "github_pat_ 识别");
    one("id=AKIAIOSFODNN7EXAMPLE", true, "AKIA 识别");
    one("t=xox" + "b-123456789012-abcdefghijklmnopqrstuv", true, "xoxb- 识别");
    one("t=xox" + "p-123456789012-abcdefghijklmnopqrstuv", true, "xoxp- 识别");
    one("k=AIzaSyD-xxxxxxxxxxxxxxxxxxxx_123456", true, "AIza Google key 识别");
    one("t=ya29.a0AfH6SMBxxxxxxxxxxxxxxxxxxxxxxxxxx", true, "ya29. 识别");
    one("t=glpat-xxxxxxxxxxxxxxxxxxxx", true, "glpat- 识别");
    one("t=dckr_pat_abcdefghijklmnopqrstuvwx", true, "dckr_pat_ 识别");
    one("t=npm_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", true, "npm_ 识别");

    /* 误报 */
    one("sk-", false, "裸 sk- 无后缀不识别");
    one("ghp_short", false, "ghp_ 过短不识别");
    one("AKIAIOSFODNN7", false, "AKIA 过短不识别");
    one("task-id-12345", false, "普通 task-id 不误报");
    one("disk-space low", false, "含 sk 的普通词不误报");
})();

/* ================= 6. 通用密钥对 ================= */
(function () {
    function one(text, expect, name) {
        var hits = P.detectSecrets(text, ["secretkv"]);
        eq(hits.length, expect ? 1 : 0, name);
    }
    one("api_secret=9f8K2mQvX7nR4tLwP3sA6", true, "api_secret= 识别");
    one('OPENAI_API_KEY="abcdef1234567890abcdef"', true, "大写 API_KEY 带引号识别");
    one("db.password : hunter2hunter2hunter2", true, "password: 识别");
    one("clientSecret: aB3dE5fG7hI9jK1lM3nO5", true, "驼峰 clientSecret 识别");
    one("token=short", false, "短值不识别");
    one("password=123", false, "弱密码值过短不识别");
    one("note=remember to buy milk tomorrow", false, "含空格长句不识别");
    one("username=admin2026user", false, "username 不在密钥名表");
})();

/* ================= 7. 冲突去重 ================= */
(function () {
    /* PEM 块内即使出现 eyJ… 也不双报 */
    var pem = "-----BEGIN RSA PRIVATE KEY-----\neyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c\n-----END RSA PRIVATE KEY-----";
    var hits = P.detectSecrets(pem);
    eq(hits.length, 1, "PEM 内 JWT 不双报");
    eq(hits[0].type, "pem", "保留高优先级 pem");

    /* 连接串内的密码不被通用密钥对重复识别 */
    var hits2 = P.detectSecrets("url=postgres://admin:Secret123456@host/db");
    var ts = typesOf(hits2);
    eq(hits2.length, 1, "连接串整体只报 1 处");
    eq(ts[0], "dbconn", "保留 dbconn");

    /* sk- 值在 KV 赋值中：apikey 优先，KV 整条丢弃 */
    var hits3 = P.detectSecrets("OPENAI_API_KEY=sk-9f8K2mQvX7nR4tLwP3sA6dF1gH5jK8lZ");
    eq(hits3.length, 1, "KV 中的 sk- 只报 1 处");
    eq(hits3[0].type, "apikey", "apikey 优先");
    eq(hits3[0].value.indexOf("sk-"), 0, "值为 sk- 本体");

    /* 相邻不重叠的都保留 */
    var hits4 = P.detectSecrets("a=sk-9f8K2mQvX7nR4tLwP3sA6dF1gH5jK8lZ b=ghp_9f8K2mQvX7nR4tLwP3sA6dF1gH5jK8");
    eq(hits4.length, 2, "两个不重叠 key 都保留");
    eq(hits4[0].idx, 1, "idx 按出现顺序编号");
    eq(hits4[1].idx, 2, "idx 递增");

    /* 类型开关关闭 */
    var hits5 = P.detectSecrets("key=sk-9f8K2mQvX7nR4tLwP3sA6dF1gH5jK8lZ", ["jwt"]);
    eq(hits5.length, 0, "关闭 apikey 类型后不识别");
})();

/* ================= 8. 占位符替换 ================= */
(function () {
    var jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
    var text = "key=sk-9f8K2mQvX7nR4tLwP3sA6dF1gH5jK8lZ\njwt=" + jwt + "\ndb=postgres://u:p@h/d";
    var hits = P.detectSecrets(text);
    eq(hits.length, 3, "三类各 1 处");
    var r = P.sanitizeText(text, hits);
    eq(r.count, 3, "替换 3 处");
    contains(r.text, "__API_KEY_1__", "API Key 占位符");
    contains(r.text, "__JWT_1__", "JWT 占位符");
    contains(r.text, "__DB_CONN_1__", "连接串占位符");
    notContains(r.text, "sk-9f8K", "原文 key 不残留");
    notContains(r.text, "eyJhbGci", "原文 jwt 不残留");
    notContains(r.text, "postgres://u:p@h/d", "原文连接串不残留");
    eq(r.mapping["__API_KEY_1__"], "sk-9f8K2mQvX7nR4tLwP3sA6dF1gH5jK8lZ", "映射表记录 key");
    eq(r.mapping["__JWT_1__"], jwt, "映射表记录 jwt");
    eq(r.mapping["__DB_CONN_1__"], "postgres://u:p@h/d", "映射表记录连接串");

    /* 同类型多处递增编号 */
    var t2 = "a=sk-9f8K2mQvX7nR4tLwP3sA6dF1gH5jK8lZ b=sk-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    var r2 = P.sanitizeText(t2, P.detectSecrets(t2));
    contains(r2.text, "__API_KEY_1__", "首个 key 编号 1");
    contains(r2.text, "__API_KEY_2__", "第二个 key 编号 2");

    /* 逐条忽略 */
    var hits3 = P.detectSecrets(text);
    hits3[0].ignored = true;
    var r3 = P.sanitizeText(text, hits3);
    eq(r3.count, 2, "忽略 1 条后替换 2 处");
    contains(r3.text, "sk-9f8K2mQvX7nR4tLwP3sA6dF1gH5jK8lZ", "被忽略的条目保留原文");
    notContains(r3.text, "__API_KEY_1__", "被忽略的条目不生成占位符");

    /* 空输入 */
    var r4 = P.sanitizeText("", []);
    eq(r4.text, "", "空文本脱敏为空");
    eq(r4.count, 0, "空文本计数 0");
})();

/* ================= 9. 还原往返 ================= */
(function () {
    var text = "key=sk-9f8K2mQvX7nR4tLwP3sA6dF1gH5jK8lZ";
    var hits = P.detectSecrets(text);
    var r = P.sanitizeText(text, hits);
    /* 模拟 LLM 答案：含占位符 */
    var answer = "根据你的配置 " + r.text + "，建议轮换密钥。参考：" + r.text;
    var back = P.restoreText(answer, r.mapping);
    eq(back.text, "根据你的配置 " + text + "，建议轮换密钥。参考：" + text, "答案中占位符全部还原");
    eq(back.restored, 2, "还原计数 2");

    /* __API_KEY_10__ 前缀陷阱 */
    var many = [];
    for (var i = 0; i < 11; i++) many.push("k" + i + "=sk-" + "ABCDEFGHIJKLMNOP" + (100 + i));
    var tMany = many.join(" ");
    var rM = P.sanitizeText(tMany, P.detectSecrets(tMany));
    ok(!!rM.mapping["__API_KEY_10__"] && !!rM.mapping["__API_KEY_1__"], "生成到 __API_KEY_10__");
    var backM = P.restoreText(rM.text, rM.mapping);
    eq(backM.text, tMany, "__API_KEY_1__ 与 __API_KEY_10__ 还原不串");
    eq(backM.restored, 11, "11 处全部还原");

    /* 未知占位符不动 */
    var backU = P.restoreText("xxx __UNKNOWN_1__ yyy", r.mapping);
    eq(backU.text, "xxx __UNKNOWN_1__ yyy", "未知占位符保持原样");
    eq(backU.restored, 0, "未知占位符计数 0");

    /* 空映射 */
    var backE = P.restoreText("hello __API_KEY_1__", {});
    eq(backE.text, "hello __API_KEY_1__", "空映射不替换");

    /* 往返一致性 */
    eq(P.restoreText(r.text, r.mapping).text, text, "脱敏→还原往返一致");
})();

/* ================= 10. 映射表存储 ================= */
(function () {
    P.clearMapping();
    eq(Object.keys(P.loadMapping()).length, 0, "初始映射表为空");
    P.saveMapping({ "__API_KEY_1__": "secret-value-1" });
    eq(P.loadMapping()["__API_KEY_1__"], "secret-value-1", "存取往返");
    P.saveMapping({ "__JWT_1__": "jwt-1", "__JWT_2__": "jwt-2" });
    eq(Object.keys(P.loadMapping()).length, 2, "覆盖保存");
    P.clearMapping();
    eq(Object.keys(P.loadMapping()).length, 0, "销毁后为空");
    /* 刷新行为：init() 载入即 clearMapping()，陈旧映射不恢复 */
    P.saveMapping({ "__API_KEY_1__": "stale-value" });
    P.clearMapping(); /* 模拟页面刷新时 init() 的清空逻辑 */
    eq(Object.keys(P.loadMapping()).length, 0, "刷新后（init 清空）映射表为空");
    /* 源码确认：init 内先 clearMapping 再 refreshMapStatus */
    var srcInit = fs.readFileSync(__dirname + "/../static/js/prompt_sanitizer.js", "utf8");
    var iClear = srcInit.indexOf("clearMapping(); // 刷新页面时销毁陈旧映射");
    var iRefresh = srcInit.indexOf("refreshMapStatus();", iClear);
    eq(iClear > -1 && iRefresh > -1 && iClear < iRefresh, true, "init 先清空陈旧映射再刷新状态");
    /* 兜底：坏数据不抛异常 */
    P.saveMapping(null);
    eq(Object.keys(P.loadMapping()).length, 0, "保存 null 后读出为空对象");
})();

/* ================= 11. 零上传审计 ================= */
(function () {
    var src = fs.readFileSync(__dirname + "/../static/js/prompt_sanitizer.js", "utf8");
    ["fetch(", "XMLHttpRequest", "WebSocket(", "EventSource("].forEach(function (kw) {
        notContains(src, kw, "脚本内无 " + kw);
    });
    notContains(src, "localStorage", "映射表不用 localStorage（只用 sessionStorage/内存）");
    contains(src, "sessionStorage", "使用 sessionStorage");
})();

console.log("\n断言通过: " + pass + ", 失败: " + fail + ", 共 " + (pass + fail));
process.exit(fail === 0 ? 0 : 1);
