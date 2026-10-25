/* 匿名抽签生成器（secret_santa_generator）- 纯前端零上传
 * 保密配对：错位排列＋禁互抽＋自定义排除对，生成后默认不展示全量配对表，
 * 只给计数校验报告，轮流点选一人一次只显示单条结果。
 * 真限制（页面与代码双重保证）：
 *  1. 保密仅限单设备单会话：结果只存在内存变量里，不写 localStorage /
 *     sessionStorage / URL 参数，不生成私密链接，不上传名单；
 *  2. 禁互抽默认开时 n=2 无解：到尝试上限仍无解明确报错并给松绑建议，
 *     不无限循环、不静默放宽约束；
 *  3. 重名按姓名栏判定：同名出现两次即阻止生成，备注只作显示辅助，
 *     不用于区分身份；
 *  4. 刷新 / 关闭即失：结果与名单均不持久化。
 * 随机源：crypto.getRandomValues（浏览器）或测试注入的随机源；
 * 配对路径只用安全随机源洗牌，不用浏览器伪随机函数。
 * 纯函数经 module.exports 暴露供 node 测试；浏览器里走 DOM。
 *   node tests/secret_santa_generator.test.js
 */
(function () {
'use strict';

var MAX_PEOPLE = 200;
var MIN_PEOPLE = 3;
var MAX_ATTEMPTS = 10000;

/* ---------- 名单解析 ---------- */

/* 一行解析为 {name, note, display}：支持「姓名」或「姓名-备注」。
 * 分隔符取第一个 - ／ － ／ —；备注仅作显示辅助，不用于区分身份。 */
function parseLine(line) {
    var text = String(line).replace(/^\s+|\s+$/g, '');
    if (!text) return null;
    var m = text.match(/^([^\-－—]+?)\s*[\-－—]\s*(.+)$/);
    if (m) {
        var name = m[1].replace(/^\s+|\s+$/g, '');
        var note = m[2].replace(/^\s+|\s+$/g, '');
        if (!name) return null;
        return { name: name, note: note || null, display: note ? name + '（' + note + '）' : name };
    }
    return { name: text, note: null, display: text };
}

/* 粘贴文本 → {entries, removedEmpty, removedDup}。
 * 去空行；全行完全相同（姓名＋备注都相同）视为重复粘贴，去重； */
function parseNames(text) {
    var lines = String(text == null ? '' : text).split(/\r?\n/);
    var entries = [], seen = {}, removedEmpty = 0, removedDup = 0;
    lines.forEach(function (line) {
        var e = parseLine(line);
        if (!e) { removedEmpty++; return; }
        var key = e.name + '\u0000' + (e.note || '');
        if (seen[key]) { removedDup++; return; }
        seen[key] = true;
        entries.push(e);
    });
    return { entries: entries, removedEmpty: removedEmpty, removedDup: removedDup };
}

/* 重名检测（按姓名栏，不按备注）：返回出现 2 次及以上的姓名列表。 */
function findDuplicateNames(entries) {
    var counts = {}, order = [];
    entries.forEach(function (e) {
        if (!counts[e.name]) order.push(e.name);
        counts[e.name] = (counts[e.name] || 0) + 1;
    });
    return order.filter(function (n) { return counts[n] > 1; }).map(function (n) {
        return { name: n, count: counts[n] };
    });
}

/* ---------- 排除对解析 ---------- */

/* 排除对每行一对，分隔符取第一个 ， ／ ， ／ 、 ／ |；两侧按显示名优先、
 * 姓名栏其次匹配名单；匹配不上或自指均报错。 */
function parseExclusions(text, entries) {
    var byDisplay = {}, byName = {};
    entries.forEach(function (e) {
        byDisplay[e.display] = e;
        if (!byName[e.name]) byName[e.name] = e;
        else byName[e.name] = null; /* 重名姓名栏歧义，匹配时报错 */
    });
    function lookup(s) {
        if (byDisplay[s]) return byDisplay[s];
        if (byName[s]) return byName[s];
        return null;
    }
    var pairs = [], errors = [];
    String(text == null ? '' : text).split(/\r?\n/).forEach(function (raw) {
        var line = raw.replace(/^\s+|\s+$/g, '');
        if (!line) return;
        var parts = line.split(/\s*[,，、|]\s*/);
        if (parts.length !== 2 || !parts[0] || !parts[1]) {
            errors.push('排除对格式不对（每行一对，用逗号分隔两人）：' + line);
            return;
        }
        var a = lookup(parts[0]), b = lookup(parts[1]);
        if (!a || !b) {
            errors.push('排除对里的人不在名单中：' + line);
            return;
        }
        if (a.display === b.display) {
            errors.push('排除对不能是同一个人：' + line);
            return;
        }
        var key = [a.display, b.display].sort().join('\u0000');
        var dup = pairs.some(function (p) {
            return [p[0].display, p[1].display].sort().join('\u0000') === key;
        });
        if (!dup) pairs.push([a, b]);
    });
    return { pairs: pairs, errors: errors };
}

/* ---------- 安全随机 ---------- */

function defaultRandUint32() {
    var buf = new Uint32Array(1);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        crypto.getRandomValues(buf);
        return buf[0];
    }
    if (typeof require !== 'undefined') {
        try {
            var c = require('crypto');
            return c.randomBytes(4).readUInt32LE(0);
        } catch (e) { /* 落到测试注入源；浏览器永远走 crypto 分支 */ }
    }
    throw new Error('当前环境没有可用的安全随机源');
}

/* [0, bound) 均匀整数：拒绝采样消除取模偏差；注入源退化时有上限兜底。 */
function randomBelow(bound, randUint32) {
    if (bound <= 1) return 0;
    var rand = randUint32 || defaultRandUint32;
    var limit = Math.floor(4294967296 / bound) * bound;
    for (var i = 0; i < MAX_ATTEMPTS; i++) {
        var v = rand() >>> 0;
        if (v < limit) return v % bound;
    }
    return (rand() >>> 0) % bound;
}

function shuffle(arr, randUint32) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
        var j = randomBelow(i + 1, randUint32);
        var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
}

/* ---------- 配对生成与校验 ---------- */

/* options: {noMutual: bool, exclusions: [[entryA, entryB]]}
 * exclusions 按显示名比对，双向生效（A 不抽 B 且 B 不抽 A）。 */
function pairingValid(order, entries, options) {
    var n = entries.length;
    var excluded = {};
    (options.exclusions || []).forEach(function (p) {
        excluded[p[0].display + '\u0000' + p[1].display] = true;
        excluded[p[1].display + '\u0000' + p[0].display] = true;
    });
    var drawnBy = {};
    for (var i = 0; i < n; i++) {
        var giver = entries[i], receiver = entries[order[i]];
        if (giver.display === receiver.display) return false; /* 自抽 */
        if (excluded[giver.display + '\u0000' + receiver.display]) return false;
        if (drawnBy[receiver.display] !== undefined) return false; /* 非双射 */
        drawnBy[receiver.display] = i;
    }
    if (options.noMutual) {
        for (var k = 0; k < n; k++) {
            if (order[order[k]] === k) return false; /* 互抽 */
        }
    }
    return true;
}

/* 快速不可行预判：个人无合法接收人，或某人无人可抽（排除对覆盖全部他人）。 */
function quickInfeasible(entries, options) {
    var n = entries.length;
    var excluded = {};
    (options.exclusions || []).forEach(function (p) {
        excluded[p[0].display + '\u0000' + p[1].display] = true;
    });
    for (var i = 0; i < n; i++) {
        var canGive = 0, canBeDrawn = 0;
        for (var j = 0; j < n; j++) {
            if (i === j) continue;
            if (!excluded[entries[i].display + '\u0000' + entries[j].display]) canGive++;
            if (!excluded[entries[j].display + '\u0000' + entries[i].display]) canBeDrawn++;
        }
        if (canGive === 0) return '「' + entries[i].display + '」排除了所有其他人，没有合法的互赠对象。';
        if (canBeDrawn === 0) return '「' + entries[i].display + '」被所有其他人排除，无人能抽到他。';
    }
    return null;
}

function suggestRelax(options) {
    var tips = [];
    if (options.noMutual) tips.push('关闭「禁互抽」再试一次');
    if ((options.exclusions || []).length) tips.push('删减自定义排除对再试一次');
    tips.push('增加参与人数再试一次');
    return tips.join('、');
}

/* 生成：错位排列＋约束拒绝采样；到上限无解明确报错，不静默放宽。 */
function generatePairing(entries, options, randUint32) {
    options = options || {};
    var n = entries.length;
    if (options.noMutual && n === 2) {
        return { ok: false, error: '禁互抽开启时 2 人无解：2 人错位排列只有互抽一种可能。',
            suggestion: '增加人数到 3 人及以上再生成。' };
    }
    if (n < MIN_PEOPLE) {
        return { ok: false, error: '人数不足：当前 ' + n + ' 人，至少需要 3 人才能抽签。',
            suggestion: '增加参与人数到 3 人及以上再生成。' };
    }
    var quick = quickInfeasible(entries, options);
    if (quick) {
        return { ok: false, error: '约束无解：' + quick, suggestion: suggestRelax(options) + '。' };
    }
    var base = [];
    for (var i = 0; i < n; i++) base.push(i);
    for (var attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        var order = shuffle(base, randUint32);
        if (pairingValid(order, entries, options)) {
            var pairs = entries.map(function (giver, i) {
                return { giver: giver, receiver: entries[order[i]] };
            });
            return { ok: true, pairs: pairs, attempts: attempt, error: null, suggestion: null };
        }
    }
    return { ok: false, attempts: MAX_ATTEMPTS,
        error: '约束无解：在 ' + MAX_ATTEMPTS + ' 次尝试内未找到同时满足禁自抽、禁互抽与排除对的配对。',
        suggestion: '请' + suggestRelax(options) + '。' };
}

/* 校验报告：只给计数结论，绝不含配对明细。 */
function verifyPairing(pairs, options) {
    options = options || {};
    var n = pairs.length;
    var selfCount = 0, mutualCount = 0, excludedHits = 0;
    var receivers = {}, givers = {};
    var excluded = {};
    (options.exclusions || []).forEach(function (p) {
        excluded[p[0].display + '\u0000' + p[1].display] = true;
    });
    var indexOf = {};
    pairs.forEach(function (p, i) { indexOf[p.giver.display] = i; });
    pairs.forEach(function (p) {
        if (p.giver.display === p.receiver.display) selfCount++;
        if (excluded[p.giver.display + '\u0000' + p.receiver.display]) excludedHits++;
        receivers[p.receiver.display] = (receivers[p.receiver.display] || 0) + 1;
        givers[p.giver.display] = (givers[p.giver.display] || 0) + 1;
        var back = pairs[indexOf[p.receiver.display]];
        if (back && back.receiver.display === p.giver.display) mutualCount++;
    });
    mutualCount = mutualCount / 2;
    var bijective = n > 0 && Object.keys(receivers).length === n && Object.keys(givers).length === n &&
        Object.keys(receivers).every(function (k) { return receivers[k] === 1; });
    return { total: n, selfCount: selfCount, mutualCount: mutualCount,
        excludedHits: excludedHits, bijective: bijective,
        valid: selfCount === 0 && excludedHits === 0 && bijective &&
            (!options.noMutual || mutualCount === 0) };
}

/* 单人结果文本：只含该单人一条。 */
function singleResultText(pair) {
    return pair.giver.display + '，你的互赠对象是' + pair.receiver.display;
}

/* 切人遮罩状态：切人时上一条自动作废，屏幕上永远最多一条结果。 */
function viewerSwitch(prevDisplay, nextDisplay) {
    if (!nextDisplay) return { current: null, clearedPrevious: !!prevDisplay };
    if (prevDisplay && prevDisplay !== nextDisplay) {
        return { current: nextDisplay, clearedPrevious: true };
    }
    return { current: nextDisplay, clearedPrevious: false };
}

/* 生成按钮文案：含人数与规则摘要。 */
function generateButtonLabel(count, options) {
    options = options || {};
    var rules = ['禁自抽'];
    if (options.noMutual) rules.push('禁互抽');
    if ((options.exclusions || []).length) rules.push('排除对 ' + options.exclusions.length + ' 对');
    return '为 ' + count + ' 人生成配对（' + rules.join('＋') + '）';
}

/* ---------- 浏览器 DOM 绑定 ---------- */
function bindPage() {
    if (typeof document === 'undefined') return;
    var $ = function (id) { return document.getElementById(id); };
    var pairs = null;          /* 结果只存内存变量，不持久化 */
    var currentViewer = null;  /* 当前屏幕上唯一可见的单人结果 */
    var viewed = {};           /* 已看标记：只记显示名，不记配对 */
    var lastOptions = null;

    function toast(msg) {
        var t = $('ss-toast'); if (!t) return;
        t.textContent = msg; t.className = 'show';
        setTimeout(function () { t.className = ''; }, 2800);
    }

    function currentEntries() {
        var parsed = parseNames($('ss-names').value);
        return parsed;
    }

    function currentExclusions(entries) {
        return parseExclusions($('ss-exclusions').value, entries);
    }

    function refreshCount() {
        var parsed = currentEntries();
        var dups = findDuplicateNames(parsed.entries);
        var countEl = $('ss-count'), warnEl = $('ss-dup-warn'), btn = $('ss-generate');
        var parts = ['已识别 ' + parsed.entries.length + ' 人'];
        if (parsed.removedEmpty) parts.push('已跳过 ' + parsed.removedEmpty + ' 个空行');
        if (parsed.removedDup) parts.push('已去重 ' + parsed.removedDup + ' 行');
        if (countEl) countEl.textContent = parts.join('；');
        if (warnEl) {
            if (dups.length) {
                warnEl.style.display = 'block';
                warnEl.textContent = '重名阻止生成：' + dups.map(function (d) {
                    return '「' + d.name + '」出现 ' + d.count + ' 次';
                }).join('、') + '。轮流查看靠姓名认人，请把重名改成互不相同的姓名（例如在姓名后加部门／工号写成不同姓名）后再生成；只写备注不能区分身份。';
            } else warnEl.style.display = 'none';
        }
        var excl = currentExclusions(parsed.entries);
        var exclWarn = $('ss-excl-warn');
        if (exclWarn) {
            if (excl.errors.length) {
                exclWarn.style.display = 'block';
                exclWarn.textContent = excl.errors.join('；');
            } else exclWarn.style.display = 'none';
        }
        var opts = { noMutual: $('ss-no-mutual').checked,
            exclusions: excl.errors.length ? [] : excl.pairs };
        if (btn) {
            btn.textContent = generateButtonLabel(parsed.entries.length, opts);
            btn.disabled = parsed.entries.length < MIN_PEOPLE || dups.length > 0 ||
                excl.errors.length > 0 || parsed.entries.length > MAX_PEOPLE;
        }
        var overEl = $('ss-over-warn');
        if (overEl) {
            if (parsed.entries.length > MAX_PEOPLE) {
                overEl.style.display = 'block';
                overEl.textContent = '人数超过上限：当前 ' + parsed.entries.length + ' 人，建议上限 200 人，请分批抽签。';
            } else overEl.style.display = 'none';
        }
        var mutualNote = $('ss-mutual-note');
        if (mutualNote) {
            mutualNote.textContent = $('ss-no-mutual').checked ?
                '禁互抽已开启：不会出现两人互抽。' :
                '禁互抽已关闭：可能出现两人互抽，请确认参与者接受这一点。';
        }
        return { parsed: parsed, dups: dups, excl: excl, opts: opts };
    }

    function clearResult(silent) {
        pairs = null; currentViewer = null; viewed = {};
        var sel = $('ss-viewer'); if (sel) sel.innerHTML = '';
        var area = $('ss-single'); if (area) area.textContent = '尚未生成，或结果已被清空。';
        var rep = $('ss-report'); if (rep) rep.textContent = '';
        var res = $('ss-result-panel'); if (res) res.style.display = 'none';
        var copyBtn = $('ss-copy'); if (copyBtn) copyBtn.disabled = true;
        var hideBtn = $('ss-hide'); if (hideBtn) hideBtn.disabled = true;
        if (!silent) toast('结果已清空');
    }

    function renderViewerOptions() {
        var sel = $('ss-viewer'); if (!sel || !pairs) return;
        sel.innerHTML = '';
        var ph = document.createElement('option');
        ph.value = ''; ph.textContent = '请选择要查看的人（一次只显示一人）';
        sel.appendChild(ph);
        pairs.forEach(function (p) {
            var o = document.createElement('option');
            o.value = p.giver.display;
            o.textContent = p.giver.display + (viewed[p.giver.display] ? '（已看）' : '');
            sel.appendChild(o);
        });
    }

    function showSingle(display) {
        var sw = viewerSwitch(currentViewer, display);
        currentViewer = sw.current;
        var area = $('ss-single');
        if (!display) { if (area) area.textContent = '已遮罩：请选择一人查看。'; return; }
        var found = null;
        pairs.forEach(function (p) { if (p.giver.display === display) found = p; });
        if (!found) { if (area) area.textContent = '找不到该人的结果。'; return; }
        viewed[display] = true;
        if (area) area.textContent = singleResultText(found);
        var copyBtn = $('ss-copy'); if (copyBtn) copyBtn.disabled = false;
        var hideBtn = $('ss-hide'); if (hideBtn) hideBtn.disabled = false;
        renderViewerOptions();
        var sel = $('ss-viewer'); if (sel) sel.value = display;
    }

    $('ss-names').addEventListener('input', function () {
        if (pairs) { clearResult(true); toast('名单已更改，先前结果已作废，请重新生成'); }
        refreshCount();
    });
    $('ss-exclusions').addEventListener('input', function () {
        if (pairs) { clearResult(true); toast('排除对已更改，先前结果已作废，请重新生成'); }
        refreshCount();
    });
    $('ss-no-mutual').addEventListener('change', function () {
        if (pairs) { clearResult(true); toast('配对规则已更改，先前结果已作废，请重新生成'); }
        refreshCount();
    });

    var clearNamesBtn = $('ss-clear-names');
    if (clearNamesBtn) clearNamesBtn.addEventListener('click', function () {
        if ($('ss-names').value && !window.confirm('确定要清空名单吗？')) return;
        $('ss-names').value = '';
        if (pairs) clearResult(true);
        refreshCount(); toast('名单已清空');
    });

    var genBtn = $('ss-generate');
    if (genBtn) genBtn.addEventListener('click', function () {
        var st = refreshCount();
        var entries = st.parsed.entries;
        if (st.dups.length) { toast('重名未解决，无法生成'); return; }
        if (st.excl.errors.length) { toast('排除对有误，无法生成'); return; }
        if (entries.length < MIN_PEOPLE) { toast('人数不足 3 人，无法生成'); return; }
        if (entries.length > MAX_PEOPLE) { toast('人数超过 200 人上限，请分批'); return; }
        var res = generatePairing(entries, st.opts);
        var errEl = $('ss-gen-error');
        if (!res.ok) {
            pairs = null;
            if (errEl) { errEl.style.display = 'block'; errEl.textContent = res.error + '建议：' + res.suggestion; }
            toast('生成失败：约束无解或人数不足');
            return;
        }
        if (errEl) errEl.style.display = 'none';
        pairs = res.pairs; lastOptions = st.opts; currentViewer = null; viewed = {};
        var report = verifyPairing(pairs, st.opts);
        var rep = $('ss-report');
        if (rep) {
            rep.textContent = '已生成 ' + report.total + ' 对配对（只给计数结论，不展示明细）：' +
                '自抽 ' + report.selfCount + ' 对、互抽 ' + report.mutualCount + ' 对、' +
                '排除对命中 ' + report.excludedHits + ' 对、每人恰被抽 1 次' +
                (report.bijective ? '（已验证）' : '（异常，请重新生成）') + '。';
        }
        var resPanel = $('ss-result-panel');
        if (resPanel) resPanel.style.display = 'block';
        var area = $('ss-single');
        if (area) area.textContent = '请在下方选择一人查看（一次只显示一条结果）。';
        renderViewerOptions();
        toast('配对已生成（第 ' + res.attempts + ' 次尝试成功），请轮流查看');
    });

    var viewerSel = $('ss-viewer');
    if (viewerSel) viewerSel.addEventListener('change', function () {
        if (!pairs) return;
        /* 切人先遮罩上一条，再只显示新选的一条 */
        var area = $('ss-single');
        if (area) area.textContent = '•••• 已遮罩上一条';
        showSingle(viewerSel.value || null);
    });

    var hideBtn = $('ss-hide');
    if (hideBtn) hideBtn.addEventListener('click', function () {
        currentViewer = null;
        var area = $('ss-single');
        if (area) area.textContent = '已遮罩：请选择一人重新查看。';
        var sel = $('ss-viewer'); if (sel) sel.value = '';
        hideBtn.disabled = true;
        var copyBtn = $('ss-copy'); if (copyBtn) copyBtn.disabled = true;
    });

    var copyBtn = $('ss-copy');
    if (copyBtn) copyBtn.addEventListener('click', function () {
        if (!pairs || !currentViewer) { toast('请先选择一人查看结果'); return; }
        var found = null;
        pairs.forEach(function (p) { if (p.giver.display === currentViewer) found = p; });
        if (!found) { toast('找不到当前结果'); return; }
        var text = singleResultText(found); /* 只含该单人一条 */
        var done = function () { toast('已复制该单人结果（仅含这一条）'); };
        var fallback = function () {
            var ta = document.createElement('textarea');
            ta.value = text; document.body.appendChild(ta); ta.select();
            try { document.execCommand('copy'); done(); }
            catch (e) { toast('复制失败：请手动选中上方单人结果，按 Ctrl+C 复制'); }
            document.body.removeChild(ta);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(done).catch(fallback);
        } else fallback();
    });

    var clearBtn = $('ss-clear-result');
    if (clearBtn) clearBtn.addEventListener('click', function () {
        if (!pairs) return;
        if (!window.confirm('确定要清空当前抽签结果吗？清空后结果无法恢复，需要重新抽签。')) return;
        clearResult();
    });

    var regenBtn = $('ss-regen');
    if (regenBtn) regenBtn.addEventListener('click', function () {
        if (!pairs) return;
        if (!window.confirm('确定要重新抽签吗？当前结果将被销毁，重新生成一份新的配对。')) return;
        clearResult(true);
        genBtn.click();
    });

    refreshCount();
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindPage);
    else bindPage();
}

var api = {
    MAX_PEOPLE: MAX_PEOPLE, MIN_PEOPLE: MIN_PEOPLE, MAX_ATTEMPTS: MAX_ATTEMPTS,
    parseLine: parseLine, parseNames: parseNames,
    findDuplicateNames: findDuplicateNames,
    parseExclusions: parseExclusions,
    randomBelow: randomBelow, shuffle: shuffle,
    pairingValid: pairingValid, quickInfeasible: quickInfeasible,
    generatePairing: generatePairing, verifyPairing: verifyPairing,
    singleResultText: singleResultText, viewerSwitch: viewerSwitch,
    generateButtonLabel: generateButtonLabel, suggestRelax: suggestRelax
};
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.SecretSantaGenerator = api;
})();
