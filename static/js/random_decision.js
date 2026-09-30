/* 随机决策器 - 纯前端逻辑（三个模式：随机抽取 / 抛硬币 / Yes-No 快问） */
(function () {
    'use strict';

    /* ---------- 通用工具 ---------- */
    function $(id) { return document.getElementById(id); }

    function esc(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    /* 真随机整数 [0, max) */
    function randInt(max) {
        if (max <= 0) return 0;
        var buf = new Uint32Array(1);
        window.crypto.getRandomValues(buf);
        return buf[0] % max;
    }

    function toast(msg) {
        var el = document.createElement('div');
        el.textContent = msg;
        el.style.cssText = 'position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);' +
            'background:#111827;color:#fff;padding:.6rem 1.2rem;border-radius:.5rem;z-index:9999;font-size:.9rem;';
        document.body.appendChild(el);
        setTimeout(function () { document.body.removeChild(el); }, 1600);
    }

    function copyText(t, okMsg) {
        if (navigator.clipboard) {
            navigator.clipboard.writeText(t).then(
                function () { toast(okMsg || '已复制'); },
                function () { toast('复制失败，请手动复制'); });
        } else {
            var ta = document.createElement('textarea');
            ta.value = t; document.body.appendChild(ta); ta.select();
            try { document.execCommand('copy'); toast(okMsg || '已复制'); }
            catch (e) { toast('复制失败，请手动复制'); }
            document.body.removeChild(ta);
        }
    }

    function loadJSON(key, fallback) {
        try {
            var v = localStorage.getItem(key);
            return v ? JSON.parse(v) : fallback;
        } catch (e) { return fallback; }
    }

    function saveJSON(key, val) {
        try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* 忽略 */ }
    }

    function nowStr() {
        var d = new Date();
        function p(n) { return (n < 10 ? '0' : '') + n; }
        return (d.getMonth() + 1) + '-' + d.getDate() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
    }

    /* ---------- Tab 切换 ---------- */
    window.rdSwitchTab = function (which) {
        ['draw', 'coin', 'yesno'].forEach(function (t) {
            $('rd-tab-' + t).className = 'rd-tab' + (t === which ? ' active' : '');
            $('rd-panel-' + t).style.display = t === which ? '' : 'none';
        });
    };

    /* ---------- 预设清单 ---------- */
    var PRESETS = {
        '中餐': ['麻辣烫', '黄焖鸡米饭', '兰州拉面', '沙县小吃', '煲仔饭', '盖浇饭', '饺子', '炒粉', '肠粉', '牛肉面', '酸菜鱼', '回锅肉盖饭'],
        '西餐': ['汉堡', '意面', '披萨', '牛排', '轻食沙拉', '三明治', '炸鸡', '意式烩饭', '墨西哥卷饼'],
        '轻食': ['轻食沙拉', '低卡便当', '寿司', '鸡胸肉卷', '藜麦碗', '水果捞', '蔬菜三明治'],
        '奶茶': ['喜茶', '奈雪的茶', '蜜雪冰城', '霸王茶姬', '古茗', '茶百道', '一点点', '沪上阿姨']
    };

    /* ---------- 状态（localStorage 持久化） ---------- */
    var LS_OPTIONS = 'rd_options_v1';
    var LS_HISTORY = 'rd_history_v1';
    var LS_COIN = 'rd_coin_v1';

    var options = loadJSON(LS_OPTIONS, null);
    if (!Array.isArray(options) || !options.length) {
        options = PRESETS['中餐'].slice();
        saveJSON(LS_OPTIONS, options);
    }
    var history = loadJSON(LS_HISTORY, []);
    var coinStats = loadJSON(LS_COIN, { head: 0, tail: 0 });
    var lastDraw = null;   /* {result} 供复制 */
    var lastYesNo = null;  /* {q, ans} 供复制 */
    var drawing = false;
    var flipping = false;
    var coinDeg = 0;       /* 硬币当前累计旋转角度 */

    /* ---------- 随机抽取：选项管理 ---------- */
    function saveOptions() { saveJSON(LS_OPTIONS, options); }

    function renderChips() {
        var box = $('rd-chips');
        if (!options.length) {
            box.innerHTML = '<span style="color:#9ca3af;font-size:.9rem;">暂无选项：点「添加选项」、导入预设或批量输入</span>';
            return;
        }
        var html = '';
        options.forEach(function (o, i) {
            html += '<span class="rd-chip" title="点击编辑" onclick="rdEditOption(' + i + ')">' +
                esc(o) + '<span class="rd-del" title="删除" onclick="event.stopPropagation();rdDelOption(' + i + ')">×</span></span>';
        });
        box.innerHTML = html;
    }

    window.rdAddOption = function () {
        var v = prompt('输入新选项：', '');
        if (v === null) return;
        v = v.trim();
        if (!v) { toast('选项不能为空'); return; }
        options.push(v);
        saveOptions(); renderChips();
        toast('已添加：' + v);
    };

    window.rdEditOption = function (i) {
        var v = prompt('编辑选项：', options[i]);
        if (v === null) return;
        v = v.trim();
        if (!v) { toast('选项不能为空'); return; }
        options[i] = v;
        saveOptions(); renderChips();
    };

    window.rdDelOption = function (i) {
        options.splice(i, 1);
        saveOptions(); renderChips();
    };

    window.rdClearOptions = function () {
        if (!options.length) { toast('已经是空的了'); return; }
        if (!confirm('确定清空全部选项吗？')) return;
        options = [];
        saveOptions(); renderChips();
        toast('已清空');
    };

    window.rdLoadPreset = function (name) {
        options = PRESETS[name].slice();
        saveOptions(); renderChips();
        toast('已载入' + name + '清单（' + options.length + ' 项）');
    };

    window.rdImportBatch = function (replace) {
        var lines = $('rd-batch').value.split('\n')
            .map(function (s) { return s.trim(); })
            .filter(function (s) { return s.length > 0; });
        if (!lines.length) { toast('批量输入框是空的'); return; }
        options = replace ? lines : options.concat(lines);
        saveOptions(); renderChips();
        $('rd-batch').value = '';
        toast((replace ? '已替换导入 ' : '已追加导入 ') + lines.length + ' 个选项');
    };

    /* ---------- 随机抽取：开奖动画 ---------- */
    window.rdDraw = function () {
        if (drawing) return;
        if (options.length < 2) { toast('至少需要 2 个选项才能抽取'); return; }
        drawing = true;
        var box = $('rd-draw-box');
        box.classList.remove('win');
        $('rd-draw-btn').disabled = true;

        var total = 1600;          /* 动画总时长 */
        var start = Date.now();
        var result = options[randInt(options.length)];

        (function tick() {
            var el = Date.now() - start;
            if (el >= total) {
                box.textContent = result;
                box.classList.add('win');
                drawing = false;
                $('rd-draw-btn').disabled = false;
                lastDraw = { result: result };
                addHistory('抽取', '共' + options.length + '项', result);
                return;
            }
            /* 滚动高亮：随机闪烁选项 */
            box.textContent = options[randInt(options.length)];
            setTimeout(tick, 60 + (el / total) * 180);
        })();
    };

    window.rdCopyDraw = function () {
        if (!lastDraw) { toast('还没有抽取结果'); return; }
        copyText('随机抽取结果：' + lastDraw.result, '已复制：' + lastDraw.result);
    };

    /* ---------- 历史 ---------- */
    function addHistory(mode, q, r) {
        history.unshift({ t: nowStr(), m: mode, q: q, r: r });
        if (history.length > 30) history.length = 30;
        saveJSON(LS_HISTORY, history);
        renderHistory();
    }

    function renderHistory() {
        var box = $('rd-history');
        if (!history.length) {
            box.innerHTML = '<div style="color:#9ca3af;font-size:.9rem;">暂无记录，抽一次试试</div>';
            return;
        }
        var html = '';
        history.forEach(function (h) {
            html += '<div class="rd-hist-row"><span class="t">' + esc(h.t) + '</span>' +
                '<span class="m">' + esc(h.m) + '</span>' +
                '<span class="r">' + esc(h.r) + '</span></div>';
        });
        box.innerHTML = html;
    }

    window.rdClearHistory = function () {
        if (!history.length) { toast('历史已经是空的了'); return; }
        history = [];
        saveJSON(LS_HISTORY, history);
        renderHistory();
        toast('已清空历史');
    };

    /* ---------- 抛硬币 ---------- */
    function renderCoinStats() {
        $('rd-coin-head').textContent = coinStats.head;
        $('rd-coin-tail').textContent = coinStats.tail;
        $('rd-coin-total').textContent = coinStats.head + coinStats.tail;
    }

    window.rdFlipCoin = function () {
        if (flipping) return;
        flipping = true;
        var coin = $('rd-coin');
        var resEl = $('rd-coin-result');
        $('rd-coin-btn').disabled = true;
        resEl.textContent = '翻转中…';
        resEl.style.color = '';

        var isHead = randInt(2) === 0;
        /* 落点：正面=0°，反面=180°；每次至少转5圈 */
        var target = coinDeg + 1800;
        var want = isHead ? 0 : 180;
        if (((target % 360) + 360) % 360 !== want) target += 180;
        coinDeg = target;
        coin.style.transform = 'rotateY(' + target + 'deg)';

        setTimeout(function () {
            if (isHead) {
                coinStats.head++;
                resEl.textContent = '🎉 正面！';
                resEl.style.color = '#b45309';
            } else {
                coinStats.tail++;
                resEl.textContent = '🎉 反面！';
                resEl.style.color = '#6d28d9';
            }
            saveJSON(LS_COIN, coinStats);
            renderCoinStats();
            addHistory('抛硬币', '', isHead ? '正面' : '反面');
            flipping = false;
            $('rd-coin-btn').disabled = false;
        }, 2200);
    };

    window.rdResetCoin = function () {
        coinStats = { head: 0, tail: 0 };
        saveJSON(LS_COIN, coinStats);
        renderCoinStats();
        $('rd-coin-result').textContent = '点下方按钮抛一次';
        $('rd-coin-result').style.color = '';
        toast('统计已清零');
    };

    /* ---------- Yes-No 快问 ---------- */
    window.rdAskYesNo = function () {
        var q = $('rd-yn-input').value.trim();
        var box = $('rd-yn-box');
        if (!q) { toast('先输入一个问题吧'); $('rd-yn-input').focus(); return; }
        var btn = $('rd-yn-btn');
        btn.disabled = true;
        box.className = 'rd-yn-box thinking';
        box.textContent = '…';

        var flashes = ['Yes?', 'No?', 'Yes…', 'No…'];
        var i = 0;
        var iv = setInterval(function () {
            box.textContent = flashes[i % flashes.length];
            i++;
        }, 140);

        setTimeout(function () {
            clearInterval(iv);
            var yes = randInt(2) === 0;
            var ans = yes ? '是 YES' : '否 NO';
            box.className = 'rd-yn-box ' + (yes ? 'yes' : 'no');
            box.textContent = ans;
            btn.disabled = false;
            lastYesNo = { q: q, ans: ans };
            addHistory('Yes-No', q.length > 12 ? q.slice(0, 12) + '…' : q, ans);
        }, 1100);
    };

    window.rdCopyYesNo = function () {
        if (!lastYesNo) { toast('还没有揭晓答案'); return; }
        copyText('问题：' + lastYesNo.q + '\n结论：' + lastYesNo.ans, '结论已复制');
    };

    /* ---------- 初始化 ---------- */
    document.addEventListener('DOMContentLoaded', function () {
        renderChips();
        renderHistory();
        renderCoinStats();
        $('rd-yn-input').addEventListener('keydown', function (e) {
            if (e.key === 'Enter') window.rdAskYesNo();
        });
    });
})();
