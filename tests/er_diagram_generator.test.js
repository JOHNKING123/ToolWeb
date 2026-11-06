/* 数据库 ER 图生成器纯函数单元测试（零依赖）：node tests/er_diagram_generator.test.js
 * 覆盖：parseDDL（锚点：博客三表→3 表/14 字段/3 关系/0 未解析；字段级与表级主键/外键、
 * CONSTRAINT FOREIGN KEY、ON DELETE/ON UPDATE、反引号/双引号/方括号标识符、模式限定、
 * 注释剥离、复合主键/外键、自引用外键、无外键、无建表语句、未解析行进诊断、重复表名、
 * AS SELECT、SET/USE 跳过）、ddlToMermaid（锚点：小两表 DDL 精确代码；中文转写＋去重；
 * 无建表返回 erDiagram）、validateDDLInput（上限 20000）、extractTableNames
 * （锚点：去引号表名）、countRelationships、buildSummary、非法参数 err.field、
 * 5 组预设示例（每组 0 未解析）、categories.go 注册（Path 总数 319→320、Icon dataset
 * 全库唯一、紧邻 mermaid_diagram_renderer）、模板（SEO 关键词、真限制五条、控件、互链、
 * 本地 vendor mermaid 引用、零外部资源静态检查）、浏览器绑定源码级检查
 * （window.ErDiagramGenerator、SVG/PNG 导出、复制 Mermaid 代码与解析摘要）。
 */
"use strict";
var fs = require("fs");
var path = require("path");
var E = require("../static/js/er_diagram_generator.js");

var pass = 0, fail = 0;
function ok(cond, name) {
    if (cond) { pass++; }
    else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function eqj(a, b, name) { eq(JSON.stringify(a), JSON.stringify(b), name); }
function has(s, sub, name) { ok(s.indexOf(sub) !== -1, name + "（缺 " + sub + "）"); }
function notHas(s, sub, name) { ok(s.indexOf(sub) === -1, name + "（不应含 " + sub + "）"); }
function throws(fn, field, name) {
    try { fn(); ok(false, name + "（应抛错却未抛）"); }
    catch (e) { ok(!field || e.field === field, name + "（err.field 期望 " + field + "，实得 " + e.field + "）"); }
}

var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "er_diagram_generator.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "er_diagram_generator.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");
var VENDOR_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "vendor", "mermaid.min.js"), "utf8");

var SMALL_DDL = "CREATE TABLE users (\n  id INT PRIMARY KEY,\n  name VARCHAR(50) NOT NULL\n);\n" +
    "CREATE TABLE posts (\n  id INT PRIMARY KEY,\n  user_id INT NOT NULL,\n" +
    "  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE\n);";
var SMALL_MERMAID = "erDiagram\n    users {\n        int id PK\n        varchar name\n    }\n" +
    "    posts {\n        int id PK\n        int user_id FK\n    }\n" +
    "    posts }o--|| users : \"user_id -> id\"\n";

/* ---------- 1. parseDDL：小两表锚点 ---------- */
(function () {
    var p = E.parseDDL(SMALL_DDL);
    eq(p.summary.tableCount, 2, "parseDDL 锚点：小两表→2 表");
    eq(p.summary.columnCount, 4, "parseDDL 锚点：小两表→4 字段");
    eq(p.summary.relationshipCount, 1, "parseDDL 锚点：小两表→1 关系");
    eq(p.summary.unparsedCount, 0, "parseDDL 锚点：小两表→0 未解析");
    eq(p.tables[0].name, "users", "parseDDL：首表 users");
    eq(p.tables[0].columns[0].name, "id", "parseDDL：users 首字段 id");
    eq(p.tables[0].columns[0].type, "INT", "parseDDL：id 类型 INT");
    eq(p.tables[0].columns[0].primaryKey, true, "parseDDL：字段级主键 id");
    eq(p.tables[0].columns[0].nullable, true, "parseDDL：INT 主键默认可空（未写 NOT NULL）");
    eq(p.tables[0].columns[1].nullable, false, "parseDDL：NOT NULL 识别");
    eq(p.tables[0].columns[1].type, "VARCHAR(50)", "parseDDL：类型保留参数 VARCHAR(50)");
    eqj(p.tables[0].primaryKey, ["id"], "parseDDL：users 主键列表 [id]");
    eq(p.tables[1].foreignKeys.length, 1, "parseDDL：posts 1 条表级外键");
    eq(p.tables[1].foreignKeys[0].refTable, "users", "parseDDL：外键指向 users");
    eqj(p.tables[1].foreignKeys[0].columns, ["user_id"], "parseDDL：外键列 user_id");
    eqj(p.tables[1].foreignKeys[0].refColumns, ["id"], "parseDDL：引用列 id");
    eq(p.tables[1].foreignKeys[0].onDelete, "CASCADE", "parseDDL：ON DELETE CASCADE");
    eq(p.tables[1].foreignKeys[0].onUpdate, null, "parseDDL：未写 ON UPDATE 为 null 不编造");
    eq(p.tables[1].columns[1].foreignKey, true, "parseDDL：外键字段打 FK 标记");
    eqj(p.relationships, [{ fromTable: "posts", fromColumn: "user_id", toTable: "users", toColumn: "id", onDelete: "CASCADE", onUpdate: null, name: null }], "parseDDL：关系清单精确值");
})();

/* ---------- 2. parseDDL：五组预设示例 ---------- */
(function () {
    var expect = [
        { tableCount: 3, columnCount: 14, relationshipCount: 3 },
        { tableCount: 4, columnCount: 16, relationshipCount: 3 },
        { tableCount: 3, columnCount: 10, relationshipCount: 2 },
        { tableCount: 2, columnCount: 9, relationshipCount: 3 },
        { tableCount: 3, columnCount: 11, relationshipCount: 3 }
    ];
    eq(E.samples.length, 5, "预设：5 组示例 DDL");
    E.samples.forEach(function (s, i) {
        var p = E.parseDDL(s.ddl);
        eq(p.summary.tableCount, expect[i].tableCount, "预设 " + i + "（" + s.name + "）表数");
        eq(p.summary.columnCount, expect[i].columnCount, "预设 " + i + "（" + s.name + "）字段数");
        eq(p.summary.relationshipCount, expect[i].relationshipCount, "预设 " + i + "（" + s.name + "）关系数");
        eq(p.summary.unparsedCount, 0, "预设 " + i + "（" + s.name + "）0 未解析");
    });
    var blog = E.parseDDL(E.samples[0].ddl);
    eq(blog.tables[0].columns[1].unique, true, "预设博客：username UNIQUE");
    eq(blog.tables[0].columns[0].autoIncrement, true, "预设博客：id AUTO_INCREMENT");
    eq(blog.tables[2].foreignKeys[0].name, "fk_comment_post", "预设博客：CONSTRAINT 名 fk_comment_post");
    eq(blog.relationships[0].onUpdate, "CASCADE", "预设博客：ON UPDATE CASCADE");
    var pg = E.parseDDL(E.samples[2].ddl);
    eq(pg.tables[1].name, "courses", "预设 PG：模式限定 public.courses 取表名 courses");
    eq(pg.tables[1].schema, "public", "预设 PG：模式 public 保留");
    eqj(pg.tables[2].primaryKey, ["student_id", "course_id"], "预设 PG：复合主键");
    var shop = E.parseDDL(E.samples[1].ddl);
    eq(shop.relationships.filter(function (r) { return r.fromTable === "order_items"; }).length, 2, "预设电商：order_items 两条外键");
    var org = E.parseDDL(E.samples[3].ddl);
    ok(org.relationships.some(function (r) { return r.fromTable === "employees" && r.toTable === "employees"; }), "预设组织：自引用外键 employees→employees");
    eq(org.relationships.filter(function (r) { return r.onDelete === "SET NULL"; }).length, 1, "预设组织：ON DELETE SET NULL");
    var lite = E.parseDDL(E.samples[4].ddl);
    eq(lite.tables[0].name, "users", "预设 SQLite：方括号表名去括号 users");
    eq(lite.tables[1].columns[1].foreignKey, true, "预设 SQLite：字段级 REFERENCES 打 FK 标记");
})();

/* ---------- 3. parseDDL：标识符 / 注释 / 类型 ---------- */
(function () {
    var q = E.parseDDL("-- 行注释\n/* 块注释 -- 含横线 */\n# 井号注释\nCREATE TABLE `a-b` (`x y` TEXT, id INT, PRIMARY KEY (id));");
    eq(q.summary.unparsedCount, 0, "parseDDL：三种注释剥离后 0 未解析");
    eq(q.tables[0].name, "a-b", "parseDDL：反引号表名去引号 a-b");
    eq(q.tables[0].columns[0].name, "x y", "parseDDL：反引号字段名含空格保留");
    var d = E.parseDDL('CREATE TABLE "dq" ("col" DOUBLE PRECISION, t TIMESTAMP WITH TIME ZONE, v VARCHAR(10));');
    eq(d.tables[0].name, "dq", "parseDDL：双引号表名去引号");
    eq(d.tables[0].columns[0].type, "DOUBLE PRECISION", "parseDDL：多词类型 DOUBLE PRECISION");
    eq(d.tables[0].columns[1].type, "TIMESTAMP WITH TIME ZONE", "parseDDL：TIMESTAMP WITH TIME ZONE");
    var b = E.parseDDL("CREATE TABLE [dbo].[users] ([id] INT PRIMARY KEY);");
    eq(b.tables[0].name, "users", "parseDDL：方括号模式限定取表名");
    var c = E.parseDDL("CREATE TABLE a (id INT PRIMARY KEY, b TEXT DEFAULT 'x;y', c VARCHAR(20) COMMENT '备注');");
    eq(c.tables[0].columns[1].defaultValue, "'x;y'", "parseDDL：默认值含分号不切分");
    eq(c.tables[0].columns[2].comment, "备注", "parseDDL：COMMENT 提取");
    var u = E.parseDDL("CREATE TABLE a (id INT UNSIGNED NOT NULL, p DECIMAL(10, 2));");
    eq(u.tables[0].columns[0].type, "INT UNSIGNED", "parseDDL：INT UNSIGNED 修饰");
    eq(u.tables[0].columns[1].type, "DECIMAL(10, 2)", "parseDDL：DECIMAL(10, 2) 括号内逗号不切分");
    eq(u.summary.unparsedCount, 0, "parseDDL：括号内逗号不切分字段");
})();

/* ---------- 4. parseDDL：复合外键 / 未解析 / 边界 ---------- */
(function () {
    var comp = E.parseDDL("CREATE TABLE a (x INT, y INT, PRIMARY KEY (x, y)); CREATE TABLE b (x INT, y INT, FOREIGN KEY (x, y) REFERENCES a (x, y) ON UPDATE CASCADE);");
    eq(comp.summary.relationshipCount, 2, "parseDDL：复合外键按列展开 2 条关系");
    eq(comp.relationships[0].onUpdate, "CASCADE", "parseDDL：复合外键 ON UPDATE CASCADE");
    eq(comp.relationships[1].fromColumn, "y", "parseDDL：复合外键第二列 y");
    var weird = E.parseDDL("CREATE TABLE t (id INT, weird_col ???, PRIMARY KEY (id));");
    eq(weird.summary.unparsedCount, 1, "parseDDL：无法识别的字段进诊断 1 条");
    eq(weird.unparsed[0].reason, "字段缺少类型", "parseDDL：未解析原因 字段缺少类型");
    eq(weird.unparsed[0].line, 1, "parseDDL：未解析行号 1");
    eq(weird.summary.tableCount, 1, "parseDDL：有未解析行仍解析出表");
    var noTable = E.parseDDL("SELECT * FROM users;");
    eq(noTable.summary.tableCount, 0, "parseDDL：无建表语句返回空表");
    eq(noTable.summary.unparsedCount, 1, "parseDDL：无建表语句进诊断 1 条");
    eq(noTable.unparsed[0].reason, "非 CREATE TABLE 语句，未解析", "parseDDL：无建表语句诊断原因");
    var empty = E.parseDDL("");
    eq(empty.summary.tableCount, 0, "parseDDL：空串 0 表");
    eq(empty.summary.unparsedCount, 0, "parseDDL：空串 0 未解析");
    var dump = E.parseDDL("SET FOREIGN_KEY_CHECKS=0;\nUSE mydb;\nCREATE TABLE a (id INT PRIMARY KEY);\nCREATE INDEX idx ON a (id);\nINSERT INTO a VALUES (1);");
    eq(dump.summary.tableCount, 1, "parseDDL：转储样板中仍解析出表");
    eq(dump.summary.unparsedCount, 2, "parseDDL：SET/USE 跳过，INDEX/INSERT 进诊断共 2 条");
    ok(dump.unparsed.every(function (u) { return u.text.indexOf("SET") !== 0 && u.text.indexOf("USE") !== 0; }), "parseDDL：SET/USE 不进诊断");
    var dup = E.parseDDL("CREATE TABLE a (id INT PRIMARY KEY);\nCREATE TABLE a (id INT);");
    eq(dup.summary.tableCount, 1, "parseDDL：重复表名只保留首个");
    eq(dup.summary.unparsedCount, 1, "parseDDL：重复表名进诊断 1 条");
    has(dup.unparsed[0].reason, "重复表名", "parseDDL：重复表名诊断原因");
    var asSel = E.parseDDL("CREATE TABLE t AS SELECT * FROM x;");
    eq(asSel.summary.tableCount, 0, "parseDDL：AS SELECT 建表 0 表");
    eq(asSel.summary.unparsedCount, 1, "parseDDL：AS SELECT 只报 1 条诊断不重复");
    var unclosed = E.parseDDL("CREATE TABLE t (id INT PRIMARY KEY;");
    eq(unclosed.summary.tableCount, 0, "parseDDL：括号未闭合 0 表");
    eq(unclosed.unparsed[0].reason, "字段列表括号未闭合", "parseDDL：括号未闭合诊断原因");
    var engine = E.parseDDL("CREATE TABLE t (id INT PRIMARY KEY) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
    eq(engine.summary.unparsedCount, 0, "parseDDL：表选项 ENGINE 不进诊断");
    var noFk = E.parseDDL("CREATE TABLE a (id INT PRIMARY KEY); CREATE TABLE b (id INT PRIMARY KEY, a_id INT);");
    eq(noFk.summary.relationshipCount, 0, "parseDDL：无外键声明 0 关系（不按字段名猜测）");
    eq(E.parseDDL("CREATE TABLE IF NOT EXISTS t (id INT PRIMARY KEY);").summary.tableCount, 1, "parseDDL：IF NOT EXISTS 识别");
})();

/* ---------- 5. ddlToMermaid ---------- */
eq(E.ddlToMermaid(SMALL_DDL), SMALL_MERMAID, "ddlToMermaid 锚点：小两表精确代码");
eq(E.ddlToMermaid(E.parseDDL(SMALL_DDL)), SMALL_MERMAID, "ddlToMermaid：接受 parseDDL 结果对象");
eq(E.ddlToMermaid("SELECT 1;"), "erDiagram\n", "ddlToMermaid：无建表语句返回 erDiagram");
eq(E.ddlToMermaid(E.parseDDL("CREATE TABLE 用户 (编号 INT PRIMARY KEY, 姓名 VARCHAR(20));")),
    "erDiagram\n    __ {\n        int __ PK\n        varchar ___2\n    }\n",
    "ddlToMermaid：中文名转写下划线＋重名属性加 _2 后缀");
has(E.ddlToMermaid(E.samples[3].ddl), "employees }o--|| employees", "ddlToMermaid：自引用关系行");
has(E.ddlToMermaid(E.samples[0].ddl), "posts }o--|| users : \"user_id -> id\"", "ddlToMermaid：关系行格式");
throws(function () { E.ddlToMermaid(42); }, "parsed", "抛错：ddlToMermaid(42) field=parsed");
throws(function () { E.ddlToMermaid({}); }, "parsed", "抛错：ddlToMermaid({}) field=parsed");
throws(function () { E.ddlToMermaid(null); }, "parsed", "抛错：ddlToMermaid(null) field=parsed");

/* ---------- 6. validateDDLInput ---------- */
eq(E.validateDDLInput("CREATE TABLE t (id INT);").valid, true, "validateDDLInput：正常 DDL valid");
eq(E.validateDDLInput("x".repeat(20000)).valid, true, "validateDDLInput 锚点：20000 字符 valid");
eq(E.validateDDLInput("x".repeat(20001)).valid, false, "validateDDLInput 锚点：20001 字符 invalid");
eq(E.validateDDLInput("x".repeat(20001)).field, "input", "validateDDLInput：超长 field=input");
has(E.validateDDLInput("x".repeat(20001)).message, "20000", "validateDDLInput：超长提示含 20000");
eq(E.validateDDLInput("").valid, false, "validateDDLInput：空串 invalid");
eq(E.validateDDLInput("   \n  ").valid, false, "validateDDLInput：纯空白 invalid");
eq(E.MAX_INPUT, 20000, "validateDDLInput：MAX_INPUT=20000");

/* ---------- 7. extractTableNames / countRelationships ---------- */
eqj(E.extractTableNames(SMALL_DDL), ["users", "posts"], "extractTableNames 锚点：小两表");
eqj(E.extractTableNames(E.samples[2].ddl), ["students", "courses", "enrollments"], "extractTableNames：PG 三表");
eqj(E.extractTableNames("CREATE TABLE `a-b` (id INT); CREATE TABLE [c] (id INT);"), ["a-b", "c"], "extractTableNames：去引号表名");
eqj(E.extractTableNames("SELECT 1;"), [], "extractTableNames：无建表返回空数组");
eq(E.countRelationships(E.parseDDL(SMALL_DDL)), 1, "countRelationships 锚点：小两表→1");
eq(E.countRelationships(E.parseDDL(E.samples[0].ddl)), 3, "countRelationships：博客三表→3");
eq(E.countRelationships(E.parseDDL("CREATE TABLE a (id INT PRIMARY KEY);")), 0, "countRelationships：无外键→0");
throws(function () { E.countRelationships({}); }, "parsed", "抛错：countRelationships({}) field=parsed");
throws(function () { E.countRelationships(null); }, "parsed", "抛错：countRelationships(null) field=parsed");

/* ---------- 8. buildSummary ---------- */
(function () {
    var s = E.buildSummary(E.parseDDL(SMALL_DDL));
    has(s, "表：2 个，字段：4 个，关系：1 条，未解析：0 行", "buildSummary：首行统计");
    has(s, "- users（2 字段，主键：id）", "buildSummary：表行含主键");
    has(s, "- posts.user_id -> users.id（ON DELETE CASCADE）", "buildSummary：关系行含 ON DELETE");
    var s2 = E.buildSummary(E.parseDDL("SELECT 1;"));
    has(s2, "未解析：1 行", "buildSummary：未解析统计");
    has(s2, "! 未解析", "buildSummary：未解析行以 ! 开头");
})();

/* ---------- 9. 非法参数抛错 err.field ---------- */
throws(function () { E.parseDDL(123); }, "input", "抛错：parseDDL(123) field=input");
throws(function () { E.parseDDL(null); }, "input", "抛错：parseDDL(null) field=input");
throws(function () { E.parseDDL(undefined); }, "input", "抛错：parseDDL(undefined) field=input");
throws(function () { E.parseDDL("x".repeat(20001)); }, "input", "抛错：parseDDL 超长 field=input");
throws(function () { E.extractTableNames(null); }, "input", "抛错：extractTableNames(null) field=input");
throws(function () { E.extractTableNames(42); }, "input", "抛错：extractTableNames(42) field=input");
throws(function () { E.validateDDLInput(null); }, "input", "抛错：validateDDLInput(null) field=input");
throws(function () { E.validateDDLInput({}); }, "input", "抛错：validateDDLInput({}) field=input");
throws(function () { E.buildSummary(null); }, "parsed", "抛错：buildSummary(null) field=parsed");

/* ---------- 10. categories.go 注册 ---------- */
var pathCount = (GO_SRC.match(/"\/tools\/[^"]+"/g) || []).filter(function (v, i, a) { return a.indexOf(v) === i; }).length;
eq(pathCount, 320, "注册 Path 总数 319→320");
has(GO_SRC, "\"er_diagram_generator\"", "注册：ID er_diagram_generator");
has(GO_SRC, "\"/tools/er-diagram-generator\"", "注册：Path /tools/er-diagram-generator");
has(GO_SRC, "\"dataset\"", "注册：Icon dataset");
eq((GO_SRC.match(/Icon:\s*"dataset"/g) || []).length, 1, "Icon dataset 全库唯一");
var entryBlock = GO_SRC.slice(GO_SRC.indexOf("\"er_diagram_generator\"") - 60,
    GO_SRC.indexOf("\"er_diagram_generator\"") + 1600);
ok(/New:\s+true/.test(entryBlock), "注册：New: true");
ok(/Category:\s+"开发工具"/.test(entryBlock), "注册：类目 开发工具");
has(entryBlock, "数据库 ER 图生成器", "注册：名称 数据库 ER 图生成器");
ok(GO_SRC.indexOf("\"er_diagram_generator\"") > GO_SRC.indexOf("\"mermaid_diagram_renderer\"") &&
    GO_SRC.indexOf("\"er_diagram_generator\"") < GO_SRC.indexOf("\"regex\""), "注册：紧邻 mermaid_diagram_renderer（在其后、regex 之前）");

/* ---------- 11. 模板：SEO/真限制/控件/互链/本地 vendor/零外部资源 ---------- */
has(TPL_SRC, "{{define \"er_diagram_generator\"}}", "模板：define er_diagram_generator");
has(TPL_SRC, "https://www.johnkingzcq123.xyz/tools/er-diagram-generator", "模板 canonical 含新 Path");
has(TPL_SRC, "数据库 ER 图生成器", "模板：标题含工具名");
has(TPL_SRC, "erDiagram", "模板：SEO 关键词 erDiagram");
has(TPL_SRC, "SQL转ER图", "模板：SEO 关键词 SQL转ER图");
has(TPL_SRC, "五条真限制", "模板：五条真限制标题");
has(TPL_SRC, "只解析 CREATE TABLE", "模板：真限制 1 只解析 CREATE TABLE");
has(TPL_SRC, "复杂 DDL 可能解析失败", "模板：真限制 2 复杂 DDL");
has(TPL_SRC, "关系只按外键推断", "模板：真限制 3 关系只按外键推断");
has(TPL_SRC, "Mermaid 标识符限制", "模板：真限制 4 标识符限制");
has(TPL_SRC, "输入上限 20000 字符", "模板：真限制 5 输入上限");
has(TPL_SRC, "id=\"ed-input\"", "模板：输入框 ed-input");
has(TPL_SRC, "id=\"ed-parse-btn\"", "模板：生成按钮");
has(TPL_SRC, "id=\"ed-presets\"", "模板：预设示例容器");
has(TPL_SRC, "id=\"ed-preview\"", "模板：关系图预览区");
has(TPL_SRC, "id=\"ed-tables\"", "模板：表清单容器");
has(TPL_SRC, "id=\"ed-relations\"", "模板：关系清单容器");
has(TPL_SRC, "id=\"ed-mermaid-code\"", "模板：Mermaid 代码容器");
has(TPL_SRC, "id=\"ed-diag\"", "模板：未解析诊断容器");
has(TPL_SRC, "id=\"ed-svgdl\"", "模板：SVG 下载按钮");
has(TPL_SRC, "id=\"ed-png\"", "模板：PNG 导出按钮");
has(TPL_SRC, "id=\"ed-copy-mermaid\"", "模板：复制 Mermaid 代码按钮");
has(TPL_SRC, "id=\"ed-copy-summary\"", "模板：复制解析摘要按钮");
has(TPL_SRC, "/tools/static/js/er_diagram_generator.js", "模板：引用本地 JS");
has(TPL_SRC, "/tools/static/js/vendor/mermaid.min.js", "模板：引用本地 vendor mermaid");
has(TPL_SRC, "/tools/mermaid-diagram-renderer", "模板：互链 mermaid_diagram_renderer");
has(TPL_SRC, "/tools/sql-formatter", "模板：互链 sql_formatter");
has(TPL_SRC, "只解析 DDL 生成关系图", "模板：互链分工说明含只解析 DDL 生成关系图");
has(TPL_SRC, "不做通用 Mermaid 渲染", "模板：互链分工说明含不做通用 Mermaid 渲染");
has(TPL_SRC, "不做 SQL 格式化", "模板：互链分工说明含不做 SQL 格式化");
notHas(TPL_SRC, "fonts.googleapis", "模板零 CDN：无外部字体");
notHas(TPL_SRC, "cdnjs", "模板零 CDN：无 cdnjs");
notHas(TPL_SRC, "unpkg", "模板零 CDN：无 unpkg");
notHas(TPL_SRC, "jsdelivr", "模板零 CDN：无 jsdelivr");
ok((TPL_SRC.match(/<script[^>]*src="http/g) || []).length === 0, "模板零外部脚本：无 http script src");
var httpLinks = TPL_SRC.match(/<link[^>]*href="http[^"]*"/g) || [];
eq(httpLinks.length, 1, "模板 http link 仅 canonical 一条");
ok(httpLinks.length === 1 && httpLinks[0].indexOf("https://www.johnkingzcq123.xyz/tools/er-diagram-generator") !== -1, "模板 http link：仅自家 canonical");

/* ---------- 12. vendor mermaid 10.9.3 ---------- */
has(VENDOR_SRC, "10.9.3", "vendor：mermaid 10.9.3 版本标识");
ok(VENDOR_SRC.length > 1000000, "vendor：mermaid.min.js 体积大于 1MB（实得 " + VENDOR_SRC.length + "）");
notHas(VENDOR_SRC, "cdnjs", "vendor：不含 CDN 引用");

/* ---------- 13. 浏览器绑定源码级检查 ---------- */
has(JS_SRC, "window.ErDiagramGenerator", "导出：挂 window.ErDiagramGenerator");
has(JS_SRC, "parseDDL", "绑定：DDL 解析函数");
has(JS_SRC, "ddlToMermaid", "绑定：Mermaid 生成函数");
has(JS_SRC, "validateDDLInput", "绑定：输入校验函数");
has(JS_SRC, "extractTableNames", "绑定：表名提取函数");
has(JS_SRC, "countRelationships", "绑定：关系计数函数");
has(JS_SRC, "SAMPLES", "绑定：预设示例数组");
ok((JS_SRC.match(/name: '[^']+'/g) || []).length >= 5, "绑定：至少 5 组预设示例");
has(JS_SRC, "renderAll", "绑定：解析渲染入口");
has(JS_SRC, "ed-preview", "绑定：关系图预览容器 id");
has(JS_SRC, "ed-mermaid-code", "绑定：Mermaid 代码容器 id");
has(JS_SRC, "ed-diag", "绑定：未解析诊断容器 id");
has(JS_SRC, "navigator.clipboard", "绑定：复制用 clipboard");
has(JS_SRC, "mermaid.render", "绑定：本地 mermaid 渲染调用");
has(JS_SRC, "toBlob", "绑定：PNG 导出用 canvas toBlob");
notHas(JS_SRC, "cdnjs", "绑定：无 CDN 引用");
notHas(JS_SRC, "fetch(", "绑定：不发起后端请求");
notHas(JS_SRC, "XMLHttpRequest", "绑定：不使用 XHR");

console.log("er_diagram_generator: pass=" + pass + " fail=" + fail + "，共 " + (pass + fail) + " 断言");
if (fail > 0) process.exit(1);
