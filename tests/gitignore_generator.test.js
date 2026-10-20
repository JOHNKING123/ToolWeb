/* .gitignore 生成器纯逻辑单元测试（零依赖）：node tests/gitignore_generator.test.js
 * 覆盖：模板库完整性、分组顺序、去重规则、模板块注释分隔、空选择。
 */
"use strict";
var gi = require("../static/js/gitignore_generator.js");

var pass = 0, fail = 0;
function ok(cond, name) {
    if (cond) { pass++; }
    else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + b + "，实得 " + a + ")"); }

/* ---------- 模板库完整性 ---------- */
var ids = gi.GI_TEMPLATES.map(function (t) { return t.id; });
var expectIds = ["node","python","java","go","rust","php","ruby","csharp","cpp",
    "vue","react","django","laravel","flutter","android","xcode","dotnet",
    "macos","windows","linux","vscode","jetbrains","vim_emacs"];
expectIds.forEach(function (id) { ok(ids.indexOf(id) !== -1, "模板存在: " + id); });
eq(ids.length, expectIds.length, "模板总数 23");
/* id 唯一 */
ok(new Set(ids).size === ids.length, "模板 id 唯一");
/* 分组合法且非空 */
gi.GI_TEMPLATES.forEach(function (t) {
    ok(gi.GI_GROUP_ORDER.indexOf(t.group) !== -1, "分组合法: " + t.id);
    ok(Array.isArray(t.lines) && t.lines.length > 5, "模板有实质内容: " + t.id);
    ok(t.lines.every(function (l) { return typeof l === "string"; }), "模板行全为字符串: " + t.id);
});
/* 各分组数量：语言 9 / 框架 8 / 系统IDE 6 */
function countOf(g) { return gi.GI_TEMPLATES.filter(function (t) { return t.group === g; }).length; }
eq(countOf("lang"), 9, "语言组 9 个");
eq(countOf("framework"), 8, "框架组 8 个");
eq(countOf("env"), 6, "系统/IDE 组 6 个");

/* ---------- 空选择 ---------- */
var empty = gi.buildGitignore([]);
eq(empty.text, "", "空选择文本为空");
eq(empty.dupRemoved, 0, "空选择去重为 0");
eq(empty.blocks.length, 0, "空选择无块");

/* ---------- 单模板：块头 + 内容 ---------- */
var one = gi.buildGitignore(["python"]);
ok(one.text.indexOf("# ===== Python =====") === 0, "首行是 Python 块注释头");
ok(one.text.indexOf("__pycache__/") !== -1, "含 Python 核心规则");
ok(one.blocks.length === 1 && one.blocks[0].id === "python", "blocks 记录正确");

/* ---------- 拼接顺序：语言 → 框架 → 系统/IDE ---------- */
var mixed = gi.buildGitignore(["vscode", "node", "vue"]); /* 故意乱序传入 */
var iNode = mixed.text.indexOf("# ===== Node =====");
var iVue = mixed.text.indexOf("# ===== Vue =====");
var iVscode = mixed.text.indexOf("# ===== VSCode =====");
ok(iNode !== -1 && iVue !== -1 && iVscode !== -1, "三块都存在");
ok(iNode < iVue && iVue < iVscode, "顺序为 Node → Vue → VSCode（不受传入顺序影响）");

/* ---------- 去重：重复行只留首次 ---------- */
var dup = gi.buildGitignore(["node", "python"]); /* 都有 .env */
var envCount = dup.text.split("\n").filter(function (l) { return l === ".env"; }).length;
eq(envCount, 1, ".env 只出现一次");
ok(dup.dupRemoved > 0, "去重计数 > 0");
/* 首次出现位置在 Node 块内 */
var iEnv = dup.text.indexOf("\n.env\n");
var iPyHead = dup.text.indexOf("# ===== Python =====");
ok(iEnv !== -1 && iEnv < iPyHead, ".env 保留在首次出现的 Node 块");
/* Flutter + JetBrains：*.iml 只留一次 */
var fz = gi.buildGitignore(["flutter", "jetbrains"]);
var imlCount = fz.text.split("\n").filter(function (l) { return l === "*.iml"; }).length;
eq(imlCount, 1, "*.iml 只出现一次");

/* ---------- 未知 id 被忽略 ---------- */
var unk = gi.buildGitignore(["node", "no_such_template"]);
ok(unk.text.indexOf("# ===== Node =====") !== -1, "未知 id 不影响已知模板");

/* ---------- 文本以单换行结尾 ---------- */
var tail = gi.buildGitignore(["go"]);
ok(tail.text.charAt(tail.text.length - 1) === "\n", "文本以换行结尾");
ok(tail.text.slice(-2) !== "\n\n", "结尾无多余空行堆积");

console.log("\n通过 " + pass + "，失败 " + fail);
process.exit(fail ? 1 : 0);
