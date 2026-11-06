/* 数据库 ER 图生成器 - 纯前端（零后端、零上传）
 *
 * 纯逻辑层（ED-CORE）：自研 SQL DDL 解析器（注释剥离、反引号/双引号/方括号
 * 标识符、字段级与表级主键/外键、REFERENCES、CONSTRAINT FOREIGN KEY、
 * ON DELETE/ON UPDATE、MySQL/PostgreSQL/SQLite 宽容解析）→ 生成 Mermaid
 * erDiagram 代码。未解析的行进诊断列表，绝不编造。无 DOM，可在 Node 下单测。
 * DOM 层：粘贴 DDL 即解析，表清单＋字段表＋关系清单＋Mermaid 代码视图，
 * 本地 vendor mermaid 10.9.3 渲染关系图，SVG 下载、PNG 高清导出（2x/3x）。
 * 只解析 DDL 生成关系图，不做通用 Mermaid 渲染、不做 SQL 格式化。
 */
(function () {
'use strict';

var MAX_INPUT = 20000;

function fail(field, message) {
    var e = new Error(message);
    e.field = field;
    return e;
}

function needString(v, field, what) {
    if (typeof v !== 'string') throw fail(field, what + '须为字符串');
    return v;
}

/* ================= 工具函数 ================= */

function countLinesUpTo(s, idx) {
    var n = 1, i;
    for (i = 0; i < idx && i < s.length; i++) if (s.charAt(i) === '\n') n++;
    return n;
}

function isIdentStart(ch) {
    return /[A-Za-z_]/.test(ch) || (ch >= '\u4e00' && ch <= '\u9fa5');
}

function isIdentChar(ch) {
    return /[A-Za-z0-9_$]/.test(ch) || (ch >= '\u4e00' && ch <= '\u9fa5');
}

/* 读一个可能带模式限定的标识符：`db`.`tbl` / "schema"."tbl" / [dbo].[users] / users
 * 返回 {segments:[...], end:下标}，失败返回 null。 */
function readQualifiedIdent(s, i) {
    var segments = [];
    var n = s.length;
    while (i < n && /\s/.test(s.charAt(i))) i++;
    if (i >= n) return null;
    var ch = s.charAt(i);
    var seg = '';
    if (ch === '`' || ch === '"') {
        var close = ch, j = i + 1;
        while (j < n) {
            if (s.charAt(j) === close) {
                if (j + 1 < n && s.charAt(j + 1) === close) { seg += close; j += 2; continue; }
                break;
            }
            seg += s.charAt(j);
            j++;
        }
        if (j >= n) return null;
        i = j + 1;
    } else if (ch === '[') {
        var k = s.indexOf(']', i + 1);
        if (k === -1) return null;
        seg = s.slice(i + 1, k);
        i = k + 1;
    } else {
        if (!isIdentStart(ch)) return null;
        var start = i;
        while (i < n && isIdentChar(s.charAt(i))) i++;
        seg = s.slice(start, i);
    }
    segments.push(seg);
    while (true) {
        var save = i;
        while (i < n && /\s/.test(s.charAt(i))) i++;
        if (i < n && s.charAt(i) === '.') {
            i++;
            var next = readQualifiedIdent(s, i);
            if (!next) { i = save; break; }
            segments.push.apply(segments, next.segments);
            i = next.end;
            /* 模式限定只取最后一段作表名；继续吃掉可能的多余段 */
            while (true) {
                var save2 = i;
                while (i < n && /\s/.test(s.charAt(i))) i++;
                if (i < n && s.charAt(i) === '.') {
                    i++;
                    var more = readQualifiedIdent(s, i);
                    if (!more) { i = save2; break; }
                    segments.push(more.segments[0]);
                    i = more.end;
                } else { i = save2; break; }
            }
            break;
        }
        i = save;
        break;
    }
    return { segments: segments, end: i };
}

/* 剥离注释（-- 行注释、# 行注释、/\* \*\/ 块注释），单引号/双引号/反引号/
 * 方括号内原样保留；注释内容替换为空格（保留换行，行号不错位）。 */
function stripComments(sql) {
    var out = '';
    var i = 0, n = sql.length;
    while (i < n) {
        var c = sql.charAt(i), nx = i + 1 < n ? sql.charAt(i + 1) : '';
        if (c === '-' && nx === '-' && (i + 2 >= n || /[\s]/.test(sql.charAt(i + 2)))) {
            while (i < n && sql.charAt(i) !== '\n') { out += ' '; i++; }
        } else if (c === '#') {
            while (i < n && sql.charAt(i) !== '\n') { out += ' '; i++; }
        } else if (c === '/' && nx === '*') {
            out += '  ';
            i += 2;
            while (i < n && !(sql.charAt(i) === '*' && i + 1 < n && sql.charAt(i + 1) === '/')) {
                out += sql.charAt(i) === '\n' ? '\n' : ' ';
                i++;
            }
            if (i < n) { out += '  '; i += 2; }
        } else if (c === "'") {
            out += c;
            i++;
            while (i < n) {
                var ch = sql.charAt(i);
                out += ch;
                if (ch === '\\' && i + 1 < n) { out += sql.charAt(i + 1); i += 2; continue; }
                if (ch === "'") {
                    if (i + 1 < n && sql.charAt(i + 1) === "'") { out += "'"; i += 2; continue; }
                    i++;
                    break;
                }
                i++;
            }
        } else if (c === '"' || c === '`') {
            var q = c;
            out += c;
            i++;
            while (i < n) {
                var ch2 = sql.charAt(i);
                out += ch2;
                if (ch2 === q) {
                    if (i + 1 < n && sql.charAt(i + 1) === q) { out += q; i += 2; continue; }
                    i++;
                    break;
                }
                i++;
            }
        } else if (c === '[') {
            out += c;
            i++;
            while (i < n && sql.charAt(i) !== ']') { out += sql.charAt(i); i++; }
            if (i < n) { out += ']'; i++; }
        } else {
            out += c;
            i++;
        }
    }
    return out;
}

/* 找与 openIdx 处 '(' 配对的 ')'，引号内括号不计数；失败返回 -1。 */
function findMatchingParen(s, openIdx) {
    var depth = 0, i = openIdx, n = s.length;
    var quote = null;
    while (i < n) {
        var c = s.charAt(i);
        if (quote) {
            if (quote === '[') { if (c === ']') quote = null; i++; continue; }
            if (c === '\\' && quote === "'") { i += 2; continue; }
            if (c === quote) {
                if (i + 1 < n && s.charAt(i + 1) === quote) { i += 2; continue; }
                quote = null;
            }
            i++;
            continue;
        }
        if (c === "'" || c === '"' || c === '`') { quote = c; i++; continue; }
        if (c === '[') { quote = '['; i++; continue; }
        if (c === '(') depth++;
        else if (c === ')') {
            depth--;
            if (depth === 0) return i;
        }
        i++;
    }
    return -1;
}

/* 按顶层逗号切分（括号深度 0 且不在引号内），返回 [{text, line}]。 */
function splitTopLevel(body, baseLine) {
    var items = [];
    var depth = 0, quote = null, start = 0, i = 0, n = body.length;
    function push(end) {
        var text = body.slice(start, end);
        if (text.trim() !== '') {
            items.push({ text: text, line: baseLine + countLinesUpTo(body.slice(0, start), start) - 1 });
        }
    }
    while (i < n) {
        var c = body.charAt(i);
        if (quote) {
            if (quote === '[') { if (c === ']') quote = null; i++; continue; }
            if (c === '\\' && quote === "'") { i += 2; continue; }
            if (c === quote) {
                if (i + 1 < n && body.charAt(i + 1) === quote) { i += 2; continue; }
                quote = null;
            }
            i++;
            continue;
        }
        if (c === "'" || c === '"' || c === '`') { quote = c; i++; continue; }
        if (c === '[') { quote = '['; i++; continue; }
        if (c === '(') depth++;
        else if (c === ')') depth--;
        else if (c === ',' && depth === 0) { push(i); start = i + 1; }
        i++;
    }
    push(n);
    return items;
}

function splitCsvList(s) {
    return s.split(',').map(function (x) {
        var t = x.trim();
        var m = t.match(/^(?:`([^`]+)`|"([^"]+)"|\[([^\]]+)\]|(.+))$/);
        return m ? (m[1] || m[2] || m[3] || m[4]).trim() : t;
    }).filter(function (x) { return x !== ''; });
}

function parseRefAction(tail, kind) {
    var re = new RegExp('ON\\s+' + kind + '\\s+(CASCADE|SET\\s+NULL|SET\\s+DEFAULT|RESTRICT|NO\\s+ACTION)', 'i');
    var m = tail.match(re);
    return m ? m[1].replace(/\s+/g, ' ').toUpperCase() : null;
}

/* 从 REFERENCES 后的尾巴里解析 ON DELETE / ON UPDATE。 */
function parseRefTail(tail) {
    return { onDelete: parseRefAction(tail, 'DELETE'), onUpdate: parseRefAction(tail, 'UPDATE') };
}

var COL_KEYWORDS = ['PRIMARY', 'REFERENCES', 'NOT', 'NULL', 'UNIQUE', 'DEFAULT',
    'CHECK', 'COMMENT', 'AUTO_INCREMENT', 'AUTOINCREMENT', 'GENERATED', 'COLLATE',
    'CONSTRAINT', 'ON', 'KEY', 'INDEX'];

/* 读类型：一个标识符＋可选 (参数)，再吃多词类型（DOUBLE PRECISION /
 * BIT VARYING / TIMESTAMP WITH TIME ZONE 等）与 UNSIGNED/ZEROFILL 修饰。 */
function readType(s, i) {
    var n = s.length;
    while (i < n && /\s/.test(s.charAt(i))) i++;
    var m = /^[A-Za-z][A-Za-z0-9_]*/.exec(s.slice(i));
    if (!m) return null;
    var type = m[0];
    i += m[0].length;
    while (i < n && /\s/.test(s.charAt(i))) i++;
    if (i < n && s.charAt(i) === '(') {
        var close = findMatchingParen(s, i);
        if (close !== -1) {
            type += s.slice(i, close + 1);
            i = close + 1;
        }
    }
    /* 多词类型第二词 */
    var rest = s.slice(i);
    var w2 = /^\s*(PRECISION|VARYING)\b/i.exec(rest);
    if (w2) { type += ' ' + w2[1].toUpperCase(); i += w2[0].length; }
    var wz = /^\s*(WITH|WITHOUT)\s+TIME\s+ZONE\b/i.exec(s.slice(i));
    if (wz) { type += ' ' + wz[0].replace(/\s+/g, ' ').trim().toUpperCase(); i += wz[0].length; }
    /* UNSIGNED / ZEROFILL / SIGNED 修饰 */
    while (true) {
        var mod = /^\s*(UNSIGNED|ZEROFILL|SIGNED)\b/i.exec(s.slice(i));
        if (!mod) break;
        type += ' ' + mod[1].toUpperCase();
        i += mod[0].length;
    }
    return { type: type, end: i };
}

/* 解析单条字段定义或表级约束。返回 null 表示已识别但无需记录
 *（KEY/INDEX/CHECK/UNIQUE 约束等）；返回 {unparsed} 表示无法识别。 */
function parseBodyItem(item, table) {
    var text = item.text.trim();
    var line = item.line;
    var m;

    /* 表级主键：[CONSTRAINT x] PRIMARY KEY (a, b) */
    m = /^(?:CONSTRAINT\s+(?:`[^`]+`|"[^"]+"|\[[^\]]+\]|[A-Za-z0-9_$]+)\s+)?PRIMARY\s+KEY\s*\(([^)]*)\)/i.exec(text);
    if (m) {
        var pkCols = splitCsvList(m[1]);
        pkCols.forEach(function (c) {
            if (table.primaryKey.indexOf(c) === -1) table.primaryKey.push(c);
            var col = findColumn(table, c);
            if (col) col.primaryKey = true;
        });
        return null;
    }

    /* 表级外键：[CONSTRAINT x] FOREIGN KEY (a) REFERENCES t (b) [ON DELETE ...] */
    m = /^(?:CONSTRAINT\s+(?:`[^`]+`|"[^"]+"|\[[^\]]+\]|[A-Za-z0-9_$]+)\s+)?FOREIGN\s+KEY\s*\(([^)]*)\)\s+REFERENCES\s+/i.exec(text);
    if (m) {
        var rest = text.slice(m[0].length);
        var ref = readQualifiedIdent(rest, 0);
        if (ref) {
            var afterRef = rest.slice(ref.end);
            var cm = /^\s*\(([^)]*)\)(.*)$/s.exec(afterRef);
            if (cm) {
                var fromCols = splitCsvList(m[1]);
                var toCols = splitCsvList(cm[1]);
                var tail = parseRefTail(cm[2]);
                var fkName = null;
                var nm = /^CONSTRAINT\s+(?:`([^`]+)`|"([^"]+)"|\[([^\]]+)\]|([A-Za-z0-9_$]+))/i.exec(text);
                if (nm) fkName = nm[1] || nm[2] || nm[3] || nm[4];
                addForeignKey(table, fromCols, ref.segments[ref.segments.length - 1], toCols, tail, fkName);
                return null;
            }
        }
        return { unparsed: { line: line, text: text.slice(0, 120), reason: '外键 REFERENCES 目标无法解析' } };
    }

    /* 表级 UNIQUE：[CONSTRAINT x] UNIQUE [KEY|INDEX] (a, b) → 标记字段 unique */
    m = /^(?:CONSTRAINT\s+(?:`[^`]+`|"[^"]+"|\[[^\]]+\]|[A-Za-z0-9_$]+)\s+)?UNIQUE\s+(?:KEY\s+|INDEX\s+)?\(([^)]*)\)/i.exec(text);
    if (m) {
        splitCsvList(m[1]).forEach(function (c) {
            var col = findColumn(table, c);
            if (col) col.unique = true;
        });
        return null;
    }

    /* 其余表级结构：KEY / INDEX / CHECK / 全表 CONSTRAINT CHECK → 已识别，跳过 */
    if (/^(?:KEY|INDEX)\b/i.test(text)) return null;
    if (/^CHECK\s*\(/i.test(text)) return null;
    if (/^CONSTRAINT\s+\S+\s+CHECK\s*\(/i.test(text)) return null;
    if (/^CONSTRAINT\s+\S+\s+UNIQUE\b/i.test(text)) return null;
    if (/^LIKE\s+/i.test(text)) return null;
    if (/^PERIOD\s+FOR\b/i.test(text)) return null;

    /* 字段定义：首词为字段名 */
    var nameRead = readQualifiedIdent(text, 0);
    if (!nameRead) {
        return { unparsed: { line: line, text: text.slice(0, 120), reason: '无法识别的定义行' } };
    }
    var colName = nameRead.segments[nameRead.segments.length - 1];
    if (/^(PRIMARY|FOREIGN|UNIQUE|CHECK|KEY|INDEX|CONSTRAINT)$/i.test(colName)) {
        return { unparsed: { line: line, text: text.slice(0, 120), reason: '无法识别的约束行' } };
    }
    var typeRead = readType(text, nameRead.end);
    if (!typeRead) {
        return { unparsed: { line: line, text: text.slice(0, 120), reason: '字段缺少类型' } };
    }
    var col = {
        name: colName,
        type: typeRead.type,
        primaryKey: false,
        foreignKey: false,
        nullable: true,
        unique: false,
        autoIncrement: false,
        defaultValue: null,
        comment: null,
        references: null
    };
    var tail = text.slice(typeRead.end);
    if (/\bPRIMARY\s+KEY\b/i.test(tail)) {
        col.primaryKey = true;
        if (table.primaryKey.indexOf(colName) === -1) table.primaryKey.push(colName);
    }
    if (/\bNOT\s+NULL\b/i.test(tail)) col.nullable = false;
    if (/\bUNIQUE\b/i.test(tail)) col.unique = true;
    if (/\bAUTO_?INCREMENT\b/i.test(tail)) col.autoIncrement = true;
    var dm = /\bDEFAULT\s+('(?:[^']|'')*'|"(?:[^"]|"")*"|-?[\w.]+(?:\([^)]*\))?)/i.exec(tail);
    if (dm) col.defaultValue = dm[1];
    var cmm = /\bCOMMENT\s+'((?:[^']|'')*)'/i.exec(tail);
    if (cmm) col.comment = cmm[1].replace(/''/g, "'");
    /* 字段级外键：REFERENCES t (c) [ON DELETE ...] [ON UPDATE ...] */
    var rm = /\bREFERENCES\s+/i.exec(tail);
    if (rm) {
        var refRest = tail.slice(rm.index + rm[0].length);
        var ref2 = readQualifiedIdent(refRest, 0);
        if (ref2) {
            var after2 = refRest.slice(ref2.end);
            var cm2 = /^\s*\(([^)]*)\)(.*)$/s.exec(after2);
            if (cm2) {
                var toCol = splitCsvList(cm2[1])[0] || null;
                var tail2 = parseRefTail(cm2[2]);
                col.foreignKey = true;
                col.references = {
                    table: ref2.segments[ref2.segments.length - 1],
                    column: toCol,
                    onDelete: tail2.onDelete,
                    onUpdate: tail2.onUpdate
                };
                addForeignKey(table, [colName], ref2.segments[ref2.segments.length - 1],
                    toCol ? [toCol] : [], tail2, null);
            }
        }
    }
    table.columns.push(col);
    return null;
}

function findColumn(table, name) {
    for (var i = 0; i < table.columns.length; i++) {
        if (table.columns[i].name === name) return table.columns[i];
    }
    return null;
}

function addForeignKey(table, fromCols, toTable, toCols, tail, name) {
    var fk = {
        name: name || null,
        columns: fromCols.slice(),
        refTable: toTable,
        refColumns: toCols.slice(),
        onDelete: tail.onDelete,
        onUpdate: tail.onUpdate
    };
    table.foreignKeys.push(fk);
    fromCols.forEach(function (c) {
        var col = findColumn(table, c);
        if (col) col.foreignKey = true;
    });
}

/* ================= parseDDL ================= */

function parseDDL(input) {
    needString(input, 'input', 'DDL 文本');
    if (input.length > MAX_INPUT) {
        throw fail('input', 'DDL 过长：最多 ' + MAX_INPUT + ' 字符，当前 ' + input.length + ' 字符');
    }
    var sql = stripComments(input);
    var tables = [];
    var unparsed = [];
    var seenNames = {};
    var spans = [];

    var re = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?/gi;
    var match;
    while ((match = re.exec(sql)) !== null) {
        var startIdx = match.index;
        var nameRead = readQualifiedIdent(sql, re.lastIndex);
        if (!nameRead) {
            unparsed.push({
                line: countLinesUpTo(sql, startIdx),
                text: sql.slice(startIdx, Math.min(sql.length, startIdx + 120)).replace(/\s+/g, ' ').trim(),
                reason: '建表语句缺少表名'
            });
            /* 余下部分划入本语句跨度，避免同一语句重复进诊断 */
            var semi2 = sql.indexOf(';', startIdx);
            spans.push([startIdx, semi2 === -1 ? sql.length : semi2 + 1]);
            continue;
        }
        var segments = nameRead.segments;
        var tableName = segments[segments.length - 1];
        var schema = segments.length > 1 ? segments.slice(0, -1).join('.') : null;
        var i = nameRead.end;
        while (i < sql.length && /\s/.test(sql.charAt(i))) i++;
        if (i >= sql.length || sql.charAt(i) !== '(') {
            unparsed.push({
                line: countLinesUpTo(sql, startIdx),
                text: sql.slice(startIdx, Math.min(sql.length, startIdx + 120)).replace(/\s+/g, ' ').trim(),
                reason: '建表语句缺少字段列表括号（AS SELECT / LIKE 口径暂不支持）'
            });
            /* 余下部分划入本语句跨度，避免同一语句重复进诊断 */
            var semi2 = sql.indexOf(';', i);
            spans.push([startIdx, semi2 === -1 ? sql.length : semi2 + 1]);
            continue;
        }
        var closeIdx = findMatchingParen(sql, i);
        if (closeIdx === -1) {
            unparsed.push({
                line: countLinesUpTo(sql, startIdx),
                text: 'CREATE TABLE ' + tableName + ' (...)',
                reason: '字段列表括号未闭合'
            });
            spans.push([startIdx, sql.length]);
            continue;
        }
        /* 表选项（ENGINE=... / COMMENT=... 等）在右括号与分号之间，一并划入本语句跨度 */
        var endIdx = closeIdx + 1;
        var semi = endIdx, q = null;
        while (semi < sql.length) {
            var sch = sql.charAt(semi);
            if (q) {
                if (q === '[' ? sch === ']' : sch === q) q = null;
                semi++;
                continue;
            }
            if (sch === "'" || sch === '"' || sch === '`' || sch === '[') { q = sch; semi++; continue; }
            if (sch === ';') break;
            semi++;
        }
        endIdx = semi < sql.length ? semi + 1 : sql.length;
        spans.push([startIdx, endIdx]);

        if (seenNames[tableName]) {
            unparsed.push({
                line: countLinesUpTo(sql, startIdx),
                text: 'CREATE TABLE ' + tableName + ' (...)',
                reason: '重复表名，已忽略后出现的定义'
            });
            continue;
        }
        seenNames[tableName] = true;

        var table = {
            name: tableName,
            schema: schema,
            columns: [],
            primaryKey: [],
            foreignKeys: []
        };
        var body = sql.slice(i + 1, closeIdx);
        var baseLine = countLinesUpTo(sql, i + 1);
        var items = splitTopLevel(body, baseLine);
        items.forEach(function (item) {
            var r = parseBodyItem(item, table);
            if (r && r.unparsed) unparsed.push(r.unparsed);
        });
        /* 字段级主键若在字段后出现，primaryKey 已在字段解析时登记；
         * 字段级外键已在字段解析时登记进 foreignKeys。 */
        tables.push(table);
    }

    /* 建表语句之外的残余语句：SET / USE 为转储样板，跳过不计；其余进诊断。 */
    var cursor = 0;
    var leftovers = [];
    spans.sort(function (a, b) { return a[0] - b[0]; });
    spans.forEach(function (sp) {
        if (sp[0] > cursor) leftovers.push({ text: sql.slice(cursor, sp[0]), start: cursor });
        cursor = Math.max(cursor, sp[1]);
    });
    if (cursor < sql.length) leftovers.push({ text: sql.slice(cursor), start: cursor });
    leftovers.forEach(function (chunk) {
        var parts = chunk.text.split(';');
        var offset = 0;
        parts.forEach(function (part) {
            var trimmed = part.trim();
            var partStart = chunk.start + offset;
            offset += part.length + 1;
            if (trimmed === '') return;
            if (/^(SET|USE)\b/i.test(trimmed)) return;
            unparsed.push({
                line: countLinesUpTo(sql, partStart + (part.indexOf(trimmed) === -1 ? 0 : part.indexOf(trimmed))),
                text: trimmed.replace(/\s+/g, ' ').slice(0, 120),
                reason: '非 CREATE TABLE 语句，未解析'
            });
        });
    });

    /* 关系清单：由各表外键展开 */
    var relationships = [];
    var relSeen = {};
    tables.forEach(function (t) {
        t.foreignKeys.forEach(function (fk) {
            fk.columns.forEach(function (fromCol, idx) {
                var toCol = fk.refColumns[idx] || fk.refColumns[0] || null;
                if (!toCol) return;
                var key = t.name + '.' + fromCol + '->' + fk.refTable + '.' + toCol;
                if (relSeen[key]) return;
                relSeen[key] = true;
                relationships.push({
                    fromTable: t.name,
                    fromColumn: fromCol,
                    toTable: fk.refTable,
                    toColumn: toCol,
                    onDelete: fk.onDelete,
                    onUpdate: fk.onUpdate,
                    name: fk.name
                });
            });
        });
    });

    var columnCount = tables.reduce(function (acc, t) { return acc + t.columns.length; }, 0);
    return {
        tables: tables,
        relationships: relationships,
        unparsed: unparsed,
        summary: {
            tableCount: tables.length,
            columnCount: columnCount,
            relationshipCount: relationships.length,
            unparsedCount: unparsed.length
        }
    };
}

/* ================= Mermaid 生成 ================= */

function sanitizeIdent(name) {
    var s = String(name).replace(/[^A-Za-z0-9_]/g, '_');
    if (s === '') s = 't';
    if (/^[0-9]/.test(s)) s = '_' + s;
    return s;
}

function sanitizeType(type) {
    var s = String(type || '').replace(/\([^)]*\)/g, '');
    s = s.replace(/[^A-Za-z0-9_ ]/g, ' ').replace(/\s+/g, '_').replace(/^_+|_+$/g, '');
    s = s.toLowerCase();
    return s === '' ? 'string' : s;
}

function ddlToMermaid(inputOrParsed) {
    var parsed;
    if (typeof inputOrParsed === 'string') {
        parsed = parseDDL(inputOrParsed);
    } else if (inputOrParsed && Array.isArray(inputOrParsed.tables)) {
        parsed = inputOrParsed;
    } else {
        throw fail('parsed', 'ddlToMermaid 须传入 DDL 字符串或 parseDDL 的返回结果');
    }
    var lines = ['erDiagram'];
    var nameMap = {};
    var used = {};
    parsed.tables.forEach(function (t) {
        var safe = sanitizeIdent(t.name);
        if (used[safe]) {
            var n = 2;
            while (used[safe + '_' + n]) n++;
            safe = safe + '_' + n;
        }
        used[safe] = true;
        nameMap[t.name] = safe;
    });
    parsed.tables.forEach(function (t) {
        lines.push('    ' + nameMap[t.name] + ' {');
        var usedAttrs = {};
        t.columns.forEach(function (c) {
            var key = '';
            if (c.primaryKey) key = ' PK';
            else if (c.foreignKey) key = ' FK';
            else if (c.unique) key = ' UK';
            var attr = sanitizeIdent(c.name);
            if (usedAttrs[attr]) {
                var n = 2;
                while (usedAttrs[attr + '_' + n]) n++;
                attr = attr + '_' + n;
            }
            usedAttrs[attr] = true;
            lines.push('        ' + sanitizeType(c.type) + ' ' + attr + key);
        });
        lines.push('    }');
    });
    parsed.relationships.forEach(function (r) {
        var from = nameMap[r.fromTable] || sanitizeIdent(r.fromTable);
        var to = nameMap[r.toTable] || sanitizeIdent(r.toTable);
        lines.push('    ' + from + ' }o--|| ' + to + ' : "' +
            sanitizeIdent(r.fromColumn) + ' -> ' + sanitizeIdent(r.toColumn) + '"');
    });
    return lines.join('\n') + '\n';
}

/* ================= extractTableNames / countRelationships ================= */

function extractTableNames(input) {
    needString(input, 'input', 'DDL 文本');
    return parseDDL(input).tables.map(function (t) { return t.name; });
}

function countRelationships(parsed) {
    if (!parsed || !Array.isArray(parsed.relationships)) {
        throw fail('parsed', 'countRelationships 须传入 parseDDL 的返回结果');
    }
    return parsed.relationships.length;
}

/* ================= validateDDLInput ================= */

function validateDDLInput(input) {
    if (typeof input !== 'string') throw fail('input', 'DDL 文本须为字符串');
    if (input.trim() === '') {
        return { valid: false, field: 'input', message: '请粘贴 SQL DDL（CREATE TABLE 语句）' };
    }
    if (input.length > MAX_INPUT) {
        return { valid: false, field: 'input', message: 'DDL 过长：最多 ' + MAX_INPUT + ' 字符，当前 ' + input.length + ' 字符' };
    }
    return { valid: true, field: null, message: '' };
}

/* 解析摘要：供一键复制。 */
function buildSummary(parsed) {
    if (!parsed || !Array.isArray(parsed.tables)) {
        throw fail('parsed', 'buildSummary 须传入 parseDDL 的返回结果');
    }
    var s = parsed.summary || {
        tableCount: parsed.tables.length,
        columnCount: 0,
        relationshipCount: (parsed.relationships || []).length,
        unparsedCount: (parsed.unparsed || []).length
    };
    var out = [];
    out.push('数据库 ER 图解析摘要');
    out.push('表：' + s.tableCount + ' 个，字段：' + s.columnCount + ' 个，关系：' + s.relationshipCount + ' 条，未解析：' + s.unparsedCount + ' 行');
    parsed.tables.forEach(function (t) {
        out.push('- ' + t.name + '（' + t.columns.length + ' 字段' +
            (t.primaryKey.length ? '，主键：' + t.primaryKey.join(', ') : '') + '）');
    });
    (parsed.relationships || []).forEach(function (r) {
        out.push('- ' + r.fromTable + '.' + r.fromColumn + ' -> ' + r.toTable + '.' + r.toColumn +
            (r.onDelete ? '（ON DELETE ' + r.onDelete + '）' : ''));
    });
    (parsed.unparsed || []).forEach(function (u) {
        out.push('! 未解析（第 ' + u.line + ' 行）：' + u.text + ' —— ' + u.reason);
    });
    return out.join('\n');
}

/* ================= 预设示例 ================= */

var SAMPLES = [
    {
        name: '博客三表（MySQL）',
        desc: '用户 / 文章 / 评论，外键串起三表',
        ddl: '-- 博客系统：用户、文章、评论\n' +
            'CREATE TABLE `users` (\n' +
            '  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,\n' +
            '  `username` VARCHAR(50) NOT NULL UNIQUE,\n' +
            '  `email` VARCHAR(100) NOT NULL,\n' +
            '  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,\n' +
            '  PRIMARY KEY (`id`)\n' +
            ') ENGINE=InnoDB;\n\n' +
            'CREATE TABLE posts (\n' +
            '  id BIGINT NOT NULL AUTO_INCREMENT,\n' +
            '  user_id INT UNSIGNED NOT NULL,\n' +
            '  title VARCHAR(200) NOT NULL,\n' +
            '  body TEXT,\n' +
            '  status VARCHAR(20) NOT NULL DEFAULT \'draft\',\n' +
            '  PRIMARY KEY (id),\n' +
            '  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE\n' +
            ');\n\n' +
            'CREATE TABLE comments (\n' +
            '  id BIGINT NOT NULL AUTO_INCREMENT,\n' +
            '  post_id BIGINT NOT NULL,\n' +
            '  user_id INT UNSIGNED NOT NULL,\n' +
            '  content TEXT NOT NULL,\n' +
            '  created_at DATETIME NOT NULL,\n' +
            '  PRIMARY KEY (id),\n' +
            '  CONSTRAINT fk_comment_post FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE,\n' +
            '  CONSTRAINT fk_comment_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE\n' +
            ');'
    },
    {
        name: '电商四表（MySQL）',
        desc: '客户 / 订单 / 商品 / 订单明细，含复合主键',
        ddl: 'CREATE TABLE customers (\n' +
            '  customer_id INT PRIMARY KEY AUTO_INCREMENT,\n' +
            '  name VARCHAR(100) NOT NULL,\n' +
            '  phone VARCHAR(20),\n' +
            '  city VARCHAR(50)\n' +
            ');\n\n' +
            'CREATE TABLE products (\n' +
            '  product_id INT PRIMARY KEY,\n' +
            '  name VARCHAR(200) NOT NULL,\n' +
            '  price DECIMAL(10, 2) NOT NULL,\n' +
            '  stock INT NOT NULL DEFAULT 0\n' +
            ');\n\n' +
            'CREATE TABLE orders (\n' +
            '  order_id BIGINT PRIMARY KEY AUTO_INCREMENT,\n' +
            '  customer_id INT NOT NULL,\n' +
            '  order_date DATE NOT NULL,\n' +
            '  total DECIMAL(10, 2),\n' +
            '  FOREIGN KEY (customer_id) REFERENCES customers (customer_id) ON DELETE RESTRICT\n' +
            ');\n\n' +
            'CREATE TABLE order_items (\n' +
            '  order_id BIGINT NOT NULL,\n' +
            '  product_id INT NOT NULL,\n' +
            '  quantity INT NOT NULL,\n' +
            '  unit_price DECIMAL(10, 2) NOT NULL,\n' +
            '  PRIMARY KEY (order_id, product_id),\n' +
            '  FOREIGN KEY (order_id) REFERENCES orders (order_id) ON DELETE CASCADE,\n' +
            '  FOREIGN KEY (product_id) REFERENCES products (product_id)\n' +
            ');'
    },
    {
        name: '学校三表（PostgreSQL）',
        desc: '双引号标识符＋模式限定＋复合主键',
        ddl: '-- PostgreSQL：选课系统\n' +
            'CREATE TABLE "students" (\n' +
            '  "id" SERIAL PRIMARY KEY,\n' +
            '  "name" VARCHAR(100) NOT NULL,\n' +
            '  "grade" INT\n' +
            ');\n\n' +
            'CREATE TABLE public.courses (\n' +
            '  id SERIAL PRIMARY KEY,\n' +
            '  title TEXT NOT NULL,\n' +
            '  credits INT NOT NULL DEFAULT 3\n' +
            ');\n\n' +
            'CREATE TABLE enrollments (\n' +
            '  student_id INT NOT NULL,\n' +
            '  course_id INT NOT NULL,\n' +
            '  enrolled_on DATE,\n' +
            '  score NUMERIC(5, 2),\n' +
            '  PRIMARY KEY (student_id, course_id),\n' +
            '  FOREIGN KEY (student_id) REFERENCES students (id) ON DELETE CASCADE,\n' +
            '  FOREIGN KEY (course_id) REFERENCES courses (id) ON DELETE CASCADE\n' +
            ');'
    },
    {
        name: '组织架构（自引用外键）',
        desc: '部门 / 员工，员工的上级指向员工自身',
        ddl: 'CREATE TABLE departments (\n' +
            '  id INT PRIMARY KEY,\n' +
            '  name VARCHAR(100) NOT NULL,\n' +
            '  parent_id INT,\n' +
            '  FOREIGN KEY (parent_id) REFERENCES departments (id)\n' +
            ');\n\n' +
            'CREATE TABLE employees (\n' +
            '  id INT PRIMARY KEY AUTO_INCREMENT,\n' +
            '  dept_id INT NOT NULL,\n' +
            '  manager_id INT,\n' +
            '  name VARCHAR(100) NOT NULL,\n' +
            '  email VARCHAR(100) UNIQUE,\n' +
            '  hire_date DATE,\n' +
            '  FOREIGN KEY (dept_id) REFERENCES departments (id) ON DELETE RESTRICT,\n' +
            '  FOREIGN KEY (manager_id) REFERENCES employees (id) ON DELETE SET NULL\n' +
            ');'
    },
    {
        name: '论坛（SQLite）',
        desc: '方括号标识符＋字段级 REFERENCES＋表级 CONSTRAINT',
        ddl: '-- SQLite：论坛\n' +
            'CREATE TABLE [users] (\n' +
            '  [id] INTEGER PRIMARY KEY AUTOINCREMENT,\n' +
            '  [username] TEXT NOT NULL UNIQUE,\n' +
            '  [created_at] TEXT\n' +
            ');\n\n' +
            'CREATE TABLE threads (\n' +
            '  id INTEGER PRIMARY KEY AUTOINCREMENT,\n' +
            '  author_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,\n' +
            '  title TEXT NOT NULL,\n' +
            '  pinned INTEGER NOT NULL DEFAULT 0\n' +
            ');\n\n' +
            'CREATE TABLE replies (\n' +
            '  id INTEGER PRIMARY KEY AUTOINCREMENT,\n' +
            '  thread_id INTEGER NOT NULL,\n' +
            '  author_id INTEGER NOT NULL,\n' +
            '  body TEXT NOT NULL,\n' +
            '  CONSTRAINT fk_reply_thread FOREIGN KEY (thread_id) REFERENCES threads (id) ON DELETE CASCADE,\n' +
            '  CONSTRAINT fk_reply_author FOREIGN KEY (author_id) REFERENCES users (id) ON DELETE CASCADE\n' +
            ');'
    }
];

var ED_CORE = {
    MAX_INPUT: MAX_INPUT,
    parseDDL: parseDDL,
    ddlToMermaid: ddlToMermaid,
    validateDDLInput: validateDDLInput,
    extractTableNames: extractTableNames,
    countRelationships: countRelationships,
    buildSummary: buildSummary,
    samples: SAMPLES
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ED_CORE;
}

/* 浏览器端挂 window.ErDiagramGenerator；node 下导出纯函数以便单元测试 */
if (typeof window !== 'undefined') window.ErDiagramGenerator = ED_CORE;

/* ================= DOM 层（仅浏览器） ================= */

if (typeof document !== 'undefined' && !(typeof module !== 'undefined' && module.exports)) {

function $(id) { return document.getElementById(id); }

function escHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
}

function tip(msg, ok) {
    var el = $('ed-copytip');
    el.textContent = msg;
    el.style.display = 'block';
    el.style.color = ok === false ? '#b91c1c' : '#047857';
    setTimeout(function () { el.style.display = 'none'; }, 3500);
}

var inputEl, statEl, countEl, errEl, tablesEl, relEl, codeEl, diagEl,
    previewEl, vendorTipEl, svgDlBtn, pngBtn, themeSel, scaleSel, bgSel;
var state = { svg: '', parsed: null, mermaidCode: '', renderToken: 0, theme: 'default' };

function renderPresets() {
    var wrap = $('ed-presets');
    SAMPLES.forEach(function (s, idx) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'ed-preset-btn';
        b.textContent = s.name + ' — ' + s.desc;
        b.addEventListener('click', function () {
            inputEl.value = s.ddl;
            renderAll();
            inputEl.focus();
        });
        wrap.appendChild(b);
    });
}

function renderTables(parsed) {
    if (!parsed.tables.length) {
        tablesEl.innerHTML = '<div class="ed-empty">尚未解析出任何表：请粘贴包含 CREATE TABLE 的 DDL，或点上方预设示例试试。</div>';
        return;
    }
    var html = '';
    parsed.tables.forEach(function (t) {
        html += '<div class="ed-table-block"><h4><i class="material-icons">table_chart</i> ' +
            escHtml(t.name) + (t.schema ? ' <span class="ed-schema">（模式 ' + escHtml(t.schema) + '）</span>' : '') +
            ' <span class="ed-colcount">' + t.columns.length + ' 个字段</span></h4>';
        html += '<table class="ed-coltable"><thead><tr><th>字段</th><th>类型</th><th>主键</th><th>外键</th><th>可空</th><th>唯一</th><th>默认值</th></tr></thead><tbody>';
        t.columns.forEach(function (c) {
            html += '<tr><td><code>' + escHtml(c.name) + '</code>' +
                (c.comment ? '<div class="ed-comment">' + escHtml(c.comment) + '</div>' : '') + '</td>' +
                '<td><code>' + escHtml(c.type) + '</code></td>' +
                '<td>' + (c.primaryKey ? 'PK' : '') + '</td>' +
                '<td>' + (c.foreignKey && c.references ? escHtml(c.references.table + '.' + c.references.column) : (c.foreignKey ? 'FK' : '')) + '</td>' +
                '<td>' + (c.nullable ? '是' : '否') + '</td>' +
                '<td>' + (c.unique ? '是' : '') + '</td>' +
                '<td>' + (c.defaultValue !== null ? escHtml(c.defaultValue) : '') + '</td></tr>';
        });
        html += '</tbody></table>';
        if (t.primaryKey.length) {
            html += '<div class="ed-pkline">主键：' + t.primaryKey.map(escHtml).join(', ') + '</div>';
        }
        html += '</div>';
    });
    tablesEl.innerHTML = html;
}

function renderRelations(parsed) {
    if (!parsed.relationships.length) {
        relEl.innerHTML = '<div class="ed-empty">未发现外键关系：关系只按外键推断，无外键的表之间不猜关系。</div>';
        return;
    }
    var html = '<table class="ed-coltable"><thead><tr><th>#</th><th>多端（子表）</th><th></th><th>一端（父表）</th><th>ON DELETE</th><th>ON UPDATE</th></tr></thead><tbody>';
    parsed.relationships.forEach(function (r, idx) {
        html += '<tr><td>' + (idx + 1) + '</td><td><code>' + escHtml(r.fromTable + '.' + r.fromColumn) + '</code></td>' +
            '<td>→</td><td><code>' + escHtml(r.toTable + '.' + r.toColumn) + '</code></td>' +
            '<td>' + escHtml(r.onDelete || '—') + '</td><td>' + escHtml(r.onUpdate || '—') + '</td></tr>';
    });
    html += '</tbody></table>';
    relEl.innerHTML = html;
}

function renderDiag(parsed) {
    if (!parsed.unparsed.length) {
        diagEl.innerHTML = '<div class="ed-ok">全部行均已解析，无未解析内容。</div>';
        return;
    }
    var html = '<div class="ed-diag-note">以下 ' + parsed.unparsed.length + ' 行未能解析，已原样列出、未做任何推测：</div>';
    html += '<table class="ed-coltable"><thead><tr><th>行</th><th>内容</th><th>原因</th></tr></thead><tbody>';
    parsed.unparsed.forEach(function (u) {
        html += '<tr><td>' + u.line + '</td><td><code>' + escHtml(u.text) + '</code></td><td>' + escHtml(u.reason) + '</td></tr>';
    });
    html += '</tbody></table>';
    diagEl.innerHTML = html;
}

function setExportEnabled(enabled) {
    svgDlBtn.disabled = !enabled;
    pngBtn.disabled = !enabled;
}

function friendlyError(err) {
    var msg = (err && err.message) ? String(err.message) : '渲染失败';
    return 'Mermaid 渲染失败：' + msg + '。请检查生成的 erDiagram 代码（实体名与属性名须为英文标识符）。';
}

function renderMermaidNow() {
    var token = ++state.renderToken;
    var code = state.mermaidCode;
    if (!code || !state.parsed || !state.parsed.tables.length) {
        previewEl.innerHTML = '<div class="ed-empty">解析出表之后，这里会显示关系图</div>';
        state.svg = '';
        setExportEnabled(false);
        return;
    }
    if (typeof window.mermaid === 'undefined') {
        previewEl.innerHTML = '<div class="ed-empty">渲染引擎尚未加载</div>';
        vendorTipEl.textContent = '⚠ 本地渲染引擎（Mermaid.js 10.9.3）未能加载，暂时无法渲染关系图；表清单、字段表与 Mermaid 代码不受影响。请刷新页面重试。';
        vendorTipEl.style.display = 'block';
        setExportEnabled(false);
        return;
    }
    vendorTipEl.style.display = 'none';
    window.mermaid.initialize({
        startOnLoad: false,
        theme: state.theme,
        securityLevel: 'strict',
        fontFamily: '"PingFang SC","Microsoft YaHei","Noto Sans SC",system-ui,sans-serif'
    });
    var rid = 'ed-svg-' + token;
    window.mermaid.render(rid, code).then(function (res) {
        if (token !== state.renderToken) return;
        state.svg = res.svg;
        previewEl.innerHTML = res.svg;
        setExportEnabled(true);
    }).catch(function (err) {
        if (token !== state.renderToken) return;
        state.svg = '';
        previewEl.innerHTML = '<div class="ed-empty">渲染失败，请查看下方错误提示</div>';
        errEl.textContent = friendlyError(err);
        errEl.style.display = 'block';
        setExportEnabled(false);
    });
}

function renderAll() {
    var input = inputEl.value;
    countEl.textContent = input.length + ' / ' + MAX_INPUT + ' 字符';
    countEl.style.color = input.length > MAX_INPUT ? '#dc2626' : '#6b7280';
    errEl.style.display = 'none';
    var v = validateDDLInput(input);
    if (!v.valid) {
        statEl.textContent = v.message;
        state.parsed = null;
        state.mermaidCode = '';
        codeEl.textContent = '';
        renderTables({ tables: [] });
        renderRelations({ relationships: [] });
        renderDiag({ unparsed: [] });
        previewEl.innerHTML = '<div class="ed-empty">解析出表之后，这里会显示关系图</div>';
        state.svg = '';
        setExportEnabled(false);
        return;
    }
    var parsed;
    try {
        parsed = parseDDL(input);
    } catch (e) {
        errEl.textContent = '解析失败：' + e.message;
        errEl.style.display = 'block';
        return;
    }
    state.parsed = parsed;
    var code = ddlToMermaid(parsed);
    state.mermaidCode = code;
    codeEl.textContent = code;
    statEl.textContent = '已解析 ' + parsed.summary.tableCount + ' 张表、' +
        parsed.summary.columnCount + ' 个字段、' + parsed.summary.relationshipCount + ' 条关系' +
        (parsed.summary.unparsedCount ? '，' + parsed.summary.unparsedCount + ' 行未解析' : '');
    renderTables(parsed);
    renderRelations(parsed);
    renderDiag(parsed);
    renderMermaidNow();
}

function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 2000);
}

function ts() {
    var d = new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
}

function ensureSvgHeader(svg) {
    var out = svg;
    if (out.indexOf('xmlns=') < 0) out = out.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
    return out;
}

function svgSize(svg) {
    var w = svg.match(/width="([\d.]+)"/), h = svg.match(/height="([\d.]+)"/);
    if (w && h) return { w: parseFloat(w[1]), h: parseFloat(h[1]) };
    var vb = svg.match(/viewBox="[\d.\s-]+([\d.]+)\s+([\d.]+)"/);
    if (vb) return { w: parseFloat(vb[1]), h: parseFloat(vb[2]) };
    return { w: 1200, h: 800 };
}

function copyText(text, okMsg) {
    function done(ok) {
        tip(ok ? okMsg : '复制失败：请手动选中复制', ok);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
    } else {
        var ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        var ok = false;
        try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
        document.body.removeChild(ta);
        done(ok);
    }
}

function init() {
    inputEl = $('ed-input');
    statEl = $('ed-statline');
    countEl = $('ed-count');
    errEl = $('ed-err');
    tablesEl = $('ed-tables');
    relEl = $('ed-relations');
    codeEl = $('ed-mermaid-code');
    diagEl = $('ed-diag');
    previewEl = $('ed-preview');
    vendorTipEl = $('ed-vendor-tip');
    svgDlBtn = $('ed-svgdl');
    pngBtn = $('ed-png');
    themeSel = $('ed-theme');
    scaleSel = $('ed-scale');
    bgSel = $('ed-bg');

    renderPresets();
    var timer = null;
    inputEl.addEventListener('input', function () {
        clearTimeout(timer);
        timer = setTimeout(renderAll, 300);
    });
    $('ed-parse-btn').addEventListener('click', renderAll);
    $('ed-clear').addEventListener('click', function () {
        inputEl.value = '';
        renderAll();
        inputEl.focus();
    });
    $('ed-copy-mermaid').addEventListener('click', function () {
        if (!state.mermaidCode) { tip('暂无可复制的 Mermaid 代码', false); return; }
        copyText(state.mermaidCode, '已复制 Mermaid 代码');
    });
    $('ed-copy-summary').addEventListener('click', function () {
        if (!state.parsed) { tip('暂无可复制的解析摘要', false); return; }
        copyText(buildSummary(state.parsed), '已复制解析摘要');
    });
    themeSel.addEventListener('change', function () {
        state.theme = this.value;
        previewEl.classList.toggle('ed-dark', this.value === 'dark');
        if (state.mermaidCode) renderMermaidNow();
    });
    svgDlBtn.addEventListener('click', function () {
        if (!state.svg) return;
        downloadBlob(new Blob([ensureSvgHeader(state.svg)], { type: 'image/svg+xml;charset=utf-8' }), 'er-diagram-' + ts() + '.svg');
    });
    pngBtn.addEventListener('click', function () {
        if (!state.svg) return;
        var btn = this;
        btn.disabled = true;
        var scale = parseInt(scaleSel.value, 10) || 2;
        var bgMode = bgSel.value;
        if (state.theme === 'dark' && bgMode === 'white') {
            tip('提醒：当前为「深色」主题，浅色文字在白色背景 PNG 上可能看不清；建议选「背景：透明」重新导出。', false);
        }
        var svg = ensureSvgHeader(state.svg);
        var size = svgSize(svg);
        var cw = Math.round(size.w * scale), ch = Math.round(size.h * scale);
        var img = new Image();
        var url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
        img.onload = function () {
            try {
                var canvas = document.createElement('canvas');
                canvas.width = cw;
                canvas.height = ch;
                var ctx = canvas.getContext('2d');
                if (bgMode === 'white') {
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, cw, ch);
                }
                ctx.drawImage(img, 0, 0, cw, ch);
                canvas.toBlob(function (blob) {
                    if (blob) downloadBlob(blob, 'er-diagram-' + ts() + '.png');
                    btn.disabled = false;
                    URL.revokeObjectURL(url);
                }, 'image/png');
            } catch (e) {
                btn.disabled = false;
                URL.revokeObjectURL(url);
                tip('PNG 导出失败：' + e.message, false);
            }
        };
        img.onerror = function () {
            btn.disabled = false;
            URL.revokeObjectURL(url);
            tip('PNG 导出失败：SVG 转图片失败', false);
        };
        img.src = url;
    });

    inputEl.value = SAMPLES[0].ddl;
    renderAll();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

}
})();
