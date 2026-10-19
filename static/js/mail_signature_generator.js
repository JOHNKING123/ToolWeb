/* 邮件签名生成器：表单 → 4 套邮件客户端安全 HTML 模板（table + 内联样式）→ 实时预览 → 富文本/源码复制
   纯前端零依赖：无 CDN、无后端调用、无外部请求；生成的签名片段不含 <style> 块与外部 CSS，Gmail/Outlook/QQ 邮箱兼容 */
(function () {
    "use strict";

    var TPL_SIMPLE = "simple", TPL_BUSINESS = "business", TPL_MINIMAL = "minimal", TPL_BILINGUAL = "bilingual";

    var FIELDS = ["msg-name", "msg-name-en", "msg-title", "msg-title-en", "msg-company", "msg-company-en",
        "msg-phone", "msg-email", "msg-wechat", "msg-website", "msg-avatar"];

    var FONT = "font-family:Arial,Helvetica,'Microsoft YaHei','微软雅黑',sans-serif;";

    function $(id) { return document.getElementById(id); }

    function esc(s) {
        return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
        });
    }

    function val(id) { var el = $(id); return el ? el.value.trim() : ""; }

    function toast(msg) {
        var el = document.createElement("div");
        el.textContent = msg;
        el.style.cssText = "position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);background:#111827;color:#fff;padding:.6rem 1.2rem;border-radius:.5rem;z-index:9999;font-size:.9rem;max-width:90vw;text-align:center;";
        document.body.appendChild(el);
        setTimeout(function () { if (el.parentNode) { el.parentNode.removeChild(el); } }, 2000);
    }

    // 网站链接补全协议头
    function webHref(site) {
        var s = String(site).trim();
        if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(s)) { return "https://" + s; }
        return s;
    }

    function link(href, text, color) {
        return '<a href="' + esc(href) + '" style="color:' + color + ';text-decoration:none;">' + esc(text) + "</a>";
    }

    function avatarImg(url, size) {
        return '<img src="' + esc(url) + '" width="' + size + '" height="' + size + '" alt="" style="display:block;border:0;width:' + size + "px;height:" + size + 'px;">';
    }

    // 收集表单数据
    function collect() {
        return {
            name: val("msg-name"), nameEn: val("msg-name-en"),
            title: val("msg-title"), titleEn: val("msg-title-en"),
            company: val("msg-company"), companyEn: val("msg-company-en"),
            phone: val("msg-phone"), email: val("msg-email"),
            wechat: val("msg-wechat"), website: val("msg-website"),
            avatar: val("msg-avatar")
        };
    }

    // 「职位 · 公司」组合行（中文）
    function subLine(d) {
        var parts = [];
        if (d.title) { parts.push(esc(d.title)); }
        if (d.company) { parts.push(esc(d.company)); }
        return parts.join(" · ");
    }

    // 联系方式：标签 + 值 的行列表（div 形态）
    function contactDivs(d, accent) {
        var out = [];
        function row(label, html) {
            out.push('<div style="font-size:13px;line-height:1.9;color:#374151;">' + esc(label) + "：" + html + "</div>");
        }
        if (d.phone) { row("电话", esc(d.phone)); }
        if (d.email) { row("邮箱", link("mailto:" + d.email, d.email, accent)); }
        if (d.wechat) { row("微信", esc(d.wechat)); }
        if (d.website) { row("网站", link(webHref(d.website), d.website, accent)); }
        return out.join("");
    }

    // 联系方式：两列表格形态（标签列 + 值列），商务模板用
    function contactTable(d, accent) {
        var rows = [];
        function add(label, html) {
            rows.push('<tr><td width="52" valign="top" style="font-size:13px;color:#9ca3af;padding:3px 0;">' + esc(label) +
                '</td><td valign="top" style="font-size:13px;color:#374151;padding:3px 0;">' + html + "</td></tr>");
        }
        if (d.phone) { add("电话", esc(d.phone)); }
        if (d.email) { add("邮箱", link("mailto:" + d.email, d.email, accent)); }
        if (d.wechat) { add("微信", esc(d.wechat)); }
        if (d.website) { add("网站", link(webHref(d.website), d.website, accent)); }
        if (!rows.length) { return ""; }
        return '<table cellpadding="0" cellspacing="0" border="0" style="' + FONT + '">' + rows.join("") + "</table>";
    }

    // ============ 模板 1：简洁 ============
    function tplSimple(d) {
        var A = "#2563eb";
        var h = [];
        h.push('<table cellpadding="0" cellspacing="0" border="0" style="' + FONT + '">');
        h.push("<tr>");
        h.push('<td width="4" bgcolor="' + A + '" style="font-size:0;line-height:0;">&nbsp;</td>');
        h.push('<td width="14" style="font-size:0;line-height:0;">&nbsp;</td>');
        if (d.avatar) {
            h.push('<td valign="top" style="padding-right:14px;">' + avatarImg(d.avatar, 72) + "</td>");
        }
        h.push('<td valign="top">');
        h.push('<div style="font-size:19px;font-weight:bold;color:#111827;">' + esc(d.name) + "</div>");
        var sub = subLine(d);
        if (sub) { h.push('<div style="font-size:13px;color:#6b7280;margin-top:3px;">' + sub + "</div>"); }
        var contact = contactDivs(d, A);
        if (contact) { h.push('<div style="margin-top:8px;">' + contact + "</div>"); }
        h.push("</td>");
        h.push("</tr>");
        h.push("</table>");
        return h.join("");
    }

    // ============ 模板 2：商务 ============
    function tplBusiness(d) {
        var A = "#0f766e";
        var h = [];
        h.push('<table cellpadding="0" cellspacing="0" border="0" width="440" style="' + FONT + '">');
        // 头部色带：姓名 + 头像
        h.push("<tr>");
        h.push('<td bgcolor="' + A + '" style="padding:12px 16px;">');
        h.push('<table cellpadding="0" cellspacing="0" border="0" width="100%" style="' + FONT + '"><tr>');
        h.push('<td valign="middle">');
        h.push('<div style="font-size:18px;font-weight:bold;color:#ffffff;">' + esc(d.name) + "</div>");
        var sub = subLine(d);
        if (sub) { h.push('<div style="font-size:12px;color:#d7f0ec;margin-top:3px;">' + sub + "</div>"); }
        h.push("</td>");
        if (d.avatar) {
            h.push('<td width="60" align="right" valign="middle">' + avatarImg(d.avatar, 56) + "</td>");
        }
        h.push("</tr></table>");
        h.push("</td>");
        h.push("</tr>");
        // 联系信息区
        var contact = contactTable(d, A);
        if (contact) {
            h.push("<tr>");
            h.push('<td style="padding:12px 16px;border:1px solid #e5e7eb;border-top:0;">' + contact + "</td>");
            h.push("</tr>");
        }
        h.push("</table>");
        return h.join("");
    }

    // ============ 模板 3：极简（纯文本，不含头像） ============
    function tplMinimal(d) {
        var A = "#374151";
        var h = [];
        h.push('<table cellpadding="0" cellspacing="0" border="0" width="380" style="' + FONT + '">');
        h.push("<tr><td>");
        h.push('<div style="font-size:17px;font-weight:bold;color:#111827;">' + esc(d.name) + "</div>");
        var sub = subLine(d);
        if (sub) { h.push('<div style="font-size:13px;color:#6b7280;margin-top:2px;">' + sub + "</div>"); }
        h.push("</td></tr>");
        h.push('<tr><td height="12" style="font-size:0;line-height:0;">&nbsp;</td></tr>');
        h.push('<tr><td height="1" bgcolor="#e5e7eb" style="font-size:0;line-height:0;">&nbsp;</td></tr>');
        h.push('<tr><td height="12" style="font-size:0;line-height:0;">&nbsp;</td></tr>');
        var parts = [];
        if (d.phone) { parts.push("电话 " + esc(d.phone)); }
        if (d.email) { parts.push("邮箱 " + link("mailto:" + d.email, d.email, A)); }
        if (d.wechat) { parts.push("微信 " + esc(d.wechat)); }
        if (d.website) { parts.push("网站 " + link(webHref(d.website), d.website, A)); }
        if (parts.length) {
            h.push('<tr><td style="font-size:12px;line-height:2;color:#4b5563;">' +
                parts.join('<span style="color:#d1d5db;">&nbsp;|&nbsp;</span>') + "</td></tr>");
        }
        h.push("</table>");
        return h.join("");
    }

    // ============ 模板 4：双语 ============
    function tplBilingual(d) {
        var A = "#7c3aed";
        var h = [];
        h.push('<table cellpadding="0" cellspacing="0" border="0" style="' + FONT + '">');
        h.push("<tr>");
        if (d.avatar) {
            h.push('<td valign="top" style="padding-right:14px;">' + avatarImg(d.avatar, 72) + "</td>");
        }
        h.push('<td valign="top">');
        var nameLine = '<span style="font-size:19px;font-weight:bold;color:#111827;">' + esc(d.name) + "</span>";
        if (d.nameEn) { nameLine += '<span style="font-size:14px;color:#6b7280;">&nbsp;&nbsp;' + esc(d.nameEn) + "</span>"; }
        h.push("<div>" + nameLine + "</div>");
        var cn = subLine(d);
        if (cn) { h.push('<div style="font-size:13px;color:#374151;margin-top:3px;">' + cn + "</div>"); }
        var enParts = [];
        if (d.titleEn) { enParts.push(esc(d.titleEn)); }
        if (d.companyEn) { enParts.push(esc(d.companyEn)); }
        if (enParts.length) {
            h.push('<div style="font-size:12px;color:#9ca3af;margin-top:2px;">' + enParts.join(" · ") + "</div>");
        }
        var out = [];
        function row(label, html) {
            out.push('<div style="font-size:13px;line-height:1.9;color:#374151;">' + esc(label) + "：" + html + "</div>");
        }
        if (d.phone) { row("Tel", esc(d.phone)); }
        if (d.email) { row("Email", link("mailto:" + d.email, d.email, A)); }
        if (d.wechat) { row("WeChat", esc(d.wechat)); }
        if (d.website) { row("Web", link(webHref(d.website), d.website, A)); }
        if (out.length) { h.push('<div style="margin-top:8px;">' + out.join("") + "</div>"); }
        h.push("</td>");
        h.push("</tr>");
        h.push("</table>");
        return h.join("");
    }

    var TEMPLATES = {
        simple: tplSimple,
        business: tplBusiness,
        minimal: tplMinimal,
        bilingual: tplBilingual
    };

    var state = { tpl: TPL_SIMPLE, html: "" };

    function render() {
        var d = collect();
        var fn = TEMPLATES[state.tpl] || TEMPLATES.simple;
        state.html = fn(d);
        var pv = $("msg-preview");
        if (d.name) {
            pv.innerHTML = state.html;
        } else {
            pv.innerHTML = '<div style="color:#9ca3af;font-size:.92rem;padding:2.2rem 1rem;text-align:center;">在上方填写「姓名」，这里会实时生成签名预览</div>';
        }
        var src = $("msg-source");
        if (src) { src.value = state.html; }
    }

    function needName() {
        if (!collect().name) { toast("请先填写「姓名」再复制"); return false; }
        return true;
    }

    function hasRichCopy() {
        return !!(window.ClipboardItem && navigator.clipboard && navigator.clipboard.write);
    }

    // 一键复制富文本：ClipboardItem(text/html)，粘贴进 Gmail/Outlook 签名设置即用
    function copyRich() {
        if (!needName()) { return; }
        if (!hasRichCopy()) {
            toast("当前浏览器不支持富文本复制，请改用「复制 HTML 源码」");
            return;
        }
        var blob;
        try {
            blob = new Blob([state.html], { type: "text/html" });
        } catch (e) {
            toast("当前浏览器不支持富文本复制，请改用「复制 HTML 源码」");
            return;
        }
        navigator.clipboard.write([new ClipboardItem({ "text/html": blob })]).then(function () {
            toast("富文本签名已复制，去邮箱的签名设置里粘贴即可");
        }, function () {
            toast("复制失败，请改用「复制 HTML 源码」");
        });
    }

    // 复制 HTML 源码（兜底）
    function copySource() {
        if (!needName()) { return; }
        var text = state.html;
        function done() { toast("HTML 源码已复制"); }
        function legacy() {
            var ta = document.createElement("textarea");
            ta.value = text;
            ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;";
            document.body.appendChild(ta);
            ta.select();
            try {
                if (document.execCommand("copy")) { done(); }
                else { toast("复制失败，请手动复制下方的 HTML 源码"); }
            } catch (e) {
                toast("复制失败，请手动复制下方的 HTML 源码");
            }
            document.body.removeChild(ta);
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(done, legacy);
        } else {
            legacy();
        }
    }

    function setActiveTab() {
        var tabs = document.querySelectorAll(".msg-tpl-tab");
        for (var i = 0; i < tabs.length; i++) {
            tabs[i].classList.toggle("active", tabs[i].getAttribute("data-tpl") === state.tpl);
        }
        var note = $("msg-minimal-note");
        if (note) { note.style.display = state.tpl === TPL_MINIMAL ? "" : "none"; }
    }

    function clearAll() {
        for (var i = 0; i < FIELDS.length; i++) {
            var el = $(FIELDS[i]);
            if (el) { el.value = ""; }
        }
        render();
        toast("已清空表单");
    }

    function init() {
        var tabs = document.querySelectorAll(".msg-tpl-tab");
        for (var i = 0; i < tabs.length; i++) {
            (function (tab) {
                tab.addEventListener("click", function () {
                    state.tpl = tab.getAttribute("data-tpl");
                    setActiveTab();
                    render();
                });
            })(tabs[i]);
        }
        for (var j = 0; j < FIELDS.length; j++) {
            (function (id) {
                var el = $(id);
                if (el) { el.addEventListener("input", render); }
            })(FIELDS[j]);
        }
        $("msg-copy-rich").addEventListener("click", copyRich);
        $("msg-copy-source").addEventListener("click", copySource);
        $("msg-clear").addEventListener("click", clearAll);
        setActiveTab();
        render();
    }

    // 供自动化测试复用
    window.__mailSignature = {
        TEMPLATES: TEMPLATES,
        collect: collect,
        esc: esc,
        webHref: webHref,
        renderOne: function (data, tpl) { return (TEMPLATES[tpl] || TEMPLATES.simple)(data); }
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
