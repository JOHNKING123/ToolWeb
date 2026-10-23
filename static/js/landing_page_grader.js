/* 着陆页评分检查器（landing_page_grader）纯前端核心逻辑
 * 纯函数经 module.exports 暴露，node tests/landing_page_grader.test.js 自测；
 * 浏览器端：window.LandingPageGrader 全局 + DOM 装配（本文件末尾）。
 *
 * 设计说明：
 * - 引擎：DOMParser 本地解析粘贴的 HTML 源码 → extractModel 抽成纯数据模型 →
 *   gradePage 跑 26 条确定性规则 → 总分 0-100＋等级＋Markdown 报告。
 *   脚本零 fetch/XHR、零上传（页面文案明示「源码不出浏览器」）。
 * - 26 条规则（七组；PM 规格枚举 28 项，其中「外链 rel/HTTPS」与
 *   「canonical/robots 索引控制」各合并为 1 条，见 BACKLOG 21:00 轮规格）：
 *   SEO 基础(5)：title 长度、meta description、canonical+robots、html lang、favicon；
 *   社交分享(4)：og:title、og:description、og:image、twitter:card；
 *   内容结构(4)：H1 唯一非空、标题不跳级、正文字数≥300、图片 alt 缺失率<10%；
 *   移动友好(1)：viewport；
 *   链接(3)：至少 1 内链、外链 rel/HTTPS、无 #/javascript 占位；
 *   文案质量(5)：无 lorem ipsum、超级词密度、价格信息、CTA、联系方式；
 *   技术性能(4)：图片 width/height 防 CLS、JSON-LD、体积/标签数、重复 id。
 * - 打分：通过=100 / 警告=50 / 失败=0，总分=26 项均值四舍五入；
 *   等级：优秀≥85 / 良好≥60 / 待改进<60。
 * - 内链判定（无源站上下文，文档化口径）：以 /, ./, ../, #锚点, ? 或相对路径
 *   开头视为内链；以 http(s):// 或 // 开头视为外链（含同域绝对地址，
 *   报告中注明此口径）。
 */
(function () {
"use strict";

/* ================= 0. 分组 / 状态 / 等级 ================= */

var GROUPS = [
    { id: "seo",       name: "SEO 基础" },
    { id: "social",    name: "社交分享" },
    { id: "structure", name: "内容结构" },
    { id: "mobile",    name: "移动友好" },
    { id: "link",      name: "链接" },
    { id: "copy",      name: "文案质量" },
    { id: "tech",      name: "技术性能" }
];

function groupName(gid) {
    for (var i = 0; i < GROUPS.length; i++) {
        if (GROUPS[i].id === gid) return GROUPS[i].name;
    }
    return gid;
}

var ST_PASS = "pass", ST_WARN = "warn", ST_FAIL = "fail";
var SCORE = { pass: 100, warn: 50, fail: 0 };

function levelOf(score) {
    if (score >= 85) return "优秀";
    if (score >= 60) return "良好";
    return "待改进";
}

function statusLabel(st) {
    if (st === ST_PASS) return "通过";
    if (st === ST_WARN) return "警告";
    return "失败";
}

/* ================= 1. 纯辅助函数 ================= */

function escapeRegExp(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function trim(s) { return String(s == null ? "" : s).replace(/^\s+|\s+$/g, ""); }

/* 链接分类：internal / external / contact / placeholder / js / empty */
function linkKind(href) {
    var h = trim(href);
    if (!h) return "empty";
    if (/^(https?:)?\/\//i.test(h)) return "external";
    if (/^(mailto|tel|sms):/i.test(h)) return "contact";
    if (/^javascript:/i.test(h)) return "js";
    if (h === "#") return "placeholder";
    return "internal";
}

function isExternal(href) { return linkKind(href) === "external"; }

/* 标题层级检查：levels 为数字数组；首个标题>h1 或出现跳级（h1→h3）即不通过 */
function checkHeadingOrder(levels) {
    var prev = 0;
    for (var i = 0; i < levels.length; i++) {
        var lv = levels[i];
        if (lv < 1 || lv > 6) continue;
        if (lv > prev + 1) {
            return { ok: false, at: i, from: prev, to: lv };
        }
        prev = lv;
    }
    return { ok: true };
}

/* 重复 id */
function findDuplicateIds(ids) {
    var seen = {}, dups = [];
    (ids || []).forEach(function (id) {
        id = trim(id);
        if (!id) return;
        if (seen[id]) {
            if (dups.indexOf(id) < 0) dups.push(id);
        } else {
            seen[id] = 1;
        }
    });
    return dups;
}

/* lorem ipsum 占位文 */
function hasLoremIpsum(text) {
    return /lorem ipsum/i.test(String(text || ""));
}

/* 超级词（buzzword）密度 */
var BUZZWORDS = [
    "颠覆", "革命性", "划时代", "行业领先", "全球领先", "世界第一",
    "最佳", "第一", "极致", "完美", "震撼", "爆款", "独家", "顶级",
    "卓越", "无与伦比", "前所未有", "史无前例", "引领未来", "重新定义",
    "匠心", "臻选", "现象级",
    "revolutionary", "cutting-edge", "world-class", "best-in-class",
    "game-changer", "game changer", "disruptive", "ultimate",
    "unmatched", "unparalleled", "state-of-the-art", "groundbreaking"
];
var BUZZWORD_WARN_AT = 6;

function countBuzzwords(text) {
    var t = String(text || ""), n = 0, hits = [];
    BUZZWORDS.forEach(function (w) {
        var m = t.match(new RegExp(escapeRegExp(w), "gi"));
        if (m) {
            n += m.length;
            if (hits.indexOf(w) < 0) hits.push(w);
        }
    });
    return { count: n, hits: hits };
}

/* 价格信息 */
var PRICE_RE = /[¥￥$€£]|元|价格|定价|套餐|收费|免费|报价|多少钱|优惠价|原价|折扣/;
function hasPricing(text) { return PRICE_RE.test(String(text || "")); }

/* CTA（行动号召） */
var CTA_WORDS = [
    "立即", "马上", "免费试用", "开始使用", "立即购买", "立即下单",
    "马上购买", "马上行动", "预约", "咨询", "联系我们", "了解更多",
    "查看详情", "免费注册", "开始免费", "申请试用", "获取报价",
    "下载", "订阅", "注册", "购买", "下单",
    "buy now", "sign up", "get started", "free trial",
    "learn more", "contact us", "download", "subscribe"
];
function hasCta(model) {
    if (model.hasFormButton) return true;
    var t = String(model.bodyText || "");
    for (var i = 0; i < CTA_WORDS.length; i++) {
        if (t.indexOf(CTA_WORDS[i]) >= 0) return true;
    }
    return false;
}

/* 联系方式 */
var CONTACT_RE = /电话|手机|邮箱|微信|QQ|地址|联系方式|联系我们|客服|公众号/;
function hasContact(model) {
    var links = model.links || [];
    for (var i = 0; i < links.length; i++) {
        if (linkKind(links[i].href) === "contact") return true;
    }
    if (model.hasForm) return true;
    return CONTACT_RE.test(String(model.bodyText || ""));
}

/* 时间格式化：Date → "YYYY-MM-DD HH:mm"（本地时区） */
function fmtTime(d) {
    function p(n) { return (n < 10 ? "0" : "") + n; }
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) +
        " " + p(d.getHours()) + ":" + p(d.getMinutes());
}

/* ================= 2. 26 条规则 =================
 * 每条规则：{id, group, title, run(model) → {id, group, groupName, title,
 * status, detail, suggestion}}。detail 描述现状，suggestion 为中文修复建议。
 */

function mkResult(id, group, title, status, detail, suggestion) {
    return {
        id: id, group: group, groupName: groupName(group), title: title,
        status: status, detail: detail, suggestion: suggestion || ""
    };
}

var RULES = [
/* ---------- SEO 基础（5） ---------- */
{
    id: "seo-title", group: "seo", title: "标题（title）长度合适",
    run: function (m) {
        var t = trim(m.title);
        if (!t) return mkResult(this.id, this.group, this.title, ST_FAIL,
            "缺少 <title> 标签或标题为空，搜索结果将无法展示标题。",
            "在 <head> 中添加 <title>，长度控制在 30–60 个字符，把核心关键词前置。");
        var len = t.length;
        if (len >= 30 && len <= 60) return mkResult(this.id, this.group, this.title, ST_PASS,
            "标题 " + len + " 个字符：「" + t.slice(0, 42) + (t.length > 42 ? "…" : "") + "」", "");
        return mkResult(this.id, this.group, this.title, ST_WARN,
            "标题 " + len + " 个字符（建议 30–60），" + (len < 30 ? "过短" : "过长") + "。",
            len < 30 ? "标题过短：补充品牌词/核心卖点，扩充到 30–60 个字符。"
                     : "标题过长：搜索结果会被截断，精简到 60 个字符以内，保留核心关键词。");
    }
},
{
    id: "seo-meta-description", group: "seo", title: "描述（meta description）完整",
    run: function (m) {
        var d = trim(m.metaDescription);
        if (!d) return mkResult(this.id, this.group, this.title, ST_FAIL,
            "缺少 meta description，搜索引擎将自动抓取正文片段，展示不可控。",
            "添加 <meta name=\"description\" content=\"…\">，50–160 个字符，写一句带行动号召的页面摘要。");
        var len = d.length;
        if (len >= 50 && len <= 160) return mkResult(this.id, this.group, this.title, ST_PASS,
            "描述 " + len + " 个字符，长度合适。", "");
        return mkResult(this.id, this.group, this.title, ST_WARN,
            "描述 " + len + " 个字符（建议 50–160），" + (len < 50 ? "过短" : "过长") + "。",
            len < 50 ? "描述过短：补充卖点与行动号召，扩充到 50 个字符以上。"
                     : "描述过长：搜索结果会被截断，精简到 160 个字符以内。");
    }
},
{
    id: "seo-canonical-robots", group: "seo", title: "canonical 与 robots 索引控制",
    run: function (m) {
        var robots = trim(m.robots).toLowerCase();
        if (/(^|[\s,])noindex([,\s]|$)/.test(robots) || robots === "none") {
            return mkResult(this.id, this.group, this.title, ST_FAIL,
                "robots meta 含 noindex，页面会被搜索引擎忽略（不收录）。",
                "确认是否为有意为之；若希望被收录，删除 noindex，改为 index,follow。");
        }
        if (!trim(m.canonical)) return mkResult(this.id, this.group, this.title, ST_WARN,
            "缺少 canonical 标签，带参数/多入口的同一页面可能被判重复内容。",
            "添加 <link rel=\"canonical\" href=\"页面规范地址\">，指向该页面的唯一规范 URL。");
        return mkResult(this.id, this.group, this.title, ST_PASS,
            "canonical 已设置，robots 未屏蔽收录。", "");
    }
},
{
    id: "seo-lang", group: "seo", title: "html lang 语言属性",
    run: function (m) {
        if (trim(m.htmlLang)) return mkResult(this.id, this.group, this.title, ST_PASS,
            "html lang=\"" + trim(m.htmlLang) + "\" 已设置。", "");
        return mkResult(this.id, this.group, this.title, ST_WARN,
            "<html> 缺少 lang 属性，影响屏幕阅读器发音与搜索引擎语言判断。",
            "在 <html> 标签上添加 lang=\"zh-CN\"（中文页）等语言属性。");
    }
},
{
    id: "seo-favicon", group: "seo", title: "favicon 网站图标",
    run: function (m) {
        if (m.hasFavicon) return mkResult(this.id, this.group, this.title, ST_PASS,
            "已检测到 favicon 引用。", "");
        return mkResult(this.id, this.group, this.title, ST_WARN,
            "未检测到 favicon，浏览器标签页将显示默认空白图标，影响品牌辨识度。",
            "添加 <link rel=\"icon\" href=\"/favicon.ico\">（建议同时提供 180px apple-touch-icon）。");
    }
},
/* ---------- 社交分享（4） ---------- */
{
    id: "social-og-title", group: "social", title: "og:title 分享标题",
    run: function (m) {
        if (trim(m.ogTitle)) return mkResult(this.id, this.group, this.title, ST_PASS,
            "og:title 已设置。", "");
        return mkResult(this.id, this.group, this.title, ST_WARN,
            "缺少 og:title，分享到微信/微博/X 时标题不可控。",
            "添加 <meta property=\"og:title\" content=\"分享时显示的标题\">。");
    }
},
{
    id: "social-og-description", group: "social", title: "og:description 分享描述",
    run: function (m) {
        if (trim(m.ogDescription)) return mkResult(this.id, this.group, this.title, ST_PASS,
            "og:description 已设置。", "");
        return mkResult(this.id, this.group, this.title, ST_WARN,
            "缺少 og:description，分享卡片将无描述或抓取随机正文。",
            "添加 <meta property=\"og:description\" content=\"一句话卖点\">。");
    }
},
{
    id: "social-og-image", group: "social", title: "og:image 分享配图",
    run: function (m) {
        if (trim(m.ogImage)) return mkResult(this.id, this.group, this.title, ST_PASS,
            "og:image 已设置。", "");
        return mkResult(this.id, this.group, this.title, ST_WARN,
            "缺少 og:image，分享时无配图，点击率会明显低于有图卡片。",
            "添加 <meta property=\"og:image\" content=\"https://…/cover.jpg\">，建议 1200×630 的绝对地址。");
    }
},
{
    id: "social-twitter-card", group: "social", title: "twitter:card 卡片类型",
    run: function (m) {
        if (trim(m.twitterCard)) return mkResult(this.id, this.group, this.title, ST_PASS,
            "twitter:card=\"" + trim(m.twitterCard) + "\" 已设置。", "");
        return mkResult(this.id, this.group, this.title, ST_WARN,
            "缺少 twitter:card，在 X/Twitter 分享时只能展示小图摘要。",
            "添加 <meta name=\"twitter:card\" content=\"summary_large_image\"> 以启用大图卡片。");
    }
},
/* ---------- 内容结构（4） ---------- */
{
    id: "structure-h1", group: "structure", title: "H1 唯一且非空",
    run: function (m) {
        var h1s = (m.headings || []).filter(function (h) { return h.level === 1; });
        if (h1s.length === 0) return mkResult(this.id, this.group, this.title, ST_FAIL,
            "页面没有 H1，搜索引擎难以判断页面主题。",
            "添加且仅添加一个 H1，写清页面核心主题（含主关键词），放在首屏内容区。");
        if (h1s.length > 1) return mkResult(this.id, this.group, this.title, ST_FAIL,
            "页面有 " + h1s.length + " 个 H1，主题信号被分散。",
            "只保留一个 H1，其余降级为 H2。");
        if (!trim(h1s[0].text)) return mkResult(this.id, this.group, this.title, ST_FAIL,
            "H1 存在但文本为空。",
            "给 H1 填写可见的主题文字，不要只放图片或留空。");
        return mkResult(this.id, this.group, this.title, ST_PASS,
            "有且仅有 1 个非空 H1：「" + trim(h1s[0].text).slice(0, 30) + "」", "");
    }
},
{
    id: "structure-heading-order", group: "structure", title: "标题层级不跳级",
    run: function (m) {
        var hs = m.headings || [];
        if (!hs.length) return mkResult(this.id, this.group, this.title, ST_WARN,
            "页面没有任何标题标签（h1–h6），内容缺少结构。",
            "按内容层级添加 H1/H2/H3，让正文有清晰的提纲结构。");
        var r = checkHeadingOrder(hs.map(function (h) { return h.level; }));
        if (r.ok) return mkResult(this.id, this.group, this.title, ST_PASS,
            hs.length + " 个标题，层级递进正常。", "");
        var where = r.from === 0 ? ("首个标题就是 H" + r.to) : ("H" + r.from + " 后直接出现 H" + r.to);
        return mkResult(this.id, this.group, this.title, ST_WARN,
            "标题层级跳级：" + where + "，提纲结构断裂。",
            "标题按 H1→H2→H3 逐级使用，不要跳级；" + (r.from === 0 ? "页面应以 H1 开头。" : "在 H" + r.from + " 与 H" + r.to + " 之间补一级标题。"));
    }
},
{
    id: "structure-word-count", group: "structure", title: "正文字数充足（≥300）",
    run: function (m) {
        var n = String(m.bodyText || "").replace(/\s/g, "").length;
        if (n >= 300) return mkResult(this.id, this.group, this.title, ST_PASS,
            "正文约 " + n + " 字，内容体量充足。", "");
        if (n >= 100) return mkResult(this.id, this.group, this.title, ST_WARN,
            "正文约 " + n + " 字（建议≥300），内容偏薄，主题覆盖可能不足。",
            "补充产品介绍、使用场景、FAQ 等实质内容，让正文达到 300 字以上。");
        return mkResult(this.id, this.group, this.title, ST_FAIL,
            "正文仅约 " + n + " 字，近乎空页面，搜索引擎会判定为低质页面。",
            "先把核心卖点、功能介绍、客户案例等写足 300 字以上再上线。");
    }
},
{
    id: "structure-img-alt", group: "structure", title: "图片 alt 缺失率 <10%",
    run: function (m) {
        var imgs = m.images || [];
        if (!imgs.length) return mkResult(this.id, this.group, this.title, ST_PASS,
            "页面不含图片，无需检查 alt。", "");
        var missing = imgs.filter(function (im) { return im.alt == null; }).length;
        var rate = Math.round(missing / imgs.length * 100);
        if (rate < 10) return mkResult(this.id, this.group, this.title, ST_PASS,
            imgs.length + " 张图片，alt 缺失 " + missing + " 张（" + rate + "%）。", "");
        return mkResult(this.id, this.group, this.title, ST_WARN,
            imgs.length + " 张图片中有 " + missing + " 张缺少 alt（缺失率 " + rate + "%≥10%）。",
            "给每张内容图片加 alt=\"图片内容简述\"（装饰图可用空 alt=\"\"）；利于图片搜索与无障碍访问。");
    }
},
/* ---------- 移动友好（1） ---------- */
{
    id: "mobile-viewport", group: "mobile", title: "viewport 移动适配",
    run: function (m) {
        var v = trim(m.viewport);
        if (!v) return mkResult(this.id, this.group, this.title, ST_FAIL,
            "缺少 viewport meta，手机上页面会被缩成桌面宽度，用户体验极差。",
            "在 <head> 添加 <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">。");
        if (/width\s*=\s*device-width/i.test(v)) return mkResult(this.id, this.group, this.title, ST_PASS,
            "viewport 已正确设置：" + v.slice(0, 60), "");
        return mkResult(this.id, this.group, this.title, ST_WARN,
            "viewport 存在但未设置 width=device-width：" + v.slice(0, 60),
            "改为 content=\"width=device-width, initial-scale=1\"，确保移动端按设备宽度渲染。");
    }
},
/* ---------- 链接（3） ---------- */
{
    id: "link-internal", group: "link", title: "至少 1 个内链",
    run: function (m) {
        var n = (m.links || []).filter(function (l) { return linkKind(l.href) === "internal"; }).length;
        if (n > 0) return mkResult(this.id, this.group, this.title, ST_PASS,
            "发现 " + n + " 个内链（含站内路径与 #锚点）。", "");
        return mkResult(this.id, this.group, this.title, ST_FAIL,
            "页面没有任何内链，访客无处可去，站内权重也无法流动。",
            "添加导航、#锚点跳转或相关页面链接，至少保证 1 个可用内链。");
    }
},
{
    id: "link-external-rel-https", group: "link", title: "外链 rel 与 HTTPS",
    run: function (m) {
        var ext = (m.links || []).filter(function (l) { return isExternal(l.href); });
        if (!ext.length) return mkResult(this.id, this.group, this.title, ST_PASS,
            "页面无外链，无需检查。", "");
        var httpBad = ext.filter(function (l) { return /^http:\/\//i.test(trim(l.href)); });
        if (httpBad.length) return mkResult(this.id, this.group, this.title, ST_FAIL,
            "发现 " + httpBad.length + " 个 http:// 明文外链：「" + trim(httpBad[0].href).slice(0, 50) + "」",
            "全部改为 https:// 链接；明文外链会被浏览器标记不安全并影响信任度。");
        var noRel = ext.filter(function (l) {
            return String(l.target || "").toLowerCase() === "_blank" &&
                !/(noopener|noreferrer)/i.test(String(l.rel || ""));
        });
        if (noRel.length) return mkResult(this.id, this.group, this.title, ST_WARN,
            ext.length + " 个外链中有 " + noRel.length + " 个新窗口打开却缺少 rel 防护。",
            "给 target=\"_blank\" 的外链加上 rel=\"noopener noreferrer\"，防止反向标签页劫持。");
        return mkResult(this.id, this.group, this.title, ST_PASS,
            ext.length + " 个外链均为 HTTPS 且新窗口链接带 rel 防护。", "");
    }
},
{
    id: "link-no-placeholder", group: "link", title: "无占位链接",
    run: function (m) {
        var bad = (m.links || []).filter(function (l) {
            var k = linkKind(l.href);
            return k === "placeholder" || k === "js" || k === "empty";
        });
        if (!bad.length) return mkResult(this.id, this.group, this.title, ST_PASS,
            "未发现 href=\"#\"/javascript: 等占位链接。", "");
        return mkResult(this.id, this.group, this.title, ST_FAIL,
            "发现 " + bad.length + " 个占位链接（href=\"#\"/javascript:/空），上线前未清理干净。",
            "把占位链接换成真实目标地址；暂无目标的先去掉链接，勿留 \"#\" 凑数。");
    }
}
];

/* ---------- 文案质量（5） ---------- */
RULES.push(
{
    id: "copy-no-lorem", group: "copy", title: "无 lorem ipsum 占位文",
    run: function (m) {
        if (hasLoremIpsum(m.bodyText)) return mkResult(this.id, this.group, this.title, ST_FAIL,
            "正文检测到 lorem ipsum 占位文本——页面还在用假文案。",
            "把所有 lorem ipsum 替换为真实文案后再上线；全局搜索确认无残留。");
        return mkResult(this.id, this.group, this.title, ST_PASS,
            "未检测到 lorem ipsum 占位文。", "");
    }
},
{
    id: "copy-buzzword-wall", group: "copy", title: "无超级词堆砌",
    run: function (m) {
        var r = countBuzzwords(m.bodyText);
        if (r.count >= BUZZWORD_WARN_AT) return mkResult(this.id, this.group, this.title, ST_WARN,
            "检测到 " + r.count + " 处超级词（" + r.hits.slice(0, 6).join("、") + (r.hits.length > 6 ? "…" : "") + "），文案像自夸墙，可信度打折。",
            "删减空洞的最高级形容词，用具体数字、案例、客户证言替代自夸。");
        return mkResult(this.id, this.group, this.title, ST_PASS,
            r.count === 0 ? "未检测到超级词堆砌。" : "超级词 " + r.count + " 处，在合理范围内。", "");
    }
},
{
    id: "copy-pricing", group: "copy", title: "有价格信息",
    run: function (m) {
        if (hasPricing(m.bodyText)) return mkResult(this.id, this.group, this.title, ST_PASS,
            "检测到价格/费用相关信息。", "");
        return mkResult(this.id, this.group, this.title, ST_WARN,
            "正文未发现价格信息（¥/$/元/价格/免费等），访客无法判断成本。",
            "明确标价或套餐；免费产品也要写清「免费版包含什么」，消除价格疑虑。");
    }
},
{
    id: "copy-cta", group: "copy", title: "有行动号召（CTA）",
    run: function (m) {
        if (hasCta(m)) return mkResult(this.id, this.group, this.title, ST_PASS,
            "检测到行动号召（按钮/链接文案）。", "");
        return mkResult(this.id, this.group, this.title, ST_WARN,
            "未发现明确的行动号召，访客看完不知道下一步做什么。",
            "在首屏与结尾各放一个 CTA 按钮（如「免费试用」「立即咨询」），文案用动词开头。");
    }
},
{
    id: "copy-contact", group: "copy", title: "有联系方式",
    run: function (m) {
        if (hasContact(m)) return mkResult(this.id, this.group, this.title, ST_PASS,
            "检测到联系方式（mailto/tel/表单/联系文本）。", "");
        return mkResult(this.id, this.group, this.title, ST_WARN,
            "未发现联系方式，意向客户无法找到你。",
            "加上电话、邮箱、微信或在线表单，至少保证一种联系通道可用。");
    }
},
/* ---------- 技术性能（4） ---------- */
{
    id: "tech-img-dimensions", group: "tech", title: "图片标注宽高（防 CLS）",
    run: function (m) {
        var imgs = m.images || [];
        if (!imgs.length) return mkResult(this.id, this.group, this.title, ST_PASS,
            "页面不含图片，无需检查。", "");
        var missing = imgs.filter(function (im) { return !(im.hasWidth && im.hasHeight); }).length;
        if (!missing) return mkResult(this.id, this.group, this.title, ST_PASS,
            imgs.length + " 张图片均标注了 width/height。", "");
        return mkResult(this.id, this.group, this.title, ST_WARN,
            imgs.length + " 张图片中有 " + missing + " 张缺少 width/height，加载时会导致布局抖动（CLS）。",
            "给 <img> 加上 width 与 height 属性（或 CSS aspect-ratio），预留图片占位。");
    }
},
{
    id: "tech-jsonld", group: "tech", title: "JSON-LD 结构化数据",
    run: function (m) {
        if (m.hasJsonLd) return mkResult(this.id, this.group, this.title, ST_PASS,
            "检测到 JSON-LD 结构化数据。", "");
        return mkResult(this.id, this.group, this.title, ST_WARN,
            "缺少 JSON-LD 结构化数据，错失富媒体摘要（评分星级/面包屑等）展示机会。",
            "按页面类型添加 schema.org 的 JSON-LD（如 Product/Article/Organization）。");
    }
},
{
    id: "tech-page-size", group: "tech", title: "页面体积与标签数",
    run: function (m) {
        var kb = Math.round((m.htmlSize || 0) / 1024);
        var tags = m.tagCount || 0;
        var info = "源码约 " + kb + "KB，共 " + tags + " 个标签。";
        if ((m.htmlSize || 0) > 1024 * 1024) return mkResult(this.id, this.group, this.title, ST_FAIL,
            info + "源码超过 1MB，加载缓慢且解析吃力。",
            "压缩 HTML、拆分内联资源、延迟加载非首屏内容，把源码体积降下来。");
        if ((m.htmlSize || 0) > 200 * 1024 || tags > 1500) return mkResult(this.id, this.group, this.title, ST_WARN,
            info + "体积/标签数偏高，可能影响加载速度。",
            "检查是否引入了冗余框架与重复脚本；图片改用压缩格式并懒加载。");
        return mkResult(this.id, this.group, this.title, ST_PASS, info, "");
    }
},
{
    id: "tech-duplicate-id", group: "tech", title: "无重复 id",
    run: function (m) {
        var dups = findDuplicateIds(m.ids);
        if (!dups.length) return mkResult(this.id, this.group, this.title, ST_PASS,
            "未发现重复 id。", "");
        return mkResult(this.id, this.group, this.title, ST_FAIL,
            "发现 " + dups.length + " 组重复 id：「" + dups.slice(0, 5).join("、") + "」",
            "id 必须全页唯一；重复的改用 class，或逐一重命名。");
    }
});

/* ================= 3. 打分 / 报告 ================= */

function gradePage(model) {
    var results = RULES.map(function (r) { return r.run(model); });
    var total = 0, counts = { pass: 0, warn: 0, fail: 0 };
    results.forEach(function (x) {
        total += SCORE[x.status] || 0;
        counts[x.status]++;
    });
    var score = Math.round(total / results.length);
    return {
        score: score, level: levelOf(score), counts: counts,
        total: results.length, results: results
    };
}

/* Markdown 报告 */
function buildMarkdown(rep, timeStr) {
    var L = [];
    L.push("# 着陆页评分报告");
    L.push("");
    L.push("- 检查时间：" + timeStr);
    L.push("- 总分：**" + rep.score + " / 100**（" + rep.level + "）");
    L.push("- 通过 " + rep.counts.pass + " / 警告 " + rep.counts.warn +
        " / 失败 " + rep.counts.fail + "（共 " + rep.total + " 项）");
    L.push("");
    function section(st, icon, head) {
        var items = rep.results.filter(function (r) { return r.status === st; });
        if (!items.length) return;
        L.push("## " + icon + " " + head + "（" + items.length + "）");
        L.push("");
        items.forEach(function (r, i) {
            L.push("### " + (i + 1) + ". " + r.title + "【" + r.groupName + "】");
            L.push("- 现状：" + r.detail);
            if (r.suggestion) L.push("- 建议：" + r.suggestion);
            L.push("");
        });
    }
    section(ST_FAIL, "❌", "失败");
    section(ST_WARN, "⚠️", "警告");
    var passed = rep.results.filter(function (r) { return r.status === ST_PASS; });
    if (passed.length) {
        L.push("## ✅ 通过（" + passed.length + "）");
        L.push("");
        passed.forEach(function (r) {
            L.push("- " + r.title + "【" + r.groupName + "】" + (r.detail ? "：" + r.detail : ""));
        });
        L.push("");
    }
    L.push("> 本报告由「着陆页评分检查器」在浏览器本地生成，HTML 源码未上传到任何服务器。");
    return L.join("\n");
}

/* ================= 4. 浏览器提取层（DOMParser） ================= */

function extractModel(html) {
    if (typeof DOMParser === "undefined") return null;
    var doc;
    try {
        doc = new DOMParser().parseFromString(String(html), "text/html");
    } catch (e) {
        return null;
    }
    if (!doc || !doc.documentElement) return null;

    function one(sel) { try { return doc.querySelector(sel); } catch (e) { return null; } }
    function all(sel) {
        try { return Array.prototype.slice.call(doc.querySelectorAll(sel)); }
        catch (e) { return []; }
    }
    function metaContent(attr, name) {
        var el = one("meta[" + attr + '="' + name + '"]');
        return el ? trim(el.getAttribute("content")) : null;
    }

    var titleEl = one("title");
    var headings = all("h1,h2,h3,h4,h5,h6").map(function (el) {
        return {
            level: parseInt(el.tagName.charAt(1), 10),
            text: trim(el.textContent).slice(0, 120)
        };
    });
    var images = all("img").map(function (el) {
        return {
            alt: el.hasAttribute("alt") ? el.getAttribute("alt") : null,
            hasWidth: el.hasAttribute("width"),
            hasHeight: el.hasAttribute("height")
        };
    });
    var links = all("a[href]").map(function (el) {
        return {
            href: el.getAttribute("href") || "",
            rel: el.getAttribute("rel") || "",
            target: el.getAttribute("target") || ""
        };
    });
    var ids = all("[id]").map(function (el) { return el.getAttribute("id") || ""; });

    var bodyText = "";
    try {
        var body = doc.body;
        if (body) {
            var clone = body.cloneNode(true);
            var kill = clone.querySelectorAll("script,style,noscript,template");
            for (var i = 0; i < kill.length; i++) {
                if (kill[i].parentNode) kill[i].parentNode.removeChild(kill[i]);
            }
            bodyText = trim(String(clone.textContent || "").replace(/\s+/g, " "));
        }
    } catch (e) { bodyText = ""; }

    var hasFavicon = all("link[rel]").some(function (el) {
        return /\bicon\b/i.test(el.getAttribute("rel") || "");
    });

    return {
        htmlSize: String(html).length,
        tagCount: doc.getElementsByTagName("*").length,
        title: titleEl ? trim(titleEl.textContent) : null,
        metaDescription: metaContent("name", "description"),
        canonical: (function () {
            var el = one('link[rel="canonical"]');
            return el ? trim(el.getAttribute("href")) : null;
        })(),
        robots: metaContent("name", "robots"),
        htmlLang: doc.documentElement.getAttribute("lang"),
        hasFavicon: hasFavicon,
        viewport: metaContent("name", "viewport"),
        ogTitle: metaContent("property", "og:title"),
        ogDescription: metaContent("property", "og:description"),
        ogImage: metaContent("property", "og:image"),
        twitterCard: metaContent("name", "twitter:card"),
        headings: headings,
        bodyText: bodyText,
        images: images,
        links: links,
        ids: ids,
        hasJsonLd: !!one('script[type="application/ld+json"]'),
        hasForm: !!one("form"),
        hasFormButton: !!one("form button, form input[type=submit], form input[type=button]")
    };
}

/* ================= 5. 示例 HTML（演示用，约 6KB，预期 优秀） ================= */

var SAMPLE_HTML = [
'<!DOCTYPE html>',
'<html lang="zh-CN">',
'<head>',
'<meta charset="UTF-8">',
'<meta name="viewport" content="width=device-width, initial-scale=1">',
'<title>快记笔记 Pro - 3 秒速记工具，灵感不再丢失 | 免费试用</title>',
'<meta name="description" content="快记笔记 Pro 是一款 3 秒速记工具：打开即记、自动同步、多端可用。免费版无限制，Pro 版每月仅需 12 元，30 天无理由退款。">',
'<link rel="canonical" href="https://example.com/">',
'<meta property="og:title" content="快记笔记 Pro - 3 秒速记，灵感不再丢失">',
'<meta property="og:description" content="打开即记、自动同步、多端可用。免费开始，Pro 版每月 12 元。">',
'<meta property="og:image" content="https://example.com/cover.jpg">',
'<meta property="og:type" content="website">',
'<script type="application/ld+json">',
'{"@context":"https://schema.org","@type":"SoftwareApplication","name":"快记笔记 Pro","applicationCategory":"UtilitiesApplication","operatingSystem":"Web","offers":{"@type":"Offer","price":"12","priceCurrency":"CNY"}}',
'<\/script>',
'<style>body{font-family:sans-serif;max-width:960px;margin:auto;padding:24px;line-height:1.8;color:#222}header nav a{margin-right:16px}.btn{display:inline-block;background:#0d9488;color:#fff;padding:10px 22px;border-radius:8px;text-decoration:none;margin:6px 8px 6px 0}.btn.ghost{background:#fff;color:#0d9488;border:1px solid #0d9488}img{max-width:100%;height:auto;border-radius:8px}footer{margin-top:48px;border-top:1px solid #eee;padding-top:16px;color:#666;font-size:14px}</style>',
'</head>',
'<body>',
'<header><nav><a href="/">首页</a><a href="/features">功能</a><a href="/pricing">价格</a><a href="#download">下载</a></nav></header>',
'<main>',
'<h1>3 秒速记，灵感不再丢失</h1>',
'<p>快记笔记 Pro：打开即记，自动同步到手机、平板与电脑。免费开始，无需信用卡，随时升级 Pro 解锁更多空间。</p>',
'<div><a class="btn" href="/signup">免费试用</a><a class="btn ghost" href="#features">了解更多</a></div>',
'<p><img src="hero.png" alt="快记笔记 Pro 主界面截图" width="1200" height="630"></p>',
'<h2 id="features">为什么选择快记笔记</h2>',
'<p>灵感稍纵即逝。快记把记录的阻力降到最低：桌面端按两下快捷键、手机端点一下小组件，3 秒内开始记录。所有笔记自动同步，多端实时一致，离线也能写，联网后自动合并。</p>',
'<h3>极速记录</h3>',
'<p>启动速度以毫秒计。支持 Markdown、待办清单、语音转文字，记录方式随你挑。全文搜索毫秒级响应，几千条笔记也能瞬间找到。</p>',
'<h3>多端同步</h3>',
'<p>手机、平板、电脑、网页端全覆盖。端到端加密同步，笔记内容只有你能看到。<img src="sync.png" alt="多端同步示意图" width="800"></p>',
'<h3>安全可靠</h3>',
'<p>每日自动备份，支持导出 Markdown 与 PDF。服务器位于国内，访问稳定快速，99.9% 可用性承诺写进服务条款。</p>',
'<h2>价格方案</h2>',
'<p>免费版：无限条数笔记，2GB 同步空间，够个人日常使用。Pro 版每月 12 元：100GB 空间、版本历史、优先客服。团队版每人每月 20 元，共享工作区与管理后台。所有付费方案均支持 30 天无理由退款。</p>',
'<h2>用户评价</h2>',
'<p>“用了三年，从学生时代记到工作，搜索是真的快。”—— 产品经理 陈小姐。“同步稳得不像话，手机记一半，电脑打开接着写。”—— 自由撰稿人 老周。</p>',
'<h2 id="download">立即开始</h2>',
'<p>现在注册即送 Pro 版 14 天体验。下载桌面客户端，或直接在网页端使用，无需安装。</p>',
'<div><a class="btn" href="/signup">免费试用 14 天</a></div>',
'<h2>版本更新</h2>',
'<p>2026 年 10 月：上线语音转文字记录，识别准确率 98%，会议纪要一键生成。2026 年 9 月：发布团队工作区，支持多人协作、权限管理与共享模板。2026 年 8 月：网页端重构完成，首屏加载速度提升 40%，弱网也能秒开。2026 年 7 月：新增 Markdown 导出与打印样式，纸质归档更方便。</p>',
'<h2>媒体报道</h2>',
'<p>“快记把记录这件事做到了极简。”—— 科技早报。“小团队做出大产品，同步体验超过一众大厂笔记应用。”—— 效率周刊。“学生党的福音，免费版足够支撑四年大学的课堂笔记。”—— 校园生活报。</p>',
'<h2>功能详解</h2>',
'<p>极速记录的背后是一套为速度优化的存储引擎：笔记以增量块方式保存，每次击键只写入差异部分，即使上万字的长文也不会卡顿。全文检索引擎在本地构建倒排索引，搜索关键词时直接命中段落，支持拼音首字母与模糊匹配，打错一两个字也能找到。</p>',
'<p>多端同步采用操作转换算法：你在手机上改标题、同时在电脑上改正文，合并时两处修改都会保留，不会互相覆盖。冲突发生时自动保留两个版本并提示你确认，绝不静默丢数据。同步流量经过压缩，日常使用每月仅消耗几十 MB。</p>',
'<p>安全方面，除了传输层加密，Pro 用户可开启笔记级密码锁，敏感笔记单独设密。所有数据每日异地备份三份，保留 30 天版本历史，误删也能找回。导出功能支持 Markdown、PDF、HTML 与纯文本四种格式，带走数据零门槛。</p>',
'<h2>服务承诺</h2>',
'<p>我们承诺：免费版永久免费且不阉割核心功能；付费方案随时可退，按剩余天数比例退款；服务器故障导致 Pro 用户无法使用超过 4 小时，自动延长 7 天会员；你的笔记内容我们无权查看，员工访问需经你书面授权并全程留痕。</p>',
'<h2>适用场景</h2>',
'<p>课堂笔记：老师语速快跟不上？开启语音转文字，课后对照录音整理成结构化笔记。会议记录：待办事项自动提取，会后一键生成纪要并同步给参会人。灵感收集：通勤路上突然有想法，3 秒记下来，回家再慢慢展开成文章。读书摘抄：拍照识别书页文字，摘抄自动归档到对应书单，写书评时直接引用。</p>',
'<h2>常见问题</h2>',
'<p><b>免费版真的免费吗？</b>是的，免费版无时间限制，核心记录与同步功能全开。<b>可以导入印象笔记吗？</b>支持一键导入印象笔记、Notion 与 Markdown 文件。<b>数据安全吗？</b>传输与存储全程加密，可随时完整导出删除。</p>',
'</main>',
'<footer>',
'<p>联系我们：<a href="mailto:hi@example.com">hi@example.com</a> · <a href="tel:+8613800000000">138-0000-0000</a> · 微信公众号：快记笔记</p>',
'<p><a href="https://weibo.com/kuaiji" target="_blank" rel="noopener">微博</a> · <a href="https://example.com/blog" target="_blank" rel="noopener">官方博客</a></p>',
'<p><a href="/privacy">隐私政策</a> · <a href="/terms">服务条款</a> · <a href="/about">关于我们</a></p>',
'</footer>',
'</body>',
'</html>'
].join("\n");

/* ================= 6. 双模式导出 ================= */

var api = {
    GROUPS: GROUPS, RULES: RULES, RULE_COUNT: RULES.length,
    ST_PASS: ST_PASS, ST_WARN: ST_WARN, ST_FAIL: ST_FAIL,
    levelOf: levelOf, statusLabel: statusLabel, groupName: groupName,
    linkKind: linkKind, isExternal: isExternal,
    checkHeadingOrder: checkHeadingOrder, findDuplicateIds: findDuplicateIds,
    hasLoremIpsum: hasLoremIpsum, countBuzzwords: countBuzzwords,
    BUZZWORD_WARN_AT: BUZZWORD_WARN_AT,
    hasPricing: hasPricing, hasCta: hasCta, hasContact: hasContact,
    fmtTime: fmtTime,
    gradePage: gradePage, buildMarkdown: buildMarkdown,
    extractModel: extractModel, SAMPLE_HTML: SAMPLE_HTML
};

if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
} else if (typeof window !== "undefined") {
    window.LandingPageGrader = api;
}

/* ================= 7. 浏览器 DOM 装配 ================= */

if (typeof document !== "undefined" && typeof window !== "undefined") {
(function () {
    var LPG = (typeof window.LandingPageGrader !== "undefined")
        ? window.LandingPageGrader : api;
    var $ = function (id) { return document.getElementById(id); };

    var els = {
        input: $("lpg-input"), charcount: $("lpg-charcount"),
        grade: $("lpg-grade"), sample: $("lpg-sample"), clear: $("lpg-clear"),
        drop: $("lpg-drop"),
        result: $("lpg-result"), ringFg: $("lpg-ring-fg"),
        scoreNum: $("lpg-score-num"), scoreLevel: $("lpg-score-level"),
        cPass: $("lpg-count-pass"), cWarn: $("lpg-count-warn"), cFail: $("lpg-count-fail"),
        groups: $("lpg-groups"), toggleAll: $("lpg-toggle-all"),
        report: $("lpg-report"), copyReport: $("lpg-copy-report"),
        reportPanel: $("lpg-report-panel"),
        toast: $("lpg-toast")
    };
    if (!els.input || !els.grade) return; /* 非本工具页不装配 */

    var currentRep = null, currentFilter = "all", toastTimer = null;
    var RING_C = 2 * Math.PI * 58;

    function toast(msg) {
        if (!els.toast) return;
        els.toast.textContent = msg;
        els.toast.className = "lpg-toast lpg-show";
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(function () {
            els.toast.className = "lpg-toast";
        }, 2600);
    }

    function esc(s) {
        return String(s == null ? "" : s)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;")
            .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    function levelColor(level) {
        if (level === "优秀") return "#16a34a";
        if (level === "良好") return "#d97706";
        return "#dc2626";
    }

    function updateCount() {
        var n = els.input.value.length;
        els.charcount.textContent = "已粘贴 " + n.toLocaleString("en-US") + " 字符" +
            (n > 1024 * 1024 ? "（超过 1MB 将给出性能提示）" : "");
    }

    function doGrade() {
        var html = els.input.value;
        if (!html.replace(/\s/g, "")) { toast("请先粘贴 HTML 源码"); els.input.focus(); return; }
        if (html.length > 2 * 1024 * 1024) {
            toast("源码超过 2MB，已截断前 2MB 检查");
            html = html.slice(0, 2 * 1024 * 1024);
        }
        var model = null;
        try { model = LPG.extractModel(html); } catch (e) { model = null; }
        if (!model) { toast("解析失败：HTML 源码无法解析"); return; }
        currentRep = LPG.gradePage(model);
        currentFilter = "all";
        syncFilterButtons();
        renderAll();
        els.result.style.display = "";
        if (els.reportPanel) els.reportPanel.style.display = "";
        els.result.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function renderAll() {
        renderScore();
        renderList();
        renderReport();
    }

    function renderScore() {
        var rep = currentRep;
        els.ringFg.style.strokeDashoffset = String(RING_C * (1 - rep.score / 100));
        els.ringFg.style.stroke = levelColor(rep.level);
        els.scoreNum.textContent = rep.score;
        els.scoreNum.style.color = levelColor(rep.level);
        els.scoreLevel.textContent = rep.level;
        els.scoreLevel.style.color = levelColor(rep.level);
        els.cPass.textContent = rep.counts.pass;
        els.cWarn.textContent = rep.counts.warn;
        els.cFail.textContent = rep.counts.fail;
    }

    function badgeFor(st) {
        if (st === LPG.ST_PASS) return '<span class="lpg-badge lpg-b-pass">✓</span>';
        if (st === LPG.ST_WARN) return '<span class="lpg-badge lpg-b-warn">!</span>';
        return '<span class="lpg-badge lpg-b-fail">✕</span>';
    }
    function tagFor(st) {
        return '<span class="lpg-tag lpg-t-' + st + '">' + LPG.statusLabel(st) + "</span>";
    }

    function renderList() {
        var rep = currentRep, html = "";
        LPG.GROUPS.forEach(function (g) {
            var items = rep.results.filter(function (r) { return r.group === g.id; });
            var visible = items.filter(function (r) {
                return currentFilter === "all" || r.status === currentFilter;
            });
            if (!visible.length) return;
            var cp = items.filter(function (r) { return r.status === LPG.ST_PASS; }).length;
            var cw = items.filter(function (r) { return r.status === LPG.ST_WARN; }).length;
            var cf = items.filter(function (r) { return r.status === LPG.ST_FAIL; }).length;
            html += '<div class="lpg-group"><h4 class="lpg-group-title">' + esc(g.name) +
                '<span class="lpg-group-meta">' + cp + " 通过 · " + cw + " 警告 · " + cf + " 失败</span></h4>";
            visible.forEach(function (r) {
                html += '<div class="lpg-item lpg-st-' + r.status + '">' +
                    '<button type="button" class="lpg-item-head" data-rid="' + esc(r.id) + '">' +
                    badgeFor(r.status) +
                    '<span class="lpg-item-title">' + esc(r.title) + "</span>" +
                    tagFor(r.status) +
                    '<span class="lpg-item-arrow">▾</span>' +
                    "</button>" +
                    '<div class="lpg-item-body"><p><b>现状：</b>' + esc(r.detail) + "</p>" +
                    (r.suggestion ? "<p><b>建议：</b>" + esc(r.suggestion) + "</p>" : "") +
                    "</div></div>";
            });
            html += "</div>";
        });
        els.groups.innerHTML = html || '<div class="lpg-empty">该筛选下暂无规则。</div>';
        var heads = els.groups.querySelectorAll(".lpg-item-head");
        for (var i = 0; i < heads.length; i++) {
            heads[i].addEventListener("click", function () {
                this.parentNode.classList.toggle("lpg-open");
            });
        }
    }

    function syncFilterButtons() {
        var btns = document.querySelectorAll("#lpg-filters button");
        for (var i = 0; i < btns.length; i++) {
            btns[i].classList.toggle("lpg-f-active",
                btns[i].getAttribute("data-filter") === currentFilter);
        }
    }

    function renderReport() {
        els.report.value = LPG.buildMarkdown(currentRep, LPG.fmtTime(new Date()));
    }

    function copyText(text, okMsg) {
        function done() { toast(okMsg); }
        function fallback() {
            var ta = document.createElement("textarea");
            ta.value = text;
            ta.style.position = "fixed";
            ta.style.opacity = "0";
            document.body.appendChild(ta);
            ta.select();
            try { document.execCommand("copy"); done(); }
            catch (e) { toast("复制失败，请手动复制下方报告"); }
            document.body.removeChild(ta);
        }
        if (window.navigator && window.navigator.clipboard &&
            window.navigator.clipboard.writeText) {
            window.navigator.clipboard.writeText(text).then(done, fallback);
        } else {
            fallback();
        }
    }

    /* ---- 事件装配 ---- */
    els.grade.addEventListener("click", doGrade);
    els.sample.addEventListener("click", function () {
        els.input.value = LPG.SAMPLE_HTML;
        updateCount();
        toast("已载入示例页面，可直接点击「开始检查」");
    });
    els.clear.addEventListener("click", function () {
        els.input.value = "";
        updateCount();
        els.input.focus();
    });
    els.input.addEventListener("input", updateCount);

    var fbtns = document.querySelectorAll("#lpg-filters button");
    for (var i = 0; i < fbtns.length; i++) {
        if (!fbtns[i].getAttribute("data-filter")) continue;
        (function (b) {
            b.addEventListener("click", function () {
                currentFilter = b.getAttribute("data-filter");
                syncFilterButtons();
                renderList();
            });
        })(fbtns[i]);
    }

    if (els.toggleAll) els.toggleAll.addEventListener("click", function () {
        var items = els.groups.querySelectorAll(".lpg-item");
        var anyClosed = false;
        for (var i = 0; i < items.length; i++) {
            if (!items[i].classList.contains("lpg-open")) { anyClosed = true; break; }
        }
        for (var j = 0; j < items.length; j++) {
            items[j].classList.toggle("lpg-open", anyClosed);
        }
        els.toggleAll.textContent = anyClosed ? "全部收起" : "全部展开";
    });

    if (els.copyReport) els.copyReport.addEventListener("click", function () {
        if (!currentRep) { toast("请先运行检查"); return; }
        copyText(els.report.value, "Markdown 报告已复制");
    });

    /* 拖入 .html 文件本地读取（零上传） */
    if (els.drop) {
        ["dragenter", "dragover"].forEach(function (ev) {
            els.drop.addEventListener(ev, function (e) {
                e.preventDefault();
                els.drop.classList.add("lpg-dragover");
            });
        });
        ["dragleave", "drop"].forEach(function (ev) {
            els.drop.addEventListener(ev, function (e) {
                e.preventDefault();
                els.drop.classList.remove("lpg-dragover");
            });
        });
        els.drop.addEventListener("drop", function (e) {
            var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
            if (!f) return;
            if (!/\.html?$/i.test(f.name)) { toast("请拖入 .html 文件"); return; }
            var rd = new FileReader();
            rd.onload = function () {
                els.input.value = String(rd.result || "");
                updateCount();
                toast("已载入 " + f.name + "（本地读取，未上传）");
            };
            rd.onerror = function () { toast("文件读取失败"); };
            rd.readAsText(f);
        });
    }

    /* ---- 首次渲染 ---- */
    updateCount();
    syncFilterButtons();
})();
}
})();
