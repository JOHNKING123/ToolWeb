/* JSON Schema 验证器 - 纯前端：自研 draft-07 核心子集校验引擎 + 行列定位 + 实时校验防抖
   零依赖、零 CDN、零后端调用。支持关键字：
   type / properties / required / items / enum / pattern / minLength / maxLength /
   minimum / maximum / exclusiveMinimum / exclusiveMaximum / format / $ref(本地) */
(function () {
    'use strict';

    var $ = function (id) { return document.getElementById(id); };

    var DEBOUNCE_MS = 300;

    /* ============ 带行列定位的 JSON 解析器 ============ */

    // 解析成功返回 { data, locs }，locs: path -> {line, col, keyLine, keyCol}
    // 语法错误时抛出 { message, line, col }
    function parseJSONWithLoc(text) {
        var i = 0, n = text.length, line = 1, col = 1;
        var locs = {};

        function fail(msg) {
            var e = new Error(msg);
            e.isSyntaxError = true;
            e.line = line;
            e.col = col;
            throw e;
        }
        function ch() { return i < n ? text.charAt(i) : ''; }
        function advance() {
            var c = text.charAt(i);
            i++;
            if (c === '\n') { line++; col = 1; }
            else if (c === '\r') {
                if (text.charAt(i) === '\n') i++;
                line++; col = 1;
            } else { col++; }
            return c;
        }
        function skipWs() {
            while (i < n) {
                var c = ch();
                if (c === ' ' || c === '\t' || c === '\n' || c === '\r') advance();
                else break;
            }
        }
        function expect(c) {
            if (ch() !== c) fail('此处应为 "' + c + '"');
            advance();
        }

        function parseString() {
            // 调用时 ch() === '"'
            var startLine = line, startCol = col;
            advance(); // opening quote
            var out = '';
            while (i < n) {
                var c = ch();
                if (c === '"') { advance(); return { value: out, line: startLine, col: startCol }; }
                if (c === '\\') {
                    advance();
                    var e = ch();
                    if (e === '"') out += '"';
                    else if (e === '\\') out += '\\';
                    else if (e === '/') out += '/';
                    else if (e === 'b') out += '\b';
                    else if (e === 'f') out += '\f';
                    else if (e === 'n') out += '\n';
                    else if (e === 'r') out += '\r';
                    else if (e === 't') out += '\t';
                    else if (e === 'u') {
                        var hex = text.substr(i + 1, 4);
                        if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail('无效的 \\u 转义');
                        out += String.fromCharCode(parseInt(hex, 16));
                        for (var k = 0; k < 4; k++) advance();
                    } else fail('无效的转义字符 "\\' + e + '"');
                    advance();
                } else if (c === '\n' || c === '\r') {
                    fail('字符串内出现未转义的换行');
                } else if (c < ' ') {
                    fail('字符串内出现未转义的控制字符');
                } else {
                    out += c;
                    advance();
                }
            }
            fail('字符串未闭合');
            return null;
        }

        function parseNumber() {
            var startLine = line, startCol = col;
            var start = i;
            if (ch() === '-') advance();
            if (ch() === '0') advance();
            else if (ch() >= '1' && ch() <= '9') { while (ch() >= '0' && ch() <= '9') advance(); }
            else fail('无效的数字');
            if (ch() === '.') {
                advance();
                if (!(ch() >= '0' && ch() <= '9')) fail('小数点后缺少数字');
                while (ch() >= '0' && ch() <= '9') advance();
            }
            if (ch() === 'e' || ch() === 'E') {
                advance();
                if (ch() === '+' || ch() === '-') advance();
                if (!(ch() >= '0' && ch() <= '9')) fail('指数部分缺少数字');
                while (ch() >= '0' && ch() <= '9') advance();
            }
            var raw = text.substring(start, i);
            var val = Number(raw);
            if (!isFinite(val)) fail('数字超出范围');
            return { value: val, line: startLine, col: startCol };
        }

        function parseLiteral(word, value) {
            var startLine = line, startCol = col;
            if (text.substr(i, word.length) !== word) fail('无效的 JSON 值');
            for (var k = 0; k < word.length; k++) advance();
            return { value: value, line: startLine, col: startCol };
        }

        function escKey(key) {
            // JSON Path 片段：合法标识符用点记法，否则用 ["..."] 记法
            if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)) return '.' + key;
            return '[' + JSON.stringify(key) + ']';
        }

        function parseValueWrapped(path) {
            skipWs();
            var c = ch();
            var startLine = line, startCol = col;
            if (c === '{' || c === '[') {
                var isObj = c === '{';
                advance();
                var cont = isObj ? {} : [];
                locs[path] = { line: startLine, col: startCol };
                skipWs();
                var closer = isObj ? '}' : ']';
                if (ch() === closer) { advance(); return wrap(cont, startLine, startCol); }
                var idx2 = 0;
                while (true) {
                    var cp;
                    var keyStr = null, keyLine = 0, keyCol = 0;
                    if (isObj) {
                        skipWs();
                        if (ch() !== '"') fail('对象属性名必须是字符串');
                        var ks2 = parseString();
                        keyStr = ks2.value; keyLine = ks2.line; keyCol = ks2.col;
                        skipWs();
                        expect(':');
                        cp = path + escKey(keyStr);
                    } else {
                        cp = path + '[' + idx2 + ']';
                    }
                    var vw = parseValueWrapped(cp);
                    locs[cp] = { line: vw._line, col: vw._col, keyLine: keyLine || undefined, keyCol: keyCol || undefined };
                    if (isObj) cont[keyStr] = vw._data;
                    else { cont.push(vw._data); idx2++; }
                    skipWs();
                    if (ch() === ',') { advance(); continue; }
                    if (ch() === closer) { advance(); break; }
                    fail(isObj ? '对象中应为 "," 或 "}"' : '数组中应为 "," 或 "]"');
                }
                return wrap(cont, startLine, startCol);
            }
            if (c === '"') {
                var rs = parseString();
                locs[path] = { line: rs.line, col: rs.col };
                return wrap(rs.value, rs.line, rs.col);
            }
            if (c === '-' || (c >= '0' && c <= '9')) {
                var rn = parseNumber();
                locs[path] = { line: rn.line, col: rn.col };
                return wrap(rn.value, rn.line, rn.col);
            }
            if (c === 't') { var rt = parseLiteral('true', true); locs[path] = { line: rt.line, col: rt.col }; return wrap(rt.value, rt.line, rt.col); }
            if (c === 'f') { var rf = parseLiteral('false', false); locs[path] = { line: rf.line, col: rf.col }; return wrap(rf.value, rf.line, rf.col); }
            if (c === 'n') { var rn2 = parseLiteral('null', null); locs[path] = { line: rn2.line, col: rn2.col }; return wrap(rn2.value, rn2.line, rn2.col); }
            if (c === '') fail('JSON 输入为空或意外结束');
            fail('无效的 JSON 值');
            return null;
        }

        function wrap(data, l, c) { return { _data: data, _line: l, _col: c }; }

        skipWs();
        if (i >= n) fail('JSON 输入为空');
        var root = parseValueWrapped('$');
        locs['$'] = { line: root._line, col: root._col };
        skipWs();
        if (i < n) fail('JSON 文本结束后有多余字符');
        return { data: root._data, locs: locs };
    }

    /* ============ draft-07 核心子集校验引擎 ============ */

    var TYPE_NAMES = {
        string: '字符串', number: '数字', integer: '整数', boolean: '布尔值',
        object: '对象', array: '数组', 'null': 'null'
    };

    function actualType(v) {
        if (v === null) return 'null';
        if (Array.isArray(v)) return 'array';
        var t = typeof v;
        if (t === 'number') return 'number';
        if (t === 'string') return 'string';
        if (t === 'boolean') return 'boolean';
        if (t === 'object') return 'object';
        return t;
    }

    function checkType(v, type) {
        if (type === 'integer') return typeof v === 'number' && isFinite(v) && Math.floor(v) === v;
        if (type === 'number') return typeof v === 'number' && isFinite(v);
        if (type === 'string') return typeof v === 'string';
        if (type === 'boolean') return typeof v === 'boolean';
        if (type === 'object') return v !== null && typeof v === 'object' && !Array.isArray(v);
        if (type === 'array') return Array.isArray(v);
        if (type === 'null') return v === null;
        return false;
    }

    function deepEqual(a, b) {
        if (a === b) return true;
        if (typeof a === 'number' && typeof b === 'number' && isNaN(a) && isNaN(b)) return true;
        if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
        if (Array.isArray(a) !== Array.isArray(b)) return false;
        if (Array.isArray(a)) {
            if (a.length !== b.length) return false;
            for (var i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
            return true;
        }
        var ka = Object.keys(a), kb = Object.keys(b);
        if (ka.length !== kb.length) return false;
        for (var j = 0; j < ka.length; j++) {
            if (!Object.prototype.hasOwnProperty.call(b, ka[j])) return false;
            if (!deepEqual(a[ka[j]], b[ka[j]])) return false;
        }
        return true;
    }

    function shortVal(v) {
        var s;
        try { s = JSON.stringify(v); } catch (e) { s = String(v); }
        if (s === undefined) s = String(v);
        if (s.length > 60) s = s.slice(0, 57) + '...';
        return s;
    }

    // format 校验器（draft-07 常用格式）
    var FORMAT_CHECKERS = {
        'date': function (v) {
            var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
            if (!m) return false;
            var y = +m[1], mo = +m[2], d = +m[3];
            if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
            var dt = new Date(Date.UTC(y, mo - 1, d));
            return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
        },
        'time': function (v) {
            return /^([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d+)?(Z|[+-]([01]\d|2[0-3]):[0-5]\d)?$/.test(v);
        },
        'date-time': function (v) {
            var m = /^(\d{4})-(\d{2})-(\d{2})[Tt ]([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(\.\d+)?([Zz]|[+-]([01]\d|2[0-3]):[0-5]\d)?$/.exec(v);
            if (!m) return false;
            if (!FORMAT_CHECKERS['date'](m[1] + '-' + m[2] + '-' + m[3])) return false;
            return true;
        },
        'email': function (v) {
            return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
        },
        'uri': function (v) {
            return /^[a-zA-Z][a-zA-Z0-9+.-]*:[^\s]*$/.test(v);
        },
        'url': function (v) {
            return /^(https?|ftp):\/\/[^\s/$.?#].[^\s]*$/i.test(v);
        },
        'hostname': function (v) {
            if (v.length > 253) return false;
            return /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(v);
        },
        'ipv4': function (v) {
            var m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(v);
            if (!m) return false;
            for (var i = 1; i <= 4; i++) if (+m[i] > 255) return false;
            return true;
        },
        'ipv6': function (v) {
            return /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|::([0-9a-fA-F]{1,4}:){0,6}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4})$/.test(v);
        },
        'uuid': function (v) {
            return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(v);
        }
    };
    var FORMAT_NAMES = {
        'date': '日期（YYYY-MM-DD）', 'time': '时间（HH:mm:ss）', 'date-time': '日期时间（ISO 8601）',
        'email': '电子邮箱', 'uri': 'URI', 'url': 'URL', 'hostname': '主机名',
        'ipv4': 'IPv4 地址', 'ipv6': 'IPv6 地址', 'uuid': 'UUID'
    };

    // 本地 $ref 解析：仅支持指向根 schema 的 JSON Pointer（#/a/b）
    function resolveRef(root, ref) {
        if (typeof ref !== 'string' || ref.charAt(0) !== '#') return { ok: false, reason: '仅支持以 # 开头的本地引用' };
        var ptr = ref.slice(1);
        if (ptr === '') return { ok: true, schema: root };
        var parts = ptr.split('/').slice(1).map(function (p) {
            return decodeURIComponent(p.replace(/~1/g, '/').replace(/~0/g, '~'));
        });
        var cur = root;
        for (var i = 0; i < parts.length; i++) {
            if (cur !== null && typeof cur === 'object' && Object.prototype.hasOwnProperty.call(cur, parts[i])) {
                cur = cur[parts[i]];
            } else {
                return { ok: false, reason: '引用指向不存在：' + ref };
            }
        }
        return { ok: true, schema: cur };
    }

    // 校验入口：返回 { errors: [...], schemaIssues: [...] }
    // error: { path, message, kind: 'instance'|'schema' }
    function validateSchema(instance, schema) {
        var errors = [];
        var schemaIssues = [];
        var refStack = []; // 防 $ref 循环：记录 (ref + path)

        function addError(path, message) { errors.push({ path: path, message: message }); }
        function addSchemaIssue(path, message) { schemaIssues.push({ path: path, message: message }); }

        function validate(value, sch, path) {
            if (sch === true) return;
            if (sch === false) { addError(path, '此处不允许出现任何值（schema 为 false）'); return; }
            if (sch === null || typeof sch !== 'object' || Array.isArray(sch)) {
                addSchemaIssue(path, 'schema 定义无效：应为对象或布尔值');
                return;
            }

            // $ref（本地）
            if (typeof sch.$ref === 'string') {
                var rr = resolveRef(schema, sch.$ref);
                if (!rr.ok) { addSchemaIssue(path, '$ref 解析失败：' + rr.reason); return; }
                var key = sch.$ref + ' @ ' + path;
                if (refStack.indexOf(key) !== -1) return; // 循环引用：跳过防死循环
                refStack.push(key);
                validate(value, rr.schema, path);
                refStack.pop();
                // draft-07 中 $ref 会忽略同级关键字，这里保持纯 $ref 语义
                return;
            }

            // type（支持字符串或数组）
            if (sch.type !== undefined) {
                var types = Array.isArray(sch.type) ? sch.type : [sch.type];
                var ok = false;
                for (var ti = 0; ti < types.length; ti++) {
                    if (checkType(value, types[ti])) { ok = true; break; }
                }
                if (!ok) {
                    var want = types.map(function (t) { return '「' + (TYPE_NAMES[t] || t) + '」'; }).join(' 或 ');
                    var got = TYPE_NAMES[actualType(value)] || actualType(value);
                    addError(path, '类型不匹配：应为' + want + '，实际为「' + got + '」');
                    return; // 类型都不对，后续关键字无意义
                }
            }

            // enum
            if (sch.enum !== undefined) {
                if (!Array.isArray(sch.enum)) {
                    addSchemaIssue(path, 'schema 定义无效：enum 应为数组');
                } else {
                    var found = false;
                    for (var ei = 0; ei < sch.enum.length; ei++) {
                        if (deepEqual(value, sch.enum[ei])) { found = true; break; }
                    }
                    if (!found) addError(path, '值 ' + shortVal(value) + ' 不在允许的枚举值中：' + shortVal(sch.enum));
                }
            }

            // 字符串约束
            if (typeof value === 'string') {
                if (sch.minLength !== undefined && value.length < sch.minLength) {
                    addError(path, '字符串太短：实际长度 ' + value.length + '，至少需要 ' + sch.minLength + ' 个字符');
                }
                if (sch.maxLength !== undefined && value.length > sch.maxLength) {
                    addError(path, '字符串太长：实际长度 ' + value.length + '，最多允许 ' + sch.maxLength + ' 个字符');
                }
                if (sch.pattern !== undefined) {
                    var re = null;
                    try { re = new RegExp(sch.pattern); }
                    catch (e) { addSchemaIssue(path, 'schema 定义无效：pattern 不是合法正则表达式'); }
                    if (re && !re.test(value)) {
                        addError(path, '字符串 ' + shortVal(value) + ' 不符合正则 pattern：/' + sch.pattern + '/');
                    }
                }
                if (sch.format !== undefined && typeof sch.format === 'string') {
                    var checker = FORMAT_CHECKERS[sch.format];
                    if (checker && !checker(value)) {
                        addError(path, '格式不正确：不是有效的' + (FORMAT_NAMES[sch.format] || sch.format));
                    }
                }
            }

            // 数字约束
            if (typeof value === 'number' && isFinite(value)) {
                if (sch.minimum !== undefined) {
                    var exclMin = sch.exclusiveMinimum === true;
                    if (exclMin ? value <= sch.minimum : value < sch.minimum) {
                        addError(path, '数值 ' + value + (exclMin ? ' 应大于 ' : ' 小于最小值 ') + sch.minimum);
                    }
                }
                if (sch.maximum !== undefined) {
                    var exclMax = sch.exclusiveMaximum === true;
                    if (exclMax ? value >= sch.maximum : value > sch.maximum) {
                        addError(path, '数值 ' + value + (exclMax ? ' 应小于 ' : ' 大于最大值 ') + sch.maximum);
                    }
                }
            }

            // 对象约束
            if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
                if (sch.required !== undefined) {
                    if (!Array.isArray(sch.required)) {
                        addSchemaIssue(path, 'schema 定义无效：required 应为数组');
                    } else {
                        for (var ri = 0; ri < sch.required.length; ri++) {
                            var rk = sch.required[ri];
                            if (!Object.prototype.hasOwnProperty.call(value, rk)) {
                                addError(path, '缺少必需的属性「' + rk + '」');
                            }
                        }
                    }
                }
                if (sch.properties !== undefined) {
                    if (sch.properties === null || typeof sch.properties !== 'object' || Array.isArray(sch.properties)) {
                        addSchemaIssue(path, 'schema 定义无效：properties 应为对象');
                    } else {
                        var pkeys = Object.keys(sch.properties);
                        for (var pi = 0; pi < pkeys.length; pi++) {
                            var pk = pkeys[pi];
                            if (Object.prototype.hasOwnProperty.call(value, pk)) {
                                var childPath = path + (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(pk) ? '.' + pk : '[' + JSON.stringify(pk) + ']');
                                validate(value[pk], sch.properties[pk], childPath);
                            }
                        }
                    }
                }
            }

            // 数组约束
            if (Array.isArray(value) && sch.items !== undefined) {
                if (Array.isArray(sch.items)) {
                    // 元组形式
                    for (var ii = 0; ii < sch.items.length && ii < value.length; ii++) {
                        validate(value[ii], sch.items[ii], path + '[' + ii + ']');
                    }
                } else {
                    for (var ai = 0; ai < value.length; ai++) {
                        validate(value[ai], sch.items, path + '[' + ai + ']');
                    }
                }
            }
        }

        validate(instance, schema, '$');
        return { errors: errors, schemaIssues: schemaIssues };
    }

    /* ============ UI ============ */

    var instanceEl, schemaEl, statusEl, errorListEl, errorCountEl, statEl;
    var debounceTimer = null;
    var lastResult = null; // { instLocs, errors }

    // 用户档案示例
    var SAMPLE_SCHEMA = [
        '{',
        '  "$schema": "http://json-schema.org/draft-07/schema#",',
        '  "title": "用户档案",',
        '  "description": "示例：用户注册信息的数据结构约定",',
        '  "type": "object",',
        '  "required": ["username", "email", "age"],',
        '  "properties": {',
        '    "username": {',
        '      "type": "string",',
        '      "minLength": 3,',
        '      "maxLength": 20,',
        '      "pattern": "^[a-zA-Z0-9_\\\\u4e00-\\\\u9fa5]+$",',
        '      "description": "用户名：3-20 位，字母/数字/下划线/中文"',
        '    },',
        '    "email": { "type": "string", "format": "email" },',
        '    "age": { "type": "integer", "minimum": 0, "maximum": 150 },',
        '    "phone": { "type": "string", "pattern": "^1[3-9]\\\\d{9}$" },',
        '    "gender": { "type": "string", "enum": ["男", "女", "保密"] },',
        '    "address": {',
        '      "type": "object",',
        '      "required": ["city"],',
        '      "properties": {',
        '        "city": { "type": "string", "minLength": 1 },',
        '        "district": { "type": "string" },',
        '        "zipcode": { "type": "string", "pattern": "^\\\\d{6}$" }',
        '      }',
        '    },',
        '    "hobbies": {',
        '      "type": "array",',
        '      "items": { "type": "string", "minLength": 1 }',
        '    },',
        '    "homepage": { "type": "string", "format": "uri" },',
        '    "vip": { "type": "boolean" },',
        '    "score": { "type": "number", "minimum": 0, "maximum": 100 }',
        '  }',
        '}'
    ].join('\n');

    var SAMPLE_VALID = [
        '{',
        '  "username": "zhangsan_01",',
        '  "email": "zhangsan@example.com",',
        '  "age": 28,',
        '  "phone": "13800138000",',
        '  "gender": "男",',
        '  "address": {',
        '    "city": "深圳",',
        '    "district": "南山区",',
        '    "zipcode": "518000"',
        '  },',
        '  "hobbies": ["编程", "徒步", "阅读"],',
        '  "homepage": "https://example.com/zhangsan",',
        '  "vip": true,',
        '  "score": 88.5',
        '}'
    ].join('\n');

    var SAMPLE_INVALID = [
        '{',
        '  "username": "ab",',
        '  "email": "not-an-email",',
        '  "age": 200,',
        '  "phone": "12345",',
        '  "gender": "未知",',
        '  "address": {',
        '    "district": "南山区"',
        '  },',
        '  "hobbies": ["编程", 123],',
        '  "homepage": "ht tp:// bad url",',
        '  "vip": "yes",',
        '  "score": -5',
        '}'
    ].join('\n');

    function setStatus(kind, html) {
        // kind: idle | ok | fail | syntax
        statusEl.className = 'jsv-status jsv-' + kind;
        statusEl.innerHTML = html;
    }

    function escapeHtml(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function jumpTo(textarea, line, col) {
        var text = textarea.value;
        var lines = text.split('\n');
        line = Math.max(1, Math.min(line, lines.length));
        var targetLine = lines[line - 1] || '';
        col = Math.max(1, Math.min(col, targetLine.length + 1));
        var offset = 0;
        for (var k = 0; k < line - 1; k++) offset += lines[k].length + 1;
        offset += col - 1;
        textarea.focus();
        try { textarea.setSelectionRange(offset, offset); } catch (e) { /* 忽略 */ }
        var cs = window.getComputedStyle(textarea);
        var lh = parseFloat(cs.lineHeight);
        if (!lh || lh < 8) lh = 21;
        textarea.scrollTop = Math.max(0, (line - 1) * lh - textarea.clientHeight / 2);
        // 短暂高亮提示
        textarea.classList.remove('jsv-flash');
        void textarea.offsetWidth;
        textarea.classList.add('jsv-flash');
    }

    function renderErrors(errors, instLocs) {
        errorListEl.innerHTML = '';
        errorCountEl.textContent = errors.length;
        if (!errors.length) {
            errorListEl.style.display = 'none';
            return;
        }
        errorListEl.style.display = 'block';
        errors.forEach(function (err, idx) {
            var loc = instLocs[err.path];
            var item = document.createElement('button');
            item.type = 'button';
            item.className = 'jsv-error-item';
            var posText = loc ? ('第 ' + loc.line + ' 行第 ' + loc.col + ' 列') : '位置未知';
            item.innerHTML =
                '<span class="jsv-err-no">' + (idx + 1) + '</span>' +
                '<span class="jsv-err-body">' +
                '<code class="jsv-err-path">' + escapeHtml(err.path) + '</code>' +
                '<span class="jsv-err-msg">' + escapeHtml(err.message) + '</span>' +
                '<span class="jsv-err-pos">📍 ' + escapeHtml(posText) + ' · 点击跳转</span>' +
                '</span>';
            item.addEventListener('click', function () {
                if (loc) jumpTo(instanceEl, loc.line, loc.col);
                else { instanceEl.focus(); }
            });
            errorListEl.appendChild(item);
        });
    }

    function markSyntax(el, hasError) {
        if (hasError) el.classList.add('jsv-syntax-err');
        else el.classList.remove('jsv-syntax-err');
    }

    function runValidation() {
        var t0 = (window.performance && performance.now) ? performance.now() : Date.now();
        var instText = instanceEl.value;
        var schemaText = schemaEl.value;

        if (!instText.trim() && !schemaText.trim()) {
            setStatus('idle', '💤 等待输入…在左侧粘贴 <b>JSON 实例</b>，在右侧粘贴 <b>JSON Schema</b>，输入即自动校验。');
            errorListEl.style.display = 'none';
            errorCountEl.textContent = '0';
            markSyntax(instanceEl, false);
            markSyntax(schemaEl, false);
            lastResult = null;
            return;
        }

        // 1) 解析 Schema
        var schemaData, instData, instLocs;
        try {
            schemaData = parseJSONWithLoc(schemaText).data;
            markSyntax(schemaEl, false);
        } catch (e) {
            markSyntax(schemaEl, true);
            markSyntax(instanceEl, false);
            setStatus('syntax', '⛔ <b>Schema JSON 语法错误</b>：第 ' + e.line + ' 行第 ' + e.col + ' 列 — ' + escapeHtml(e.message) + '　<a href="javascript:void(0)" id="jsv-goto-schema">点击跳转</a>');
            var g = $('jsv-goto-schema');
            if (g) g.addEventListener('click', function () { jumpTo(schemaEl, e.line, e.col); });
            errorListEl.style.display = 'none';
            lastResult = null;
            return;
        }

        // 2) 解析实例
        var parsed;
        try {
            parsed = parseJSONWithLoc(instText);
            instData = parsed.data;
            instLocs = parsed.locs;
            markSyntax(instanceEl, false);
        } catch (e) {
            markSyntax(instanceEl, true);
            setStatus('syntax', '⛔ <b>实例 JSON 语法错误</b>：第 ' + e.line + ' 行第 ' + e.col + ' 列 — ' + escapeHtml(e.message) + '　<a href="javascript:void(0)" id="jsv-goto-inst">点击跳转</a>');
            var g2 = $('jsv-goto-inst');
            if (g2) g2.addEventListener('click', function () { jumpTo(instanceEl, e.line, e.col); });
            errorListEl.style.display = 'none';
            lastResult = null;
            return;
        }

        // 3) 校验
        var res = validateSchema(instData, schemaData);
        var t1 = (window.performance && performance.now) ? performance.now() : Date.now();
        var ms = Math.max(1, Math.round(t1 - t0));

        lastResult = { instLocs: instLocs, errors: res.errors };

        if (res.schemaIssues.length) {
            setStatus('syntax', '⚠️ <b>Schema 定义有 ' + res.schemaIssues.length + ' 处问题</b>：' +
                escapeHtml(res.schemaIssues.map(function (x) { return x.path + ' ' + x.message; }).join('；')));
            markSyntax(schemaEl, true);
        } else if (!res.errors.length) {
            setStatus('ok', '✅ <b>校验通过</b>：实例完全符合 Schema（耗时约 ' + ms + ' ms）');
        } else {
            setStatus('fail', '❌ <b>校验失败</b>：发现 <b>' + res.errors.length + '</b> 个错误（耗时约 ' + ms + ' ms），点击下方错误可跳转到实例对应行');
        }
        renderErrors(res.errors, instLocs);
    }

    function scheduleValidation() {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(runValidation, DEBOUNCE_MS);
    }

    function loadSample(which) {
        schemaEl.value = SAMPLE_SCHEMA;
        instanceEl.value = which === 'valid' ? SAMPLE_VALID : SAMPLE_INVALID;
        markSyntax(instanceEl, false);
        markSyntax(schemaEl, false);
        runValidation();
    }

    function readFileInto(file, textarea) {
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function () {
            textarea.value = String(reader.result || '');
            scheduleValidation();
        };
        reader.onerror = function () {
            setStatus('syntax', '⛔ 读取文件失败：' + escapeHtml(file.name));
        };
        reader.readAsText(file, 'utf-8');
    }

    function bindDrop(zoneEl, textarea) {
        var counter = 0;
        zoneEl.addEventListener('dragenter', function (e) {
            e.preventDefault();
            counter++;
            zoneEl.classList.add('jsv-dragover');
        });
        zoneEl.addEventListener('dragover', function (e) { e.preventDefault(); });
        zoneEl.addEventListener('dragleave', function (e) {
            e.preventDefault();
            counter = Math.max(0, counter - 1);
            if (!counter) zoneEl.classList.remove('jsv-dragover');
        });
        zoneEl.addEventListener('drop', function (e) {
            e.preventDefault();
            counter = 0;
            zoneEl.classList.remove('jsv-dragover');
            var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
            if (f) readFileInto(f, textarea);
        });
    }

    function init() {
        instanceEl = $('jsv-instance');
        schemaEl = $('jsv-schema');
        if (!instanceEl || !schemaEl) return; // 非本工具页面：不初始化 UI
        statusEl = $('jsv-status');
        errorListEl = $('jsv-errors');
        errorCountEl = $('jsv-errcount');

        instanceEl.addEventListener('input', scheduleValidation);
        schemaEl.addEventListener('input', scheduleValidation);

        $('jsv-sample-valid').addEventListener('click', function () { loadSample('valid'); });
        $('jsv-sample-invalid').addEventListener('click', function () { loadSample('invalid'); });
        $('jsv-clear').addEventListener('click', function () {
            instanceEl.value = '';
            schemaEl.value = '';
            runValidation();
            instanceEl.focus();
        });

        // 读取文件按钮
        var instFile = $('jsv-instance-file'), schemaFile = $('jsv-schema-file');
        $('jsv-read-instance').addEventListener('click', function () { instFile.click(); });
        $('jsv-read-schema').addEventListener('click', function () { schemaFile.click(); });
        instFile.addEventListener('change', function () { readFileInto(instFile.files[0], instanceEl); instFile.value = ''; });
        schemaFile.addEventListener('change', function () { readFileInto(schemaFile.files[0], schemaEl); schemaFile.value = ''; });

        // 拖拽
        bindDrop($('jsv-drop-instance'), instanceEl);
        bindDrop($('jsv-drop-schema'), schemaEl);

        // 快捷键：Ctrl+Enter 立即校验
        document.addEventListener('keydown', function (e) {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                if (debounceTimer) clearTimeout(debounceTimer);
                runValidation();
                e.preventDefault();
            }
        });

        setStatus('idle', '💤 等待输入…在左侧粘贴 <b>JSON 实例</b>，在右侧粘贴 <b>JSON Schema</b>，输入即自动校验。');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // 暴露给测试轮：node 下可 require 验证引擎
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { parseJSONWithLoc: parseJSONWithLoc, validateSchema: validateSchema };
    }
})();
