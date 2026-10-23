/* 网站无障碍检查器（accessibility_scanner）纯逻辑单元测试（零依赖）：
 * node tests/accessibility_scanner.test.js
 * 覆盖：规则清单完整性（12 条/五组/WCAG 条款号）、等级阈值、标题层级、
 * 重复 id、颜色解析与对比度、字号解析、12 条规则逐项命中、误报控制
 * （装饰空 alt / label 包裹 / 对比度手动核对）、打分求和、Markdown 报告、
 * node 下 extractModel 降级、源码零 fetch/XHR、模板关键元素与能力边界文案。
 */
"use strict";
var fs = require("fs");
var path = require("path");
var asc = require("../static/js/accessibility_scanner.js");
var SRC = fs.readFileSync(path.join(__dirname, "..", "static", "js", "accessibility_scanner.js"), "utf8");
var TPL = fs.readFileSync(path.join(__dirname, "..", "templates", "accessibility_scanner.html"), "utf8");

var pass = 0, fail = 0;
function ok(cond, name) {
    if (cond) { pass++; }
    else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }

/* ---------- 模型工厂 ---------- */

function goodModel() {
    return {
        title: "阳光烘焙坊 - 现烤面包每日配送",
        htmlLang: "zh-CN",
        images: [
            { alt: "刚出炉的法式长棍面包", src: "a.jpg", inLink: false, decorative: false },
            { alt: "", src: "deco.png", inLink: false, decorative: false }
        ],
        formFields: [
            { tag: "input", type: "text", id: "n", nameAttr: "name", hasName: true, nameSource: "label for 显式关联" },
            { tag: "input", type: "tel", id: "", nameAttr: "phone", hasName: true, nameSource: "label 包裹" }
        ],
        buttons: [
            { kind: "submit", text: "提交订单", hasName: true },
            { kind: "button", text: "", hasName: true }
        ],
        headings: [{ level: 1, text: "阳光烘焙坊" }, { level: 2, text: "今日推荐" }, { level: 3, text: "第一课" }],
        tabindices: [0, 0],
        ids: ["n", "addr", "city"],
        links: [
            { href: "/", text: "首页", hasName: true },
            { href: "/order", text: "立即下单", hasName: true }
        ],
        videos: [{ hasCaptions: true }],
        audioCount: 0,
        ariaBadRefs: [],
        ariaRefCount: 0,
        contrastItems: [
            { fg: asc.parseColor("#1a1a1a"), bg: asc.parseColor("#ffffff"), bgRaw: "#ffffff", fontPx: 16, bold: false, tag: "p", text: "提示" }
        ]
    };
}

function badModel() {
    return {
        title: "   ",
        htmlLang: "",
        images: [
            { alt: null, src: "banner.jpg", inLink: false, decorative: false },
            { alt: "", src: "go.png", inLink: true, decorative: false }
        ],
        formFields: [
            { tag: "input", type: "text", id: "", nameAttr: "q", hasName: false, nameSource: "" }
        ],
        buttons: [
            { kind: "button", text: "", hasName: false }
        ],
        headings: [{ level: 2, text: "小节" }, { level: 4, text: "更小" }],
        tabindices: [1, 0],
        ids: ["dup", "dup", "x"],
        links: [
            { href: "/x", text: "", hasName: false }
        ],
        videos: [{ hasCaptions: false }],
        audioCount: 1,
        ariaBadRefs: ["aria-labelledby→#ghost"],
        ariaRefCount: 1,
        contrastItems: [
            { fg: asc.parseColor("#777777"), bg: asc.parseColor("#ffffff"), bgRaw: "#ffffff", fontPx: 16, bold: false, tag: "p", text: "浅灰文字" }
        ]
    };
}

/* ---------- 1. 规则清单完整性 ---------- */
(function () {
    eq(asc.RULE_COUNT, 12, "规则总数 12");
    eq(asc.RULES.length, 12, "RULES 数组 12 条");
    eq(asc.GROUPS.length, 5, "分组 5 个");
    var ids = asc.RULES.map(function (r) { return r.id; });
    eq(ids.filter(function (id, i) { return ids.indexOf(id) === i; }).length, 12, "规则 id 唯一");
    ok(asc.RULES.every(function (r) { return r.id && r.group && r.title && r.wcag && typeof r.run === "function"; }),
        "每条规则有 id/group/title/wcag/run");
    ok(asc.RULES.every(function (r) { return /WCAG/.test(r.wcag); }), "每条规则标注 WCAG 条款号");
    ok(asc.RULES.every(function (r) {
        return asc.GROUPS.some(function (g) { return g.id === r.group; });
    }), "规则分组均有效");
    ["img-alt", "form-label", "button-name", "link-text", "heading-order", "html-lang",
     "doc-title", "tabindex", "duplicate-id", "aria-refs", "media-captions", "contrast"
    ].forEach(function (id) {
        ok(ids.indexOf(id) >= 0, "规则存在 " + id);
    });
})();

/* ---------- 2. 等级与状态 ---------- */
(function () {
    eq(asc.levelOf(100), "优秀", "100=优秀");
    eq(asc.levelOf(85), "优秀", "85=优秀");
    eq(asc.levelOf(84), "良好", "84=良好");
    eq(asc.levelOf(60), "良好", "60=良好");
    eq(asc.levelOf(59), "待改进", "59=待改进");
    eq(asc.levelOf(0), "待改进", "0=待改进");
    eq(asc.statusLabel("pass"), "通过", "pass 文案");
    eq(asc.statusLabel("warn"), "警告", "warn 文案");
    eq(asc.statusLabel("fail"), "失败", "fail 文案");
})();

/* ---------- 3. 纯辅助函数 ---------- */
(function () {
    ok(asc.checkHeadingOrder([1, 2, 3]).ok, "标题 1-2-3 通过");
    var bad = asc.checkHeadingOrder([1, 2, 4]);
    ok(!bad.ok && bad.from === 2 && bad.to === 4, "h2→h4 跳级检出");
    ok(!asc.checkHeadingOrder([2]).ok, "首个标题 h2 检出");
    eq(asc.findDuplicateIds(["a", "b", "a", "c", "b"]).join(","), "a,b", "重复 id 检出");
    eq(asc.findDuplicateIds(["a", "b"]).length, 0, "无重复");
    eq(asc.findDuplicateIds(["", " "]).length, 0, "空 id 忽略");
})();

/* ---------- 4. 颜色与对比度 ---------- */
(function () {
    var c = asc.parseColor("#fff");
    eq([c.r, c.g, c.b].join(","), "255,255,255", "#fff 解析");
    c = asc.parseColor("#1a2b3c");
    eq([c.r, c.g, c.b].join(","), "26,43,60", "#1a2b3c 解析");
    c = asc.parseColor("rgb(10, 20, 30)");
    eq([c.r, c.g, c.b].join(","), "10,20,30", "rgb() 解析");
    c = asc.parseColor("rgba(10,20,30,0.5)");
    eq(c.a, 0.5, "rgba alpha 解析");
    c = asc.parseColor("red");
    eq([c.r, c.g, c.b].join(","), "255,0,0", "色名 red 解析");
    eq(asc.parseColor("notacolor"), null, "非法颜色→null");
    eq(asc.parseColor(""), null, "空→null");
    var bw = asc.contrastRatio(asc.parseColor("#000"), asc.parseColor("#fff"));
    ok(Math.abs(bw - 21) < 0.01, "黑白对比度≈21（实得 " + bw.toFixed(2) + "）");
    eq(asc.contrastRatio(asc.parseColor("#fff"), asc.parseColor("#fff")), 1, "同色对比度=1");
    var r777 = asc.contrastRatio(asc.parseColor("#777777"), asc.parseColor("#ffffff"));
    ok(r777 < 4.5, "#777/#fff 对比度 " + r777.toFixed(2) + " <4.5（正文不达标）");
    var rlarge = asc.contrastRatio(asc.parseColor("#767676"), asc.parseColor("#ffffff"));
    ok(rlarge >= 4.5, "#767676/#fff 对比度 " + rlarge.toFixed(2) + " ≥4.5（正文达标）");
    var fs = asc.parseFontSize("color:#333;font-size:26px;font-weight:bold");
    eq(fs.px, 26, "字号 26px 解析");
    eq(fs.bold, true, "bold 解析");
    ok(asc.isLargeText(26, false), "26px=大字");
    ok(asc.isLargeText(19, true), "19px 加粗=大字");
    ok(!asc.isLargeText(16, false), "16px 非大字");
    ok(!asc.isLargeText(null, false), "未知字号非大字");
})();

/* ---------- 5. 12 条规则逐项（好模型全过） ---------- */
(function () {
    var m = goodModel();
    var st = {};
    asc.RULES.forEach(function (r) { st[r.id] = r.run(m).status; });
    Object.keys(st).forEach(function (id) {
        eq(st[id], "pass", "好模型规则通过 " + id);
    });
})();

/* ---------- 6. 12 条规则逐项（缺陷模型） ---------- */
(function () {
    var m = badModel();
    function run(id) {
        return asc.RULES.filter(function (r) { return r.id === id; })[0].run(m);
    }
    eq(run("img-alt").status, "fail", "缺 alt→失败");
    eq(run("form-label").status, "fail", "无 label→失败");
    eq(run("button-name").status, "fail", "按钮无名→失败");
    eq(run("link-text").status, "fail", "空链接→失败");
    eq(run("heading-order").status, "fail", "标题跳级→失败");
    eq(run("html-lang").status, "fail", "缺 lang→失败");
    eq(run("doc-title").status, "fail", "空 title→失败");
    eq(run("tabindex").status, "fail", "tabindex>0→失败");
    eq(run("duplicate-id").status, "fail", "重复 id→失败");
    eq(run("aria-refs").status, "fail", "aria 悬空引用→失败");
    eq(run("media-captions").status, "warn", "无字幕→警告");
    eq(run("contrast").status, "fail", "对比度不足→失败");
    ok(/WCAG/.test(run("img-alt").suggestion), "失败建议含 WCAG 条款号");
    ok(/alt=/.test(run("img-alt").suggestion), "alt 失败建议含代码示例");
})();

/* ---------- 7. 误报控制 ---------- */
(function () {
    function run(id, m) {
        return asc.RULES.filter(function (r) { return r.id === id; })[0].run(m);
    }
    /* 装饰空 alt 不误报 */
    var m1 = goodModel();
    m1.images = [{ alt: "", src: "deco.png", inLink: false, decorative: false }];
    var r1 = run("img-alt", m1);
    eq(r1.status, "pass", "装饰空 alt→通过不误报");
    ok(/装饰/.test(r1.detail), "通过文案说明装饰图识别");
    /* 图片链接空 alt 仍判失败（不是误报） */
    var m2 = goodModel();
    m2.images = [{ alt: "", src: "go.png", inLink: true, decorative: false }];
    eq(run("img-alt", m2).status, "fail", "图片链接空 alt→失败（链接失名）");
    /* label 包裹合法写法不误报 */
    var m3 = goodModel();
    m3.formFields = [{ tag: "input", type: "text", id: "", nameAttr: "p", hasName: true, nameSource: "label 包裹" }];
    eq(run("form-label", m3).status, "pass", "label 包裹→通过不误报");
    /* 对比度无法判定→警告而非失败 */
    var m4 = goodModel();
    m4.contrastItems = [{ fg: asc.parseColor("#333"), bg: null, bgRaw: "linear-gradient(red, blue)", fontPx: 16, bold: false, tag: "p", text: "渐变背景文字" }];
    var r4 = run("contrast", m4);
    eq(r4.status, "warn", "渐变背景对比度→警告（手动核对）不判失败");
    ok(/手动核对/.test(r4.detail), "警告文案提示手动核对");
    /* 大字 3:1 口径 */
    var m5 = goodModel();
    m5.contrastItems = [{ fg: asc.parseColor("#767676"), bg: asc.parseColor("#ffffff"), bgRaw: "#fff", fontPx: 26, bold: false, tag: "p", text: "大字" }];
    eq(run("contrast", m5).status, "pass", "大字对比度 3:1 口径通过");
    /* tabindex=0 少量使用不警告 */
    var m6 = goodModel();
    m6.tabindices = [0, 0, 0];
    eq(run("tabindex", m6).status, "pass", "少量 tabindex=0 通过");
    /* h1 多个→警告而非失败 */
    var m7 = goodModel();
    m7.headings = [{ level: 1, text: "A" }, { level: 1, text: "B" }, { level: 2, text: "C" }];
    eq(run("heading-order", m7).status, "warn", "多 h1→警告");
})();

/* ---------- 8. 打分 ---------- */
(function () {
    var good = asc.gradePage(goodModel());
    eq(good.score, 100, "好模型=100 分");
    eq(good.level, "优秀", "好模型=优秀");
    eq(good.total, 12, "结果 12 项");
    eq([good.counts.pass, good.counts.warn, good.counts.fail].join(","), "12,0,0", "全通过计数");

    var bad = asc.gradePage(badModel());
    eq(bad.score, 4, "缺陷模型=4 分（11 失败+1 警告）");
    eq(bad.level, "待改进", "缺陷模型=待改进");
    eq([bad.counts.pass, bad.counts.warn, bad.counts.fail].join(","), "0,1,11", "缺陷模型计数");
    eq(bad.counts.pass + bad.counts.warn + bad.counts.fail, 12, "计数求和=12");
    var noSugg = bad.results.filter(function (r) { return r.status === "fail" && !/WCAG/.test(r.suggestion); });
    eq(noSugg.length, 0, "每条失败的修复建议都含 WCAG 条款号");
    ok(bad.results.every(function (r) { return r.groupName && r.detail && r.wcag; }), "每条结果有分组名/现状/WCAG");
})();

/* ---------- 9. Markdown 报告 ---------- */
(function () {
    var rep = asc.gradePage(badModel());
    var md = asc.buildMarkdown(rep, "2026-10-24 01:30");
    ok(md.indexOf("# 网站无障碍检查报告") === 0, "报告标题");
    ok(md.indexOf("2026-10-24 01:30") >= 0, "报告含检查时间");
    ok(md.indexOf("4 / 100") >= 0, "报告含总分");
    ok(md.indexOf("待改进") >= 0, "报告含等级");
    ok(md.indexOf("## ❌ 失败（11）") >= 0, "报告含失败节");
    ok(md.indexOf("## ⚠️ 警告（1）") >= 0, "报告含警告节");
    ok(md.indexOf("- 条款：WCAG") >= 0, "报告含 WCAG 条款行");
    ok(md.indexOf("- 建议：") >= 0, "失败项含修复建议");
    ok(md.indexOf("未上传") >= 0, "报告声明源码未上传");
    ok(md.indexOf("不是 WCAG 合规认证") >= 0, "报告如实声明能力边界");
})();

/* ---------- 10. 其它纯函数 ---------- */
(function () {
    ok(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(asc.fmtTime(new Date(2026, 9, 24, 1, 30))), "fmtTime 格式");
    eq(asc.extractModel("<html></html>"), null, "node 无 DOMParser→extractModel 返回 null");
    eq(asc.trim("  x  "), "x", "trim");
})();

/* ---------- 11. 源码卫生：零 fetch/XHR、零上传 ---------- */
(function () {
    ok(!/\bfetch\s*\(/.test(SRC), "源码无 fetch(");
    ok(SRC.indexOf("XMLHttpRequest") === -1, "源码无 XMLHttpRequest");
    ok(SRC.indexOf("DOMParser") >= 0, "源码使用 DOMParser");
    ok(SRC.indexOf("module.exports") >= 0, "双模式导出");
    ok(asc.SAMPLE_HTML.length >= 2000, "示例 HTML 长度充足（" + asc.SAMPLE_HTML.length + " 字符）");
    ok(asc.SAMPLE_HTML.indexOf('lang="zh-CN"') >= 0, "示例含 lang");
    ok(asc.SAMPLE_HTML.indexOf("<h1>") >= 0, "示例含 H1");
    ok(asc.SAMPLE_HTML.indexOf('alt=""') >= 0, "示例含装饰空 alt");
    ok(asc.SAMPLE_HTML.indexOf("<label") >= 0, "示例含 label");
    ok(asc.SAMPLE_HTML.indexOf('kind="captions"') >= 0, "示例含字幕 track");
})();

/* ---------- 12. 模板关键元素 ---------- */
(function () {
    ok(TPL.indexOf('{{define "accessibility_scanner"}}') >= 0, "模板 define");
    ok(TPL.indexOf('id="asc-input"') >= 0, "粘贴文本域");
    ok(TPL.indexOf('id="asc-grade"') >= 0, "开始检查按钮");
    ok(TPL.indexOf('id="asc-sample"') >= 0, "载入示例按钮");
    ok(TPL.indexOf('id="asc-drop"') >= 0, "拖入区域");
    ok(TPL.indexOf('id="asc-filters"') >= 0, "筛选按钮组");
    ok(TPL.indexOf('id="asc-groups"') >= 0, "规则清单容器");
    ok(TPL.indexOf('id="asc-report"') >= 0, "报告预览");
    ok(TPL.indexOf('id="asc-copy-report"') >= 0, "复制报告按钮");
    ok(TPL.indexOf("https://www.johnkingzcq123.xyz/tools/accessibility-scanner") >= 0, "canonical/OG 链接");
    ok(TPL.indexOf("源码不出浏览器") >= 0, "隐私声明文案");
    ok(TPL.indexOf("application/ld+json") >= 0, "JSON-LD 面板");
    ok(TPL.indexOf("/tools/landing-page-grader") >= 0, "相关工具链接");
    ok(TPL.indexOf("/tools/static/js/accessibility_scanner.js") >= 0, "引用 JS");
    ok(TPL.indexOf("不是 WCAG 合规认证") >= 0, "能力边界声明（自查非认证）");
    ok(TPL.indexOf("零 <code>fetch</code>") >= 0 || TPL.indexOf("零 fetch") >= 0, "零网络请求声明");
    ["asc-ring-fg", "asc-score-num", "asc-score-level",
     "asc-count-pass", "asc-count-warn", "asc-count-fail"].forEach(function (id) {
        ok(TPL.indexOf('id="' + id + '"') >= 0, "模板含元素 " + id);
    });
})();

/* ---------- 汇总 ---------- */
(function () {
    console.log("\n通过 " + pass + " / 失败 " + fail + "，共 " + (pass + fail) + " 个断言");
    if (fail > 0) process.exit(1);
})();
