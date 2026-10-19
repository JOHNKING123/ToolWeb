/**
 * JWT 签名生成器/验证器 —— 纯前端实现
 * 全部密码学操作仅使用 Web Crypto API (crypto.subtle / crypto.getRandomValues)，
 * 密钥与 token 永不出浏览器，无后端调用、无外部请求。
 */
(function () {
    'use strict';

    // ---------- 工具函数 ----------
    const te = new TextEncoder();
    const td = new TextDecoder();

    function b64urlEncode(bytes) {
        const bin = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
        let s = '';
        for (let i = 0; i < bin.length; i++) s += String.fromCharCode(bin[i]);
        return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    function b64urlDecode(str) {
        if (typeof str !== 'string' || !str.length) throw new Error('base64url 输入为空');
        if (!/^[A-Za-z0-9\-_]+$/.test(str)) throw new Error('非法 base64url 字符');
        let s = str.replace(/-/g, '+').replace(/_/g, '/');
        while (s.length % 4) s += '=';
        const bin = atob(s);
        const out = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
    }

    function parseJson(text, label) {
        try {
            return JSON.parse(text);
        } catch (e) {
            throw new Error(label + ' 不是合法的 JSON：' + e.message);
        }
    }

    function decodeSegment(seg, label) {
        const bytes = b64urlDecode(seg);
        const text = td.decode(bytes);
        return parseJson(text, label);
    }

    function utf8Len(str) { return te.encode(str).length; }

    function nowSec() { return Math.floor(Date.now() / 1000); }

    function fmtTime(sec) {
        if (typeof sec !== 'number' || !isFinite(sec)) return '—';
        const d = new Date(sec * 1000);
        const p = n => String(n).padStart(2, '0');
        return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
            ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
    }

    // ---------- 算法配置 ----------
    const ALGS = {
        HS256: { kind: 'hmac', hash: 'SHA-256', minKeyBytes: 32 },
        HS384: { kind: 'hmac', hash: 'SHA-384', minKeyBytes: 48 },
        HS512: { kind: 'hmac', hash: 'SHA-512', minKeyBytes: 64 },
        RS256: { kind: 'rsa', hash: 'SHA-256' }
    };

    const UNSUPPORTED_ALGS = ['HS256', 'HS384', 'HS512', 'RS256', 'RS384', 'RS512', 'ES256', 'ES384', 'ES512', 'PS256', 'PS384', 'PS512'];

    // ---------- DOM ----------
    const $ = id => document.getElementById(id);

    // 页签
    const tabEncode = $('jsv-tab-encode'), tabVerify = $('jsv-tab-verify');
    const panelEncode = $('jsv-panel-encode'), panelVerify = $('jsv-panel-verify');
    function switchTab(which) {
        const enc = which === 'encode';
        tabEncode.classList.toggle('jsv-on', enc);
        tabVerify.classList.toggle('jsv-on', !enc);
        panelEncode.style.display = enc ? '' : 'none';
        panelVerify.style.display = !enc ? '' : 'none';
    }
    tabEncode.addEventListener('click', () => switchTab('encode'));
    tabVerify.addEventListener('click', () => switchTab('verify'));

    // ---------- 签发页签 ----------
    const algSelect = $('jsv-alg'), headerInput = $('jsv-header'), payloadInput = $('jsv-payload');
    const keyPanelHS = $('jsv-key-hs'), keyPanelRSA = $('jsv-key-rsa');
    const secretInput = $('jsv-secret'), secretLenEl = $('jsv-secret-len'), secretMinEl = $('jsv-secret-min');
    const privPemInput = $('jsv-priv-pem'), pubPemInput = $('jsv-pub-pem');
    const encodeErr = $('jsv-encode-err'), tokenOutput = $('jsv-token-output'), tokenSection = $('jsv-token-section');

    headerInput.value = JSON.stringify({ typ: 'JWT' }, null, 2);
    payloadInput.value = JSON.stringify({ sub: '1234567890', name: '张三', iat: 1798761600 }, null, 2);

    function refreshKeyPanel() {
        const cfg = ALGS[algSelect.value];
        const isHmac = cfg.kind === 'hmac';
        keyPanelHS.style.display = isHmac ? '' : 'none';
        keyPanelRSA.style.display = isHmac ? 'none' : '';
        if (isHmac) secretMinEl.textContent = cfg.minKeyBytes;
        updateSecretLen();
    }
    algSelect.addEventListener('change', refreshKeyPanel);

    function updateSecretLen() {
        const n = utf8Len(secretInput.value || '');
        secretLenEl.textContent = n;
        secretLenEl.className = n >= ALGS[algSelect.value].minKeyBytes ? 'jsv-ok' : 'jsv-bad';
    }
    secretInput.addEventListener('input', updateSecretLen);

    function showEncodeErr(msg) {
        encodeErr.style.display = 'block';
        encodeErr.textContent = msg;
        tokenSection.style.display = 'none';
    }
    function hideEncodeErr() { encodeErr.style.display = 'none'; }

    $('jsv-gen-secret').addEventListener('click', () => {
        const bytes = crypto.getRandomValues(new Uint8Array(ALGS[algSelect.value].minKeyBytes));
        secretInput.value = b64urlEncode(bytes);
        updateSecretLen();
        hideEncodeErr();
    });

    // 常用声明快捷插入
    document.querySelectorAll('[data-claim]').forEach(btn => {
        btn.addEventListener('click', () => {
            try {
                const payload = parseJson(payloadInput.value, 'Payload');
                const claim = btn.getAttribute('data-claim');
                const n = nowSec();
                switch (claim) {
                    case 'iss': payload.iss = 'toolweb-demo'; break;
                    case 'sub': payload.sub = 'user-123'; break;
                    case 'aud': payload.aud = 'web-app'; break;
                    case 'iat': payload.iat = n; break;
                    case 'nbf': payload.nbf = n; break;
                    case 'exp': payload.exp = n + 3600; break;
                    case 'jti': {
                        const r = crypto.getRandomValues(new Uint8Array(12));
                        payload.jti = b64urlEncode(r);
                        break;
                    }
                    case 'exp1h': payload.exp = n + 3600; break;
                }
                payloadInput.value = JSON.stringify(payload, null, 2);
                hideEncodeErr();
            } catch (e) {
                showEncodeErr(e.message);
            }
        });
    });

    // PEM 工具
    function pemToBytes(pem, label) {
        const m = pem.match(/-----BEGIN ([^-]+)-----([\s\S]+?)-----END \1-----/);
        if (!m) throw new Error(label + ' 格式不正确：找不到 PEM 头尾标记');
        // PEM 正文为标准 base64（含 + / =），先转为 base64url 再解码，兼容两种写法
        const b64u = m[2].replace(/\s+/g, '').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        return b64urlDecode(b64u);
    }

    function bytesToPem(bytes, label) {
        const b64 = b64urlEncode(bytes).replace(/-/g, '+').replace(/_/g, '/');
        // 补齐 padding（b64urlEncode 去掉了 =）
        let padded = b64;
        while (padded.length % 4) padded += '=';
        const lines = padded.match(/.{1,64}/g) || [];
        return '-----BEGIN ' + label + '-----\n' + lines.join('\n') + '\n-----END ' + label + '-----';
    }

    $('jsv-gen-rsa').addEventListener('click', async () => {
        hideEncodeErr();
        try {
            const pair = await crypto.subtle.generateKey(
                { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
                true, ['sign', 'verify']
            );
            const privDer = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
            const pubDer = new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey));
            privPemInput.value = bytesToPem(privDer, 'PRIVATE KEY');
            pubPemInput.value = bytesToPem(pubDer, 'PUBLIC KEY');
        } catch (e) {
            showEncodeErr('生成 RSA 密钥对失败：' + e.message + '（需要支持 Web Crypto 的浏览器）');
        }
    });

    $('jsv-copy-pub').addEventListener('click', () => {
        if (!pubPemInput.value.trim()) { showEncodeErr('请先生成 RSA 密钥对'); return; }
        navigator.clipboard.writeText(pubPemInput.value).then(
            () => flashBtn('jsv-copy-pub', '已复制'),
            () => showEncodeErr('复制失败，请手动复制')
        );
    });

    function flashBtn(id, text) {
        const b = $(id);
        const orig = b.innerHTML;
        b.innerHTML = text;
        setTimeout(() => { b.innerHTML = orig; }, 1500);
    }

    // 签发
    $('jsv-sign').addEventListener('click', async () => {
        hideEncodeErr();
        const alg = algSelect.value, cfg = ALGS[alg];
        try {
            const header = parseJson(headerInput.value, 'Header');
            if (typeof header !== 'object' || header === null || Array.isArray(header)) throw new Error('Header 必须是 JSON 对象');
            parseJson(payloadInput.value, 'Payload');
            header.alg = alg; // alg 由算法选择锁定，不可手写
            if (alg === 'none') throw new Error('拒绝签发：不支持弱算法 none');

            const signingInput = b64urlEncode(te.encode(JSON.stringify(header))) + '.' +
                b64urlEncode(te.encode(JSON.stringify(parseJson(payloadInput.value, 'Payload'))));
            const data = te.encode(signingInput);
            let sig;

            if (cfg.kind === 'hmac') {
                const secret = secretInput.value || '';
                const len = utf8Len(secret);
                if (len < cfg.minKeyBytes) {
                    throw new Error('HS Secret 长度不足：' + alg + ' 要求至少 ' + cfg.minKeyBytes +
                        ' 字节，当前仅 ' + len + ' 字节。已拒绝签发，请点击「随机生成」获得合规密钥。');
                }
                const key = await crypto.subtle.importKey('raw', te.encode(secret),
                    { name: 'HMAC', hash: cfg.hash }, false, ['sign']);
                sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, data));
            } else {
                const pem = privPemInput.value.trim();
                if (!pem) throw new Error('请粘贴 RSA 私钥 PEM，或点击「本地生成 RSA 密钥对」');
                let der;
                try { der = pemToBytes(pem, '私钥 PEM'); }
                catch (e) { throw new Error('私钥 PEM ' + e.message); }
                let key;
                try {
                    key = await crypto.subtle.importKey('pkcs8', der,
                        { name: 'RSASSA-PKCS1-v1_5', hash: cfg.hash }, false, ['sign']);
                } catch (e) {
                    throw new Error('私钥 PEM 导入失败：仅支持 PKCS#8 格式（' + e.message + '）');
                }
                sig = new Uint8Array(await crypto.subtle.sign({ name: 'RSASSA-PKCS1-v1_5' }, key, data));
            }

            const token = signingInput + '.' + b64urlEncode(sig);
            tokenOutput.textContent = token;
            tokenSection.style.display = 'block';
            $('jsv-token-alg').textContent = alg;
        } catch (e) {
            showEncodeErr(e.message);
        }
    });

    $('jsv-copy-token').addEventListener('click', () => {
        navigator.clipboard.writeText(tokenOutput.textContent).then(
            () => flashBtn('jsv-copy-token', '已复制'),
            () => showEncodeErr('复制失败，请手动复制')
        );
    });

    $('jsv-download-token').addEventListener('click', () => {
        const blob = new Blob([tokenOutput.textContent], { type: 'text/plain;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'jwt-token.txt';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 100);
    });

    // 签发页签示例
    $('jsv-sample-encode').addEventListener('click', () => {
        algSelect.value = 'HS256';
        refreshKeyPanel();
        headerInput.value = JSON.stringify({ typ: 'JWT' }, null, 2);
        payloadInput.value = JSON.stringify({
            sub: '1234567890', name: '示例用户', iss: 'toolweb-demo',
            iat: nowSec(), exp: nowSec() + 3600, jti: b64urlEncode(crypto.getRandomValues(new Uint8Array(12)))
        }, null, 2);
        secretInput.value = 'jwt-sample-secret-2026-toolweb-test!';
        updateSecretLen();
        hideEncodeErr();
        tokenSection.style.display = 'none';
    });

    // ---------- 验证页签 ----------
    const tokenInput = $('jsv-verify-input'), decodeErr = $('jsv-decode-err');
    const vHeader = $('jsv-v-header'), vPayload = $('jsv-v-payload'), validityBadges = $('jsv-validity');
    const vKeyHS = $('jsv-vkey-hs'), vKeyRSA = $('jsv-vkey-rsa');
    const vSecret = $('jsv-v-secret'), vPubPem = $('jsv-v-pub-pem'), vAlgLabel = $('jsv-v-alg');
    const verifyResult = $('jsv-verify-result');

    let currentAlg = null; // 当前解析出的算法

    function showDecodeErr(msg) {
        decodeErr.style.display = 'block';
        decodeErr.textContent = msg;
        $('jsv-decoded').style.display = 'none';
    }
    function hideDecodeErr() { decodeErr.style.display = 'none'; }

    function badge(text, cls) {
        return '<span class="jsv-badge ' + cls + '">' + text + '</span>';
    }

    function renderValidity(payload) {
        const n = nowSec();
        const parts = [];
        if (payload.exp !== undefined) {
            const ok = typeof payload.exp === 'number' && payload.exp > n;
            parts.push(badge('exp ' + (typeof payload.exp === 'number' ? (ok ? '有效期内' : '已过期') : '格式异常') +
                '（' + fmtTime(payload.exp) + '）', typeof payload.exp === 'number' && ok ? 'jsv-b-green' : 'jsv-b-red'));
        } else {
            parts.push(badge('无 exp 声明（永不过期，注意风险）', 'jsv-b-gray'));
        }
        if (payload.nbf !== undefined) {
            const ok = typeof payload.nbf === 'number' && payload.nbf <= n;
            parts.push(badge('nbf ' + (typeof payload.nbf === 'number' ? (ok ? '已生效' : '尚未生效') : '格式异常') +
                '（' + fmtTime(payload.nbf) + '）', typeof payload.nbf === 'number' && ok ? 'jsv-b-green' : 'jsv-b-red'));
        }
        if (payload.iat !== undefined && typeof payload.iat === 'number') {
            parts.push(badge('iat 签发于 ' + fmtTime(payload.iat), 'jsv-b-gray'));
        }
        validityBadges.innerHTML = parts.join(' ');
    }

    function renderDecoded() {
        const token = tokenInput.value.trim();
        verifyResult.innerHTML = '';
        if (!token) {
            hideDecodeErr();
            $('jsv-decoded').style.display = 'none';
            return;
        }
        try {
            const parts = token.split('.');
            if (parts.length !== 3) throw new Error('token 格式不正确：JWT 应为 Header.Payload.Signature 三段式（当前 ' + parts.length + ' 段）');
            const header = decodeSegment(parts[0], 'Header');
            const payload = decodeSegment(parts[1], 'Payload');
            if (typeof header !== 'object' || header === null) throw new Error('Header 解析后不是 JSON 对象');
            currentAlg = (header.alg || '').toString();
            vHeader.textContent = JSON.stringify(header, null, 2);
            vPayload.textContent = JSON.stringify(payload, null, 2);
            vAlgLabel.textContent = currentAlg || '（缺失）';
            renderValidity(payload);
            const isHmac = currentAlg.indexOf('HS') === 0;
            vKeyHS.style.display = isHmac ? '' : 'none';
            vKeyRSA.style.display = (!isHmac && currentAlg !== 'none') ? '' : 'none';
            hideDecodeErr();
            $('jsv-decoded').style.display = 'block';
            // alg:none 提前显式警示
            if (currentAlg.toLowerCase() === 'none' || parts[2] === '') {
                setVerifyResult('warn', '⚠ 弱算法/未签名警告', '该 token 未签名（alg: none 或签名段为空），任何人都可伪造，<b>请勿信任其中内容</b>。');
            }
        } catch (e) {
            showDecodeErr('解码失败：' + e.message);
            currentAlg = null;
            verifyResult.innerHTML = '';
        }
    }
    tokenInput.addEventListener('input', renderDecoded);

    function setVerifyResult(kind, title, detail) {
        const cls = kind === 'ok' ? 'jsv-r-ok' : kind === 'bad' ? 'jsv-r-bad' : 'jsv-r-warn';
        const icon = kind === 'ok' ? '✓' : kind === 'bad' ? '✗' : '⚠';
        verifyResult.innerHTML = '<div class="jsv-result ' + cls + '"><div class="jsv-r-title">' +
            icon + ' ' + title + '</div><div class="jsv-r-detail">' + detail + '</div></div>';
    }

    $('jsv-verify-btn').addEventListener('click', async () => {
        verifyResult.innerHTML = '';
        const token = tokenInput.value.trim();
        if (!token) { setVerifyResult('warn', '没有可验证的 token', '请先在上方粘贴 JWT。'); return; }
        const parts = token.split('.');
        if (parts.length !== 3) {
            setVerifyResult('bad', '签名无效', '原因：token 不是标准三段式，无法定位签名段。');
            return;
        }
        const alg = (currentAlg || '').toLowerCase();

        // 显式检测 alg:none
        if (alg === 'none' || parts[2] === '') {
            setVerifyResult('warn', '⚠ 弱算法/未签名警告',
                '检测到 <b>alg: none</b> 或签名段为空——该 token 根本没有签名，任何人都可以伪造。请勿信任其中的身份声明。');
            return;
        }
        if (!(alg in ALGS) && alg !== '') {
            if (!UNSUPPORTED_ALGS.some(a => a.toLowerCase() === alg)) {
                setVerifyResult('warn', '未知算法', 'Header 中 alg 为「' + escapeHtml(currentAlg) + '」，本工具仅支持 HS256/HS384/HS512/RS256 的本地验签。');
            } else {
                setVerifyResult('warn', '算法暂不支持', 'alg 为「' + escapeHtml(currentAlg) + '」，本工具目前仅支持 HS256/HS384/HS512/RS256。');
            }
            return;
        }
        const normAlg = Object.keys(ALGS).find(a => a.toLowerCase() === alg);
        if (!normAlg) {
            setVerifyResult('warn', '未知算法', 'Header 中 alg 为「' + escapeHtml(currentAlg) + '」，本工具仅支持 HS256/HS384/HS512/RS256。');
            return;
        }
        const cfg = ALGS[normAlg];
        const data = te.encode(parts[0] + '.' + parts[1]);
        let sigBytes;
        try { sigBytes = b64urlDecode(parts[2]); }
        catch (e) { setVerifyResult('bad', '签名无效', '原因：签名段不是合法的 base64url 编码（' + escapeHtml(e.message) + '）。'); return; }
        if (!sigBytes.length) {
            setVerifyResult('warn', '⚠ 未签名警告', '签名段为空：该 token 未签名，请勿信任。');
            return;
        }

        try {
            let ok;
            if (cfg.kind === 'hmac') {
                const secret = vSecret.value || '';
                if (!secret) { setVerifyResult('warn', '缺少密钥', 'HS 系列需要输入 Secret 才能验证签名。'); return; }
                const key = await crypto.subtle.importKey('raw', te.encode(secret),
                    { name: 'HMAC', hash: cfg.hash }, false, ['verify']);
                ok = await crypto.subtle.verify('HMAC', key, sigBytes, data);
                if (ok) {
                    setVerifyResult('ok', '✓ 签名有效', '该 token 的签名与所给 Secret 匹配（' + normAlg + '），内容未被篡改。');
                } else {
                    setVerifyResult('bad', '✗ 签名无效', '原因：签名不匹配。可能原因：① Secret 不正确；② Payload/Header 被篡改；③ 算法选择与签发时不一致。');
                }
            } else {
                const pem = vPubPem.value.trim();
                if (!pem) { setVerifyResult('warn', '缺少公钥', 'RS256 需要输入公钥 PEM 才能验证签名（签发页签「本地生成 RSA 密钥对」可获得）。'); return; }
                let der;
                try { der = pemToBytes(pem, '公钥 PEM'); }
                catch (e) { setVerifyResult('bad', '签名无效', '原因：' + escapeHtml(e.message)); return; }
                let key;
                try {
                    key = await crypto.subtle.importKey('spki', der,
                        { name: 'RSASSA-PKCS1-v1_5', hash: cfg.hash }, false, ['verify']);
                } catch (e) {
                    setVerifyResult('bad', '签名无效', '原因：公钥 PEM 导入失败，仅支持 SPKI 格式（' + escapeHtml(e.message) + '）。');
                    return;
                }
                ok = await crypto.subtle.verify({ name: 'RSASSA-PKCS1-v1_5' }, key, sigBytes, data);
                if (ok) {
                    setVerifyResult('ok', '✓ 签名有效', '该 token 的签名与所给公钥匹配（' + normAlg + '），内容未被篡改。');
                } else {
                    setVerifyResult('bad', '✗ 签名无效', '原因：签名不匹配。可能原因：① 公钥与私钥不是一对；② Payload/Header 被篡改。');
                }
            }
        } catch (e) {
            setVerifyResult('bad', '签名无效', '原因：验签过程出错（' + escapeHtml(e.message) + '）。');
        }
    });

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    // 验证页签示例
    const SAMPLE_SECRET = 'jwt-demo-secret-2026-toolweb-test!';
    const SAMPLE_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6Ilx1NWYyMFx1NGUwOSIsImlhdCI6MTc5ODc2MTYwMCwiZXhwIjoxODkzNDU2MDAwLCJpc3MiOiJ0b29sd2ViLWRlbW8ifQ.cvQf3WKG2wYXTh8VHRIbloowRVaoc3if0iugzSml4WY';
    const NONE_TOKEN = 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJtYWxsb3J5IiwiYWRtaW4iOnRydWUsImlhdCI6MTc5ODc2MTYwMH0.';

    $('jsv-sample-valid').addEventListener('click', () => {
        tokenInput.value = SAMPLE_TOKEN;
        vSecret.value = SAMPLE_SECRET;
        renderDecoded();
        tokenInput.focus();
    });

    $('jsv-sample-none').addEventListener('click', () => {
        tokenInput.value = NONE_TOKEN;
        renderDecoded();
        tokenInput.focus();
    });

    $('jsv-clear-verify').addEventListener('click', () => {
        tokenInput.value = '';
        vSecret.value = '';
        vPubPem.value = '';
        renderDecoded();
        tokenInput.focus();
    });

    // 「去签发页签」跳转
    $('jsv-goto-encode').addEventListener('click', () => {
        switchTab('encode');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    refreshKeyPanel();
    switchTab('encode');
})();
