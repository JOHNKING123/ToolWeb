/* Shell 命令解释器纯函数单元测试（零依赖）：node tests/shell_explainer.test.js
 * 覆盖：tokenizeShell（锚点 ("ls -la /tmp")→3 token；引号/转义/续行/管道/重定向/未闭合引号）、
 * splitFlags（锚点 ("-rf")→["-r","-f"]）、explainFlag（锚点 ("ls","-l")→"以长格式列出详细信息"、
 * ("grep","-r")→"递归搜索子目录"）、parseCommand（分段/子命令/带值旗标/重定向/sudo）、
 * explainCommand（逐段释义＋plainText＋未收录）、detectDanger（锚点 ("rm -rf /") 含警示；
 * chmod 777、curl|sh、dd of=/dev/）、validateShellInput（上限 4000）、非法参数 err.field、
 * 25 命令词典（每命令 6–15 个旗标）、categories.go 注册（Path 总数 318→319、Icon
 * integration_instructions 全库唯一、紧邻 git_cheatsheet）、模板（SEO 关键词、真限制五条、
 * 控件、互链、零外部资源静态检查）、浏览器绑定源码级检查（window.ShellExplainer、
 * 分段高亮/复制释义/预设示例）。
 */
"use strict";
var fs = require("fs");
var path = require("path");
var S = require("../static/js/shell_explainer.js");

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
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "shell_explainer.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "shell_explainer.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

function texts(t) { return t.tokens.map(function (x) { return x.text; }); }
function ops(t) { return t.tokens.filter(function (x) { return x.kind === "op"; }).map(function (x) { return x.text; }); }

/* ---------- 1. tokenizeShell ---------- */
(function () {
    var t = S.tokenizeShell("ls -la /tmp");
    eq(t.tokens.length, 3, "tokenizeShell 锚点：ls -la /tmp→3 token");
    eqj(texts(t), ["ls", "-la", "/tmp"], "tokenizeShell：ls -la /tmp 文本");
    eq(t.errors.length, 0, "tokenizeShell：简单命令无错误");
    var q = S.tokenizeShell("echo \"a b\" 'c d'");
    eqj(texts(q), ["echo", "a b", "c d"], "tokenizeShell：双引号与单引号内空格不切分");
    var e = S.tokenizeShell("echo a\\ b");
    eqj(texts(e), ["echo", "a b"], "tokenizeShell：反斜杠转义空格");
    var c = S.tokenizeShell("echo a \\\n b");
    eqj(texts(c), ["echo", "a", "b"], "tokenizeShell：反斜杠换行续行");
    var p = S.tokenizeShell("a | b && c; d");
    eqj(ops(p), ["|", "&&", ";"], "tokenizeShell：管道/与/分号操作符");
    var r = S.tokenizeShell("echo hi > out.txt 2>> err.log");
    eqj(ops(r), [">", "2>>"], "tokenizeShell：重定向操作符 > 与 2>>");
    var u = S.tokenizeShell("echo \"abc");
    eq(u.errors.length, 1, "tokenizeShell：双引号未闭合记 1 条错误");
    has(u.errors[0].message, "双引号", "tokenizeShell：未闭合错误信息");
    var u2 = S.tokenizeShell("echo 'abc");
    eq(u2.errors.length, 1, "tokenizeShell：单引号未闭合记 1 条错误");
    var empty = S.tokenizeShell("");
    eq(empty.tokens.length, 0, "tokenizeShell：空串 0 token");
    eq(S.tokenizeShell("ls\t-la").tokens.length, 2, "tokenizeShell：Tab 也是分隔符");
})();

/* ---------- 2. splitFlags ---------- */
eqj(S.splitFlags("-rf"), ["-r", "-f"], "splitFlags 锚点：-rf→['-r','-f']");
eqj(S.splitFlags("-la"), ["-l", "-a"], "splitFlags：-la→['-l','-a']");
eqj(S.splitFlags("-l"), ["-l"], "splitFlags：单旗标原样");
eqj(S.splitFlags("--recursive"), ["--recursive"], "splitFlags：长旗标原样");
eqj(S.splitFlags("--"), [], "splitFlags：--→空数组");
eqj(S.splitFlags("--color=always"), ["--color"], "splitFlags：--color=always 去掉 = 值");
eqj(S.splitFlags("-9"), ["-9"], "splitFlags：数字信号 -9 不拆分");
eqj(S.splitFlags("plain"), ["plain"], "splitFlags：非旗标原样返回");

/* ---------- 3. explainFlag ---------- */
eq(S.explainFlag("ls", "-l"), "以长格式列出详细信息", "explainFlag 锚点：ls -l");
eq(S.explainFlag("grep", "-r"), "递归搜索子目录", "explainFlag 锚点：grep -r");
has(S.explainFlag("rm", "--no-preserve-root"), "极度危险", "explainFlag：rm --no-preserve-root 含极度危险");
has(S.explainFlag("docker", "-d"), "后台", "explainFlag：docker -d 含后台");
has(S.explainFlag("tar", "-z"), "gzip", "explainFlag：tar -z 含 gzip");
has(S.explainFlag("curl", "-L"), "重定向", "explainFlag：curl -L 含重定向");
has(S.explainFlag("find", "-name"), "文件名", "explainFlag：find -name 含文件名");
has(S.explainFlag("git", "--oneline"), "一行摘要", "explainFlag：git --oneline 含一行摘要");
has(S.explainFlag("systemctl", "restart"), "重启", "explainFlag：systemctl 子命令 restart 可查");
eq(S.explainFlag("ls", "--bogus"), null, "explainFlag：未知旗标返回 null 不编造");
eq(S.explainFlag("nosuchcmd", "-l"), null, "explainFlag：未知命令返回 null 不编造");
has(S.explainFlag("rm", "-rf"), "-r", "explainFlag：组合 -rf 逐个释义含 -r");
has(S.explainFlag("rm", "-rf"), "-f", "explainFlag：组合 -rf 逐个释义含 -f");
eq(S.explainFlag("rm", "-rz"), null, "explainFlag：组合含未知旗标返回 null");

/* ---------- 4. parseCommand ---------- */
(function () {
    var p = S.parseCommand("ls -la /tmp");
    eq(p.segments.length, 1, "parseCommand：ls 单段");
    eq(p.segments[0].command, "ls", "parseCommand：命令本体 ls");
    eq(p.segments[0].knownCommand, true, "parseCommand：ls 为已知命令");
    eq(p.segments[0].flags.length, 2, "parseCommand：-la 拆为 2 个旗标");
    eq(p.segments[0].flags[0].flag, "-l", "parseCommand：首旗标 -l");
    eq(p.segments[0].positionals.length, 1, "parseCommand：1 个位置参数");
    eq(p.segments[0].positionals[0].text, "/tmp", "parseCommand：位置参数 /tmp");
    eq(p.unknown.length, 0, "parseCommand：ls -la /tmp 无未收录");

    var pipe = S.parseCommand("grep -rn \"ERROR\" /var/log | head -n 50");
    eq(pipe.segments.length, 2, "parseCommand：管道分 2 段");
    eq(pipe.segments[1].operatorBefore.op, "|", "parseCommand：第二段连接符 |");
    has(pipe.segments[1].operatorBefore.desc, "管道", "parseCommand：| 释义含管道");
    eq(pipe.segments[0].flags[1].flag, "-n", "parseCommand：-rn 拆出 -n");
    ok(pipe.unknown.some(function (u) { return u.type === "command" && u.command === "head"; }), "parseCommand：未知命令 head 进 unknown");
    ok(pipe.unknown.some(function (u) { return u.type === "flag" && u.flag === "-n"; }), "parseCommand：head 的 -n 进 unknown");

    var chain = S.parseCommand("chmod -R 755 /var/www && systemctl restart nginx");
    eq(chain.segments.length, 2, "parseCommand：&& 分 2 段");
    eq(chain.segments[1].operatorBefore.op, "&&", "parseCommand：第二段连接符 &&");
    eq(chain.segments[1].subcommand, "restart", "parseCommand：systemctl 子命令 restart");
    eq(chain.segments[1].positionals[0].text, "nginx", "parseCommand：systemctl 位置参数 nginx");

    var tar = S.parseCommand("tar -czvf backup.tar.gz /var/www/html");
    var f = tar.segments[0].flags.filter(function (x) { return x.flag === "-f"; })[0];
    eq(f.value, "backup.tar.gz", "parseCommand：tar -f 吞掉归档文件名");
    eq(tar.segments[0].flags.length, 4, "parseCommand：-czvf 拆为 4 个旗标");

    var redir = S.parseCommand("echo hi > out.txt");
    eq(redir.segments[0].redirects.length, 1, "parseCommand：1 条重定向");
    eq(redir.segments[0].redirects[0].op, ">", "parseCommand：重定向符 >");
    eq(redir.segments[0].redirects[0].target, "out.txt", "parseCommand：重定向目标 out.txt");

    var sudo = S.parseCommand("sudo rm -rf /tmp/x");
    eq(sudo.segments[0].sudo, true, "parseCommand：sudo 标记");
    eq(sudo.segments[0].command, "rm", "parseCommand：sudo 后命令本体 rm");

    var git = S.parseCommand("git log --oneline --graph");
    eq(git.segments[0].subcommand, "log", "parseCommand：git 子命令 log");
    eq(git.segments[0].flags[0].flag, "--oneline", "parseCommand：git --oneline 已收录");
    eq(git.segments[0].flags[0].known, true, "parseCommand：--oneline known=true");

    var ssh = S.parseCommand("ssh -p2222 user@host");
    eq(ssh.segments[0].flags[0].flag, "-p", "parseCommand：-p2222 附着值拆出 -p");
    eq(ssh.segments[0].flags[0].value, "2222", "parseCommand：-p2222 附着值 2222");

    var find = S.parseCommand("find /tmp -type f -exec rm {} ;");
    eq(find.unknown.length, 0, "parseCommand：find -type/-exec 整旗标无未收录");
    eq(find.segments[0].flags.filter(function (x) { return x.flag === "-exec"; })[0].value, "rm {} ;", "parseCommand：-exec 值吞到分号");
})();

/* ---------- 5. explainCommand ---------- */
(function () {
    var r = S.explainCommand("grep -rn \"ERROR\" /var/log | head -n 50");
    eq(r.segments.length, 2, "explainCommand：管道 2 段");
    has(r.plainText, "递归搜索子目录", "explainCommand：plainText 含 -r 释义");
    has(r.plainText, "显示匹配行的行号", "explainCommand：plainText 含 -n 释义");
    has(r.plainText, "未收录", "explainCommand：plainText 含未收录段");
    eq(r.unknown.length, 2, "explainCommand：head 命令＋旗标共 2 条未收录");
    var safe = S.explainCommand("ls -la /tmp");
    eq(safe.dangers.length, 0, "explainCommand：安全命令无危险");
    eq(safe.unknown.length, 0, "explainCommand：全收录命令无未收录");
    has(safe.plainText, "以长格式列出详细信息", "explainCommand：plainText 含 ls -l 释义");
    var danger = S.explainCommand("rm -rf /");
    ok(danger.dangers.length >= 1, "explainCommand：rm -rf / 含危险");
    has(danger.plainText, "危险警示", "explainCommand：plainText 含危险警示段");
    var err = S.explainCommand("echo \"abc");
    eq(err.errors.length, 1, "explainCommand：未闭合引号进 errors");
})();

/* ---------- 6. detectDanger ---------- */
(function () {
    var d = S.detectDanger("rm -rf /");
    ok(d.length >= 1, "detectDanger 锚点：rm -rf / 含警示");
    ok(d.some(function (x) { return x.message.indexOf("rm -rf") !== -1; }), "detectDanger：rm -rf / 警示含 rm -rf");
    eq(d[0].level, "critical", "detectDanger：rm -rf / 为 critical");
    var rf = S.detectDanger("rm -rf ./build");
    ok(rf.some(function (x) { return x.rule === "rm-rf"; }), "detectDanger：rm -rf 任意目标触发 rm-rf 警示");
    var c777 = S.detectDanger("chmod 777 file.txt");
    ok(c777.some(function (x) { return x.rule === "chmod-777"; }), "detectDanger：chmod 777 触发警示");
    var pipe = S.detectDanger("curl -sSL https://example.com/install.sh | sh");
    ok(pipe.some(function (x) { return x.rule === "pipe-to-shell" && x.level === "critical"; }), "detectDanger：curl|sh 触发 pipe-to-shell");
    var wgetPipe = S.detectDanger("wget -qO- https://example.com/x.sh | bash");
    ok(wgetPipe.some(function (x) { return x.rule === "pipe-to-shell"; }), "detectDanger：wget|bash 同样触发");
    var dd = S.detectDanger("dd if=/dev/zero of=/dev/sda bs=1M");
    ok(dd.some(function (x) { return x.rule === "dd-of-device"; }), "detectDanger：dd of=/dev/sda 触发警示");
    var npr = S.detectDanger("rm --no-preserve-root -rf /");
    ok(npr.some(function (x) { return x.rule === "no-preserve-root"; }), "detectDanger：--no-preserve-root 触发警示");
    var mkfs = S.detectDanger("mkfs.ext4 /dev/sdb1");
    ok(mkfs.some(function (x) { return x.rule === "mkfs-device"; }), "detectDanger：mkfs 设备触发警示");
    var redir = S.detectDanger("echo hi > /dev/sda");
    ok(redir.some(function (x) { return x.rule === "redirect-to-device"; }), "detectDanger：重定向到设备触发警示");
    eq(S.detectDanger("ls -la /tmp").length, 0, "detectDanger：安全命令无警示");
    eq(S.detectDanger("grep -rn ERROR /var/log").length, 0, "detectDanger：普通管道无警示");
    eq(S.detectDanger("rm -i file.txt").length, 0, "detectDanger：rm -i 无警示");
})();

/* ---------- 7. validateShellInput ---------- */
eq(S.validateShellInput("ls").valid, true, "validateShellInput：正常命令 valid");
eq(S.validateShellInput("x".repeat(4000)).valid, true, "validateShellInput 锚点：4000 字符 valid");
eq(S.validateShellInput("x".repeat(4001)).valid, false, "validateShellInput 锚点：4001 字符 invalid");
eq(S.validateShellInput("x".repeat(4001)).field, "input", "validateShellInput：超长 field=input");
has(S.validateShellInput("x".repeat(4001)).message, "4000", "validateShellInput：超长提示含 4000");
eq(S.validateShellInput("").valid, false, "validateShellInput：空串 invalid");
eq(S.validateShellInput("   ").valid, false, "validateShellInput：纯空白 invalid");
eq(S.MAX_INPUT, 4000, "validateShellInput：MAX_INPUT=4000");

/* ---------- 8. 非法参数抛错 err.field ---------- */
throws(function () { S.tokenizeShell(123); }, "input", "抛错：tokenizeShell(123) field=input");
throws(function () { S.tokenizeShell(null); }, "input", "抛错：tokenizeShell(null) field=input");
throws(function () { S.splitFlags(null); }, "flag", "抛错：splitFlags(null) field=flag");
throws(function () { S.splitFlags(42); }, "flag", "抛错：splitFlags(42) field=flag");
throws(function () { S.explainFlag(123, "-l"); }, "command", "抛错：explainFlag(123) field=command");
throws(function () { S.explainFlag("ls", null); }, "flag", "抛错：explainFlag(ls,null) field=flag");
throws(function () { S.parseCommand({}); }, "input", "抛错：parseCommand({}) field=input");
throws(function () { S.explainCommand(undefined); }, "input", "抛错：explainCommand(undefined) field=input");
throws(function () { S.detectDanger(42); }, "input", "抛错：detectDanger(42) field=input");
throws(function () { S.validateShellInput(null); }, "input", "抛错：validateShellInput(null) field=input");

/* ---------- 9. 词典覆盖：25 命令，每命令 6–15 个旗标 ---------- */
(function () {
    var cmds = S.listCommands();
    eq(cmds.length, 25, "词典：25 个常用命令");
    var names = cmds.map(function (c) { return c.name; });
    ["ls", "cd", "cp", "mv", "rm", "mkdir", "cat", "grep", "find", "sed", "awk", "tar", "curl", "wget", "ssh", "scp", "rsync", "chmod", "chown", "ps", "kill", "systemctl", "journalctl", "git", "docker"].forEach(function (n) {
        ok(names.indexOf(n) !== -1, "词典：含命令 " + n);
    });
    var counts = cmds.map(function (c) { return c.flagCount; });
    ok(Math.min.apply(null, counts) >= 6, "词典：每命令至少 6 个旗标（最小 " + Math.min.apply(null, counts) + "）");
    ok(Math.max.apply(null, counts) <= 15, "词典：每命令至多 15 个旗标（最大 " + Math.max.apply(null, counts) + "）");
    eq(cmds.filter(function (c) { return c.name === "ls"; })[0].flagCount, 14, "词典：ls 14 个旗标");
    eq(cmds.filter(function (c) { return c.name === "cd"; })[0].flagCount, 6, "词典：cd 6 个旗标");
    eq(cmds.filter(function (c) { return c.name === "grep"; })[0].flagCount, 15, "词典：grep 15 个旗标");
})();

/* ---------- 10. categories.go 注册 ---------- */
var pathCount = (GO_SRC.match(/"\/tools\/[^"]+"/g) || []).filter(function (v, i, a) { return a.indexOf(v) === i; }).length;
eq(pathCount, 319, "注册 Path 总数 318→319");
has(GO_SRC, "\"shell_explainer\"", "注册：ID shell_explainer");
has(GO_SRC, "\"/tools/shell-explainer\"", "注册：Path /tools/shell-explainer");
has(GO_SRC, "\"integration_instructions\"", "注册：Icon integration_instructions");
eq((GO_SRC.match(/Icon:\s*"integration_instructions"/g) || []).length, 1, "Icon integration_instructions 全库唯一");
var entryBlock = GO_SRC.slice(GO_SRC.indexOf("\"shell_explainer\"") - 60,
    GO_SRC.indexOf("\"shell_explainer\"") + 1600);
ok(/New:\s+true/.test(entryBlock), "注册：New: true");
ok(/Category:\s+"开发工具"/.test(entryBlock), "注册：类目 开发工具");
has(entryBlock, "Shell 命令解释器", "注册：名称 Shell 命令解释器");
ok(GO_SRC.indexOf("\"shell_explainer\"") > GO_SRC.indexOf("\"git_cheatsheet\"") &&
    GO_SRC.indexOf("\"shell_explainer\"") < GO_SRC.indexOf("\"search_router\""), "注册：紧邻 git_cheatsheet（在其后、search_router 之前）");

/* ---------- 11. 模板：SEO/真限制/控件/互链/零外部资源 ---------- */
has(TPL_SRC, "{{define \"shell_explainer\"}}", "模板：define shell_explainer");
has(TPL_SRC, "https://www.johnkingzcq123.xyz/tools/shell-explainer", "模板 canonical 含新 Path");
has(TPL_SRC, "Shell 命令解释器", "模板：标题含工具名");
has(TPL_SRC, "explainshell", "模板：SEO 关键词 explainshell");
has(TPL_SRC, "五条真限制", "模板：五条真限制标题");
has(TPL_SRC, "只解释、不执行", "模板：真限制 1 只解释不执行");
has(TPL_SRC, "词典有限", "模板：真限制 2 词典有限");
has(TPL_SRC, "不展开变量与命令替换", "模板：真限制 3 不展开变量");
has(TPL_SRC, "不解析脚本结构", "模板：真限制 4 不解析脚本结构");
has(TPL_SRC, "危险检测只是启发式提醒", "模板：真限制 5 危险检测启发式");
has(TPL_SRC, "id=\"se-input\"", "模板：输入框 se-input");
has(TPL_SRC, "id=\"se-explain-btn\"", "模板：解释按钮");
has(TPL_SRC, "id=\"se-copy\"", "模板：复制释义按钮");
has(TPL_SRC, "id=\"se-presets\"", "模板：预设示例容器");
has(TPL_SRC, "id=\"se-danger\"", "模板：危险警示容器");
has(TPL_SRC, "id=\"se-table-wrap\"", "模板：结构分解表容器");
has(TPL_SRC, "id=\"se-unknown\"", "模板：未收录容器");
has(TPL_SRC, "/tools/static/js/shell_explainer.js", "模板：引用本地 JS");
has(TPL_SRC, "/tools/git-cheatsheet", "模板：互链 git_cheatsheet");
has(TPL_SRC, "/tools/curl-to-requests", "模板：互链 curl_to_requests");
has(TPL_SRC, "/tools/docker-run-to-compose", "模板：互链 docker_run_to_compose");
has(TPL_SRC, "/tools/regex-explainer", "模板：互链 regex_explainer");
has(TPL_SRC, "只解释", "模板：互链分工说明含只解释");
notHas(TPL_SRC, "fonts.googleapis", "模板零 CDN：无外部字体");
notHas(TPL_SRC, "cdnjs", "模板零 CDN：无 cdnjs");
notHas(TPL_SRC, "unpkg", "模板零 CDN：无 unpkg");
ok((TPL_SRC.match(/<script[^>]*src="http/g) || []).length === 0, "模板零外部脚本：无 http script src");
var httpLinks = TPL_SRC.match(/<link[^>]*href="http[^"]*"/g) || [];
eq(httpLinks.length, 1, "模板 http link 仅 canonical 一条");
ok(httpLinks.length === 1 && httpLinks[0].indexOf("https://www.johnkingzcq123.xyz/tools/shell-explainer") !== -1, "模板 http link：仅自家 canonical");

/* ---------- 12. 浏览器绑定源码级检查 ---------- */
has(JS_SRC, "window.ShellExplainer", "导出：挂 window.ShellExplainer");
has(JS_SRC, "tokenizeShell", "绑定：词法切分函数");
has(JS_SRC, "explainCommand", "绑定：完整解释函数");
has(JS_SRC, "detectDanger", "绑定：危险检测函数");
has(JS_SRC, "navigator.clipboard", "绑定：复制释义用 clipboard");
has(JS_SRC, "SAMPLES", "绑定：预设示例数组");
ok((JS_SRC.match(/name: '[^']+'/g) || []).length >= 10, "绑定：至少 10 组预设示例");
has(JS_SRC, "renderAll", "绑定：解释渲染入口");
has(JS_SRC, "se-danger", "绑定：危险警示容器 id");
has(JS_SRC, "se-table-wrap", "绑定：结构分解表容器 id");
notHas(JS_SRC, "cdnjs", "绑定：无 CDN 引用");
notHas(JS_SRC, "fetch(", "绑定：不发起后端请求");
notHas(JS_SRC, "XMLHttpRequest", "绑定：不使用 XHR");

console.log("shell_explainer: pass=" + pass + " fail=" + fail + "，共 " + (pass + fail) + " 断言");
if (fail > 0) process.exit(1);
