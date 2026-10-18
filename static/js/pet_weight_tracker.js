/* 宠物体重记录追踪器：纯前端 localStorage 数据层 + canvas 趋势图 + 预警 + CSV 导入导出 */
(function () {
'use strict';

var LS_KEY = 'pwt_data_v1';
var KG2LB = 2.2046226218;

/* ================= 纯函数（无 DOM，可被 node 单元测试） ================= */

function addDays(dstr, n) {
    var t = Date.parse(dstr + 'T00:00:00Z');
    if (isNaN(t)) return dstr;
    var d = new Date(t + n * 86400000);
    return d.toISOString().slice(0, 10);
}

function kgToUnit(kg, unit) {
    return unit === 'lb' ? kg * KG2LB : kg;
}

function unitToKg(v, unit) {
    return unit === 'lb' ? v / KG2LB : v;
}

function fmtW(kg, unit) {
    return kgToUnit(kg, unit).toFixed(2);
}

/* 预警计算：返回 {text} 或 null；nowStr 格式 YYYY-MM-DD */
function calcAlert(entries, nowStr) {
    var es = entries.slice().sort(function (a, b) { return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0); });
    if (es.length < 2) return null;
    var cutoff = addDays(nowStr, -21);
    var recent = es.filter(function (e) { return e.date >= cutoff; });
    if (recent.length >= 2) {
        var ch = (recent[recent.length - 1].kg - recent[0].kg) / recent[0].kg;
        if (ch <= -0.10) {
            return { level: 'high', text: '它在近 3 周内体重下降了 ' + (-ch * 100).toFixed(1) + '%（达到 10% 警戒线），建议咨询兽医排查原因。' };
        }
    }
    if (es.length >= 4) {
        var l4 = es.slice(-4), dec = true, i;
        for (i = 1; i < 4; i++) { if (!(l4[i].kg < l4[i - 1].kg)) { dec = false; break; } }
        if (dec) {
            var ch2 = (l4[3].kg - l4[0].kg) / l4[0].kg;
            if (ch2 <= -0.05) {
                return { level: 'mid', text: '最近 4 次记录连续下降，累计下降 ' + (-ch2 * 100).toFixed(1) + '%，建议咨询兽医。' };
            }
        }
    }
    return null;
}

/* 简易 CSV 解析（处理引号包围字段与双引号转义） */
function parseCSV(text) {
    var rows = [], row = [], field = '', inQ = false, i, c;
    text = text.replace(/^\uFEFF/, '');
    for (i = 0; i < text.length; i++) {
        c = text[i];
        if (inQ) {
            if (c === '"') {
                if (text[i + 1] === '"') { field += '"'; i++; }
                else { inQ = false; }
            } else { field += c; }
        } else if (c === '"') { inQ = true; }
        else if (c === ',') { row.push(field); field = ''; }
        else if (c === '\r') { /* skip */ }
        else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
        else { field += c; }
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows.filter(function (r) { return !(r.length === 1 && r[0].trim() === ''); });
}

function csvCell(s) {
    s = String(s == null ? '' : s);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/* 由解析后的 CSV 行生成 {petName: {kind, entries[]}}；返回 {pets, count, errors} */
function rowsToImport(rows) {
    var pets = {}, count = 0, errors = [];
    if (!rows.length) return { pets: pets, count: 0, errors: ['CSV 为空'] };
    var head = rows[0].map(function (h) { return h.trim(); });
    var hi = head.indexOf('宠物名'), di = head.indexOf('日期'), wi = head.indexOf('体重kg'), ni = head.indexOf('备注');
    if (hi < 0 || di < 0 || wi < 0) return { pets: pets, count: 0, errors: ['表头应包含：宠物名,日期,体重kg,备注'] };
    for (var r = 1; r < rows.length; r++) {
        var row = rows[r], name = (row[hi] || '').trim(), date = (row[di] || '').trim(), w = parseFloat(row[wi]);
        if (!name) { errors.push('第 ' + (r + 1) + ' 行：宠物名为空，已跳过'); continue; }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { errors.push('第 ' + (r + 1) + ' 行：日期格式应为 YYYY-MM-DD，已跳过'); continue; }
        if (!(w > 0) || w > 500) { errors.push('第 ' + (r + 1) + ' 行：体重kg 无效，已跳过'); continue; }
        if (!pets[name]) pets[name] = { entries: [] };
        pets[name].entries.push({ date: date, kg: Math.round(w * 1000) / 1000, note: ni >= 0 ? (row[ni] || '').trim() : '' });
        count++;
    }
    return { pets: pets, count: count, errors: errors };
}

/* 示例数据：相对今天生成，保证触发预警演示 */
function buildSample(todayStr) {
    var raw = [
        [-100, 5.02, ''], [-93, 4.98, ''], [-86, 5.00, ''], [-79, 4.95, '换粮第一周'],
        [-72, 4.93, ''], [-65, 4.90, ''], [-58, 4.92, ''], [-51, 4.90, ''],
        [-44, 4.88, ''], [-37, 4.85, ''], [-30, 4.82, ''], [-23, 4.78, ''],
        [-16, 4.75, ''], [-9, 4.48, '食欲一般'], [-2, 4.25, '精神稍差']
    ];
    return {
        name: '橘子', kind: 'cat', avatar: '🐱', targetKg: 4.5,
        birthdate: addDays(todayStr, -400),
        entries: raw.map(function (r) {
            return { date: addDays(todayStr, r[0]), kg: r[1], note: r[2] };
        })
    };
}

/* node 测试导出 */
var PWT_LIB = { KG2LB: KG2LB, addDays: addDays, kgToUnit: kgToUnit, unitToKg: unitToKg, fmtW: fmtW, calcAlert: calcAlert, parseCSV: parseCSV, csvCell: csvCell, rowsToImport: rowsToImport, buildSample: buildSample };
if (typeof module !== 'undefined' && module.exports) { module.exports = PWT_LIB; return; }

/* ================= 浏览器逻辑 ================= */

function $(id) { return document.getElementById(id); }
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
}

function defaultData() { return { pets: [], activeId: null, unit: 'kg' }; }

function load() {
    try {
        var raw = localStorage.getItem(LS_KEY);
        if (!raw) return defaultData();
        var d = JSON.parse(raw);
        if (!d || !Array.isArray(d.pets)) return defaultData();
        d.pets.forEach(function (p) {
            p.entries = Array.isArray(p.entries) ? p.entries : [];
            if (!p.kind) p.kind = 'other';
            if (!p.avatar) p.avatar = '🐾';
        });
        if (d.unit !== 'lb') d.unit = 'kg';
        return d;
    } catch (e) { return defaultData(); }
}

function save() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch (e) { /* 存储空间不足等，忽略 */ }
}

var data = load();
var ui = { mode: 'direct', range: 90, editingId: null };

function activePet() {
    if (!data.pets.length) return null;
    var p = null, i;
    for (i = 0; i < data.pets.length; i++) { if (data.pets[i].id === data.activeId) { p = data.pets[i]; break; } }
    if (!p) { p = data.pets[0]; data.activeId = p.id; }
    return p;
}

function setStatus(el, msg, isErr) {
    el.textContent = msg;
    el.classList.toggle('err', !!isErr);
}

function kindLabel(k) { return k === 'cat' ? '猫' : (k === 'dog' ? '狗' : '其他'); }
function kindAvatar(k) { return k === 'cat' ? '🐱' : (k === 'dog' ? '🐶' : '🐾'); }

/* ---------- 宠物档案渲染 ---------- */
function renderPets() {
    var list = $('pwt-pet-list');
    list.innerHTML = '';
    data.pets.forEach(function (p) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'pwt-chip' + (p.id === data.activeId ? ' on' : '');
        b.innerHTML = '<span class="pwt-ava">' + esc(p.avatar) + '</span><span>' + esc(p.name) + '</span>';
        b.title = '点击切换到「' + p.name + '」；双击编辑档案';
        b.addEventListener('click', function () {
            if (data.activeId === p.id) { openPetForm(p.id); return; }
            data.activeId = p.id; save(); renderAll();
        });
        b.addEventListener('dblclick', function () { openPetForm(p.id); });
        list.appendChild(b);
    });
    var has = data.pets.length > 0;
    $('pwt-no-pet').style.display = has ? 'none' : '';
    ['pwt-entry-card', 'pwt-chart-card', 'pwt-list-card'].forEach(function (id) {
        $(id).style.display = has ? '' : 'none';
    });
    if (has) {
        var p = activePet();
        $('pwt-entry-pet').textContent = '（当前：' + p.avatar + ' ' + p.name + '）';
    }
}

function openPetForm(id) {
    ui.editingId = id || null;
    var p = id ? data.pets.filter(function (x) { return x.id === id; })[0] : null;
    $('pwt-name').value = p ? p.name : '';
    $('pwt-avatar').value = p ? p.avatar : '';
    $('pwt-target').value = (p && p.targetKg) ? p.targetKg : '';
    $('pwt-birth').value = p ? (p.birthdate || '') : '';
    var kind = p ? p.kind : 'cat';
    Array.prototype.forEach.call($('pwt-kind').querySelectorAll('label'), function (l) {
        var on = l.getAttribute('data-kind') === kind;
        l.classList.toggle('on', on);
        l.querySelector('input').checked = on;
    });
    Array.prototype.forEach.call($('pwt-emoji-pick').querySelectorAll('button'), function (b) {
        b.classList.toggle('on', b.textContent === (p ? p.avatar : ''));
    });
    $('pwt-pet-del').style.display = p ? '' : 'none';
    $('pwt-pet-form').style.display = '';
    $('pwt-pet-addwrap').style.display = 'none';
    $('pwt-name').focus();
}

function closePetForm() {
    ui.editingId = null;
    $('pwt-pet-form').style.display = 'none';
    $('pwt-pet-addwrap').style.display = '';
}

function savePet() {
    var name = $('pwt-name').value.trim();
    if (!name) { $('pwt-name').focus(); return; }
    var kind = 'cat';
    Array.prototype.forEach.call($('pwt-kind').querySelectorAll('input'), function (r) { if (r.checked) kind = r.value; });
    var avatar = $('pwt-avatar').value.trim() || kindAvatar(kind);
    var targetRaw = $('pwt-target').value.trim(), targetKg = null;
    if (targetRaw !== '') {
        targetKg = parseFloat(targetRaw);
        if (!(targetKg > 0) || targetKg > 500) { setStatus($('pwt-entry-status'), '目标体重请输入 0~500 之间的数字（kg）', true); return; }
        targetKg = Math.round(targetKg * 1000) / 1000;
    }
    var birth = $('pwt-birth').value || '';
    if (ui.editingId) {
        var p = data.pets.filter(function (x) { return x.id === ui.editingId; })[0];
        if (p) { p.name = name; p.kind = kind; p.avatar = avatar; p.targetKg = targetKg; p.birthdate = birth; }
    } else {
        var np = { id: uid(), name: name, kind: kind, avatar: avatar, targetKg: targetKg, birthdate: birth, entries: [] };
        data.pets.push(np);
        data.activeId = np.id;
    }
    save(); closePetForm(); renderAll();
}

function delPet() {
    var p = data.pets.filter(function (x) { return x.id === ui.editingId; })[0];
    if (!p) return;
    if (!confirm('确定删除宠物「' + p.name + '」吗？它的全部体重记录也会一起删除，不可恢复。')) return;
    data.pets = data.pets.filter(function (x) { return x.id !== p.id; });
    if (data.activeId === p.id) data.activeId = data.pets.length ? data.pets[0].id : null;
    save(); closePetForm(); renderAll();
}

/* ---------- 体重录入 ---------- */
function updateUnitLabels() {
    Array.prototype.forEach.call(document.querySelectorAll('.pwt-u'), function (s) { s.textContent = data.unit; });
    Array.prototype.forEach.call($('pwt-unit').querySelectorAll('button'), function (b) {
        b.classList.toggle('on', b.getAttribute('data-unit') === data.unit);
    });
}

function switchUnit(u) {
    if (data.unit === u) return;
    var from = data.unit;
    ['pwt-weight', 'pwt-hold-total', 'pwt-hold-self'].forEach(function (id) {
        var el = $(id), v = parseFloat(el.value);
        if (!isNaN(v)) el.value = kgToUnit(unitToKg(v, from), u).toFixed(2).replace(/\.?0+$/, '');
    });
    data.unit = u; save(); updateUnitLabels(); updateHoldCalc(); renderTable(); renderChart(); renderStats();
}

function updateHoldCalc() {
    var t = parseFloat($('pwt-hold-total').value), s = parseFloat($('pwt-hold-self').value);
    var box = $('pwt-hold-result');
    if (isNaN(t) || isNaN(s)) { box.innerHTML = '宠物体重 = 抱宠总重 − 抱宠者体重，请先填写上方两项'; return null; }
    var petKg = unitToKg(t, data.unit) - unitToKg(s, data.unit);
    if (petKg <= 0) { box.innerHTML = '抱宠总重必须大于抱宠者体重，请检查输入'; return null; }
    box.innerHTML = '宠物体重 = <b>' + fmtW(petKg, data.unit) + ' ' + data.unit + '</b>';
    return petKg;
}

function saveEntry() {
    var pet = activePet();
    if (!pet) return;
    var date = $('pwt-date').value || todayStr();
    if (date > todayStr()) { setStatus($('pwt-entry-status'), '日期不能晚于今天', true); return; }
    var kg = null, note = $('pwt-note').value.trim();
    if (ui.mode === 'hold') {
        kg = updateHoldCalc();
        if (kg == null) { setStatus($('pwt-entry-status'), '请填写有效的抱宠总重与抱宠者体重', true); return; }
    } else {
        var v = parseFloat($('pwt-weight').value);
        if (isNaN(v) || v <= 0) { setStatus($('pwt-entry-status'), '请输入有效的体重', true); return; }
        kg = unitToKg(v, data.unit);
    }
    if (!(kg > 0) || kg > 500) { setStatus($('pwt-entry-status'), '体重超出合理范围（0~500kg）', true); return; }
    kg = Math.round(kg * 1000) / 1000;
    var ex = null;
    pet.entries.forEach(function (e) { if (e.date === date) ex = e; });
    if (ex) { ex.kg = kg; ex.note = note; setStatus($('pwt-entry-status'), '已更新 ' + date + ' 的记录：' + fmtW(kg, data.unit) + ' ' + data.unit); }
    else { pet.entries.push({ date: date, kg: kg, note: note }); setStatus($('pwt-entry-status'), '已保存：' + date + ' ' + fmtW(kg, data.unit) + ' ' + data.unit); }
    $('pwt-weight').value = ''; $('pwt-hold-total').value = ''; $('pwt-hold-self').value = ''; $('pwt-note').value = '';
    updateHoldCalc(); save(); renderTable(); renderChart(); renderStats(); renderAlert();
}

/* ---------- 记录列表 ---------- */
function renderTable() {
    var pet = activePet();
    var tb = $('pwt-tbody');
    tb.innerHTML = '';
    if (!pet) return;
    var es = pet.entries.slice().sort(function (a, b) { return a.date < b.date ? 1 : (a.date > b.date ? -1 : 0); });
    $('pwt-tbody-empty').style.display = es.length ? 'none' : '';
    es.forEach(function (e, i) {
        var tr = document.createElement('tr');
        var delta = '—', dcls = '';
        if (i < es.length - 1) {
            var d = e.kg - es[i + 1].kg, du = kgToUnit(d, data.unit);
            delta = (du > 0 ? '+' : '') + du.toFixed(2);
            dcls = du > 0 ? 'delta-up' : (du < 0 ? 'delta-down' : '');
        }
        tr.innerHTML = '<td class="num">' + esc(e.date.slice(5).replace('-', '/')) + '<br><span style="color:#9ca3af;font-size:.78rem;">' + esc(e.date.slice(0, 4)) + '</span></td>' +
            '<td class="num"><b>' + fmtW(e.kg, data.unit) + '</b> ' + data.unit + '</td>' +
            '<td class="num ' + dcls + '">' + delta + '</td>' +
            '<td>' + esc(e.note) + '</td>' +
            '<td><button class="del" title="删除这条记录">×</button></td>';
        tr.querySelector('.del').addEventListener('click', function () {
            if (!confirm('删除 ' + e.date + ' 的体重记录？')) return;
            pet.entries = pet.entries.filter(function (x) { return x !== e; });
            save(); renderTable(); renderChart(); renderStats(); renderAlert();
        });
        tb.appendChild(tr);
    });
}

/* ---------- 趋势图 ---------- */
function renderChart() {
    var c = $('pwt-chart'), pet = activePet();
    var dpr = window.devicePixelRatio || 1;
    var w = c.clientWidth || c.parentElement.clientWidth, h = c.clientHeight || 300;
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    var ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.font = '12px system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif';

    function placeholder(msg) {
        ctx.fillStyle = '#9ca3af'; ctx.textAlign = 'center';
        ctx.fillText(msg, w / 2, h / 2 - 8);
        ctx.fillText('至少录入 2 条体重记录后显示趋势', w / 2, h / 2 + 14);
    }
    if (!pet) { placeholder('还没有宠物档案'); return; }
    var cutoff = ui.range ? addDays(todayStr(), -ui.range) : null;
    var pts = pet.entries.filter(function (e) { return !cutoff || e.date >= cutoff; })
        .sort(function (a, b) { return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0); });
    if (pts.length < 2) { placeholder(ui.range ? '该时间范围内记录不足 2 条' : '暂无体重记录'); return; }

    var padL = 48, padR = 14, padT = 16, padB = 28;
    var iw = w - padL - padR, ih = h - padT - padB;
    var t0 = Date.parse(pts[0].date + 'T00:00:00Z'), t1 = Date.parse(pts[pts.length - 1].date + 'T00:00:00Z');
    if (t1 === t0) t1 = t0 + 86400000;
    var vals = pts.map(function (p) { return p.kg; });
    if (pet.targetKg) vals.push(pet.targetKg);
    var mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals);
    var span = mx - mn; if (span <= 0) span = mx * 0.1 || 1;
    mn -= span * 0.15; mx += span * 0.15;
    function X(t) { return padL + (t - t0) / (t1 - t0) * iw; }
    function Y(kg) { return padT + ih - (kg - mn) / (mx - mn) * ih; }

    /* 网格 + Y 轴 */
    ctx.strokeStyle = '#f0f2f5'; ctx.fillStyle = '#9ca3af'; ctx.textAlign = 'right'; ctx.lineWidth = 1;
    for (var g = 0; g <= 4; g++) {
        var gv = mn + (mx - mn) * g / 4, gy = Y(gv);
        ctx.beginPath(); ctx.moveTo(padL, gy); ctx.lineTo(w - padR, gy); ctx.stroke();
        ctx.fillText(fmtW(gv, data.unit), padL - 6, gy + 4);
    }
    /* X 轴标签 */
    ctx.textAlign = 'center';
    var n = pts.length, step = Math.max(1, Math.ceil(n / 6));
    for (var xi = 0; xi < n; xi += step) {
        var xt = Date.parse(pts[xi].date + 'T00:00:00Z');
        ctx.fillText(pts[xi].date.slice(5).replace('-', '/'), X(xt), h - 8);
    }
    /* 目标参考线 */
    if (pet.targetKg) {
        ctx.strokeStyle = '#f59e0b'; ctx.setLineDash([6, 4]); ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(padL, Y(pet.targetKg)); ctx.lineTo(w - padR, Y(pet.targetKg)); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#b45309'; ctx.textAlign = 'right';
        ctx.fillText('目标 ' + fmtW(pet.targetKg, data.unit) + data.unit, w - padR - 2, Y(pet.targetKg) - 6);
    }
    /* 折线 */
    ctx.strokeStyle = '#2563eb'; ctx.lineWidth = 2; ctx.lineJoin = 'round';
    ctx.beginPath();
    pts.forEach(function (p, i) {
        var x = X(Date.parse(p.date + 'T00:00:00Z')), y = Y(p.kg);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.fillStyle = '#2563eb';
    pts.forEach(function (p) {
        var x = X(Date.parse(p.date + 'T00:00:00Z')), y = Y(p.kg);
        ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
    });
    /* 末点数值 */
    var lp = pts[pts.length - 1], lx = X(Date.parse(lp.date + 'T00:00:00Z')), ly = Y(lp.kg);
    ctx.fillStyle = '#1d4ed8'; ctx.textAlign = lx > w - 90 ? 'right' : 'left';
    ctx.fillText(fmtW(lp.kg, data.unit) + data.unit, lx + (lx > w - 90 ? -8 : 8), ly - 8);
}

function renderStats() {
    var pet = activePet(), box = $('pwt-stats');
    if (!pet || pet.entries.length < 2) { box.innerHTML = ''; return; }
    var es = pet.entries.slice().sort(function (a, b) { return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0); });
    var latest = es[0], html = '<span>最新体重 <b>' + fmtW(latest.kg, data.unit) + ' ' + data.unit + '</b>（' + esc(latest.date) + '）</span>';
    if (pet.targetKg) {
        var gap = latest.kg - pet.targetKg, gu = kgToUnit(gap, data.unit);
        html += '<span>目标 <b>' + fmtW(pet.targetKg, data.unit) + ' ' + data.unit + '</b>，' +
            (Math.abs(gu) < 0.005 ? '已达标 🎉' : '还差 <b>' + Math.abs(gu).toFixed(2) + ' ' + data.unit + '</b>') + '</span>';
    }
    var cutoff = addDays(todayStr(), -7);
    var wk = es.filter(function (e) { return e.date >= cutoff; });
    if (wk.length >= 2) {
        var ch = (wk[0].kg - wk[wk.length - 1].kg) / wk[wk.length - 1].kg * 100;
        html += '<span>近 7 天变化 <b class="' + (ch > 0 ? 'up' : 'down') + '">' + (ch > 0 ? '+' : '') + ch.toFixed(1) + '%</b></span>';
    }
    html += '<span>共 <b>' + pet.entries.length + '</b> 条记录</span>';
    box.innerHTML = html;
}

function renderAlert() {
    var pet = activePet(), box = $('pwt-alert');
    var a = pet ? calcAlert(pet.entries, todayStr()) : null;
    if (a) { $('pwt-alert-text').textContent = a.text; box.classList.add('show'); }
    else { box.classList.remove('show'); }
}

/* ---------- CSV ---------- */
function exportCSV() {
    if (!data.pets.length) { setStatus($('pwt-data-status'), '还没有数据可导出', true); return; }
    var lines = ['\uFEFF宠物名,日期,体重kg,备注'];
    data.pets.forEach(function (p) {
        p.entries.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; }).forEach(function (e) {
            lines.push([csvCell(p.name), csvCell(e.date), e.kg, csvCell(e.note)].join(','));
        });
    });
    var blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'pet-weight-' + todayStr() + '.csv';
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    setStatus($('pwt-data-status'), '已导出 ' + (lines.length - 1) + ' 条记录（UTF-8，Excel / WPS 可直接打开）', false);
}

function importCSV(file) {
    var rd = new FileReader();
    rd.onload = function () {
        var res = rowsToImport(parseCSV(String(rd.result || '')));
        if (res.errors.length && !res.count) { setStatus($('pwt-data-status'), '导入失败：' + res.errors[0], true); return; }
        Object.keys(res.pets).forEach(function (name) {
            var imp = res.pets[name];
            var p = null;
            data.pets.forEach(function (x) { if (x.name === name) p = x; });
            if (!p) { p = { id: uid(), name: name, kind: 'other', avatar: '🐾', targetKg: null, birthdate: '', entries: [] }; data.pets.push(p); }
            imp.entries.forEach(function (e) {
                var ex = null;
                p.entries.forEach(function (x) { if (x.date === e.date) ex = x; });
                if (ex) { ex.kg = e.kg; ex.note = e.note; } else p.entries.push(e);
            });
        });
        if (!activePet() && data.pets.length) data.activeId = data.pets[0].id;
        save(); renderAll();
        var msg = '导入完成：' + res.count + ' 条记录';
        if (res.errors.length) msg += '（' + res.errors.length + ' 行有问题已跳过：' + res.errors.slice(0, 2).join('；') + (res.errors.length > 2 ? '…' : '') + '）';
        setStatus($('pwt-data-status'), msg, false);
    };
    rd.onerror = function () { setStatus($('pwt-data-status'), '文件读取失败', true); };
    rd.readAsText(file, 'utf-8');
}

function fillSample() {
    var s = buildSample(todayStr());
    var name = s.name, i = 2;
    while (data.pets.some(function (p) { return p.name === name; })) { name = s.name + '(示例' + (i++) + ')'; }
    var np = { id: uid(), name: name, kind: s.kind, avatar: s.avatar, targetKg: s.targetKg, birthdate: s.birthdate, entries: s.entries };
    data.pets.push(np);
    data.activeId = np.id;
    save(); renderAll();
    setStatus($('pwt-data-status'), '已填入示例数据：' + name + '（' + s.entries.length + ' 条记录，含一段体重下降，可体验预警提示）', false);
}

/* ---------- 总渲染 ---------- */
function renderAll() {
    renderPets(); updateUnitLabels(); renderTable(); renderChart(); renderStats(); renderAlert();
}

/* ---------- 事件绑定 ---------- */
function init() {
    $('pwt-date').value = todayStr();

    $('pwt-pet-add').addEventListener('click', function () { openPetForm(null); });
    $('pwt-pet-cancel').addEventListener('click', closePetForm);
    $('pwt-pet-save').addEventListener('click', savePet);
    $('pwt-pet-del').addEventListener('click', delPet);

    Array.prototype.forEach.call($('pwt-kind').querySelectorAll('label'), function (l) {
        l.addEventListener('click', function () {
            Array.prototype.forEach.call($('pwt-kind').querySelectorAll('label'), function (x) { x.classList.remove('on'); });
            l.classList.add('on');
            if (!$('pwt-avatar').value.trim()) $('pwt-avatar').value = Array.from(l.textContent.trim())[0];
        });
    });
    Array.prototype.forEach.call($('pwt-emoji-pick').querySelectorAll('button'), function (b) {
        b.addEventListener('click', function () {
            $('pwt-avatar').value = b.textContent;
            Array.prototype.forEach.call($('pwt-emoji-pick').querySelectorAll('button'), function (x) { x.classList.remove('on'); });
            b.classList.add('on');
        });
    });

    Array.prototype.forEach.call($('pwt-mode').querySelectorAll('button'), function (b) {
        b.addEventListener('click', function () {
            ui.mode = b.getAttribute('data-mode');
            Array.prototype.forEach.call($('pwt-mode').querySelectorAll('button'), function (x) { x.classList.toggle('on', x === b); });
            $('pwt-direct-wrap').style.display = ui.mode === 'direct' ? '' : 'none';
            $('pwt-hold-wrap').style.display = ui.mode === 'hold' ? '' : 'none';
            if (ui.mode === 'hold') updateHoldCalc();
        });
    });
    Array.prototype.forEach.call($('pwt-unit').querySelectorAll('button'), function (b) {
        b.addEventListener('click', function () { switchUnit(b.getAttribute('data-unit')); });
    });
    $('pwt-hold-total').addEventListener('input', updateHoldCalc);
    $('pwt-hold-self').addEventListener('input', updateHoldCalc);
    $('pwt-entry-save').addEventListener('click', saveEntry);

    Array.prototype.forEach.call($('pwt-range').querySelectorAll('button'), function (b) {
        b.addEventListener('click', function () {
            ui.range = parseInt(b.getAttribute('data-range'), 10);
            Array.prototype.forEach.call($('pwt-range').querySelectorAll('button'), function (x) { x.classList.toggle('on', x === b); });
            renderChart();
        });
    });

    $('pwt-export').addEventListener('click', exportCSV);
    $('pwt-import').addEventListener('change', function () {
        if (this.files && this.files[0]) importCSV(this.files[0]);
        this.value = '';
    });
    $('pwt-sample').addEventListener('click', fillSample);
    $('pwt-clear').addEventListener('click', function () {
        if (!data.pets.length) { setStatus($('pwt-data-status'), '已经没有数据了', true); return; }
        if (!confirm('确定清空全部宠物档案与体重记录吗？不可恢复，建议先导出 CSV 备份。')) return;
        data = defaultData(); save(); renderAll();
        setStatus($('pwt-data-status'), '已清空全部数据', false);
    });

    window.addEventListener('resize', function () { renderChart(); });

    renderAll();
}

if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); }
else { init(); }

})();
