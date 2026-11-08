/* SEO 路由黑盒回归测试（服务端路由，非 JS 纯函数）：node tests/seo_routes.test.js
 * 覆盖 2026-11-08 sitemap/robots/404 修复：
 *  - /tool-web/sitemap.xml：200、application/xml、非空、<loc> 329 条（见下注），
 *    全部 loc 以当前访问 base（host＋/tool-web）开头、无 /tools/ 双前缀、无旧域名，
 *    首页＋索引＋抽查工具 loc 逐条可达；
 *  - /tool-web/robots.txt：200、text/plain、非空、Sitemap 行唯一且指向同地址 sitemap；
 *  - 未知 slug：/tool-web 与 /tools 下均 404 且 body 非空（含“工具不存在”）；
 *  - 直接访问：/tools/sitemap.xml、/sitemap.xml、/tools/robots.txt、/robots.txt 不回归，
 *    其 loc 以 host（＋/tools）为 base；
 *  - 已知工具页与首页抽查 200（gcode-viewer、3d-model-viewer 等 slug→模板名映射页、
 *    barcode-generator、json-yaml-converter 两个修链目标）；
 *  - 已下线工具 /tools/postman（categories.go 注释“暂时屏蔽了”，模板仍在）返回 404，
 *    证明存在性校验以 categories 注册为准、而非模板存在性；
 *  - X-Forwarded-Proto: https 时 loc 用 https（Caddy 反代形态）；客户端伪造的
 *    X-ToolWeb-Mount-Prefix 头在直通时被清除，不影响直接访问的 sitemap。
 * 注：<loc> 329 ＝ 首页＋工具索引＋327 个已注册工具。327 不是笔误：
 * categories.go 用 grep 数 "/tools/..." 会得到 328，因为含一条被注释掉的
 * postman 注册（“暂时屏蔽了”，上线时“不放开”）；运行时 GetCategories()
 * 只返回 327 个。本测试以未注释的 Path 行数为准交叉核对（329 ＝ 327＋2）。
 * 运行方式：默认自动编译当前源码到系统临时目录并起一个临时服务（端口自动选空闲），
 * 跑完即 kill、不留进程；也可设 TOOLWEB_TEST_BIN 指向已编译好的二进制跳过编译，
 * 设 TOOLWEB_TEST_PORT 指定固定端口。Go 路径：PATH 中的 go，找不到时用
 * /home/hatch/go-tools/go/bin/go（见 TOOLS.md 换机丢 PATH 的记录）。
 */
"use strict";
var fs = require("fs");
var path = require("path");
var os = require("os");
var http = require("http");
var net = require("net");
var child_process = require("child_process");

var ROOT = path.join(__dirname, "..");
var pass = 0, fail = 0;
function ok(cond, name) {
    if (cond) { pass++; }
    else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function has(s, sub, name) { ok(s.indexOf(sub) !== -1, name + "（缺 " + sub + "）"); }
function notHas(s, sub, name) { ok(s.indexOf(sub) === -1, name + "（不应含 " + sub + "）"); }

function findGo() {
    if (process.env.GO_BIN && fs.existsSync(process.env.GO_BIN)) return process.env.GO_BIN;
    try {
        var w = child_process.execSync("which go", { encoding: "utf8" }).trim();
        if (w) return w;
    } catch (e) { /* PATH 里没有 go，走 fallback */ }
    var fallback = "/home/hatch/go-tools/go/bin/go";
    if (fs.existsSync(fallback)) return fallback;
    return null;
}

function freePort() {
    return new Promise(function (resolve, reject) {
        var s = net.createServer();
        s.once("error", reject);
        s.listen(0, "127.0.0.1", function () {
            var p = s.address().port;
            s.close(function () { resolve(p); });
        });
    });
}

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

function get(port, p, headers) {
    return new Promise(function (resolve, reject) {
        var req = http.request({ host: "127.0.0.1", port: port, path: p, method: "GET", headers: headers || {} }, function (res) {
            var chunks = [];
            res.on("data", function (c) { chunks.push(c); });
            res.on("end", function () {
                resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") });
            });
            res.on("error", reject);
        });
        req.on("error", reject);
        req.end();
    });
}

function countLocs(xml) { var m = xml.match(/<loc>/g); return m ? m.length : 0; }
function locList(xml) {
    var out = [], re = /<loc>([^<]+)<\/loc>/g, m;
    while ((m = re.exec(xml))) out.push(m[1]);
    return out;
}
function sitemapLines(txt) {
    return txt.split("\n").filter(function (l) { return l.indexOf("Sitemap:") === 0; });
}

/* 已注册工具数：以 categories.go 未注释的 Path 行为准（注释掉的 postman 不计）。 */
function countActiveTools() {
    var src = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");
    var n = 0;
    src.split("\n").forEach(function (line) {
        if (/Path:\s*"\/tools\//.test(line) && !/^\s*\/\//.test(line)) n++;
    });
    return n;
}

async function startServer(bin, port) {
    var env = Object.assign({}, process.env, { TOOLWEB_ADDR: "127.0.0.1:" + port });
    var child = child_process.spawn(bin, [], { cwd: ROOT, env: env, stdio: "ignore" });
    var dead = false;
    child.once("exit", function () { dead = true; });
    var deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
        if (dead) throw new Error("服务启动失败（端口 " + port + " 可能被占或二进制异常退出）");
        try {
            var r = await get(port, "/");
            if (r.status === 200) return child;
        } catch (e) { /* 未就绪，继续等 */ }
        await sleep(200);
    }
    throw new Error("服务 20 秒内未就绪（端口 " + port + "）");
}

function stopServer(child) {
    return new Promise(function (resolve) {
        if (!child || child.killed) return resolve();
        child.once("exit", resolve);
        try { child.kill("SIGTERM"); } catch (e) { resolve(); }
        setTimeout(resolve, 5000);
    });
}

async function run() {
    var activeTools = countActiveTools();
    eq(activeTools, 327, "已注册工具数（未注释 Path 行；postman 被注释不计）");

    var tmpDir = null, bin = process.env.TOOLWEB_TEST_BIN || "";
    if (!bin) {
        var go = findGo();
        ok(!!go, "找到 go（PATH 或 /home/hatch/go-tools/go/bin/go）");
        if (!go) return;
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "seo-routes-"));
        bin = path.join(tmpDir, "toolweb-seo-test");
        try {
            child_process.execFileSync(go, ["build", "-o", bin, "."], { cwd: ROOT, stdio: "pipe" });
        } catch (e) {
            ok(false, "编译服务二进制：" + (e.stderr ? e.stderr.toString("utf8").slice(0, 500) : e.message));
            return;
        }
        ok(fs.existsSync(bin), "编译出临时服务二进制");
    }

    var port = process.env.TOOLWEB_TEST_PORT ? parseInt(process.env.TOOLWEB_TEST_PORT, 10) : 0;
    var child = null, lastErr = null;
    for (var attempt = 0; attempt < 3 && !child; attempt++) {
        try {
            if (!port) port = await freePort();
            child = await startServer(bin, port);
        } catch (e) { lastErr = e; child = null; port = 0; }
    }
    ok(!!child, "临时服务启动就绪" + (lastErr && !child ? "（" + lastErr.message + "）" : ""));
    if (!child) return;

    var base = "http://127.0.0.1:" + port;
    try {
        /* ---------- 1. /tool-web/sitemap.xml ---------- */
        var smTw = await get(port, "/tool-web/sitemap.xml");
        eq(smTw.status, 200, "/tool-web/sitemap.xml 状态 200");
        ok((smTw.headers["content-type"] || "").indexOf("xml") !== -1, "/tool-web/sitemap.xml Content-Type 含 xml（实得 " + smTw.headers["content-type"] + "）");
        ok(smTw.body.length > 1000, "/tool-web/sitemap.xml body 非空（" + smTw.body.length + "B）");
        ok(smTw.body.indexOf("<?xml") === 0, "/tool-web/sitemap.xml 以 XML 声明开头");
        eq(countLocs(smTw.body), 329, "/tool-web/sitemap.xml <loc> 329 条（首页＋索引＋327 工具）");
        eq(countLocs(smTw.body), activeTools + 2, "/tool-web/sitemap.xml <loc> 数＝已注册工具数＋2");
        var locsTw = locList(smTw.body);
        eq(locsTw[0], base + "/tool-web", "挂载 sitemap 首页 loc＝base（/tool-web）");
        eq(locsTw[1], base + "/tool-web/index", "挂载 sitemap 索引 loc＝base/index");
        ok(locsTw.every(function (l) { return l === base + "/tool-web" || l.indexOf(base + "/tool-web/") === 0; }),
            "挂载 sitemap 全部 loc 以 base/tool-web 开头");
        ok(locsTw.every(function (l) { return l.indexOf("/tools/") === -1; }),
            "挂载 sitemap 无 /tools/ 双前缀");
        notHas(smTw.body, "johnkingzcq123.xyz", "挂载 sitemap 无旧域名 johnkingzcq123.xyz");
        has(smTw.body, "<loc>" + base + "/tool-web/gcode-viewer</loc>", "挂载 sitemap 含 gcode-viewer");
        has(smTw.body, "<loc>" + base + "/tool-web/barcode-generator</loc>", "挂载 sitemap 含 barcode-generator");
        has(smTw.body, "<loc>" + base + "/tool-web/json-yaml-converter</loc>", "挂载 sitemap 含 json-yaml-converter");
        notHas(smTw.body, "/tools/postman", "挂载 sitemap 不含已下线 postman");

        /* ---------- 2. /tool-web/robots.txt ---------- */
        var rbTw = await get(port, "/tool-web/robots.txt");
        eq(rbTw.status, 200, "/tool-web/robots.txt 状态 200");
        ok((rbTw.headers["content-type"] || "").indexOf("text/plain") !== -1, "/tool-web/robots.txt Content-Type text/plain（实得 " + rbTw.headers["content-type"] + "）");
        ok(rbTw.body.length > 0, "/tool-web/robots.txt body 非空");
        var smLines = sitemapLines(rbTw.body);
        eq(smLines.length, 1, "/tool-web/robots.txt Sitemap 行恰好 1 条");
        eq(smLines[0], "Sitemap: " + base + "/tool-web/sitemap.xml", "/tool-web/robots.txt Sitemap 行指向同地址 sitemap");
        var smViaRobots = await get(port, "/tool-web/sitemap.xml");
        eq(smViaRobots.status, 200, "robots Sitemap 行指向的地址可达（200）");

        /* ---------- 3. 未知 slug 404 ---------- */
        var nf1 = await get(port, "/tool-web/unknown-slug-xyz");
        eq(nf1.status, 404, "/tool-web 未知 slug 状态 404");
        ok(nf1.body.length > 0, "/tool-web 未知 slug body 非空");
        has(nf1.body, "工具不存在", "/tool-web 未知 slug body 含“工具不存在”");
        var nf2 = await get(port, "/tools/unknown-slug-xyz");
        eq(nf2.status, 404, "/tools 未知 slug 状态 404");
        ok(nf2.body.length > 0, "/tools 未知 slug body 非空");
        has(nf2.body, "工具不存在", "/tools 未知 slug body 含“工具不存在”");
        var nf3 = await get(port, "/tools/postman");
        eq(nf3.status, 404, "已下线 /tools/postman 状态 404（模板在、注册无）");
        has(nf3.body, "工具不存在", "已下线 /tools/postman body 含“工具不存在”");

        /* ---------- 4. 直接访问 /tools/sitemap.xml ---------- */
        var smTools = await get(port, "/tools/sitemap.xml");
        eq(smTools.status, 200, "/tools/sitemap.xml 状态 200");
        eq(countLocs(smTools.body), 329, "/tools/sitemap.xml <loc> 329 条");
        var locsTools = locList(smTools.body);
        eq(locsTools[0], base, "直接 sitemap 首页 loc＝base（无挂载前缀）");
        eq(locsTools[1], base + "/tools/index", "直接 sitemap 索引 loc＝base/tools/index");
        ok(locsTools.every(function (l) { return l === base || l.indexOf(base + "/tools/") === 0; }),
            "直接 sitemap 全部 loc 以 base 或 base/tools/ 开头");
        ok(locsTools.every(function (l) { return l.indexOf("/tool-web/") === -1; }),
            "直接 sitemap 无 /tool-web 前缀");
        has(smTools.body, "<loc>" + base + "/tools/gcode-viewer</loc>", "直接 sitemap 含 gcode-viewer");

        /* ---------- 5. 根路径不回归 ---------- */
        var smRoot = await get(port, "/sitemap.xml");
        eq(smRoot.status, 200, "根 /sitemap.xml 状态 200");
        eq(smRoot.body, smTools.body, "根 /sitemap.xml 与 /tools/sitemap.xml 内容一致");
        eq(countLocs(smRoot.body), 329, "根 /sitemap.xml <loc> 329 条");
        var rbTools = await get(port, "/tools/robots.txt");
        eq(rbTools.status, 200, "/tools/robots.txt 状态 200");
        eq(sitemapLines(rbTools.body).length, 1, "/tools/robots.txt Sitemap 行 1 条");
        eq(sitemapLines(rbTools.body)[0], "Sitemap: " + base + "/sitemap.xml", "/tools/robots.txt Sitemap 行指向根 sitemap");
        var rbRoot = await get(port, "/robots.txt");
        eq(rbRoot.status, 200, "根 /robots.txt 状态 200");
        eq(rbRoot.body, rbTools.body, "根 /robots.txt 与 /tools/robots.txt 内容一致");

        /* ---------- 6. X-Forwarded-Proto 与防伪造头 ---------- */
        var smHttps = await get(port, "/tool-web/sitemap.xml", { "X-Forwarded-Proto": "https" });
        eq(smHttps.status, 200, "X-Forwarded-Proto: https 时 sitemap 仍 200");
        eq(locList(smHttps.body)[0], "https://127.0.0.1:" + port + "/tool-web", "X-Forwarded-Proto: https 时 loc 用 https");
        var smSpoof = await get(port, "/tools/sitemap.xml", { "X-ToolWeb-Mount-Prefix": "/tool-web" });
        eq(locList(smSpoof.body)[0], base, "伪造挂载前缀头直通时被清除（直接 sitemap 首页仍为 base）");

        /* ---------- 7. 回归：首页与已知工具页 ---------- */
        var home = await get(port, "/");
        eq(home.status, 200, "首页 / 状态 200");
        ok(home.body.length > 1000, "首页 / body 非空");
        var idxTools = await get(port, "/tools/index");
        eq(idxTools.status, 200, "/tools/index 状态 200");
        var idxTw = await get(port, "/tool-web/index");
        eq(idxTw.status, 200, "/tool-web/index 状态 200");
        var known = [
            "/tools/gcode-viewer", "/tool-web/gcode-viewer",
            "/tools/3d-model-viewer", "/tools/modbus-frame", "/tools/register-bitfield",
            "/tools/barcode-generator", "/tools/json-yaml-converter",
        ];
        for (var i = 0; i < known.length; i++) {
            var r = await get(port, known[i]);
            eq(r.status, 200, "已知工具页 " + known[i] + " 状态 200");
            ok(r.body.length > 1000, "已知工具页 " + known[i] + " body 非空");
        }

        /* ---------- 8. loc 抽查逐条可达 ---------- */
        var homeTw = await get(port, "/tool-web");
        eq(homeTw.status, 302, "挂载首页 /tool-web 302 跳转到 /tool-web/index");
        eq(homeTw.headers.location, "/tool-web/index", "挂载首页跳转 Location＝/tool-web/index");
        var reach = ["/tool-web/index", "/tool-web/gcode-viewer", "/tool-web/json-parser"];
        for (var j = 0; j < reach.length; j++) {
            var rr = await get(port, reach[j]);
            eq(rr.status, 200, "sitemap loc 抽查可达 " + reach[j]);
        }
    } finally {
        await stopServer(child);
        if (tmpDir) {
            try { fs.unlinkSync(bin); fs.rmdirSync(tmpDir); } catch (e) { /* 临时文件清理失败不影响结果 */ }
        }
    }
}

run().then(function () {
    console.log("seo_routes: " + pass + " 通过, " + fail + " 失败");
    if (fail > 0) process.exitCode = 1;
}).catch(function (e) {
    console.error("FAIL: 测试执行异常", e && e.stack || e);
    process.exitCode = 1;
});
