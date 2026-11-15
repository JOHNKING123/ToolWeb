/* Shell 命令解释器纯函数单元测试（零依赖）：node tests/shell_explainer.test.js
 * 覆盖：tokenizeShell（锚点 ("ls -la /tmp")→3 token；引号/转义/续行/管道/重定向/未闭合引号）、
 * splitFlags（锚点 ("-rf")→["-r","-f"]）、explainFlag（锚点 ("ls","-l")→"以长格式列出详细信息"、
 * ("grep","-r")→"递归搜索子目录"）、parseCommand（分段/子命令/带值旗标/重定向/sudo）、
 * explainCommand（逐段释义＋plainText＋未收录）、detectDanger（锚点 ("rm -rf /") 含警示；
 * chmod 777、curl|sh、dd of=/dev/）、validateShellInput（上限 4000）、非法参数 err.field、
 * 25 命令词典（每命令 6–21 个旗标）、categories.go 注册（Path 总数 318→319、Icon
 * integration_instructions 全库唯一、紧邻 git_cheatsheet）、模板（SEO 关键词、真限制五条、
 * 控件、互链、零外部资源静态检查）、浏览器绑定源码级检查（window.ShellExplainer、
 * 分段高亮/复制释义/预设示例）、词典补全（2026-11-14）：ls --time-style、curl --max-time
 * 释义＋parseCommand 三种写法值解析；词典扫尾（2026-11-15）：其余 11 条 cp -S／--backup、
 * find -path／-newer、sed -l、curl -w／--data-raw／--data-urlencode／-e／--connect-timeout、
 * journalctl -g 释义补齐＋parseCommand 向量＋values 全库零缺口收官断言；附带补 docker
 * --tail 1 条（开发轮实测发现的第 12 处 values 有列、flags 无释义的缺口，PM 扫描遗漏）。
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

/* ---------- 9. 词典覆盖：25 命令，每命令 6–21 个旗标 ----------
 * 上限 2026-11-15 由 20 放宽至 21：curl 按规格补 5 条（-w／--data-raw／--data-urlencode／
 * -e／--connect-timeout）后达 21 条，属词典正常扩容，非失控膨胀。 */
(function () {
    var cmds = S.listCommands();
    eq(cmds.length, 25, "词典：25 个常用命令");
    var names = cmds.map(function (c) { return c.name; });
    ["ls", "cd", "cp", "mv", "rm", "mkdir", "cat", "grep", "find", "sed", "awk", "tar", "curl", "wget", "ssh", "scp", "rsync", "chmod", "chown", "ps", "kill", "systemctl", "journalctl", "git", "docker"].forEach(function (n) {
        ok(names.indexOf(n) !== -1, "词典：含命令 " + n);
    });
    var counts = cmds.map(function (c) { return c.flagCount; });
    ok(Math.min.apply(null, counts) >= 6, "词典：每命令至少 6 个旗标（最小 " + Math.min.apply(null, counts) + "）");
    ok(Math.max.apply(null, counts) <= 21, "词典：每命令至多 21 个旗标（最大 " + Math.max.apply(null, counts) + "）");
    eq(cmds.filter(function (c) { return c.name === "ls"; })[0].flagCount, 15, "词典：ls 15 个旗标（含 2026-11-14 补齐的 --time-style）");
    eq(cmds.filter(function (c) { return c.name === "cd"; })[0].flagCount, 6, "词典：cd 6 个旗标");
    eq(cmds.filter(function (c) { return c.name === "grep"; })[0].flagCount, 20, "词典：grep 20 个旗标（含补齐的 -e/-m/--color/--include/--exclude）");
    eq(cmds.filter(function (c) { return c.name === "curl"; })[0].flagCount, 21, "词典：curl 21 个旗标（含 2026-11-15 扫尾补齐的 5 条）");
    eq(cmds.filter(function (c) { return c.name === "cp"; })[0].flagCount, 15, "词典：cp 15 个旗标（含 2026-11-15 扫尾补齐的 -S／--backup）");
    eq(cmds.filter(function (c) { return c.name === "find"; })[0].flagCount, 17, "词典：find 17 个旗标（含 2026-11-15 扫尾补齐的 -path／-newer）");
    eq(cmds.filter(function (c) { return c.name === "sed"; })[0].flagCount, 11, "词典：sed 11 个旗标（含 2026-11-15 扫尾补齐的 -l）");
    eq(cmds.filter(function (c) { return c.name === "journalctl"; })[0].flagCount, 15, "词典：journalctl 15 个旗标（含 2026-11-15 扫尾补齐的 -g）");
    eq(cmds.filter(function (c) { return c.name === "docker"; })[0].flagCount, 16, "词典：docker 16 个旗标（含 2026-11-15 附带补齐的 --tail）");
})();

/* ---------- 10. categories.go 注册 ---------- */
var pathCount = (GO_SRC.match(/"\/tools\/[^"]+"/g) || []).filter(function (v, i, a) { return a.indexOf(v) === i; }).length;
eq(pathCount, 328, "注册 Path 总数 318→319");
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

/* ---------- 13. --flag=value 内联值、带引号旗标与 grep 词典补全（2026-11-10） ----------
 * 实现方式：只改 parseCommand／parseCommandShallow（在 splitFlags 丢弃 =value 之前先取出
 * 内联值），splitFlags 语义与 §2 行 71 断言不动；tokenizeShell 新增 quoteStart（引号是否
 * 在 token 首字符），分词语义不动。 */
(function () {
    function flagOf(seg, name) {
        return seg.flags.filter(function (x) { return x.flag === name; })[0];
    }
    /* 锚点 1：未加引号 --include=*.log */
    var g1 = S.parseCommand("grep -rn --include=*.log ERROR /var/log");
    eq(flagOf(g1.segments[0], "--include").value, "*.log", "--flag=value：--include 值 *.log");
    eq(flagOf(g1.segments[0], "--include").known, true, "--flag=value：--include known=true");
    eq(flagOf(g1.segments[0], "-r").value, null, "--flag=value：-r 无值");
    eq(flagOf(g1.segments[0], "-n").value, null, "--flag=value：-n 无值");
    eq(g1.segments[0].positionals[0].text, "ERROR", "--flag=value：ERROR 为位置参数");
    eq(g1.segments[0].positionals[0].desc, "搜索/处理的模式或程序", "--flag=value：ERROR 释为模式");
    eq(g1.segments[0].positionals[1].text, "/var/log", "--flag=value：/var/log 为位置参数");
    eq(g1.segments[0].positionals[1].desc, "要搜索的文件或目录", "--flag=value：/var/log 释为目录");
    eq(g1.unknown.length, 0, "--flag=value：无未收录");
    /* 锚点 2：grep 预设原样 --include="*.log" */
    var g2 = S.parseCommand('grep -rn --include="*.log" "ERROR" /var/log | head -n 50');
    eq(flagOf(g2.segments[0], "--include").value, "*.log", "预设 grep：--include 值 *.log");
    eq(flagOf(g2.segments[0], "--include").known, true, "预设 grep：--include known=true");
    eq(g2.segments[0].positionals[0].text, "ERROR", "预设 grep：ERROR 为模式");
    eq(g2.segments[0].positionals[1].text, "/var/log", "预设 grep：/var/log 为目录");
    /* 锚点 3：--exclude=*.tmp 不吞 -r */
    var g3 = S.parseCommand("grep --exclude=*.tmp -r foo .");
    eq(flagOf(g3.segments[0], "--exclude").value, "*.tmp", "--flag=value：--exclude 值 *.tmp");
    eq(flagOf(g3.segments[0], "--exclude").known, true, "--flag=value：--exclude known=true");
    ok(flagOf(g3.segments[0], "-r"), "--flag=value：-r 未被 --exclude 吞掉");
    eq(g3.segments[0].positionals[0].text, "foo", "--flag=value：foo 为模式");
    eq(g3.segments[0].positionals[1].text, ".", "--flag=value：. 为目录");
    /* 锚点 4：ls --color=always 不吞 /tmp */
    var l1 = S.parseCommand("ls --color=always /tmp");
    eq(flagOf(l1.segments[0], "--color").value, "always", "--flag=value：--color 值 always");
    eq(flagOf(l1.segments[0], "--color").known, true, "--flag=value：--color known=true");
    eq(l1.segments[0].positionals.length, 1, "--flag=value：ls 仍有 1 个位置参数");
    eq(l1.segments[0].positionals[0].text, "/tmp", "--flag=value：/tmp 未被吞");
    /* 锚点 5：tar 预设原样 */
    var t1 = S.parseCommand('tar -czvf backup.tar.gz --exclude="*.log" /var/www/html');
    eq(flagOf(t1.segments[0], "--exclude").value, "*.log", "预设 tar：--exclude 值 *.log");
    eq(flagOf(t1.segments[0], "--exclude").known, true, "预设 tar：--exclude known=true");
    eq(flagOf(t1.segments[0], "-f").value, "backup.tar.gz", "预设 tar：-f 值仍为 backup.tar.gz");
    eq(t1.segments[0].positionals[0].text, "/var/www/html", "预设 tar：/var/www/html 为位置参数");
    eq(t1.segments[0].positionals[0].desc, "要打包/解出的文件或目录", "预设 tar：/var/www/html 释为打包目标");
    /* 锚点 6：短旗标带值 -e / -m */
    var g6 = S.parseCommand("grep -e ERROR file.txt");
    eq(flagOf(g6.segments[0], "-e").value, "ERROR", "带值短旗标：-e 值 ERROR");
    eq(flagOf(g6.segments[0], "-e").known, true, "带值短旗标：-e known=true");
    var g7 = S.parseCommand("grep -m 3 foo bar");
    eq(flagOf(g7.segments[0], "-m").value, "3", "带值短旗标：-m 值 3");
    eq(flagOf(g7.segments[0], "-m").known, true, "带值短旗标：-m known=true");
    /* 锚点 7：反向守卫 */
    var q1 = S.parseCommand('grep "--include" foo');
    eq(q1.segments[0].flags.length, 0, "反向守卫：全程引号包裹的 --include 不是旗标");
    eq(q1.segments[0].positionals[0].text, "--include", "反向守卫：全程引号包裹的 --include 是位置参数");
    var q2 = S.parseCommand("ls --color");
    eq(flagOf(q2.segments[0], "--color").value, null, "反向守卫：--color 无值时 value 为 null");
    var q3 = S.parseCommand("grep --include");
    eq(flagOf(q3.segments[0], "--include").value, null, "反向守卫：末尾 --include 不吞越界、不抛错");
    /* 锚点 8：explainFlag 五条均非 null */
    ok(S.explainFlag("grep", "--include") !== null, "explainFlag：grep --include 非 null");
    ok(S.explainFlag("grep", "--exclude") !== null, "explainFlag：grep --exclude 非 null");
    ok(S.explainFlag("grep", "-e") !== null, "explainFlag：grep -e 非 null");
    ok(S.explainFlag("grep", "-m") !== null, "explainFlag：grep -m 非 null");
    ok(S.explainFlag("grep", "--color") !== null, "explainFlag：grep --color 非 null");
    has(S.explainFlag("grep", "-e"), "搜索模式", "explainFlag：grep -e 释义含搜索模式");
    has(S.explainFlag("grep", "-m"), "匹配行", "explainFlag：grep -m 释义含匹配行");
    has(S.explainFlag("grep", "--color"), "颜色", "explainFlag：grep --color 释义含颜色");
    has(S.explainFlag("grep", "--include"), "只搜索", "explainFlag：grep --include 释义含只搜索");
    has(S.explainFlag("grep", "--exclude"), "排除", "explainFlag：grep --exclude 释义含排除");
    /* tokenizeShell：引号起始位置 */
    var qt = S.tokenizeShell('--include="*.log" "--include"');
    eq(qt.tokens[0].quoteStart, false, "tokenizeShell：--include=\"*.log\" 引号不在首字符");
    eq(qt.tokens[1].quoteStart, true, "tokenizeShell：\"--include\" 引号在首字符");
    var qt2 = S.tokenizeShell("ls -la /tmp");
    eq(qt2.tokens[0].quoteStart, false, "tokenizeShell：无引号 token quoteStart=false");
    /* splitFlags 语义不动（§2 断言仍有效） */
    eqj(S.splitFlags("--color=always"), ["--color"], "splitFlags 语义不动：--color=always 仍只返旗标名");
})();

/* ---------- 14. 词典补全：ls --time-style 与 curl --max-time（2026-11-14） ----------
 * 只补 DICT.ls.flags / DICT.curl.flags 各 1 条释义；values 列表、tokenizeShell、
 * parseCommand、splitFlags、detectDanger 均不动。措辞按手册核对：
 * ls 手册：with -l, show times using style STYLE: full-iso, long-iso, iso, locale, +FORMAT；
 * curl 手册：Maximum time in seconds that you allow the transfer operation to take
 * （与 --connect-timeout 只限连接阶段区分，后者 2026-11-15 扫尾轮补齐，见 §15）。
 * 锚点 6 原为反向守卫（其余 11 条扫尾项仍为 null），2026-11-15 扫尾轮改为正向断言。 */
(function () {
    function flagOf(seg, name) {
        return seg.flags.filter(function (x) { return x.flag === name; })[0];
    }
    /* 锚点 1：explainFlag 两条均非 null，定稿措辞精确值 */
    eq(S.explainFlag("ls", "--time-style"), "指定长格式中时间戳的显示样式（如 full-iso、long-iso，或 +FORMAT 自定义）", "词典补全：ls --time-style 定稿措辞");
    has(S.explainFlag("ls", "--time-style"), "时间戳", "词典补全：ls --time-style 含时间戳");
    has(S.explainFlag("ls", "--time-style"), "样式", "词典补全：ls --time-style 含样式");
    eq(S.explainFlag("curl", "--max-time"), "整个传输的最长耗时（秒），超时则中断请求", "词典补全：curl --max-time 定稿措辞");
    has(S.explainFlag("curl", "--max-time"), "最长耗时", "词典补全：curl --max-time 含最长耗时");
    has(S.explainFlag("curl", "--max-time"), "超时", "词典补全：curl --max-time 含超时");
    /* 锚点 2：ls -l --time-style=full-iso /tmp（= 写法） */
    var l1 = S.parseCommand("ls -l --time-style=full-iso /tmp");
    eq(flagOf(l1.segments[0], "--time-style").value, "full-iso", "词典补全：ls --time-style=full-iso 值 full-iso");
    eq(flagOf(l1.segments[0], "--time-style").known, true, "词典补全：ls --time-style known=true");
    ok(flagOf(l1.segments[0], "--time-style").desc !== null, "词典补全：ls --time-style desc 非 null");
    eq(l1.unknown.length, 0, "词典补全：ls -l --time-style=full-iso /tmp 无未收录");
    ok(l1.segments[0].positionals.some(function (x) { return x.text === "/tmp"; }), "词典补全：ls 位置参数含 /tmp");
    /* 锚点 3：ls --time-style long-iso /tmp（空格写法） */
    var l2 = S.parseCommand("ls --time-style long-iso /tmp");
    eq(flagOf(l2.segments[0], "--time-style").value, "long-iso", "词典补全：ls --time-style 空格写法值 long-iso");
    eq(flagOf(l2.segments[0], "--time-style").known, true, "词典补全：ls --time-style 空格写法 known=true");
    eq(l2.unknown.length, 0, "词典补全：ls --time-style long-iso /tmp 无未收录");
    /* 锚点 4：curl --max-time 30（空格写法）与 --max-time=10（= 写法） */
    var c1 = S.parseCommand("curl --max-time 30 https://example.com");
    eq(flagOf(c1.segments[0], "--max-time").value, "30", "词典补全：curl --max-time 30 值 30");
    eq(flagOf(c1.segments[0], "--max-time").known, true, "词典补全：curl --max-time 30 known=true");
    eq(c1.unknown.length, 0, "词典补全：curl --max-time 30 无未收录");
    ok(c1.segments[0].positionals.some(function (x) { return x.text === "https://example.com"; }), "词典补全：curl 位置参数含 https://example.com");
    var c2 = S.parseCommand("curl --max-time=10 https://example.com");
    eq(flagOf(c2.segments[0], "--max-time").value, "10", "词典补全：curl --max-time=10 值 10");
    eq(flagOf(c2.segments[0], "--max-time").known, true, "词典补全：curl --max-time=10 known=true");
    eq(c2.unknown.length, 0, "词典补全：curl --max-time=10 无未收录");
    /* 锚点 5：explainCommand 端到端无 unknown */
    var e1 = S.explainCommand("ls -l --time-style=full-iso /tmp");
    eq(e1.unknown.length, 0, "词典补全：explainCommand ls --time-style 无未收录");
    has(e1.plainText, "时间戳", "词典补全：explainCommand plainText 含时间戳释义");
    var e2 = S.explainCommand("curl --max-time 30 https://example.com");
    eq(e2.unknown.length, 0, "词典补全：explainCommand curl --max-time 无未收录");
    has(e2.plainText, "最长耗时", "词典补全：explainCommand plainText 含最长耗时释义");
    /* 锚点 6：2026-11-15 扫尾——11 条释义均非 null，定稿措辞精确值（原反向守卫已转正） */
    eq(S.explainFlag("cp", "-S"), "指定备份文件的后缀", "扫尾：cp -S 定稿措辞");
    eq(S.explainFlag("cp", "--backup"), "覆盖前备份（与 -b 相同）", "扫尾：cp --backup 定稿措辞");
    eq(S.explainFlag("find", "-path"), "按路径匹配，支持通配符", "扫尾：find -path 定稿措辞");
    eq(S.explainFlag("find", "-newer"), "只匹配比指定文件更新的文件", "扫尾：find -newer 定稿措辞");
    eq(S.explainFlag("sed", "-l"), "指定 l 命令换行的行长", "扫尾：sed -l 定稿措辞");
    eq(S.explainFlag("curl", "-w"), "自定义请求完成后的输出格式（配合 %{变量} 使用）", "扫尾：curl -w 定稿措辞");
    eq(S.explainFlag("curl", "--data-raw"), "发送原始请求体数据", "扫尾：curl --data-raw 定稿措辞");
    eq(S.explainFlag("curl", "--data-urlencode"), "发送经 URL 编码的请求体数据", "扫尾：curl --data-urlencode 定稿措辞");
    eq(S.explainFlag("curl", "-e"), "指定 Referer 请求头（与 --referer 相同）", "扫尾：curl -e 定稿措辞");
    eq(S.explainFlag("curl", "--connect-timeout"), "连接阶段的最长等待时间（秒），只限连接建立", "扫尾：curl --connect-timeout 定稿措辞");
    eq(S.explainFlag("journalctl", "-g"), "按正则表达式过滤日志内容（与 --grep 相同）", "扫尾：journalctl -g 定稿措辞");
    /* 关键词验收（与 PM 验收标准 ① 对齐） */
    has(S.explainFlag("cp", "-S"), "备份", "扫尾：cp -S 含备份");
    has(S.explainFlag("cp", "-S"), "后缀", "扫尾：cp -S 含后缀");
    has(S.explainFlag("find", "-path"), "路径", "扫尾：find -path 含路径");
    has(S.explainFlag("find", "-newer"), "更新", "扫尾：find -newer 含更新");
    has(S.explainFlag("sed", "-l"), "行长", "扫尾：sed -l 含行长");
    has(S.explainFlag("curl", "-w"), "输出", "扫尾：curl -w 含输出");
    has(S.explainFlag("curl", "-w"), "格式", "扫尾：curl -w 含格式");
    has(S.explainFlag("curl", "--data-raw"), "原始", "扫尾：curl --data-raw 含原始");
    has(S.explainFlag("curl", "--data-raw"), "请求体", "扫尾：curl --data-raw 含请求体");
    has(S.explainFlag("curl", "--data-urlencode"), "URL 编码", "扫尾：curl --data-urlencode 含 URL 编码");
    has(S.explainFlag("curl", "-e"), "Referer", "扫尾：curl -e 含 Referer");
    has(S.explainFlag("curl", "--connect-timeout"), "连接", "扫尾：curl --connect-timeout 含连接");
    ok(S.explainFlag("curl", "--connect-timeout") !== S.explainFlag("curl", "--max-time"), "扫尾：curl --connect-timeout 与 --max-time 释义文本不同");
    has(S.explainFlag("journalctl", "-g"), "正则", "扫尾：journalctl -g 含正则");
    /* 锚点 7：对照项不回归 */
    ok(S.explainFlag("grep", "--include") !== null, "词典补全：grep --include 释义不回归");
    ok(S.explainFlag("tar", "--exclude") !== null, "词典补全：tar --exclude 释义不回归");
    /* 锚点 8：危险检测不回归 */
    ok(S.detectDanger("rm -rf /").length >= 1, "词典补全：rm -rf / 危险检测不回归");
})();

/* ---------- 15. 词典扫尾：11 条 parseCommand 向量＋values 全库零缺口（2026-11-15） ----------
 * 只补 DICT 五处 flags 释义（cp 2、find 2、sed 1、curl 5、journalctl 1），另附带补
 * docker --tail 1 条（开发轮源码扫描发现的第 12 处缺口：values 已列、flags 无释义，
 * PM 扫描遗漏；docker logs --tail N 只显示最后若干行日志）；values 列表、tokenizeShell、
 * parseCommand、splitFlags、detectDanger 均不动。措辞按各命令手册核对：
 * cp 手册：-S 与 --backup 同 mv（指定备份文件后缀／覆盖前备份）；find 手册：-path 按路径
 * 匹配（通配符）、-newer 只匹配比指定文件新的文件；GNU sed 手册：-l N 指定 l 命令的
 * 默认换行长度；curl 手册：-w 自定义输出格式（%{变量}）、--data-raw 发送原始数据、
 * --data-urlencode 发送 URL 编码数据、-e 即 --referer、--connect-timeout 只限连接阶段
 * （Maximum time in seconds that you allow curl's connection to take，与 --max-time
 * 整个传输区分）；journalctl 手册：-g 即 --grep，按正则过滤。
 * 附记：curl -w "%{http_code}" 仍触发 detectDanger fork-bomb 告警 1 条，系 :531 正则
 * 命中任意含 { 的输入的既有误报，非本轮范围，本节不断言 dangers（见 BACKLOG 附记）。 */
(function () {
    function flagOf(seg, name) {
        return seg.flags.filter(function (x) { return x.flag === name; })[0];
    }
    /* 锚点 1：cp -S .bak（空格写法）与 cp --backup=numbered（= 写法） */
    var p1 = S.parseCommand("cp -S .bak a b");
    eq(flagOf(p1.segments[0], "-S").value, ".bak", "扫尾：cp -S .bak 值 .bak");
    eq(flagOf(p1.segments[0], "-S").known, true, "扫尾：cp -S known=true");
    eq(p1.unknown.length, 0, "扫尾：cp -S .bak a b 无未收录");
    var p2 = S.parseCommand("cp --backup=numbered a b");
    eq(flagOf(p2.segments[0], "--backup").value, "numbered", "扫尾：cp --backup=numbered 值 numbered");
    eq(flagOf(p2.segments[0], "--backup").known, true, "扫尾：cp --backup known=true");
    eq(p2.unknown.length, 0, "扫尾：cp --backup=numbered a b 无未收录");
    /* 锚点 2：find -path 与 -newer */
    var p3 = S.parseCommand("find -path './cache/*' /tmp");
    eq(flagOf(p3.segments[0], "-path").value, "./cache/*", "扫尾：find -path 值 ./cache/*");
    eq(flagOf(p3.segments[0], "-path").known, true, "扫尾：find -path known=true");
    eq(p3.unknown.length, 0, "扫尾：find -path './cache/*' /tmp 无未收录");
    var p4 = S.parseCommand("find -newer /etc/hosts /tmp");
    eq(flagOf(p4.segments[0], "-newer").value, "/etc/hosts", "扫尾：find -newer 值 /etc/hosts");
    eq(flagOf(p4.segments[0], "-newer").known, true, "扫尾：find -newer known=true");
    eq(p4.unknown.length, 0, "扫尾：find -newer /etc/hosts /tmp 无未收录");
    /* 锚点 3：sed -l 80 */
    var p5 = S.parseCommand("sed -l 80 -n p file.txt");
    eq(flagOf(p5.segments[0], "-l").value, "80", "扫尾：sed -l 80 值 80");
    eq(flagOf(p5.segments[0], "-l").known, true, "扫尾：sed -l known=true");
    eq(p5.unknown.length, 0, "扫尾：sed -l 80 -n p file.txt 无未收录");
    /* 锚点 4：curl -w／--data-raw／--data-urlencode／-e／--connect-timeout */
    var p6 = S.parseCommand("curl -w \"%{http_code}\" https://example.com");
    eq(flagOf(p6.segments[0], "-w").value, "%{http_code}", "扫尾：curl -w 值 %{http_code}");
    eq(flagOf(p6.segments[0], "-w").known, true, "扫尾：curl -w known=true");
    eq(p6.unknown.length, 0, "扫尾：curl -w \"%{http_code}\" 无未收录");
    var p7 = S.parseCommand("curl --data-raw \"a=1\" https://example.com");
    eq(flagOf(p7.segments[0], "--data-raw").value, "a=1", "扫尾：curl --data-raw 值 a=1");
    eq(flagOf(p7.segments[0], "--data-raw").known, true, "扫尾：curl --data-raw known=true");
    eq(p7.unknown.length, 0, "扫尾：curl --data-raw \"a=1\" 无未收录");
    var p8 = S.parseCommand("curl --data-urlencode \"q=a b\" https://example.com");
    eq(flagOf(p8.segments[0], "--data-urlencode").value, "q=a b", "扫尾：curl --data-urlencode 值 q=a b");
    eq(flagOf(p8.segments[0], "--data-urlencode").known, true, "扫尾：curl --data-urlencode known=true");
    eq(p8.unknown.length, 0, "扫尾：curl --data-urlencode \"q=a b\" 无未收录");
    var p9 = S.parseCommand("curl -e https://example.com");
    eq(flagOf(p9.segments[0], "-e").value, "https://example.com", "扫尾：curl -e 值 https://example.com");
    eq(flagOf(p9.segments[0], "-e").known, true, "扫尾：curl -e known=true");
    eq(p9.unknown.length, 0, "扫尾：curl -e https://example.com 无未收录");
    var p10 = S.parseCommand("curl --connect-timeout 5 https://example.com");
    eq(flagOf(p10.segments[0], "--connect-timeout").value, "5", "扫尾：curl --connect-timeout 值 5");
    eq(flagOf(p10.segments[0], "--connect-timeout").known, true, "扫尾：curl --connect-timeout known=true");
    eq(p10.unknown.length, 0, "扫尾：curl --connect-timeout 5 无未收录");
    /* 锚点 5：journalctl -g error --since today */
    var p11 = S.parseCommand("journalctl -g error --since today");
    eq(flagOf(p11.segments[0], "-g").value, "error", "扫尾：journalctl -g 值 error");
    eq(flagOf(p11.segments[0], "-g").known, true, "扫尾：journalctl -g known=true");
    eq(flagOf(p11.segments[0], "--since").value, "today", "扫尾：journalctl --since 值 today");
    eq(p11.unknown.length, 0, "扫尾：journalctl -g error --since today 无未收录");
    /* 锚点 6：explainCommand 端到端无 unknown（11 条各抽一条） */
    eq(S.explainCommand("cp -S .bak a b").unknown.length, 0, "扫尾：explainCommand cp -S 无未收录");
    eq(S.explainCommand("find -newer /etc/hosts /tmp").unknown.length, 0, "扫尾：explainCommand find -newer 无未收录");
    has(S.explainCommand("find -newer /etc/hosts /tmp").plainText, "更新", "扫尾：explainCommand find -newer plainText 含更新释义");
    eq(S.explainCommand("curl -w \"%{http_code}\" https://example.com").unknown.length, 0, "扫尾：explainCommand curl -w 无未收录");
    eq(S.explainCommand("journalctl -g error --since today").unknown.length, 0, "扫尾：explainCommand journalctl -g 无未收录");
    has(S.explainCommand("journalctl -g error --since today").plainText, "正则", "扫尾：explainCommand journalctl -g plainText 含正则释义");
    /* 锚点 7：收官——25 命令 values 列出但 flags 无释义的为 0 条（源码级扫描 JS_SRC 的
     * 全部 values 列表，逐条 explainFlag 验真；total 断言防扫描落空） */
    eq(S.listCommands().length, 25, "扫尾：词典命令总数仍为 25");
    var vRe = /values: \[([^\]]*)\]/g, vM, vTotal = 0, vMissing = [];
    while ((vM = vRe.exec(JS_SRC)) !== null) {
        var head = JS_SRC.slice(0, vM.index), cRe = /(\w+): \{ desc: '[^']*',\s*flags: \{/g, cLast = null, c2;
        while ((c2 = cRe.exec(head)) !== null) cLast = c2;
        var cmd = cLast ? cLast[1] : null;
        var toks = vM[1].match(/'[^']+'/g) || [];
        toks.forEach(function (t) {
            var fl = t.slice(1, -1);
            vTotal++;
            if (S.explainFlag(cmd, fl) === null) vMissing.push(cmd + " " + fl);
        });
    }
    eq(vTotal, 110, "扫尾：values 列表共 110 条（扫描基数）");
    eq(vMissing.length, 0, "扫尾：values 列出但 flags 无释义的为 0 条（缺：" + vMissing.join("、") + "）");
    /* 锚点 8：docker --tail 附带补齐（第 12 处缺口） */
    eq(S.explainFlag("docker", "--tail"), "只显示最后若干行日志（logs 用）", "扫尾：docker --tail 定稿措辞");
    var p12 = S.parseCommand("docker logs --tail 50 web");
    eq(flagOf(p12.segments[0], "--tail").value, "50", "扫尾：docker logs --tail 50 值 50");
    eq(flagOf(p12.segments[0], "--tail").known, true, "扫尾：docker --tail known=true");
    eq(p12.unknown.length, 0, "扫尾：docker logs --tail 50 web 无未收录");
    /* 锚点 9：对照项不回归 */
    ok(S.explainFlag("ls", "--time-style") !== null, "扫尾：ls --time-style 释义不回归");
    ok(S.explainFlag("curl", "--max-time") !== null, "扫尾：curl --max-time 释义不回归");
    ok(S.explainFlag("grep", "--include") !== null, "扫尾：grep --include 释义不回归");
    ok(S.explainFlag("tar", "--exclude") !== null, "扫尾：tar --exclude 释义不回归");
    /* 锚点 10：危险检测不回归 */
    ok(S.detectDanger("rm -rf /").length >= 1, "扫尾：rm -rf / 危险检测不回归");
})();

console.log("shell_explainer: pass=" + pass + " fail=" + fail + "，共 " + (pass + fail) + " 断言");
if (fail > 0) process.exit(1);
