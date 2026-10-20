/* 文件校验和计算器 · Web Worker
 * 在 Worker 线程内做分片读取＋增量摘要，主线程只负责 UI，计算过程不阻塞页面。
 * 取消：主线程直接 worker.terminate() 即可（内存恒定：任意时刻只持有当前分片）。
 */
"use strict";

importScripts("file_checksum_core.js");

var CHUNK = (typeof FCCore !== "undefined" && FCCore.CHUNK_SIZE) || (4 * 1024 * 1024);

self.onmessage = function (e) {
    var d = e.data || {};
    if (d.cmd === "hash") {
        hashFile(d);
    }
};

function hashFile(d) {
    var file = d.file;
    var algo = d.algo || "sha256";
    var id = d.id;
    var hasher;
    try {
        hasher = FCCore.create(algo);
    } catch (err) {
        self.postMessage({ cmd: "error", id: id, message: String(err && err.message || err) });
        return;
    }
    var total = file.size;
    var offset = 0;

    function pump() {
        if (offset >= total) {
            var hex;
            try {
                hex = hasher.digest();
            } catch (err) {
                self.postMessage({ cmd: "error", id: id, message: String(err && err.message || err) });
                return;
            }
            self.postMessage({ cmd: "done", id: id, hex: hex, algo: algo, size: total });
            return;
        }
        var end = Math.min(offset + CHUNK, total);
        var slice = file.slice(offset, end);
        slice.arrayBuffer().then(function (buf) {
            hasher.update(new Uint8Array(buf));
            offset = end;
            self.postMessage({ cmd: "progress", id: id, loaded: offset, total: total });
            /* 让出事件循环，避免长任务饿死取消消息 */
            setTimeout(pump, 0);
        }, function (err) {
            self.postMessage({ cmd: "error", id: id, message: "文件读取失败: " + String(err && err.message || err) });
        });
    }
    pump();
}
