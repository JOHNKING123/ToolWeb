/* 代码打包给 LLM（Project to TXT）- 纯前端（零后端、零上传）
 *
 * 纯逻辑层（PTX-CORE）：忽略规则、扩展名白名单、二进制识别（扩展名 + 魔数 + NUL 启发）、
 * 文件树构建/展平/复选框状态传播、合并格式（路径分隔头 + 文件数/字符数/预估 token 统计）、
 * token 估算 —— 无 DOM，可在 Node 下单测：node tests/project_to_txt.test.js
 * DOM 层：文件夹选择（File System Access API showDirectoryPicker，webkitdirectory 回退）、
 * 拖拽投递、文件树渲染、设置面板、一键复制/下载。全部计算在浏览器本地完成，文件内容不出浏览器。
 */
(function () {
"use strict";

/* ================= 纯逻辑层 PTX-CORE ================= */

/* ---------- 常量 ---------- */

/* 默认忽略的目录名（任意层级精确匹配路径段） */
var PTX_DEFAULT_IGNORED_DIRS = [
    "node_modules", ".git", ".idea", ".vscode", "dist", "build", "__pycache__"
];

/* 默认忽略的文件名（精确匹配 basename） */
var PTX_DEFAULT_IGNORED_NAMES = [".DS_Store", "Thumbs.db"];

/* 默认忽略的文件后缀模式：*.lock（如 yarn.lock / Cargo.lock / composer.lock / Gemfile.lock） */
var PTX_DEFAULT_IGNORED_SUFFIXES = [".lock"];

/* 单文件大小上限：1MB，超过则跳过并标注 */
var PTX_MAX_FILE_SIZE = 1024 * 1024;

/* 二进制文件扩展名（小写，不带点） */
var PTX_BINARY_EXTS = {
    /* 图片 */
    "png": 1, "jpg": 1, "jpeg": 1, "gif": 1, "bmp": 1, "webp": 1, "ico": 1,
    "tif": 1, "tiff": 1, "psd": 1, "avif": 1, "heic": 1, "heif": 1,
    /* 音频/视频 */
    "mp3": 1, "wav": 1, "flac": 1, "ogg": 1, "oga": 1, "aac": 1, "m4a": 1,
    "mp4": 1, "avi": 1, "mov": 1, "mkv": 1, "webm": 1, "m4v": 1, "flv": 1,
    /* 字体 */
    "woff": 1, "woff2": 1, "ttf": 1, "otf": 1, "eot": 1,
    /* 压缩包 */
    "zip": 1, "tar": 1, "gz": 1, "tgz": 1, "bz2": 1, "tbz": 1, "rar": 1,
    "7z": 1, "xz": 1, "lz": 1, "zst": 1,
    /* 可执行/库 */
    "exe": 1, "dll": 1, "so": 1, "dylib": 1, "bin": 1, "dat": 1, "class": 1,
    "pyc": 1, "pyo": 1, "o": 1, "a": 1, "lib": 1, "msi": 1, "dmg": 1, "iso": 1,
    "wasm": 1,
    /* 文档（非纯文本） */
    "pdf": 1, "doc": 1, "docx": 1, "xls": 1, "xlsx": 1, "ppt": 1, "pptx": 1,
    "odt": 1, "ods": 1, "odp": 1, "rtf": 1,
    /* 数据库/其他 */
    "sqlite": 1, "sqlite3": 1, "db": 1, "mdb": 1
};

/* 常见二进制魔数（文件头字节序列） */
var PTX_MAGIC_SIGS = [
    { sig: [0x89, 0x50, 0x4E, 0x47], name: "PNG" },
    { sig: [0xFF, 0xD8, 0xFF], name: "JPEG" },
    { sig: [0x47, 0x49, 0x46, 0x38], name: "GIF" },
    { sig: [0x25, 0x50, 0x44, 0x46], name: "PDF" },          /* %PDF */
    { sig: [0x50, 0x4B, 0x03, 0x04], name: "ZIP" },          /* PK\x03\x04 */
    { sig: [0x50, 0x4B, 0x05, 0x06], name: "ZIP" },          /* 空 ZIP */
    { sig: [0x50, 0x4B, 0x07, 0x08], name: "ZIP" },          /* 分卷 ZIP */
    { sig: [0x1F, 0x8B], name: "GZIP" },
    { sig: [0x42, 0x4D], name: "BMP" },                     /* BM */
    { sig: [0x52, 0x49, 0x46, 0x46], name: "RIFF" },        /* WebP/AVI/WAV */
    { sig: [0x00, 0x00, 0x01, 0x00], name: "ICO" },
    { sig: [0x7F, 0x45, 0x4C, 0x46], name: "ELF" },
    { sig: [0x4D, 0x5A], name: "EXE" },                     /* MZ */
    { sig: [0xCA, 0xFE, 0xBA, 0xBE], name: "Mach-O" },
    { sig: [0xCE, 0xFA, 0xED, 0xFE], name: "Mach-O" },
    { sig: [0xCF, 0xFA, 0xED, 0xFE], name: "Mach-O64" },
    { sig: [0xFD, 0x37, 0x7A, 0x58, 0x5A, 0x00], name: "XZ" },
    { sig: [0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C], name: "7z" },
    { sig: [0x52, 0x61, 0x72, 0x21], name: "RAR" },          /* Rar! */
    { sig: [0xD0, 0xCF, 0x11, 0xE0], name: "OLE" },          /* doc/xls */
    { sig: [0x49, 0x44, 0x33], name: "MP3" },               /* ID3 */
    { sig: [0x66, 0x74, 0x79, 0x70], name: "MP4", offset: 4 }/* ....ftyp */
];

/* 二进制嗅探读取的头部字节数 */
var PTX_SNIFF_BYTES = 8192;

/* ---------- 小工具 ---------- */

function ptxBasename(path) {
    var p = String(path).replace(/\\/g, "/");
    var i = p.lastIndexOf("/");
    return i === -1 ? p : p.slice(i + 1);
}

function ptxExt(name) {
    var b = ptxBasename(name);
    var i = b.lastIndexOf(".");
    /* 点在首位（如 .gitignore）或无点 → 无扩展名 */
    if (i <= 0) return "";
    return b.slice(i + 1).toLowerCase();
}

function ptxSegments(path) {
    return String(path).replace(/\\/g, "/").split("/").filter(function (s) { return s.length > 0; });
}

/* ---------- 忽略规则 ---------- */

/* 解析用户输入的忽略目录（逗号/换行/空格分隔），返回去重点后的数组 */
function parseIgnoredDirs(text) {
    var out = [], seen = {}, i, t;
    var parts = String(text || "").split(/[\s,;，；\n]+/);
    for (i = 0; i < parts.length; i++) {
        t = parts[i].replace(/^\/+|\/+$/g, "").toLowerCase();
        if (t && !seen[t]) { seen[t] = 1; out.push(t); }
    }
    return out;
}

/* 路径是否命中忽略规则：任一路径段命中忽略目录 / basename 命中忽略文件名 / 后缀命中 *.lock */
function shouldIgnorePath(relPath, ignoredDirs, ignoredNames, ignoredSuffixes) {
    var segs = ptxSegments(relPath);
    if (segs.length === 0) return { ignored: false, reason: "" };
    var dirs = ignoredDirs || PTX_DEFAULT_IGNORED_DIRS;
    var names = ignoredNames || PTX_DEFAULT_IGNORED_NAMES;
    var suffixes = ignoredSuffixes || PTX_DEFAULT_IGNORED_SUFFIXES;
    var i, j, seg, base = segs[segs.length - 1], lowBase = base.toLowerCase();
    for (i = 0; i < segs.length; i++) {
        seg = segs[i].toLowerCase();
        for (j = 0; j < dirs.length; j++) {
            if (seg === String(dirs[j]).toLowerCase()) {
                return { ignored: true, reason: "忽略目录 " + segs[i] };
            }
        }
    }
    for (j = 0; j < names.length; j++) {
        if (lowBase === String(names[j]).toLowerCase()) {
            return { ignored: true, reason: "忽略文件 " + base };
        }
    }
    for (j = 0; j < suffixes.length; j++) {
        var suf = String(suffixes[j]).toLowerCase();
        if (suf && lowBase.slice(-suf.length) === suf) {
            return { ignored: true, reason: "忽略后缀 *" + suffixes[j] };
        }
    }
    return { ignored: false, reason: "" };
}

/* ---------- 扩展名白名单 ---------- */

/* 解析白名单输入：".js, ts;vue" → ["js","ts","vue"]（小写、去重、去点） */
function parseWhitelist(text) {
    var out = [], seen = {}, i, t;
    var parts = String(text || "").split(/[\s,;，；\n]+/);
    for (i = 0; i < parts.length; i++) {
        t = parts[i].replace(/^\.+/, "").toLowerCase();
        if (t && !seen[t]) { seen[t] = 1; out.push(t); }
    }
    return out;
}

/* 白名单为空 → 全部通过；否则仅扩展名命中者通过（无扩展名文件不通过） */
function matchWhitelist(relPath, whitelist) {
    if (!whitelist || whitelist.length === 0) return true;
    var e = ptxExt(relPath);
    if (!e) return false;
    for (var i = 0; i < whitelist.length; i++) {
        if (e === whitelist[i]) return true;
    }
    return false;
}

/* ---------- 二进制识别 ---------- */

function matchMagic(head, sigDef) {
    var sig = sigDef.sig, off = sigDef.offset || 0, i;
    if (!head || head.length < off + sig.length) return false;
    for (i = 0; i < sig.length; i++) {
        if (head[off + i] !== sig[i]) return false;
    }
    return true;
}

function hasUtf16Bom(head) {
    if (!head || head.length < 2) return false;
    return (head[0] === 0xFF && head[1] === 0xFE) ||
           (head[0] === 0xFE && head[1] === 0xFF);
}

/* headBytes: 数组 / Uint8Array / null（null 时仅按扩展名判断） */
function isBinaryFile(name, headBytes) {
    var i, s;
    if (headBytes && headBytes.length > 0) {
        for (i = 0; i < PTX_MAGIC_SIGS.length; i++) {
            s = PTX_MAGIC_SIGS[i];
            if (matchMagic(headBytes, s)) {
                return { binary: true, reason: "magic", detail: s.name };
            }
        }
        /* NUL 字节启发式：UTF-16 BOM 开头的文件跳过（其 NUL 为编码所致） */
        if (!hasUtf16Bom(headBytes)) {
            for (i = 0; i < headBytes.length; i++) {
                if (headBytes[i] === 0) {
                    return { binary: true, reason: "nul", detail: "含 NUL 字节" };
                }
            }
        }
    }
    var e = ptxExt(name);
    if (e && PTX_BINARY_EXTS[e]) {
        return { binary: true, reason: "ext", detail: "." + e };
    }
    return { binary: false, reason: "", detail: "" };
}

/* ---------- 文件分类 ---------- */

/* status: include（纳入）/ ignored（规则忽略）/ binary（二进制跳过）/ too_large（超 1MB）
 * opts: {ignoredDirs, ignoredNames, ignoredSuffixes, whitelist, headBytes} */
function classifyFile(relPath, size, opts) {
    opts = opts || {};
    var ig = shouldIgnorePath(relPath, opts.ignoredDirs, opts.ignoredNames, opts.ignoredSuffixes);
    if (ig.ignored) return { status: "ignored", reason: ig.reason };
    if (typeof size === "number" && size > PTX_MAX_FILE_SIZE) {
        return { status: "too_large", reason: "超过 1MB 上限" };
    }
    var b = isBinaryFile(relPath, opts.headBytes);
    if (b.binary) {
        return { status: "binary", reason: "二进制跳过(" + (b.detail || b.reason) + ")" };
    }
    if (!matchWhitelist(relPath, opts.whitelist)) {
        return { status: "ignored", reason: "不在扩展名白名单" };
    }
    return { status: "include", reason: "" };
}

/* ---------- 文件树 ---------- */

/* files: [{path, size, status, reason}] → 树根节点
 * 节点：{name, path, type:'dir'|'file', children, checked, indeterminate, status, reason, size, parent} */
function buildTree(files) {
    var root = { name: "", path: "", type: "dir", children: [], checked: true,
                 indeterminate: false, status: "dir", reason: "", size: 0, parent: null };
    var dirMap = { "": root };
    function ensureDir(dirPath) {
        if (dirMap[dirPath]) return dirMap[dirPath];
        var segs = ptxSegments(dirPath);
        var parentPath = segs.slice(0, -1).join("/");
        var parent = ensureDir(parentPath);
        var node = { name: segs[segs.length - 1], path: dirPath, type: "dir",
                     children: [], checked: true, indeterminate: false,
                     status: "dir", reason: "", size: 0, parent: parent };
        parent.children.push(node);
        dirMap[dirPath] = node;
        return node;
    }
    var i, f, segs, parentPath, parent, node;
    for (i = 0; i < files.length; i++) {
        f = files[i];
        segs = ptxSegments(f.path);
        if (segs.length === 0) continue;
        parentPath = segs.slice(0, -1).join("/");
        parent = ensureDir(parentPath);
        node = { name: segs[segs.length - 1], path: f.path, type: "file",
                 children: null, checked: f.status === "include",
                 indeterminate: false, status: f.status, reason: f.reason || "",
                 size: f.size || 0, parent: parent };
        parent.children.push(node);
    }
    sortTree(root);
    refreshTreeState(root);
    return root;
}

function sortTree(node) {
    var i;
    node.children.sort(function (a, b) {
        if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
        return a.name.toLowerCase() < b.name.toLowerCase() ? -1 :
               (a.name.toLowerCase() > b.name.toLowerCase() ? 1 : 0);
    });
    for (i = 0; i < node.children.length; i++) {
        if (node.children[i].type === "dir") sortTree(node.children[i]);
    }
}

/* 自底向上刷新 checked / indeterminate（叶子以自身 checked 为准；目录由子节点汇总） */
function refreshTreeState(node) {
    var i, c, allChecked = true, anyChecked = false;
    if (node.type === "file") return node.checked;
    for (i = 0; i < node.children.length; i++) {
        c = node.children[i];
        if (c.type === "dir") refreshTreeState(c);
        if (c.indeterminate) { allChecked = false; anyChecked = true; }
        else if (c.checked) { anyChecked = true; }
        else { allChecked = false; }
    }
    if (node.children.length === 0) { node.checked = false; node.indeterminate = false; return false; }
    node.checked = allChecked;
    node.indeterminate = !allChecked && anyChecked;
    return node.checked;
}

/* 设置节点（含全部后代）选中态，然后向上刷新祖先；
 * 不可纳入的文件（ignored/binary/too_large）永远保持不选 */
function setChecked(node, checked) {
    var i;
    if (node.type === "file" && node.status !== "include") {
        node.checked = false;
    } else {
        node.checked = checked;
    }
    node.indeterminate = false;
    if (node.type === "dir") {
        for (i = 0; i < node.children.length; i++) setChecked(node.children[i], checked);
    }
    var p = node.parent;
    while (p) { refreshTreeState(p); p = p.parent; }
}

/* 全选 / 全不选（仅对可纳入文件有效：ignored/binary/too_large 的文件保持不选） */
function setCheckedAll(root, checked) {
    (function walk(n) {
        var i;
        if (n.type === "file") {
            n.checked = checked && n.status === "include";
            n.indeterminate = false;
        } else {
            for (i = 0; i < n.children.length; i++) walk(n.children[i]);
        }
    })(root);
    refreshTreeState(root);
}

/* 深度优先展平（目录优先、同级按名排序，根节点本身不计入） */
function flattenTree(root) {
    var out = [];
    (function walk(n) {
        var i;
        for (i = 0; i < n.children.length; i++) {
            out.push(n.children[i]);
            if (n.children[i].type === "dir") walk(n.children[i]);
        }
    })(root);
    return out;
}

function countTree(root) {
    var flat = flattenTree(root), i, dirs = 0, files = 0, sel = 0, skipped = 0;
    for (i = 0; i < flat.length; i++) {
        if (flat[i].type === "dir") { dirs++; continue; }
        files++;
        if (flat[i].status !== "include") { skipped++; continue; }
        if (flat[i].checked) sel++;
    }
    return { dirs: dirs, files: files, selected: sel, skipped: skipped };
}

/* 取出被勾选且可纳入的文件节点 */
function getSelectedFiles(root) {
    var flat = flattenTree(root), out = [], i;
    for (i = 0; i < flat.length; i++) {
        if (flat[i].type === "file" && flat[i].status === "include" && flat[i].checked) {
            out.push(flat[i]);
        }
    }
    return out;
}

/* ---------- token 估算 ---------- */

/* 启发式：ASCII 约 4 字符/token，CJK（中日韩表意文字/假名/谚文/全角）约 1.5 字符/token */
function isCjkChar(s, i) {
    var c = s.charCodeAt(i);
    if (c >= 0xD800 && c <= 0xDBFF) return true; /* 代理对高位：扩展 B 区汉字，计 1 个 */
    return (c >= 0x4E00 && c <= 0x9FFF) || (c >= 0x3400 && c <= 0x4DBF) ||
           (c >= 0x3040 && c <= 0x30FF) || (c >= 0xAC00 && c <= 0xD7AF) ||
           (c >= 0xFF00 && c <= 0xFFEF);
}

function estimateTokens(text) {
    var s = String(text == null ? "" : text);
    if (s.length === 0) return 0;
    var cjk = 0, other = 0, i, c, lo;
    for (i = 0; i < s.length; i++) {
        c = s.charCodeAt(i);
        if (c >= 0xD800 && c <= 0xDBFF && i + 1 < s.length) {
            lo = s.charCodeAt(i + 1);
            if (lo >= 0xDC00 && lo <= 0xDFFF) { cjk++; i++; continue; }
        }
        if (isCjkChar(s, i)) cjk++; else other++;
    }
    return Math.max(1, Math.ceil(other / 4 + cjk / 1.5));
}

/* ---------- 合并格式 ---------- */

var PTX_SEP = "================================================================================";

function formatBytes(n) {
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
    return (n / 1024 / 1024).toFixed(2) + " MB";
}

function ptxNow() {
    var d = new Date();
    function p(n) { return (n < 10 ? "0" : "") + n; }
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " +
           p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
}

/* files: [{path, content}] → 合并文本（含汇总头 + 每文件路径分隔头） */
function mergeFiles(files, opts) {
    opts = opts || {};
    var list = files || [], i, f, content, totalChars = 0;
    var bodies = [];
    for (i = 0; i < list.length; i++) {
        f = list[i];
        content = String(f.content == null ? "" : f.content);
        totalChars += content.length;
        bodies.push(PTX_SEP + "\nFILE: " + f.path + "（" + content.length + " 字符）\n" +
                    PTX_SEP + "\n" + content);
    }
    var head = PTX_SEP + "\n" +
        "代码打包结果（Project to TXT）\n" +
        "文件数：" + list.length + "\n" +
        "总字符数：" + totalChars + "\n" +
        "预估 Token：约 " + estimateTokens(bodies.join("\n\n")) + "\n" +
        "生成时间：" + (opts.now || ptxNow()) + "\n" +
        PTX_SEP;
    if (list.length === 0) return head + "\n\n（未选择任何文件）\n";
    return head + "\n\n" + bodies.join("\n\n") + "\n";
}

/* ---------- 导出 ---------- */

var PTX_CORE = {
    DEFAULT_IGNORED_DIRS: PTX_DEFAULT_IGNORED_DIRS,
    DEFAULT_IGNORED_NAMES: PTX_DEFAULT_IGNORED_NAMES,
    DEFAULT_IGNORED_SUFFIXES: PTX_DEFAULT_IGNORED_SUFFIXES,
    MAX_FILE_SIZE: PTX_MAX_FILE_SIZE,
    SNIFF_BYTES: PTX_SNIFF_BYTES,
    BINARY_EXTS: PTX_BINARY_EXTS,
    parseIgnoredDirs: parseIgnoredDirs,
    shouldIgnorePath: shouldIgnorePath,
    parseWhitelist: parseWhitelist,
    matchWhitelist: matchWhitelist,
    isBinaryFile: isBinaryFile,
    classifyFile: classifyFile,
    buildTree: buildTree,
    flattenTree: flattenTree,
    setChecked: setChecked,
    setCheckedAll: setCheckedAll,
    refreshTreeState: refreshTreeState,
    countTree: countTree,
    getSelectedFiles: getSelectedFiles,
    estimateTokens: estimateTokens,
    mergeFiles: mergeFiles,
    formatBytes: formatBytes,
    basename: ptxBasename,
    ext: ptxExt
};

if (typeof module !== "undefined" && module.exports) {
    module.exports = PTX_CORE;
} else if (typeof window !== "undefined") {
    window.PTX = PTX_CORE;
}

/* ================= DOM 层（仅浏览器） ================= */

if (typeof document !== "undefined" && !(typeof module !== "undefined" && module.exports)) {

(function () {

var $ = function (id) { return document.getElementById(id); };

/* 条目：{path, size, getFile:()=>Promise<File>, head:Uint8Array|null} */
var entries = [];       /* 本次选择的文件夹内全部文件条目 */
var treeRoot = null;    /* 文件树根 */
var rootName = "";      /* 文件夹根名（用于下载文件名） */
var lastOutput = "";    /* 最近一次合并文本 */
var collapsed = {};     /* path → true 表示目录折叠 */

function toast(msg) {
    var t = $("ptx-toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(t._tm);
    t._tm = setTimeout(function () { t.classList.remove("show"); }, 2200);
}

function readSettings() {
    return {
        ignoredDirs: parseIgnoredDirs($("ptx-ignore-dirs").value),
        whitelist: parseWhitelist($("ptx-whitelist").value)
    };
}

/* ---------- 文件夹枚举 ---------- */

/* 路径 A：File System Access API */
function pickWithFSA() {
    if (!window.showDirectoryPicker) return Promise.reject(new Error("当前浏览器不支持 showDirectoryPicker"));
    return window.showDirectoryPicker({ mode: "read" }).then(function (dirHandle) {
        rootName = dirHandle.name || "project";
        entries = [];
        return traverseHandle(dirHandle, "").then(function () { return afterScan(); });
    });
}

function traverseHandle(handle, base) {
    /* FileSystemDirectoryHandle 为异步可迭代：for await (const [name, h] of handle) */
    var jobs = [];
    function pushFile(h, rel) {
        jobs.push(h.getFile().then(function (f) {
            entries.push({ path: rel, size: f.size, getFile: function () { return Promise.resolve(f); }, head: null });
        }));
    }
    return (async function () {
        for await (var kv of handle) {
            var name = kv[0], h = kv[1];
            var rel = base ? base + "/" + name : name;
            if (h.kind === "directory") {
                jobs.push(traverseHandle(h, rel));
            } else {
                pushFile(h, rel);
            }
        }
        await Promise.all(jobs);
    })();
}

/* 路径 B：<input webkitdirectory> 回退 */
function pickWithInput() {
    $("ptx-file-input").click();
}

function handleInputFiles(input) {
    var files = input.files;
    if (!files || files.length === 0) { toast("未选择文件"); return; }
    entries = [];
    var i, f, rel;
    var first = files[0].webkitRelativePath || files[0].name || "";
    rootName = (first.split("/")[0]) || "project";
    for (i = 0; i < files.length; i++) {
        f = files[i];
        rel = f.webkitRelativePath || f.name;
        /* 去掉根目录前缀，统一为相对路径 */
        var segs = rel.split("/");
        if (segs.length > 1) segs = segs.slice(1);
        rel = segs.join("/");
        (function (ff, rp) {
            entries.push({ path: rp, size: ff.size, getFile: function () { return Promise.resolve(ff); }, head: null });
        })(f, rel);
    }
    input.value = "";
    afterScan();
}

/* 路径 C：拖拽（优先 FileSystemHandle，降级 webkitGetAsEntry） */
function handleDrop(dt) {
    var items = dt.items;
    if (!items || items.length === 0) {
        toast("请拖入整个文件夹，而非零散文件");
        return;
    }
    var jobs = [];
    entries = [];
    rootName = "project";
    var k, it;
    for (k = 0; k < items.length; k++) {
        it = items[k];
        if (it.kind !== "file") continue;
        (function (item) {
            if (typeof item.getAsFileSystemHandle === "function") {
                jobs.push(item.getAsFileSystemHandle().then(function (h) {
                    if (!h) return null;
                    if (h.kind === "directory") {
                        if (rootName === "project") rootName = h.name || "project";
                        return traverseHandle(h, "");
                    }
                    return h.getFile().then(function (f) {
                        entries.push({ path: f.name, size: f.size, getFile: function () { return Promise.resolve(f); }, head: null });
                    });
                }));
            } else if (typeof item.webkitGetAsEntry === "function") {
                var en = item.webkitGetAsEntry();
                if (en) {
                    if (!en.isDirectory && rootName === "project") rootName = "dropped-files";
                    if (en.isDirectory && rootName === "project") rootName = en.name || "project";
                    jobs.push(traverseEntry(en, ""));
                }
            }
        })(it);
    }
    Promise.all(jobs).then(function () {
        if (entries.length === 0) { toast("未能读取拖入内容，请改用「选择文件夹」按钮"); return; }
        afterScan();
    }).catch(function (err) {
        toast("读取失败：" + (err && err.message || err));
    });
}

function traverseEntry(entry, base) {
    var rel = base ? base + "/" + entry.name : entry.name;
    if (entry.isDirectory) {
        var reader = entry.createReader();
        var all = [];
        return new Promise(function (resolve, reject) {
            (function readBatch() {
                reader.readEntries(function (es) {
                    if (!es.length) {
                        var seq = Promise.resolve();
                        all.forEach(function (e) { seq = seq.then(function () { return traverseEntry(e, rel); }); });
                        seq.then(resolve, reject);
                        return;
                    }
                    for (var i = 0; i < es.length; i++) all.push(es[i]);
                    readBatch();
                }, reject);
            })();
        });
    }
    return new Promise(function (resolve) {
        entry.file(function (f) {
            entries.push({ path: rel, size: f.size, getFile: function () { return Promise.resolve(f); }, head: null });
            resolve();
        }, function () { resolve(); });
    });
}

/* ---------- 扫描：读头部嗅探 → 分类 → 建树 → 渲染 ---------- */

function sniffHead(entry) {
    /* 只读前 SNIFF_BYTES 做魔数/NUL 嗅探，不读全文 */
    return entry.getFile().then(function (f) {
        var blob = f.slice(0, Math.min(PTX_SNIFF_BYTES, f.size));
        if (blob.arrayBuffer) {
            return blob.arrayBuffer().then(function (ab) { return new Uint8Array(ab); });
        }
        return new Promise(function (resolve) {
            var fr = new FileReader();
            fr.onload = function () { resolve(new Uint8Array(fr.result)); };
            fr.onerror = function () { resolve(null); };
            fr.readAsArrayBuffer(blob);
        });
    }).catch(function () { return null; });
}

function afterScan() {
    var st = readSettings();
    $("ptx-scan-status").textContent = "正在分析 " + entries.length + " 个文件…";
    var i = 0, classified = [];
    /* 分批嗅探，避免一次性并发过高 */
    function batch() {
        var jobs = [], j, e;
        for (j = 0; j < 40 && i < entries.length; j++, i++) {
            e = entries[i];
            (function (en) {
                jobs.push(sniffHead(en).then(function (head) {
                    en.head = head;
                    var c = classifyFile(en.path, en.size, {
                        ignoredDirs: st.ignoredDirs,
                        whitelist: st.whitelist,
                        headBytes: head
                    });
                    classified.push({ path: en.path, size: en.size, status: c.status, reason: c.reason, entry: en });
                }));
            })(e);
        }
        return Promise.all(jobs).then(function () {
            $("ptx-scan-status").textContent = "正在分析 " + i + " / " + entries.length + " 个文件…";
            if (i < entries.length) return batch();
            return null;
        });
    }
    batch().then(function () {
        classified.sort(function (a, b) { return a.path < b.path ? -1 : (a.path > b.path ? 1 : 0); });
        treeRoot = buildTree(classified);
        /* 把 entry 引用挂回文件节点，供生成阶段读取全文 */
        var byPath = {};
        classified.forEach(function (c) { byPath[c.path] = c.entry; });
        flattenTree(treeRoot).forEach(function (n) {
            if (n.type === "file" && byPath[n.path]) n.entry = byPath[n.path];
        });
        collapsed = {};
        renderTree();
        updateScanStats();
        $("ptx-generate-btn").disabled = false;
        toast("扫描完成：共 " + entries.length + " 个文件");
    });
}

/* 设置变更 → 用已缓存的 head 重新分类 */
function reclassify() {
    if (!entries.length || !treeRoot) return;
    var st = readSettings();
    var classified = entries.map(function (en) {
        var c = classifyFile(en.path, en.size, {
            ignoredDirs: st.ignoredDirs, whitelist: st.whitelist, headBytes: en.head
        });
        return { path: en.path, size: en.size, status: c.status, reason: c.reason, entry: en };
    });
    classified.sort(function (a, b) { return a.path < b.path ? -1 : (a.path > b.path ? 1 : 0); });
    /* 保留用户已有的勾选状态 */
    var prevChecked = {};
    flattenTree(treeRoot).forEach(function (n) {
        if (n.type === "file") prevChecked[n.path] = n.checked;
    });
    treeRoot = buildTree(classified);
    var byPath = {};
    classified.forEach(function (c) { byPath[c.path] = c.entry; });
    flattenTree(treeRoot).forEach(function (n) {
        if (n.type === "file") {
            if (byPath[n.path]) n.entry = byPath[n.path];
            if (prevChecked.hasOwnProperty(n.path)) {
                n.checked = prevChecked[n.path] && n.status === "include";
            }
        }
    });
    refreshTreeState(treeRoot);
    renderTree();
    updateScanStats();
    toast("已按新设置重新分类");
}

/* ---------- 文件树渲染 ---------- */

var PTX_STATUS_LABEL = {
    include: "", ignored: "忽略", binary: "二进制跳过", too_large: "超 1MB 跳过", dir: ""
};
var PTX_STATUS_CLS = {
    include: "", ignored: "ptx-tag-ignore", binary: "ptx-tag-binary", too_large: "ptx-tag-large", dir: ""
};

function escHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
        .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderTree() {
    var box = $("ptx-tree");
    if (!treeRoot || flattenTree(treeRoot).length === 0) {
        box.innerHTML = '<div class="ptx-empty">尚未选择文件夹。请把项目文件夹拖到上方虚线框，或点击按钮选择。</div>';
        return;
    }
    var html = [];
    (function walk(node, depth) {
        var i, pad = depth * 1.3;
        for (i = 0; i < node.children.length; i++) {
            (function (n) {
                var tag = n.type === "file" && PTX_STATUS_LABEL[n.status] ?
                    '<span class="ptx-tag ' + PTX_STATUS_CLS[n.status] + '">' + escHtml(PTX_STATUS_LABEL[n.status]) + "</span>" : "";
                var dis = (n.type === "file" && n.status !== "include") ? " disabled" : "";
                var icon = n.type === "dir" ? (collapsed[n.path] ? "folder" : "folder_open") : "description";
                var indAttr = n.indeterminate ? ' data-ind="1"' : "";
                var row = '<div class="ptx-node" style="padding-left:' + pad + 'rem"' + indAttr + ">" +
                    (n.type === "dir"
                        ? '<span class="ptx-caret">' + (collapsed[n.path] ? "▶" : "▾") + "</span>"
                        : '<span class="ptx-caret ptx-caret-leaf"></span>') +
                    '<input type="checkbox" class="ptx-check" data-path="' + escHtml(n.path) + '"' +
                    (n.checked ? " checked" : "") + dis + ">" +
                    '<i class="material-icons ptx-ico">' + icon + "</i>" +
                    '<span class="ptx-name" title="' + escHtml(n.path || n.name) + '">' + escHtml(n.name) + "</span>" +
                    (n.type === "file" ? '<span class="ptx-size">' + formatBytes(n.size) + "</span>" : "") +
                    tag +
                    (n.reason && n.type === "file" ? '<span class="ptx-reason">' + escHtml(n.reason) + "</span>" : "") +
                    "</div>";
                html.push(row);
                if (n.type === "dir" && !collapsed[n.path]) walk(n, depth + 1);
            })(node.children[i]);
        }
    })(treeRoot, 0);
    box.innerHTML = html.join("");
    var checks = box.querySelectorAll(".ptx-check");
    for (var k = 0; k < checks.length; k++) {
        (function (cb) {
            if (cb.parentNode.getAttribute("data-ind") === "1") cb.indeterminate = true;
            cb.addEventListener("change", function () {
                var node = findNode(cb.getAttribute("data-path"));
                if (!node) return;
                setChecked(node, cb.checked);
                renderTree();
                updateScanStats();
            });
        })(checks[k]);
    }
    var carets = box.querySelectorAll(".ptx-node");
    for (var m = 0; m < carets.length; m++) {
        (function (row) {
            var caret = row.querySelector(".ptx-caret");
            if (!caret || caret.classList.contains("ptx-caret-leaf")) return;
            caret.style.cursor = "pointer";
            var cb = row.querySelector(".ptx-check");
            var toggle = function () {
                var p = cb && cb.getAttribute("data-path");
                if (p == null) return;
                collapsed[p] = !collapsed[p];
                renderTree();
            };
            caret.addEventListener("click", toggle);
            var nm = row.querySelector(".ptx-name");
            if (nm) nm.addEventListener("dblclick", toggle);
        })(carets[m]);
    }
}

function findNode(path) {
    var flat = flattenTree(treeRoot), i;
    if (path === "") return treeRoot;
    for (i = 0; i < flat.length; i++) {
        if (flat[i].path === path) return flat[i];
    }
    return null;
}

function updateScanStats() {
    if (!treeRoot) return;
    var c = countTree(treeRoot);
    $("ptx-stat-total").textContent = c.files;
    $("ptx-stat-sel").textContent = c.selected;
    $("ptx-stat-skip").textContent = c.skipped;
    $("ptx-stats").style.display = "flex";
}

/* ---------- 生成 / 复制 / 下载 ---------- */

function generate() {
    if (!treeRoot) { toast("请先选择文件夹"); return; }
    var sel = getSelectedFiles(treeRoot);
    if (sel.length === 0) { toast("没有可打包的文件（均被忽略/跳过或未勾选）"); return; }
    var btn = $("ptx-generate-btn");
    btn.disabled = true;
    $("ptx-gen-status").textContent = "正在读取文件内容… 0 / " + sel.length;
    var files = [], i = 0;
    function step() {
        if (i >= sel.length) {
            lastOutput = mergeFiles(files, {});
            showOutput();
            btn.disabled = false;
            $("ptx-gen-status").textContent = "";
            return;
        }
        var node = sel[i];
        var en = node.entry || findEntry(node.path);
        var rd = en ? en.getFile().then(function (f) { return readAsText(f); })
                   : Promise.resolve("");
        rd.then(function (text) {
            files.push({ path: node.path, content: text });
            i++;
            if (i % 10 === 0) $("ptx-gen-status").textContent = "正在读取文件内容… " + i + " / " + sel.length;
            /* 让出主线程，保持 UI 响应 */
            setTimeout(step, 0);
        }).catch(function () {
            files.push({ path: node.path, content: "【读取失败，已跳过】" });
            i++;
            setTimeout(step, 0);
        });
    }
    step();
}

function findEntry(path) {
    for (var i = 0; i < entries.length; i++) {
        if (entries[i].path === path) return entries[i];
    }
    return null;
}

function readAsText(file) {
    if (file.text) return file.text();
    return new Promise(function (resolve, reject) {
        var fr = new FileReader();
        fr.onload = function () { resolve(String(fr.result || "")); };
        fr.onerror = function () { reject(fr.error); };
        fr.readAsText(file);
    });
}

function showOutput() {
    var chars = lastOutput.length;
    var tokens = estimateTokens(lastOutput);
    var n = getSelectedFiles(treeRoot).length;
    $("ptx-out-files").textContent = n;
    $("ptx-out-chars").textContent = chars.toLocaleString("en-US");
    $("ptx-out-tokens").textContent = "约 " + tokens.toLocaleString("en-US");
    $("ptx-out-stats").style.display = "flex";
    var prev = $("ptx-preview");
    prev.textContent = lastOutput.length > 200000 ? lastOutput.slice(0, 200000) + "\n\n…（预览截断，完整内容请复制或下载）" : lastOutput;
    $("ptx-copy-btn").disabled = false;
    $("ptx-dl-btn").disabled = false;
    var panel = $("ptx-output-panel");
    if (panel && panel.scrollIntoView) panel.scrollIntoView({ behavior: "smooth", block: "start" });
    toast("打包完成：" + n + " 个文件");
}

function copyOutput() {
    if (!lastOutput) return;
    function done() { toast("全文已复制到剪贴板"); }
    function fallback() {
        var ta = document.createElement("textarea");
        ta.value = lastOutput;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand("copy"); done(); }
        catch (e) { toast("复制失败，请手动选择预览文本复制"); }
        document.body.removeChild(ta);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(lastOutput).then(done, fallback);
    } else {
        fallback();
    }
}

function downloadOutput() {
    if (!lastOutput) return;
    var blob = new Blob(["﻿" + lastOutput], { type: "text/plain;charset=utf-8" });
    var a = document.createElement("a");
    var safe = (rootName || "project").replace(/[\\/:*?"<>|]/g, "_");
    a.href = URL.createObjectURL(blob);
    a.download = safe + "-project.txt";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
        URL.revokeObjectURL(a.href);
        document.body.removeChild(a);
    }, 500);
    toast("已开始下载 " + a.download);
}

/* ---------- 初始化 ---------- */

function init() {
    /* 默认忽略目录回填 */
    $("ptx-ignore-dirs").value = PTX_DEFAULT_IGNORED_DIRS.join(",");
    renderTree();

    $("ptx-pick-fsa").addEventListener("click", function () {
        if (!window.showDirectoryPicker) {
            toast("当前浏览器不支持系统文件夹选择器，已为你打开兼容模式");
            pickWithInput();
            return;
        }
        pickWithFSA().catch(function (err) {
            if (err && (err.name === "AbortError" || err.code === 20)) return; /* 用户取消 */
            toast("选择器不可用，已切换兼容模式");
            pickWithInput();
        });
    });
    $("ptx-pick-input").addEventListener("click", pickWithInput);
    $("ptx-file-input").addEventListener("change", function () { handleInputFiles(this); });
    $("ptx-reclassify").addEventListener("click", reclassify);

    $("ptx-select-all").addEventListener("click", function () {
        if (!treeRoot) return;
        setCheckedAll(treeRoot, true);
        renderTree(); updateScanStats();
    });
    $("ptx-select-none").addEventListener("click", function () {
        if (!treeRoot) return;
        setCheckedAll(treeRoot, false);
        renderTree(); updateScanStats();
    });

    var dz = $("ptx-dropzone");
    ["dragenter", "dragover"].forEach(function (ev) {
        dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add("ptx-drag"); });
    });
    ["dragleave", "drop"].forEach(function (ev) {
        dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove("ptx-drag"); });
    });
    dz.addEventListener("drop", function (e) { handleDrop(e.dataTransfer); });
    dz.addEventListener("click", function (e) {
        if (e.target.closest("button")) return;
        $("ptx-pick-fsa").click();
    });
    dz.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("ptx-pick-fsa").click(); }
    });

    $("ptx-generate-btn").addEventListener("click", generate);
    $("ptx-copy-btn").addEventListener("click", copyOutput);
    $("ptx-dl-btn").addEventListener("click", downloadOutput);
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
} else {
    init();
}

})();

}
})();
