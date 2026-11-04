/* 批量随机数生成器纯逻辑单元测试（零依赖）：node tests/batch_random_generator.test.js
 * 覆盖：
 *  1. validateRange 契约（规范化返回；非法参数 err.field 命名：min/max/decimals/count）
 *  2. genBatch 契约（确定性向量逐字；注入 seq；整数/小数/去重/排序）
 *  3. formatBatch / buildCsvFileName / buildCsvContent 契约
 *  4. categories.go 注册（ID/Path/Icon/Category/New）与 Path 总数 259
 *  5. 零网络请求静态检查（JS 无 fetch/XHR/WebSocket/EventSource；模板无外部 script CDN）
 *  6. 模板：SEO 面板、真限制三条、与 random_decision／mock_data_generator 双向互链「随机一条龙」
 */
"use strict";
var T = require("../static/js/batch_random_generator.js");
var fs = require("fs");
var path = require("path");
var ROOT = path.join(__dirname, "..");

var pass = 0, fail = 0;
function ok(cond, name) {
    if (cond) { pass++; }
    else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function contains(s, sub, name) { ok(String(s).indexOf(sub) !== -1, name + "（期望包含 " + JSON.stringify(sub) + "）"); }
function notContains(s, sub, name) { ok(String(s).indexOf(sub) === -1, name + "（不应包含 " + JSON.stringify(sub) + "）"); }
function throwsField(fn, field, name) {
    try { fn(); }
    catch (e) {
        ok(e instanceof Error && e.field === field, name + "（err.field=" + field + "）");
        return;
    }
    ok(false, name + "（期望抛出 Error）");
}
/* 确定性随机序列（循环，供 genBatch 注入） */
function seq(arr) { var i = 0; return function () { var v = arr[i % arr.length]; i++; return v; }; }

/* ================= 1. validateRange ================= */
(function () {
    var p = T.validateRange(1, 100, 0, 20, false);
    eq(JSON.stringify(p), JSON.stringify({min:1,max:100,decimals:0,count:20,unique:false}),
        "validateRange 规范化返回 {min,max,decimals,count,unique}");
    var p2 = T.validateRange(1, 100, 0, 20, 1);
    eq(p2.unique, true, "validateRange unique 转布尔");
    throwsField(function () { T.validateRange(10, 1, 0, 5, false); }, "min",
        "规格向量：validateRange(10,1,0,5,false) 抛 Error（err.field=min，开发轮定死）");
    throwsField(function () { T.validateRange(1, 10, 0, 11, true); }, "count",
        "规格向量：validateRange(1,10,0,11,true) 去重容量不足抛 Error（err.field=count）");
    throwsField(function () { T.validateRange(1.5, 10, 0, 5, false); }, "min", "min 非整数抛 Error（err.field=min）");
    throwsField(function () { T.validateRange("1", 10, 0, 5, false); }, "min", "min 字符串抛 Error（err.field=min）");
    throwsField(function () { T.validateRange(NaN, 10, 0, 5, false); }, "min", "min 为 NaN 抛 Error（err.field=min）");
    throwsField(function () { T.validateRange(1, 10.5, 0, 5, false); }, "max", "max 非整数抛 Error（err.field=max）");
    throwsField(function () { T.validateRange(1, Infinity, 0, 5, false); }, "max", "max 无穷抛 Error（err.field=max）");
    throwsField(function () { T.validateRange(1, 10, -1, 5, false); }, "decimals", "decimals=-1 抛 Error（err.field=decimals）");
    throwsField(function () { T.validateRange(1, 10, 7, 5, false); }, "decimals", "decimals=7 抛 Error（err.field=decimals）");
    throwsField(function () { T.validateRange(1, 10, 1.5, 5, false); }, "decimals", "decimals 非整数抛 Error（err.field=decimals）");
    throwsField(function () { T.validateRange(1, 10, 0, 0, false); }, "count", "count=0 抛 Error（err.field=count）");
    throwsField(function () { T.validateRange(1, 10, 0, 10001, false); }, "count", "count=10001 抛 Error（err.field=count）");
    throwsField(function () { T.validateRange(1, 10, 0, 5.5, false); }, "count", "count 非整数抛 Error（err.field=count）");
    /* 小数模式去重容量：0~1/2位 → 101 个不同值 */
    throwsField(function () { T.validateRange(0, 1, 2, 102, true); }, "count",
        "小数模式去重超限抛 Error（err.field=count，容量 101）");
    ok(T.validateRange(0, 1, 2, 101, true).count === 101, "小数模式去重恰满容量通过");
    ok(T.uniqueCapacity(0, 1, 2) === 101, "uniqueCapacity(0,1,2)=101");
    ok(T.uniqueCapacity(1, 10, 0) === 10, "uniqueCapacity(1,10,0)=10");
})();

/* ================= 2. genBatch ================= */
(function () {
    eq(JSON.stringify(T.genBatch({min:0,max:1,decimals:2,count:3,unique:false}, seq([0.123,0.456,0.789]))),
        JSON.stringify(["0.12","0.46","0.79"]),
        "规格向量：genBatch({min:0,max:1,decimals:2,count:3,unique:false}, seq([0.123,0.456,0.789]))→逐字命中");
    var v1 = T.genBatch({min:1,max:10,decimals:0,count:5,unique:true}, seq([0.1,0.5,0.3,0.9,0.7]));
    eq(v1.length, 5, "规格向量：整数去重长度 5");
    eq(new Set(v1).size, 5, "规格向量：整数去重成立");
    ok(v1.every(function (s) { var n = parseInt(s, 10); return n >= 1 && n <= 10; }),
        "规格向量：每个值 ∈ [1,10]");
    eq(JSON.stringify(v1), JSON.stringify(["2","6","4","10","8"]), "整数向量逐字：seq 映射 floor(r*10)+1");
    /* 整数边界：r→0 得 min，r→1( exclusive 上确界近似) 得 max */
    eq(JSON.stringify(T.genBatch({min:5,max:5,decimals:0,count:3,unique:false}, seq([0.0,0.5,0.9999]))),
        JSON.stringify(["5","5","5"]), "min=max 时恒为该值");
    eq(T.genBatch({min:1,max:10,decimals:0,count:2,unique:false}, seq([0.0]))[0], "1",
        "r=0 → min");
    eq(T.genBatch({min:1,max:10,decimals:0,count:2,unique:false}, seq([0.999999]))[0], "10",
        "r→1 → max");
    /* 小数去重：重复 rand 被拒绝采样跳过 */
    var vd = T.genBatch({min:0,max:1,decimals:1,count:3,unique:true}, seq([0.05,0.05,0.16,0.27]));
    eq(JSON.stringify(vd), JSON.stringify(["0.1","0.2","0.3"]),
        "小数去重：重复值被拒绝采样跳过（0.05→0.1 出现两次只取一次）");
    /* 排序 */
    eq(JSON.stringify(T.genBatch({min:1,max:100,decimals:0,count:4,unique:false,sort:"asc"}, seq([0.9,0.1,0.5,0.3]))),
        JSON.stringify(["11","31","51","91"]), "sort=asc 升序");
    eq(JSON.stringify(T.genBatch({min:1,max:100,decimals:0,count:4,unique:false,sort:"desc"}, seq([0.9,0.1,0.5,0.3]))),
        JSON.stringify(["91","51","31","11"]), "sort=desc 降序");
    eq(JSON.stringify(T.genBatch({min:1,max:100,decimals:0,count:4,unique:false}, seq([0.9,0.1,0.5,0.3]))),
        JSON.stringify(["91","11","51","31"]), "sort 缺省 none 保持生成顺序");
    throwsField(function () { T.genBatch({min:1,max:10,decimals:0,count:2,unique:false,sort:"up"}, seq([0.5])); },
        "sort", "非法 sort 抛 Error（err.field=sort）");
    throwsField(function () { T.genBatch({min:10,max:1,decimals:0,count:2,unique:false}, seq([0.5])); },
        "min", "genBatch 内建校验：min>max 抛 Error（err.field=min）");
    throwsField(function () { T.genBatch(null, seq([0.5])); }, "min", "genBatch params 非对象抛 Error");
    /* 默认随机源可用性（不注入 rand） */
    var vCrypto = T.genBatch({min:1,max:10,decimals:0,count:5,unique:true});
    eq(vCrypto.length, 5, "缺省 rand（crypto）可生成 5 个");
    ok(vCrypto.every(function (s) { var n = parseInt(s, 10); return n >= 1 && n <= 10; }),
        "缺省 rand 生成值 ∈ [1,10]");
})();

/* ================= 3. formatBatch / buildCsvFileName / buildCsvContent ================= */
(function () {
    eq(T.formatBatch(["0.12","0.46","0.79"]), "0.12\n0.46\n0.79", "formatBatch：一行一个");
    eq(T.formatBatch([]), "", "formatBatch：空数组→空串");
    throwsField(function () { T.formatBatch("x"); }, "values", "formatBatch 非数组抛 Error（err.field=values）");
    var fname = T.buildCsvFileName(new Date(2026, 10, 1, 17, 30, 5));
    eq(fname, "random_numbers_20261101_173005.csv", "buildCsvFileName 确定性向量逐字");
    ok(/^random_numbers_\d{8}_\d{6}\.csv$/.test(T.buildCsvFileName()),
        "规格向量：buildCsvFileName 匹配 /^random_numbers_\\d{8}_\\d{6}\\.csv$/");
    var csv = T.buildCsvContent(["1","2","3"]);
    eq(csv.charCodeAt(0), 0xFEFF, "buildCsvContent：首字符为 UTF-8 BOM");
    contains(csv, "1\r\n2\r\n3", "buildCsvContent：CRLF 分隔一行一个");
    throwsField(function () { T.buildCsvContent(null); }, "values", "buildCsvContent 非数组抛 Error（err.field=values）");
})();

/* ================= 4. categories.go 注册 ================= */
(function () {
    var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");
    var blockRe = /ID:\s*"batch_random_generator"[\s\S]*?Category:\s*"([^"]+)"/;
    var m = blockRe.exec(GO_SRC);
    ok(m !== null, "categories.go 含 batch_random_generator 注册块");
    contains(GO_SRC, 'Path:        "/tools/batch-random-generator"', "注册 Path 为 /tools/batch-random-generator");
    contains(GO_SRC, 'Icon:        "numbers"', "注册 Icon 为 numbers");
    eq((GO_SRC.match(/"numbers"/g) || []).length, 1, "numbers 全库仅本工具使用（0 占用→1）");
    eq(m ? m[1] : "", "开发工具", "注册 Category 为 开发工具");
    contains(GO_SRC, 'Name:        "批量随机数生成器"', "注册 Name 为 批量随机数生成器");
    ok(/ID:\s*"batch_random_generator"[\s\S]{0,2000}?New:\s*true/.test(GO_SRC), "注册 New: true");
    contains(GO_SRC.toLowerCase(), "batch random number generator", "Description 中英文双语（含英文）");
    var pathRe = /"\/tools\/[^"]+"/g, seen = {}, mm, pathCount = 0;
    while ((mm = pathRe.exec(GO_SRC)) !== null) { if (!seen[mm[0]]) { seen[mm[0]] = true; pathCount++; } }
    eq(pathCount, 294, "注册 Path 总数 268→270");
})();

/* ================= 5. 零网络静态检查 ================= */
(function () {
    var src = fs.readFileSync(path.join(ROOT, "static", "js", "batch_random_generator.js"), "utf8");
    ["fetch(", "XMLHttpRequest", "WebSocket(", "EventSource("].forEach(function (kw) {
        notContains(src, kw, "JS 内无 " + kw);
    });
    contains(src, "crypto.getRandomValues", "随机源走 crypto.getRandomValues");
    contains(src, "validateRange", "参数校验走纯函数 validateRange");
    contains(src, "genBatch", "生成走纯函数 genBatch");
    contains(src, "formatBatch", "复制文本走纯函数 formatBatch");
    contains(src, "buildCsvFileName", "CSV 文件名走纯函数 buildCsvFileName");
    contains(src, "navigator.clipboard", "复制优先走 navigator.clipboard");
    contains(src, "execCommand", "复制降级走 execCommand");
    contains(src, "\\uFEFF", "CSV 带 UTF-8 BOM");
    contains(src, "module.exports", "Node 自测暴露纯函数");
    var tpl = fs.readFileSync(path.join(ROOT, "templates", "batch_random_generator.html"), "utf8");
    notContains(tpl, "fetch(", "模板内无 fetch");
    notContains(tpl, "<script src=\"http", "模板无外部 script CDN");
})();

/* ================= 6. 模板：SEO／真限制／互链 ================= */
(function () {
    var tpl = fs.readFileSync(path.join(ROOT, "templates", "batch_random_generator.html"), "utf8");
    /* SEO 面板 */
    contains(tpl, "<title>批量随机数生成器", "SEO：title");
    contains(tpl, 'name="description"', "SEO：description");
    contains(tpl, 'name="keywords"', "SEO：keywords");
    contains(tpl, 'rel="canonical"', "SEO：canonical");
    contains(tpl, 'property="og:title"', "SEO：OG title");
    contains(tpl, "application/ld+json", "SEO：JSON-LD");
    contains(tpl, "https://www.johnkingzcq123.xyz/tools/batch-random-generator", "SEO：canonical/OG URL 为新 Path");
    contains(tpl, "numbers", "标题图标 numbers");
    /* 真限制三条（页面明示） */
    contains(tpl, "伪随机", "真限制①：伪随机声明");
    contains(tpl, "不适合抽奖公证", "真限制①：不适合抽奖公证/密钥");
    contains(tpl, "区间容量", "真限制②：去重上限为区间容量");
    contains(tpl, "超限直接拒绝生成、不静默截断", "真限制②：超限拒绝不静默截断");
    contains(tpl, "100% 浏览器本地处理不上传", "真限制③：纯本地零上传");
    contains(tpl, "零外部请求", "真限制③：零外部请求");
    /* 互链（与 random_decision／mock_data_generator 双向） */
    contains(tpl, "/tools/random-decision", "与 random_decision 互链");
    contains(tpl, "/tools/mock-data-generator", "与 mock_data_generator 互链");
    contains(tpl, "随机一条龙", "互链文案：随机一条龙");
    contains(tpl, "批量随机数生成器（当前）", "相关工具含当前态标记");
    /* 输入输出控件 */
    contains(tpl, 'id="brg-min"', "最小值输入");
    contains(tpl, 'id="brg-max"', "最大值输入");
    contains(tpl, 'id="brg-decimals"', "小数位选择");
    contains(tpl, 'id="brg-count-input"', "数量输入");
    contains(tpl, 'id="brg-unique"', "去重开关");
    contains(tpl, 'id="brg-sort"', "排序选择");
    contains(tpl, 'id="brg-list"', "结果列表");
    contains(tpl, 'id="brg-count"', "结果计数");
    contains(tpl, 'id="brg-copy"', "一键复制按钮");
    contains(tpl, 'id="brg-csv"', "CSV 下载按钮");
    contains(tpl, 'id="brg-sample"', "填入示例按钮");
    contains(tpl, 'id="brg-err"', "参数错误提示框");
    /* 回链（双向互链另一半） */
    var rdTpl = fs.readFileSync(path.join(ROOT, "templates", "random_decision.html"), "utf8");
    contains(rdTpl, "/tools/batch-random-generator", "random_decision 模板含回链（双向互链）");
    var mdgTpl = fs.readFileSync(path.join(ROOT, "templates", "mock_data_generator.html"), "utf8");
    contains(mdgTpl, "/tools/batch-random-generator", "mock_data_generator 模板含回链（双向互链）");
})();

console.log("\n断言通过: " + pass + ", 失败: " + fail + ", 共 " + (pass + fail));
process.exit(fail === 0 ? 0 : 1);
