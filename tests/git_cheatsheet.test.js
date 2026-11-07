/* Git 命令速查＋灾难救援卡（git_cheatsheet）纯逻辑单元测试（零依赖）：
 * node tests/git_cheatsheet.test.js
 * 覆盖：数据总量与十类分布、逐条六字段齐全无空、id 唯一、类别枚举合法、
 * 救援卡总量与五字段齐全、危险步骤标红、searchCommands（大小写／中文／
 * 空关键词／非法参数 err.field）、getCommand／getRescue（未知 id 抛错
 * err.field='id'）、groupByCategory 保序分组、buildCopyText／buildRescueCopy
 * 拼接精确值、validateCommand 缺字段抛错 err.field、sanitizeFileName 空回退
 * 'git-cheatsheet'、注册（Path 总数 301→302、Icon sos 全库唯一）、JS 零
 * fetch/XHR、模板静态检查（零外部资源、真限制四条、互链）。
 */
"use strict";
var fs = require("fs");
var path = require("path");
var G = require("../static/js/git_cheatsheet.js");
var JS_SRC = fs.readFileSync(path.join(__dirname, "..", "static", "js", "git_cheatsheet.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(__dirname, "..", "templates", "git_cheatsheet.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(__dirname, "..", "tools", "categories.go"), "utf8");

var pass = 0, fail = 0;
function ok(cond, name) {
    if (cond) { pass++; }
    else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function has(s, sub, name) { ok(s.indexOf(sub) !== -1, name + "（缺失：" + sub + "）"); }
function notHas(s, sub, name) { ok(s.indexOf(sub) === -1, name + "（不应含：" + sub + "）"); }
function throwsField(fn, field, name) {
    try { fn(); ok(false, name + "（未抛错）"); }
    catch (e) { eq(e.field, field, name); }
}

var COMMANDS = G.COMMANDS;
var SCENARIOS = G.RESCUE_SCENARIOS;

/* ---------- 1. 总量与十类分布 ---------- */
ok(COMMANDS.length >= 70, "命令总数 ≥70（实得 " + COMMANDS.length + "）");
eq(COMMANDS.length, 78, "命令总数 78");
eq(SCENARIOS.length, 10, "救援卡总数 10");
eq(G.CATEGORY_KEYS.length, 10, "十类枚举");
function countCat(cat) { return COMMANDS.filter(function (c) { return c.category === cat; }).length; }
eq(countCat("config"), 7, "配置 7 条");
eq(countCat("basic"), 8, "基础 8 条");
eq(countCat("branch"), 9, "分支 9 条");
eq(countCat("stash"), 7, "暂存 7 条");
eq(countCat("undo"), 8, "撤销 8 条");
eq(countCat("remote"), 9, "远程 9 条");
eq(countCat("log"), 8, "日志 8 条");
eq(countCat("tag"), 7, "标签 7 条");
eq(countCat("workspace"), 7, "工作区 7 条");
eq(countCat("advanced"), 8, "高级 8 条");
eq(G.CATEGORY_LABELS["undo"], "撤销", "类别标签 undo");
eq(G.CATEGORY_LABELS["advanced"], "高级", "类别标签 advanced");

/* ---------- 2. 逐条六字段齐全无空 ---------- */
var CMD_FIELDS = ["id", "name", "syntax", "desc", "example", "category"];
var bad = [];
COMMANDS.forEach(function (c) {
    CMD_FIELDS.forEach(function (f) {
        if (typeof c[f] !== "string" || c[f].replace(/^\s+|\s+$/g, "") === "") bad.push(c.id + "." + f);
    });
});
ok(bad.length === 0, "逐条六字段齐全无空字段" + (bad.length ? "（缺失：" + bad.slice(0, 5).join(",") + "）" : ""));
ok(COMMANDS.every(function (c) { return G.CATEGORY_KEYS.indexOf(c.category) !== -1; }), "类别枚举合法");
var ids = COMMANDS.map(function (c) { return c.id; });
eq(new Set(ids).size, ids.length, "命令 id 唯一无重复");
ok(COMMANDS.every(function (c) { return c.syntax.indexOf("git ") === 0; }), "语法均以 git 开头");
ok(COMMANDS.every(function (c) { return G.validateCommand(c).ok === true; }), "全部命令通过 validateCommand");

/* ---------- 3. 救援卡五字段齐全、危险步骤 ---------- */
var badSc = [];
SCENARIOS.forEach(function (s) {
    ["id", "title", "symptom", "diagnosis", "prevention"].forEach(function (f) {
        if (typeof s[f] !== "string" || s[f].replace(/^\s+|\s+$/g, "") === "") badSc.push(s.id + "." + f);
    });
    if (!Array.isArray(s.steps) || s.steps.length === 0) badSc.push(s.id + ".steps");
    s.steps.forEach(function (st) {
        if (typeof st.note !== "string" || st.note === "") badSc.push(s.id + ".step.note");
        if (typeof st.dangerous !== "boolean") badSc.push(s.id + ".step.dangerous");
    });
});
ok(badSc.length === 0, "救援卡五字段与步骤字段齐全" + (badSc.length ? "（缺失：" + badSc.slice(0, 5).join(",") + "）" : ""));
var scIds = SCENARIOS.map(function (s) { return s.id; });
eq(new Set(scIds).size, scIds.length, "救援卡 id 唯一无重复");
var dangerCount = 0;
SCENARIOS.forEach(function (s) {
    s.steps.forEach(function (st) { if (st.dangerous) dangerCount++; });
});
ok(dangerCount >= 3, "危险步骤 ≥3（实得 " + dangerCount + "）");
var dangerCmds = [];
SCENARIOS.forEach(function (s) {
    s.steps.forEach(function (st) { if (st.dangerous) dangerCmds.push(st.cmd); });
});
ok(dangerCmds.some(function (c) { return c.indexOf("reset --hard") !== -1; }), "危险步骤含 reset --hard");
ok(dangerCmds.some(function (c) { return c.indexOf("--force-with-lease") !== -1; }), "危险步骤含 push --force-with-lease");
ok(SCENARIOS.every(function (s) { return s.steps.some(function (st) { return st.cmd !== ""; }); }), "每张救援卡至少一步含命令");

/* ---------- 4. searchCommands ---------- */
function namesOf(list) { return list.map(function (c) { return c.id; }); }
ok(namesOf(G.searchCommands(COMMANDS, "rebase")).indexOf("advanced-rebase-i") !== -1, "搜索「rebase」命中 rebase -i");
ok(namesOf(G.searchCommands(COMMANDS, "REBASE")).indexOf("advanced-rebase-i") !== -1, "搜索大小写不敏感（REBASE）");
ok(namesOf(G.searchCommands(COMMANDS, "暂存")).indexOf("stash-push-msg") !== -1, "搜索中文「暂存」命中 stash push -m");
ok(namesOf(G.searchCommands(COMMANDS, "stash@{0}")).indexOf("stash-apply") !== -1, "搜索示例片段「stash@{0}」命中 stash apply");
eq(G.searchCommands(COMMANDS, "").length, COMMANDS.length, "空关键词返回全量");
eq(G.searchCommands(COMMANDS, "   ").length, COMMANDS.length, "纯空格关键词返回全量");
eq(G.searchCommands(COMMANDS, "zzzz不存在的词").length, 0, "无匹配关键词返回空");
ok(G.searchCommands(COMMANDS, "分支").length >= 5, "搜索「分支」命中多条");
throwsField(function () { G.searchCommands(null, "x"); }, "commands", "searchCommands 非数组 commands 抛错 err.field='commands'");
throwsField(function () { G.searchCommands(COMMANDS, 123); }, "keyword", "searchCommands 非字符串 keyword 抛错 err.field='keyword'");
eq(G.normalizeKeyword("  ReBase "), "rebase", "normalizeKeyword 去空格转小写");
eq(G.normalizeKeyword(null), "", "normalizeKeyword(null) 为空串");

/* ---------- 5. getCommand / getRescue ---------- */
eq(G.getCommand(COMMANDS, "log-reflog").name, "git reflog", "getCommand(log-reflog) 命令名");
eq(G.getCommand(COMMANDS, "stash-pop").category, "stash", "getCommand(stash-pop) 类别");
throwsField(function () { G.getCommand(COMMANDS, "no-such-id"); }, "id", "getCommand 未知 id 抛错 err.field='id'");
throwsField(function () { G.getCommand(null, "x"); }, "commands", "getCommand 非数组 commands 抛错");
eq(G.getRescue(SCENARIOS, "deleted-branch").title, "误删分支", "getRescue(deleted-branch) 标题");
eq(G.getRescue(SCENARIOS, "detached-head").steps.length, 4, "getRescue(detached-head) 步骤数");
throwsField(function () { G.getRescue(SCENARIOS, "no-such-id"); }, "id", "getRescue 未知 id 抛错 err.field='id'");
throwsField(function () { G.getRescue(null, "x"); }, "scenarios", "getRescue 非数组 scenarios 抛错");

/* ---------- 6. groupByCategory 保序分组 ---------- */
var groups = G.groupByCategory(COMMANDS);
eq(Object.keys(groups).length, 10, "groupByCategory 分组数 10");
eq(Object.keys(groups).join(","), G.CATEGORY_KEYS.join(","), "groupByCategory 保序：键顺序与十类顺序一致");
eq(groups["config"].length, 7, "groupByCategory 配置组 7 条");
eq(groups["branch"][0].id, "branch-list", "groupByCategory 分支组首条");
eq(groups["advanced"][groups["advanced"].length - 1].id, "advanced-shortlog", "groupByCategory 高级组末条");
throwsField(function () { G.groupByCategory("x"); }, "commands", "groupByCategory 非数组抛错 err.field='commands'");
var sub = G.groupByCategory([COMMANDS[0], COMMANDS[8]]);
eq(Object.keys(sub).join(","), "config,basic", "groupByCategory 子集保序：仅含出现分类");

/* ---------- 7. buildCopyText / buildRescueCopy 拼接精确值 ---------- */
var cmd = G.getCommand(COMMANDS, "config-user-name");
eq(G.buildCopyText(cmd), "# git config user.name\ngit config --global user.name \"张三\"", "buildCopyText 拼接精确值（命令名注释＋示例）");
eq(G.buildCopyText(G.getCommand(COMMANDS, "basic-status")), "# git status\ngit status", "buildCopyText 示例与语法相同时仍拼接");
throwsField(function () { G.buildCopyText(null); }, "cmd", "buildCopyText 非法 cmd 抛错 err.field='cmd'");
throwsField(function () { G.buildCopyText({name: "x"}); }, "cmd", "buildCopyText 缺 syntax 抛错 err.field='cmd'");
var sc = G.getRescue(SCENARIOS, "deleted-branch");
eq(G.buildRescueCopy(sc), "误删分支\n1. git reflog\n2. git branch feature/login a1b2c3d\n3. git log --oneline feature/login -3", "buildRescueCopy 拼接精确值（标题＋分步命令）");
var sc2 = G.getRescue(SCENARIOS, "merge-conflict");
eq(G.buildRescueCopy(sc2), "merge 冲突救场\n1. git status\n2. git add <冲突文件>\n3. git commit\n4. git merge --abort", "buildRescueCopy 跳过无命令的纯文字步骤");
throwsField(function () { G.buildRescueCopy(null); }, "scenario", "buildRescueCopy 非法 scenario 抛错 err.field='scenario'");
throwsField(function () { G.buildRescueCopy({title: "x"}); }, "scenario", "buildRescueCopy 缺 steps 抛错 err.field='scenario'");

/* ---------- 8. validateCommand 缺字段抛错 ---------- */
eq(G.validateCommand(G.getCommand(COMMANDS, "remote-push")).ok, true, "validateCommand 通过返回 {ok:true}");
throwsField(function () { G.validateCommand({name: "git x", syntax: "git x", category: "basic"}); }, "id", "validateCommand 缺 id 抛错 err.field='id'");
throwsField(function () { G.validateCommand({id: "x", syntax: "git x", category: "basic"}); }, "name", "validateCommand 缺 name 抛错 err.field='name'");
throwsField(function () { G.validateCommand({id: "x", name: "git x", category: "basic"}); }, "syntax", "validateCommand 缺 syntax 抛错 err.field='syntax'");
throwsField(function () { G.validateCommand({id: "x", name: "git x", syntax: "git x"}); }, "category", "validateCommand 缺 category 抛错 err.field='category'");
throwsField(function () { G.validateCommand(null); }, "cmd", "validateCommand 非对象抛错 err.field='cmd'");

/* ---------- 9. sanitizeFileName ---------- */
eq(G.sanitizeFileName(""), "git-cheatsheet", "sanitizeFileName 空回退 'git-cheatsheet'");
eq(G.sanitizeFileName(null), "git-cheatsheet", "sanitizeFileName null 回退 'git-cheatsheet'");
eq(G.sanitizeFileName("   "), "git-cheatsheet", "sanitizeFileName 纯空格回退 'git-cheatsheet'");
eq(G.sanitizeFileName("my git notes"), "my-git-notes", "sanitizeFileName 空白转连字符");
eq(G.sanitizeFileName("a/b:c"), "abc", "sanitizeFileName 去非法字符");

/* ---------- 10. 注册与零网络、模板文案 ---------- */
has(GO_SRC, '"git_cheatsheet"', "注册：ID git_cheatsheet");
has(GO_SRC, '"/tools/git-cheatsheet"', "注册：Path /tools/git-cheatsheet");
has(GO_SRC, "Git 命令速查＋灾难救援卡", "注册：中文名");
var sosCount = (GO_SRC.match(/Icon:\s*"sos"/g) || []).length;
eq(sosCount, 1, "Icon sos 全库唯一（精确值 1 处）");
var pathCount = (GO_SRC.match(/"\/tools\/[^"]+"/g) || []).filter(function (v, i, a) { return a.indexOf(v) === i; }).length;
eq(pathCount, 325, "注册：Path 总数 301→302");
notHas(JS_SRC, "fetch(", "零网络：JS 无 fetch");
notHas(JS_SRC, "XMLHttpRequest", "零网络：JS 无 XHR");
notHas(TPL_SRC, "fetch(", "零网络：模板无 fetch");
notHas(TPL_SRC, "http://", "零 CDN：模板无 http 外链");
notHas(TPL_SRC, "https://fonts.googleapis", "零 CDN：模板无字体 CDN");
notHas(TPL_SRC, "https://cdn", "零 CDN：模板无 CDN 外链");
has(TPL_SRC, 'rel="canonical" href="https://www.johnkingzcq123.xyz/tools/git-cheatsheet"', "canonical 正确");
has(TPL_SRC, "application/ld+json", "JSON-LD 结构化数据");
has(TPL_SRC, 'id="gc-search"', "搜索框存在");
has(TPL_SRC, 'id="gc-grid"', "命令网格存在");
has(TPL_SRC, 'id="gc-rescue"', "救援卡容器存在");
has(TPL_SRC, 'data-cat="stash"', "类别 tab 含 stash");
has(TPL_SRC, '{{define "git_cheatsheet"}}', "模板 define 名称正确");
has(TPL_SRC, "git_cheatsheet.js", "模板：JS 文件引用");
has(TPL_SRC, "@media (max-width:640px)", "移动端媒体查询");
has(TPL_SRC, "prefers-reduced-motion", "动画可减弱媒体查询");
has(TPL_SRC, "收录主流常用命令而非 Git 全集", "真限制：非 Git 全集文案");
has(TPL_SRC, "仓库损坏（.git 元数据破坏）等极端情况可能需专业恢复", "真限制：极端仓库损坏文案");
has(TPL_SRC, "全程浏览器本地运行，不上传任何数据", "真限制：本地零上传文案");
has(TPL_SRC, "重写历史的操作（rebase／reset --hard／push -f）执行前务必确认备份，危险步骤已标红", "真限制：重写历史先备份文案");
has(TPL_SRC, "/tools/gitignore-generator", "互链：含 .gitignore 生成器");
has(TPL_SRC, "/tools/conventional-commit-generator", "互链：含 Conventional Commit 生成器");
has(TPL_SRC, "/tools/http-status-reference", "互链：含 HTTP 状态码速查");
has(TPL_SRC, "git 命令大全", "SEO：含 git 命令大全");
has(TPL_SRC, "git 误删分支恢复", "SEO：含 git 误删分支恢复");

console.log("git_cheatsheet: pass=" + pass + " fail=" + fail + "，共 " + (pass + fail) + " 断言");
if (fail > 0) process.exit(1);
