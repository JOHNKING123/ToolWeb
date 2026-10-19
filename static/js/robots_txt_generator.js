/* robots.txt 生成器：纯前端规则组编辑器 → 文本拼装 → 复制/下载，无后端调用 */
(function () {
    "use strict";

    var groupsEl = document.getElementById("rtg-groups");
    var sitemapsEl = document.getElementById("rtg-sitemaps");
    var previewEl = document.getElementById("rtg-preview");
    var warnBox = document.getElementById("rtg-warn");
    var warnList = document.getElementById("rtg-warn-list");

    // ---------- 数据模型 ----------
    // state.groups: [{ua: [..], allow: [..], disallow: [..], crawlDelay: ""}]
    // state.sitemaps: [..]
    var state = { groups: [], sitemaps: [] };

    function blankGroup() {
        return { ua: [""], allow: [], disallow: [], crawlDelay: "" };
    }

    // ---------- 校验 ----------
    // 返回 warnings: [msg...]；非法输入给出中文提示，生成时自动跳过非法项，不崩
    function validate() {
        var warnings = [];
        state.groups.forEach(function (g, gi) {
            var n = gi + 1;
            var hasUa = g.ua.some(function (u) { return u.trim() !== ""; });
            if (!hasUa) warnings.push("规则组 " + n + "：User-agent 为空，该组已跳过输出。请填写爬虫名称（如 * 或 Googlebot）。");
            g.ua.forEach(function (u) {
                u = u.trim();
                if (u !== "" && /[\r\n#:]/.test(u)) warnings.push("规则组 " + n + "：User-agent「" + u + "」含非法字符（换行/#/:），已跳过该行。");
            });
            g.allow.concat(g.disallow).forEach(function (p) {
                p = p.trim();
                if (p === "") return;
                if (p.charAt(0) !== "/") warnings.push("规则组 " + n + "：路径「" + p + "」缺少前导 /，已按 /" + p + " 输出。请确认路径写法。");
            });
            if (String(g.crawlDelay).trim() !== "" && !/^\d+(\.\d+)?$/.test(String(g.crawlDelay).trim())) {
                warnings.push("规则组 " + n + "：Crawl-delay「" + g.crawlDelay + "」不是合法数字，已忽略。请输入秒数（如 10）。");
            }
        });
        state.sitemaps.forEach(function (s) {
            s = s.trim();
            if (s === "") return;
            if (!/^https?:\/\/\S+$/.test(s)) warnings.push("Sitemap「" + s + "」不是合法 URL，已跳过。请填写以 http(s):// 开头的完整地址。");
        });
        return warnings;
    }

    // ---------- 文本拼装 ----------
    // 顺序：User-agent → Allow/Disallow → Crawl-delay → Sitemap
    function buildText() {
        var lines = [];
        state.groups.forEach(function (g) {
            var uas = g.ua.map(function (u) { return u.trim(); })
                .filter(function (u) { return u !== "" && !/[\r\n#:]/.test(u); });
            if (uas.length === 0) return; // 空 User-agent 的组跳过
            var allows = g.allow.map(function (p) { return p.trim(); })
                .filter(function (p) { return p !== ""; })
                .map(function (p) { return p.charAt(0) === "/" ? p : "/" + p; });
            var disallows = g.disallow.map(function (p) { return p.trim(); })
                .filter(function (p) { return p !== ""; })
                .map(function (p) { return p.charAt(0) === "/" ? p : "/" + p; });
            uas.forEach(function (u) { lines.push("User-agent: " + u); });
            if (g.disallowEmpty) lines.push("Disallow: ");
            allows.forEach(function (p) { lines.push("Allow: " + p); });
            disallows.forEach(function (p) { lines.push("Disallow: " + p); });
            var cd = String(g.crawlDelay).trim();
            if (/^\d+(\.\d+)?$/.test(cd)) lines.push("Crawl-delay: " + cd);
            lines.push("");
        });
        state.sitemaps.forEach(function (s) {
            s = s.trim();
            if (/^https?:\/\/\S+$/.test(s)) lines.push("Sitemap: " + s);
        });
        // 去掉末尾多余空行，保留文件结尾一个换行
        while (lines.length && lines[lines.length - 1] === "") lines.pop();
        return lines.length ? lines.join("\n") + "\n" : "";
    }

    // ---------- 渲染 ----------
    function esc(s) {
        return String(s == null ? "" : s)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }

    function renderGroups() {
        groupsEl.innerHTML = "";
        state.groups.forEach(function (g, gi) {
            var box = document.createElement("div");
            box.className = "rtg-group";
            box.dataset.index = gi;

            var head = document.createElement("div");
            head.className = "rtg-group-head";
            head.innerHTML = '<span class="badge">规则组 ' + (gi + 1) + "</span>";
            var del = document.createElement("button");
            del.type = "button";
            del.className = "rtg-group-del";
            del.innerHTML = '<i class="material-icons" style="font-size:1rem">delete</i> 删除本组';
            del.addEventListener("click", function () {
                state.groups.splice(gi, 1);
                sync();
            });
            head.appendChild(del);
            box.appendChild(head);

            // User-agent 多行
            var uaWrap = document.createElement("div");
            uaWrap.style.marginBottom = ".6rem";
            var uaLabel = document.createElement("div");
            uaLabel.style.cssText = "font-size:.85rem;font-weight:700;color:#374151;margin-bottom:.4rem";
            uaLabel.textContent = "User-agent（可多行，如 * / Googlebot / Bingbot）";
            uaWrap.appendChild(uaLabel);
            g.ua.forEach(function (u, ui) {
                uaWrap.appendChild(makeLineRow(g.ua, ui, "爬虫名，如 *", null));
            });
            var uaAdd = makeAddBtn("添加 User-agent 行");
            uaAdd.addEventListener("click", function () { g.ua.push(""); sync(); });
            uaWrap.appendChild(uaAdd);
            box.appendChild(uaWrap);

            // Allow
            box.appendChild(makeRuleRows(g, "allow", "Allow（允许抓取的路径，如 /）"));
            // Disallow
            box.appendChild(makeRuleRows(g, "disallow", "Disallow（禁止抓取的路径，如 /admin/）"));

            // Crawl-delay
            var delay = document.createElement("div");
            delay.className = "rtg-delay";
            delay.innerHTML = "<span><b>Crawl-delay</b>（抓取间隔，秒；留空则不输出）</span>";
            var delayInput = document.createElement("input");
            delayInput.type = "text";
            delayInput.placeholder = "如 10";
            delayInput.value = g.crawlDelay;
            delayInput.setAttribute("aria-label", "Crawl-delay 秒数");
            delayInput.addEventListener("input", function () { g.crawlDelay = delayInput.value; update(); });
            delay.appendChild(delayInput);
            box.appendChild(delay);

            groupsEl.appendChild(box);
        });
    }

    function makeRuleRows(g, kind, label) {
        var wrap = document.createElement("div");
        wrap.style.marginBottom = ".6rem";
        var lab = document.createElement("div");
        lab.style.cssText = "font-size:.85rem;font-weight:700;color:#374151;margin-bottom:.4rem";
        lab.textContent = label;
        wrap.appendChild(lab);
        g[kind].forEach(function (p, pi) {
            var row = makeLineRow(g[kind], pi, "/ 开头的路径，如 /admin/", kind);
            wrap.appendChild(row);
        });
        var add = makeAddBtn(kind === "allow" ? "添加 Allow 行" : "添加 Disallow 行");
        add.addEventListener("click", function () { g[kind].push(""); sync(); });
        wrap.appendChild(add);
        return wrap;
    }

    function makeLineRow(arr, idx, placeholder, kind) {
        var row = document.createElement("div");
        row.className = "rtg-row";
        if (kind === "allow" || kind === "disallow") {
            var k = document.createElement("span");
            k.className = "rtg-kind " + kind;
            k.textContent = kind === "allow" ? "Allow" : "Disallow";
            row.appendChild(k);
        }
        var input = document.createElement("input");
        input.type = "text";
        input.placeholder = placeholder;
        input.value = arr[idx];
        input.setAttribute("autocomplete", "off");
        input.addEventListener("input", function () { arr[idx] = input.value; update(); });
        row.appendChild(input);
        var rm = document.createElement("button");
        rm.type = "button";
        rm.className = "rtg-rm";
        rm.title = "删除该行";
        rm.innerHTML = '<i class="material-icons" style="font-size:1.1rem">close</i>';
        rm.addEventListener("click", function () { arr.splice(idx, 1); sync(); });
        row.appendChild(rm);
        return row;
    }

    function makeAddBtn(text) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "rtg-btn-sm";
        b.innerHTML = '<i class="material-icons">add</i> ' + esc(text);
        return b;
    }

    function renderSitemaps() {
        sitemapsEl.innerHTML = "";
        state.sitemaps.forEach(function (s, si) {
            sitemapsEl.appendChild(makeLineRow(state.sitemaps, si, "https://example.com/sitemap.xml", null));
        });
    }

    function renderPreview() {
        var text = buildText();
        if (!text) {
            previewEl.innerHTML = '<span class="rtg-empty"># 规则组尚未添加，请点击上方「新增规则组」或一键加载模板</span>';
        } else {
            previewEl.textContent = text;
        }
    }

    function renderWarnings(warnings) {
        if (!warnings.length) {
            warnBox.classList.remove("show");
            warnList.innerHTML = "";
            return;
        }
        warnBox.classList.add("show");
        warnList.innerHTML = "";
        warnings.forEach(function (w) {
            var li = document.createElement("li");
            li.textContent = w;
            warnList.appendChild(li);
        });
    }

    // update: 只刷新校验+预览（输入时调用，不重建 DOM，避免焦点丢失）
    function update() {
        renderWarnings(validate());
        renderPreview();
    }
    // sync: 数据结构变化后重建编辑区 + update
    function sync() {
        renderGroups();
        renderSitemaps();
        update();
    }

    // ---------- 模板 ----------
    var TEMPLATES = {
        allowAll: function () {
            return { groups: [{ ua: ["*"], allow: [], disallow: [], crawlDelay: "", disallowEmpty: true }], sitemaps: [] };
        },
        disallowAll: function () {
            return { groups: [{ ua: ["*"], allow: [], disallow: ["/"], crawlDelay: "" }], sitemaps: [] };
        },
        mainstream: function () {
            return {
                groups: [
                    { ua: ["Googlebot", "Bingbot", "Baiduspider", "Sogou", "360Spider"], allow: [], disallow: [], crawlDelay: "" },
                    { ua: ["*"], allow: [], disallow: ["/"], crawlDelay: "" }
                ],
                sitemaps: []
            };
        },
        admin: function () {
            return {
                groups: [{ ua: ["*"], allow: ["/"], disallow: ["/admin/", "/login", "/wp-admin/", "/api/private/"], crawlDelay: "10" }],
                sitemaps: ["https://example.com/sitemap.xml"]
            };
        }
    };

    function loadTemplate(name) {
        var t = TEMPLATES[name]();
        // 深拷贝，避免模板对象被编辑污染
        state = JSON.parse(JSON.stringify(t));
        sync();
        toast("已加载模板，可继续微调");
    }

    // ---------- 复制 / 下载 ----------
    function copyText(t, okMsg) {
        if (!t) { toast("内容为空，无需复制"); return; }
        function done() { toast(okMsg || "已复制到剪贴板"); }
        function fail() { toast("复制失败，请手动复制"); }
        if (navigator.clipboard && window.isSecureContext !== false) {
            navigator.clipboard.writeText(t).then(done, function () { fallbackCopy(t, done, fail); });
        } else {
            fallbackCopy(t, done, fail);
        }
    }
    function fallbackCopy(t, done, fail) {
        var ta = document.createElement("textarea");
        ta.value = t;
        ta.style.cssText = "position:fixed;opacity:0;";
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand("copy") ? done() : fail(); }
        catch (e) { fail(); }
        document.body.removeChild(ta);
    }
    function toast(msg) {
        var el = document.createElement("div");
        el.textContent = msg;
        el.style.cssText = "position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);background:#111827;color:#fff;padding:.6rem 1.2rem;border-radius:.5rem;z-index:9999;font-size:.9rem;max-width:90vw;text-align:center;";
        document.body.appendChild(el);
        setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 1800);
    }

    // ---------- 事件绑定 ----------
    document.getElementById("rtg-tpl-allowall").addEventListener("click", function () { loadTemplate("allowAll"); });
    document.getElementById("rtg-tpl-disallowall").addEventListener("click", function () { loadTemplate("disallowAll"); });
    document.getElementById("rtg-tpl-mainstream").addEventListener("click", function () { loadTemplate("mainstream"); });
    document.getElementById("rtg-tpl-admin").addEventListener("click", function () { loadTemplate("admin"); });

    document.getElementById("rtg-add-group").addEventListener("click", function () {
        state.groups.push(blankGroup());
        sync();
    });
    document.getElementById("rtg-add-sitemap").addEventListener("click", function () {
        state.sitemaps.push("");
        sync();
    });
    document.getElementById("rtg-copy").addEventListener("click", function () {
        copyText(buildText(), "robots.txt 已复制");
    });
    document.getElementById("rtg-download").addEventListener("click", function () {
        var text = buildText();
        if (!text) { toast("内容为空，无法下载"); return; }
        var blob = new Blob([text], { type: "text/plain;charset=utf-8" });
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = "robots.txt";
        document.body.appendChild(a);
        a.click();
        setTimeout(function () {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
        toast("robots.txt 已开始下载");
    });
    document.getElementById("rtg-clear").addEventListener("click", function () {
        state = { groups: [], sitemaps: [] };
        sync();
        toast("已清空全部内容");
    });

    // ---------- 初始化 ----------
    state.groups.push(blankGroup());
    sync();
})();
