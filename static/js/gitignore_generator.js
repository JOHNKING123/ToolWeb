/* .gitignore 生成器：纯前端、零依赖、零后端、零上传
 * 内置官方 github/gitignore 主流模板子集，离线可用。
 * 合并规则：语言 → 框架 → 系统/IDE 顺序拼接，重复行只保留首次出现，
 * 模板块之间以 `# ===== <模板名> =====` 注释分隔。
 * 纯逻辑部分（模板库 + 合并引擎）支持 node 下单元测试：
 *   node tests/gitignore_generator.test.js
 */
(function () {
"use strict";

/* ---------- 分组顺序（决定拼接顺序） ---------- */
var GI_GROUP_ORDER = ["lang", "framework", "env"];
var GI_GROUP_NAMES = {
    lang: "编程语言",
    framework: "框架 / 平台",
    env: "系统 / IDE / 编辑器"
};

/* ---------- 模板库 ---------- */
var GI_TEMPLATES = [
/* ===== 编程语言 ===== */
{id: "node", name: "Node", group: "lang", lines: [
"# 日志与诊断",
"logs",
"*.log",
"npm-debug.log*",
"yarn-debug.log*",
"yarn-error.log*",
"lerna-debug.log*",
"report.[0-9]*.[0-9]*.[0-9]*.[0-9]*.json",
"",
"# 运行时数据",
"pids",
"*.pid",
"*.seed",
"*.pid.lock",
"",
"# 测试覆盖率",
"coverage/",
"*.lcov",
".nyc_output",
"",
"# 依赖目录",
"node_modules/",
"jspm_packages/",
"bower_components",
"",
"# TypeScript 构建缓存",
"*.tsbuildinfo",
"",
"# 工具缓存",
".npm",
".eslintcache",
".stylelintcache",
".cache",
".parcel-cache",
"",
"# dotenv 环境变量文件",
".env",
".env.development.local",
".env.test.local",
".env.production.local",
".env.local",
"",
"# 打包产物",
"*.tgz",
".serverless/"
]},
{id: "python", name: "Python", group: "lang", lines: [
"# 字节码与 C 扩展",
"__pycache__/",
"*.py[cod]",
"*$py.class",
"*.so",
"",
"# 打包分发",
".Python",
"build/",
"dist/",
"downloads/",
"eggs/",
".eggs/",
"lib/",
"lib64/",
"parts/",
"sdist/",
"var/",
"wheels/",
"share/python-wheels/",
"*.egg-info/",
".installed.cfg",
"*.egg",
"MANIFEST",
"*.manifest",
"*.spec",
"",
"# pip 安装日志",
"pip-log.txt",
"pip-delete-this-directory.txt",
"",
"# 测试与覆盖率",
"htmlcov/",
".tox/",
".nox/",
".coverage",
".coverage.*",
".cache",
"nosetests.xml",
"coverage.xml",
"*.cover",
".hypothesis/",
".pytest_cache/",
"cover/",
"",
"# 文档构建",
"docs/_build/",
"/site",
"",
"# 翻译文件",
"*.mo",
"*.pot",
"",
"# Jupyter / IPython",
".ipynb_checkpoints",
"profile_default/",
"ipython_config.py",
"",
"# 虚拟环境",
".env",
".venv",
"env/",
"venv/",
"ENV/",
"env.bak/",
"venv.bak/",
"",
"# 依赖锁（pipenv / poetry / pdm）",
"Pipfile.lock",
"poetry.lock",
".pdm.toml",
".pdm-python",
".pdm-build/",
"__pypackages__/",
"",
"# pyenv",
".python-version",
"",
"# 类型检查缓存",
".mypy_cache/",
".dmypy.json",
"dmypy.json",
".pyre/",
".pytype/",
"",
"# Celery",
"celerybeat-schedule",
"celerybeat.pid",
"",
"# Scrapy / PyBuilder",
".scrapy",
".pybuilder/",
"target/"
]},
{id: "java", name: "Java", group: "lang", lines: [
"# 编译产物",
"*.class",
"",
"# 日志",
"*.log",
"",
"# 打包文件",
"*.jar",
"*.war",
"*.nar",
"*.ear",
"*.zip",
"*.tar.gz",
"*.rar",
"",
"# JVM 崩溃日志",
"hs_err_pid*",
"replay_pid*",
"",
"# BlueJ",
"*.ctxt",
"",
"# Mobile Tools for Java (J2ME)",
".mtj.tmp/"
]},
{id: "go", name: "Go", group: "lang", lines: [
"# 二进制产物",
"*.exe",
"*.exe~",
"*.dll",
"*.so",
"*.dylib",
"",
"# go test -c 生成的测试二进制",
"*.test",
"",
"# 覆盖率输出",
"*.out",
"",
"# 依赖目录（若选择提交 vendor，请删掉下一行）",
"# vendor/",
"",
"# Go 工作区文件",
"go.work",
"go.work.sum"
]},
{id: "rust", name: "Rust", group: "lang", lines: [
"# Cargo 构建产物",
"/target/",
"",
"# 可执行项目建议提交 Cargo.lock，库项目忽略",
"Cargo.lock",
"",
"# rustfmt 备份文件",
"**/*.rs.bk",
"",
"# MSVC 构建符号",
"*.pdb"
]},
{id: "php", name: "PHP", group: "lang", lines: [
"# Composer",
"composer.phar",
"/vendor/",
"",
"# 环境配置",
".env",
".env.backup",
"",
"# 缓存与日志",
"*.cache",
"*.log",
"",
"# PHPUnit",
".phpunit.result.cache",
".phpunit.cache"
]},
{id: "ruby", name: "Ruby", group: "lang", lines: [
"# Gem 打包",
"*.gem",
"*.rbc",
"/pkg/",
"",
"# Bundler",
"/.config",
".bundle/",
"/vendor/bundle",
"/lib/bundler/man/",
"/Gemfile.lock",
"",
"# 测试覆盖率",
"/coverage/",
"/spec/reports/",
"/spec/examples.txt",
"",
"# 临时文件",
"/InstalledFiles",
"/test/tmp/",
"/test/version_tmp/",
"/tmp/",
"",
"# 文档",
"/.yardoc/",
"/_yardoc/",
"/doc/",
"/rdoc/",
"",
"# rvm / rbenv",
".ruby-version",
".ruby-gemset",
".rvmrc",
"",
"# RuboCop",
".rubocop-*"
]},
{id: "csharp", name: "C#", group: "lang", lines: [
"# 构建输出",
"[Dd]ebug/",
"[Dd]ebugPublic/",
"[Rr]elease/",
"[Rr]eleases/",
"x64/",
"x86/",
"[Ww][Ii][Nn]32/",
"[Aa][Rr][Mm]/",
"[Aa][Rr][Mm]64/",
"bld/",
"[Bb]in/",
"[Oo]bj/",
"[Ll]og/",
"[Ll]ogs/",
"",
"# Visual Studio 缓存与用户文件",
".vs/",
"*.user",
"*.suo",
"*.userosscache",
"*.sln.docstates",
"",
"# 测试结果",
"[Tt]est[Rr]esult*/",
"[Bb]uild[Ll]og.*",
"TestResult.xml",
"nunit-*.xml",
"*.VisualState.xml",
"",
"# NuGet",
"*.nupkg",
"*.snupkg",
"packages/"
]},
{id: "cpp", name: "C++", group: "lang", lines: [
"# 预编译依赖",
"*.d",
"",
"# 目标文件",
"*.slo",
"*.lo",
"*.o",
"*.obj",
"",
"# 预编译头",
"*.gch",
"*.pch",
"",
"# 动态库",
"*.so",
"*.dylib",
"*.dll",
"",
"# 静态库",
"*.lai",
"*.la",
"*.a",
"*.lib",
"",
"# 可执行文件",
"*.exe",
"*.out",
"*.app",
"",
"# Fortran 模块",
"*.mod",
"*.smod"
]},
/* ===== 框架 / 平台 ===== */
{id: "vue", name: "Vue", group: "framework", lines: [
"# Vue / Vite 构建输出",
"dist/",
"dist-ssr/",
"",
"# Vite 缓存",
".vite/"
]},
{id: "react", name: "React", group: "framework", lines: [
"# React 构建输出（Create React App）",
"build/",
"",
"# 测试覆盖率",
"coverage/",
"",
"# 环境变量文件（通用规则见 Node 模板）",
".env.local"
]},
{id: "django", name: "Django", group: "framework", lines: [
"# Django",
"*.log",
"local_settings.py",
"db.sqlite3",
"db.sqlite3-journal",
"media/",
"staticfiles/"
]},
{id: "laravel", name: "Laravel", group: "framework", lines: [
"# Laravel",
"/public/hot",
"/public/storage",
"/storage/*.key",
".env.backup",
".env.production",
"Homestead.json",
"Homestead.yaml",
"docker-compose.override.yml"
]},
{id: "flutter", name: "Flutter", group: "framework", lines: [
"# Flutter / Dart / Pub",
".dart_tool/",
".flutter-plugins",
".flutter-plugins-dependencies",
".pub-cache/",
".pub/",
"/build/",
"/symbols/",
"",
"# Android Studio 构建产物",
"/android/app/debug",
"/android/app/profile",
"/android/app/release",
"",
"# IDE（更细粒度见下方 系统/IDE 模板）",
"*.iml",
"*.ipr",
"*.iws",
".idea/",
".vscode/",
"",
"# 其他",
"*.class",
"*.log",
"*.pyc",
"*.swp",
".DS_Store",
".migrate_working_dir/",
".history",
".svn/",
".swiftpm/"
]},
{id: "android", name: "Android", group: "framework", lines: [
"# Gradle",
".gradle/",
"build/",
"captures/",
".externalNativeBuild/",
".cxx/",
"",
"# 本地 SDK 配置",
"local.properties",
"",
"# 日志",
"*.log",
"",
"# 安装包",
"*.apk",
"*.aab",
"output.json",
"",
"# IDE",
"*.iml",
".idea/"
]},
{id: "xcode", name: "iOS / Xcode", group: "framework", lines: [
"# Xcode 构建",
"build/",
"DerivedData/",
"*.pbxuser",
"*.mode1v3",
"*.mode2v3",
"*.perspectivev3",
"xcuserdata/",
"*.xccheckout",
"*.moved-aside",
"*.hmap",
"",
"# 打包产物",
"*.ipa",
"*.dSYM.zip",
"*.dSYM",
"",
"# Swift Package Manager",
".swiftpm/",
"",
"# App Store Connect API Key",
"AuthKey_*.p8",
"",
"# CocoaPods",
"Pods/"
]},
{id: "dotnet", name: ".NET", group: "framework", lines: [
"# .NET 构建输出",
"[Bb]in/",
"[Oo]bj/",
"[Ll]og/",
"[Ll]ogs/",
"out/",
"",
"# NuGet",
"*.nupkg",
"*.snupkg",
".nuget/",
"packages/",
"project.lock.json",
"project.fragment.lock.json",
"artifacts/",
"",
"# .NET 工具清单",
".config/"
]},
/* ===== 系统 / IDE / 编辑器 ===== */
{id: "macos", name: "macOS", group: "env", lines: [
"# macOS",
".DS_Store",
".AppleDouble",
".LSOverride",
"Icon",
"._*",
".DocumentRevisions-V100",
".fseventsd",
".Spotlight-V100",
".TemporaryItems",
".Trashes",
".VolumeIcon.icns",
".com.apple.timemachine.donotpresent",
".AppleDB",
".AppleDesktop",
"Network Trash Folder",
"Temporary Items",
".apdisk"
]},
{id: "windows", name: "Windows", group: "env", lines: [
"# Windows",
"Thumbs.db",
"Thumbs.db:encryptable",
"ehthumbs.db",
"ehthumbs_vista.db",
"[Dd]esktop.ini",
"$RECYCLE.BIN/",
"*.cab",
"*.msi",
"*.msix",
"*.msm",
"*.msp",
"*.lnk"
]},
{id: "linux", name: "Linux", group: "env", lines: [
"# Linux",
"*~",
".fuse_hidden*",
".directory",
".Trash-*",
".nfs*"
]},
{id: "vscode", name: "VSCode", group: "env", lines: [
"# VS Code（官方模板：默认忽略 .vscode 下全部，仅保留常用配置）",
".vscode/*",
"!.vscode/settings.json",
"!.vscode/tasks.json",
"!.vscode/launch.json",
"!.vscode/extensions.json",
"!.vscode/*.code-snippets",
"",
"# 历史记录与插件包",
".history/",
"*.vsix"
]},
{id: "jetbrains", name: "JetBrains", group: "env", lines: [
"# JetBrains IDE（官方模板核心：用户级配置忽略，共享配置保留）",
".idea/**/workspace.xml",
".idea/**/tasks.xml",
".idea/**/usage.statistics.xml",
".idea/**/dictionaries",
".idea/**/shelf",
".idea/**/httpRequests",
".idea/**/restScratches",
".idea/httpRequests/",
".idea/sonarlint/",
".idea/**/dataSources/",
".idea/**/dataSources.ids",
".idea/**/dataSources.local.xml",
".idea/**/sqlDataSources/",
".idea/**/dynamic.xml",
".idea/**/uiDesigner.xml",
".idea/**/dbnavigator.xml",
".idea/**/gradle.xml",
".idea/**/libraries",
".idea/modules.xml",
".idea/*.iml",
".idea/modules",
"*.iml",
"*.ipr",
".idea/.idea/",
".idea/vcs.xml",
"cmake-build-*/",
"un~",
"~$"
]},
{id: "vim_emacs", name: "Vim / Emacs", group: "env", lines: [
"# Vim",
"*~",
"[._]*.s[a-v][a-z]",
"[._]s[a-v][a-z]",
"[._]*.sw[a-p]",
"[._]sw[a-p]",
"Session.vim",
".netrwhist",
"tags",
"[._]*.un~",
"",
"# Emacs",
"*#",
".\\#*",
"*.elc",
"auto-save-list",
"tramp",
".\\#*",
".org-id-locations",
"*_archive",
"*_flymake.*",
"/eshell/history",
"/elpa/",
"*.rel",
"/auto/",
".cask/",
"flycheck_*.el",
"/server/",
"projectile-bookmarks.eld",
".projectile",
"network-security.data",
"/auto-save-list",
"*.orig",
"\\#*\\#"
]}
];

/* 模板 id → 模板对象 */
var GI_BY_ID = {};
GI_TEMPLATES.forEach(function (t) { GI_BY_ID[t.id] = t; });

/* ---------- 合并引擎（纯逻辑，可单元测试） ---------- */
/* selectedIds: 模板 id 数组。返回 {text, blocks, totalLines, dupRemoved} */
function buildGitignore(selectedIds) {
    var seen = {};
    var out = [];
    var blocks = [];
    var dupRemoved = 0;
    var totalLines = 0;

    GI_GROUP_ORDER.forEach(function (g) {
        GI_TEMPLATES.forEach(function (t) {
            if (t.group !== g) return;
            if (selectedIds.indexOf(t.id) === -1) return;
            var blockLines = 0;
            var header = "# ===== " + t.name + " =====";
            out.push(header);
            blockLines++;
            t.lines.forEach(function (ln) {
                if (ln !== "" && seen[ln] !== undefined) {
                    dupRemoved++;
                    return; /* 重复行只保留首次出现 */
                }
                if (ln !== "") seen[ln] = 1;
                out.push(ln);
                blockLines++;
            });
            out.push(""); /* 块间空行 */
            totalLines += blockLines;
            blocks.push({ id: t.id, name: t.name, lines: blockLines });
        });
    });

    return {
        text: out.join("\n").replace(/\n+$/, "\n"),
        blocks: blocks,
        totalLines: totalLines,
        dupRemoved: dupRemoved
    };
}

/* ---------- 浏览器 UI ---------- */
if (typeof document !== "undefined") {

var LS_KEY = "gitignore_generator_selection_v1";
var selected = [];

function $(id) { return document.getElementById(id); }

function loadSelection() {
    try {
        var raw = localStorage.getItem(LS_KEY);
        if (!raw) return;
        var arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
            selected = arr.filter(function (id) { return !!GI_BY_ID[id]; });
        }
    } catch (e) { /* 忽略损坏的存储 */ }
}

function saveSelection() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(selected)); }
    catch (e) { /* 隐私模式等情况静默失败 */ }
}

function isSelected(id) { return selected.indexOf(id) !== -1; }

function toggle(id) {
    var i = selected.indexOf(id);
    if (i === -1) selected.push(id);
    else selected.splice(i, 1);
    saveSelection();
    renderChips();
    renderPreview();
}

/* 渲染分组 chips（含搜索过滤） */
function renderChips() {
    var q = ($("gi-search").value || "").trim().toLowerCase();
    var wrap = $("gi-groups");
    wrap.innerHTML = "";
    GI_GROUP_ORDER.forEach(function (g) {
        var items = GI_TEMPLATES.filter(function (t) {
            if (t.group !== g) return false;
            if (!q) return true;
            return t.name.toLowerCase().indexOf(q) !== -1 || t.id.toLowerCase().indexOf(q) !== -1;
        });
        if (!items.length) return;
        var gdiv = document.createElement("div");
        gdiv.className = "gi-group";
        var h = document.createElement("div");
        h.className = "gi-group-head";
        var title = document.createElement("span");
        title.textContent = GI_GROUP_NAMES[g] + "（" + items.length + "）";
        h.appendChild(title);
        var selAll = document.createElement("button");
        selAll.type = "button";
        selAll.className = "gi-mini";
        var allOn = items.every(function (t) { return isSelected(t.id); });
        selAll.textContent = allOn ? "取消全选" : "全选";
        selAll.onclick = function () {
            if (allOn) {
                items.forEach(function (t) {
                    var i = selected.indexOf(t.id);
                    if (i !== -1) selected.splice(i, 1);
                });
            } else {
                items.forEach(function (t) {
                    if (selected.indexOf(t.id) === -1) selected.push(t.id);
                });
            }
            saveSelection();
            renderChips();
            renderPreview();
        };
        h.appendChild(selAll);
        gdiv.appendChild(h);
        var chips = document.createElement("div");
        chips.className = "gi-chips";
        items.forEach(function (t) {
            var b = document.createElement("button");
            b.type = "button";
            b.className = "gi-chip" + (isSelected(t.id) ? " on" : "");
            b.textContent = t.name;
            b.title = t.name;
            b.setAttribute("aria-pressed", isSelected(t.id) ? "true" : "false");
            (function (id) { b.onclick = function () { toggle(id); }; })(t.id);
            chips.appendChild(b);
        });
        gdiv.appendChild(chips);
        wrap.appendChild(gdiv);
    });
}

/* 渲染带行号的预览 */
function renderPreview() {
    var res = buildGitignore(selected);
    var pre = $("gi-preview");
    var stats = $("gi-stats");
    if (!selected.length) {
        pre.innerHTML = '<div class="gi-empty">👆 在上方选择至少一个模板，合并结果会实时显示在这里</div>';
        stats.style.display = "none";
        $("gi-copy-btn").disabled = true;
        $("gi-dl-btn").disabled = true;
        return;
    }
    var frag = document.createDocumentFragment();
    var lines = res.text.split("\n");
    lines.forEach(function (ln, idx) {
        var row = document.createElement("div");
        row.className = "gi-line";
        var num = document.createElement("span");
        num.className = "gi-num";
        num.textContent = idx + 1;
        var code = document.createElement("span");
        code.className = "gi-code" + (ln.charAt(0) === "#" ? " gi-comment" : "");
        code.textContent = ln === "" ? "\u00a0" : ln;
        row.appendChild(num);
        row.appendChild(code);
        frag.appendChild(row);
    });
    pre.innerHTML = "";
    pre.appendChild(frag);
    stats.style.display = "flex";
    $("gi-stat-tpl").textContent = selected.length;
    $("gi-stat-lines").textContent = lines.length;
    $("gi-stat-dup").textContent = res.dupRemoved;
    $("gi-copy-btn").disabled = false;
    $("gi-dl-btn").disabled = false;
}

function currentText() { return buildGitignore(selected).text; }

/* 一键复制（clipboard + execCommand 降级） */
function copyText(text, done) {
    function fallback() {
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        var ok = false;
        try { ok = document.execCommand("copy"); } catch (e) {}
        document.body.removeChild(ta);
        done(ok);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { done(true); }, function () { fallback(); });
    } else { fallback(); }
}

function toast(msg) {
    var el = $("gi-toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove("show"); }, 2200);
}

function bindEvents() {
    $("gi-search").addEventListener("input", renderChips);
    $("gi-clear-btn").addEventListener("click", function () {
        selected = [];
        saveSelection();
        renderChips();
        renderPreview();
        toast("已清空全部选择");
    });
    $("gi-copy-btn").addEventListener("click", function () {
        var text = currentText();
        copyText(text, function (ok) {
            toast(ok ? "已复制到剪贴板，共 " + text.split("\n").length + " 行" : "复制失败，请手动全选复制");
        });
    });
    $("gi-dl-btn").addEventListener("click", function () {
        var text = currentText();
        var blob = new Blob([text], { type: "text/plain;charset=utf-8" });
        var a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = ".gitignore";
        document.body.appendChild(a);
        a.click();
        setTimeout(function () {
            URL.revokeObjectURL(a.href);
            document.body.removeChild(a);
        }, 500);
        toast("已下载 .gitignore 文件");
    });
    /* 预设组合 */
    var presets = document.querySelectorAll("[data-gi-preset]");
    for (var i = 0; i < presets.length; i++) {
        (function (el) {
            el.addEventListener("click", function () {
                var ids = el.getAttribute("data-gi-preset").split(",");
                ids.forEach(function (id) {
                    if (GI_BY_ID[id] && selected.indexOf(id) === -1) selected.push(id);
                });
                saveSelection();
                renderChips();
                renderPreview();
                toast("已应用预设：" + el.textContent.trim());
            });
        })(presets[i]);
    }
}

document.addEventListener("DOMContentLoaded", function () {
    loadSelection();
    renderChips();
    renderPreview();
    bindEvents();
});

} /* typeof document !== "undefined" */

/* node 单元测试导出 */
if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        GI_TEMPLATES: GI_TEMPLATES,
        GI_GROUP_ORDER: GI_GROUP_ORDER,
        GI_GROUP_NAMES: GI_GROUP_NAMES,
        buildGitignore: buildGitignore
    };
}
})();
