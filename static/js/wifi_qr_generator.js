/* WiFi 二维码生成器 - 纯前端：表单 → WIFI: 协议串 → 二维码实时渲染/下载/打印海报
 * 零后端、零 fetch/XHR、零 CDN。二维码渲染依赖本地 vendored 的 qrcode-generator 1.4.4。
 * Node 自测：require 本文件即可拿到纯函数（协议串构建/转义/校验/矩阵/SVG 生成）。
 */
(function () {
'use strict';

/* ============ 常量配置 ============ */
var WIFI_AUTHS = [
    { id: "wpa",    label: "WPA / WPA2 / WPA3", code: "WPA",    needPwd: true,
      hint: "家用/办公最常见。密码 8–63 个字符（或 64 位十六进制）。" },
    { id: "wep",    label: "WEP（老旧设备）",  code: "WEP",    needPwd: true,
      hint: "仅老旧设备。密码 5 或 13 个 ASCII 字符，或 10/26 位十六进制。" },
    { id: "nopass", label: "无密码（开放网络）", code: "nopass", needPwd: false,
      hint: "开放网络：协议串不含密码段，密码栏自动禁用。" }
];

var EC_LEVELS = [
    { id: "M", label: "M（标准，约 15% 纠错）" },
    { id: "Q", label: "Q（高，约 25% 纠错）" }
];

var QR_SIZES = [256, 512, 1024];

/* ============ 二维码引擎（浏览器取全局，Node 取 vendored） ============ */
function getQrEngine() {
    if (typeof qrcode === "function") { return qrcode; }
    if (typeof module !== "undefined" && module.exports && typeof require === "function") {
        try { return require("./vendor/qrcode-generator-1.4.4.min.js"); }
        catch (e) { return null; }
    }
    return null;
}

/* ============ 协议串：转义 / 构建 ============ */

/* WiFi 协议规定需转义的字符：\ ; , : " → 前加反斜杠。其余（含中文）明文 UTF-8。 */
function escapeWifiField(s) {
    return String(s).replace(/([\\;,:"])/g, "\\$1");
}

function getAuth(id) {
    for (var i = 0; i < WIFI_AUTHS.length; i++) {
        if (WIFI_AUTHS[i].id === id) { return WIFI_AUTHS[i]; }
    }
    return WIFI_AUTHS[0];
}

/* 构建 WIFI:T:..;S:..;P:..;H:..;; 协议串。
 * nopass → 省略 P 段；hidden → 追加 H:true。 */
function buildWifiPayload(ssid, authId, password, hidden) {
    var auth = getAuth(authId);
    var out = "WIFI:T:" + auth.code + ";S:" + escapeWifiField(ssid) + ";";
    if (auth.needPwd) {
        out += "P:" + escapeWifiField(password) + ";";
    }
    if (hidden) {
        out += "H:true;";
    }
    out += ";";
    return out;
}

/* ============ 校验 ============ */
/* 返回 { valid, errors: [{key, msg}] }。key 对应表单字段 id 前缀，供内联定位。 */
function validateWifi(values) {
    var errors = [];
    var ssid = String(values.ssid || "");
    var auth = getAuth(values.auth);
    var pwd = String(values.password || "");

    if (!ssid.trim()) {
        errors.push({ key: "ssid", msg: "请填写 WiFi 名称（SSID），不能为空。" });
    } else {
        /* SSID 上限 32 字节（UTF-8） */
        var bytes = 0;
        if (typeof TextEncoder !== "undefined") {
            bytes = new TextEncoder().encode(ssid).length;
        } else {
            bytes = Buffer.byteLength(ssid, "utf8");
        }
        if (bytes > 32) {
            errors.push({ key: "ssid", msg: "SSID 过长：WiFi 名称最多 32 字节（UTF-8），当前 " + bytes + " 字节。" });
        }
    }

    if (auth.needPwd) {
        if (!pwd) {
            errors.push({ key: "password", msg: "该加密类型需要填写密码，密码不能为空。" });
        } else if (auth.id === "wpa") {
            var isHex64 = /^[0-9a-fA-F]{64}$/.test(pwd);
            if (!isHex64 && (pwd.length < 8 || pwd.length > 63)) {
                errors.push({ key: "password", msg: "WPA 密码长度须为 8–63 个字符（或 64 位十六进制），当前 " + pwd.length + " 个字符。" });
            }
        } else if (auth.id === "wep") {
            var okWep = pwd.length === 5 || pwd.length === 13 ||
                /^[0-9a-fA-F]{10}$/.test(pwd) || /^[0-9a-fA-F]{26}$/.test(pwd);
            if (!okWep) {
                errors.push({ key: "password", msg: "WEP 密码须为 5 或 13 个 ASCII 字符，或 10/26 位十六进制。" });
            }
        }
    }

    return { valid: errors.length === 0, errors: errors };
}

/* ============ 二维码矩阵 / SVG ============ */

/* 返回 { count, isDark(r, c) }。typeNumber=0 自动选择最小版本。 */
function makeQrMatrix(text, ecLevel) {
    var engine = getQrEngine();
    if (!engine) { throw new Error("二维码引擎未加载"); }
    /* qrcode-generator 默认按 Latin-1 取字节，中文 SSID 必须强制 UTF-8 编码，否则扫码得乱码 SSID 连不上 */
    if (engine.stringToBytesFuncs && engine.stringToBytesFuncs["UTF-8"]) {
        engine.stringToBytes = engine.stringToBytesFuncs["UTF-8"];
    }
    var qr = engine(0, ecLevel || "M");
    qr.addData(text);
    qr.make();
    var n = qr.getModuleCount();
    return {
        count: n,
        isDark: function (r, c) { return qr.isDark(r, c); }
    };
}

/* 矩阵 → 独立可渲染的 SVG 字符串。margin 以模块数为单位（含静区，默认 4）。 */
function matrixToSvg(matrix, opts) {
    opts = opts || {};
    var size = opts.size || 512;
    var fg = opts.fg || "#000000";
    var bg = opts.bg || "#ffffff";
    var margin = (opts.margin === undefined) ? 4 : opts.margin;
    var n = matrix.count;
    var total = n + margin * 2;
    var parts = [];
    parts.push('<svg version="1.1" xmlns="http://www.w3.org/2000/svg" width="' + size +
        'px" height="' + size + 'px" viewBox="0 0 ' + total + ' ' + total + '">');
    parts.push('<rect width="' + total + '" height="' + total + '" fill="' + bg + '"/>');
    /* 逐行合并连续深色模块为一条 path，减小体积 */
    var d = "";
    for (var r = 0; r < n; r++) {
        var runStart = -1;
        for (var c = 0; c <= n; c++) {
            var dark = c < n && matrix.isDark(r, c);
            if (dark && runStart === -1) { runStart = c; }
            if (!dark && runStart !== -1) {
                var x = runStart + margin, y = r + margin, w = c - runStart;
                d += "M" + x + "," + y + "h" + w + "v1h-" + w + "z";
                runStart = -1;
            }
        }
    }
    parts.push('<path d="' + d + '" fill="' + fg + '"/>');
    parts.push("</svg>");
    return parts.join("");
}

/* node 单元测试导出 */
if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        WIFI_AUTHS: WIFI_AUTHS,
        EC_LEVELS: EC_LEVELS,
        QR_SIZES: QR_SIZES,
        escapeWifiField: escapeWifiField,
        getAuth: getAuth,
        buildWifiPayload: buildWifiPayload,
        validateWifi: validateWifi,
        makeQrMatrix: makeQrMatrix,
        matrixToSvg: matrixToSvg,
        getQrEngine: getQrEngine
    };
}

/* ============ 浏览器 UI（DOM 存在时才挂载） ============ */
if (typeof document !== "undefined") {

function $(id) { return document.getElementById(id); }

function toast(msg, ok) {
    var t = $("wqr-toast");
    t.textContent = msg;
    t.className = "wqr-toast show " + (ok === false ? "fail" : "ok");
    clearTimeout(toast._timer);
    toast._timer = setTimeout(function () { t.className = "wqr-toast"; }, 2400);
}

function copyText(text, cb) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { cb(true); }, function () { cb(false); });
    } else {
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        var ok = false;
        try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
        document.body.removeChild(ta);
        cb(ok);
    }
}

function downloadBlob(filename, blob) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
}

/* 矩阵 → canvas（PNG 下载用），返回 canvas */
function renderQrToCanvas(matrix, opts) {
    var size = opts.size || 512;
    var fg = opts.fg || "#000000";
    var bg = opts.bg || "#ffffff";
    var margin = (opts.margin === undefined) ? 4 : opts.margin;
    var n = matrix.count;
    var total = n + margin * 2;
    var canvas = document.createElement("canvas");
    canvas.width = size; canvas.height = size;
    var ctx = canvas.getContext("2d");
    var cell = size / total;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = fg;
    for (var r = 0; r < n; r++) {
        for (var c = 0; c < n; c++) {
            if (matrix.isDark(r, c)) {
                ctx.fillRect(Math.round((c + margin) * cell), Math.round((r + margin) * cell),
                    Math.ceil(cell), Math.ceil(cell));
            }
        }
    }
    return canvas;
}

function readForm() {
    return {
        ssid: $("wqr-ssid").value,
        auth: $("wqr-auth").value,
        password: $("wqr-password").value,
        hidden: $("wqr-hidden").checked,
        note: $("wqr-note").value,
        ec: $("wqr-ec").value,
        size: parseInt($("wqr-size").value, 10) || 512,
        fg: $("wqr-fg").value,
        bg: $("wqr-bg").value
    };
}

var lastPayload = "";
var lastMatrix = null;

/* 内联错误渲染：字段红框 + 错误列表（点击定位） */
function renderErrors(errors) {
    ["ssid", "password"].forEach(function (k) {
        var wrap = $("wqr-field-" + k);
        if (wrap) { wrap.classList.remove("wqr-invalid"); }
        var msg = $("wqr-err-" + k);
        if (msg) { msg.textContent = ""; }
    });
    var list = $("wqr-errors");
    list.innerHTML = "";
    if (!errors.length) { return; }
    errors.forEach(function (e, i) {
        var wrap = $("wqr-field-" + e.key);
        if (wrap) { wrap.classList.add("wqr-invalid"); }
        var msg = $("wqr-err-" + e.key);
        if (msg) { msg.textContent = e.msg; }
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "wqr-error-item";
        btn.innerHTML = '<span class="wqr-err-no">' + (i + 1) + '</span>' +
            '<span class="wqr-err-body"><span class="wqr-err-msg">' + e.msg + "</span></span>";
        btn.addEventListener("click", function () {
            var target = $("wqr-field-" + e.key);
            if (target) {
                target.scrollIntoView({ behavior: "smooth", block: "center" });
                target.classList.add("wqr-flash");
                setTimeout(function () { target.classList.remove("wqr-flash"); }, 1300);
                var input = target.querySelector("input");
                if (input) { input.focus(); }
            }
        });
        list.appendChild(btn);
    });
}

/* 主渲染：校验 → 协议串 → 二维码预览 */
function refresh() {
    var v = readForm();
    var res = validateWifi(v);
    renderErrors(res.errors);

    var canGen = res.valid;
    $("wqr-copy").disabled = !canGen;
    $("wqr-dl-png").disabled = !canGen;
    $("wqr-dl-svg").disabled = !canGen;
    $("wqr-print").disabled = !canGen;

    var payloadBox = $("wqr-payload");
    var previewBox = $("wqr-preview");
    if (!canGen) {
        lastPayload = "";
        lastMatrix = null;
        payloadBox.textContent = "— 修正上方标红项后自动生成 —";
        previewBox.innerHTML = '<div class="wqr-preview-empty">二维码预览区<br>填写完整后实时生成</div>';
        $("wqr-ec-info").textContent = "";
        return;
    }

    lastPayload = buildWifiPayload(v.ssid, v.auth, v.password, v.hidden);
    payloadBox.textContent = lastPayload;
    try {
        lastMatrix = makeQrMatrix(lastPayload, v.ec);
    } catch (e) {
        previewBox.innerHTML = '<div class="wqr-preview-empty">二维码生成失败：' + e.message + "</div>";
        return;
    }
    /* 预览用 SVG，尺寸自适应容器 */
    var svg = matrixToSvg(lastMatrix, { size: 360, fg: v.fg, bg: v.bg });
    svg = svg.replace('width="360px" height="360px"', 'width="100%" height="100%" style="max-width:340px;height:auto;display:block;margin:0 auto"');
    previewBox.innerHTML = svg;
    $("wqr-ec-info").textContent = "模块 " + lastMatrix.count + "×" + lastMatrix.count +
        " · 容错 " + v.ec + " · 载荷 " + lastPayload.length + " 字符";
}

/* 海报构建（打印用）：单张 / 2×2 */
function buildPoster(layout) {
    var v = readForm();
    if (!validateWifi(v).valid) { return false; }
    var payload = buildWifiPayload(v.ssid, v.auth, v.password, v.hidden);
    var matrix;
    try { matrix = makeQrMatrix(payload, v.ec); }
    catch (e) { toast("二维码生成失败：" + e.message, false); return false; }
    var auth = getAuth(v.auth);
    var title = (v.note || "").trim() || "WiFi 扫码连接";
    var pwdLine = auth.needPwd
        ? '<div class="wqr-poster-row"><span class="wqr-poster-k">密码</span><span class="wqr-poster-v">' +
          v.password.replace(/&/g, "&amp;").replace(/</g, "&lt;") + "</span></div>"
        : '<div class="wqr-poster-row"><span class="wqr-poster-k">密码</span><span class="wqr-poster-v">无（开放网络，扫码直连）</span></div>';
    var svg = matrixToSvg(matrix, { size: 640, fg: "#000000", bg: "#ffffff" });
    var esc = function (s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;"); };
    var card = '<div class="wqr-poster-card">' +
        '<h2 class="wqr-poster-title">' + esc(title) + "</h2>" +
        '<div class="wqr-poster-qr">' + svg + "</div>" +
        '<div class="wqr-poster-row"><span class="wqr-poster-k">WiFi 名称</span><span class="wqr-poster-v">' + esc(v.ssid) + "</span></div>" +
        pwdLine +
        '<div class="wqr-poster-row"><span class="wqr-poster-k">加密</span><span class="wqr-poster-v">' + esc(auth.label) + "</span></div>" +
        '<p class="wqr-poster-tip">📱 手机相机 / 微信 / 支付宝扫一扫上方二维码，即可自动连接 WiFi，无需手动输入密码。</p>' +
        "</div>";
    var zone = $("wqr-print-zone");
    if (layout === "2x2") {
        zone.className = "wqr-print-zone wqr-layout-2x2";
        zone.innerHTML = card + card + card + card;
    } else {
        zone.className = "wqr-print-zone wqr-layout-1x1";
        zone.innerHTML = card;
    }
    return true;
}

/* 事件绑定 */
document.addEventListener("DOMContentLoaded", function () {
    /* 加密类型下拉 */
    var authSel = $("wqr-auth");
    WIFI_AUTHS.forEach(function (a) {
        var o = document.createElement("option");
        o.value = a.id; o.textContent = a.label;
        authSel.appendChild(o);
    });
    EC_LEVELS.forEach(function (e) {
        var o = document.createElement("option");
        o.value = e.id; o.textContent = e.label;
        if (e.id === "M") { o.selected = true; }
        $("wqr-ec").appendChild(o);
    });

    /* 无密码时禁用密码栏 */
    function syncPwdState() {
        var auth = getAuth(authSel.value);
        var pwd = $("wqr-password");
        pwd.disabled = !auth.needPwd;
        if (!auth.needPwd) { pwd.value = ""; }
        $("wqr-auth-hint").textContent = auth.hint;
    }
    authSel.addEventListener("change", function () { syncPwdState(); refresh(); });
    syncPwdState();

    /* 表单实时联动 */
    ["wqr-ssid", "wqr-password", "wqr-note"].forEach(function (id) {
        $(id).addEventListener("input", refresh);
    });
    ["wqr-hidden", "wqr-ec", "wqr-size", "wqr-fg", "wqr-bg"].forEach(function (id) {
        $(id).addEventListener("change", refresh);
        $(id).addEventListener("input", refresh);
    });

    /* 填入示例 */
    $("wqr-sample").addEventListener("click", function () {
        $("wqr-ssid").value = "Office-Guest";
        authSel.value = "wpa";
        syncPwdState();
        $("wqr-password").value = "Welcome2026";
        refresh();
        toast("已填入示例：Office-Guest / Welcome2026", true);
    });

    /* 复制协议串 */
    $("wqr-copy").addEventListener("click", function () {
        if (!lastPayload) { return; }
        copyText(lastPayload, function (ok) {
            toast(ok ? "✅ 协议串已复制到剪贴板" : "❌ 复制失败，请手动选择复制", ok);
        });
    });

    /* 下载 PNG */
    $("wqr-dl-png").addEventListener("click", function () {
        if (!lastMatrix) { return; }
        var v = readForm();
        var canvas = renderQrToCanvas(lastMatrix, { size: v.size, fg: v.fg, bg: v.bg });
        canvas.toBlob(function (blob) {
            if (!blob) { toast("❌ PNG 生成失败", false); return; }
            downloadBlob("wifi-qrcode-" + v.size + "px.png", blob);
            toast("✅ PNG 已开始下载（" + v.size + "×" + v.size + "）", true);
        }, "image/png");
    });

    /* 下载 SVG */
    $("wqr-dl-svg").addEventListener("click", function () {
        if (!lastMatrix) { return; }
        var v = readForm();
        var svg = matrixToSvg(lastMatrix, { size: v.size, fg: v.fg, bg: v.bg });
        downloadBlob("wifi-qrcode.svg", new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
        toast("✅ SVG 已开始下载", true);
    });

    /* 打印海报 */
    $("wqr-print").addEventListener("click", function () {
        var layout = document.querySelector('input[name="wqr-layout"]:checked');
        if (buildPoster(layout ? layout.value : "1x1")) {
            window.print();
        }
    });

    refresh();
});

} /* typeof document !== "undefined" */
})();
