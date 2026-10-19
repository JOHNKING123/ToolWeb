/* 批量重命名助手 - 纯前端规则引擎 + 三平台脚本生成器
 * 数据只在浏览器里处理：零第三方依赖、无任何后端调用、无网络请求、不读取文件内容（拖拽仅取 file.name）。
 * 浏览器内运行：文件尾部把 init 挂到 DOMContentLoaded；
 * Node 自测：module.exports 暴露纯函数（规则引擎 / 冲突检测 / 三平台转义与脚本生成）。
 */
(function () {
'use strict';

/* ================= 纯函数区（与 DOM 无关，可在 Node 下自测） ================= */

/* 文件名拆分为 主干 + 扩展名（含点）；无扩展名或以点开头时 ext 为空 */
function splitExt(name) {
    var i = name.lastIndexOf('.');
    if (i <= 0 || i === name.length - 1) return { stem: name, ext: '' };
    return { stem: name.slice(0, i), ext: name.slice(i) };
}

/* 日期格式化：支持 YYYY MM DD HH mm ss 占位 */
function formatDate(d, fmt) {
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return fmt.replace(/YYYY/g, d.getFullYear())
              .replace(/MM/g, p(d.getMonth() + 1))
              .replace(/DD/g, p(d.getDate()))
              .replace(/HH/g, p(d.getHours()))
              .replace(/mm/g, p(d.getMinutes()))
              .replace(/ss/g, p(d.getSeconds()));
}

/* {date} → 当天 YYYYMMDD；{n} → 1 起序号（3 位补零） */
function renderPlaceholders(tpl, idx, today) {
    var n = String(idx + 1);
    while (n.length < 3) n = '0' + n;
    return String(tpl).replace(/\{date\}/g, formatDate(today, 'YYYYMMDD'))
                      .replace(/\{n\}/g, n);
}

function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* 对单个文件名应用单条规则；非法正则时抛出中文错误 */
function applyRule(name, idx, rule, today) {
    var t = rule.type, s = name;
    if (t === 'findreplace') {
        var find = rule.find || '';
        if (find === '') return s;
        if (rule.regex) {
            var re;
            try { re = new RegExp(find, 'g'); }
            catch (e) { throw new Error('规则「查找替换」正则表达式无效：' + find + '（' + e.message + '）'); }
            s = s.replace(re, rule.replace == null ? '' : rule.replace);
        } else {
            s = s.split(find).join(rule.replace == null ? '' : rule.replace);
        }
        return s;
    }
    if (t === 'prefix') {
        return renderPlaceholders(rule.value || '', idx, today) + s;
    }
    if (t === 'suffix') {
        var ins = renderPlaceholders(rule.value || '', idx, today);
        var parts = splitExt(s);
        return parts.stem + ins + parts.ext;
    }
    if (t === 'number') {
        var num = (rule.start | 0) + idx * (rule.step == null ? 1 : rule.step);
        var numStr = String(num);
        var digits = rule.digits | 0;
        while (numStr.length < digits) numStr = '0' + numStr;
        var sep = rule.sep == null ? '' : rule.sep;
        if (rule.position === 'suffix') {
            var sp = splitExt(s);
            return sp.stem + sep + numStr + sp.ext;
        }
        return numStr + sep + s;
    }
    if (t === 'date') {
        var d = today;
        if (rule.when === 'fixed' && rule.fixedDate) {
            var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(rule.fixedDate);
            if (!m) throw new Error('规则「日期」的固定日期格式无效，应为 YYYY-MM-DD');
            d = new Date(+m[1], +m[2] - 1, +m[3]);
            if (isNaN(d.getTime())) throw new Error('规则「日期」的固定日期无效：' + rule.fixedDate);
        }
        var fmt = rule.format === 'custom' ? (rule.custom || 'YYYYMMDD')
                : (rule.format || 'YYYY-MM-DD');
        var ds = formatDate(d, fmt);
        var dsep = rule.sep == null ? '' : rule.sep;
        if (rule.position === 'suffix') {
            var dp = splitExt(s);
            return dp.stem + dsep + ds + dp.ext;
        }
        return ds + dsep + s;
    }
    if (t === 'case') {
        if (rule.mode === 'upper') return s.toUpperCase();
        if (rule.mode === 'lower') return s.toLowerCase();
        if (rule.mode === 'capitalize') return s.charAt(0).toUpperCase() + s.slice(1);
        return s;
    }
    if (t === 'trim') {
        var n = Math.max(0, rule.n | 0);
        if (rule.mode === 'head') return s.slice(n);
        if (rule.mode === 'tail') return s.slice(0, Math.max(0, s.length - n));
        if (rule.mode === 'spaces') return s.replace(/\s/g, '');
        return s;
    }
    return s;
}

/* 对整个文件名列表按序应用全部规则，返回新名数组 */
function applyAllRules(names, rules, today) {
    today = today || new Date();
    return names.map(function (name, i) {
        var s = name;
        for (var k = 0; k < rules.length; k++) s = applyRule(s, i, rules[k], today);
        return s;
    });
}

/* 冲突检测：返回 { indexSet, groups }，indexSet 为涉冲突下标集合 */
function detectConflicts(newNames) {
    var seen = {}, indexSet = {}, groups = {};
    newNames.forEach(function (nm, i) {
        if (seen[nm] == null) { seen[nm] = i; }
        else {
            indexSet[seen[nm]] = true;
            indexSet[i] = true;
            (groups[nm] = groups[nm] || []).push(i);
        }
    });
    return { indexSet: indexSet, groupCount: Object.keys(groups).length };
}

/* 新旧名差异高亮：返回 {oldHtml, newHtml}（公共前后缀不动，中间差异 mark） */
function diffHighlight(oldStr, newStr) {
    if (oldStr === newStr) return { oldHtml: escapeHtml(oldStr), newHtml: escapeHtml(newStr) };
    var a = oldStr, b = newStr, i = 0, j = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i++;
    while (j < a.length - i && j < b.length - i && a[a.length - 1 - j] === b[b.length - 1 - j]) j++;
    function mark(s) {
        return escapeHtml(s.slice(0, i)) +
               '<mark class="brh-chg">' + escapeHtml(s.slice(i, s.length - j)) + '</mark>' +
               escapeHtml(s.slice(s.length - j));
    }
    return { oldHtml: mark(a), newHtml: mark(b) };
}

/* ---------- 三平台转义 ---------- */
function escBat(s)  { return '"' + String(s).replace(/"/g, '""') + '"'; }        /* cmd: 引号加倍 */
function escPs(s)   { return "'" + String(s).replace(/'/g, "''") + "'"; }        /* PowerShell 单引号加倍 */
function escSh(s)   { return "'" + String(s).replace(/'/g, "'\\''") + "'"; }      /* POSIX: ' → '\'' */

function scriptPairs(oldNames, newNames, conflictSet) {
    var pairs = [];
    oldNames.forEach(function (o, i) {
        var n = newNames[i];
        if (n !== o && !conflictSet[i]) pairs.push([o, n]);
    });
    return pairs;
}

function genBat(oldNames, newNames, conflictSet) {
    var pairs = scriptPairs(oldNames, newNames, conflictSet);
    var L = ['@echo off', 'chcp 65001 >nul',
        ':: ============================================================',
        ':: 批量重命名脚本（由「批量重命名助手」在线工具生成，纯本地运行）',
        ':: 共 ' + pairs.length + ' 个文件将被改名（重名冲突文件已自动排除，请先在工具中消除冲突）',
        ':: 用法：把本 .bat 文件放到要改名的文件所在文件夹中，双击运行即可',
        ':: 注意：ren 命令的新文件名不能含路径；文件名中的英文双引号已转义',
        ':: ============================================================', ''];
    pairs.forEach(function (p) { L.push('ren ' + escBat(p[0]) + ' ' + escBat(p[1])); });
    L.push('', 'echo.', 'echo 已完成：共重命名 ' + pairs.length + ' 个文件。', 'pause');
    return L.join('\r\n');
}

function genPs(oldNames, newNames, conflictSet) {
    var pairs = scriptPairs(oldNames, newNames, conflictSet);
    var L = ['# ============================================================',
        '# 批量重命名脚本（由「批量重命名助手」在线工具生成，纯本地运行）',
        '# 共 ' + pairs.length + ' 个文件将被改名（重名冲突文件已自动排除，请先在工具中消除冲突）',
        '# 用法：右键本文件 →「使用 PowerShell 运行」，或在 PowerShell 中执行本文件',
        '# 注意：使用 -LiteralPath，文件名中的方括号/空格/引号均已安全转义',
        '# ============================================================', ''];
    pairs.forEach(function (p) { L.push('Rename-Item -LiteralPath ' + escPs(p[0]) + ' -NewName ' + escPs(p[1])); });
    L.push('', 'Write-Host "已完成：共重命名 ' + pairs.length + ' 个文件。"');
    return L.join('\r\n');
}

function genSh(oldNames, newNames, conflictSet) {
    var pairs = scriptPairs(oldNames, newNames, conflictSet);
    var L = ['#!/bin/bash',
        '# ============================================================',
        '# 批量重命名脚本（由「批量重命名助手」在线工具生成，纯本地运行）',
        '# 共 ' + pairs.length + ' 个文件将被改名（重名冲突文件已自动排除，请先在工具中消除冲突）',
        '# 用法：在文件所在目录执行：chmod +x rename.sh && ./rename.sh',
        '# ============================================================',
        'set -e', ''];
    pairs.forEach(function (p) { L.push('mv -- ' + escSh(p[0]) + ' ' + escSh(p[1])); });
    L.push('', 'echo "已完成：共重命名 ' + pairs.length + ' 个文件。"');
    return L.join('\n');
}

/* ================= 浏览器 UI ================= */

var RULE_TYPES = {
    findreplace: { title: '🔍 查找替换', desc: '普通文本或正则替换' },
    prefix:      { title: '⏮ 加前缀',  desc: '文件名最前面插入（支持 {date} / {n}）' },
    suffix:      { title: '⏭ 加后缀',  desc: '扩展名前面插入（支持 {date} / {n}）' },
    number:      { title: '🔢 编号',    desc: '序号前缀/后缀，补零对齐' },
    date:        { title: '📅 日期',    desc: '当天或固定日期，多格式可选' },
    'case':      { title: '🔠 大小写',  desc: '全大写 / 全小写 / 首字母大写' },
    trim:        { title: '✂ 删字符',   desc: '删首 N 个 / 尾 N 个 / 所有空格' }
};

var state = { names: [], rules: [], dragIdx: -1 };

function el(id) { return document.getElementById(id); }

function defaultRule(type) {
    var r = { type: type, id: 'r' + Date.now() + Math.floor(Math.random() * 1e6) };
    if (type === 'findreplace') { r.find = ''; r.replace = ''; r.regex = false; }
    if (type === 'prefix' || type === 'suffix') r.value = '';
    if (type === 'number') { r.start = 1; r.step = 1; r.digits = 3; r.position = 'suffix'; r.sep = '_'; }
    if (type === 'date') { r.format = 'YYYY-MM-DD'; r.custom = 'YYYYMMDD'; r.when = 'today'; r.fixedDate = ''; r.position = 'prefix'; r.sep = '_'; }
    if (type === 'case') r.mode = 'lower';
    if (type === 'trim') { r.mode = 'spaces'; r.n = 1; }
    return r;
}

/* ---------- 文件名载入 ---------- */
function parseTextarea() {
    var lines = el('brh-input').value.split(/\r?\n/);
    var out = [];
    lines.forEach(function (ln) {
        var t = ln.trim();
        if (t !== '' && out.indexOf(t) === -1) out.push(t);
    });
    return out;
}

function refreshNamesFromInput() {
    state.names = parseTextarea();
    renderAll();
}

function sampleNames() {
    return ['旅行照片 001.jpg', '旅行照片 002.jpg', 'IMG_20250101_120000.png',
            'IMG_20250101_120001.png', '下载 (1).pdf', '下载 (2).pdf',
            '未命名文档.txt', '未命名文档.txt', 'screenshot.PNG', '照片备份.jpg'];
}

function loadSample() {
    el('brh-input').value = sampleNames().join('\n');
    state.rules = [
        Object.assign(defaultRule('findreplace'), { find: 'IMG_', replace: '照片_' }),
        Object.assign(defaultRule('prefix'), { value: '2025旅行-{date}_' }),
        Object.assign(defaultRule('number'), { start: 1, step: 1, digits: 2, position: 'suffix', sep: '-' })
    ];
    refreshNamesFromInput();
    renderRules();
    flashTip('已载入 10 个示例文件名（含 1 组重名冲突）和 3 条示例规则，可直接体验。');
}

/* ---------- 规则卡片渲染 ---------- */
function ruleCardHTML(rule, idx) {
    var t = rule.type, inner = '';
    function numField(key, label, min, max, step) {
        return '<label class="brh-f">' + label + '<input type="number" data-k="' + key + '" value="' + rule[key] + '"' +
               (min != null ? ' min="' + min + '"' : '') + (max != null ? ' max="' + max + '"' : '') +
               (step != null ? ' step="' + step + '"' : '') + '></label>';
    }
    function textField(key, label, ph, width) {
        return '<label class="brh-f">' + label + '<input type="text" data-k="' + key + '" value="' + escapeHtml(rule[key] || '') +
               '" placeholder="' + escapeHtml(ph || '') + '"' + (width ? ' style="width:' + width + '"' : '') + '></label>';
    }
    function selField(key, label, opts) {
        var h = '<label class="brh-f">' + label + '<select data-k="' + key + '">';
        opts.forEach(function (o) {
            h += '<option value="' + o[0] + '"' + (rule[key] === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
        });
        return h + '</select></label>';
    }
    if (t === 'findreplace') {
        inner = textField('find', '查找', '要替换的文本或正则', '11rem') +
                textField('replace', '替换为', '留空=删除', '8rem') +
                '<label class="brh-f brh-chk"><input type="checkbox" data-k="regex"' + (rule.regex ? ' checked' : '') + '> 正则模式</label>' +
                '<span class="brh-hint">正则用 JS 语法；替换支持 $1 $& 等引用</span>';
    } else if (t === 'prefix' || t === 'suffix') {
        inner = textField('value', t === 'prefix' ? '前缀内容' : '后缀内容', '如 项目A- / {date} / {n}', '14rem') +
                '<span class="brh-hint">{date}=当天日期(YYYYMMDD)，{n}=序号(001起)；后缀插在扩展名前面</span>';
    } else if (t === 'number') {
        inner = numField('start', '起始号', 0) + numField('step', '步长', 1) + numField('digits', '位数(补零)', 1, 10) +
                selField('position', '位置', [['prefix', '前缀'], ['suffix', '后缀']]) +
                textField('sep', '分隔符', '_', '3rem');
    } else if (t === 'date') {
        inner = selField('format', '格式', [['YYYY-MM-DD', 'YYYY-MM-DD'], ['YYYYMMDD', 'YYYYMMDD'],
                        ['YYYYMMDD_HHmmss', 'YYYYMMDD_HHmmss'], ['custom', '自定义']]) +
                (rule.format === 'custom' ? textField('custom', '自定义格式', 'YYYY/MM/DD…', '9rem') : '') +
                selField('when', '日期', [['today', '当天日期'], ['fixed', '固定日期']]) +
                (rule.when === 'fixed' ? textField('fixedDate', '固定日期', '2025-01-01', '7rem') : '') +
                selField('position', '位置', [['prefix', '前缀'], ['suffix', '后缀']]) +
                textField('sep', '分隔符', '_', '3rem');
    } else if (t === 'case') {
        inner = selField('mode', '转换', [['upper', '全大写'], ['lower', '全小写'], ['capitalize', '首字母大写']]);
    } else if (t === 'trim') {
        inner = selField('mode', '删除', [['head', '首 N 个字符'], ['tail', '尾 N 个字符'], ['spaces', '所有空格']]) +
                (rule.mode === 'spaces' ? '' : numField('n', 'N', 1));
    }
    return '<div class="brh-rule' + (state.dragIdx === idx ? ' brh-dragging' : '') + '" draggable="true" data-idx="' + idx + '">' +
        '<div class="brh-rule-head"><span class="brh-grip" title="拖拽调整顺序">⠿</span>' +
        '<b>' + (idx + 1) + '. ' + RULE_TYPES[t].title + '</b>' +
        '<span class="brh-rule-desc">' + RULE_TYPES[t].desc + '</span>' +
        '<span class="brh-rule-ops">' +
        '<button type="button" data-op="up" title="上移">▲</button>' +
        '<button type="button" data-op="down" title="下移">▼</button>' +
        '<button type="button" data-op="del" title="删除">✕</button>' +
        '</span></div>' +
        '<div class="brh-rule-body">' + inner + '</div></div>';
}

function renderRules() {
    var wrap = el('brh-rules');
    if (state.rules.length === 0) {
        wrap.innerHTML = '<div class="brh-empty">还没有规则：点击上方按钮添加（可多条组合，按从上到下顺序依次应用）。</div>';
    } else {
        wrap.innerHTML = state.rules.map(ruleCardHTML).join('');
    }
    bindRuleEvents();
}

function bindRuleEvents() {
    var cards = el('brh-rules').querySelectorAll('.brh-rule');
    cards.forEach(function (card) {
        var idx = +card.getAttribute('data-idx');
        function onField(e) {
            var inp = e.target;
            var k = inp.getAttribute('data-k'), v;
            if (inp.type === 'checkbox') v = inp.checked;
            else if (inp.type === 'number') v = inp.value === '' ? 0 : +inp.value;
            else v = inp.value;
            state.rules[idx][k] = v;
            if (k === 'format' || k === 'when' || k === 'mode') { renderRules(); }
            renderPreview();
        }
        card.querySelectorAll('[data-k]').forEach(function (inp) {
            inp.addEventListener('input', onField);
            inp.addEventListener('change', onField);
        });
        card.querySelectorAll('[data-op]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var op = btn.getAttribute('data-op');
                if (op === 'del') state.rules.splice(idx, 1);
                else if (op === 'up' && idx > 0) {
                    var t = state.rules[idx - 1]; state.rules[idx - 1] = state.rules[idx]; state.rules[idx] = t;
                } else if (op === 'down' && idx < state.rules.length - 1) {
                    var t2 = state.rules[idx + 1]; state.rules[idx + 1] = state.rules[idx]; state.rules[idx] = t2;
                }
                renderRules(); renderPreview();
            });
        });
        card.addEventListener('dragstart', function (e) {
            state.dragIdx = idx;
            e.dataTransfer.effectAllowed = 'move';
            try { e.dataTransfer.setData('text/plain', String(idx)); } catch (err) {}
        });
        card.addEventListener('dragend', function () { state.dragIdx = -1; renderRules(); });
        card.addEventListener('dragover', function (e) {
            e.preventDefault();
            if (state.dragIdx !== -1 && state.dragIdx !== idx) card.classList.add('brh-droptarget');
        });
        card.addEventListener('dragleave', function () { card.classList.remove('brh-droptarget'); });
        card.addEventListener('drop', function (e) {
            e.preventDefault();
            var from = state.dragIdx;
            card.classList.remove('brh-droptarget');
            if (from !== -1 && from !== idx) {
                var moved = state.rules.splice(from, 1)[0];
                state.rules.splice(idx, 0, moved);
            }
            state.dragIdx = -1;
            renderRules(); renderPreview();
        });
    });
}

/* ---------- 预览渲染 ---------- */
function renderPreview() {
    var names = state.names, rules = state.rules;
    var newNames, errMsg = '';
    try { newNames = applyAllRules(names, rules); }
    catch (e) { errMsg = e.message; newNames = names.slice(); }
    var cf = detectConflicts(newNames);
    var changed = 0, conflictRows = 0;
    var rows = names.map(function (o, i) {
        var n = newNames[i], isCf = !!cf.indexSet[i], isCh = (n !== o);
        if (isCh) changed++;
        if (isCf) conflictRows++;
        var dh = diffHighlight(o, n);
        var cls = isCf ? ' class="brh-conflict"' : (isCh ? ' class="brh-changed"' : '');
        var status = isCf ? '<span class="brh-badge brh-badge-warn">⚠ 重名冲突</span>'
                   : (isCh ? '<span class="brh-badge brh-badge-ok">已改名</span>'
                   : '<span class="brh-badge brh-badge-idle">无变化</span>');
        return '<tr' + cls + '><td>' + (i + 1) + '</td><td class="brh-mono">' + dh.oldHtml + '</td>' +
               '<td class="brh-mono">' + dh.newHtml + '</td><td>' + status + '</td></tr>';
    });
    el('brh-tbody').innerHTML = rows.length ? rows.join('')
        : '<tr><td colspan="4" class="brh-empty">暂无文件：在左侧粘贴文件名、拖拽文件到虚线框，或点击「填入示例」。</td></tr>';
    var stats = '共 <b>' + names.length + '</b> 个文件，<b>' + changed + '</b> 个将被改名' +
                (conflictRows ? '，<b class="brh-red">' + conflictRows + '</b> 个存在重名冲突（已自动从脚本中排除）' : '，无重名冲突');
    el('brh-stats').innerHTML = stats;
    var warn = el('brh-warn');
    if (conflictRows) {
        warn.style.display = '';
        warn.innerHTML = '⚠ <b>检测到重名冲突（共 ' + cf.groupCount + ' 组、' + conflictRows + ' 个文件）：</b>' +
            '改名后会出现同名文件，冲突行已标红且<b>不会</b>写入导出脚本。请先调整规则消除冲突（例如加一条「编号」规则让每个文件名唯一），再重新导出。';
    } else { warn.style.display = 'none'; warn.innerHTML = ''; }
    var tip = el('brh-err');
    if (errMsg) { tip.style.display = ''; tip.textContent = '⚠ ' + errMsg; }
    else { tip.style.display = 'none'; tip.textContent = ''; }
    /* 导出按钮状态 */
    var exportable = scriptPairs(names, newNames, cf.indexSet).length;
    ['brh-dl-bat', 'brh-dl-ps1', 'brh-dl-sh'].forEach(function (id) { el(id).disabled = exportable === 0; });
    el('brh-export-tip').textContent = exportable === 0
        ? (names.length === 0 ? '暂无可导出的改名任务。' : '当前没有可执行的改名（或全部因冲突被排除），请先调整规则。')
        : '将导出 ' + exportable + ' 条改名命令' + (conflictRows ? '（已排除冲突行）' : '') + '。';
    state._last = { newNames: newNames, conflictSet: cf.indexSet };
}

function renderAll() { renderPreview(); }

/* ---------- 导出下载 ---------- */
function download(filename, content, mime) {
    var blob = new Blob([content], { type: mime + ';charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
}

function flashTip(msg) {
    var t = el('brh-flash');
    t.textContent = msg;
    t.style.display = '';
    setTimeout(function () { t.style.display = 'none'; }, 6000);
}

/* ---------- 初始化 ---------- */
function init() {
    el('brh-input').addEventListener('input', refreshNamesFromInput);
    el('brh-sample').addEventListener('click', loadSample);
    el('brh-clear').addEventListener('click', function () {
        el('brh-input').value = ''; refreshNamesFromInput();
    });
    el('brh-dedupe').addEventListener('click', function () {
        el('brh-input').value = parseTextarea().join('\n');
        refreshNamesFromInput(); flashTip('已去重（保留首次出现顺序）。');
    });
    el('brh-sort').addEventListener('click', function () {
        var arr = parseTextarea();
        arr.sort(function (a, b) { return a.localeCompare(b, 'zh-CN'); });
        el('brh-input').value = arr.join('\n');
        refreshNamesFromInput(); flashTip('已按字母顺序排序。');
    });
    /* 拖拽文件：只取 file.name，不读内容 */
    var dz = el('brh-drop');
    ['dragenter', 'dragover'].forEach(function (ev) {
        dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('brh-drop-hover'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
        dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove('brh-drop-hover'); });
    });
    dz.addEventListener('drop', function (e) {
        var files = e.dataTransfer && e.dataTransfer.files;
        if (!files || files.length === 0) return;
        var cur = el('brh-input').value.split(/\r?\n/).filter(function (l) { return l.trim() !== ''; });
        for (var i = 0; i < files.length; i++) {
            if (cur.indexOf(files[i].name) === -1) cur.push(files[i].name);
        }
        el('brh-input').value = cur.join('\n');
        refreshNamesFromInput();
        flashTip('已载入 ' + files.length + ' 个文件名（仅读取文件名，未读取文件内容）。');
    });
    dz.addEventListener('click', function () { flashTip('把文件/文件夹拖到这个虚线框里即可，只取文件名，不读取内容、不上传。'); });
    /* 添加规则 */
    document.querySelectorAll('[data-addrrule]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            state.rules.push(defaultRule(btn.getAttribute('data-addrrule')));
            renderRules(); renderPreview();
        });
    });
    /* 导出 */
    el('brh-dl-bat').addEventListener('click', function () {
        var s = state._last;
        download('rename.bat', genBat(state.names, s.newNames, s.conflictSet), 'text/plain');
    });
    el('brh-dl-ps1').addEventListener('click', function () {
        var s = state._last;
        download('rename.ps1', genPs(state.names, s.newNames, s.conflictSet), 'text/plain');
    });
    el('brh-dl-sh').addEventListener('click', function () {
        var s = state._last;
        download('rename.sh', genSh(state.names, s.newNames, s.conflictSet), 'text/plain');
    });
    renderRules();
    renderPreview();
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { splitExt: splitExt, formatDate: formatDate, renderPlaceholders: renderPlaceholders,
        escapeHtml: escapeHtml, applyRule: applyRule, applyAllRules: applyAllRules,
        detectConflicts: detectConflicts, diffHighlight: diffHighlight,
        escBat: escBat, escPs: escPs, escSh: escSh,
        scriptPairs: scriptPairs, genBat: genBat, genPs: genPs, genSh: genSh };
}

})();
