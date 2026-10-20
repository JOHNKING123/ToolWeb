/* 文件校验和计算器 · 主线程 UI（零依赖、零后端、零上传）
 * - 拖拽 / 选择多文件队列；每个文件独立行：进度条、状态、哈希值、复制、官方值比对
 * - 计算在 Web Worker 内进行（static/js/file_checksum_worker.js），主线程只更新 UI；
 *   取消 = worker.terminate()；队列按顺序逐个计算
 * - 算法切换会清空已有结果（不同算法摘要值不可复用）
 */
(function () {
"use strict";

if (typeof document === "undefined") return;

var WORKER_URL = "/tools/static/js/file_checksum_worker.js";

var queue = [];          /* {id, file, status, hex, error, row} */
var seq = 0;
var worker = null;       /* 当前计算中的 Worker */
var currentId = null;
var hashing = false;

function $(id) { return document.getElementById(id); }

function toast(msg) {
    var t = $("fc-toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.classList.remove("show"); }, 2200);
}

function fmtSize(bytes) {
    if (window.FCCore && FCCore.formatSize) return FCCore.formatSize(bytes);
    if (bytes < 1024) return bytes + " B";
    return (bytes / 1048576).toFixed(2) + " MB";
}

function currentAlgo() {
    var els = document.querySelectorAll('input[name="fc-algo"]');
    for (var i = 0; i < els.length; i++) {
        if (els[i].checked) return els[i].value;
    }
    return "sha256";
}

function algoName(id) {
    if (window.FCCore && FCCore.algoById) {
        var a = FCCore.algoById(id);
        if (a) return a.name;
    }
    return id.toUpperCase().replace("SHA", "SHA-");
}

/* ---------- 队列行 ---------- */
function addFiles(files) {
    var added = 0;
    for (var i = 0; i < files.length; i++) {
        var f = files[i];
        /* 去重：同名 + 同大小 + 同修改时间视为同一文件 */
        var dup = queue.some(function (q) {
            return q.file.name === f.name && q.file.size === f.size && q.file.lastModified === f.lastModified;
        });
        if (dup) continue;
        queue.push({ id: ++seq, file: f, status: "pending", hex: "", error: "", row: null });
        added++;
    }
    if (added > 0) { renderQueue(); toast("已加入 " + added + " 个文件"); }
    else toast("文件已在队列中");
    updateButtons();
}

function statusText(it) {
    switch (it.status) {
        case "pending":   return "等待计算";
        case "hashing":   return "计算中…";
        case "done":      return algoName(currentAlgo()) + " 计算完成";
        case "error":     return "出错：" + it.error;
        case "cancelled": return "已取消";
        default:          return "";
    }
}

function renderQueue() {
    var list = $("fc-list");
    list.innerHTML = "";
    if (queue.length === 0) {
        list.innerHTML = '<div class="fc-empty">队列为空：把文件拖到上方虚线框，或点「选择文件」添加</div>';
        return;
    }
    queue.forEach(function (it) {
        var row = document.createElement("div");
        row.className = "fc-row";
        row.setAttribute("data-fc-id", it.id);

        var head = document.createElement("div");
        head.className = "fc-row-head";
        var name = document.createElement("div");
        name.className = "fc-name";
        var icon = document.createElement("i");
        icon.className = "material-icons";
        icon.textContent = "insert_drive_file";
        name.appendChild(icon);
        var ns = document.createElement("span");
        ns.textContent = it.file.name;
        ns.title = it.file.name;
        name.appendChild(ns);
        var size = document.createElement("span");
        size.className = "fc-size";
        size.textContent = fmtSize(it.file.size);
        head.appendChild(name);
        head.appendChild(size);

        var del = document.createElement("button");
        del.type = "button";
        del.className = "fc-icon-btn";
        del.title = "从队列移除";
        del.innerHTML = '<i class="material-icons">close</i>';
        del.onclick = function () { removeItem(it.id); };
        head.appendChild(del);
        row.appendChild(head);

        var bar = document.createElement("div");
        bar.className = "fc-progress";
        var fill = document.createElement("div");
        fill.className = "fc-progress-fill";
        bar.appendChild(fill);
        row.appendChild(bar);

        var meta = document.createElement("div");
        meta.className = "fc-meta";
        var st = document.createElement("span");
        st.className = "fc-status";
        meta.appendChild(st);
        var pct = document.createElement("span");
        pct.className = "fc-pct";
        meta.appendChild(pct);
        row.appendChild(meta);

        var hexWrap = document.createElement("div");
        hexWrap.className = "fc-hex-wrap";
        hexWrap.style.display = "none";
        var hex = document.createElement("code");
        hex.className = "fc-hex";
        hexWrap.appendChild(hex);
        var copyBtn = document.createElement("button");
        copyBtn.type = "button";
        copyBtn.className = "fc-mini";
        copyBtn.innerHTML = '<i class="material-icons">content_copy</i> 复制';
        copyBtn.onclick = function () { copyHex(it); };
        hexWrap.appendChild(copyBtn);
        row.appendChild(hexWrap);

        /* 官方值比对区（每文件独立） */
        var cmp = document.createElement("div");
        cmp.className = "fc-compare";
        cmp.style.display = "none";
        var cmpInput = document.createElement("input");
        cmpInput.type = "text";
        cmpInput.className = "fc-input";
        cmpInput.placeholder = "粘贴官方哈希值（一键比对，忽略大小写/空格/换行）";
        cmpInput.setAttribute("autocomplete", "off");
        cmpInput.setAttribute("spellcheck", "false");
        var cmpBtn = document.createElement("button");
        cmpBtn.type = "button";
        cmpBtn.className = "fc-mini fc-mini-primary";
        cmpBtn.textContent = "比对";
        var badge = document.createElement("span");
        badge.className = "fc-badge";
        badge.style.display = "none";
        cmpBtn.onclick = function () { doCompare(it); };
        cmpInput.addEventListener("keydown", function (ev) {
            if (ev.key === "Enter") { ev.preventDefault(); doCompare(it); }
        });
        cmp.appendChild(cmpInput);
        cmp.appendChild(cmpBtn);
        cmp.appendChild(badge);
        row.appendChild(cmp);

        list.appendChild(row);
        it.row = { root: row, fill: fill, st: st, pct: pct, hexWrap: hexWrap, hex: hex, cmp: cmp, cmpInput: cmpInput, badge: badge, del: del };
        paintRow(it, 0);
    });
}

function paintRow(it, loaded) {
    var r = it.row;
    if (!r) return;
    var total = it.file.size;
    var pct = total > 0 ? Math.floor(loaded / total * 100) : (it.status === "done" ? 100 : 0);
    r.fill.style.width = pct + "%";
    r.st.textContent = statusText(it);
    r.pct.textContent = it.status === "hashing" ? (pct + "% · " + fmtSize(loaded) + " / " + fmtSize(total)) : "";
    r.root.classList.toggle("fc-done", it.status === "done");
    r.root.classList.toggle("fc-error", it.status === "error");
    if (it.status === "done") {
        r.hexWrap.style.display = "";
        r.hex.textContent = it.hex;
        r.cmp.style.display = "";
    } else {
        r.hexWrap.style.display = "none";
        r.cmp.style.display = "none";
    }
    /* 计算中的行禁用删除，避免 terminate 后状态错乱 */
    r.del.disabled = (it.status === "hashing");
}

function removeItem(id) {
    if (currentId === id) return; /* 计算中不可删，用取消按钮 */
    queue = queue.filter(function (q) { return q.id !== id; });
    renderQueue();
    updateButtons();
}

/* ---------- Worker 驱动 ---------- */
function startQueue() {
    if (hashing) return;
    var pending = queue.filter(function (q) { return q.status === "pending" || q.status === "cancelled" || q.status === "error"; });
    if (pending.length === 0) { toast("没有待计算的文件"); return; }
    hashing = true;
    updateButtons();
    nextInQueue();
}

function nextInQueue() {
    var it = null;
    for (var i = 0; i < queue.length; i++) {
        if (queue[i].status === "pending" || queue[i].status === "cancelled" || queue[i].status === "error") { it = queue[i]; break; }
    }
    if (!it) { hashing = false; currentId = null; updateButtons(); return; }
    runOne(it);
}

function runOne(it) {
    var algo = currentAlgo();
    try {
        worker = new Worker(WORKER_URL);
    } catch (e) {
        it.status = "error";
        it.error = "Worker 启动失败（浏览器不支持 Web Worker）";
        paintRow(it, 0);
        hashing = false;
        updateButtons();
        return;
    }
    currentId = it.id;
    it.status = "hashing";
    it.hex = "";
    if (it.row) { it.row.badge.style.display = "none"; it.row.cmpInput.value = it.row.cmpInput.value; }
    paintRow(it, 0);
    updateButtons();

    worker.onmessage = function (e) {
        var d = e.data || {};
        if (d.id !== currentId) return;
        if (d.cmd === "progress") {
            paintRow(it, d.loaded);
        } else if (d.cmd === "done") {
            stopWorker();
            it.status = "done";
            it.hex = d.hex;
            paintRow(it, it.file.size);
            currentId = null;
            nextInQueue();
        } else if (d.cmd === "error") {
            stopWorker();
            it.status = "error";
            it.error = d.message || "计算失败";
            paintRow(it, 0);
            currentId = null;
            nextInQueue();
        }
    };
    worker.onerror = function () {
        stopWorker();
        it.status = "error";
        it.error = "Worker 异常退出";
        paintRow(it, 0);
        currentId = null;
        nextInQueue();
    };
    worker.postMessage({ cmd: "hash", id: it.id, algo: algo, file: it.file });
}

function stopWorker() {
    if (worker) { try { worker.terminate(); } catch (e) {} worker = null; }
}

function cancelCurrent() {
    if (!hashing || currentId == null) return;
    var it = null;
    for (var i = 0; i < queue.length; i++) {
        if (queue[i].id === currentId) { it = queue[i]; break; }
    }
    stopWorker();
    if (it) { it.status = "cancelled"; paintRow(it, 0); }
    currentId = null;
    hashing = false;
    updateButtons();
    toast("已取消当前文件计算");
}

function clearQueue() {
    if (hashing) { toast("计算中，请先取消"); return; }
    queue = [];
    renderQueue();
    updateButtons();
}

/* ---------- 复制 / 比对 ---------- */
function copyHex(it) {
    if (!it.hex) return;
    function done() { toast("哈希值已复制"); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(it.hex).then(done, function () { fallbackCopy(it.hex, done); });
    } else {
        fallbackCopy(it.hex, done);
    }
}
function fallbackCopy(text, done) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); done(); }
    catch (e) { toast("复制失败，请手动选择复制"); }
    document.body.removeChild(ta);
}

function doCompare(it) {
    var r = it.row;
    var input = r.cmpInput.value;
    var badge = r.badge;
    badge.style.display = "";
    if (!window.FCCore || !FCCore.compareHash) {
        badge.textContent = "核心未加载";
        badge.className = "fc-badge fc-badge-bad";
        return;
    }
    var res = FCCore.compareHash(it.hex, input);
    var normB = res.normB;
    if (!normB) {
        badge.textContent = "请先粘贴官方哈希值";
        badge.className = "fc-badge fc-badge-warn";
        return;
    }
    if (res.match) {
        badge.textContent = "✓ 一致：文件完整";
        badge.className = "fc-badge fc-badge-ok";
    } else {
        badge.textContent = "✗ 不一致：文件可能损坏或被篡改";
        badge.className = "fc-badge fc-badge-bad";
    }
}

/* ---------- 按钮状态 ---------- */
function updateButtons() {
    var hasPending = queue.some(function (q) { return q.status === "pending" || q.status === "cancelled" || q.status === "error"; });
    $("fc-start-btn").disabled = hashing || !hasPending;
    $("fc-cancel-btn").disabled = !hashing;
    $("fc-clear-btn").disabled = hashing || queue.length === 0;
    $("fc-cancel-btn").style.display = hashing ? "" : "none";
}

/* ---------- 事件绑定 ---------- */
function bindEvents() {
    var dz = $("fc-dropzone"), fi = $("fc-file-input");

    $("fc-pick-btn").addEventListener("click", function () { fi.click(); });
    dz.addEventListener("click", function (e) {
        if (e.target === dz || e.target.closest(".fc-dz-hint")) fi.click();
    });
    fi.addEventListener("change", function () {
        addFiles(fi.files);
        fi.value = "";
    });

    ["dragenter", "dragover"].forEach(function (ev) {
        dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add("fc-drag"); });
    });
    ["dragleave", "drop"].forEach(function (ev) {
        dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove("fc-drag"); });
    });
    dz.addEventListener("drop", function (e) {
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
    });

    var algos = document.querySelectorAll('input[name="fc-algo"]');
    for (var i = 0; i < algos.length; i++) {
        algos[i].addEventListener("change", function () {
            if (hashing) return;
            var cleared = 0;
            queue.forEach(function (q) {
                if (q.status === "done") { q.status = "pending"; q.hex = ""; cleared++; }
            });
            if (cleared > 0) { renderQueue(); toast("算法已切换为 " + algoName(currentAlgo()) + "，请重新计算"); }
            updateButtons();
        });
    }

    $("fc-start-btn").addEventListener("click", startQueue);
    $("fc-cancel-btn").addEventListener("click", cancelCurrent);
    $("fc-clear-btn").addEventListener("click", clearQueue);
}

document.addEventListener("DOMContentLoaded", function () {
    renderQueue();
    bindEvents();
    updateButtons();
});

})();
