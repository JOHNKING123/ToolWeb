/* 着陆页评分检查器（landing_page_grader）纯逻辑单元测试（零依赖）：
 * node tests/landing_page_grader.test.js
 * 覆盖：规则清单完整性（26 条/七组）、等级阈值、链接分类、标题层级、
 * 重复 id、占位文/超级词/价格/CTA/联系方式检测、26 条规则逐项命中、
 * 打分求和、Markdown 报告序列化、node 下 extractModel 降级、
 * 源码零 fetch/XHR、模板关键元素。
 */
"use strict";
var fs = require("fs");
var path = require("path");
var lpg = require("../static/js/landing_page_grader.js");
var SRC = fs.readFileSync(path.join(__dirname, "..", "static", "js", "landing_page_grader.js"), "utf8");
var TPL = fs.readFileSync(path.join(__dirname, "..", "templates", "landing_page_grader.html"), "utf8");

var pass = 0, fail = 0;
function ok(cond, name) {
    if (cond) { pass++; }
    else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }

/* ---------- 模型工厂 ---------- */

/* 全通过模型（每条规则都应 pass） */
function goodModel() {
    return {
        htmlSize: 6000, tagCount: 120,
        title: "标题".repeat(20),
        metaDescription: "描述".repeat(30),
        canonical: "https://example.com/",
        robots: "index, follow",
        htmlLang: "zh-CN",
        hasFavicon: true,
        viewport: "width=device-width, initial-scale=1",
        ogTitle: "分享标题", ogDescription: "分享描述", ogImage: "https://example.com/cover.jpg",
        twitterCard: "summary_large_image",
        headings: [{ level: 1, text: "主标题" }, { level: 2, text: "副标题" }, { level: 3, text: "小节" }],
        bodyText: "正文内容 ".repeat(80) + "价格12元，免费试用，联系我们",
        images: [{ alt: "截图", hasWidth: true, hasHeight: true }, { alt: "", hasWidth: true, hasHeight: true }],
        links: [
            { href: "/features", rel: "", target: "" },
            { href: "https://weibo.com/x", rel: "noopener", target: "_blank" }
        ],
        ids: ["a", "b", "c"],
        hasJsonLd: true, hasForm: false, hasFormButton: false
    };
}

/* 缺陷模型（覆盖验收标准中的典型缺陷） */
function badModel() {
    return {
        htmlSize: 3000, tagCount: 60,
        title: "", metaDescription: null, canonical: null, robots: "noindex, nofollow",
        htmlLang: null, hasFavicon: false, viewport: null,
        ogTitle: null, ogDescription: null, ogImage: null, twitterCard: null,
        headings: [],
        bodyText: "lorem ipsum dolor sit amet " + "颠覆 ".repeat(8),
        images: [
            { alt: null, hasWidth: false, hasHeight: false },
            { alt: null, hasWidth: false, hasHeight: false },
            { alt: "x", hasWidth: true, hasHeight: true }
        ],
        links: [
            { href: "#", rel: "", target: "" },
            { href: "http://evil.example/x", rel: "", target: "_blank" }
        ],
        ids: ["a", "a", "b"],
        hasJsonLd: false, hasForm: false, hasFormButton: false
    };
}

/* 在 goodModel 上打补丁后运行单条规则 */
function T(id, patch) {
    var m = goodModel();
    for (var k in patch) m[k] = patch[k];
    var rules = lpg.RULES.filter(function (x) { return x.id === id; });
    if (!rules.length) { ok(false, "规则存在：" + id); return { status: "missing" }; }
    return rules[0].run(m);
}

/* ---------- 1. 规则清单完整性 ---------- */
(function () {
    eq(lpg.RULE_COUNT, 26, "规则总数 26");
    eq(lpg.RULES.length, 26, "RULES 数组 26 条");
    eq(lpg.GROUPS.length, 7, "分组 7 组");
    var ids = lpg.RULES.map(function (r) { return r.id; });
    ok(ids.filter(function (id, i) { return ids.indexOf(id) !== i; }).length === 0, "规则 id 无重复");
    var perGroup = {};
    lpg.RULES.forEach(function (r) {
        perGroup[r.group] = (perGroup[r.group] || 0) + 1;
        ok(typeof r.title === "string" && r.title.length > 0, "规则有标题：" + r.id);
        ok(typeof r.run === "function", "规则有 run：" + r.id);
        ok(lpg.GROUPS.some(function (g) { return g.id === r.group; }), "规则分组合法：" + r.id);
    });
    eq([perGroup.seo, perGroup.social, perGroup.structure, perGroup.mobile,
        perGroup.link, perGroup.copy, perGroup.tech].join(","),
        "5,4,4,1,3,5,4", "七组规则数 5/4/4/1/3/5/4");
})();

/* ---------- 2. 等级与状态标签 ---------- */
(function () {
    eq(lpg.levelOf(100), "优秀", "100→优秀");
    eq(lpg.levelOf(85), "优秀", "85→优秀（边界）");
    eq(lpg.levelOf(84), "良好", "84→良好");
    eq(lpg.levelOf(60), "良好", "60→良好（边界）");
    eq(lpg.levelOf(59), "待改进", "59→待改进");
    eq(lpg.levelOf(0), "待改进", "0→待改进");
    eq(lpg.statusLabel("pass"), "通过", "pass→通过");
    eq(lpg.statusLabel("warn"), "警告", "warn→警告");
    eq(lpg.statusLabel("fail"), "失败", "fail→失败");
})();

/* ---------- 3. 链接分类 ---------- */
(function () {
    var cases = [
        ["/features", "internal"], ["./a.html", "internal"], ["../x", "internal"],
        ["#section", "internal"], ["?q=1", "internal"], ["page.html", "internal"],
        ["https://x.com", "external"], ["http://x.com", "external"], ["//cdn.x.com/a.js", "external"],
        ["mailto:a@b.com", "contact"], ["tel:13800000000", "contact"],
        ["javascript:void(0)", "js"], ["#", "placeholder"], ["", "empty"], ["   ", "empty"]
    ];
    cases.forEach(function (c) {
        eq(lpg.linkKind(c[0]), c[1], "linkKind(" + JSON.stringify(c[0]) + ")");
    });
    ok(lpg.isExternal("https://x.com") && !lpg.isExternal("/a"), "isExternal 判定");
})();

/* ---------- 4. 标题层级检查 ---------- */
(function () {
    ok(lpg.checkHeadingOrder([1, 2, 3]).ok, "h1→h2→h3 通过");
    ok(lpg.checkHeadingOrder([1, 2, 2, 3]).ok, "同级重复通过");
    ok(lpg.checkHeadingOrder([]).ok, "空数组通过");
    var r1 = lpg.checkHeadingOrder([1, 3]);
    ok(!r1.ok && r1.from === 1 && r1.to === 3, "h1→h3 跳级检出");
    var r2 = lpg.checkHeadingOrder([2, 3]);
    ok(!r2.ok && r2.from === 0 && r2.to === 2, "首个标题为 h2 检出");
})();

/* ---------- 5. 重复 id ---------- */
(function () {
    eq(lpg.findDuplicateIds(["a", "b", "a", "c", "b"]).join(","), "a,b", "检出重复 a,b");
    eq(lpg.findDuplicateIds(["a", "b"]).length, 0, "无重复");
    eq(lpg.findDuplicateIds(["", " ", "a"]).length, 0, "空 id 忽略");
    eq(lpg.findDuplicateIds([]).length, 0, "空数组");
})();

/* ---------- 6. 文案检测函数 ---------- */
(function () {
    ok(lpg.hasLoremIpsum("xx lorem ipsum xx"), "lorem 检出");
    ok(lpg.hasLoremIpsum("LOREM IPSUM"), "lorem 大小写不敏感");
    ok(!lpg.hasLoremIpsum("正常的中文文案"), "无 lorem");
    eq(lpg.countBuzzwords("普通文案").count, 0, "buzzword 0 处");
    eq(lpg.countBuzzwords("颠覆 ".repeat(5)).count, 5, "buzzword 5 处");
    eq(lpg.countBuzzwords("颠覆 ".repeat(8)).count, 8, "buzzword 8 处");
    eq(lpg.BUZZWORD_WARN_AT, 6, "buzzword 警告阈值 6");
    ok(lpg.hasPricing("每月 12 元"), "价格：元");
    ok(lpg.hasPricing("价格面议"), "价格：价格");
    ok(lpg.hasPricing("$9.9"), "价格：$");
    ok(!lpg.hasPricing("纯文本没有数字"), "无价格");
    ok(lpg.hasCta({ bodyText: "点击免费试用吧", hasFormButton: false }), "CTA 文案");
    ok(lpg.hasCta({ bodyText: "普通文本", hasFormButton: true }), "CTA 表单按钮");
    ok(!lpg.hasCta({ bodyText: "普通文本", hasFormButton: false }), "无 CTA");
    ok(lpg.hasContact({ bodyText: "文本", links: [{ href: "mailto:a@b.c" }], hasForm: false }), "联系：mailto");
    ok(lpg.hasContact({ bodyText: "文本", links: [{ href: "tel:123" }], hasForm: false }), "联系：tel");
    ok(lpg.hasContact({ bodyText: "文本", links: [], hasForm: true }), "联系：表单");
    ok(lpg.hasContact({ bodyText: "拨打电话 138 咨询", links: [], hasForm: false }), "联系：文本");
    ok(!lpg.hasContact({ bodyText: "纯文本", links: [], hasForm: false }), "无联系方式");
})();

/* ---------- 7. 26 条规则逐项 ---------- */
(function () {
    /* SEO 基础 */
    eq(T("seo-title", { title: null }).status, "fail", "title 缺失→失败");
    eq(T("seo-title", { title: "" }).status, "fail", "title 为空→失败");
    eq(T("seo-title", { title: "短" }).status, "warn", "title 过短→警告");
    eq(T("seo-title", { title: "标".repeat(70) }).status, "warn", "title 过长→警告");
    eq(T("seo-title", { title: "标题".repeat(20) }).status, "pass", "title 40 字→通过");
    eq(T("seo-meta-description", { metaDescription: null }).status, "fail", "description 缺失→失败");
    eq(T("seo-meta-description", { metaDescription: "描述".repeat(30) }).status, "pass", "description 60 字→通过");
    eq(T("seo-meta-description", { metaDescription: "描".repeat(200) }).status, "warn", "description 过长→警告");
    var cr1 = T("seo-canonical-robots", { robots: "noindex", canonical: "https://e.com/" });
    eq(cr1.status, "fail", "robots noindex→失败");
    eq(T("seo-canonical-robots", { robots: "index,follow", canonical: null }).status, "warn", "无 canonical→警告");
    eq(T("seo-canonical-robots", { robots: "index,follow", canonical: "https://e.com/" }).status, "pass", "canonical+可收录→通过");
    eq(T("seo-lang", { htmlLang: null }).status, "warn", "无 lang→警告");
    eq(T("seo-lang", { htmlLang: "zh-CN" }).status, "pass", "lang zh-CN→通过");
    eq(T("seo-favicon", { hasFavicon: false }).status, "warn", "无 favicon→警告");

    /* 社交分享 */
    ["social-og-title", "social-og-description", "social-og-image", "social-twitter-card"].forEach(function (id) {
        var key = { "social-og-title": "ogTitle", "social-og-description": "ogDescription",
            "social-og-image": "ogImage", "social-twitter-card": "twitterCard" }[id];
        var p = {}; p[key] = null;
        eq(T(id, p).status, "warn", id + " 缺失→警告");
    });

    /* 内容结构 */
    eq(T("structure-h1", { headings: [] }).status, "fail", "无 H1→失败");
    eq(T("structure-h1", { headings: [{ level: 1, text: "a" }, { level: 1, text: "b" }] }).status, "fail", "2 个 H1→失败");
    eq(T("structure-h1", { headings: [{ level: 1, text: "  " }] }).status, "fail", "H1 为空→失败");
    eq(T("structure-h1", {}).status, "pass", "1 个 H1→通过");
    eq(T("structure-heading-order", { headings: [{ level: 1 }, { level: 3 }] }).status, "warn", "标题跳级→警告");
    eq(T("structure-heading-order", { headings: [] }).status, "warn", "无标题→警告");
    eq(T("structure-word-count", { bodyText: "正".repeat(50) }).status, "fail", "正文 50 字→失败");
    eq(T("structure-word-count", { bodyText: "正".repeat(200) }).status, "warn", "正文 200 字→警告");
    eq(T("structure-word-count", { bodyText: "正".repeat(500) }).status, "pass", "正文 500 字→通过");
    eq(T("structure-img-alt", { images: [] }).status, "pass", "无图片→通过");
    eq(T("structure-img-alt", {
        images: [{ alt: null }].concat(Array(19).fill({ alt: "x" }))
    }).status, "pass", "alt 缺失率 5%→通过");
    eq(T("structure-img-alt", {
        images: [{ alt: null }, { alt: null }, { alt: null }, { alt: "x" }]
    }).status, "warn", "alt 缺失率 75%→警告");

    /* 移动友好 */
    eq(T("mobile-viewport", { viewport: null }).status, "fail", "无 viewport→失败");
    eq(T("mobile-viewport", { viewport: "width=500" }).status, "warn", "viewport 无 device-width→警告");

    /* 链接 */
    eq(T("link-internal", { links: [] }).status, "fail", "无内链→失败");
    eq(T("link-internal", { links: [{ href: "#top", rel: "", target: "" }] }).status, "pass", "#锚点算内链→通过");
    eq(T("link-external-rel-https", {
        links: [{ href: "http://e.com", rel: "", target: "" }]
    }).status, "fail", "http 外链→失败");
    eq(T("link-external-rel-https", {
        links: [{ href: "https://e.com", rel: "", target: "_blank" }]
    }).status, "warn", "新窗口外链无 rel→警告");
    eq(T("link-external-rel-https", {
        links: [{ href: "https://e.com", rel: "noopener", target: "_blank" }]
    }).status, "pass", "外链 HTTPS+rel→通过");
    eq(T("link-external-rel-https", { links: [] }).status, "pass", "无外链→通过");
    eq(T("link-no-placeholder", { links: [{ href: "#", rel: "", target: "" }] }).status, "fail", "href=#→失败");
    eq(T("link-no-placeholder", { links: [{ href: "javascript:void(0)", rel: "", target: "" }] }).status, "fail", "javascript:→失败");

    /* 文案质量 */
    eq(T("copy-no-lorem", { bodyText: "lorem ipsum test" }).status, "fail", "lorem ipsum→失败");
    eq(T("copy-buzzword-wall", { bodyText: "颠覆 ".repeat(8) }).status, "warn", "超级词 8 处→警告");
    eq(T("copy-buzzword-wall", { bodyText: "颠覆 极致" }).status, "pass", "超级词 2 处→通过");
    eq(T("copy-pricing", { bodyText: "纯文本" }).status, "warn", "无价格→警告");
    eq(T("copy-cta", { bodyText: "纯文本", hasFormButton: false }).status, "warn", "无 CTA→警告");
    eq(T("copy-contact", { bodyText: "纯文本", links: [], hasForm: false }).status, "warn", "无联系方式→警告");

    /* 技术性能 */
    eq(T("tech-img-dimensions", { images: [] }).status, "pass", "无图片→通过");
    eq(T("tech-img-dimensions", {
        images: [{ alt: "a", hasWidth: true, hasHeight: false }]
    }).status, "warn", "图片缺 height→警告");
    eq(T("tech-jsonld", { hasJsonLd: false }).status, "warn", "无 JSON-LD→警告");
    eq(T("tech-page-size", { htmlSize: 2 * 1024 * 1024, tagCount: 100 }).status, "fail", "源码 2MB→失败");
    eq(T("tech-page-size", { htmlSize: 500 * 1024, tagCount: 100 }).status, "warn", "源码 500KB→警告");
    eq(T("tech-page-size", { htmlSize: 6000, tagCount: 2000 }).status, "warn", "标签 2000→警告");
    eq(T("tech-page-size", { htmlSize: 6000, tagCount: 120 }).status, "pass", "体积正常→通过");
    var dup = T("tech-duplicate-id", { ids: ["a", "a"] });
    eq(dup.status, "fail", "重复 id→失败");
    ok(dup.suggestion.length > 0, "重复 id 有中文修复建议");
})();

/* ---------- 8. 打分 ---------- */
(function () {
    var good = lpg.gradePage(goodModel());
    eq(good.score, 100, "全通过模型=100 分");
    eq(good.level, "优秀", "全通过模型=优秀");
    eq(good.total, 26, "结果 26 项");
    eq([good.counts.pass, good.counts.warn, good.counts.fail].join(","), "26,0,0", "全通过计数");

    var bad = lpg.gradePage(badModel());
    eq(bad.score, 31, "缺陷模型=31 分");
    eq(bad.level, "待改进", "缺陷模型=待改进");
    eq([bad.counts.pass, bad.counts.warn, bad.counts.fail].join(","), "1,14,11", "缺陷模型计数");
    eq(bad.counts.pass + bad.counts.warn + bad.counts.fail, 26, "计数求和=26");
    var noSugg = bad.results.filter(function (r) { return r.status === "fail" && !r.suggestion; });
    eq(noSugg.length, 0, "每条失败都有中文修复建议");
    ok(bad.results.every(function (r) { return r.groupName && r.detail; }), "每条结果有分组名与现状描述");
    /* 验收：典型缺陷映射 */
    function st(id, rep) { return rep.results.filter(function (r) { return r.id === id; })[0].status; }
    eq(st("copy-no-lorem", bad), "fail", "验收：lorem ipsum→失败");
    eq(st("social-og-image", bad), "warn", "验收：缺 og:image→警告");
    eq(st("structure-h1", bad), "fail", "验收：无 H1→失败");
    eq(st("structure-img-alt", bad), "warn", "验收：图片无 alt→警告");
    eq(st("mobile-viewport", bad), "fail", "验收：无 viewport→失败");
})();

/* ---------- 9. Markdown 报告 ---------- */
(function () {
    var rep = lpg.gradePage(badModel());
    var md = lpg.buildMarkdown(rep, "2026-10-23 21:30");
    ok(md.indexOf("# 着陆页评分报告") === 0, "报告标题");
    ok(md.indexOf("2026-10-23 21:30") >= 0, "报告含检查时间");
    ok(md.indexOf("31 / 100") >= 0, "报告含总分");
    ok(md.indexOf("待改进") >= 0, "报告含等级");
    ok(md.indexOf("## ❌ 失败（11）") >= 0, "报告含失败节");
    ok(md.indexOf("## ⚠️ 警告（14）") >= 0, "报告含警告节");
    ok(md.indexOf("## ✅ 通过（1）") >= 0, "报告含通过节");
    ok(md.indexOf("- 建议：") >= 0, "失败项含修复建议");
    ok(md.indexOf("未上传") >= 0, "报告声明源码未上传");
})();

/* ---------- 10. 其它纯函数 ---------- */
(function () {
    ok(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(lpg.fmtTime(new Date(2026, 9, 23, 21, 30))), "fmtTime 格式");
    eq(lpg.extractModel("<html></html>"), null, "node 无 DOMParser→extractModel 返回 null");
})();

/* ---------- 11. 源码卫生：零 fetch/XHR、零上传 ---------- */
(function () {
    ok(!/\bfetch\s*\(/.test(SRC), "源码无 fetch(");
    ok(SRC.indexOf("XMLHttpRequest") === -1, "源码无 XMLHttpRequest");
    ok(SRC.indexOf("DOMParser") >= 0, "源码使用 DOMParser");
    ok(SRC.indexOf("module.exports") >= 0, "双模式导出");
    ok(lpg.SAMPLE_HTML.length >= 3500, "示例 HTML 长度充足（" + lpg.SAMPLE_HTML.length + " 字符）");
    ok(lpg.SAMPLE_HTML.indexOf("<h1") >= 0, "示例含 H1");
    ok(lpg.SAMPLE_HTML.indexOf("viewport") >= 0, "示例含 viewport");
    ok(lpg.SAMPLE_HTML.indexOf("og:image") >= 0, "示例含 og:image");
})();

/* ---------- 12. 模板关键元素 ---------- */
(function () {
    ok(TPL.indexOf('{{define "landing_page_grader"}}') >= 0, "模板 define");
    ok(TPL.indexOf('id="lpg-input"') >= 0, "粘贴文本域");
    ok(TPL.indexOf('id="lpg-grade"') >= 0, "开始检查按钮");
    ok(TPL.indexOf('id="lpg-sample"') >= 0, "载入示例按钮");
    ok(TPL.indexOf('id="lpg-drop"') >= 0, "拖入区域");
    ok(TPL.indexOf('id="lpg-filters"') >= 0, "筛选按钮组");
    ok(TPL.indexOf('id="lpg-groups"') >= 0, "规则清单容器");
    ok(TPL.indexOf('id="lpg-report"') >= 0, "报告预览");
    ok(TPL.indexOf('id="lpg-copy-report"') >= 0, "复制报告按钮");
    ok(TPL.indexOf("https://www.johnkingzcq123.xyz/tools/landing-page-grader") >= 0, "canonical/OG 链接");
    ok(TPL.indexOf("源码不出浏览器") >= 0, "隐私声明文案");
    ok(TPL.indexOf("application/ld+json") >= 0, "JSON-LD 面板");
    ok(TPL.indexOf("/tools/og-card-preview") >= 0, "相关工具链接");
    ok(TPL.indexOf("/tools/static/js/landing_page_grader.js") >= 0, "引用 JS");
    ["lpg-ring-fg", "lpg-score-num", "lpg-score-level",
     "lpg-count-pass", "lpg-count-warn", "lpg-count-fail"].forEach(function (id) {
        ok(TPL.indexOf('id="' + id + '"') >= 0, "模板含元素 " + id);
    });
})();

/* ---------- 汇总 ---------- */
(function () {
    console.log("\n通过 " + pass + " / 失败 " + fail + "，共 " + (pass + fail) + " 个断言");
    if (fail > 0) process.exit(1);
})();
