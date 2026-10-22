/* 社区搜索聚合器 - 纯前端：关键词 + 社区板块多选 + 时间范围 → 各引擎 site:/站内搜索链接列表
 * 零后端、零 fetch/XHR、零上传。路由规则：
 *   Reddit / Quora → Google site: 过滤（Google 对这两站的索引质量远胜其站内搜索；支持 after: 日期过滤）
 *   Hacker News   → hn.algolia.com 官方搜索（支持 dateRange 时间过滤）
 *   Stack Exchange→ stackoverflow.com/search 官方站内搜索
 *   V2EX          → v2ex.com/search 官方站内搜索
 *   知乎          → zhihu.com/search?type=content 官方站内搜索
 * Node 自测：require 本文件即可拿到纯函数（板块配置/链接构造/日期计算/OpenSearch XML 生成）。
 */
(function () {
'use strict';

/* ============ 板块配置 ============ */
var BOARDS = [
    { id: "reddit", name: "Reddit",         engine: "google", site: "reddit.com",
      desc: "Google site:reddit.com 过滤" },
    { id: "hn",     name: "Hacker News",    engine: "algolia",
      base: "https://hn.algolia.com/?q=",
      desc: "HN 官方 Algolia 搜索" },
    { id: "se",     name: "Stack Exchange", engine: "native",
      base: "https://stackoverflow.com/search?q=",
      desc: "StackOverflow 站内搜索（覆盖 ServerFault / SuperUser 等全网）" },
    { id: "quora",  name: "Quora",          engine: "google", site: "quora.com",
      desc: "Google site:quora.com 过滤" },
    { id: "v2ex",   name: "V2EX",           engine: "native",
      base: "https://www.v2ex.com/search?q=",
      desc: "V2EX 站内搜索" },
    { id: "zhihu",  name: "知乎",           engine: "native",
      base: "https://www.zhihu.com/search?type=content&q=",
      desc: "知乎站内搜索（内容结果页）" }
];

/* ============ 时间范围 ============ */
var TIME_RANGES = [
    { id: "all",   label: "不限时间",   days: 0 },
    { id: "day",   label: "过去 24 小时", days: 1 },
    { id: "week",  label: "过去 1 周",   days: 7 },
    { id: "month", label: "过去 1 个月", days: 30 },
    { id: "year",  label: "过去 1 年",   days: 365 }
];

/* HN Algolia dateRange 参数映射 */
var HN_DATE_RANGE = {
    all: "all", day: "last24h", week: "pastWeek", month: "pastMonth", year: "pastYear"
};

var GOOGLE_SEARCH = "https://www.google.com/search?q=";
var OPENSEARCH_PAGE_URL = "https://www.it-tool.eu.cc/tools/search-router?q={searchTerms}";
var STORE_KEY = "sr_boards_v1";

/* ============ 基础工具 ============ */
function getBoard(id) {
    for (var i = 0; i < BOARDS.length; i++) {
        if (BOARDS[i].id === id) { return BOARDS[i]; }
    }
    return null;
}

function getRange(id) {
    for (var i = 0; i < TIME_RANGES.length; i++) {
        if (TIME_RANGES[i].id === id) { return TIME_RANGES[i]; }
    }
    return TIME_RANGES[0];
}

/* now 可注入（测试用），默认当前时间；返回 YYYY-MM-DD */
function afterDate(days, now) {
    var d = now ? new Date(now.getTime()) : new Date();
    d.setDate(d.getDate() - days);
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + "-" + (m < 10 ? "0" + m : m) + "-" + (day < 10 ? "0" + day : day);
}

/* XML 转义（OpenSearch 描述文件用） */
function escapeXml(s) {
    return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

/* ============ 链接构造（纯函数，可单测） ============ */

/* 单个板块生成一条搜索链接。keyword 未 trim 由调用方保证。 */
function buildBoardLink(boardId, keyword, rangeId, now) {
    var b = getBoard(boardId);
    if (!b) { return null; }
    var kw = String(keyword).trim();
    if (!kw) { return null; }
    var range = getRange(rangeId);
    var eq = encodeURIComponent(kw);

    if (b.engine === "google") {
        var query = "site:" + b.site + " " + kw;
        if (range.days > 0) {
            query += " after:" + afterDate(range.days, now);
        }
        return {
            boardId: b.id, name: b.name, engine: "google",
            url: GOOGLE_SEARCH + encodeURIComponent(query),
            note: b.desc
        };
    }
    /* 站内搜索：关键词直接拼到官方搜索 URL */
    var url = b.base + eq;
    if (b.engine === "algolia") {
        url += "&dateRange=" + (HN_DATE_RANGE[range.id] || "all");
    }
    return {
        boardId: b.id, name: b.name, engine: b.engine,
        url: url,
        note: b.desc
    };
}

/* 批量：boardIds 为空数组 → 空结果；保持 BOARDS 顺序 */
function buildLinks(keyword, boardIds, rangeId, now) {
    var out = [];
    var kw = String(keyword == null ? "" : keyword).trim();
    if (!kw) { return out; }
    var wanted = {};
    (boardIds || []).forEach(function (id) { wanted[id] = true; });
    BOARDS.forEach(function (b) {
        if (wanted[b.id]) {
            var link = buildBoardLink(b.id, kw, rangeId, now);
            if (link) { out.push(link); }
        }
    });
    return out;
}

/* ============ OpenSearch 描述文件（纯函数，可单测） ============ */
function buildOpenSearchXml() {
    return '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">\n' +
        '  <ShortName>社区搜索</ShortName>\n' +
        '  <Description>社区搜索聚合器：关键词一键直达 Reddit / Hacker News / Stack Exchange / Quora / V2EX / 知乎的真实技术讨论，绕过 AI SEO 垃圾内容。</Description>\n' +
        '  <InputEncoding>UTF-8</InputEncoding>\n' +
        '  <Url type="text/html" method="get" template="' + escapeXml(OPENSEARCH_PAGE_URL) + '"/>\n' +
        '</OpenSearchDescription>';
}

/* Node 导出纯函数 */
if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        BOARDS: BOARDS,
        TIME_RANGES: TIME_RANGES,
        HN_DATE_RANGE: HN_DATE_RANGE,
        getBoard: getBoard,
        getRange: getRange,
        afterDate: afterDate,
        escapeXml: escapeXml,
        buildBoardLink: buildBoardLink,
        buildLinks: buildLinks,
        buildOpenSearchXml: buildOpenSearchXml,
        OPENSEARCH_PAGE_URL: OPENSEARCH_PAGE_URL,
        STORE_KEY: STORE_KEY
    };
}

/* ============ 浏览器交互 ============ */
if (typeof document !== "undefined") {
(function () {

function $(id) { return document.getElementById(id); }

var toastTimer = null;
function toast(msg, ok) {
    var el = $("sr-toast");
    el.textContent = msg;
    el.className = "sr-toast show " + (ok === false ? "fail" : ok === true ? "ok" : "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.className = "sr-toast"; }, 3200);
}

/* 复制文本：优先 navigator.clipboard，降级 textarea+execCommand */
function copyText(text, cb) {
    function done(ok) { if (cb) { cb(ok); } }
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { done(true); }, function () {
            fallbackCopy(text, done);
        });
        return;
    }
    fallbackCopy(text, done);
}
function fallbackCopy(text, done) {
    try {
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        var ok = document.execCommand("copy");
        document.body.removeChild(ta);
        done(!!ok);
    } catch (e) { done(false); }
}

function downloadBlob(filename, blob) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
        URL.revokeObjectURL(a.href);
        document.body.removeChild(a);
    }, 500);
}

/* 读取/保存板块选择（localStorage） */
function readStoredBoards() {
    try {
        var raw = localStorage.getItem(STORE_KEY);
        if (!raw) { return null; }
        var arr = JSON.parse(raw);
        if (!Array.isArray(arr)) { return null; }
        return arr.filter(function (id) { return !!getBoard(id); });
    } catch (e) { return null; }
}
function storeBoards(ids) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(ids)); } catch (e) { /* 忽略 */ }
}

function readForm() {
    var keyword = $("sr-keyword").value.trim();
    var rangeSel = $("sr-range");
    var rangeId = rangeSel ? rangeSel.value : "all";
    var boxes = document.querySelectorAll('input[name="sr-board"]:checked');
    var ids = [];
    for (var i = 0; i < boxes.length; i++) { ids.push(boxes[i].value); }
    return { keyword: keyword, rangeId: rangeId, boardIds: ids };
}

var lastLinks = [];

function renderLinks(links) {
    lastLinks = links;
    var box = $("sr-results");
    var openBtn = $("sr-open-all"), copyBtn = $("sr-copy-all");
    if (!links.length) {
        box.innerHTML = '<div class="sr-empty">暂无结果：请至少勾选一个社区板块</div>';
        openBtn.disabled = true;
        copyBtn.disabled = true;
        return;
    }
    var html = "";
    links.forEach(function (l, i) {
        var tag = l.engine === "google" ? "Google site:" : "站内搜索";
        html += '<div class="sr-row">' +
            '<div class="sr-row-head"><span class="sr-board">' + escapeHtml(l.name) + '</span>' +
            '<span class="sr-tag">' + tag + '</span>' +
            '<button type="button" class="sr-mini" data-copy="' + i + '">复制</button></div>' +
            '<a class="sr-url" href="' + escapeHtml(l.url) + '" target="_blank" rel="noopener noreferrer" title="' + escapeHtml(l.url) + '">' +
            escapeHtml(l.url) + '</a>' +
            '<div class="sr-note">' + escapeHtml(l.note) + '</div>' +
            '</div>';
    });
    box.innerHTML = html;
    openBtn.disabled = false;
    copyBtn.disabled = false;
    /* 逐行复制按钮 */
    var minis = box.querySelectorAll("[data-copy]");
    for (var j = 0; j < minis.length; j++) {
        (function (btn) {
            btn.addEventListener("click", function () {
                var l = lastLinks[parseInt(btn.getAttribute("data-copy"), 10)];
                if (!l) { return; }
                copyText(l.url, function (ok) {
                    toast(ok ? "✅ 已复制「" + l.name + "」搜索链接" : "❌ 复制失败，请手动长按复制", ok);
                });
            });
        })(minis[j]);
    }
}

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function refresh() {
    var v = readForm();
    var err = $("sr-err");
    if (!v.keyword) {
        err.textContent = "请输入关键词（回车即搜）";
        renderLinks([]);
        return;
    }
    err.textContent = "";
    if (!v.boardIds.length) {
        renderLinks([]);
        return;
    }
    renderLinks(buildLinks(v.keyword, v.boardIds, v.rangeId));
    storeBoards(v.boardIds);
}

/* 一键全开：逐个 window.open；被拦截则降级复制全部链接 */
function openAll() {
    if (!lastLinks.length) { return; }
    var links = lastLinks.slice();
    var opened = 0, blocked = 0, done = 0;
    function finish() {
        if (blocked > 0) {
            var all = links.map(function (l) { return l.name + "：\n" + l.url; }).join("\n\n");
            copyText(all, function (ok) {
                toast(ok
                    ? "⚠️ 浏览器拦截了 " + blocked + " 个弹窗，已复制全部 " + links.length + " 条链接到剪贴板"
                    : "⚠️ 浏览器拦截了弹窗，复制也失败了，请逐条点击打开", ok);
            });
        } else {
            toast("✅ 已打开 " + opened + " 个搜索页面", true);
        }
    }
    links.forEach(function (l, i) {
        setTimeout(function () {
            var w = null;
            try { w = window.open(l.url, "_blank", "noopener,noreferrer"); } catch (e) { w = null; }
            if (!w || w.closed) { blocked++; } else { opened++; }
            done++;
            if (done === links.length) { finish(); }
        }, i * 150);
    });
}

document.addEventListener("DOMContentLoaded", function () {
    /* 板块多选框 */
    var wrap = $("sr-boards");
    var stored = readStoredBoards();
    var html = "";
    BOARDS.forEach(function (b) {
        var checked = stored ? stored.indexOf(b.id) !== -1 : true;
        html += '<label class="sr-check"><input type="checkbox" name="sr-board" value="' + b.id + '"' +
            (checked ? " checked" : "") + '> ' + escapeHtml(b.name) + '</label>';
    });
    wrap.innerHTML = html;

    /* 时间范围下拉 */
    var rangeSel = $("sr-range");
    var rhtml = "";
    TIME_RANGES.forEach(function (r, i) {
        rhtml += '<option value="' + r.id + '"' + (i === 2 ? " selected" : "") + '>' + r.label + '</option>';
    });
    rangeSel.innerHTML = rhtml;

    /* 事件 */
    $("sr-keyword").addEventListener("keydown", function (e) {
        if (e.key === "Enter") { refresh(); }
    });
    $("sr-go").addEventListener("click", refresh);
    rangeSel.addEventListener("change", refresh);
    wrap.addEventListener("change", refresh);
    $("sr-sample").addEventListener("click", function () {
        $("sr-keyword").value = "python asyncio 连接池";
        refresh();
        toast("已填入示例关键词", true);
    });
    $("sr-open-all").addEventListener("click", openAll);
    $("sr-copy-all").addEventListener("click", function () {
        if (!lastLinks.length) { return; }
        var all = lastLinks.map(function (l) { return l.name + "：\n" + l.url; }).join("\n\n");
        copyText(all, function (ok) {
            toast(ok ? "✅ 全部 " + lastLinks.length + " 条链接已复制" : "❌ 复制失败，请手动选择复制", ok);
        });
    });

    /* OpenSearch 描述文件 */
    var xml = buildOpenSearchXml();
    $("sr-os-xml").value = xml;
    $("sr-os-copy").addEventListener("click", function () {
        copyText(xml, function (ok) {
            toast(ok ? "✅ OpenSearch XML 已复制" : "❌ 复制失败，请手动选择复制", ok);
        });
    });
    $("sr-os-download").addEventListener("click", function () {
        downloadBlob("search-router-opensearch.xml",
            new Blob([xml], { type: "application/opensearchdescription+xml;charset=utf-8" }));
        toast("✅ OpenSearch XML 已开始下载", true);
    });

    /* 地址栏直搜入口：?q= 关键词 → 自动填入并生成 */
    try {
        var params = new URLSearchParams(window.location.search);
        var q = params.get("q");
        if (q && q.trim()) {
            $("sr-keyword").value = q.trim();
        }
    } catch (e) { /* 忽略 */ }

    refresh();
});

})();

} /* typeof document !== "undefined" */
})();
