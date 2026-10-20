/* 正则表达式解释器 - 安全匹配 Worker
 *
 * 在独立线程中执行正则匹配，主线程永不阻塞。
 * 主线程另有 3 秒超时熔断：超时即 terminate 本 Worker。
 * Worker 内部也有 2800ms 兜底，避免极端回溯把线程卡死过久。
 */
'use strict';

var MAX_MATCHES = 300;
var INNER_GUARD_MS = 2800;

self.onmessage = function (ev) {
    var d = ev.data || {};
    var t0 = Date.now();
    var pattern = String(d.pattern || '');
    var text = String(d.text || '');
    var flags = String(d.flags || '').replace(/[^dgimsuvy]/g, '');
    /* 强制全局模式以便枚举全部匹配 */
    var gf = flags.indexOf('g') === -1 ? flags + 'g' : flags;
    try {
        var re = new RegExp(pattern, gf);
        var matches = [];
        var m;
        re.lastIndex = 0;
        var guard = Date.now();
        while ((m = re.exec(text)) !== null) {
            matches.push({
                index: m.index,
                full: m[0],
                groups: Array.prototype.slice.call(m, 1),
                named: m.groups ? shallowCopy(m.groups) : null
            });
            if (matches.length >= MAX_MATCHES) break;
            if (m[0] === '') {
                /* 空匹配：手动前进一步，防止死循环 */
                re.lastIndex++;
                if (re.lastIndex > text.length) break;
            }
            if (Date.now() - guard > INNER_GUARD_MS) break; /* 内部兜底 */
        }
        self.postMessage({
            ok: true,
            matches: matches,
            truncated: matches.length >= MAX_MATCHES,
            elapsedMs: Date.now() - t0
        });
    } catch (err) {
        self.postMessage({ ok: false, error: String((err && err.message) || err) });
    }
};

function shallowCopy(obj) {
    var out = {};
    Object.keys(obj).forEach(function (k) { out[k] = obj[k]; });
    return out;
}
