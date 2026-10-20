/* YouTube 缩略图下载器 - 纯前端，零依赖
 * 解析 youtube.com/watch?v= / youtu.be / /shorts/ /embed/ /v/ / music.youtube.com 链接及裸 11 位 ID
 * 5 档缩略图：maxresdefault(1280x720) / sddefault(640x480) / hqdefault(480x360) / mqdefault(320x180) / default(120x90)
 * 下载引擎：fetch -> blob -> createObjectURL -> a[download]；maxres 404 时 onerror 降级 sd
 */
'use strict';

var YT_TIERS = [
    { key: 'maxresdefault', label: 'maxresdefault', desc: '高清 1280×720', width: 1280, height: 720 },
    { key: 'sddefault',     label: 'sddefault',     desc: '标清 640×480',   width: 640,  height: 480 },
    { key: 'hqdefault',     label: 'hqdefault',     desc: '高清 480×360',   width: 480,  height: 360 },
    { key: 'mqdefault',     label: 'mqdefault',     desc: '中等 320×180',   width: 320,  height: 180 },
    { key: 'default',       label: 'default',       desc: '默认 120×90',    width: 120,  height: 90 }
];

var currentVideoId = '';
var tierAvailability = {};   // key -> 'ok' | 'missing'
var downloadingAll = false;

function ytThumbUrl(id, tierKey) {
    return 'https://i.ytimg.com/vi/' + encodeURIComponent(id) + '/' + tierKey + '.jpg';
}

function ytToast(msg) {
    var el = document.createElement('div');
    el.textContent = msg;
    el.style.cssText = 'position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);background:#111827;color:#fff;padding:.6rem 1.2rem;border-radius:.5rem;z-index:9999;font-size:.9rem;max-width:90vw;text-align:center;';
    document.body.appendChild(el);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 2000);
}

function ytShowError(msg) {
    var box = document.getElementById('yt-error');
    if (!box) return;
    box.style.display = '';
    box.innerHTML = '<i class="material-icons" style="vertical-align:-4px;">error_outline</i> ' + msg;
}

function ytHideError() {
    var box = document.getElementById('yt-error');
    if (!box) return;
    box.style.display = 'none';
    box.innerHTML = '';
}

/* ---- 视频 ID 解析 ---- */
function ytExtractVideoId(input) {
    var s = (input || '').trim();
    if (!s) return { ok: false, error: '请先输入 YouTube 视频链接或视频 ID' };
    // 裸 11 位 ID
    if (/^[A-Za-z0-9_-]{11}$/.test(s)) return { ok: true, id: s };
    // 尝试按 URL 解析（缺协议头时自动补 https://）
    var url;
    try {
        url = new URL(/^https?:\/\//i.test(s) ? s : 'https://' + s);
    } catch (e) {
        return { ok: false, error: '无法识别的输入：请输入有效的 YouTube 链接或 11 位视频 ID' };
    }
    var host = url.hostname.toLowerCase().replace(/^www\./, '');
    var id = '';
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
        id = url.searchParams.get('v') || '';
        if (!id) {
            var m = url.pathname.match(/^\/(?:shorts|embed|v|live)\/([A-Za-z0-9_-]{11})/);
            if (m) id = m[1];
        }
    } else if (host === 'youtu.be') {
        var m2 = url.pathname.match(/^\/([A-Za-z0-9_-]{11})/);
        if (m2) id = m2[1];
    } else {
        return { ok: false, error: '不是 YouTube 链接：仅支持 youtube.com / youtu.be / music.youtube.com 链接或 11 位视频 ID' };
    }
    if (!id) return { ok: false, error: '未能从该链接中解析出视频 ID，请检查链接是否正确' };
    if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return { ok: false, error: '解析出的视频 ID 格式不正确（应为 11 位字母、数字、-、_ 组合）' };
    return { ok: true, id: id };
}

/* ---- 解析入口 ---- */
function ytParse() {
    ytHideError();
    var input = document.getElementById('yt-input').value;
    var r = ytExtractVideoId(input);
    if (!r.ok) {
        ytShowError(r.error);
        return;
    }
    currentVideoId = r.id;
    tierAvailability = {};
    document.getElementById('yt-result').style.display = '';
    document.getElementById('yt-video-id').textContent = r.id;
    document.getElementById('yt-video-link').href = 'https://www.youtube.com/watch?v=' + encodeURIComponent(r.id);
    renderTierCards();
    probeTiers();
}

/* ---- 解析结果 + 5 档卡片渲染 ---- */
function renderTierCards() {
    var wrap = document.getElementById('yt-tiers');
    var html = '';
    YT_TIERS.forEach(function (t) {
        html +=
            '<div class="yt-tier-card" id="yt-card-' + t.key + '">' +
            '  <div class="yt-tier-preview">' +
            '    <img data-tier="' + t.key + '" src="' + ytThumbUrl(currentVideoId, t.key) + '" alt="' + t.key + ' 缩略图" loading="lazy" draggable="false">' +
            '    <span class="yt-tier-badge" id="yt-badge-' + t.key + '" style="display:none;"></span>' +
            '  </div>' +
            '  <div class="yt-tier-name">' + t.label + '</div>' +
            '  <div class="yt-tier-desc">' + t.desc + '</div>' +
            '  <button class="btn btn-primary yt-dl-btn" id="yt-dl-' + t.key + '" onclick="ytDownloadTier(\'' + t.key + '\')">' +
            '    <i class="material-icons" style="font-size:1.1rem;vertical-align:-3px;">download</i> 下载此档' +
            '  </button>' +
            '</div>';
    });
    wrap.innerHTML = html;
}

/* ---- 默认高清预览（优先可用最高档） ---- */
function setMainPreview() {
    var best = null;
    YT_TIERS.forEach(function (t) {
        if (!best && tierAvailability[t.key] !== 'missing') best = t.key;
    });
    var img = document.getElementById('yt-main-preview');
    if (img) img.src = ytThumbUrl(currentVideoId, best || 'hqdefault');
}

/* ---- 逐档探测：maxres 缺失时 onerror 降级到 sd 并标注 ---- */
function probeTiers() {
    setMainPreview();
    YT_TIERS.forEach(function (t) {
        var card = document.getElementById('yt-card-' + t.key);
        var img = card ? card.querySelector('img[data-tier="' + t.key + '"]') : null;
        if (!img) return;
        img.onload = function () {
            tierAvailability[t.key] = 'ok';
            markTierOk(t.key);
        };
        img.onerror = function () {
            tierAvailability[t.key] = 'missing';
            markTierMissing(t.key);
        };
    });
}

function markTierOk(tierKey) {
    var badge = document.getElementById('yt-badge-' + tierKey);
    var btn = document.getElementById('yt-dl-' + tierKey);
    if (badge) badge.style.display = 'none';
    if (btn) btn.disabled = false;
}

function markTierMissing(tierKey) {
    var badge = document.getElementById('yt-badge-' + tierKey);
    var card = document.getElementById('yt-card-' + tierKey);
    var btn = document.getElementById('yt-dl-' + tierKey);
    if (badge) {
        badge.style.display = '';
        badge.textContent = '该视频无此档';
    }
    if (card) card.classList.add('yt-tier-missing');
    if (btn) btn.disabled = true;
    // 预览图降级：用 sddefault 替代缺失档位，避免破图
    var img = card ? card.querySelector('img[data-tier="' + tierKey + '"]') : null;
    if (img && tierKey !== 'sddefault') {
        img.onerror = null;
        img.src = ytThumbUrl(currentVideoId, 'sddefault');
    }
    setMainPreview();
}

/* ---- 下载引擎：fetch -> blob -> objectURL -> a[download] ---- */
function ytTriggerSave(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
        if (a.parentNode) a.parentNode.removeChild(a);
        URL.revokeObjectURL(url);
    }, 4000);
}

async function ytFetchTierBlob(id, tierKey) {
    var resp = await fetch(ytThumbUrl(id, tierKey), { mode: 'cors' });
    if (!resp.ok) {
        var err = new Error('HTTP ' + resp.status);
        err.status = resp.status;
        throw err;
    }
    var blob = await resp.blob();
    if (!blob || !blob.size) throw new Error('empty');
    return blob;
}

async function ytDownloadTier(tierKey) {
    if (!currentVideoId) { ytShowError('请先解析视频'); return; }
    if (tierAvailability[tierKey] === 'missing') {
        ytToast('该视频无此档（' + tierKey + '），已自动使用 sd 档');
        tierKey = 'sddefault';
    }
    var btn = document.getElementById('yt-dl-' + tierKey);
    try {
        if (btn) { btn.disabled = true; btn.textContent = '下载中…'; }
        var blob = await ytFetchTierBlob(currentVideoId, tierKey);
        ytTriggerSave(blob, 'youtube-' + currentVideoId + '-' + tierKey + '.jpg');
        ytToast('已开始下载 ' + tierKey);
    } catch (e) {
        if (tierKey === 'maxresdefault' && e && e.status === 404) {
            ytToast('该视频无此档（maxres），已自动使用 sd 档');
            if (btn) { btn.disabled = false; }
            return ytDownloadTier('sddefault');
        }
        ytToast('下载失败：' + (e && e.message ? e.message : '网络错误') + '，请重试');
    } finally {
        if (btn && tierAvailability[tierKey] !== 'missing') {
            btn.disabled = false;
            btn.innerHTML = '<i class="material-icons" style="font-size:1.1rem;vertical-align:-3px;">download</i> 下载此档';
        }
    }
}

/* ---- 全部下载：顺序逐档，跳过缺失档 ---- */
async function ytDownloadAll() {
    if (!currentVideoId) { ytShowError('请先解析视频'); return; }
    if (downloadingAll) return;
    downloadingAll = true;
    var btn = document.getElementById('yt-download-all');
    if (btn) btn.disabled = true;
    var done = 0, skipped = 0;
    for (var i = 0; i < YT_TIERS.length; i++) {
        var t = YT_TIERS[i];
        if (tierAvailability[t.key] === 'missing') { skipped++; continue; }
        try {
            var blob = await ytFetchTierBlob(currentVideoId, t.key);
            ytTriggerSave(blob, 'youtube-' + currentVideoId + '-' + t.key + '.jpg');
            done++;
        } catch (e) {
            skipped++;
        }
        if (btn) btn.textContent = '下载中 ' + (i + 1) + '/' + YT_TIERS.length + '…';
        await new Promise(function (r) { setTimeout(r, 500); });
    }
    if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="material-icons">download</i> 全部下载';
    }
    downloadingAll = false;
    ytToast(done > 0 ? ('已下载 ' + done + ' 档' + (skipped ? '，' + skipped + ' 档缺失已跳过' : '')) : '全部下载失败，请检查网络后重试');
}

/* ---- 示例 / 清空 ---- */
function ytFillExample(kind) {
    var samples = {
        watch: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        short: 'https://youtu.be/dQw4w9WgXcQ',
        shorts: 'https://www.youtube.com/shorts/dQw4w9WgXcQ',
        embed: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
        bare: 'dQw4w9WgXcQ',
        music: 'https://music.youtube.com/watch?v=dQw4w9WgXcQ'
    };
    document.getElementById('yt-input').value = samples[kind] || '';
    ytHideError();
}

function ytClear() {
    document.getElementById('yt-input').value = '';
    document.getElementById('yt-result').style.display = 'none';
    document.getElementById('yt-tiers').innerHTML = '';
    var img = document.getElementById('yt-main-preview');
    if (img) img.removeAttribute('src');
    currentVideoId = '';
    tierAvailability = {};
    ytHideError();
}

// 回车快捷解析
document.addEventListener('DOMContentLoaded', function () {
    var input = document.getElementById('yt-input');
    if (input) {
        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                ytParse();
            }
        });
    }
});
