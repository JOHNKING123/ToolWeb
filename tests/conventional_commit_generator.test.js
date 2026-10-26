/* Conventional Commit 提交信息生成器纯逻辑单元测试（零依赖）：node tests/conventional_commit_generator.test.js
* 覆盖：11 个 type、scope 有／无、breaking 四组合、正文空行结构、3 组示例、
* 描述空／超长、scope 校验正反例、换行展平、注册（185→186 Path）与零网络请求、
* 模板真限制文案与互链（仅 .gitignore，无未交付硬凑互链）。 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/conventional_commit_generator.js");

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function has(s, sub, name) { ok(String(s).indexOf(sub) !== -1, name + "（应包含 " + JSON.stringify(sub) + "）"); }
function notHas(s, sub, name) { ok(String(s).indexOf(sub) === -1, name + "（不应包含 " + JSON.stringify(sub) + "）"); }

var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "conventional_commit_generator.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "conventional_commit_generator.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

/* ---------- 1. 11 个 type 逐项切换 ---------- */
eq(M.TYPES.length, 11, "type 总数为 11");
var typeIds = M.TYPES.map(function (t) { return t.id; });
["feat", "fix", "docs", "style", "refactor", "perf", "test", "build", "ci", "chore", "revert"].forEach(function (t) {
  ok(typeIds.indexOf(t) !== -1, "type 包含 " + t);
  eq(M.buildCommit({ type: t, scope: "", description: "做一件事" }).message, t + ": 做一件事", "type 切换标题同步：" + t);
});
eq(M.buildCommit({ type: "bogus", scope: "", description: "做一件事" }).message, "feat: 做一件事", "非法 type 回落默认 feat");
eq(M.buildCommit({ type: "feat", scope: "", description: "  做一件事  " }).message, "feat: 做一件事", "描述去首尾空格");

/* ---------- 2. scope 有／无 ---------- */
eq(M.buildCommit({ type: "feat", scope: "api", description: "新增接口" }).message, "feat(api): 新增接口", "有 scope 括号出现");
eq(M.buildCommit({ type: "feat", scope: "", description: "新增接口" }).message, "feat: 新增接口", "无 scope 无括号");
eq(M.buildCommit({ type: "feat", scope: "  api  ", description: "新增接口" }).message, "feat(api): 新增接口", "scope 去首尾空格");
eq(M.buildCommit({ type: "feat", scope: "api-v2_x", description: "新增接口" }).message, "feat(api-v2_x): 新增接口", "scope 连字符下划线数字合法");
eq(M.buildCommit({ type: "fix", scope: "a1", description: "修 bug" }).message, "fix(a1): 修 bug", "scope 数字合法");

/* ---------- 3. scope 校验正反例 ---------- */
ok(M.validateScope("").valid, "scope 校验：空合法");
ok(M.validateScope("api").valid, "scope 校验：小写合法");
ok(!M.validateScope("API").valid, "scope 校验：大写非法");
ok(!M.validateScope("my scope").valid, "scope 校验：含空格非法");
ok(!M.validateScope("中文").valid, "scope 校验：中文非法");
ok(!M.validateScope("a.b").valid, "scope 校验：点号非法");
has(M.validateScope("API").error, "scope", "scope 校验：错误提示指明 scope");
var badScope = M.buildCommit({ type: "feat", scope: "API", description: "新增接口" });
eq(badScope.message, "", "scope 非法：不输出误导结果");
ok(badScope.error !== "", "scope 非法：中文提示非空");
var badScopeSpace = M.buildCommit({ type: "feat", scope: "my scope", description: "新增接口" });
eq(badScopeSpace.message, "", "scope 含空格：不输出误导结果");

/* ---------- 4. 描述校验：空与超长 ---------- */
var emptyDesc = M.buildCommit({ type: "feat", scope: "", description: "" });
eq(emptyDesc.message, "", "描述为空：不输出误导结果");
ok(emptyDesc.error !== "", "描述为空：中文提示非空");
has(emptyDesc.error, "描述", "描述为空：提示指明描述");
var blankDesc = M.buildCommit({ type: "feat", scope: "", description: "   " });
eq(blankDesc.message, "", "描述全空白：视为空不输出");
var longDesc = new Array(74).join("长");
eq(longDesc.length, 73, "超长用例：73 字符");
var longResult = M.buildCommit({ type: "feat", scope: "", description: longDesc });
eq(longResult.message, "feat: " + longDesc, "描述超 72：仍生成不阻塞");
ok(longResult.warnings.length > 0, "描述超 72：有软提示");
has(longResult.warnings.join(""), "72", "描述超 72：软提示提到 72");
var exact72 = new Array(73).join("长");
eq(exact72.length, 72, "边界用例：72 字符");
eq(M.buildCommit({ type: "feat", scope: "", description: exact72 }).warnings.length, 0, "描述恰 72：无软提示");

/* ---------- 5. breaking 四组合 ---------- */
eq(M.buildCommit({ type: "feat", scope: "api", description: "重构鉴权接口", breaking: false, breakingDesc: "" }).message,
  "feat(api): 重构鉴权接口", "breaking 组合：无 breaking 无 footer");
eq(M.buildCommit({ type: "feat", scope: "api", description: "重构鉴权接口", breaking: true, breakingDesc: "" }).message,
  "feat(api)!: 重构鉴权接口", "breaking 组合：开启无说明只加 ! 不生成空 footer");
var noDescWarn = M.buildCommit({ type: "feat", scope: "api", description: "重构鉴权接口", breaking: true, breakingDesc: "" });
ok(noDescWarn.warnings.length > 0, "breaking 组合：开启无说明有建议填写提示");
has(noDescWarn.warnings.join(""), "破坏性说明", "breaking 组合：提示提到破坏性说明");
eq(M.buildCommit({ type: "feat", scope: "api", description: "重构鉴权接口", breaking: true, breakingDesc: "旧接口停用" }).message,
  "feat(api)!: 重构鉴权接口\n\nBREAKING CHANGE: 旧接口停用", "breaking 组合：开启有说明标题 ! 加 footer");
eq(M.buildCommit({ type: "feat", scope: "", description: "重构鉴权接口", breaking: true, breakingDesc: "旧接口停用" }).message,
  "feat!: 重构鉴权接口\n\nBREAKING CHANGE: 旧接口停用", "breaking 组合：无 scope 时 ! 紧跟 type");
var noBreakingWithDesc = M.buildCommit({ type: "feat", scope: "api", description: "重构鉴权接口", breaking: false, breakingDesc: "旧接口停用" });
notHas(noBreakingWithDesc.message, "BREAKING CHANGE", "breaking 组合：未开启时说明不生成 footer");

/* ---------- 6. 正文空行结构 ---------- */
eq(M.buildCommit({ type: "docs", scope: "", description: "补充说明", body: "补充细节。" }).message,
  "docs: 补充说明\n\n补充细节。", "正文：标题与正文空一行");
eq(M.buildCommit({ type: "docs", scope: "", description: "补充说明", body: "" }).message,
  "docs: 补充说明", "正文：无正文无多余空行");
eq(M.buildCommit({ type: "feat", scope: "api", description: "重构鉴权接口", body: "细节说明。", breaking: true, breakingDesc: "旧接口停用" }).message,
  "feat(api)!: 重构鉴权接口\n\n细节说明。\n\nBREAKING CHANGE: 旧接口停用", "结构：标题＋空行正文＋空行 footer");
eq(M.buildCommit({ type: "docs", scope: "", description: "补充说明", body: "   " }).message,
  "docs: 补充说明", "正文：全空白视作无正文");

/* ---------- 7. 换行展平 ---------- */
eq(M.flattenText("第1行\n第2行"), "第1行 第2行", "展平：LF 转空格");
eq(M.flattenText("第1行\r\n第2行"), "第1行 第2行", "展平：CRLF 转空格");
eq(M.flattenText("第1行\r第2行"), "第1行 第2行", "展平：孤 CR 转空格");
eq(M.buildCommit({ type: "docs", scope: "", description: "补充说明", body: "第1行\n第2行" }).message,
  "docs: 补充说明\n\n第1行 第2行", "展平：正文换行转空格");
eq(M.buildCommit({ type: "feat", scope: "", description: "改接口", breaking: true, breakingDesc: "旧接口\n新接口" }).message,
  "feat!: 改接口\n\nBREAKING CHANGE: 旧接口 新接口", "展平：breaking 说明换行转空格");

/* ---------- 8. 3 组示例 ---------- */
eq(M.buildCommit(M.SAMPLE_FEAT).message,
  "feat(api)!: 重构鉴权接口\n\n将 token 校验抽离为独立中间件，统一错误码。\n\nBREAKING CHANGE: 旧鉴权接口不再接受明文 token，请改用 Bearer 方案",
  "示例：feat 含 scope＋breaking 完整结构");
eq(M.buildCommit(M.SAMPLE_FIX).message, "fix: 修复登录页在弱网下重复提交的问题", "示例：fix 无 scope");
eq(M.buildCommit(M.SAMPLE_DOCS).message, "docs: 补充提交信息规范说明\n\n说明 type 与 scope 的取值范围与 breaking 写法。", "示例：docs 无 scope 含正文");
eq(M.buildCommit(M.DEFAULTS).message, "", "恢复默认：空描述不输出");
eq(M.DEFAULTS.type, "feat", "恢复默认：type 为 feat");
eq(M.DEFAULTS.breaking, false, "恢复默认：breaking 关闭");

/* ---------- 9. 注册与零网络、模板文案 ---------- */
has(GO_SRC, '"conventional_commit_generator"', "注册：ID conventional_commit_generator");
has(GO_SRC, '"/tools/conventional-commit-generator"', "注册：Path /tools/conventional-commit-generator");
has(GO_SRC, "Conventional Commit 提交信息生成器", "注册：中文名");
var pathCount = (GO_SRC.match(/"\/tools\/[^"]+"/g) || []).filter(function (v, i, a) { return a.indexOf(v) === i; }).length;
eq(pathCount, 186, "注册：Path 总数现为 186（185＋本轮新增 1）");
notHas(JS_SRC, "fetch(", "零网络：JS 无 fetch");
notHas(JS_SRC, "XMLHttpRequest", "零网络：JS 无 XHR");
notHas(TPL_SRC, "fetch(", "零网络：模板无 fetch");
notHas(TPL_SRC, "http://", "零 CDN：模板无 http 外链");
notHas(TPL_SRC, "https://fonts.googleapis", "零 CDN：模板无字体 CDN");
has(TPL_SRC, "只生成单条提交信息", "真限制：只生成单条提交信息文案");
has(TPL_SRC, "不做 git 操作", "真限制：不做 git 操作文案");
has(TPL_SRC, "不校验团队约定", "真限制：不校验团队约定文案");
has(TPL_SRC, "不做翻译与润色", "真限制：不做翻译与润色文案");
has(TPL_SRC, "/tools/gitignore-generator", "互链：含 .gitignore 生成器");
notHas(TPL_SRC, ".npmrc", "互链：不含未交付 .npmrc");
notHas(TPL_SRC, ".gitattributes", "互链：不含未交付 .gitattributes");
has(TPL_SRC, "conventional_commit_generator.js", "模板：JS 文件引用");
has(TPL_SRC, "conventional-commit-generator", "模板：canonical 与标识含 conventional-commit-generator");
has(JS_SRC, "textContent", "渲染：用 textContent 防 HTML 执行");
has(TPL_SRC, "commit-message.txt", "操作：下载文件名为 commit-message.txt");

console.log("conventional_commit_generator: pass=" + pass + " fail=" + fail);
if (fail > 0) process.exit(1);
