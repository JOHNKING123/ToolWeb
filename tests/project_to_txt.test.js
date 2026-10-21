/* 代码打包给 LLM（Project to TXT）纯逻辑单元测试（零依赖）：node tests/project_to_txt.test.js
 * 覆盖：
 *  1. 忽略规则（目录段精确匹配 / 文件名 / *.lock 后缀 / 自定义忽略）
 *  2. 二进制识别（扩展名 / 魔数 / NUL 启发 / UTF-16 BOM 豁免）
 *  3. 文件分类组合（忽略 > 超限 > 二进制 > 白名单 优先级）
 *  4. 扩展名白名单解析与匹配
 *  5. 文件树构建 / 展平 / 复选框传播 / 全选
 *  6. 合并格式（路径分隔头 + 文件数/字符数/预估 token 汇总）
 *  7. token 估算（ASCII / CJK / 代理对）
 *  8. basename / ext / formatBytes 小工具
 */
"use strict";
var P = require("../static/js/project_to_txt.js");

var pass = 0, fail = 0;
function ok(cond, name) {
    if (cond) { pass++; }
    else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function contains(s, sub, name) { ok(String(s).indexOf(sub) !== -1, name + "（期望包含 " + JSON.stringify(sub) + "）"); }
function notContains(s, sub, name) { ok(String(s).indexOf(sub) === -1, name + "（不应包含 " + JSON.stringify(sub) + "）"); }

/* ================= 1. 忽略规则 ================= */

(function () {
    function ig(p, dirs) { return P.shouldIgnorePath(p, dirs).ignored; }

    eq(ig("node_modules/a.js"), true, "根级 node_modules 忽略");
    eq(ig("src/node_modules/x.js"), true, "嵌套 node_modules 忽略");
    eq(ig(".git/config"), true, ".git 忽略");
    eq(ig("a/b/.git/objects/x"), true, "深层 .git 忽略");
    eq(ig(".idea/workspace.xml"), true, ".idea 忽略");
    eq(ig(".vscode/settings.json"), true, ".vscode 忽略");
    eq(ig("dist/bundle.js"), true, "dist 忽略");
    eq(ig("build/out.js"), true, "build 忽略");
    eq(ig("pkg/__pycache__/a.pyc"), true, "__pycache__ 忽略");

    eq(ig("src/index.js"), false, "普通源码不忽略");
    eq(ig(".gitignore"), false, ".gitignore 文件名不是 .git 目录，不忽略");
    eq(ig("src/dist2/a.js"), false, "dist2 不是精确段匹配，不忽略");
    eq(ig("mydist/a.js"), false, "mydist 前缀匹配不忽略");
    eq(ig("buildx/a.js"), false, "buildx 不忽略");
    eq(ig("node_modules2/a.js"), false, "node_modules2 不忽略");
    eq(ig("src/git/a.js"), false, "git 目录（非 .git）不忽略");

    /* reason 内容 */
    contains(P.shouldIgnorePath("node_modules/a.js").reason, "node_modules", "忽略原因带目录名");

    /* 自定义忽略目录 */
    eq(ig("vendor/a.js", ["vendor"]), true, "自定义忽略目录 vendor 生效");
    eq(ig("src/a.js", ["vendor"]), false, "自定义忽略不影响其他路径");

    /* parseIgnoredDirs */
    eq(JSON.stringify(P.parseIgnoredDirs("node_modules, .git\n dist ；build")),
       JSON.stringify(["node_modules", ".git", "dist", "build"]), "忽略目录解析（逗号/换行/中文分号）");
    eq(JSON.stringify(P.parseIgnoredDirs("a,a,A")), JSON.stringify(["a"]), "忽略目录去重（大小写）");
    eq(JSON.stringify(P.parseIgnoredDirs("")), JSON.stringify([]), "空输入解析为空数组");
    eq(JSON.stringify(P.parseIgnoredDirs("/dist/")), JSON.stringify(["dist"]), "首尾斜杠被清理");

    /* 忽略文件名 */
    eq(ig(".DS_Store"), true, ".DS_Store 忽略");
    eq(ig("sub/.DS_Store"), true, "嵌套 .DS_Store 忽略");
    eq(ig("Thumbs.db"), true, "Thumbs.db 忽略");

    /* *.lock 后缀 */
    eq(ig("yarn.lock"), true, "yarn.lock 命中 *.lock");
    eq(ig("sub/Cargo.lock"), true, "Cargo.lock 命中 *.lock");
    eq(ig("composer.lock"), true, "composer.lock 命中 *.lock");
    eq(ig("package-lock.json"), false, "package-lock.json 不是 .lock 后缀，不忽略");
    eq(ig("lockfile.txt"), false, "lockfile.txt 不忽略");
    contains(P.shouldIgnorePath("yarn.lock").reason, ".lock", "lock 忽略原因带后缀");
})();

/* ================= 2. 二进制识别 ================= */

(function () {
    function bin(name, head) { return P.isBinaryFile(name, head).binary; }

    /* 扩展名识别（大小写不敏感） */
    eq(bin("a.png"), true, "png 二进制");
    eq(bin("a.JPG"), true, "JPG 大写二进制");
    eq(bin("photo.jpeg"), true, "jpeg 二进制");
    eq(bin("anim.gif"), true, "gif 二进制");
    eq(bin("icon.webp"), true, "webp 二进制");
    eq(bin("x.mp3"), true, "mp3 二进制");
    eq(bin("x.mp4"), true, "mp4 二进制");
    eq(bin("font.woff2"), true, "woff2 二进制");
    eq(bin("font.ttf"), true, "ttf 二进制");
    eq(bin("a.zip"), true, "zip 二进制");
    eq(bin("a.tar.gz"), true, "tar.gz 二进制");
    eq(bin("app.exe"), true, "exe 二进制");
    eq(bin("lib.so"), true, "so 二进制");
    eq(bin("doc.pdf"), true, "pdf 二进制");
    eq(bin("a.docx"), true, "docx 二进制");
    eq(bin("a.db"), true, "db 二进制");

    /* 文本扩展名 / 无扩展名 */
    eq(bin("app.js"), false, "js 文本");
    eq(bin("README.md"), false, "md 文本");
    eq(bin("Makefile"), false, "无扩展名视为文本");
    eq(bin("image.svg"), false, "svg 是文本不判二进制");
    eq(bin(".gitignore"), false, ".gitignore 文本");
    eq(bin("a.TS"), false, "TS 大写文本");

    /* 魔数识别（扩展名伪装也逃不过） */
    var r = P.isBinaryFile("weird.js", [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A]);
    eq(r.binary, true, "PNG 魔数判二进制");
    eq(r.reason, "magic", "PNG 魔数原因=magic");
    eq(r.detail, "PNG", "PNG 魔数 detail=PNG");
    eq(P.isBinaryFile("x.bin", [0xFF, 0xD8, 0xFF, 0xE0]).detail, "JPEG", "JPEG 魔数");
    eq(bin("x.dat", [0x47, 0x49, 0x46, 0x38, 0x39]), true, "GIF 魔数");
    eq(bin("x.dat", [0x50, 0x4B, 0x03, 0x04]), true, "ZIP 魔数");
    eq(bin("x.dat", [0x1F, 0x8B]), true, "GZIP 魔数");
    eq(bin("x.dat", [0x25, 0x50, 0x44, 0x46]), true, "PDF 魔数");
    eq(bin("x.dat", [0x4D, 0x5A, 0x90, 0x00]), true, "EXE(MZ) 魔数");
    eq(bin("x.dat", [0x7F, 0x45, 0x4C, 0x46]), true, "ELF 魔数");
    eq(bin("x.dat", [0x42, 0x4D]), true, "BMP 魔数");

    /* 头部太短不误判 */
    eq(bin("a.txt", [0x89]), false, "单字节头部不触发魔数");

    /* NUL 字节启发式 */
    r = P.isBinaryFile("data.txt", [104, 101, 108, 108, 111, 0, 119, 111, 114, 108, 100]);
    eq(r.binary, true, "含 NUL 字节判二进制");
    eq(r.reason, "nul", "NUL 原因=nul");

    /* UTF-16 BOM 豁免 NUL 检查 */
    eq(bin("u.txt", [0xFF, 0xFE, 0x68, 0x00, 0x69, 0x00]), false, "UTF-16LE BOM 文件不因 NUL 误判");
    eq(bin("u.txt", [0xFE, 0xFF, 0x00, 0x68]), false, "UTF-16BE BOM 文件不因 NUL 误判");

    /* 纯文本头部 */
    eq(bin("a.js", [99, 111, 110, 115, 111, 108, 101]), false, "文本头部不判二进制");
    eq(bin("a.js", []), false, "空头部不判二进制");

    /* 扩展名原因 */
    r = P.isBinaryFile("a.png", null);
    eq(r.reason, "ext", "无头部时扩展名原因=ext");
    eq(r.detail, ".png", "扩展名 detail 带点");
})();

/* ================= 3. 文件分类 ================= */

(function () {
    eq(P.classifyFile("node_modules/a.js", 100, {}).status, "ignored", "分类：忽略规则优先");
    eq(P.classifyFile("src/a.js", 100, {}).status, "include", "分类：普通文件纳入");
    eq(P.classifyFile("src/a.png", 100, {}).status, "binary", "分类：图片二进制");
    contains(P.classifyFile("src/a.png", 100, {}).reason, ".png", "二进制原因带扩展名");
    eq(P.classifyFile("src/big.js", 1024 * 1024 + 1, {}).status, "too_large", "分类：超 1MB 跳过");
    eq(P.classifyFile("src/edge.js", 1024 * 1024, {}).status, "include", "分类：恰好 1MB 不跳过");
    eq(P.classifyFile("src/a.js", 10, { whitelist: ["ts"] }).status, "ignored", "分类：白名单外被忽略");
    contains(P.classifyFile("src/a.js", 10, { whitelist: ["ts"] }).reason, "白名单", "白名单忽略原因");
    eq(P.classifyFile("src/a.ts", 10, { whitelist: ["ts"] }).status, "include", "分类：白名单内纳入");
    /* 忽略优先于超限：node_modules 下的大文件仍是 ignored */
    eq(P.classifyFile("node_modules/big.js", 9 * 1024 * 1024, {}).status, "ignored", "分类：忽略优先于超限");
    /* 魔数压过扩展名 */
    eq(P.classifyFile("x.js", 100, { headBytes: [0x89, 0x50, 0x4E, 0x47] }).status, "binary", "分类：魔数压过 js 扩展名");
    /* MAX_FILE_SIZE 常量 */
    eq(P.MAX_FILE_SIZE, 1048576, "MAX_FILE_SIZE=1MB");
})();

/* ================= 4. 白名单 ================= */

(function () {
    eq(JSON.stringify(P.parseWhitelist(".js, ts;vue")), JSON.stringify(["js", "ts", "vue"]), "白名单解析去点");
    eq(JSON.stringify(P.parseWhitelist("JS,js")), JSON.stringify(["js"]), "白名单去重转小写");
    eq(JSON.stringify(P.parseWhitelist("")), JSON.stringify([]), "白名单空输入");
    eq(P.matchWhitelist("a.js", []), true, "空列表全部通过");
    eq(P.matchWhitelist("a.js", null), true, "null 白名单全部通过");
    eq(P.matchWhitelist("a.js", ["js"]), true, "扩展名命中通过");
    eq(P.matchWhitelist("a.JS", ["js"]), true, "扩展名大小写不敏感");
    eq(P.matchWhitelist("a.ts", ["js"]), false, "扩展名未命中不通过");
    eq(P.matchWhitelist("Makefile", ["js"]), false, "无扩展名在白名单模式下不通过");
    eq(P.matchWhitelist("Makefile", []), true, "无扩展名在空列表下通过");
})();

/* ================= 5. 文件树 ================= */

(function () {
    var files = [
        { path: "src/index.js", size: 100, status: "include", reason: "" },
        { path: "src/util/a.js", size: 50, status: "include", reason: "" },
        { path: "README.md", size: 20, status: "include", reason: "" },
        { path: "node_modules/x.js", size: 10, status: "ignored", reason: "忽略目录 node_modules" },
        { path: "a.png", size: 30, status: "binary", reason: "二进制跳过(.png)" }
    ];
    var root = P.buildTree(files);

    /* 构建：目录优先、同级按名排序 */
    eq(root.children.map(function (n) { return n.name; }).join(","),
       "node_modules,src,a.png,README.md", "根级目录优先、文件按名排序（含被忽略的目录节点）");
    var srcNode = null, flat = P.flattenTree(root), i;
    for (i = 0; i < flat.length; i++) { if (flat[i].path === "src") srcNode = flat[i]; }
    eq(srcNode.children.map(function (n) { return n.name; }).join(","),
       "util,index.js", "src 下目录优先排序");

    /* 展平顺序 */
    eq(flat.map(function (n) { return n.path; }).join("|"),
       "node_modules|node_modules/x.js|src|src/util|src/util/a.js|src/index.js|a.png|README.md", "展平为深度优先目录优先序");

    /* 计数 */
    var c = P.countTree(root);
    eq(c.dirs, 3, "目录数=3（含 node_modules）");
    eq(c.files, 5, "文件数=5");
    eq(c.selected, 3, "默认选中 3 个可纳入文件");
    eq(c.skipped, 2, "跳过 2 个");

    /* 选中集合 */
    eq(P.getSelectedFiles(root).length, 3, "getSelectedFiles=3");
    eq(root.checked, false, "根因含未选文件而不全选");
    eq(root.indeterminate, true, "根为半选状态");

    /* 全不选 / 全选（跳过文件保持不选） */
    P.setCheckedAll(root, false);
    eq(P.countTree(root).selected, 0, "全不选后选中=0");
    eq(root.checked, false, "全不选后根 unchecked");
    P.setCheckedAll(root, true);
    eq(P.countTree(root).selected, 3, "全选后仅 3 个可纳入文件被选");
    eq(P.getSelectedFiles(root).length, 3, "全选后 getSelectedFiles=3");

    /* 逐项剔除：取消 src 目录 → 只剩 README.md */
    P.setChecked(srcNode, false);
    eq(P.getSelectedFiles(root).map(function (n) { return n.path; }).join(","),
       "README.md", "取消 src 目录后只剩 README.md");
    eq(root.indeterminate, true, "部分选中根为半选");
    eq(srcNode.checked, false, "src 目录 unchecked");

    /* 重新勾选 src */
    P.setChecked(srcNode, true);
    eq(P.countTree(root).selected, 3, "重选 src 后选中=3");
    eq(root.checked, false, "仍有跳过文件，根不全选");
    eq(root.indeterminate, true, "仍有跳过文件，根半选");

    /* 单文件剔除 → 父目录半选 */
    var idxNode = null;
    flat = P.flattenTree(root);
    for (i = 0; i < flat.length; i++) { if (flat[i].path === "src/index.js") idxNode = flat[i]; }
    P.setChecked(idxNode, false);
    eq(srcNode.indeterminate, true, "单文件剔除后父目录半选");
    eq(srcNode.checked, false, "单文件剔除后父目录 unchecked");
    eq(P.getSelectedFiles(root).length, 2, "单文件剔除后选中=2");

    /* 空树 */
    var empty = P.buildTree([]);
    eq(P.flattenTree(empty).length, 0, "空文件列表展平为空");
    eq(P.getSelectedFiles(empty).length, 0, "空树选中=0");
})();

/* ================= 6. 合并格式 ================= */

(function () {
    var head0 = P.mergeFiles([], { now: "2026-10-21 17:00:00" });
    contains(head0, "文件数：0", "空合并文件数为0");
    contains(head0, "总字符数：0", "空合并字符数为0");
    contains(head0, "预估 Token", "空合并带 token 行");
    contains(head0, "2026-10-21 17:00:00", "空合并带生成时间");
    contains(head0, "（未选择任何文件）", "空合并提示文本");

    var out = P.mergeFiles([
        { path: "src/a.js", content: "console.log(1);" },
        { path: "b.md", content: "# hi" }
    ], { now: "2026-10-21 17:00:00" });
    contains(out, "代码打包结果", "合并带标题");
    contains(out, "文件数：2", "合并文件数=2");
    contains(out, "总字符数：19", "合并总字符数=19");
    contains(out, "预估 Token：约", "合并带预估 token");
    contains(out, "FILE: src/a.js（15 字符）", "文件分隔头带路径与字符数");
    contains(out, "FILE: b.md（4 字符）", "第二文件分隔头");
    contains(out, "console.log(1);", "文件内容保留");
    ok(out.indexOf("FILE: src/a.js") < out.indexOf("FILE: b.md"), "文件按传入顺序拼接");
    ok(out.indexOf("总字符数") < out.indexOf("FILE: src/a.js"), "汇总头在文件体之前");
    notContains(out, "（未选择任何文件）", "非空合并无空提示");

    var emptyContent = P.mergeFiles([{ path: "e.txt", content: "" }], { now: "t" });
    contains(emptyContent, "FILE: e.txt（0 字符）", "空内容文件字符数为0");
    contains(emptyContent, "总字符数：0", "空内容总字符数为0");

    /* null 内容容错 */
    var nullOut = P.mergeFiles([{ path: "n.txt", content: null }], { now: "t" });
    contains(nullOut, "FILE: n.txt", "null 内容不抛异常");
})();

/* ================= 7. token 估算 ================= */

(function () {
    eq(P.estimateTokens(""), 0, "空字符串 token=0");
    eq(P.estimateTokens(null), 0, "null token=0");
    eq(P.estimateTokens("abcd"), 1, "4 个 ASCII=1 token");
    eq(P.estimateTokens("abcdefgh"), 2, "8 个 ASCII=2 token");
    eq(P.estimateTokens("abc"), 1, "不足 4 字符至少 1 token");
    eq(P.estimateTokens("你好"), 2, "2 个 CJK=2 token");
    eq(P.estimateTokens("abcd你好"), 3, "混合文本 token=ceil(1+1.34)=3");
    eq(P.estimateTokens("　"), 1, "全角空格按 CJK 计");
    /* 代理对（扩展 B 区汉字𠀀）计 1 个 CJK 字符 */
    eq(P.estimateTokens("𠀀"), 1, "代理对汉字计 1 个 CJK=1 token");
    ok(P.estimateTokens("console.log('hello world'); // 你好") > 0, "混合代码 token>0");
})();

/* ================= 8. 小工具 ================= */

(function () {
    eq(P.ext("a.JS"), "js", "ext 转小写");
    eq(P.ext(".gitignore"), "", "ext 点开头文件无扩展名");
    eq(P.ext("Makefile"), "", "ext 无点无扩展名");
    eq(P.ext("a.tar.gz"), "gz", "ext 取最后一段");
    eq(P.ext("a/b/c.TXT"), "TXT".toLowerCase(), "ext 带路径");
    eq(P.basename("a/b/c.js"), "c.js", "basename 取最后一段");
    eq(P.basename("c.js"), "c.js", "basename 无斜杠");
    eq(P.basename("a\\b\\c.js"), "c.js", "basename 反斜杠兼容");
    eq(P.formatBytes(500), "500 B", "formatBytes B");
    eq(P.formatBytes(2048), "2.0 KB", "formatBytes KB");
    eq(P.formatBytes(3 * 1024 * 1024), "3.00 MB", "formatBytes MB");
    eq(P.SNIFF_BYTES, 8192, "SNIFF_BYTES=8192");
})();

console.log("\n断言通过: " + pass + ", 失败: " + fail + ", 共 " + (pass + fail));
process.exit(fail === 0 ? 0 : 1);
