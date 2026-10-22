/* Schema.org 结构化数据生成器 - 纯前端：12 类 Schema 类型表单向导 → JSON-LD 实时生成
   零依赖、零 CDN、零后端调用、零 fetch/XHR。全部逻辑在浏览器本地完成。 */
(function () {
'use strict';

var SCHEMA_CONTEXT = "https://schema.org";

/* ============ 类型配置：12 类 Schema ============ */
/* kind: text | textarea | url | date | datetime | duration | number | enum | list | check | rows */
var SOG_TYPES = [
    {
        id: "article", label: "文章 / 新闻", icon: "📰",
        atTypes: ["Article", "NewsArticle", "BlogPosting"],
        desc: "文章、博客与新闻页面的结构化数据，支持 Google 搜索富媒体展示。",
        fields: [
            { key: "headline", label: "标题", required: true, kind: "text", placeholder: "例如：Schema.org 结构化数据完全指南" },
            { key: "authorName", label: "作者姓名", required: true, kind: "text", placeholder: "张三" },
            { key: "datePublished", label: "发布日期", required: true, kind: "date", placeholder: "2026-10-22" },
            { key: "image", label: "配图 URL", required: false, kind: "url", placeholder: "https://example.com/cover.jpg" },
            { key: "description", label: "摘要", required: false, kind: "textarea", placeholder: "一句话概括文章内容…" },
            { key: "url", label: "文章链接", required: false, kind: "url", placeholder: "https://example.com/post/1" },
            { key: "publisherName", label: "发布机构", required: false, kind: "text", placeholder: "某某媒体" },
            { key: "dateModified", label: "最后修改日期", required: false, kind: "date", placeholder: "2026-10-23" }
        ]
    },
    {
        id: "product", label: "产品", icon: "🛍️",
        atTypes: ["Product"],
        desc: "商品页结构化数据：价格、库存、评分，支持购物富媒体卡片。",
        fields: [
            { key: "name", label: "产品名称", required: true, kind: "text", placeholder: "例如：无线蓝牙耳机 Pro" },
            { key: "image", label: "产品图 URL", required: false, kind: "url", placeholder: "https://example.com/p.jpg" },
            { key: "description", label: "产品描述", required: false, kind: "textarea", placeholder: "产品卖点描述…" },
            { key: "brand", label: "品牌", required: false, kind: "text", placeholder: "品牌名" },
            { key: "sku", label: "SKU 编号", required: false, kind: "text", placeholder: "SKU-001" },
            { key: "price", label: "价格", required: true, kind: "number", placeholder: "299.00" },
            { key: "priceCurrency", label: "货币", required: true, kind: "enum", options: ["CNY", "USD", "EUR", "JPY", "HKD", "TWD", "GBP"], def: "CNY" },
            { key: "availability", label: "库存状态", required: false, kind: "enum",
              options: ["InStock", "OutOfStock", "PreOrder", "PreSale", "LimitedAvailability", "OnlineOnly", "Discontinued"], def: "InStock" },
            { key: "ratingValue", label: "评分（0-5）", required: false, kind: "number", placeholder: "4.8" },
            { key: "reviewCount", label: "评价数", required: false, kind: "number", placeholder: "1256" }
        ]
    },
    {
        id: "recipe", label: "菜谱", icon: "🍳",
        atTypes: ["Recipe"],
        desc: "菜谱结构化数据：食材、用料步骤、烹饪时长，支持食谱富媒体展示。",
        fields: [
            { key: "name", label: "菜谱名称", required: true, kind: "text", placeholder: "例如：红烧肉" },
            { key: "image", label: "成品图 URL", required: false, kind: "url", placeholder: "https://example.com/dish.jpg" },
            { key: "description", label: "简介", required: false, kind: "textarea", placeholder: "这道菜的特点…" },
            { key: "authorName", label: "作者", required: false, kind: "text", placeholder: "张大厨" },
            { key: "prepTime", label: "准备时长（ISO 8601）", required: false, kind: "duration", placeholder: "PT20M" },
            { key: "cookTime", label: "烹饪时长（ISO 8601）", required: false, kind: "duration", placeholder: "PT40M" },
            { key: "totalTime", label: "总时长（ISO 8601）", required: false, kind: "duration", placeholder: "PT1H" },
            { key: "recipeYield", label: "份量", required: false, kind: "text", placeholder: "4 人份" },
            { key: "recipeCategory", label: "分类", required: false, kind: "text", placeholder: "主菜" },
            { key: "recipeCuisine", label: "菜系", required: false, kind: "text", placeholder: "川菜" },
            { key: "recipeIngredient", label: "食材清单", required: true, kind: "list", placeholder: "每行一种食材，例如：五花肉 500g" },
            { key: "recipeInstructions", label: "制作步骤", required: true, kind: "list", placeholder: "每行一个步骤，例如：五花肉切块焯水" },
            { key: "suitableForDiet", label: "适用饮食", required: false, kind: "enum",
              options: ["", "DiabeticDiet", "GlutenFreeDiet", "HalalDiet", "KosherDiet", "LowCalorieDiet", "LowFatDiet", "VeganDiet", "VegetarianDiet"], def: "" },
            { key: "ratingValue", label: "评分（0-5）", required: false, kind: "number", placeholder: "4.9" },
            { key: "reviewCount", label: "评价数", required: false, kind: "number", placeholder: "328" }
        ]
    },
    {
        id: "event", label: "活动", icon: "🎪",
        atTypes: ["Event"],
        desc: "线上/线下活动结构化数据：时间、地点、票务，支持活动富媒体展示。",
        fields: [
            { key: "name", label: "活动名称", required: true, kind: "text", placeholder: "例如：2026 前端技术大会" },
            { key: "startDate", label: "开始时间", required: true, kind: "datetime", placeholder: "2026-11-20T09:00" },
            { key: "endDate", label: "结束时间", required: false, kind: "datetime", placeholder: "2026-11-21T18:00" },
            { key: "description", label: "活动介绍", required: false, kind: "textarea", placeholder: "活动亮点介绍…" },
            { key: "attendanceMode", label: "举办形式", required: true, kind: "enum",
              options: ["OfflineEventAttendanceMode", "OnlineEventAttendanceMode", "MixedEventAttendanceMode"], def: "OfflineEventAttendanceMode" },
            { key: "location", label: "地点 / 在线链接", required: true, kind: "text", placeholder: "线下填地址；线上填直播链接 URL" },
            { key: "eventStatus", label: "活动状态", required: false, kind: "enum",
              options: ["EventScheduled", "EventPostponed", "EventRescheduled", "EventCancelled", "EventMovedOnline"], def: "EventScheduled" },
            { key: "image", label: "海报 URL", required: false, kind: "url", placeholder: "https://example.com/poster.jpg" },
            { key: "organizerName", label: "主办方", required: false, kind: "text", placeholder: "某某协会" },
            { key: "offersPrice", label: "票价", required: false, kind: "number", placeholder: "0 表示免费" },
            { key: "offersCurrency", label: "票价货币", required: false, kind: "enum", options: ["CNY", "USD", "EUR", "JPY", "HKD"], def: "CNY" }
        ]
    },
    {
        id: "faqpage", label: "常见问题", icon: "❓",
        atTypes: ["FAQPage"],
        desc: "FAQ 页面结构化数据：问答对，支持搜索结果折叠问答展示。",
        fields: [
            { key: "faqs", label: "问答条目", required: true, kind: "rows", rowType: "faq",
              rowFields: [
                  { key: "q", label: "问题", kind: "text", placeholder: "例如：支持哪些支付方式？" },
                  { key: "a", label: "回答", kind: "textarea", placeholder: "支持微信支付、支付宝…" }
              ] }
        ]
    },
    {
        id: "breadcrumb", label: "面包屑导航", icon: "🍞",
        atTypes: ["BreadcrumbList"],
        desc: "面包屑导航结构化数据：页面层级路径，搜索结果显示层级链接。",
        fields: [
            { key: "crumbs", label: "导航层级", required: true, kind: "rows", rowType: "crumb",
              rowFields: [
                  { key: "name", label: "名称", kind: "text", placeholder: "例如：首页" },
                  { key: "item", label: "链接 URL", kind: "url", placeholder: "https://example.com/" }
              ] }
        ]
    },
    {
        id: "organization", label: "组织机构", icon: "🏢",
        atTypes: ["Organization"],
        desc: "公司/组织结构化数据：官网、Logo、联系方式、社交账号。",
        fields: [
            { key: "name", label: "组织名称", required: true, kind: "text", placeholder: "例如：某某科技有限公司" },
            { key: "url", label: "官网 URL", required: true, kind: "url", placeholder: "https://example.com" },
            { key: "logo", label: "Logo URL", required: false, kind: "url", placeholder: "https://example.com/logo.png" },
            { key: "description", label: "简介", required: false, kind: "textarea", placeholder: "组织简介…" },
            { key: "email", label: "联系邮箱", required: false, kind: "text", placeholder: "contact@example.com" },
            { key: "telephone", label: "联系电话", required: false, kind: "text", placeholder: "+86-755-12345678" },
            { key: "foundingDate", label: "成立日期", required: false, kind: "date", placeholder: "2015-06-01" },
            { key: "sameAs", label: "社交账号链接", required: false, kind: "list", placeholder: "每行一个 URL，例如：https://weibo.com/xxx" }
        ]
    },
    {
        id: "localbusiness", label: "本地商家", icon: "🏪",
        atTypes: ["LocalBusiness"],
        desc: "本地商家结构化数据：地址、电话、营业时间，支持地图/本地搜索展示。",
        fields: [
            { key: "name", label: "商家名称", required: true, kind: "text", placeholder: "例如：老街口川菜馆" },
            { key: "image", label: "门店图 URL", required: false, kind: "url", placeholder: "https://example.com/shop.jpg" },
            { key: "telephone", label: "电话", required: false, kind: "text", placeholder: "0755-88886666" },
            { key: "priceRange", label: "人均消费", required: false, kind: "text", placeholder: "¥50-80" },
            { key: "addressStreet", label: "街道地址", required: true, kind: "text", placeholder: "中山路 123 号" },
            { key: "addressLocality", label: "城市", required: true, kind: "text", placeholder: "深圳" },
            { key: "addressRegion", label: "省/州", required: false, kind: "text", placeholder: "广东" },
            { key: "postalCode", label: "邮编", required: false, kind: "text", placeholder: "518000" },
            { key: "addressCountry", label: "国家", required: false, kind: "text", placeholder: "CN" },
            { key: "openingHours", label: "营业时间", required: false, kind: "text", placeholder: "Mo-Fr 10:00-22:00" },
            { key: "url", label: "网站 URL", required: false, kind: "url", placeholder: "https://example.com" }
        ]
    },
    {
        id: "jobposting", label: "招聘职位", icon: "💼",
        atTypes: ["JobPosting"],
        desc: "招聘信息结构化数据：职位、薪资、工作地点，支持 Google 求职搜索展示。",
        fields: [
            { key: "title", label: "职位名称", required: true, kind: "text", placeholder: "例如：高级前端工程师" },
            { key: "description", label: "职位描述", required: true, kind: "textarea", placeholder: "职责要求、任职资格…" },
            { key: "datePosted", label: "发布日期", required: true, kind: "date", placeholder: "2026-10-22" },
            { key: "validThrough", label: "截止日期", required: false, kind: "date", placeholder: "2026-12-31" },
            { key: "employmentType", label: "雇佣类型", required: true, kind: "enum",
              options: ["FULL_TIME", "PART_TIME", "CONTRACTOR", "TEMPORARY", "INTERN", "VOLUNTEER", "OTHER"], def: "FULL_TIME" },
            { key: "hiringOrganization", label: "招聘公司", required: true, kind: "text", placeholder: "某某科技有限公司" },
            { key: "jobLocationLocality", label: "工作城市", required: true, kind: "text", placeholder: "深圳" },
            { key: "baseSalaryValue", label: "月薪（数字）", required: false, kind: "number", placeholder: "25000" },
            { key: "baseSalaryCurrency", label: "薪资货币", required: false, kind: "enum", options: ["CNY", "USD", "EUR", "JPY", "HKD"], def: "CNY" }
        ]
    },
    {
        id: "softwareapp", label: "软件应用", icon: "📱",
        atTypes: ["SoftwareApplication"],
        desc: "软件/App 结构化数据：分类、系统、价格、评分，支持应用搜索展示。",
        fields: [
            { key: "name", label: "应用名称", required: true, kind: "text", placeholder: "例如：番茄时钟 Pro" },
            { key: "applicationCategory", label: "应用分类", required: true, kind: "enum",
              options: ["DeveloperApplication", "UtilitiesApplication", "BusinessApplication", "MultimediaApplication", "GameApplication", "EducationalApplication", "HealthApplication", "LifestyleApplication", "SocialNetworkingApplication"], def: "UtilitiesApplication" },
            { key: "operatingSystem", label: "操作系统", required: true, kind: "text", placeholder: "例如：iOS, Android" },
            { key: "url", label: "官网/下载页 URL", required: false, kind: "url", placeholder: "https://example.com/app" },
            { key: "description", label: "应用介绍", required: false, kind: "textarea", placeholder: "功能亮点…" },
            { key: "softwareVersion", label: "版本号", required: false, kind: "text", placeholder: "2.3.1" },
            { key: "offersPrice", label: "价格", required: false, kind: "number", placeholder: "0 表示免费" },
            { key: "offersCurrency", label: "货币", required: false, kind: "enum", options: ["CNY", "USD", "EUR", "JPY", "HKD"], def: "CNY" },
            { key: "ratingValue", label: "评分（0-5）", required: false, kind: "number", placeholder: "4.7" },
            { key: "reviewCount", label: "评价数", required: false, kind: "number", placeholder: "5200" }
        ]
    },
    {
        id: "videoobject", label: "视频", icon: "🎬",
        atTypes: ["VideoObject"],
        desc: "视频结构化数据：标题、缩略图、时长、上传日期，支持视频富媒体展示。",
        fields: [
            { key: "name", label: "视频标题", required: true, kind: "text", placeholder: "例如：10 分钟学会 JSON-LD" },
            { key: "description", label: "视频简介", required: true, kind: "textarea", placeholder: "本期视频内容介绍…" },
            { key: "thumbnailUrl", label: "缩略图 URL", required: true, kind: "url", placeholder: "https://example.com/thumb.jpg" },
            { key: "uploadDate", label: "上传日期", required: true, kind: "date", placeholder: "2026-10-22" },
            { key: "duration", label: "时长（ISO 8601）", required: false, kind: "duration", placeholder: "PT10M30S" },
            { key: "contentUrl", label: "视频文件 URL", required: false, kind: "url", placeholder: "https://example.com/v.mp4" },
            { key: "embedUrl", label: "嵌入播放 URL", required: false, kind: "url", placeholder: "https://example.com/embed/v123" }
        ]
    },
    {
        id: "website", label: "网站 + 站内搜索", icon: "🌐",
        atTypes: ["WebSite"],
        desc: "网站结构化数据：可选附加 SearchAction，让搜索结果出现站内搜索框。",
        fields: [
            { key: "name", label: "网站名称", required: true, kind: "text", placeholder: "例如：程序员工具箱" },
            { key: "url", label: "网站首页 URL", required: true, kind: "url", placeholder: "https://example.com" },
            { key: "searchTarget", label: "站内搜索 URL 模板", required: false, kind: "url",
              placeholder: "https://example.com/search?q={search_term_string}",
              hint: "填写后自动附加 SearchAction（搜索结果出现站内搜索框）；模板中须包含 {search_term_string} 占位符" }
        ]
    }
];

/* 每类示例值（一键填充） */
var SOG_SAMPLES = {
    article: { headline: "Schema.org 结构化数据完全指南", authorName: "张三", datePublished: "2026-10-22",
        image: "https://example.com/cover.jpg", description: "从零学会 JSON-LD：类型、字段与校验。", url: "https://example.com/post/schema-guide", publisherName: "技术周刊" },
    product: { name: "无线蓝牙耳机 Pro", description: "主动降噪，续航 36 小时。", brand: "声阔", sku: "SKU-2026-001",
        price: "299.00", priceCurrency: "CNY", availability: "InStock", ratingValue: "4.8", reviewCount: "1256" },
    recipe: { name: "红烧肉", authorName: "张大厨", prepTime: "PT20M", cookTime: "PT40M", recipeYield: "4 人份",
        recipeCuisine: "本帮菜", recipeIngredient: "五花肉 500g\n生抽 2 勺\n冰糖 30g", recipeInstructions: "五花肉切块焯水\n下锅煸炒出油\n加调料小火炖 40 分钟", suitableForDiet: "", ratingValue: "4.9", reviewCount: "328" },
    event: { name: "2026 前端技术大会", startDate: "2026-11-20T09:00", endDate: "2026-11-21T18:00",
        description: "两天 30+ 场分享，覆盖工程化与 AI。", attendanceMode: "OfflineEventAttendanceMode",
        location: "深圳会展中心 5 号馆", eventStatus: "EventScheduled", organizerName: "前端协会", offersPrice: "399", offersCurrency: "CNY" },
    faqpage: { faqs: [ { q: "支持哪些支付方式？", a: "支持微信支付、支付宝与银联。" }, { q: "可以开发票吗？", a: "可以，下单时勾选即可开具电子发票。" } ] },
    breadcrumb: { crumbs: [ { name: "首页", item: "https://example.com/" }, { name: "博客", item: "https://example.com/blog" }, { name: "本文", item: "https://example.com/blog/1" } ] },
    organization: { name: "某某科技有限公司", url: "https://example.com", logo: "https://example.com/logo.png",
        description: "专注开发者工具的科技公司。", email: "contact@example.com", telephone: "+86-755-12345678", foundingDate: "2015-06-01",
        sameAs: "https://weibo.com/xxx\nhttps://www.zhihu.com/org/xxx" },
    localbusiness: { name: "老街口川菜馆", telephone: "0755-88886666", priceRange: "¥50-80", addressStreet: "中山路 123 号",
        addressLocality: "深圳", addressRegion: "广东", postalCode: "518000", addressCountry: "CN", openingHours: "Mo-Su 10:00-22:00", url: "https://example.com" },
    jobposting: { title: "高级前端工程师", description: "负责核心业务线前端架构，要求 3 年以上经验。", datePosted: "2026-10-22",
        validThrough: "2026-12-31", employmentType: "FULL_TIME", hiringOrganization: "某某科技有限公司", jobLocationLocality: "深圳", baseSalaryValue: "25000", baseSalaryCurrency: "CNY" },
    softwareapp: { name: "番茄时钟 Pro", applicationCategory: "UtilitiesApplication", operatingSystem: "iOS, Android",
        url: "https://example.com/app", description: "极简高效的番茄工作法计时器。", softwareVersion: "2.3.1", offersPrice: "0", offersCurrency: "CNY", ratingValue: "4.7", reviewCount: "5200" },
    videoobject: { name: "10 分钟学会 JSON-LD", description: "从零开始，手把手教你写结构化数据。", thumbnailUrl: "https://example.com/thumb.jpg",
        uploadDate: "2026-10-22", duration: "PT10M30S", contentUrl: "https://example.com/v.mp4" },
    website: { name: "程序员工具箱", url: "https://example.com", searchTarget: "https://example.com/search?q={search_term_string}" }
};

/* ============ 纯函数：校验与构建（可单元测试） ============ */

function getType(typeId) {
    for (var i = 0; i < SOG_TYPES.length; i++) {
        if (SOG_TYPES[i].id === typeId) return SOG_TYPES[i];
    }
    return null;
}

function trimStr(v) { return (v === undefined || v === null) ? "" : String(v).replace(/^\s+|\s+$/g, ""); }

function splitLines(v) {
    return trimStr(v).split(/\r?\n/).map(function (l) { return l.replace(/^\s+|\s+$/g, ""); }).filter(function (l) { return l.length > 0; });
}

var RE_URL = /^https?:\/\/\S+$/i;
var RE_DATE = /^\d{4}-\d{2}-\d{2}$/;
var RE_DATETIME = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/;
var RE_DURATION = /^(PT(\d+H)?(\d+M)?(\d+S)?|P\d+D)$/;

/* 校验单个类型的值；values: {key: string}，faq/crumb 行数据在 values.faqs / values.crumbs（数组）
   返回 { valid, errors: [{ key, label, msg }] } */
function validateValues(typeId, values) {
    var cfg = getType(typeId);
    var errors = [];
    if (!cfg) return { valid: false, errors: [{ key: "", label: "", msg: "未知类型: " + typeId }] };
    values = values || {};
    var onlineEvent = (typeId === "event" && trimStr(values.attendanceMode) === "OnlineEventAttendanceMode");

    cfg.fields.forEach(function (f) {
        var v = trimStr(values[f.key]);

        /* 动态行（FAQ / 面包屑） */
        if (f.kind === "rows") {
            var rows = values[f.key] || [];
            if (f.required && rows.length === 0) {
                errors.push({ key: f.key, label: f.label, msg: "至少添加一条" + f.label });
                return;
            }
            rows.forEach(function (row, idx) {
                f.rowFields.forEach(function (rf) {
                    var rv = trimStr(row[rf.key]);
                    var rkey = f.key + "-" + idx + "-" + rf.key;
                    var rlabel = f.label + " #" + (idx + 1) + " · " + rf.label;
                    if (rv === "") {
                        errors.push({ key: rkey, label: rlabel, msg: rf.label + "不能为空" });
                    } else if (rf.kind === "url" && !RE_URL.test(rv)) {
                        errors.push({ key: rkey, label: rlabel, msg: rf.label + "必须是 http(s):// 开头的 URL" });
                    }
                });
            });
            return;
        }

        /* 列表型 */
        if (f.kind === "list") {
            var lines = splitLines(v);
            if (f.required && lines.length === 0) {
                errors.push({ key: f.key, label: f.label, msg: f.label + "至少填写一行" });
            }
            return;
        }

        /* 必填为空 */
        if (f.required && v === "" && f.kind !== "check") {
            errors.push({ key: f.key, label: f.label, msg: f.label + "是必填项" });
            return;
        }
        if (v === "") return; /* 选填且为空：跳过格式校验 */

        /* 格式校验 */
        if (f.kind === "url" || (f.key === "location" && onlineEvent)) {
            if (!RE_URL.test(v)) errors.push({ key: f.key, label: f.label, msg: f.label + "必须是 http(s):// 开头的 URL" });
        } else if (f.kind === "date") {
            if (!RE_DATE.test(v)) errors.push({ key: f.key, label: f.label, msg: f.label + "格式应为 YYYY-MM-DD，例如 2026-10-22" });
        } else if (f.kind === "datetime") {
            if (!RE_DATETIME.test(v)) errors.push({ key: f.key, label: f.label, msg: f.label + "格式应为 YYYY-MM-DD 或 YYYY-MM-DDTHH:mm" });
        } else if (f.kind === "duration") {
            if (!RE_DURATION.test(v)) errors.push({ key: f.key, label: f.label, msg: f.label + "须为 ISO 8601 时长，如 PT20M、PT1H30M、P1D" });
        } else if (f.kind === "number") {
            if (isNaN(Number(v))) errors.push({ key: f.key, label: f.label, msg: f.label + "必须是数字" });
        } else if (f.kind === "enum") {
            if (f.options.indexOf(v) === -1) errors.push({ key: f.key, label: f.label, msg: f.label + "取值非法" });
        }
    });

    return { valid: errors.length === 0, errors: errors };
}

function num(v) { return Number(trimStr(v)); }
function has(v) { return trimStr(v) !== ""; }
function person(name) { return { "@type": "Person", "name": trimStr(name) }; }
function org(name) { return { "@type": "Organization", "name": trimStr(name) }; }

/* 构建单个类型的 JSON-LD 节点（不含 @context）；atType 覆盖默认 @type（文章类） */
function buildSchemaNode(typeId, values, atType) {
    var v = {};
    Object.keys(values || {}).forEach(function (k) { v[k] = values[k]; });
    var node = {};

    switch (typeId) {
        case "article":
            node["@type"] = atType || "Article";
            node.headline = trimStr(v.headline);
            node.author = person(v.authorName);
            node.datePublished = trimStr(v.datePublished);
            if (has(v.image)) node.image = trimStr(v.image);
            if (has(v.description)) node.description = trimStr(v.description);
            if (has(v.url)) node.url = trimStr(v.url);
            if (has(v.publisherName)) node.publisher = org(v.publisherName);
            if (has(v.dateModified)) node.dateModified = trimStr(v.dateModified);
            break;
        case "product":
            node["@type"] = "Product";
            node.name = trimStr(v.name);
            if (has(v.image)) node.image = trimStr(v.image);
            if (has(v.description)) node.description = trimStr(v.description);
            if (has(v.brand)) node.brand = org(v.brand);
            if (has(v.sku)) node.sku = trimStr(v.sku);
            var offer = { "@type": "Offer", "price": trimStr(v.price), "priceCurrency": trimStr(v.priceCurrency) || "CNY" };
            if (has(v.availability)) offer.availability = SCHEMA_CONTEXT + "/" + trimStr(v.availability);
            node.offers = offer;
            if (has(v.ratingValue)) {
                var ar = { "@type": "AggregateRating", "ratingValue": trimStr(v.ratingValue) };
                if (has(v.reviewCount)) ar.reviewCount = trimStr(v.reviewCount);
                node.aggregateRating = ar;
            }
            break;
        case "recipe":
            node["@type"] = "Recipe";
            node.name = trimStr(v.name);
            if (has(v.image)) node.image = trimStr(v.image);
            if (has(v.description)) node.description = trimStr(v.description);
            if (has(v.authorName)) node.author = person(v.authorName);
            ["prepTime", "cookTime", "totalTime"].forEach(function (k) { if (has(v[k])) node[k] = trimStr(v[k]); });
            if (has(v.recipeYield)) node.recipeYield = trimStr(v.recipeYield);
            if (has(v.recipeCategory)) node.recipeCategory = trimStr(v.recipeCategory);
            if (has(v.recipeCuisine)) node.recipeCuisine = trimStr(v.recipeCuisine);
            node.recipeIngredient = splitLines(v.recipeIngredient);
            node.recipeInstructions = splitLines(v.recipeInstructions).map(function (t) { return { "@type": "HowToStep", "text": t }; });
            if (has(v.suitableForDiet)) node.suitableForDiet = SCHEMA_CONTEXT + "/" + trimStr(v.suitableForDiet);
            if (has(v.ratingValue)) {
                var rar = { "@type": "AggregateRating", "ratingValue": trimStr(v.ratingValue) };
                if (has(v.reviewCount)) rar.reviewCount = trimStr(v.reviewCount);
                node.aggregateRating = rar;
            }
            break;
        case "event":
            node["@type"] = "Event";
            node.name = trimStr(v.name);
            node.startDate = trimStr(v.startDate);
            if (has(v.endDate)) node.endDate = trimStr(v.endDate);
            if (has(v.description)) node.description = trimStr(v.description);
            var mode = trimStr(v.attendanceMode) || "OfflineEventAttendanceMode";
            node.eventAttendanceMode = SCHEMA_CONTEXT + "/" + mode;
            var loc = trimStr(v.location);
            if (mode === "OnlineEventAttendanceMode") {
                node.location = { "@type": "VirtualLocation", "url": loc };
            } else {
                node.location = { "@type": "Place", "name": loc };
            }
            if (has(v.eventStatus)) node.eventStatus = SCHEMA_CONTEXT + "/" + trimStr(v.eventStatus);
            if (has(v.image)) node.image = trimStr(v.image);
            if (has(v.organizerName)) node.organizer = org(v.organizerName);
            if (has(v.offersPrice)) {
                node.offers = { "@type": "Offer", "price": trimStr(v.offersPrice), "priceCurrency": trimStr(v.offersCurrency) || "CNY" };
            }
            break;
        case "faqpage":
            node["@type"] = "FAQPage";
            node.mainEntity = (v.faqs || []).map(function (row) {
                return { "@type": "Question", "name": trimStr(row.q),
                    "acceptedAnswer": { "@type": "Answer", "text": trimStr(row.a) } };
            });
            break;
        case "breadcrumb":
            node["@type"] = "BreadcrumbList";
            node.itemListElement = (v.crumbs || []).map(function (row, i) {
                return { "@type": "ListItem", "position": i + 1, "name": trimStr(row.name), "item": trimStr(row.item) };
            });
            break;
        case "organization":
            node["@type"] = "Organization";
            node.name = trimStr(v.name);
            node.url = trimStr(v.url);
            if (has(v.logo)) node.logo = trimStr(v.logo);
            if (has(v.description)) node.description = trimStr(v.description);
            if (has(v.email)) node.email = trimStr(v.email);
            if (has(v.telephone)) node.telephone = trimStr(v.telephone);
            if (has(v.foundingDate)) node.foundingDate = trimStr(v.foundingDate);
            var sameAs = splitLines(v.sameAs);
            if (sameAs.length) node.sameAs = sameAs;
            break;
        case "localbusiness":
            node["@type"] = "LocalBusiness";
            node.name = trimStr(v.name);
            if (has(v.image)) node.image = trimStr(v.image);
            if (has(v.telephone)) node.telephone = trimStr(v.telephone);
            if (has(v.priceRange)) node.priceRange = trimStr(v.priceRange);
            var addr = { "@type": "PostalAddress", "streetAddress": trimStr(v.addressStreet), "addressLocality": trimStr(v.addressLocality) };
            if (has(v.addressRegion)) addr.addressRegion = trimStr(v.addressRegion);
            if (has(v.postalCode)) addr.postalCode = trimStr(v.postalCode);
            if (has(v.addressCountry)) addr.addressCountry = trimStr(v.addressCountry);
            node.address = addr;
            if (has(v.openingHours)) node.openingHours = trimStr(v.openingHours);
            if (has(v.url)) node.url = trimStr(v.url);
            break;
        case "jobposting":
            node["@type"] = "JobPosting";
            node.title = trimStr(v.title);
            node.description = trimStr(v.description);
            node.datePosted = trimStr(v.datePosted);
            if (has(v.validThrough)) node.validThrough = trimStr(v.validThrough);
            node.employmentType = trimStr(v.employmentType) || "FULL_TIME";
            node.hiringOrganization = org(v.hiringOrganization);
            node.jobLocation = { "@type": "Place", "address": { "@type": "PostalAddress", "addressLocality": trimStr(v.jobLocationLocality) } };
            if (has(v.baseSalaryValue)) {
                node.baseSalary = { "@type": "MonetaryAmount", "currency": trimStr(v.baseSalaryCurrency) || "CNY",
                    "value": { "@type": "QuantitativeValue", "value": num(v.baseSalaryValue), "unitText": "MONTH" } };
            }
            break;
        case "softwareapp":
            node["@type"] = "SoftwareApplication";
            node.name = trimStr(v.name);
            node.applicationCategory = trimStr(v.applicationCategory) || "UtilitiesApplication";
            node.operatingSystem = trimStr(v.operatingSystem);
            if (has(v.url)) node.url = trimStr(v.url);
            if (has(v.description)) node.description = trimStr(v.description);
            if (has(v.softwareVersion)) node.softwareVersion = trimStr(v.softwareVersion);
            if (has(v.offersPrice)) {
                node.offers = { "@type": "Offer", "price": trimStr(v.offersPrice), "priceCurrency": trimStr(v.offersCurrency) || "CNY" };
            }
            if (has(v.ratingValue)) {
                var sar = { "@type": "AggregateRating", "ratingValue": trimStr(v.ratingValue) };
                if (has(v.reviewCount)) sar.reviewCount = trimStr(v.reviewCount);
                node.aggregateRating = sar;
            }
            break;
        case "videoobject":
            node["@type"] = "VideoObject";
            node.name = trimStr(v.name);
            node.description = trimStr(v.description);
            node.thumbnailUrl = trimStr(v.thumbnailUrl);
            node.uploadDate = trimStr(v.uploadDate);
            if (has(v.duration)) node.duration = trimStr(v.duration);
            if (has(v.contentUrl)) node.contentUrl = trimStr(v.contentUrl);
            if (has(v.embedUrl)) node.embedUrl = trimStr(v.embedUrl);
            break;
        case "website":
            node["@type"] = "WebSite";
            node.name = trimStr(v.name);
            node.url = trimStr(v.url);
            if (has(v.searchTarget)) {
                node.potentialAction = { "@type": "SearchAction",
                    "target": { "@type": "EntryPoint", "urlTemplate": trimStr(v.searchTarget) },
                    "query-input": "required name=search_term_string" };
            }
            break;
        default:
            node["@type"] = "Thing";
    }
    return node;
}

/* 构建最终输出：selections = [{ typeId, atType, values }]
   返回 { validAll, results:[{typeId,label,valid,errors,node}], json, text } */
function buildOutput(selections) {
    var results = (selections || []).map(function (s) {
        var cfg = getType(s.typeId);
        var vr = validateValues(s.typeId, s.values);
        var node = vr.valid ? buildSchemaNode(s.typeId, s.values, s.atType) : null;
        return { typeId: s.typeId, label: cfg ? cfg.label : s.typeId, valid: vr.valid, errors: vr.errors, node: node };
    });
    var validNodes = results.filter(function (r) { return r.valid; }).map(function (r) { return r.node; });
    var json = null;
    if (validNodes.length === 1) {
        json = { "@context": SCHEMA_CONTEXT };
        Object.keys(validNodes[0]).forEach(function (k) { json[k] = validNodes[0][k]; });
    } else if (validNodes.length > 1) {
        json = { "@context": SCHEMA_CONTEXT, "@graph": validNodes };
    }
    return {
        validAll: results.length > 0 && results.every(function (r) { return r.valid; }),
        results: results,
        json: json,
        text: json ? JSON.stringify(json, null, 2) : ""
    };
}

function buildJsonLdText(obj) { return JSON.stringify(obj, null, 2); }

/* 生成可直接粘贴到 <head> 的 HTML 片段 */
function buildHtmlSnippet(jsonText) {
    var safe = String(jsonText).replace(/<\/script/gi, "<\\/script");
    return '<script type="application/ld+json">\n' + safe + '\n</script>';
}

/* node 单元测试导出 */
if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        SCHEMA_CONTEXT: SCHEMA_CONTEXT,
        SOG_TYPES: SOG_TYPES,
        SOG_SAMPLES: SOG_SAMPLES,
        getType: getType,
        validateValues: validateValues,
        buildSchemaNode: buildSchemaNode,
        buildOutput: buildOutput,
        buildJsonLdText: buildJsonLdText,
        buildHtmlSnippet: buildHtmlSnippet,
        splitLines: splitLines
    };
}

/* ============ 浏览器 UI（仅在有 document 时执行） ============ */
if (typeof document !== "undefined") {

var $ = function (id) { return document.getElementById(id); };

var state = {
    active: "article",
    checked: { article: true },
    values: {},   /* typeId -> {key: string} */
    rows: {},     /* typeId -> {faqs: [...], crumbs: [...]} */
    atType: {}    /* typeId -> 选中的 @type（文章类） */
};

function getValues(typeId) {
    if (!state.values[typeId]) state.values[typeId] = {};
    return state.values[typeId];
}
function getRows(typeId, key) {
    if (!state.rows[typeId]) state.rows[typeId] = {};
    if (!state.rows[typeId][key]) state.rows[typeId][key] = [];
    return state.rows[typeId][key];
}

function escHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/* ---------- 左侧类型标签页 ---------- */
function renderTabs() {
    var box = $("sog-tabs");
    var html = "";
    SOG_TYPES.forEach(function (t) {
        var checked = state.checked[t.id] ? " checked" : "";
        var act = state.active === t.id ? " sog-tab-active" : "";
        var vr = validateValues(t.id, collectValues(t.id));
        var dot = vr.valid ? "" : ' <span class="sog-tab-err" title="有未通过的校验">●</span>';
        html += '<div class="sog-tab' + act + '" data-tab="' + t.id + '">' +
            '<label class="sog-check" title="加入输出堆叠"><input type="checkbox" data-check="' + t.id + '"' + checked + '></label>' +
            '<span class="sog-tab-main"><span class="sog-tab-icon">' + t.icon + '</span>' +
            '<span class="sog-tab-label">' + escHtml(t.label) + '</span>' + dot + '</span></div>';
    });
    box.innerHTML = html;
    box.querySelectorAll(".sog-tab").forEach(function (el) {
        el.addEventListener("click", function (e) {
            if (e.target && e.target.getAttribute("data-check") !== null) return;
            state.active = el.getAttribute("data-tab");
            renderTabs(); renderForm(); renderOutput();
        });
    });
    box.querySelectorAll("input[data-check]").forEach(function (cb) {
        cb.addEventListener("change", function () {
            var id = cb.getAttribute("data-check");
            if (cb.checked) state.checked[id] = true; else delete state.checked[id];
            renderOutput();
        });
    });
}

/* ---------- 中部表单 ---------- */
function fieldId(typeId, key) { return "sog-f-" + typeId + "-" + key.replace(/[^a-zA-Z0-9]+/g, "-"); }

function renderForm() {
    var t = getType(state.active);
    var vals = getValues(t.id);
    var html = '<div class="sog-form-head"><h2>' + t.icon + ' ' + escHtml(t.label) + '</h2>' +
        '<p class="sog-form-desc">' + escHtml(t.desc) + '</p>';
    if (t.atTypes && t.atTypes.length > 1) {
        var cur = state.atType[t.id] || t.atTypes[0];
        html += '<div class="sog-field"><label class="sog-label">@type 子类型</label><select class="sog-input" id="sog-attype">';
        t.atTypes.forEach(function (at) {
            html += '<option value="' + at + '"' + (at === cur ? " selected" : "") + '>' + at + '</option>';
        });
        html += '</select></div>';
    }
    html += '<div class="sog-form-tools">' +
        '<button type="button" class="sog-btn" id="sog-sample">✨ 填充示例</button>' +
        '<button type="button" class="sog-btn" id="sog-clear-tab">🗑️ 清空本页</button></div></div>';

    t.fields.forEach(function (f) {
        html += renderField(t.id, f, vals[f.key] || "");
    });
    $("sog-form").innerHTML = html;

    var atSel = $("sog-attype");
    if (atSel) atSel.addEventListener("change", function () { state.atType[t.id] = atSel.value; renderOutput(); });

    t.fields.forEach(function (f) { bindField(t.id, f); });

    $("sog-sample").addEventListener("click", function () {
        var s = SOG_SAMPLES[t.id] || {};
        var vals2 = getValues(t.id);
        Object.keys(s).forEach(function (k) {
            if (k === "faqs" || k === "crumbs") { state.rows[t.id] = state.rows[t.id] || {}; state.rows[t.id][k] = s[k].map(function (r) { return { q: r.q, a: r.a, name: r.name, item: r.item }; }); }
            else vals2[k] = s[k];
        });
        state.checked[t.id] = true;
        renderTabs(); renderForm(); renderOutput();
    });
    $("sog-clear-tab").addEventListener("click", function () {
        state.values[t.id] = {}; state.rows[t.id] = {};
        renderForm(); renderTabs(); renderOutput();
    });
}

function renderField(typeId, f, val) {
    var req = f.required ? ' <span class="sog-req">*</span>' : "";
    var fid = fieldId(typeId, f.key);
    var hint = f.hint ? '<div class="sog-hint">' + escHtml(f.hint) + '</div>' : "";
    var h = '<div class="sog-field" id="wrap-' + fid + '"><label class="sog-label" for="' + fid + '">' + escHtml(f.label) + req + '</label>';
    if (f.kind === "textarea") {
        h += '<textarea class="sog-input" id="' + fid + '" rows="3" placeholder="' + escHtml(f.placeholder || "") + '">' + escHtml(val) + '</textarea>';
    } else if (f.kind === "list") {
        h += '<textarea class="sog-input" id="' + fid + '" rows="4" placeholder="' + escHtml(f.placeholder || "") + '">' + escHtml(val) + '</textarea>' +
             '<div class="sog-hint">每行一条</div>';
    } else if (f.kind === "enum") {
        h += '<select class="sog-input" id="' + fid + '">';
        f.options.forEach(function (o) {
            var v = val !== "" ? val : (f.def || "");
            h += '<option value="' + escHtml(o) + '"' + (o === v ? " selected" : "") + '>' + (o === "" ? "（不设置）" : escHtml(o)) + '</option>';
        });
        h += '</select>';
    } else if (f.kind === "date") {
        h += '<input class="sog-input" id="' + fid + '" type="date" value="' + escHtml(val) + '">';
    } else if (f.kind === "datetime") {
        h += '<input class="sog-input" id="' + fid + '" type="datetime-local" value="' + escHtml(val) + '">';
    } else if (f.kind === "number") {
        h += '<input class="sog-input" id="' + fid + '" type="number" step="any" value="' + escHtml(val) + '" placeholder="' + escHtml(f.placeholder || "") + '">';
    } else if (f.kind === "url") {
        h += '<input class="sog-input" id="' + fid + '" type="url" value="' + escHtml(val) + '" placeholder="' + escHtml(f.placeholder || "") + '">';
    } else if (f.kind === "rows") {
        h += renderRowsEditor(typeId, f);
    } else {
        h += '<input class="sog-input" id="' + fid + '" type="text" value="' + escHtml(val) + '" placeholder="' + escHtml(f.placeholder || "") + '">';
    }
    h += hint + '<div class="sog-err" id="err-' + fid + '"></div></div>';
    return h;
}

function renderRowsEditor(typeId, f) {
    var rows = getRows(typeId, f.key);
    var h = '<div class="sog-rows" id="rows-' + typeId + "-" + f.key + '">';
    rows.forEach(function (row, i) { h += renderOneRow(typeId, f, i, row); });
    h += '</div><button type="button" class="sog-btn sog-add-row" data-addrow="' + typeId + "|" + f.key + '">＋ 添加' + escHtml(f.rowType === "faq" ? "问答" : "层级") + '</button>';
    return h;
}

function renderOneRow(typeId, f, i, row) {
    var h = '<div class="sog-row" data-row="' + i + '"><div class="sog-row-head"><span>#' + (i + 1) + '</span>' +
        '<button type="button" class="sog-row-del" data-delrow="' + typeId + "|" + f.key + "|" + i + '" title="删除">✕</button></div>';
    f.rowFields.forEach(function (rf) {
        var fid = fieldId(typeId, f.key + "-" + i + "-" + rf.key);
        var val = row[rf.key] || "";
        h += '<label class="sog-label sog-row-label" for="' + fid + '">' + escHtml(rf.label) + ' <span class="sog-req">*</span></label>';
        if (rf.kind === "textarea") h += '<textarea class="sog-input" id="' + fid + '" rows="2" placeholder="' + escHtml(rf.placeholder || "") + '">' + escHtml(val) + '</textarea>';
        else h += '<input class="sog-input" id="' + fid + '" type="text" value="' + escHtml(val) + '" placeholder="' + escHtml(rf.placeholder || "") + '">';
        h += '<div class="sog-err" id="err-' + fid + '"></div>';
    });
    h += '</div>';
    return h;
}

function bindField(typeId, f) {
    var fid = fieldId(typeId, f.key);
    if (f.kind === "rows") {
        var box = $("rows-" + typeId + "-" + f.key);
        var rows = getRows(typeId, f.key);
        box.querySelectorAll("input.sog-input, textarea.sog-input").forEach(function (inp) {
            inp.addEventListener("input", function () {
                var rest = inp.id.replace("sog-f-" + typeId + "-" + f.key + "-", "").split("-");
                var idx = parseInt(rest[0], 10), rk = rest.slice(1).join("-");
                rows[idx][rk] = inp.value;
                state.checked[typeId] = true;
                onEdit();
            });
        });
        box.querySelectorAll("[data-delrow]").forEach(function (btn) {
            btn.addEventListener("click", function () {
                var p = btn.getAttribute("data-delrow").split("|");
                getRows(p[0], p[1]).splice(parseInt(p[2], 10), 1);
                renderForm(); renderTabs(); renderOutput();
            });
        });
        var addBtn = document.querySelector('[data-addrow="' + typeId + "|" + f.key + '"]');
        if (addBtn) addBtn.addEventListener("click", function () {
            var nr = {};
            f.rowFields.forEach(function (rf) { nr[rf.key] = ""; });
            getRows(typeId, f.key).push(nr);
            state.checked[typeId] = true;
            renderForm(); renderTabs(); renderOutput();
            var list = getRows(typeId, f.key);
            var last = $("rows-" + typeId + "-" + f.key);
            if (last) { var first = last.querySelector('.sog-row[data-row="' + (list.length - 1) + '"] input'); if (first) first.focus(); }
        });
        return;
    }
    var el = $(fid);
    if (!el) return;
    el.addEventListener("input", function () {
        getValues(typeId)[f.key] = el.value;
        state.checked[typeId] = true;
        onEdit();
    });
    el.addEventListener("change", function () {
        getValues(typeId)[f.key] = el.value;
        state.checked[typeId] = true;
        onEdit();
    });
}

function onEdit() { renderTabs(); renderOutput(); }

/* 收集某类型的完整 values（含行数据） */
function collectValues(typeId) {
    var cfg = getType(typeId);
    var vals = {};
    var base = getValues(typeId);
    Object.keys(base).forEach(function (k) { vals[k] = base[k]; });
    (cfg.fields || []).forEach(function (f) {
        if (f.kind === "rows") vals[f.key] = getRows(typeId, f.key);
    });
    return vals;
}

function collectSelections() {
    return Object.keys(state.checked).map(function (id) {
        return { typeId: id, atType: state.atType[id], values: collectValues(id) };
    }).filter(function (s) { return getType(s.typeId); });
}

/* ---------- 右侧输出 ---------- */
function highlightJson(text) {
    var esc = String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return esc.replace(/("(\\u[0-9a-fA-F]{4}|\\[^u]|[^\\"])*"(\s*:)?|\btrue\b|\bfalse\b|\bnull\b|-?\d+(\.\d+)?([eE][+-]?\d+)?)/g, function (m) {
        var cls = "num";
        if (m.charAt(0) === '"') cls = /:\s*$/.test(m) ? "key" : "str";
        else if (m === "true" || m === "false") cls = "bool";
        else if (m === "null") cls = "null";
        return '<span class="sog-t-' + cls + '">' + m + "</span>";
    });
}

var lastOut = null;

function renderOutput() {
    var sels = collectSelections();
    var out = buildOutput(sels);
    lastOut = out;

    var pre = $("sog-preview");
    if (out.text) {
        pre.innerHTML = highlightJson(out.text);
    } else {
        pre.textContent = "// 在左侧勾选类型并填写表单，JSON-LD 将实时显示在这里…";
    }

    /* 按钮启用/禁用 */
    var ok = !!out.text;
    ["sog-copy", "sog-dl-json", "sog-dl-html"].forEach(function (id) { $(id).disabled = !ok; });

    /* 状态条 */
    var st = $("sog-status");
    var nValid = out.results.filter(function (r) { return r.valid; }).length;
    var nErr = out.results.filter(function (r) { return !r.valid; }).length;
    if (sels.length === 0) {
        st.className = "sog-status";
        st.textContent = "尚未勾选任何类型：在左侧勾选要生成的 Schema 类型。";
    } else if (nErr === 0) {
        st.className = "sog-status sog-ok";
        st.textContent = "✅ " + nValid + " 个类型校验通过" + (nValid > 1 ? "（@graph 堆叠输出）" : "") + "，可复制 / 下载。";
    } else {
        st.className = "sog-status sog-fail";
        st.textContent = "⚠️ " + nErr + " 个类型有 " + out.results.reduce(function (a, r) { return a + r.errors.length; }, 0) +
            " 处错误（未加入输出），" + nValid + " 个类型已就绪。点击下方错误可定位到字段。";
    }

    /* 错误列表（内联定位） */
    var box = $("sog-errors");
    var html = "";
    out.results.forEach(function (r) {
        if (r.valid) return;
        html += '<div class="sog-err-group"><div class="sog-err-type">' + escHtml(r.label) + ' <span class="sog-count">' + r.errors.length + "</span></div>";
        r.errors.forEach(function (e, i) {
            html += '<button type="button" class="sog-error-item" data-goto="' + r.typeId + "|" + escHtml(e.key) + '">' +
                '<span class="sog-err-no">' + (i + 1) + "</span>" +
                '<span class="sog-err-body"><span class="sog-err-path">' + escHtml(e.label) + "</span>" +
                '<span class="sog-err-msg">' + escHtml(e.msg) + "</span></span></button>";
        });
        html += "</div>";
    });
    box.innerHTML = html;
    box.querySelectorAll("[data-goto]").forEach(function (btn) {
        btn.addEventListener("click", function () {
            var p = btn.getAttribute("data-goto").split("|");
            state.active = p[0];
            renderTabs(); renderForm(); renderOutput();
            setTimeout(function () {
                var fid = fieldId(p[0], p[1]);
                var el = $(fid) || $("wrap-" + fid);
                if (el) {
                    el.scrollIntoView({ block: "center", behavior: "smooth" });
                    var target = $("wrap-" + fid) || el;
                    target.classList.add("sog-flash");
                    setTimeout(function () { target.classList.remove("sog-flash"); }, 1200);
                    var inp = $(fid);
                    if (inp && inp.focus) inp.focus({ preventScroll: true });
                }
            }, 60);
        });
    });

    /* 表单内联错误标记 */
    document.querySelectorAll(".sog-field.sog-invalid").forEach(function (el) { el.classList.remove("sog-invalid"); });
    document.querySelectorAll(".sog-err").forEach(function (el) { el.textContent = ""; });
    out.results.forEach(function (r) {
        if (r.valid || r.typeId !== state.active) return;
        r.errors.forEach(function (e) {
            var fid = fieldId(r.typeId, e.key);
            var wrap = $("wrap-" + fid);
            if (wrap) wrap.classList.add("sog-invalid");
            var msg = $("err-" + fid);
            if (msg) msg.textContent = e.msg;
        });
    });
}

/* ---------- 复制 / 下载 ---------- */
function copyText(t, done) {
    function fallback() {
        var ta = document.createElement("textarea");
        ta.value = t;
        ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        var ok = false;
        try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
        document.body.removeChild(ta);
        done(ok);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(t).then(function () { done(true); }, function () { fallback(); });
    } else fallback();
}

function downloadFile(name, content, mime) {
    var blob = new Blob([content], { type: mime + ";charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
}

function toast(msg, ok) {
    var t = $("sog-toast");
    t.textContent = msg;
    t.className = "sog-toast show " + (ok ? "ok" : "fail");
    setTimeout(function () { t.className = "sog-toast"; }, 2200);
}

document.addEventListener("DOMContentLoaded", function () {
    /* enum 默认值预填 */
    SOG_TYPES.forEach(function (t) {
        var vals = getValues(t.id);
        (t.fields || []).forEach(function (f) {
            if (f.kind === "enum" && f.def !== undefined && vals[f.key] === undefined) vals[f.key] = f.def;
        });
        /* FAQ / 面包屑默认给一行空行，方便直接填写 */
        (t.fields || []).forEach(function (f) {
            if (f.kind === "rows") {
                var rows = getRows(t.id, f.key);
                if (rows.length === 0) {
                    var nr = {};
                    f.rowFields.forEach(function (rf) { nr[rf.key] = ""; });
                    rows.push(nr);
                }
            }
        });
    });

    renderTabs();
    renderForm();
    renderOutput();

    $("sog-copy").addEventListener("click", function () {
        if (!lastOut || !lastOut.text) return;
        copyText(lastOut.text, function (ok) { toast(ok ? "✅ JSON-LD 已复制到剪贴板" : "❌ 复制失败，请手动选择复制", ok); });
    });
    $("sog-dl-json").addEventListener("click", function () {
        if (!lastOut || !lastOut.text) return;
        downloadFile("schema-org.json", lastOut.text, "application/ld+json");
        toast("✅ schema-org.json 已开始下载", true);
    });
    $("sog-dl-html").addEventListener("click", function () {
        if (!lastOut || !lastOut.text) return;
        downloadFile("schema-org.html", buildHtmlSnippet(lastOut.text), "text/html");
        toast("✅ HTML 片段已开始下载（可直接粘贴进 <head>）", true);
    });
    $("sog-check-all").addEventListener("click", function () {
        SOG_TYPES.forEach(function (t) { state.checked[t.id] = true; });
        renderTabs(); renderOutput();
    });
    $("sog-uncheck-all").addEventListener("click", function () {
        state.checked = {};
        renderTabs(); renderOutput();
    });
});

} /* typeof document !== "undefined" */
})();
