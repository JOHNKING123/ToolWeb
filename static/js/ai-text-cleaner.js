/* AI 文本清洁器 - 纯前端隐藏字符扫描/清除引擎
 * 数据不出浏览器，无任何后端调用。
 */
(function () {
    'use strict';

    // 分类规则：与 BACKLOG 规格逐项对应
    var RULES = [
        { key: 'zw',   name: '零宽字符',   range: 'U+200B–U+200F', src: '[\\u200B-\\u200F]',
          desc: '零宽空格 / 零宽非连接符 / 零宽连接符 / 左至右·右至左标记' },
        { key: 'bom',  name: 'BOM 字节序标记', range: 'U+FEFF', src: '\\uFEFF',
          desc: '文本开头的字节序标记，复制粘贴时常被带入' },
        { key: 'nbsp', name: '非断空格',   range: 'U+00A0', src: '\\u00A0',
          desc: '不换行空格，网页/Word 复制常见，看起来像普通空格' },
        { key: 'shy',  name: '软连字符',   range: 'U+00AD', src: '\\u00AD',
          desc: '仅在换行处显示为连字符，平时完全不可见' },
        { key: 'vs',   name: '变体选择符', range: 'U+FE00–U+FE0F', src: '[\\uFE00-\\uFE0F]',
          desc: '跟在表情/字符后指定字形变体，AI 生成文本常见' },
        { key: 'bidi', name: '方向控制符', range: 'U+202A–U+202E / U+2066–U+2069', src: '[\\u202A-\\u202E\\u2066-\\u2069]',
          desc: 'LRE/RLE/PDF/LRO/RLO 及隔离控制符，可扰乱文本显示顺序' },
        { key: 'tags', name: '标签字符',   range: 'U+E0000–U+E0FFF', src: '[\\u{E0000}-\\u{E0FFF}]',
          desc: 'Unicode 标签块，常被用作不可见水印载体' }
    ];
    var ALL_SRC = RULES.map(function (r) { return r.src; }).join('|');

    // 常见码点的人类可读缩写
    var LABELS = {
        0x200B: 'ZWSP', 0x200C: 'ZWNJ', 0x200D: 'ZWJ', 0x200E: 'LRM', 0x200F: 'RLM',
        0xFEFF: 'BOM', 0x00A0: 'NBSP', 0x00AD: 'SHY',
        0x202A: 'LRE', 0x202B: 'RLE', 0x202C: 'PDF', 0x202D: 'LRO', 0x202E: 'RLO',
        0x2066: 'LRI', 0x2067: 'RLI', 0x2068: 'FSI', 0x2069: 'PDI', 0x2060: 'WJ'
    };
    var NAMES = {
        0x200B: '零宽空格', 0x200C: '零宽非连接符', 0x200D: '零宽连接符',
        0x200E: '左至右标记', 0x200F: '右至左标记',
        0xFEFF: 'BOM', 0x00A0: '非断空格', 0x00AD: '软连字符',
        0x202A: '左至右嵌入', 0x202B: '右至左嵌入', 0x202C: '弹出方向格式',
        0x202D: '左至右覆盖', 0x202E: '右至左覆盖',
        0x2066: '左至右隔离', 0x2067: '右至左隔离', 0x2068: '首强隔离', 0x2069: '弹出隔离'
    };

    function hex(cp) {
        var h = cp.toString(16).toUpperCase();
        return 'U+' + ('0000' + h).slice(-Math.max(4, h.length));
    }
    function labelOf(ch) {
        var cp = ch.codePointAt(0);
        if (LABELS[cp]) return LABELS[cp];
        if (cp >= 0xFE00 && cp <= 0xFE0F) return 'VS' + (cp - 0xFE00);
        if (cp >= 0xE0000 && cp <= 0xE0FFF) {
            var base = cp - 0xE0000;
            if (base >= 0x20 && base < 0x7F) return 'TAG(' + String.fromCharCode(base) + ')';
            return 'TAG';
        }
        return hex(cp);
    }
    function nameOf(ch) {
        var cp = ch.codePointAt(0);
        if (NAMES[cp]) return NAMES[cp];
        if (cp >= 0xFE00 && cp <= 0xFE0F) return '变体选择符';
        if (cp >= 0xE0000 && cp <= 0xE0FFF) return '标签字符';
        return '不可见字符';
    }

    function ruleOf(ch) {
        for (var i = 0; i < RULES.length; i++) {
            if (new RegExp('^(?:' + RULES[i].src + ')$', 'u').test(ch)) return RULES[i];
        }
        return null;
    }

    function scan(text) {
        var counts = {}, total = 0, i;
        for (i = 0; i < RULES.length; i++) counts[RULES[i].key] = 0;
        var re = new RegExp(ALL_SRC, 'gu'), m;
        while ((m = re.exec(text)) !== null) {
            var rule = ruleOf(m[0]);
            if (rule) { counts[rule.key]++; total++; }
            // 防止零宽匹配死循环（理论上不会发生）
            if (m[0] === '') re.lastIndex++;
        }
        return { counts: counts, total: total };
    }

    function cleanAll(text) {
        return text.replace(new RegExp(ALL_SRC, 'gu'), '');
    }
    function cleanOne(text, key) {
        var r = null;
        for (var i = 0; i < RULES.length; i++) if (RULES[i].key === key) r = RULES[i];
        if (!r) return text;
        return text.replace(new RegExp(r.src, 'gu'), '');
    }

    function esc(s) {
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
                .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function chipHtml(ch) {
        var cp = ch.codePointAt(0), rule = ruleOf(ch);
        var cls = rule ? rule.key : 'other';
        return '<span class="tlc-chip tlc-chip-' + cls + '" title="' + hex(cp) + ' ' +
               esc(nameOf(ch)) + '">' + esc(labelOf(ch)) + '</span>';
    }

    function buildPreview(text) {
        var parts = [], last = 0, re = new RegExp(ALL_SRC, 'gu'), m;
        while ((m = re.exec(text)) !== null) {
            parts.push(esc(text.slice(last, m.index)));
            parts.push(chipHtml(m[0]));
            last = m.index + m[0].length;
        }
        parts.push(esc(text.slice(last)));
        return parts.join('').replace(/\n/g, '<br>');
    }

    // ---- DOM ----
    var $ = function (id) { return document.getElementById(id); };
    var input = $('tlc-input'), countEl = $('tlc-count'),
        scanBtn = $('tlc-scan'), sampleBtn = $('tlc-sample'), clearBtn = $('tlc-clear'),
        resultBox = $('tlc-result'), summaryEl = $('tlc-summary'),
        catList = $('tlc-cats'), previewEl = $('tlc-preview'),
        cleanBtn = $('tlc-clean'), copyBtn = $('tlc-copy'), copyTip = $('tlc-copy-tip'),
        outWrap = $('tlc-out-wrap'), output = $('tlc-output'),
        statOrig = $('tlc-stat-orig'), statRemoved = $('tlc-stat-removed'), statClean = $('tlc-stat-clean'),
        resetBtn = $('tlc-reset');

    var lastCleaned = '';

    function refreshCount() {
        countEl.textContent = input.value.length;
    }

    function render() {
        var text = input.value;
        refreshCount();
        if (!text) {
            resultBox.style.display = 'none';
            outWrap.style.display = 'none';
            lastCleaned = '';
            return;
        }
        var res = scan(text);
        resultBox.style.display = 'block';

        if (res.total === 0) {
            summaryEl.innerHTML = '<span class="tlc-ok-icon">✓</span> 未发现隐藏字符，文本干净，可直接使用。';
            summaryEl.className = 'tlc-summary tlc-summary-ok';
            catList.innerHTML = '';
            previewEl.innerHTML = esc(text).replace(/\n/g, '<br>');
            cleanBtn.disabled = true;
        } else {
            summaryEl.innerHTML = '共发现 <b>' + res.total + '</b> 个隐藏字符（' +
                RULES.filter(function (r) { return res.counts[r.key] > 0; }).length + ' 类）';
            summaryEl.className = 'tlc-summary tlc-summary-warn';
            catList.innerHTML = RULES.filter(function (r) { return res.counts[r.key] > 0; }).map(function (r) {
                return '<div class="tlc-cat">' +
                    '<span class="tlc-dot tlc-chip-' + r.key + '"></span>' +
                    '<div class="tlc-cat-info"><b>' + esc(r.name) + '</b>' +
                    '<span class="tlc-range">' + esc(r.range) + '</span>' +
                    '<span class="tlc-desc">' + esc(r.desc) + '</span></div>' +
                    '<span class="tlc-num">×' + res.counts[r.key] + '</span>' +
                    '<button class="btn btn-secondary btn-sm" data-clean-one="' + r.key + '">仅清除此类</button>' +
                    '</div>';
            }).join('');
            previewEl.innerHTML = buildPreview(text);
            cleanBtn.disabled = false;
        }
        // 输入变化后，旧的清理结果失效
        outWrap.style.display = 'none';
        lastCleaned = '';
    }

    var timer = null;
    function debounceRender() {
        clearTimeout(timer);
        timer = setTimeout(render, 250);
    }

    function doClean(onlyKey) {
        var text = input.value;
        var cleaned = onlyKey ? cleanOne(text, onlyKey) : cleanAll(text);
        var removed = text.length - cleaned.length;
        lastCleaned = cleaned;
        output.value = cleaned;
        statOrig.textContent = text.length;
        statRemoved.textContent = removed;
        statClean.textContent = cleaned.length;
        outWrap.style.display = 'block';
        copyTip.style.display = 'none';
        outWrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function copyText(t, done) {
        function fallback() {
            var ta = document.createElement('textarea');
            ta.value = t;
            ta.setAttribute('readonly', '');
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            var ok = false;
            try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
            document.body.removeChild(ta);
            done(ok);
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(t).then(function () { done(true); }, function () { fallback(); });
        } else {
            fallback();
        }
    }

    var SAMPLE = '这是AI生成的\u200B一段\u200B示\u200B例文本，里面藏着\u00A0非断\u00A0空格\u00A0、' +
        '软\u00AD连\u00AD字\u00AD符\u200B和\uFE0F变体\uFE0F选择符\u200C，\u200D以及\uFEFFBOM' +
        '\u202A方向\u202C控制符。粘贴进来，看看能扫出多少个看不见的字符。';

    input.addEventListener('input', debounceRender);
    scanBtn.addEventListener('click', render);
    sampleBtn.addEventListener('click', function () { input.value = SAMPLE; render(); });
    clearBtn.addEventListener('click', function () { input.value = ''; render(); input.focus(); });
    cleanBtn.addEventListener('click', function () { doClean(null); });
    resetBtn.addEventListener('click', function () {
        input.value = lastCleaned || input.value;
        render();
        input.focus();
    });

    catList.addEventListener('click', function (e) {
        var b = e.target.closest('[data-clean-one]');
        if (b) doClean(b.getAttribute('data-clean-one'));
    });

    copyBtn.addEventListener('click', function () {
        var t = lastCleaned || input.value;
        if (!t) return;
        copyText(t, function (ok) {
            copyTip.style.display = 'block';
            copyTip.textContent = ok ? '✓ 已复制到剪贴板' : '复制失败，请手动全选复制';
            copyTip.className = ok ? 'tlc-copy-tip tlc-copy-ok' : 'tlc-copy-tip tlc-copy-fail';
        });
    });

    refreshCount();
})();
