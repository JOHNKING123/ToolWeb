/* RAG 文本分块预览器纯逻辑单元测试（零依赖）：node tests/rag_chunk_preview.test.js
 * 覆盖：
 *  1. chunkByChars 确定性向量（规格逐字命中：'abcdefghij'/4/0→3 块；'abcdefgh'/4/2 重叠滚动→3 块）
 *  2. chunkByChars 非法参数（err.field='text'/'chunkSize'/'overlap'）
 *  3. chunkByParagraph 确定性向量（规格逐字：'a\n\nb\n\nc'→3 块，start 0/3/6）＋非法参数
 *  4. chunkBySentence 确定性向量（规格逐字：'你好。世界！'→2 块）＋非法参数
 *  5. estimateChunkTokens 确定性向量（规格逐字：'hello world'===4、'中文'===2，与 ai_token_counter 同口径）＋非法参数
 *  6. summarizeChunks 汇总口径
 *  7. buildExport 导出结构
 *  8. window.RagChunkPreview 与 module.exports 同步导出
 *  9. categories.go 注册（ID/Path/Icon/Category/New，紧邻 ai_token_counter）与 Path 总数 273
 * 10. 零网络请求静态检查（JS 无 fetch/XHR/WebSocket；上传走 FileReader）
 * 11. 模板：SEO 面板、真限制三条、互链（ai_token_counter 双向、project_to_txt）与回链
 */
"use strict";
var R = require("../static/js/rag_chunk_preview.js");
var fs = require("fs");
var path = require("path");
var ROOT = path.join(__dirname, "..");

var pass = 0, fail = 0;
function ok(cond, name) {
    if (cond) { pass++; }
    else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function deepEq(a, b, name) { ok(JSON.stringify(a) === JSON.stringify(b), name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
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

/* ================= 1. chunkByChars 确定性向量（规格逐字） ================= */
(function () {
    var c = R.chunkByChars('abcdefghij', 4, 0);
    eq(c.length, 3, "规格向量①：chunkByChars('abcdefghij',4,0)→3 块");
    deepEq(c.map(function (x) { return x.text; }), ['abcd', 'efgh', 'ij'], "规格向量①：块文本 abcd/efgh/ij 逐字");
    deepEq(c.map(function (x) { return x.start; }), [0, 4, 8], "规格向量①：start 0/4/8");
    deepEq(c.map(function (x) { return x.end; }), [4, 8, 10], "规格向量①：end 4/8/10");
    deepEq(c.map(function (x) { return x.index; }), [1, 2, 3], "规格向量①：index 1/2/3");
    deepEq(c.map(function (x) { return x.chars; }), [4, 4, 2], "规格向量①：chars 4/4/2");

    var o = R.chunkByChars('abcdefgh', 4, 2);
    eq(o.length, 3, "规格向量②：重叠滚动 'abcdefgh'/4/2→3 块");
    deepEq(o.map(function (x) { return x.text; }), ['abcd', 'cdef', 'efgh'], "规格向量②：块文本 abcd/cdef/efgh 逐字");
    deepEq(o.map(function (x) { return x.start; }), [0, 2, 4], "规格向量②：start 0/2/4（步长=4-2=2）");
    deepEq(o.map(function (x) { return x.end; }), [4, 6, 8], "规格向量②：end 4/6/8");

    /* 每块必含新字符、无空块、不丢字符 */
    var t = R.chunkByChars('abcdefghij', 4, 0);
    eq(t.map(function (x) { return x.text; }).join(''), 'abcdefghij', "无重叠：块拼接还原原文");
    var t2 = R.chunkByChars('abcdefghi', 4, 2);
    eq(t2[t2.length - 1].end, 9, "有重叠：末块 end 覆盖原文末尾");
    deepEq(R.chunkByChars('', 4, 0), [], "空文本→空数组");
    var single = R.chunkByChars('abc', 10, 0);
    eq(single.length, 1, "chunkSize 大于文本→1 块");
    eq(single[0].text, 'abc', "单块文本为全文");
    ok(R.chunkByChars('abc', 2, 0).every(function (x) { return x.tokens >= 0 && x.chars > 0; }),
        "每块 chars>0 且 tokens 为非负数");
})();

/* ================= 2. chunkByChars 非法参数 ================= */
(function () {
    throwsField(function () { R.chunkByChars(123, 4, 0); }, 'text', "text 非字符串→err.field=text");
    throwsField(function () { R.chunkByChars(null, 4, 0); }, 'text', "text 为 null→err.field=text");
    throwsField(function () { R.chunkByChars('abc', 0, 0); }, 'chunkSize', "chunkSize=0→err.field=chunkSize");
    throwsField(function () { R.chunkByChars('abc', -3, 0); }, 'chunkSize', "chunkSize 为负→err.field=chunkSize");
    throwsField(function () { R.chunkByChars('abc', 2.5, 0); }, 'chunkSize', "chunkSize 非整数→err.field=chunkSize");
    throwsField(function () { R.chunkByChars('abc', '4', 0); }, 'chunkSize', "chunkSize 为字符串→err.field=chunkSize");
    throwsField(function () { R.chunkByChars('abc', 4, -1); }, 'overlap', "overlap 为负→err.field=overlap");
    throwsField(function () { R.chunkByChars('abc', 4, 4); }, 'overlap', "overlap>=chunkSize→err.field=overlap");
    throwsField(function () { R.chunkByChars('abc', 4, 5); }, 'overlap', "overlap>chunkSize→err.field=overlap");
    throwsField(function () { R.chunkByChars('abc', 4, 1.5); }, 'overlap', "overlap 非整数→err.field=overlap");
    throwsField(function () { R.chunkByChars('abc', 4); }, 'overlap', "overlap 缺失→err.field=overlap");
})();

/* ================= 3. chunkByParagraph ================= */
(function () {
    var c = R.chunkByParagraph('a\n\nb\n\nc');
    eq(c.length, 3, "规格向量③：'a\\n\\nb\\n\\nc'→3 块");
    deepEq(c.map(function (x) { return x.text; }), ['a', 'b', 'c'], "规格向量③：块文本 a/b/c 逐字");
    deepEq(c.map(function (x) { return x.start; }), [0, 3, 6], "规格向量③：start 0/3/6 逐字");
    deepEq(c.map(function (x) { return x.end; }), [1, 4, 7], "规格向量③：end 1/4/7");

    var multi = R.chunkByParagraph('line1\nline2\n\npara2');
    eq(multi.length, 2, "连续非空行合并为一段");
    eq(multi[0].text, 'line1\nline2', "多行段落保留原文换行");
    eq(multi[0].start, 0, "多行段落 start");
    eq(multi[1].text, 'para2', "第二段文本");

    var crlf = R.chunkByParagraph('a\r\n\r\nb');
    eq(crlf.length, 2, "CRLF 换行按段落切分");
    deepEq(crlf.map(function (x) { return x.text; }), ['a', 'b'], "CRLF 段落文本");

    deepEq(R.chunkByParagraph(''), [], "空文本→空数组");
    deepEq(R.chunkByParagraph('\n\n  \n'), [], "全空白→空数组");
    var trail = R.chunkByParagraph('a\n');
    eq(trail.length, 1, "尾随换行不产生空块");

    throwsField(function () { R.chunkByParagraph(42); }, 'text', "text 非字符串→err.field=text");
    throwsField(function () { R.chunkByParagraph(undefined); }, 'text', "text 缺失→err.field=text");
})();

/* ================= 4. chunkBySentence ================= */
(function () {
    var c = R.chunkBySentence('你好。世界！');
    eq(c.length, 2, "规格向量④：'你好。世界！'→2 块");
    deepEq(c.map(function (x) { return x.text; }), ['你好。', '世界！'], "规格向量④：块文本逐字（标点归入本句）");
    eq(c[0].start, 0, "规格向量④：第一句 start=0");
    eq(c[1].start, 3, "规格向量④：第二句 start=3");

    var en = R.chunkBySentence('Hello world. Goodbye!');
    eq(en.length, 2, "英文句号/感叹号分句");
    deepEq(en.map(function (x) { return x.text; }), ['Hello world.', ' Goodbye!'], "英文分句文本逐字");
    var noTerm = R.chunkBySentence('没有标点的一段话');
    eq(noTerm.length, 1, "无句末标点→整段一块");
    eq(noTerm[0].text, '没有标点的一段话', "无标点文本原样成块");
    deepEq(R.chunkBySentence('   \n  '), [], "纯空白→空数组");

    throwsField(function () { R.chunkBySentence(null); }, 'text', "text 非字符串→err.field=text");
})();

/* ================= 5. estimateChunkTokens ================= */
(function () {
    eq(R.estimateChunkTokens('hello world'), 4, "规格向量⑤：estimateChunkTokens('hello world')===4");
    eq(R.estimateChunkTokens('中文'), 2, "规格向量⑥：estimateChunkTokens('中文')===2");
    eq(R.estimateChunkTokens(''), 0, "空文本→0");
    /* 与 ai_token_counter 同口径：中英混排抽查 */
    eq(R.estimateChunkTokens('hello中文world'), 2 + 2 + 2, "中英混排口径一致（2+2+2）");
    ok(R.estimateChunkTokens('abcd') === 1, "4 字母=1 token（英文子词分段）");
    ok(R.estimateChunkTokens('abcde') === 2, "5 字母=2 tokens（ceil(5/4)）");
    throwsField(function () { R.estimateChunkTokens(123); }, 'text', "text 非字符串→err.field=text");
})();

/* ================= 6. summarizeChunks ================= */
(function () {
    var chunks = R.chunkByChars('abcdefghij', 4, 0);
    var s = R.summarizeChunks(chunks);
    eq(s.count, 3, "汇总：总块数 3");
    eq(s.totalChars, 10, "汇总：总字符 10");
    eq(s.totalTokens, chunks[0].tokens + chunks[1].tokens + chunks[2].tokens, "汇总：总 token=各块之和");
    eq(s.avgTokens, Math.round(s.totalTokens / 3 * 10) / 10, "汇总：平均 token 口径");
    eq(s.maxTokens, Math.max.apply(null, chunks.map(function (c) { return c.tokens; })), "汇总：最大块 token");
    eq(s.minTokens, Math.min.apply(null, chunks.map(function (c) { return c.tokens; })), "汇总：最小块 token");
    var empty = R.summarizeChunks([]);
    deepEq(empty, { count: 0, totalChars: 0, totalTokens: 0, avgTokens: 0, maxTokens: 0, minTokens: 0 },
        "空数组汇总全零");
    throwsField(function () { R.summarizeChunks('nope'); }, 'chunks', "chunks 非数组→err.field=chunks");
})();

/* ================= 7. buildExport ================= */
(function () {
    var chunks = R.chunkByChars('abcdefghij', 4, 0);
    var data = R.buildExport('chars', { chunkSize: 4, overlap: 0 }, chunks, null);
    eq(data.tool, 'rag_chunk_preview', "导出：tool 标识");
    eq(data.version, 1, "导出：version=1");
    eq(data.strategy, 'chars', "导出：strategy");
    deepEq(data.params, { chunkSize: 4, overlap: 0 }, "导出：params 原样");
    eq(data.summary.count, 3, "导出：summary 自动汇总");
    eq(data.chunks.length, 3, "导出：chunks 数量");
    deepEq(data.chunks[0], { index: 1, start: 0, end: 4, chars: 4, tokens: chunks[0].tokens, text: 'abcd' },
        "导出：首块结构逐字");
    ok(typeof data.exportedAt === 'string' && data.exportedAt.length > 0, "导出：exportedAt 时间戳");
    ok(JSON.parse(JSON.stringify(data)) !== null, "导出对象可 JSON 序列化");
    throwsField(function () { R.buildExport('nope', {}, [], null); }, 'strategy', "strategy 非法→err.field=strategy");
    throwsField(function () { R.buildExport('chars', {}, 'x', null); }, 'chunks', "chunks 非数组→err.field=chunks");
})();

/* ================= 8. window/module 导出一致性 ================= */
(function () {
    var names = ['chunkByChars', 'chunkByParagraph', 'chunkBySentence', 'estimateChunkTokens',
        'summarizeChunks', 'buildExport', 'escapeHtml', 'highlightHtml', 'SAMPLE'];
    names.forEach(function (n) {
        ok(typeof R[n] === 'function' || typeof R[n] === 'string', "module.exports 暴露 " + n);
    });
    /* 浏览器契约：源码中挂载 window.RagChunkPreview */
    var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "rag_chunk_preview.js"), "utf8");
    contains(JS_SRC, "window.RagChunkPreview", "浏览器契约 window.RagChunkPreview");
    contains(JS_SRC, "module.exports", "Node 契约 module.exports");
    notContains(JS_SRC, "window.RagChunkPreview = undefined", "非空挂载");
})();

/* ================= 9. categories.go 注册 ================= */
(function () {
    var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");
    var idx = GO_SRC.indexOf('"rag_chunk_preview"');
    ok(idx >= 0, "注册：categories.go 含 ID rag_chunk_preview");
    ok(GO_SRC.indexOf('"/tools/rag-chunk-preview"') >= 0, "注册 Path /tools/rag-chunk-preview");
    var iconHits = (GO_SRC.match(/"splitscreen"/g) || []).length;
    eq(iconHits, 1, "注册：Icon splitscreen 全库唯一（开发轮复测锁定）");
    var block = GO_SRC.slice(idx, idx + 1800);
    contains(block, 'Icon:        "splitscreen"', "注册 Icon splitscreen");
    contains(block, "New:         true", "注册 New 为 true");
    contains(block, 'Category:    "AI 工具"', "注册 Category 为 AI 工具");
    contains(block, 'Path:        "/tools/rag-chunk-preview"', "注册 Path 字段");
    contains(block, "RAG 文本分块", "Description 含中文关键词 RAG 文本分块");
    contains(block, "RAG text chunking preview", "Description 含英文关键词");
    ok(GO_SRC.indexOf('"rag_chunk_preview"') > GO_SRC.indexOf('"ai_token_counter"'),
        "注册：紧邻 ai_token_counter 之后");
    ok(GO_SRC.indexOf('"rag_chunk_preview"') < GO_SRC.indexOf('"ai_text_cleaner"'),
        "注册：位于 ai_text_cleaner 之前");
    var pathCount = (GO_SRC.match(/"\/tools\/[^"]+"/g) || []).filter(function (v, i, a) { return a.indexOf(v) === i; }).length;
    eq(pathCount, 325, "注册：Path 总数 271→273");
    notContains(GO_SRC.match(/"\/tools\/[^"]+"/g).join(" "), '"/tools/rag-chunk-preview", "/tools/rag-chunk-preview',
        "注册：Path 无重复");
})();

/* ================= 10. 零网络请求静态检查 ================= */
(function () {
    var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "rag_chunk_preview.js"), "utf8");
    notContains(JS_SRC, "fetch(", "JS 无 fetch");
    notContains(JS_SRC, "XMLHttpRequest", "JS 无 XHR");
    notContains(JS_SRC, "WebSocket", "JS 无 WebSocket");
    notContains(JS_SRC, "navigator.sendBeacon", "JS 无 sendBeacon");
    contains(JS_SRC, "FileReader", "文件上传走 FileReader 本地读取");
    contains(JS_SRC, "不上传", "注释/文案声明不上传");
})();

/* ================= 11. 模板：SEO／真限制／互链 ================= */
(function () {
    var tpl = fs.readFileSync(path.join(ROOT, "templates", "rag_chunk_preview.html"), "utf8");
    contains(tpl, "{{define \"rag_chunk_preview\"}}", "模板 define 名");
    contains(tpl, "<title>", "SEO：title");
    contains(tpl, "rag-chunk-preview", "SEO：canonical/og 含 slug");
    contains(tpl, "application/ld+json", "SEO：JSON-LD");
    /* 真限制三条 */
    contains(tpl, "真限制请先看清", "真限制面板");
    contains(tpl, "本地估算", "真限制①：本地估算非精确 tokenizer");
    contains(tpl, "tiktoken", "真限制①：点名 tiktoken");
    contains(tpl, "启发式", "真限制②：中文分句启发式");
    contains(tpl, "纯本地零上传", "真限制③：纯本地零上传");
    contains(tpl, "Network 面板", "真限制③：Network 面板自证");
    /* 互链：LLM 预处理一条龙 */
    contains(tpl, "/tools/ai-token-counter", "互链 ai_token_counter");
    contains(tpl, "/tools/project-to-txt", "互链 project_to_txt");
    contains(tpl, "LLM 预处理一条龙", "互链组合文案");
    contains(tpl, "RAG 文本分块预览器（当前）", "相关工具当前态标记");
    contains(tpl, "splitscreen", "模板 icon splitscreen");
    contains(tpl, "/tools/static/js/rag_chunk_preview.js", "模板引用 JS");

    /* 回链（双向） */
    var atcTpl = fs.readFileSync(path.join(ROOT, "templates", "ai_token_counter.html"), "utf8");
    contains(atcTpl, "/tools/rag-chunk-preview", "ai_token_counter 模板含回链");
    var ptxTpl = fs.readFileSync(path.join(ROOT, "templates", "project_to_txt.html"), "utf8");
    contains(ptxTpl, "/tools/rag-chunk-preview", "project_to_txt 模板含回链");
})();

console.log("\n通过 " + pass + "，失败 " + fail);
process.exit(fail ? 1 : 0);
