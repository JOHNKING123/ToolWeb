/* HTML→Markdown 转换器纯逻辑单元测试（零依赖）：node tests/html_to_markdown.test.js
 * 覆盖：四组手工复算用例、标题/粗斜体/删除线/链接/图片、嵌套列表 2 空格缩进、
 * 引用/行内与围栏代码、表格对齐与 | 转义、实体解码、丢弃清单、合并单元格、
 * 空输入、纯文本、完整文档、示例静态检查、注册与零网络请求。 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/html_to_markdown.js");

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function has(s, sub, name) { ok(String(s).indexOf(sub) !== -1, name + "（应包含 " + JSON.stringify(sub) + "，实得 " + JSON.stringify(s) + "）"); }
function notHas(s, sub, name) { ok(String(s).indexOf(sub) === -1, name + "（不应包含 " + JSON.stringify(sub) + "）"); }

var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "html_to_markdown.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "html_to_markdown.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

/* ---------- 1. 用例 A：CMS 文章（手工复算） ---------- */
var A = M.convertHtml(M.EXAMPLES[0].html);
ok(A.valid, "用例 A 合法");
eq(A.markdown.split("\n\n")[0], "# 给新人的第一篇技术笔记", "用例 A H1");
has(A.markdown, "这里记录**踩过的坑**和*真正有用的经验*", "用例 A 粗斜体");
has(A.markdown, "## 先说结论", "用例 A H2");
has(A.markdown, "[官方文档](https://example.com/docs)", "用例 A 链接");
has(A.markdown, "- 复现问题\n- 定位最小范围\n- 写测试锁定行为", "用例 A 无序列表");
eq(A.dropped.length, 0, "用例 A 无丢弃");

/* ---------- 2. 用例 B：表格 + 嵌套列表（手工复算） ---------- */
var B = M.convertHtml(M.EXAMPLES[1].html);
ok(B.valid, "用例 B 合法");
has(B.markdown, "- 前端\n  - 首页改版\n  - 列表页空态", "用例 B 嵌套列表 2 空格缩进");
has(B.markdown, "- 后端\n  - 接口限流", "用例 B 第二组嵌套");
has(B.markdown, "| 任务 | 负责人 | 进度 |", "用例 B 表头");
has(B.markdown, "| :--- | :---: | ---: |", "用例 B 对齐分隔行（左/中/右）");
has(B.markdown, "| 首页改版 | 小林 | 80% |", "用例 B 数据行");
has(B.markdown, "| 合计：A \\| B 两项并行 |  | 进行中 |", "用例 B colspan 拆格展开 + | 转义");
ok(B.warnings.length === 1 && B.warnings[0].indexOf("colspan") !== -1, "用例 B 合并单元格提示含 colspan");

/* ---------- 3. 用例 C：代码 + 引用 + 图片（手工复算） ---------- */
var C = M.convertHtml(M.EXAMPLES[2].html);
ok(C.valid, "用例 C 合法");
has(C.markdown, "> 先让它跑起来，再让它跑得快，最后让它好看。", "用例 C 引用");
has(C.markdown, "`npm install`", "用例 C 行内代码 1");
has(C.markdown, "```js", "用例 C 围栏语言取 language-js 后缀");
has(C.markdown, 'return "你好，" + name;', "用例 C 围栏内容原样");
has(C.markdown, "![系统架构图](https://example.com/arch.png)", "用例 C 图片引用");

/* ---------- 4. 用例 D：脏 HTML（手工复算） ---------- */
var D = M.convertHtml(M.EXAMPLES[3].html);
ok(D.valid, "用例 D 合法");
has(D.markdown, "## 旧系统导出的文章", "用例 D 标题仍在");
notHas(D.markdown, "alert", "用例 D 脚本内容不进正文");
notHas(D.markdown, ".post{color:red}", "用例 D 样式内容不进正文");
has(D.markdown, "Tom & Jerry © 2026", "用例 D 实体解码 &amp; &copy;");
has(D.markdown, "价格 5 < 10", "用例 D 实体解码 &lt;");
has(D.markdown, "**粗体**与*斜体*混排，~~删除线内容~~", "用例 D 粗斜体删除线");
function dropCount(res, tag) {
  for (var i = 0; i < res.dropped.length; i++) {
    if (res.dropped[i].tag === tag) return res.dropped[i].count;
  }
  return 0;
}
eq(dropCount(D, "style"), 1, "用例 D style 丢弃 1");
eq(dropCount(D, "script"), 1, "用例 D script 丢弃 1");
eq(dropCount(D, "form"), 1, "用例 D form 丢弃 1");
eq(dropCount(D, "input"), 1, "用例 D 表单内 input 逐项计数");
eq(dropCount(D, "button"), 1, "用例 D 表单内 button 逐项计数");
has(D.markdown, "| 合并项 | 第一行 |", "用例 D rowspan 首行");
has(D.markdown, "|  | 第二行 |", "用例 D rowspan 拆格展开第二行留空");
ok(D.warnings.length === 1 && D.warnings[0].indexOf("rowspan") !== -1, "用例 D 合并单元格提示含 rowspan");

/* ---------- 5. 单项映射 ---------- */
eq(M.convertHtml("<h3>三级</h3>").markdown, "### 三级", "单项 H3");
eq(M.convertHtml("<p><s>旧价</s></p>").markdown, "~~旧价~~", "单项 s 删除线");
eq(M.convertHtml('<p><a href="">空链</a></p>').markdown, "空链", "单项 href 为空只输出文本");
eq(M.convertHtml('<p><img src="" alt="占位"></p>').markdown, "占位", "单项 src 为空只输出 alt");
eq(M.convertHtml("<ol><li>一</li><li>二</li></ol>").markdown, "1. 一\n2. 二", "单项有序列表序号递增");
eq(M.convertHtml("<hr>").markdown, "---", "单项分割线");
eq(M.convertHtml("<p>第一行<br>第二行</p>").markdown, "第一行  \n第二行", "单项 br 行尾两空格硬换行");
eq(M.convertHtml("<pre>无语言代码</pre>").markdown, "```\n无语言代码\n```", "单项无语言围栏");
eq(M.convertHtml("<blockquote><p>行一</p><p>行二</p></blockquote>").markdown, "> 行一\n>\n> 行二", "单项引用多段空行标 >");
eq(M.convertHtml("<p>x&#65;&#x42;y</p>").markdown, "xABy", "单项数字实体解码");

/* ---------- 6. 输入形态 ---------- */
var E = M.convertHtml("");
ok(!E.valid && E.errors.length > 0, "空输入返回错误而非空字符串");
eq(M.convertHtml("   ").valid, false, "空白输入也报错");
eq(M.convertHtml("纯文本一段").markdown, "纯文本一段", "纯文本按段落原样输出不报错");
eq(M.convertHtml("<html><head><title>T</title></head><body><p>正文</p></body></html>").markdown, "正文", "完整文档只取 body 内容");
eq(M.convertHtml("<p>a</p><p>b</p>").markdown, "a\n\nb", "段落按空行分隔");
eq(M.convertHtml("<p><script>var a=1;</script>正文</p>").markdown, "正文", "行内脚本子树整体丢弃");
eq(dropCount(M.convertHtml("<script>a</script><script>b</script>"), "script"), 2, "同标签丢弃去重计数累加");

/* ---------- 7. 示例静态检查 ---------- */
eq(M.EXAMPLES.length, 4, "示例共 4 组");
for (var ei = 0; ei < M.EXAMPLES.length; ei++) {
  var er = M.convertHtml(M.EXAMPLES[ei].html);
  ok(er.valid && er.markdown !== "", "示例 " + ei + "（" + M.EXAMPLES[ei].name + "）转换后有正文");
}
has(TPL_SRC, "请按需改写", "模板含请按需改写提示");
has(TPL_SRC, "data-example=\"3\"", "模板 4 个示例按钮齐全");

/* ---------- 8. 注册与模板静态检查 ---------- */
has(GO_SRC, '"html_to_markdown"', "注册 ID");
has(GO_SRC, '"/tools/html-to-markdown"', "注册 Path");
ok(/ID:\s+"html_to_markdown"[\s\S]{0,1200}?Category:\s+"文本工具"/.test(GO_SRC), "注册品类为文本工具");
ok(/ID:\s+"html_to_markdown"[\s\S]{0,1200}?New:\s+true/.test(GO_SRC), "注册 New: true");
eq((GO_SRC.match(/Path:\s+"/g) || []).length, 169, "注册总数 168→169 Path");
has(TPL_SRC, "https://www.johnkingzcq123.xyz/tools/html-to-markdown", "模板 canonical");
has(TPL_SRC, "application/ld+json", "模板 JSON-LD");
has(TPL_SRC, "/tools/markdown-preview", "互链 Markdown 预览");
has(TPL_SRC, "/tools/markdown-to-word", "互链 Markdown 转 Word");
has(TPL_SRC, "/tools/markdown-to-excel", "互链 Markdown 表格转 Excel");
has(TPL_SRC, "id=\"hm-output\"", "输出只读区 id");
has(TPL_SRC, "id=\"hm-copy\"", "复制按钮 id");
has(TPL_SRC, "id=\"hm-download\"", "下载按钮 id");
has(TPL_SRC, "converted.md", "下载文件名 converted.md");
has(TPL_SRC, "只转语义结构不转样式", "真限制文案：只转语义不转样式");
has(TPL_SRC, "不抓取网页", "真限制文案：不抓取网页");
has(TPL_SRC, "图片只引用不下载", "真限制文案：图片只引用不下载");
has(TPL_SRC, "文本不出浏览器", "真限制文案：文本不出浏览器");
has(JS_SRC, "DOMParser", "浏览器路径用 DOMParser");
ok(JS_SRC.indexOf("fetch(") === -1 && JS_SRC.indexOf("XMLHttpRequest") === -1 && JS_SRC.indexOf("WebSocket") === -1, "JS 零 fetch/XHR/WebSocket");

console.log("html_to_markdown: " + pass + " passed, " + fail + " failed");
if (fail > 0) process.exit(1);
