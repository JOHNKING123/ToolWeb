/* 时区转换器 - 纯前端 IANA 时区多选对比 + 会议时间对齐引擎
 *
 * 流程：IANA 城市库搜索多选 → Intl.DateTimeFormat 原生时区换算（DST 自动处理）
 * → 并排时间网格 → 会议时间对齐（datetime-local 在基准时区解析为瞬间，再换算各时区）
 * → 选中时区编码进 URL（?tz=）分享 / localStorage 持久化收藏与选中。
 *
 * 零第三方依赖、无后端调用、无 CDN。纯函数（offsetMinutes / isDST / zonedToUTC /
 * parts / searchCities）可在 node 下单元测试（见文件尾 module.exports）。
 */
(function () {
'use strict';

/* ---------- IANA 时区城市库：[IANA, 中文名, 别名（逗号分隔，中英混排）] ---------- */
var CITIES = [
["Asia/Shanghai","北京","上海,中国,北京时间,Beijing,Shanghai,China"],
["Asia/Tokyo","东京","日本,Tokyo,Japan"],
["Asia/Seoul","首尔","韩国,Seoul,Korea"],
["Asia/Hong_Kong","香港","Hong Kong,HK"],
["Asia/Taipei","台北","台湾,Taipei,Taiwan"],
["Asia/Singapore","新加坡","Singapore"],
["Asia/Bangkok","曼谷","泰国,Bangkok,Thailand"],
["Asia/Jakarta","雅加达","印度尼西亚,印尼,Jakarta"],
["Asia/Manila","马尼拉","菲律宾,Manila,Philippines"],
["Asia/Kuala_Lumpur","吉隆坡","马来西亚,Kuala Lumpur,Malaysia"],
["Asia/Ho_Chi_Minh","胡志明市","越南,Ho Chi Minh,Vietnam"],
["Asia/Dubai","迪拜","阿联酋,Dubai,UAE"],
["Asia/Kolkata","孟买","加尔各答,印度,Mumbai,Kolkata,India"],
["Asia/Karachi","卡拉奇","巴基斯坦,Karachi,Pakistan"],
["Asia/Dhaka","达卡","孟加拉,Dhaka,Bangladesh"],
["Asia/Colombo","科伦坡","斯里兰卡,Colombo"],
["Asia/Kathmandu","加德满都","尼泊尔,Kathmandu,Nepal"],
["Asia/Almaty","阿拉木图","哈萨克斯坦,Almaty,Kazakhstan"],
["Asia/Tashkent","塔什干","乌兹别克斯坦,Tashkent"],
["Asia/Urumqi","乌鲁木齐","新疆,Urumqi"],
["Asia/Tehran","德黑兰","伊朗,Tehran,Iran"],
["Asia/Baghdad","巴格达","伊拉克,Baghdad,Iraq"],
["Asia/Riyadh","利雅得","沙特阿拉伯,沙特,Riyadh,Saudi"],
["Asia/Jerusalem","耶路撒冷","以色列,Jerusalem,Israel"],
["Asia/Istanbul","伊斯坦布尔","土耳其,Istanbul,Turkey"],
["Asia/Moscow","莫斯科","俄罗斯,Moscow,Russia"],
["Asia/Yekaterinburg","叶卡捷琳堡","Yekaterinburg"],
["Asia/Novosibirsk","新西伯利亚","Novosibirsk"],
["Asia/Vladivostok","符拉迪沃斯托克","Vladivostok"],
["Asia/Magadan","马加丹","Magadan"],
["Asia/Kamchatka","堪察加","Kamchatka"],
["Asia/Ulaanbaatar","乌兰巴托","蒙古,Ulaanbaatar,Mongolia"],
["Asia/Pyongyang","平壤","朝鲜,Pyongyang"],
["Europe/London","伦敦","英国,London,UK,England"],
["Europe/Paris","巴黎","法国,Paris,France"],
["Europe/Berlin","柏林","德国,Berlin,Germany"],
["Europe/Rome","罗马","意大利,Rome,Italy"],
["Europe/Madrid","马德里","西班牙,Madrid,Spain"],
["Europe/Amsterdam","阿姆斯特丹","荷兰,Amsterdam,Netherlands"],
["Europe/Zurich","苏黎世","瑞士,Zurich,Switzerland"],
["Europe/Stockholm","斯德哥尔摩","瑞典,Stockholm,Sweden"],
["Europe/Helsinki","赫尔辛基","芬兰,Helsinki,Finland"],
["Europe/Athens","雅典","希腊,Athens,Greece"],
["Europe/Kyiv","基辅","乌克兰,Kyiv,Ukraine"],
["Europe/Minsk","明斯克","白俄罗斯,Minsk,Belarus"],
["Europe/Lisbon","里斯本","葡萄牙,Lisbon,Portugal"],
["Europe/Dublin","都柏林","爱尔兰,Dublin,Ireland"],
["Atlantic/Reykjavik","雷克雅未克","冰岛,Reykjavik,Iceland"],
["Africa/Cairo","开罗","埃及,Cairo,Egypt"],
["Africa/Lagos","拉各斯","尼日利亚,Lagos,Nigeria"],
["Africa/Johannesburg","约翰内斯堡","南非,Johannesburg"],
["Africa/Nairobi","内罗毕","肯尼亚,Nairobi,Kenya"],
["America/New_York","纽约","美国东部,华盛顿,New York,Washington,EST,EDT,USA"],
["America/Chicago","芝加哥","美国中部,Chicago,CST,CDT"],
["America/Denver","丹佛","美国山地,Denver,MST,MDT"],
["America/Los_Angeles","洛杉矶","美国西部,旧金山,西雅图,Los Angeles,San Francisco,Seattle,PST,PDT"],
["America/Anchorage","安克雷奇","阿拉斯加,Anchorage,Alaska"],
["Pacific/Honolulu","檀香山","夏威夷,Honolulu,Hawaii"],
["America/Toronto","多伦多","加拿大东部,Toronto,Canada"],
["America/Vancouver","温哥华","加拿大西部,Vancouver"],
["America/Mexico_City","墨西哥城","墨西哥,Mexico City"],
["America/Sao_Paulo","圣保罗","巴西,Sao Paulo,Brazil"],
["America/Buenos_Aires","布宜诺斯艾利斯","阿根廷,Buenos Aires,Argentina"],
["America/Santiago","圣地亚哥","智利,Santiago,Chile"],
["America/Bogota","波哥大","哥伦比亚,Bogota,Colombia"],
["America/Lima","利马","秘鲁,Lima,Peru"],
["America/Havana","哈瓦那","古巴,Havana,Cuba"],
["Australia/Sydney","悉尼","澳大利亚东部,Sydney,Australia"],
["Australia/Melbourne","墨尔本","Melbourne"],
["Australia/Brisbane","布里斯班","Brisbane"],
["Australia/Adelaide","阿德莱德","Adelaide"],
["Australia/Darwin","达尔文","Darwin"],
["Australia/Perth","珀斯","澳大利亚西部,Perth"],
["Pacific/Auckland","奥克兰","新西兰,Auckland,New Zealand"],
["Pacific/Fiji","苏瓦","斐济,Suva,Fiji"],
["Pacific/Guam","关岛","Guam"]
];
var CITY = {};
CITIES.forEach(function (c) { CITY[c[0]] = { iana: c[0], zh: c[1], alias: c[2] }; });

var DEFAULTS = ["Asia/Shanghai", "Europe/London", "America/New_York", "Asia/Tokyo", "Australia/Sydney"];
var LS_SEL = "tzc_sel_v1", LS_FAV = "tzc_fav_v1";

/* ---------- Intl 时间引擎 ---------- */
var dtfCache = {};
function getDTF(tz) {
    if (!dtfCache[tz]) {
        dtfCache[tz] = new Intl.DateTimeFormat("en-US", {
            timeZone: tz, hourCycle: "h23",
            year: "numeric", month: "2-digit", day: "2-digit",
            hour: "2-digit", minute: "2-digit", second: "2-digit",
            weekday: "short"
        });
    }
    return dtfCache[tz];
}
/* 瞬间 date 在时区 tz 的本地年月日时分秒 */
function parts(date, tz) {
    var o = { y: 0, mo: 0, d: 0, h: 0, mi: 0, s: 0, wd: "" };
    getDTF(tz).formatToParts(date).forEach(function (p) {
        switch (p.type) {
            case "year": o.y = +p.value; break;
            case "month": o.mo = +p.value; break;
            case "day": o.d = +p.value; break;
            case "hour": o.h = +p.value; break;
            case "minute": o.mi = +p.value; break;
            case "second": o.s = +p.value; break;
            case "weekday": o.wd = p.value; break;
        }
    });
    if (o.h === 24) o.h = 0; /* 极少数 locale 的午夜表达 */
    return o;
}
/* 时区 tz 在瞬间 date 的 UTC 偏移（分钟，东正西负） */
function offsetMinutes(date, tz) {
    var p = parts(date, tz);
    var asUTC = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s);
    return Math.round((asUTC - date.getTime()) / 60000);
}
/* 时区 tz 在瞬间 date 是否处于夏令时：1 月与 7 月偏移不同则有时制切换，
 * 标准时间取两者中较小者（东半球/西半球的常见现代时区均成立，如美东 EST-300<EDT-240、悉尼 AEST+600<AEDT+660） */
function isDST(date, tz) {
    var y = date.getUTCFullYear();
    var jan = offsetMinutes(new Date(Date.UTC(y, 0, 1, 12)), tz);
    var jul = offsetMinutes(new Date(Date.UTC(y, 6, 1, 12)), tz);
    if (jan === jul) return false;
    return offsetMinutes(date, tz) !== Math.min(jan, jul);
}
function hasDST(tz) {
    var y = new Date().getUTCFullYear();
    return offsetMinutes(new Date(Date.UTC(y, 0, 1, 12)), tz) !==
           offsetMinutes(new Date(Date.UTC(y, 6, 1, 12)), tz);
}
/* 把"时区 tz 的本地时间 y-mo-d h:mi"解析为 UTC 瞬间（毫秒）。
 * 迭代修正：先按 UTC 猜，再用该瞬间 tz 的真实偏移回代，DST 跳变边界亦收敛正确
 *（春季"丢失的一小时"落到跳变后映射，秋季重复的一小时取第一次出现）。 */
function zonedToUTC(y, mo, d, h, mi, tz) {
    var base = Date.UTC(y, mo - 1, d, h, mi, 0);
    var guess = base;
    for (var i = 0; i < 4; i++) {
        var next = base - offsetMinutes(new Date(guess), tz) * 60000;
        if (next === guess) return next;
        guess = next;
    }
    return guess;
}
/* ---------- 格式化 ---------- */
var WD_ZH = { Sun: "周日", Mon: "周一", Tue: "周二", Wed: "周三", Thu: "周四", Fri: "周五", Sat: "周六" };
function pad2(n) { return (n < 10 ? "0" : "") + n; }
function fmtOffset(min) {
    var sign = min < 0 ? "-" : "+";
    var a = Math.abs(min), h = Math.floor(a / 60), m = a % 60;
    return "UTC" + sign + h + (m ? ":" + pad2(m) : "");
}
/* 与北京时间差：返回如"快3小时" / "慢5小时30分" / "与北京时间相同" */
function fmtDiffFromBeijing(offMin, bjMin) {
    var d = offMin - bjMin;
    if (d === 0) return "与北京时间相同";
    var a = Math.abs(d), h = Math.floor(a / 60), m = a % 60;
    var s = (d > 0 ? "快" : "慢") + h + "小时" + (m ? m + "分" : "");
    return s;
}
/* ---------- 搜索 ---------- */
function searchCities(q, limit) {
    q = (q || "").trim().toLowerCase();
    if (!q) return [];
    var out = [];
    for (var i = 0; i < CITIES.length && out.length < (limit || 12); i++) {
        var c = CITIES[i];
        if (c[1].indexOf(q) !== -1 ||
            c[2].toLowerCase().indexOf(q) !== -1 ||
            c[0].toLowerCase().indexOf(q) !== -1) {
            out.push({ iana: c[0], zh: c[1], alias: c[2] });
        }
    }
    return out;
}

/* node 下单元测试导出 */
if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        CITIES: CITIES, CITY: CITY, DEFAULTS: DEFAULTS,
        parts: parts, offsetMinutes: offsetMinutes, isDST: isDST, hasDST: hasDST,
        zonedToUTC: zonedToUTC, fmtOffset: fmtOffset,
        fmtDiffFromBeijing: fmtDiffFromBeijing, searchCities: searchCities
    };
    return;
}

/* ================= 以下仅浏览器环境 ================= */
function $(id) { return document.getElementById(id); }
function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
        .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function lsGet(k, fb) {
    try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; }
    catch (e) { return fb; }
}
function lsSet(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 忽略隐私模式 */ }
}
function toast(msg) {
    var el = document.createElement("div");
    el.textContent = msg;
    el.style.cssText = "position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);" +
        "background:#111827;color:#fff;padding:.6rem 1.2rem;border-radius:.5rem;z-index:9999;font-size:.9rem;";
    document.body.appendChild(el);
    setTimeout(function () { document.body.removeChild(el); }, 1600);
}
function copyText(t, okMsg) {
    if (navigator.clipboard) {
        navigator.clipboard.writeText(t).then(function () { toast(okMsg || "已复制"); },
            function () { toast("复制失败，请手动复制"); });
    } else {
        var ta = document.createElement("textarea");
        ta.value = t; document.body.appendChild(ta); ta.select();
        try { document.execCommand("copy"); toast(okMsg || "已复制"); }
        catch (e) { toast("复制失败，请手动复制"); }
        document.body.removeChild(ta);
    }
}

var selected = [];  /* [iana...] */
var favs = [];      /* [iana...] */

function validIds(list) {
    return (list || []).filter(function (id) { return !!CITY[id]; });
}
function saveSel() {
    lsSet(LS_SEL, selected);
    updateShareURL();
}
function updateShareURL() {
    var q = selected.length ? "?tz=" + selected.map(encodeURIComponent).join(",") : "";
    try { history.replaceState(null, "", location.pathname + q); } catch (e) { /* ignore */ }
}
function shareURL() {
    return location.origin + location.pathname + "?tz=" +
        selected.map(encodeURIComponent).join(",");
}

/* ---------- 搜索 + 收藏 ---------- */
function renderSearch(q) {
    var box = $("tz-results");
    var list = searchCities(q);
    if (!list.length) {
        box.innerHTML = q.trim()
            ? '<div class="tz-empty">没有匹配的城市，换个关键词试试（如"伦敦"/"New York"/"悉尼"）</div>'
            : "";
        box.style.display = list.length || q.trim() ? "block" : "none";
        return;
    }
    box.style.display = "block";
    box.innerHTML = list.map(function (c) {
        var added = selected.indexOf(c.iana) !== -1;
        var starred = favs.indexOf(c.iana) !== -1;
        return '<div class="tz-sr">' +
            '<div class="tz-sr-info"><b>' + esc(c.zh) + '</b>' +
            '<span class="tz-iana">' + esc(c.iana) + '</span></div>' +
            '<button class="tz-mini" data-act="fav" data-tz="' + esc(c.iana) + '" title="收藏">' +
            (starred ? "★" : "☆") + "</button>" +
            '<button class="tz-mini tz-add" data-act="add" data-tz="' + esc(c.iana) + '"' +
            (added ? " disabled" : "") + ">" + (added ? "已添加" : "+ 添加") + "</button></div>";
    }).join("");
}
function renderFavs() {
    var box = $("tz-favs");
    if (!favs.length) {
        box.innerHTML = '<span class="tz-hint">在搜索结果里点 ☆ 收藏常用城市，刷新后还在。</span>';
        return;
    }
    box.innerHTML = favs.map(function (id) {
        var c = CITY[id];
        var added = selected.indexOf(id) !== -1;
        return '<button class="tz-chip" data-act="favadd" data-tz="' + esc(id) + '"' +
            (added ? ' disabled title="已在对比列表"' : "") + ">★ " + esc(c.zh) +
            '<span class="tz-chip-x" data-act="unfav" data-tz="' + esc(id) + '" title="取消收藏">×</span></button>';
    }).join("");
}

/* ---------- 并排对比 ---------- */
function addZone(id) {
    if (!CITY[id] || selected.indexOf(id) !== -1) return;
    selected.push(id);
    saveSel(); renderSelChips(); renderGrid(); renderBaseSelect(); renderMeeting();
}
function removeZone(id) {
    selected = selected.filter(function (x) { return x !== id; });
    saveSel(); renderSelChips(); renderGrid(); renderBaseSelect(); renderMeeting();
}
function renderSelChips() {
    var box = $("tz-selchips");
    box.innerHTML = selected.map(function (id) {
        var c = CITY[id];
        return '<span class="tz-chip">🕐 ' + esc(c.zh) +
            '<span class="tz-chip-x" data-act="rm" data-tz="' + esc(id) + '" title="移除">×</span></span>';
    }).join("") || '<span class="tz-hint">尚未选择时区，请在上方搜索添加。</span>';
}
function renderGrid() {
    var box = $("tz-grid");
    var now = new Date();
    var bjOff = offsetMinutes(now, "Asia/Shanghai");
    box.innerHTML = selected.map(function (id) {
        var c = CITY[id];
        var p = parts(now, id);
        var off = offsetMinutes(now, id);
        var dst = isDST(now, id);
        var badge = dst
            ? '<span class="tz-badge tz-dst">夏令时</span>'
            : (hasDST(id) ? '<span class="tz-badge">标准时间</span>'
                          : '<span class="tz-badge tz-nodst">无夏令时</span>');
        return '<div class="tz-card">' +
            '<div class="tz-card-head"><b>' + esc(c.zh) + "</b>" + badge +
            '<button class="tz-x" data-act="rm" data-tz="' + esc(id) + '" title="移除">×</button></div>' +
            '<div class="tz-iana">' + esc(id) + "</div>" +
            '<div class="tz-time" data-tz="' + esc(id) + '">' +
            pad2(p.h) + ":" + pad2(p.mi) + ":" + pad2(p.s) + "</div>" +
            '<div class="tz-date">' + p.y + "-" + pad2(p.mo) + "-" + pad2(p.d) +
            " " + (WD_ZH[p.wd] || "") + "</div>" +
            '<div class="tz-meta">' + fmtOffset(off) +
            ' · <span class="tz-diff">' + fmtDiffFromBeijing(off, bjOff) + "</span></div>" +
            "</div>";
    }).join("");
}
var tickCount = 0;
function tickGrid() {
    if (!$("tz-auto").checked) return;
    tickCount++;
    /* 每 60 秒整格重绘一次：刷新日期、UTC 偏移、夏令时徽标（跨午夜后自动校准） */
    if (tickCount % 60 === 0) { renderGrid(); return; }
    var now = new Date();
    var els = document.querySelectorAll(".tz-time[data-tz]");
    for (var i = 0; i < els.length; i++) {
        var p = parts(now, els[i].getAttribute("data-tz"));
        els[i].textContent = pad2(p.h) + ":" + pad2(p.mi) + ":" + pad2(p.s);
    }
}

/* ---------- 会议时间对齐 ---------- */
function renderBaseSelect() {
    var sel = $("mt-base"), cur = sel.value;
    sel.innerHTML = selected.map(function (id) {
        return '<option value="' + esc(id) + '">' + esc(CITY[id].zh) +
            " (" + esc(id) + ")</option>";
    }).join("");
    if (selected.indexOf(cur) !== -1) sel.value = cur;
    else if (selected.indexOf("Asia/Shanghai") !== -1) sel.value = "Asia/Shanghai";
}
function workBadge(h) {
    if (h >= 9 && h < 18)
        return '<span class="tz-badge tz-work">工作时间</span>';
    if (h >= 23 || h < 7)
        return '<span class="tz-badge tz-night">深夜</span>';
    return '<span class="tz-badge">非工作时间</span>';
}
function renderMeeting() {
    var box = $("mt-rows");
    var v = $("mt-dt").value;
    var base = $("mt-base").value;
    var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(v || "");
    if (!m || !CITY[base] || !selected.length) {
        box.innerHTML = '<div class="tz-empty">请输入会议时间并选择基准时区。</div>';
        return;
    }
    var instant = zonedToUTC(+m[1], +m[2], +m[3], +m[4], +m[5], base);
    var d = new Date(instant);
    box.innerHTML = selected.map(function (id) {
        var p = parts(d, id);
        var off = offsetMinutes(d, id);
        return '<div class="tz-mr' + (p.h >= 9 && p.h < 18 ? " tz-mr-work" : "") + '">' +
            '<div class="tz-mr-city"><b>' + esc(CITY[id].zh) + "</b>" +
            '<span class="tz-iana">' + esc(id) + "</span></div>" +
            '<div class="tz-mr-time">' + p.y + "-" + pad2(p.mo) + "-" + pad2(p.d) +
            " " + (WD_ZH[p.wd] || "") + " " +
            pad2(p.h) + ":" + pad2(p.mi) + "</div>" +
            '<div>' + workBadge(p.h) + ' <span class="tz-iana">' + fmtOffset(off) + "</span></div>" +
            "</div>";
    }).join("");
}
function meetingNow() {
    /* 按基准时区取“现在”的墙钟时间：浏览器本地时区 ≠ 基准时区时，
     * 直接用 getHours() 填充会被整体错位（评审 bug 修复）。 */
    var base = $("mt-base").value || "Asia/Shanghai";
    var p = parts(new Date(), base);
    $("mt-dt").value = p.y + "-" + pad2(p.mo) + "-" + pad2(p.d) + "T" + pad2(p.h) + ":" + pad2(p.mi);
    renderMeeting();
}

/* ---------- 初始化 ---------- */
function init() {
    /* 1) URL ?tz= 优先；2) localStorage；3) 默认五城 */
    var fromURL = null;
    try {
        var q = new URLSearchParams(location.search).get("tz");
        if (q) fromURL = validIds(q.split(",").map(decodeURIComponent));
    } catch (e) { /* ignore */ }
    selected = fromURL && fromURL.length ? fromURL : validIds(lsGet(LS_SEL, null));
    if (!selected.length) selected = DEFAULTS.slice();
    favs = validIds(lsGet(LS_FAV, []));

    renderFavs(); renderSelChips(); renderGrid(); renderBaseSelect();

    $("tz-search").addEventListener("input", function (e) { renderSearch(e.target.value); });
    document.addEventListener("click", function (e) {
        var t = e.target;
        var act = t.getAttribute && t.getAttribute("data-act");
        /* 收藏 chip 上的 ×：阻止冒泡到 chip 本身 */
        if (act === "unfav") {
            e.stopPropagation();
            favs = favs.filter(function (x) { return x !== t.getAttribute("data-tz"); });
            lsSet(LS_FAV, favs); renderFavs(); renderSearch($("tz-search").value);
            return;
        }
        if (act === "favadd") { addZone(t.getAttribute("data-tz")); return; }
        if (act === "rm") { removeZone(t.getAttribute("data-tz")); return; }
        if (!act) return;
        var id = t.getAttribute("data-tz");
        if (act === "add") { addZone(id); renderSearch($("tz-search").value); }
        else if (act === "fav") {
            if (favs.indexOf(id) === -1) { favs.push(id); toast("已收藏 " + CITY[id].zh); }
            else { favs = favs.filter(function (x) { return x !== id; }); toast("已取消收藏"); }
            lsSet(LS_FAV, favs); renderFavs(); renderSearch($("tz-search").value);
        }
    });

    $("tz-now").addEventListener("click", function () { renderGrid(); toast("已同步到当前时刻"); });
    $("tz-share").addEventListener("click", function () {
        updateShareURL(); copyText(shareURL(), "分享链接已复制");
    });
    $("mt-now").addEventListener("click", meetingNow);
    $("mt-dt").addEventListener("change", renderMeeting);
    $("mt-base").addEventListener("change", renderMeeting);

    meetingNow();
    setInterval(tickGrid, 1000);
}

if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", init);
}

})(); /* end IIFE */
