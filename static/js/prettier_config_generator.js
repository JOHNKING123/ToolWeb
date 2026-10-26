/* Prettier 配置生成器：14 项 Prettier 3 口径核心选项 → .prettierrc.json 生成。
 * 纯前端、零网络请求：手写选项→JSON 生成与数值校验，不引入 Prettier 本体，
 * 不格式化代码、不读取现有配置。浏览器与 node 测试共用同一文件：
 * 浏览器用 window.PrettierConfigGenerator，node 用 module.exports。 */
"use strict";

/* ---------- 选项定义（顺序即输出 JSON 的键顺序） ---------- */
var OPTION_ORDER = [
    "printWidth", "tabWidth", "useTabs", "semi", "singleQuote", "quoteProps",
    "jsxSingleQuote", "trailingComma", "bracketSpacing", "bracketSameLine",
    "arrowParens", "endOfLine", "proseWrap", "embeddedLanguageFormatting"
];

var ENUM_VALUES = {
    quoteProps: ["as-needed", "consistent", "preserve"],
    trailingComma: ["all", "es5", "none"],
    arrowParens: ["always", "avoid"],
    endOfLine: ["lf", "crlf", "cr", "auto"],
    proseWrap: ["preserve", "always", "never"],
    embeddedLanguageFormatting: ["auto", "off"]
};

/* Prettier 默认值（Prettier 3 口径） */
var DEFAULTS = {
    printWidth: 80,
    tabWidth: 2,
    useTabs: false,
    semi: true,
    singleQuote: false,
    quoteProps: "as-needed",
    jsxSingleQuote: false,
    trailingComma: "all",
    bracketSpacing: true,
    bracketSameLine: false,
    arrowParens: "always",
    endOfLine: "lf",
    proseWrap: "preserve",
    embeddedLanguageFormatting: "auto"
};

/* 3 组一键预设：只改动命名的项，其余保持 Prettier 默认 */
var PRESETS = {
    "default": {},
    "single-no-semi": { singleQuote: true, semi: false },
    "tabs": { useTabs: true }
};

function cloneDefaults() {
    var out = {};
    OPTION_ORDER.forEach(function (k) { out[k] = DEFAULTS[k]; });
    return out;
}

function applyPreset(presetName) {
    var out = cloneDefaults();
    var patch = PRESETS[presetName];
    if (!patch) return out;
    Object.keys(patch).forEach(function (k) { out[k] = patch[k]; });
    return out;
}

/* ---------- 校验：返回中文错误列表；空数组 = 合法 ---------- */
function validateOptions(opts) {
    var errors = [];
    var pw = opts.printWidth;
    if (typeof pw !== "number" || isNaN(pw) || pw % 1 !== 0 || pw < 1) {
        errors.push("printWidth 必须是正整数（当前值：" + String(pw) + "），请填写大于 0 的整数，如 80。");
    }
    var tw = opts.tabWidth;
    if (typeof tw !== "number" || isNaN(tw) || tw % 1 !== 0 || tw < 1 || tw > 8) {
        errors.push("tabWidth 必须是 1–8 之间的整数（当前值：" + String(tw) + "），请填写 1 到 8 之间的整数，如 2。");
    }
    Object.keys(ENUM_VALUES).forEach(function (k) {
        if (ENUM_VALUES[k].indexOf(opts[k]) === -1) {
            errors.push(k + " 取值非法（当前值：" + String(opts[k]) + "），可选值：" + ENUM_VALUES[k].join(" / ") + "。");
        }
    });
    ["useTabs", "semi", "singleQuote", "jsxSingleQuote", "bracketSpacing", "bracketSameLine"].forEach(function (k) {
        if (typeof opts[k] !== "boolean") {
            errors.push(k + " 必须是开/关（当前值：" + String(opts[k]) + "）。");
        }
    });
    return errors;
}

/* ---------- 生成：合法时返回按 OPTION_ORDER 排序的配置对象，否则返回 null ---------- */
function buildConfig(opts) {
    if (validateOptions(opts).length > 0) return null;
    var out = {};
    OPTION_ORDER.forEach(function (k) { out[k] = opts[k]; });
    return out;
}

/* 合法时返回标准 JSON（2 空格缩进），非法时返回 null（不输出误导性配置） */
function toPrettierrcJson(opts) {
    var cfg = buildConfig(opts);
    if (!cfg) return null;
    return JSON.stringify(cfg, null, 2);
}

/* 表单原始值（字符串/布尔）归一化为选项对象：数值字段转数字，空串转 NaN 交校验报错 */
function normalizeForm(raw) {
    var opts = cloneDefaults();
    var pw = parseFloat(String(raw.printWidth).trim());
    opts.printWidth = String(raw.printWidth).trim() === "" ? NaN : pw;
    var tw = parseFloat(String(raw.tabWidth).trim());
    opts.tabWidth = String(raw.tabWidth).trim() === "" ? NaN : tw;
    ["useTabs", "semi", "singleQuote", "jsxSingleQuote", "bracketSpacing", "bracketSameLine"].forEach(function (k) {
        opts[k] = !!raw[k];
    });
    Object.keys(ENUM_VALUES).forEach(function (k) { opts[k] = raw[k]; });
    return opts;
}

var api = {
    OPTION_ORDER: OPTION_ORDER,
    ENUM_VALUES: ENUM_VALUES,
    DEFAULTS: DEFAULTS,
    PRESETS: PRESETS,
    cloneDefaults: cloneDefaults,
    applyPreset: applyPreset,
    validateOptions: validateOptions,
    buildConfig: buildConfig,
    toPrettierrcJson: toPrettierrcJson,
    normalizeForm: normalizeForm
};

if (typeof module !== "undefined" && module.exports) module.exports = api;
if (typeof window !== "undefined") window.PrettierConfigGenerator = api;

/* ---------- 浏览器绑定（node 下无 document，自动跳过） ---------- */
if (typeof document !== "undefined") {
    (function () {
        var P = window.PrettierConfigGenerator;
        var $ = function (id) { return document.getElementById(id); };

        var numIds = { printWidth: "pcg-printWidth", tabWidth: "pcg-tabWidth" };
        var boolIds = {
            useTabs: "pcg-useTabs", semi: "pcg-semi", singleQuote: "pcg-singleQuote",
            jsxSingleQuote: "pcg-jsxSingleQuote", bracketSpacing: "pcg-bracketSpacing",
            bracketSameLine: "pcg-bracketSameLine"
        };
        var enumIds = {
            quoteProps: "pcg-quoteProps", trailingComma: "pcg-trailingComma",
            arrowParens: "pcg-arrowParens", endOfLine: "pcg-endOfLine",
            proseWrap: "pcg-proseWrap", embeddedLanguageFormatting: "pcg-embeddedLanguageFormatting"
        };

        var outputEl = $("pcg-output");
        var errorEl = $("pcg-errors");
        var statusEl = $("pcg-status");
        if (!outputEl) return;

        function readForm() {
            var raw = {
                printWidth: $(numIds.printWidth).value,
                tabWidth: $(numIds.tabWidth).value
            };
            Object.keys(boolIds).forEach(function (k) { raw[k] = $(boolIds[k]).checked; });
            Object.keys(enumIds).forEach(function (k) { raw[k] = $(enumIds[k]).value; });
            return P.normalizeForm(raw);
        }

        function writeForm(opts) {
            $(numIds.printWidth).value = opts.printWidth;
            $(numIds.tabWidth).value = opts.tabWidth;
            Object.keys(boolIds).forEach(function (k) { $(boolIds[k]).checked = !!opts[k]; });
            Object.keys(enumIds).forEach(function (k) { $(enumIds[k]).value = opts[k]; });
        }

        function render() {
            var opts = readForm();
            var errors = P.validateOptions(opts);
            if (errors.length > 0) {
                errorEl.innerHTML = "";
                errors.forEach(function (msg) {
                    var li = document.createElement("li");
                    li.textContent = msg;
                    errorEl.appendChild(li);
                });
                errorEl.style.display = "block";
                outputEl.textContent = "";
                statusEl.textContent = "当前配置无效，未输出：请修正上方提示后再复制或下载。";
                return;
            }
            errorEl.style.display = "none";
            errorEl.innerHTML = "";
            outputEl.textContent = P.toPrettierrcJson(opts);
            statusEl.textContent = "已生成 .prettierrc.json（Prettier 3 口径，2 空格缩进）。";
        }

        function bindChange(el) {
            if (el) el.addEventListener("input", render);
            if (el) el.addEventListener("change", render);
        }
        Object.keys(numIds).forEach(function (k) { bindChange($(numIds[k])); });
        Object.keys(boolIds).forEach(function (k) { bindChange($(boolIds[k])); });
        Object.keys(enumIds).forEach(function (k) { bindChange($(enumIds[k])); });

        function applyAndRender(opts, msg) {
            writeForm(opts);
            render();
            statusEl.textContent = msg;
        }

        var presetBtns = {
            "pcg-preset-default": ["default", "已载入「Prettier 默认」预设，可再改单项。"],
            "pcg-preset-single": ["single-no-semi", "已载入「单引号＋无分号」预设（singleQuote 开启、semi 关闭，其余保持默认），可再改单项。"],
            "pcg-preset-tabs": ["tabs", "已载入「Tab 缩进」预设（useTabs 开启，其余保持默认），可再改单项。"]
        };
        Object.keys(presetBtns).forEach(function (id) {
            var btn = $(id);
            if (!btn) return;
            btn.addEventListener("click", function () {
                applyAndRender(P.applyPreset(presetBtns[id][0]), presetBtns[id][1]);
            });
        });

        var resetBtn = $("pcg-reset");
        if (resetBtn) resetBtn.addEventListener("click", function () {
            applyAndRender(P.cloneDefaults(), "已恢复 Prettier 默认值。");
        });

        var copyBtn = $("pcg-copy");
        if (copyBtn) copyBtn.addEventListener("click", function () {
            var text = outputEl.textContent;
            if (!text) {
                statusEl.textContent = "当前没有可复制的配置：请先修正数值错误，生成后再复制。";
                return;
            }
            function fallbackCopy() {
                var ta = document.createElement("textarea");
                ta.value = text;
                ta.style.position = "fixed";
                ta.style.opacity = "0";
                document.body.appendChild(ta);
                ta.select();
                var ok = false;
                try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
                document.body.removeChild(ta);
                if (ok) {
                    statusEl.textContent = "已复制 .prettierrc.json 内容。";
                } else {
                    statusEl.textContent = "复制失败：请手动选中下方输出框内的全部内容，按 Ctrl+C（Mac 为 Cmd+C）复制。";
                }
            }
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).then(function () {
                    statusEl.textContent = "已复制 .prettierrc.json 内容。";
                }, fallbackCopy);
            } else {
                fallbackCopy();
            }
        });

        var dlBtn = $("pcg-download");
        if (dlBtn) dlBtn.addEventListener("click", function () {
            var text = outputEl.textContent;
            if (!text) {
                statusEl.textContent = "当前没有可下载的配置：请先修正数值错误，生成后再下载。";
                return;
            }
            var blob = new Blob([text], { type: "application/json;charset=utf-8" });
            var a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = ".prettierrc.json";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
            statusEl.textContent = "已下载 .prettierrc.json。";
        });

        render();
    })();
}
