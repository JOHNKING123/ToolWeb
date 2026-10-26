/* TOTP 一次性密码生成器：RFC 6238（HMAC-SHA1、30 秒固定周期、动态截断），纯前端零上传。
 * 密钥只留当前页面内存，刷新页面即失；不做账号绑定与扫码；仅 HMAC-SHA1 与 30 秒周期。
 * 浏览器用 WebCrypto SubtleCrypto 做 HMAC-SHA1；node 测试用可注入的同步 HMAC 函数。
 * 双模式：浏览器用 window.TOTPGenerator 挂载，node 用 module.exports。
 * 浏览器运行入口在文件末尾（仅当 document 存在时初始化页面交互）。
 */
(function () {
"use strict";

var SAMPLE_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
var PERIOD = 30;
var ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/* ---------------- 输入归一化与 otpauth 提取 ---------------- */

/* 从 otpauth:// 链接中提取 secret 参数；非链接原样返回。
 * 返回 {secret, extracted}；链接无 secret 参数时 extracted 为 false 且 secret 为原串。 */
function extractSecretFromOtpauth(raw) {
  var text = (raw || "").trim();
  if (text.toLowerCase().indexOf("otpauth://") !== 0) return { secret: raw, extracted: false };
  var q = text.indexOf("?");
  if (q < 0) return { secret: raw, extracted: false };
  var query = text.slice(q + 1);
  var hash = query.indexOf("#");
  if (hash >= 0) query = query.slice(0, hash);
  var pairs = query.split("&");
  for (var i = 0; i < pairs.length; i++) {
    var kv = pairs[i].split("=");
    if (kv.length < 2) continue;
    var k = "";
    try { k = decodeURIComponent(kv[0].replace(/\+/g, " ")); } catch (e) { k = kv[0]; }
    if (k.toLowerCase() === "secret") {
      var v = "";
      try { v = decodeURIComponent(kv.slice(1).join("=").replace(/\+/g, " ")); } catch (e2) { v = kv.slice(1).join("="); }
      return { secret: v, extracted: true };
    }
  }
  return { secret: raw, extracted: false };
}

/* 去空格与连字符、转大写。otpauth 链接先提取 secret 再归一化。 */
function normalizeSecret(raw) {
  var ext = extractSecretFromOtpauth(raw);
  var cleaned = (ext.secret || "").replace(/[\s\-]+/g, "").toUpperCase();
  return { cleaned: cleaned, extracted: ext.extracted };
}

/* ---------------- Base32 解码（RFC 4648） ---------------- */

/* 解码已归一化的字符串（大写、无空格连字符）。
 * 成功返回 {ok:true, bytes}；失败返回 {ok:false, error, illegalChar, illegalPos}。
 * illegalPos 为 1 起的首个非法字符位置（按归一化后字符串计）。 */
function decodeBase32(cleaned) {
  var s = cleaned || "";
  /* 填充符只能出现在末尾 */
  var padStart = s.indexOf("=");
  if (padStart >= 0) {
    for (var p = padStart; p < s.length; p++) {
      if (s.charAt(p) !== "=") {
        return { ok: false, error: "第" + (p + 1) + "位字符「=」位置非法：填充符只能出现在密钥末尾", illegalChar: "=", illegalPos: p + 1 };
      }
    }
    s = s.slice(0, padStart);
  }
  for (var i = 0; i < s.length; i++) {
    var c = s.charAt(i);
    if (ALPHABET.indexOf(c) < 0) {
      return { ok: false, error: "第" + (i + 1) + "位字符「" + c + "」非法：Base32 密钥只能含字母 A-Z 与数字 2-7（不含 0、1、8、9）", illegalChar: c, illegalPos: i + 1 };
    }
  }
  if (s.length === 0) {
    return { ok: false, error: "密钥解码结果为空：请检查密钥是否正确", illegalChar: null, illegalPos: 0 };
  }
  var bits = 0, bitCount = 0, out = [];
  for (var j = 0; j < s.length; j++) {
    bits = (bits << 5) | ALPHABET.indexOf(s.charAt(j));
    bitCount += 5;
    if (bitCount >= 8) {
      bitCount -= 8;
      out.push((bits >> bitCount) & 0xff);
    }
  }
  if (out.length === 0) {
    return { ok: false, error: "密钥解码结果为空：请检查密钥是否正确", illegalChar: null, illegalPos: 0 };
  }
  return { ok: true, bytes: out };
}

/* 校验一整条用户输入：区分空输入、非法字符、解码为空三类中文提示。
 * 返回 {ok, bytes, cleaned, extracted, error}；ok 为 false 时 error 为中文提示。 */
function validateSecret(raw) {
  var norm = normalizeSecret(raw);
  if (!norm.cleaned) {
    return { ok: false, bytes: null, cleaned: "", extracted: norm.extracted, error: "请输入 Base32 密钥" };
  }
  var dec = decodeBase32(norm.cleaned);
  if (!dec.ok) {
    return { ok: false, bytes: null, cleaned: norm.cleaned, extracted: norm.extracted, error: dec.error };
  }
  return { ok: true, bytes: dec.bytes, cleaned: norm.cleaned, extracted: norm.extracted, error: "" };
}

/* ---------------- RFC 6238 算码 ---------------- */

function counterFor(unixSeconds) {
  return Math.floor(unixSeconds / PERIOD);
}

function counterToBytes(counter) {
  var buf = [];
  var c = counter;
  for (var i = 7; i >= 0; i--) {
    buf[i] = c & 0xff;
    c = Math.floor(c / 256);
  }
  return buf;
}

/* 动态截断：取 HMAC 末字节低 4 位作偏移，取 4 字节去最高位后对 10^位数取模，前补 0。 */
function truncateCode(hmacBytes, digits) {
  var offset = hmacBytes[hmacBytes.length - 1] & 0x0f;
  var binary = ((hmacBytes[offset] & 0x7f) << 24) |
    ((hmacBytes[offset + 1] & 0xff) << 16) |
    ((hmacBytes[offset + 2] & 0xff) << 8) |
    (hmacBytes[offset + 3] & 0xff);
  var mod = 1;
  for (var i = 0; i < digits; i++) mod *= 10;
  var code = binary % mod;
  var text = String(code);
  while (text.length < digits) text = "0" + text;
  return text;
}

/* 同步算码：hmacFn(keyBytes, counterBytes) 返回 HMAC-SHA1 字节数组（node 测试注入）。 */
function generateTOTPWithHmac(keyBytes, unixSeconds, digits, hmacFn) {
  var counterBytes = counterToBytes(counterFor(unixSeconds));
  var hmac = hmacFn(keyBytes, counterBytes);
  return truncateCode(hmac, digits);
}

/* 浏览器异步算码：WebCrypto HMAC-SHA1。 */
function getSubtle() {
  if (typeof globalThis !== "undefined" && globalThis.crypto && globalThis.crypto.subtle) return globalThis.crypto.subtle;
  if (typeof window !== "undefined" && window.crypto && window.crypto.subtle) return window.crypto.subtle;
  return null;
}

function generateTOTPAsync(keyBytes, unixSeconds, digits) {
  var subtle = getSubtle();
  if (!subtle) return Promise.reject(new Error("当前浏览器不支持 WebCrypto，无法计算一次性密码"));
  var keyData = new Uint8Array(keyBytes);
  var msg = new Uint8Array(counterToBytes(counterFor(unixSeconds)));
  return subtle.importKey("raw", keyData, { name: "HMAC", hash: "SHA-1" }, false, ["sign"])
    .then(function (key) { return subtle.sign("HMAC", key, msg); })
    .then(function (sig) {
      var bytes = [];
      var view = new Uint8Array(sig);
      for (var i = 0; i < view.length; i++) bytes.push(view[i]);
      return truncateCode(bytes, digits);
    });
}

/* ---------------- 倒计时 ---------------- */

function remainingSeconds(unixSeconds) {
  var mod = unixSeconds % PERIOD;
  if (mod < 0) mod += PERIOD;
  var r = PERIOD - mod;
  return r === 0 ? PERIOD : r;
}

function progressPercent(unixSeconds) {
  return Math.round(remainingSeconds(unixSeconds) / PERIOD * 100);
}

var api = {
  SAMPLE_SECRET: SAMPLE_SECRET,
  PERIOD: PERIOD,
  extractSecretFromOtpauth: extractSecretFromOtpauth,
  normalizeSecret: normalizeSecret,
  decodeBase32: decodeBase32,
  validateSecret: validateSecret,
  counterFor: counterFor,
  counterToBytes: counterToBytes,
  truncateCode: truncateCode,
  generateTOTPWithHmac: generateTOTPWithHmac,
  generateTOTPAsync: generateTOTPAsync,
  remainingSeconds: remainingSeconds,
  progressPercent: progressPercent
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = api;
} else if (typeof window !== "undefined") {
  window.TOTPGenerator = api;
}

/* ---------------- 浏览器交互（仅当 document 存在） ---------------- */
if (typeof document !== "undefined") {
  (function () {
    function $(id) { return document.getElementById(id); }
    function toast(msg) {
      var t = $("tp-toast");
      if (!t) return;
      t.textContent = msg;
      t.style.display = "block";
      setTimeout(function () { t.style.display = "none"; }, 2600);
    }
    function copyText(text, okMsg) {
      function fallback() {
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        try {
          if (document.execCommand("copy")) { toast(okMsg); }
          else { toast("复制失败：请手动长按或全选上方动态码复制（浏览器未授予剪贴板权限）"); }
        } catch (e) {
          toast("复制失败：请手动长按或全选上方动态码复制（浏览器未授予剪贴板权限）");
        }
        document.body.removeChild(ta);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { toast(okMsg); }, fallback);
      } else fallback();
    }

    var seq = 0;
    var lastCode = "";

    function currentDigits() {
      var radios = document.getElementsByName("tp-digits");
      for (var i = 0; i < radios.length; i++) if (radios[i].checked) return parseInt(radios[i].value, 10);
      return 6;
    }

    function setCodeEmpty() {
      lastCode = "";
      $("tp-code").textContent = "------";
      $("tp-remain").textContent = "--";
      $("tp-bar").style.width = "0%";
    }

    function showLocalTime(nowSec) {
      var d = new Date(nowSec * 1000);
      var pad = function (n) { return (n < 10 ? "0" : "") + n; };
      $("tp-now").textContent = "本机当前时间：" + d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) +
        " " + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds()) +
        "（码按本机时钟计算，时间不准则码不对）";
    }

    function recompute() {
      var inputEl = $("tp-secret");
      var msgEl = $("tp-msg");
      var raw = inputEl.value;
      var nowSec = Math.floor(Date.now() / 1000);
      showLocalTime(nowSec);
      var v = validateSecret(raw);
      if (!v.ok) {
        lastCode = "";
        setCodeEmpty();
        msgEl.textContent = v.error;
        msgEl.className = "tp-msg tp-err";
        return;
      }
      msgEl.textContent = v.extracted ? "已从链接中提取密钥" : "本地计算中，密钥不离开本机";
      msgEl.className = "tp-msg tp-ok";
      var mySeq = ++seq;
      generateTOTPAsync(v.bytes, nowSec, currentDigits()).then(function (code) {
        if (mySeq !== seq) return;
        lastCode = code;
        $("tp-code").textContent = code;
        var remain = remainingSeconds(nowSec);
        $("tp-remain").textContent = remain;
        $("tp-bar").style.width = progressPercent(nowSec) + "%";
      }, function (e) {
        if (mySeq !== seq) return;
        lastCode = "";
        setCodeEmpty();
        msgEl.textContent = "计算失败：" + e.message;
        msgEl.className = "tp-msg tp-err";
      });
    }

    /* 每秒刷新倒计时与动态码：周期切换瞬间码同步切换 */
    function tick() {
      var raw = $("tp-secret").value;
      if (!raw.trim()) {
        showLocalTime(Math.floor(Date.now() / 1000));
        return;
      }
      recompute();
    }

    function maybeExtractOnInput() {
      var inputEl = $("tp-secret");
      var raw = inputEl.value;
      if (raw.toLowerCase().indexOf("otpauth://") === 0) {
        var ext = extractSecretFromOtpauth(raw);
        if (ext.extracted) {
          inputEl.value = ext.secret;
          toast("已从链接中提取密钥");
        }
      }
    }

    function init() {
      var input = $("tp-secret");
      if (!input) return;
      input.addEventListener("input", function () { maybeExtractOnInput(); recompute(); });
      var radios = document.getElementsByName("tp-digits");
      for (var i = 0; i < radios.length; i++) radios[i].addEventListener("change", recompute);
      if ($("tp-toggle")) $("tp-toggle").addEventListener("click", function () {
        input.type = input.type === "password" ? "text" : "password";
        this.textContent = input.type === "password" ? "显示" : "隐藏";
      });
      if ($("tp-sample")) $("tp-sample").addEventListener("click", function () {
        input.value = SAMPLE_SECRET;
        toast("已载入示例密钥（RFC 6238 公开测试向量，非真实账号）");
        recompute();
      });
      if ($("tp-clear")) $("tp-clear").addEventListener("click", function () {
        input.value = "";
        setCodeEmpty();
        $("tp-msg").textContent = "请输入 Base32 密钥";
        $("tp-msg").className = "tp-msg";
      });
      if ($("tp-wipe")) $("tp-wipe").addEventListener("click", function () {
        input.value = "";
        lastCode = "";
        setCodeEmpty();
        $("tp-msg").textContent = "已清除密钥，码区为空";
        $("tp-msg").className = "tp-msg";
        toast("已清除密钥");
      });
      if ($("tp-copy")) $("tp-copy").addEventListener("click", function () {
        if (!lastCode) { toast("暂无可复制的动态码，请先输入有效密钥"); return; }
        copyText(lastCode, "已复制动态码");
      });
      setInterval(tick, 1000);
      recompute();
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  })();
}
})();
