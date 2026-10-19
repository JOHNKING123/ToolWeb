/* 代码压缩器：自研零依赖 JS/CSS 压缩引擎，纯前端本地计算，无后端调用、无外部请求 */
(function () {
    "use strict";

    // ================= 通用小工具 =================
    function isWordChar(ch) { return !!ch && /[A-Za-z0-9_$]/.test(ch); }

    function byteLen(s) {
        if (window.TextEncoder) { try { return new TextEncoder().encode(s).length; } catch (e) { /* 降级 */ } }
        var n = 0;
        for (var i = 0; i < s.length; i++) {
            var c = s.charCodeAt(i);
            if (c < 0x80) { n += 1; }
            else if (c < 0x800) { n += 2; }
            else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) { n += 4; i++; }
            else { n += 3; }
        }
        return n;
    }

    function fmtBytes(n) {
        if (n < 1024) { return n + " B"; }
        return (n / 1024).toFixed(2) + " KB";
    }

    function toast(msg) {
        var el = document.createElement("div");
        el.textContent = msg;
        el.style.cssText = "position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);background:#111827;color:#fff;padding:.6rem 1.2rem;border-radius:.5rem;z-index:9999;font-size:.9rem;max-width:90vw;text-align:center;";
        document.body.appendChild(el);
        setTimeout(function () { if (el.parentNode) { el.parentNode.removeChild(el); } }, 1800);
    }

    // ================= JS 分词器 =================
    // token: {t:'ch',v:单个字符} | {t:'str',v:字符串/模板/正则原子} | {t:'ws',nl:是否含换行}
    // 注释在分词阶段即转为 ws：行注释 -> 含换行的 ws（保分隔），块注释 -> 空格型 ws
    var REGEX_AFTER_WORD = {
        "return": 1, "typeof": 1, "instanceof": 1, "in": 1, "of": 1,
        "new": 1, "delete": 1, "void": 1, "throw": 1, "case": 1,
        "yield": 1, "await": 1, "do": 1, "else": 1
    };

    function prevSigIdx(tokens, idx) {
        for (var i = idx - 1; i >= 0; i--) { if (tokens[i].t !== "ws") { return i; } }
        return -1;
    }
    function nextSigIdx(tokens, idx) {
        for (var i = idx + 1; i < tokens.length; i++) { if (tokens[i].t !== "ws") { return i; } }
        return -1;
    }
    function firstChar(t) { return t.v.charAt(0); }
    function lastChar(t) { return t.v.charAt(t.v.length - 1); }
    function wordEndingAt(tokens, idx) {
        var w = "";
        for (var i = idx; i >= 0; i--) {
            var t = tokens[i];
            if (t.t !== "ch" || !isWordChar(t.v)) { break; }
            w = t.v + w;
        }
        return w;
    }
    function wordStartingAt(tokens, idx) {
        var w = "";
        for (var i = idx; i < tokens.length; i++) {
            var t = tokens[i];
            if (t.t !== "ch" || !isWordChar(t.v)) { break; }
            w += t.v;
        }
        return w;
    }

    // 上一个有效 token 之后是否可以出现正则字面量（经典启发式）
    function canBeRegex(tokens) {
        var pi = prevSigIdx(tokens, tokens.length);
        if (pi < 0) { return true; }
        var p = tokens[pi];
        if (p.t === "str") { return false; }
        var ch = p.v;
        if (isWordChar(ch)) {
            var w = wordEndingAt(tokens, pi);
            return !!REGEX_AFTER_WORD[w];
        }
        if (ch === ")" || ch === "]" || ch === "}") { return false; }
        return true;
    }

    function scanRegex(src, i) {
        var j = i + 1, n = src.length, inClass = false;
        while (j < n) {
            var c = src[j];
            if (c === "\\") { j += 2; continue; }
            if (c === "\n" || c === "\r") { return null; }
            if (c === "[") { inClass = true; }
            else if (c === "]") { inClass = false; }
            else if (c === "/" && !inClass) { break; }
            j++;
        }
        if (j >= n) { return null; }
        j++;
        while (j < n && /[a-z]/i.test(src[j])) { j++; }
        return { text: src.slice(i, j), end: j };
    }

    // 模板字符串原子扫描（含 ${} 嵌套、转义、内层引号/注释）；minifyExpr 可对 ${} 内表达式递归压缩
    function scanTemplate(src, i, minifyExpr) {
        var j = i + 1, n = src.length;
        var parts = null; // 延迟分配：无 ${} 时直接切片
        var segStart = i + 1;
        while (j < n) {
            var c = src[j];
            if (c === "\\") { j += 2; continue; }
            if (c === "`") { j++; break; }
            if (c === "$" && src[j + 1] === "{") {
                var blockEnd = skipBraceBlock(src, j + 2, minifyExpr);
                if (minifyExpr) {
                    if (!parts) { parts = [src.slice(i, j)]; }
                    else { parts.push(src.slice(segStart, j)); }
                    parts.push("${" + minifyExpr(src.slice(j + 2, blockEnd - 1)) + "}");
                    segStart = blockEnd;
                }
                j = blockEnd;
                continue;
            }
            j++;
        }
        if (parts) {
            parts.push(src.slice(segStart, j));
            return { text: parts.join(""), end: j };
        }
        return { text: src.slice(i, j), end: j };
    }

    // 从左花括号之后开始，跳到与之匹配的右花括号之后（处理字符串/模板/注释/转义）
    function skipBraceBlock(src, i, minifyExpr) {
        var j = i, n = src.length, depth = 1;
        while (j < n && depth > 0) {
            var c = src[j], d = src[j + 1];
            if (c === "\\") { j += 2; continue; }
            if (c === '"' || c === "'") {
                j++;
                while (j < n) {
                    if (src[j] === "\\") { j += 2; continue; }
                    if (src[j] === c) { j++; break; }
                    j++;
                }
                continue;
            }
            if (c === "`") {
                var r = scanTemplate(src, j, minifyExpr);
                j = r.end;
                continue;
            }
            if (c === "/" && d === "/") {
                while (j < n && src[j] !== "\n") { j++; }
                continue;
            }
            if (c === "/" && d === "*") {
                var e = src.indexOf("*/", j + 2);
                j = e === -1 ? n : e + 2;
                continue;
            }
            if (c === "{") { depth++; }
            else if (c === "}") { depth--; }
            j++;
        }
        return j;
    }

    function tokenizeJS(src) {
        // Hashbang 行直接丢弃（#!/usr/bin/env node）
        if (src.charCodeAt(0) === 35 && src.charCodeAt(1) === 33) {
            var nl = src.indexOf("\n");
            src = nl === -1 ? "" : src.slice(nl + 1);
        }
        var tokens = [];
        var i = 0, n = src.length;
        while (i < n) {
            var c = src[i], d = src[i + 1];
            if (c === "/" && d === "/") {
                var j = i + 2;
                while (j < n && src[j] !== "\n") { j++; }
                tokens.push({ t: "ws", nl: true });
                i = j;
                continue;
            }
            if (c === "/" && d === "*") {
                var e = src.indexOf("*/", i + 2);
                var end = e === -1 ? n : e + 2;
                tokens.push({ t: "ws", nl: src.slice(i, end).indexOf("\n") !== -1 });
                i = end;
                continue;
            }
            // HTML 注释 hack <!-- 按行注释处理，避免强压缩成一行后吞掉后半段
            if (c === "<" && d === "!" && src[i + 2] === "-" && src[i + 3] === "-") {
                var k = i + 4;
                while (k < n && src[k] !== "\n") { k++; }
                tokens.push({ t: "ws", nl: true });
                i = k;
                continue;
            }
            if (c === '"' || c === "'") {
                var m = i + 1;
                while (m < n) {
                    if (src[m] === "\\") { m += 2; continue; }
                    if (src[m] === c) { m++; break; }
                    m++;
                }
                tokens.push({ t: "str", v: src.slice(i, m) });
                i = m;
                continue;
            }
            if (c === "`") {
                var r = scanTemplate(src, i, function (expr) { return minifyJS(expr, !!tokenizeJS.strongMode); });
                tokens.push({ t: "str", v: r.text });
                i = r.end;
                continue;
            }
            if (c === "/" && d !== "/" && d !== "*") {
                if (canBeRegex(tokens)) {
                    var rx = scanRegex(src, i);
                    if (rx) {
                        tokens.push({ t: "str", v: rx.text });
                        i = rx.end;
                        continue;
                    }
                }
                tokens.push({ t: "ch", v: "/" });
                i++;
                continue;
            }
            if (c === " " || c === "\t" || c === "\n" || c === "\r" || c === "\f" || c === "\v" || c === " ") {
                var p = i, hasNl = false;
                while (p < n && /\s/.test(src[p])) { if (src[p] === "\n") { hasNl = true; } p++; }
                tokens.push({ t: "ws", nl: hasNl });
                i = p;
                continue;
            }
            tokens.push({ t: "ch", v: c });
            i++;
        }
        return tokens;
    }

    // ================= JS 空白决策 =================
    var RESTRICTED_WORDS = { "return": 1, "throw": 1, "break": 1, "continue": 1, "yield": 1, "debugger": 1 };
    // 声明关键字：其后空白在任何情况下都必须保留至少一个空格（import{/export{/from"m"/export default function 等）
    var DECL_SPACE_AFTER = { "var": 1, "let": 1, "const": 1, "function": 1, "class": 1, "extends": 1, "import": 1, "export": 1, "default": 1, "static": 1 };
    var UNARY_PREFIX_WORDS = { "typeof": 1, "void": 1, "delete": 1, "new": 1, "await": 1 };
    var BINARY_MID_WORDS = { "in": 1, "instanceof": 1, "of": 1 };
    var ELSE_WORDS = { "else": 1, "catch": 1, "finally": 1 };
    var BLOCK_OPEN_WORDS = { "do": 1, "else": 1, "try": 1, "finally": 1 };
    var STMT_OPEN_WORDS = { "else": 1, "do": 1, "try": 1, "finally": 1 };

    // 词 tokens[以 endIdx 结尾] 是否紧跟在 "." 之后（成员访问 a.var / a.static）
    function wordPrecededByDot(tokens, endIdx, word) {
        var j = endIdx - word.length;
        while (j >= 0 && tokens[j].t === "ws") { j--; }
        return j >= 0 && tokens[j].t === "ch" && tokens[j].v === ".";
    }

    // 位置 i 的空白是否处于 import/export 语句内（具名 {} 内，或 from 子句），
    // 用于 as/from 前后留空格；普通标识符的 ASI 换行不受影响
    function inImportExport(tokens, i) {
        var depth = 0;
        for (var j = i - 1; j >= 0; j--) {
            var t = tokens[j];
            if (t.t === "ws" || t.t === "str") { continue; }
            var v = t.v;
            if (v === "}" || v === ")" || v === "]") { depth++; continue; }
            if (v === "{" || v === "(" || v === "[") {
                if (depth > 0) { depth--; continue; }
                // 顶层 {：前面是 import/export 才是具名导入/导出的括号
                var k = j - 1;
                while (k >= 0 && tokens[k].t === "ws") { k--; }
                if (k >= 0 && tokens[k].t === "ch" && isWordChar(tokens[k].v)) {
                    var w = wordEndingAt(tokens, k);
                    if (w === "import" || w === "export") { return true; }
                }
                return false;
            }
            if (v === ";" && depth === 0) { return false; }
        }
        // 文件开头：看首个有效词
        for (var m = 0; m < tokens.length; m++) {
            var tm = tokens[m];
            if (tm.t === "ws") { continue; }
            if (tm.t === "ch" && isWordChar(tm.v)) {
                var w0 = wordStartingAt(tokens, m);
                return w0 === "import" || w0 === "export";
            }
            return false;
        }
        return false;
    }

    // 把某处空白替换成 "" / " " / ";"（强压缩模式，含换行）
    function decideStrong(tokens, i) {
        var pi = prevSigIdx(tokens, i), ni = nextSigIdx(tokens, i);
        if (pi < 0 || ni < 0) { return ""; }
        var pt = tokens[pi], nt = tokens[ni];
        var pc = lastChar(pt), nc = firstChar(nt);
        var pcW = isWordChar(pc), ncW = isWordChar(nc);
        var pw = pcW && pt.t === "ch" ? wordEndingAt(tokens, pi) : "";
        var nw = ncW && nt.t === "ch" ? wordStartingAt(tokens, ni) : "";

        // 是否为后缀 ++ / --（如 x--）：此时表达式已结束，不能按"延续型标点"处理
        var isIncDec = (pc === "+" || pc === "-") && pi >= 1 &&
            tokens[pi - 1].t === "ch" && tokens[pi - 1].v === pc;

        // 防危险合并：避免凭空造出 ++ -- // /* */ <!
        function safeJoin(rep) {
            if (rep === "" && (
                (pc === "+" && nc === "+") || (pc === "-" && nc === "-") ||
                (pc === "/" && (nc === "/" || nc === "*")) ||
                (pc === "*" && nc === "/") || (pc === "<" && nc === "!"))) {
                return " ";
            }
            return rep;
        }

        // 0a) 声明关键字后换行：var/let/const/function/class/extends/import/export/static 之后必须留空格
        //     （成员访问 a.var / a.static 排除：词前面是 . 时走正常 ASI 规则）
        if (pw && DECL_SPACE_AFTER[pw] && (ncW || nc === "(" || nc === "*" || nc === "{" || nc === "[" || nt.t === "str") &&
            !wordPrecededByDot(tokens, pi, pw)) { return " "; }
        // 0b) async 特殊处理：async function / async() / async *gen / async x=>x 必须留空格，其余才按 ASI 打分号
        if (pw === "async") {
            if (nw === "function" || nc === "(" || nc === "*") { return " "; }
            if (ncW) {
                var ei = ni + nw.length - 1, a = nextSigIdx(tokens, ei), b = a >= 0 ? nextSigIdx(tokens, a) : -1;
                if (a >= 0 && b >= 0 && tokens[a].v === "=" && tokens[b].v === ">") { return " "; }
            }
            return ";";
        }
        // 1) 受限产生式：return/throw/break/continue/yield 后换行 = ASI，用分号等价还原
        if (pw && RESTRICTED_WORDS[pw]) { return ";"; }
        // 2) else/catch/finally 前必须留空格
        if (nw && ELSE_WORDS[nw]) { return " "; }
        // 2b) import/export 语句内 as/from 前后留空格：x as y / from "m"；
        //     仅限 import/export 语句上下文，普通标识符换行（如 foo\nfrom）仍走 ASI
        if ((nw === "as" || nw === "from" || pw === "as" || pw === "from") && inImportExport(tokens, i)) { return " "; }
        // 2c) 对象 getter/setter：get\nx(){} / set\nx(v){} 必须留空格
        if ((pw === "get" || pw === "set") && ncW) {
            var nwEnd = ni + nw.length - 1, afterW = nextSigIdx(tokens, nwEnd);
            if (afterW >= 0 && tokens[afterW].t === "ch" && tokens[afterW].v === "(") { return " "; }
        }
        // 2d) do/else/try/finally 后直接跟语句：留空格
        if (pw && STMT_OPEN_WORDS[pw]) { return " "; }

        // 3) 下一个是 {
        if (nc === "{") {
            if (pc === "}" || pc === ")" || pc === "]") { return " "; }
            if (pcW) {
                if (BLOCK_OPEN_WORDS[pw]) { return " "; }
                var start = pi - pw.length + 1;
                var ppw = wordEndingAt(tokens, start - 1);
                if (ppw === "class" || ppw === "function" || ppw === "extends") { return " "; }
                // function* 名字 / class 继承链等：* 号兜底
                if (start - 1 >= 0 && tokens[start - 1].t === "ch" && tokens[start - 1].v === "*") { return " "; }
                return ";";
            }
            return safeJoin("");
        }

        // 4) 下一个是明确的"表达式内"标点：直接连上
        if (",;:)}].=?".indexOf(nc) !== -1) { return safeJoin(""); }

        // 5) 前一个是延续型标点：表达式未完，直接连上
        if (!isIncDec && "([{;,=:+-*/%&|^?:<>.!~".indexOf(pc) !== -1) { return safeJoin(""); }

        // 6) 表达式结束位（标识符/字符串/数字/) ] } / 后缀++/--）
        var exprEnd = pcW || pc === ")" || pc === "]" || pc === "}" || pt.t === "str" || isIncDec;
        if (exprEnd) {
            if (pc === "}") {
                if (nw === "while") { return " "; } // do{}while()
                // 其余走下方通用分支（}; / }else 已在步骤2处理）
            }
            if (pw && (UNARY_PREFIX_WORDS[pw] || BINARY_MID_WORDS[pw])) { return " "; }  // typeof\nx / instanceof\nB
            if (nw && BINARY_MID_WORDS[nw]) { return " "; }   // a\nin b
            if (nc === "(" || nc === "[" || nc === "`") {
                if (isIncDec) { return ";"; }                 // x++\n(y) -> x++;(y)
                return safeJoin("");
            }
            if (nc === "+" || nc === "-") {
                var adj = tokens[ni + 1];
                if (adj && adj.t === "ch" && adj.v === nc) { return ";"; } // x\n++i -> x;++i（紧邻才算 ++/--）
                return safeJoin("");                                       // a\n+b -> a+b
            }
            if ("*/%".indexOf(nc) !== -1) { return safeJoin(""); }
            if (nc === "/") { return safeJoin(""); }           // a\n/b -> a/b（除法延续）
            if ("&|^".indexOf(nc) !== -1) { return safeJoin(""); }
            if (nc === "<") { return safeJoin(""); }           // a\n<b -> a<b
            if (nc === "!" || nc === "~") { return ";"; }       // a\n!b -> a;!b
            return ";";                                        // a\nb -> a;b
        }

        // 7) 兜底：其他情况（极少）用分号分隔，保证不断句
        return ";";
    }

    // 轻压缩 / 行内空白：只在必须分隔时留一个空格
    function decideFlat(tokens, i) {
        var pi = prevSigIdx(tokens, i), ni = nextSigIdx(tokens, i);
        if (pi < 0 || ni < 0) { return ""; }
        var pc = lastChar(tokens[pi]), nc = firstChar(tokens[ni]);
        var pcW = isWordChar(pc), ncW = isWordChar(nc);
        if (pcW && ncW) { return " "; }
        var pw = pcW && tokens[pi].t === "ch" ? wordEndingAt(tokens, pi) : "";
        // 声明关键字后必须留空格：import{ / export{ / function( / let[ / import"m"（成员访问 a.var 排除）
        if (pw && DECL_SPACE_AFTER[pw] && (nc === "(" || nc === "*" || nc === "{" || nc === "[" || tokens[ni].t === "str") &&
            !wordPrecededByDot(tokens, pi, pw)) { return " "; }
        // import/export 语句内 from 后跟字符串：from"m" 必须留空格
        if (pw === "from" && tokens[ni].t === "str" && inImportExport(tokens, i)) { return " "; }
        if ((pc === "+" && nc === "+") || (pc === "-" && nc === "-") ||
            (pc === "/" && (nc === "/" || nc === "*")) ||
            (pc === "*" && nc === "/") || (pc === "<" && nc === "!")) {
            return " ";
        }
        return "";
    }

    function minifyJS(src, strong) {
        var prevMode = tokenizeJS.strongMode;
        tokenizeJS.strongMode = !!strong;
        var tokens = tokenizeJS(src);
        tokenizeJS.strongMode = prevMode;
        var out = [];
        var lastWasNl = false;
        for (var i = 0; i < tokens.length; i++) {
            var t = tokens[i];
            if (t.t !== "ws") {
                out.push(t.v);
                lastWasNl = false;
                continue;
            }
            var rep;
            if (strong) {
                rep = t.nl ? decideStrong(tokens, i) : decideFlat(tokens, i);
                out.push(rep);
                lastWasNl = false;
            } else {
                if (t.nl) {
                    if (!lastWasNl && out.length > 0) { out.push("\n"); }
                    lastWasNl = true;
                } else {
                    rep = decideFlat(tokens, i);
                    if (rep) { out.push(rep); }
                    lastWasNl = false;
                }
            }
        }
        var s = out.join("");
        if (strong) { return s.replace(/^\s+|\s+$/g, ""); }
        return s.replace(/^\n+|\n+$/g, "").replace(/[ \t]+\n/g, "\n");
    }

    // ================= CSS 分词器 =================
    function tokenizeCSS(src) {
        var tokens = [];
        var i = 0, n = src.length;
        while (i < n) {
            var c = src[i], d = src[i + 1];
            if (c === "/" && d === "*") {
                var e = src.indexOf("*/", i + 2);
                i = e === -1 ? n : e + 2;
                tokens.push({ t: "ws", nl: false });
                continue;
            }
            if (c === '"' || c === "'") {
                var m = i + 1;
                while (m < n) {
                    if (src[m] === "\\") { m += 2; continue; }
                    if (src[m] === c) { m++; break; }
                    m++;
                }
                tokens.push({ t: "str", v: src.slice(i, m) });
                i = m;
                continue;
            }
            if (c === " " || c === "\t" || c === "\n" || c === "\r" || c === "\f" || c === "\v" || c === " ") {
                var p = i;
                while (p < n && /\s/.test(src[p])) { p++; }
                tokens.push({ t: "ws", nl: false });
                i = p;
                continue;
            }
            tokens.push({ t: "ch", v: c });
            i++;
        }
        return tokens;
    }

    var CSS_DROP = "{};:>,+~()[]=!";
    function decideCSS(tokens, i) {
        var pi = prevSigIdx(tokens, i), ni = nextSigIdx(tokens, i);
        if (pi < 0 || ni < 0) { return ""; }
        var pc = lastChar(tokens[pi]), nc = firstChar(tokens[ni]);
        // 例外1：媒体查询 and (/or (/not ( 后必须留空格
        if (nc === "(" && (isWordChar(pc) || pc === ")" || pc === "]")) { return " "; }
        // 例外2：) 后跟选择器类成分，留空格更稳妥
        if (pc === ")" && (isWordChar(nc) || nc === "." || nc === "#" || nc === ":" || nc === "[")) { return " "; }
        if (CSS_DROP.indexOf(pc) !== -1 || CSS_DROP.indexOf(nc) !== -1) { return ""; }
        return " ";
    }

    // 只对"代码段"做变换，字符串原子原样保留
    function transformCSSCode(s) {
        // 颜色简写：#ffffff -> #fff（6 位且两两相同才压）
        s = s.replace(/#([0-9a-fA-F]{6})(?![0-9a-fA-F])/g, function (m, h) {
            var l = h.toLowerCase();
            if (l.charAt(0) === l.charAt(1) && l.charAt(2) === l.charAt(3) && l.charAt(4) === l.charAt(5)) {
                return "#" + l.charAt(0) + l.charAt(2) + l.charAt(4);
            }
            return m;
        });
        // 零值去单位：0px -> 0（排除 10px / 0.5px 这类）
        s = s.replace(/(^|[^\d.])0(?:px|em|rem|ex|ch|vw|vh|vmin|vmax|cm|mm|q|in|pt|pc|deg|grad|rad|turn|s|ms|%)(?![\w%])/g, "$10");
        // 去掉 } 前多余的分号
        s = s.replace(/;}/g, "}");
        return s;
    }

    function minifyCSS(src) {
        var tokens = tokenizeCSS(src);
        var segs = [];
        var buf = "";
        function flush() { if (buf) { segs.push(buf); buf = ""; } }
        for (var i = 0; i < tokens.length; i++) {
            var t = tokens[i];
            if (t.t === "str") { flush(); segs.push({ q: t.v }); }
            else if (t.t === "ws") { buf += decideCSS(tokens, i); }
            else { buf += t.v; }
        }
        flush();
        return segs.map(function (s) {
            return typeof s === "string" ? transformCSSCode(s) : s.q;
        }).join("");
    }

    // ================= 类型自动识别 =================
    function detectType(src) {
        var s = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
        if (/^\s*@(media|import|font-face|keyframes|supports)/m.test(s)) { return "css"; }
        var bi = s.indexOf("{");
        if (bi !== -1) {
            var head = s.slice(0, bi);
            if (/[.#:>\[]/.test(head) && !/[=();]/.test(head)) { return "css"; }
            // 纯元素选择器：div p / ul li a（排除 do/else/try 等 JS 关键字开块）
            var htrim = head.trim();
            if (!/^(do|else|try|finally|if|for|while|with|switch|catch|function|class)$/.test(htrim) &&
                /^\s*[a-zA-Z*][\w-]*(\s+[a-zA-Z*][\w-]*)*\s*$/.test(head)) { return "css"; }
        }
        return "js";
    }

    // ================= UI =================
    var inputEl = document.getElementById("cm-input");
    var outputEl = document.getElementById("cm-output");
    var typeBadge = document.getElementById("cm-type-badge");
    var modeRow = document.getElementById("cm-mode-row");
    var cssNote = document.getElementById("cm-css-note");
    var statOrig = document.getElementById("cm-stat-orig");
    var statMin = document.getElementById("cm-stat-min");
    var statRatio = document.getElementById("cm-stat-ratio");
    var statSaved = document.getElementById("cm-stat-saved");
    var typeTabs = Array.prototype.slice.call(document.querySelectorAll(".cm-type-tab"));
    var modeRadios = Array.prototype.slice.call(document.querySelectorAll("input[name='cm-mode']"));

    var state = { type: "auto", mode: "strong", lastOutput: "", lastType: "js" };

    var SAMPLE_JS = [
        "// 单行注释：计算斐波那契数列（会被移除）",
        "function fibonacci(n) {",
        "    /* 多行注释：",
        "       递归改迭代，效率更高（会被移除） */",
        "    if (n <= 1) {",
        "        return n;  // 边界条件",
        "    }",
        "    var a = 0;",
        "    var b = 1;",
        "    for (var i = 2; i <= n; i++) {",
        "        var temp = a + b;",
        "        a = b;",
        "        b = temp;",
        "    }",
        "    return b;",
        "}",
        "",
        "// 字符串和正则里的 // 与 /* */ 不是注释，不会被误删",
        "var re = /\\/\\/[^\\n]*/g;",
        "var s = \"字符串里的 // 不是注释 /* 也不是 */\";",
        "var tpl = `模板字符串保留换行",
        "第二行还在`;",
        "console.log(fibonacci(10), re, s, tpl);",
        ""
    ].join("\n");

    var SAMPLE_CSS = [
        "/* 页面主样式：注释会被移除 */",
        "body {",
        "    margin: 0px;",
        "    padding: 0px;",
        "    background-color: #ffffff;",
        "    color: #333333;",
        "}",
        "",
        "div p {",
        "    /* 后代选择器的空格必须保留 */",
        "    font-size: 16px;",
        "    border: 1px solid #ff0000;",
        "    margin: 10px 0px 5px 0px;",
        "}",
        "",
        ".btn:hover {",
        "    background: #00ff00;",
        "    box-shadow: 0px 2px 4px rgba(0, 0, 0, 0.2);",
        "}",
        ""
    ].join("\n");

    function currentType(src) {
        if (state.type === "auto") { return detectType(src); }
        return state.type;
    }

    function run() {
        var src = inputEl.value;
        if (!src.trim()) {
            outputEl.innerHTML = "<span class=\"cm-empty\">请在左侧输入要压缩的代码…</span>";
            typeBadge.textContent = "";
            statOrig.textContent = "—";
            statMin.textContent = "—";
            statRatio.textContent = "—";
            statSaved.textContent = "—";
            state.lastOutput = "";
            return;
        }
        var type = currentType(src);
        state.lastType = type;
        var out;
        try {
            out = type === "css" ? minifyCSS(src) : minifyJS(src, state.mode === "strong");
        } catch (e) {
            outputEl.innerHTML = "<span class=\"cm-error\">压缩时出错：" + escapeHtml(String(e && e.message || e)) + "。请检查输入代码是否完整。</span>";
            state.lastOutput = "";
            return;
        }
        state.lastOutput = out;
        outputEl.textContent = out;
        typeBadge.textContent = type === "css" ? "识别为 CSS" : "识别为 JavaScript";
        modeRow.style.display = type === "css" ? "none" : "";
        cssNote.style.display = type === "css" ? "" : "none";

        var ob = byteLen(src), nb = byteLen(out);
        var saved = ob - nb;
        var ratio = ob > 0 ? (saved / ob * 100) : 0;
        statOrig.textContent = fmtBytes(ob);
        statMin.textContent = fmtBytes(nb);
        statRatio.textContent = ratio.toFixed(1) + "%";
        statSaved.textContent = fmtBytes(saved);
        statRatio.className = "cm-stat-val " + (ratio >= 20 ? "good" : ratio > 0 ? "ok" : "none");
    }

    function escapeHtml(s) {
        return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    function copyText(t, okMsg) {
        if (!t) { toast("没有可复制的内容，请先输入代码"); return; }
        function done() { toast(okMsg || "已复制到剪贴板"); }
        function fail() { toast("复制失败，请手动复制"); }
        if (navigator.clipboard && window.isSecureContext !== false) {
            navigator.clipboard.writeText(t).then(done, function () { fallbackCopy(t, done, fail); });
        } else {
            fallbackCopy(t, done, fail);
        }
    }
    function fallbackCopy(t, done, fail) {
        var ta = document.createElement("textarea");
        ta.value = t;
        ta.style.cssText = "position:fixed;opacity:0;";
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand("copy") ? done() : fail(); }
        catch (e) { fail(); }
        document.body.removeChild(ta);
    }

    // ---------- 事件 ----------
    var timer = null;
    inputEl.addEventListener("input", function () {
        if (timer) { clearTimeout(timer); }
        timer = setTimeout(run, 150);
    });

    typeTabs.forEach(function (tab) {
        tab.addEventListener("click", function () {
            typeTabs.forEach(function (x) { x.classList.remove("active"); });
            tab.classList.add("active");
            state.type = tab.getAttribute("data-type");
            run();
        });
    });

    modeRadios.forEach(function (r) {
        r.addEventListener("change", function () {
            state.mode = document.querySelector("input[name='cm-mode']:checked").value;
            run();
        });
    });

    document.getElementById("cm-sample-js").addEventListener("click", function () {
        setActiveType("js");
        inputEl.value = SAMPLE_JS;
        run();
        toast("已载入 JavaScript 示例");
    });
    document.getElementById("cm-sample-css").addEventListener("click", function () {
        setActiveType("css");
        inputEl.value = SAMPLE_CSS;
        run();
        toast("已载入 CSS 示例");
    });
    document.getElementById("cm-clear").addEventListener("click", function () {
        inputEl.value = "";
        run();
        toast("已清空");
    });
    document.getElementById("cm-copy").addEventListener("click", function () {
        copyText(state.lastOutput, "压缩结果已复制");
    });
    document.getElementById("cm-download").addEventListener("click", function () {
        var text = state.lastOutput;
        if (!text) { toast("没有可下载的内容，请先输入代码"); return; }
        var filename = state.lastType === "css" ? "style.min.css" : "code.min.js";
        var blob = new Blob([text], { type: "text/plain;charset=utf-8" });
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(function () {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
        toast(filename + " 已开始下载");
    });

    function setActiveType(t) {
        state.type = t;
        typeTabs.forEach(function (x) { x.classList.toggle("active", x.getAttribute("data-type") === t); });
    }

    // 供自动化测试复用（不污染全局命名空间以外的其他内容）
    window.__codeMinifier = { minifyJS: minifyJS, minifyCSS: minifyCSS, detectType: detectType, byteLen: byteLen };

    run();
})();
