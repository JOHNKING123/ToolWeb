/* .htaccess 生成器（htaccess_generator）- 纯前端零上传
 * 手写模板拼接，无依赖：分组开关 → .htaccess 文本。
 * 输出顺序铁律（绝不调换）：HTTPS → www 归一 → 301 重定向 →
 * 自定义错误页 → 缓存与压缩 → 安全头 → 防盗链 → 敏感文件保护。
 * 空分组不输出空段、不输出残留注释占位。
 * 本文件不发起任何 fetch / XHR，不加载任何 CDN 资源。
 * 纯函数经 module.exports 暴露供 node 测试；浏览器里走 DOM。
 *   node tests/htaccess_generator.test.js
 */
(function () {
'use strict';

/* ---------- 输出顺序（决定拼接顺序） ---------- */
var HA_GROUP_ORDER = ['https', 'www', 'redirects', 'errors', 'cache', 'headers', 'hotlink', 'sensitive'];

/* ---------- 默认状态（全关、空输入 = 空输出） ---------- */
function defaultState() {
    return {
        https: false,
        www: 'none', /* 'none' | 'www' | 'nonwww'，互斥单选 */
        redirects: [], /* [{from, to}]，空行在生成时跳过 */
        errors: { e404: false, path404: '', e403: false, path403: '', e500: false, path500: '' },
        cache: false, /* Expires / Cache-Control 静态资源缓存 */
        compress: false, /* mod_deflate gzip 压缩 */
        headers: { nosniff: false, frame: false, referrer: false },
        hotlink: { enabled: false, allowEmpty: true, whitelist: [] }, /* whitelist: 域名数组 */
        sensitive: false
    };
}

/* ---------- 预设（载入后仍可再改开关） ---------- */
var HA_PRESETS = {
    minimal: {
        label: 'Minimal 最小集',
        state: { https: true, sensitive: true }
    },
    wordpress: {
        label: 'WordPress',
        state: { https: true, errors: { e404: true, path404: '/404.html' },
            cache: true, compress: true,
            headers: { nosniff: true, frame: true, referrer: true }, sensitive: true }
    },
    security: {
        label: 'Security 安全优先',
        state: { https: true, www: 'nonwww',
            errors: { e404: true, path404: '/404.html', e403: true, path403: '/403.html' },
            headers: { nosniff: true, frame: true, referrer: true },
            sensitive: true }
        /* 注意：防盗链不在此默认开启——白名单为空时开启会无条件拦截本站图片，
           须用户填入本站域名后再手动开启，见 buildHtaccess 防盗链守卫。 */
    },
    performance: {
        label: 'Performance 性能优先',
        state: { https: true, cache: true, compress: true,
            headers: { nosniff: true },
            sensitive: true }
        /* 同上：防盗链不默认开启，白名单为空时绝不输出无条件 [F] 规则。 */
    }
};

function applyPreset(name) {
    var s = defaultState();
    var p = HA_PRESETS[name];
    if (!p) return s;
    var st = p.state;
    Object.keys(st).forEach(function (k) {
        if (st[k] && typeof st[k] === 'object' && !Array.isArray(st[k])) {
            Object.keys(st[k]).forEach(function (k2) { s[k][k2] = st[k][k2]; });
        } else {
            s[k] = st[k];
        }
    });
    return s;
}

/* ---------- 小工具 ---------- */
function cleanLine(v) {
    return String(v == null ? '' : v).replace(/[\r\n]+/g, ' ').trim();
}
/* 域名进正则前转义：点、连字符外字符一律转义。 */
function escapeDomain(d) {
    return cleanLine(d).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function isValidRedirect(from, to) {
    return cleanLine(from).charAt(0) === '/' && cleanLine(to) !== '';
}
function isValidErrorPath(p) {
    return cleanLine(p).charAt(0) === '/';
}

/* ---------- 生成器：纯函数，state → 文本 ---------- */
function buildHtaccess(s) {
    var blocks = [];

    /* --- 改写类规则共用一个 mod_rewrite 块，顺序 HTTPS → www → 301 --- */
    var rewriteLines = [];
    if (s.https) {
        rewriteLines.push('# HTTPS 强制跳转');
        rewriteLines.push('RewriteCond %{HTTPS} off');
        rewriteLines.push('RewriteRule ^(.*)$ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]');
    }
    if (s.www === 'www') {
        rewriteLines.push('# www 归一：统一 www');
        rewriteLines.push('RewriteCond %{HTTP_HOST} !^www\\. [NC]');
        rewriteLines.push('RewriteRule ^(.*)$ https://www.%{HTTP_HOST}%{REQUEST_URI} [L,R=301]');
    } else if (s.www === 'nonwww') {
        rewriteLines.push('# www 归一：统一去 www');
        rewriteLines.push('RewriteCond %{HTTP_HOST} ^www\\.(.*)$ [NC]');
        rewriteLines.push('RewriteRule ^(.*)$ https://%1%{REQUEST_URI} [L,R=301]');
    }
    var redirects = (s.redirects || []).filter(function (r) {
        return r && isValidRedirect(r.from, r.to);
    });
    if (redirects.length) {
        rewriteLines.push('# 301 重定向');
        redirects.forEach(function (r) {
            rewriteLines.push('Redirect 301 ' + cleanLine(r.from) + ' ' + cleanLine(r.to));
        });
    }
    if (rewriteLines.length) {
        blocks.push('<IfModule mod_rewrite.c>\nRewriteEngine On\n' + rewriteLines.join('\n') + '\n</IfModule>');
    }

    /* --- 自定义错误页 --- */
    var errLines = [];
    [['404', 'e404', 'path404'], ['403', 'e403', 'path403'], ['500', 'e500', 'path500']].forEach(function (t) {
        if (s.errors && s.errors[t[1]] && isValidErrorPath(s.errors[t[2]])) {
            errLines.push('ErrorDocument ' + t[0] + ' ' + cleanLine(s.errors[t[2]]));
        }
    });
    if (errLines.length) {
        blocks.push('# 自定义错误页\n' + errLines.join('\n'));
    }

    /* --- 缓存与压缩 --- */
    var cacheLines = [];
    if (s.cache) {
        cacheLines.push('# 静态资源缓存');
        cacheLines.push('<IfModule mod_expires.c>');
        cacheLines.push('ExpiresActive On');
        cacheLines.push('ExpiresByType image/jpeg "access plus 1 year"');
        cacheLines.push('ExpiresByType image/png "access plus 1 year"');
        cacheLines.push('ExpiresByType image/gif "access plus 1 year"');
        cacheLines.push('ExpiresByType image/svg+xml "access plus 1 year"');
        cacheLines.push('ExpiresByType text/css "access plus 1 month"');
        cacheLines.push('ExpiresByType application/javascript "access plus 1 month"');
        cacheLines.push('</IfModule>');
        cacheLines.push('<IfModule mod_headers.c>');
        cacheLines.push('<FilesMatch "\\.(css|js|png|jpg|jpeg|gif|svg|ico|woff2?)$">');
        cacheLines.push('Header set Cache-Control "public, max-age=31536000"');
        cacheLines.push('</FilesMatch>');
        cacheLines.push('</IfModule>');
    }
    if (s.compress) {
        cacheLines.push('# gzip 压缩');
        cacheLines.push('<IfModule mod_deflate.c>');
        cacheLines.push('AddOutputFilterByType DEFLATE text/html text/plain text/css application/javascript application/json image/svg+xml');
        cacheLines.push('</IfModule>');
    }
    if (cacheLines.length) blocks.push(cacheLines.join('\n'));

    /* --- 安全头 --- */
    var headLines = [];
    if (s.headers) {
        if (s.headers.nosniff) headLines.push('Header set X-Content-Type-Options "nosniff"');
        if (s.headers.frame) headLines.push('Header set X-Frame-Options "SAMEORIGIN"');
        if (s.headers.referrer) headLines.push('Header set Referrer-Policy "strict-origin-when-cross-origin"');
    }
    if (headLines.length) {
        blocks.push('# 安全头\n<IfModule mod_headers.c>\n' + headLines.join('\n') + '\n</IfModule>');
    }

    /* --- 防盗链：守卫——白名单为空时绝不输出无条件 [F] 规则 ---
       无 RewriteCond 的 RewriteRule 媒体 [F] 会连本站自己的图片/媒体一起 403，
       故白名单为空时整块跳过（不输出注释占位、不输出 [F] 行）。 */
    if (s.hotlink && s.hotlink.enabled) {
        var wl = (s.hotlink.whitelist || []).map(cleanLine).filter(function (d) { return d !== ''; });
        if (!wl.length) { /* 空白名单：跳过防盗链块，见上 */ }
        else {
        var hl = ['# 防盗链'];
        hl.push('<IfModule mod_rewrite.c>');
        hl.push('RewriteEngine On');
        if (!s.hotlink.allowEmpty) hl.push('RewriteCond %{HTTP_REFERER} !^$');
        wl.forEach(function (d) {
            hl.push('RewriteCond %{HTTP_REFERER} !^https?://(www\\.)?' + escapeDomain(d) + ' [NC]');
        });
        hl.push('RewriteRule \\.(jpg|jpeg|png|gif|webp|svg|mp4|mp3)$ - [F]');
        hl.push('</IfModule>');
        blocks.push(hl.join('\n'));
        }
    }

    /* --- 敏感文件保护（固定规则组，Apache 2.4 语法） --- */
    if (s.sensitive) {
        blocks.push('# 敏感文件保护\n' +
            '<FilesMatch "^\\.(git|env|htaccess|htpasswd)$">\nRequire all denied\n</FilesMatch>\n' +
            '<FilesMatch "\\.(bak|old|sql|log|swp)$">\nRequire all denied\n</FilesMatch>\n' +
            'RedirectMatch 404 /\\.git/');
    }

    return blocks.length ? blocks.join('\n\n') + '\n' : '';
}

/* 统计：规则行数（去注释、空行、块标签后计有效规则行）。 */
function countRules(text) {
    if (!text) return 0;
    return text.split('\n').filter(function (l) {
        var t = l.trim();
        return t !== '' && t.charAt(0) !== '#' && t !== '</IfModule>' && t !== '</FilesMatch>' &&
            t.indexOf('<IfModule') !== 0 && t.indexOf('<FilesMatch') !== 0;
    }).length;
}

/* ---------- 浏览器 DOM（仅浏览器环境执行） ---------- */
if (typeof document !== 'undefined') {
    function $(id) { return document.getElementById(id); }
    function toast(msg) {
        var t = $('ha-toast');
        if (!t) return;
        t.textContent = msg;
        t.className = 'show';
        setTimeout(function () { t.className = ''; }, 3200);
    }
    function readState() {
        var s = defaultState();
        s.https = $('ha-https').checked;
        var wwwEl = document.querySelector('input[name="ha-www"]:checked');
        s.www = wwwEl ? wwwEl.value : 'none';
        s.redirects = [];
        document.querySelectorAll('.ha-redirect-row').forEach(function (row) {
            s.redirects.push({
                from: row.querySelector('.ha-redir-from').value,
                to: row.querySelector('.ha-redir-to').value
            });
        });
        s.errors.e404 = $('ha-err404').checked; s.errors.path404 = $('ha-err404-path').value;
        s.errors.e403 = $('ha-err403').checked; s.errors.path403 = $('ha-err403-path').value;
        s.errors.e500 = $('ha-err500').checked; s.errors.path500 = $('ha-err500-path').value;
        s.cache = $('ha-cache').checked;
        s.compress = $('ha-compress').checked;
        s.headers.nosniff = $('ha-h-nosniff').checked;
        s.headers.frame = $('ha-h-frame').checked;
        s.headers.referrer = $('ha-h-referrer').checked;
        s.hotlink.enabled = $('ha-hotlink').checked;
        s.hotlink.allowEmpty = $('ha-hl-empty').checked;
        s.hotlink.whitelist = $('ha-hl-whitelist').value.split('\n');
        s.sensitive = $('ha-sensitive').checked;
        return s;
    }
    function writeState(s) {
        $('ha-https').checked = !!s.https;
        document.querySelectorAll('input[name="ha-www"]').forEach(function (r) {
            r.checked = (r.value === s.www);
        });
        var box = $('ha-redirect-list');
        box.innerHTML = '';
        var rows = (s.redirects && s.redirects.length) ? s.redirects : [{ from: '', to: '' }];
        rows.forEach(function (r) { box.appendChild(makeRedirectRow(r.from, r.to)); });
        $('ha-err404').checked = !!s.errors.e404; $('ha-err404-path').value = s.errors.path404 || '';
        $('ha-err403').checked = !!s.errors.e403; $('ha-err403-path').value = s.errors.path403 || '';
        $('ha-err500').checked = !!s.errors.e500; $('ha-err500-path').value = s.errors.path500 || '';
        $('ha-cache').checked = !!s.cache;
        $('ha-compress').checked = !!s.compress;
        $('ha-h-nosniff').checked = !!s.headers.nosniff;
        $('ha-h-frame').checked = !!s.headers.frame;
        $('ha-h-referrer').checked = !!s.headers.referrer;
        $('ha-hotlink').checked = !!s.hotlink.enabled;
        $('ha-hl-empty').checked = s.hotlink.allowEmpty !== false;
        $('ha-hl-whitelist').value = (s.hotlink.whitelist || []).join('\n');
        $('ha-sensitive').checked = !!s.sensitive;
    }
    function makeRedirectRow(from, to) {
        var div = document.createElement('div');
        div.className = 'ha-redirect-row';
        div.innerHTML = '<input type="text" class="ha-redir-from" placeholder="/old-page.html" value="">' +
            '<span class="ha-arrow">→</span>' +
            '<input type="text" class="ha-redir-to" placeholder="https://example.com/new-page.html" value="">' +
            '<button type="button" class="ha-mini ha-del" title="删除本行">✕</button>';
        div.querySelector('.ha-redir-from').value = from || '';
        div.querySelector('.ha-redir-to').value = to || '';
        div.querySelector('.ha-del').addEventListener('click', function () {
            div.remove();
            if (!$('ha-redirect-list').querySelector('.ha-redirect-row')) {
                $('ha-redirect-list').appendChild(makeRedirectRow('', ''));
            }
            render();
        });
        div.querySelectorAll('input').forEach(function (inp) {
            inp.addEventListener('input', render);
        });
        return div;
    }
    function render() {
        var text = buildHtaccess(readState());
        var pre = $('ha-output');
        pre.textContent = text;
        var lines = text ? text.split('\n').length : 0;
        $('ha-stat-lines').textContent = lines;
        $('ha-stat-rules').textContent = countRules(text);
        $('ha-empty').style.display = text ? 'none' : 'block';
        pre.style.display = text ? 'block' : 'none';
        $('ha-copy-btn').disabled = !text;
        $('ha-dl-btn').disabled = !text;
    }
    function copyText() {
        var text = buildHtaccess(readState());
        if (!text) { toast('请先开启至少一个分组'); return; }
        function fallback() {
            var ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed'; ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            var ok = false;
            try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
            document.body.removeChild(ta);
            if (ok) { toast('已复制到剪贴板'); }
            else { toast('复制失败：请手动选中上方输出文本，按 Ctrl+C 复制'); }
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(function () {
                toast('已复制到剪贴板');
            }, fallback);
        } else { fallback(); }
    }
    function downloadFile() {
        var text = buildHtaccess(readState());
        if (!text) { toast('请先开启至少一个分组'); return; }
        var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = '.htaccess';
        document.body.appendChild(a);
        a.click();
        setTimeout(function () {
            URL.revokeObjectURL(a.href);
            document.body.removeChild(a);
        }, 500);
        toast('已下载 .htaccess');
    }
    document.addEventListener('DOMContentLoaded', function () {
        $('ha-redirect-list').appendChild(makeRedirectRow('', ''));
        document.querySelectorAll('#ha-form input, #ha-form textarea, #ha-form select').forEach(function (el) {
            if (el.className.indexOf('ha-redir') === -1) el.addEventListener('input', render);
            if (el.type === 'checkbox' || el.type === 'radio') el.addEventListener('change', render);
        });
        document.querySelectorAll('[data-ha-preset]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                writeState(applyPreset(btn.getAttribute('data-ha-preset')));
                render();
                toast('已载入预设：' + btn.textContent.trim() + '（可再改开关）');
            });
        });
        $('ha-add-redir').addEventListener('click', function () {
            $('ha-redirect-list').appendChild(makeRedirectRow('', ''));
        });
        $('ha-gen-btn').addEventListener('click', function () { render(); toast('已生成'); });
        $('ha-copy-btn').addEventListener('click', copyText);
        $('ha-dl-btn').addEventListener('click', downloadFile);
        $('ha-reset-btn').addEventListener('click', function () {
            writeState(defaultState());
            render();
            toast('已重置为空状态');
        });
        render();
    });
}

/* node 单元测试导出 */
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        HA_GROUP_ORDER: HA_GROUP_ORDER,
        HA_PRESETS: HA_PRESETS,
        defaultState: defaultState,
        applyPreset: applyPreset,
        buildHtaccess: buildHtaccess,
        countRules: countRules,
        escapeDomain: escapeDomain,
        isValidRedirect: isValidRedirect,
        isValidErrorPath: isValidErrorPath
    };
}
})();
