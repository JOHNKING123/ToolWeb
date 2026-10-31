/* JSON 转 Kotlin data class - 纯前端类型推断
 * 纯函数契约（失败约定沿用家族惯例：非法参数抛 Error，err.field 给出字段名，不静默钳制）：
 * 1) toPascalCase(s) → PascalCase
 *    - s 非字符串抛 Error（err.field="s"）；''→'Field'；数字开头加 'N' 前缀。
 * 2) toCamelCase(s) → camelCase
 *    - s 非字符串抛 Error（err.field="s"）。
 * 3) kotlinScalarFor(node) → Kotlin 标量类型名
 *    - 'String'/'Int'/'Long'/'Double'/'Boolean'/'Any?'（null/unknown）/'List<T>'（数组）；
 *    - node 非对象或 kind 未知抛 Error（err.field="node"）。
 * 4) generateKotlin(parsed, opts) → 完整 Kotlin 源码字符串
 *    - parsed 非对象/数组抛 Error（err.field="json"）；
 *    - opts.rootName 非字符串或 trim 为空抛 Error（err.field="rootName"）。
 * 类型推断规则：嵌套对象拆独立 data class（首次出现顺序，同名冲突追加 2、3…）；
 * 数组→List<T>；空数组→List<Any>；超 Int 范围整数→Long；浮点→Double；
 * null 样本→Any?（nullable:false 时→Any）；属性名 camelCase；
 * 仅当 JSON key ≠ 属性名时输出 @SerializedName（有注解自动 import）。
 * 零网络请求：本文件不发起任何 fetch / XHR；JSON 只在浏览器本地处理，不上传。
 */
(function () {
'use strict';

function badParam(field, message) {
  var e = new Error(message);
  e.field = field;
  return e;
}

/* ---------- 命名 ---------- */
function toPascalCase(s) {
  if (typeof s !== 'string') {
    throw badParam('s', 'toPascalCase(s)：s 须为字符串，实得 ' + String(s));
  }
  var t = s.replace(/[^a-zA-Z0-9]+/g, ' ');
  t = t.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  t = t.replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
  var parts = t.split(/\s+/).filter(Boolean);
  var out = parts.map(function (p) {
    return p.charAt(0).toUpperCase() + p.slice(1);
  }).join('');
  if (!out) out = 'Field';
  if (/^[0-9]/.test(out)) out = 'N' + out;
  return out;
}

function toCamelCase(s) {
  if (typeof s !== 'string') {
    throw badParam('s', 'toCamelCase(s)：s 须为字符串，实得 ' + String(s));
  }
  var p = toPascalCase(s);
  if (!p) return 'field';
  return p.charAt(0).toLowerCase() + p.slice(1);
}

/* ---------- 类型推断 ---------- */
// Type node:
// {kind:'string'|'int'|'long'|'float'|'bool'|'null'|'unknown'}
// {kind:'object', fields:[{key, type}]}
// {kind:'array', elem:type}

var INT_MAX = 2147483647;
var INT_MIN = -2147483648;

function inferKotlin(value) {
  if (value === null) return { kind: 'null' };
  if (Array.isArray(value)) {
    if (value.length === 0) return { kind: 'array', elem: { kind: 'unknown' } };
    var merged = inferKotlin(value[0]);
    for (var i = 1; i < value.length; i++) merged = mergeTypes(merged, inferKotlin(value[i]));
    return { kind: 'array', elem: merged };
  }
  switch (typeof value) {
    case 'string': return { kind: 'string' };
    case 'boolean': return { kind: 'bool' };
    case 'number':
      if (!Number.isInteger(value)) return { kind: 'float' };
      return (value > INT_MAX || value < INT_MIN) ? { kind: 'long' } : { kind: 'int' };
    case 'object': {
      var fields = Object.keys(value).map(function (k) {
        return { key: k, type: inferKotlin(value[k]) };
      });
      return { kind: 'object', fields: fields };
    }
    default: return { kind: 'unknown' };
  }
}

function typeSig(t) {
  if (!t) return '?';
  if (t.kind === 'object') {
    return 'o{' + t.fields.map(function (f) { return f.key + ':' + typeSig(f.type); }).join(',') + '}';
  }
  if (t.kind === 'array') return 'a<' + typeSig(t.elem) + '>';
  return t.kind;
}

function mergeObjectFields(a, b) {
  var fields = [], map = {};
  a.fields.forEach(function (f) {
    var nf = { key: f.key, type: f.type };
    fields.push(nf); map[f.key] = nf;
  });
  b.fields.forEach(function (f) {
    if (map[f.key]) map[f.key].type = mergeTypes(map[f.key].type, f.type);
    else { var nf2 = { key: f.key, type: f.type }; fields.push(nf2); map[f.key] = nf2; }
  });
  return { kind: 'object', fields: fields };
}

function mergeTypes(a, b) {
  if (typeSig(a) === typeSig(b)) return a;
  if (a.kind === 'null') return b;
  if (b.kind === 'null') return a;
  if (a.kind === 'unknown') return b;
  if (b.kind === 'unknown') return a;
  // 数值拓宽：int+long→long，int/float→float，long+float→float
  var numRank = { int: 1, long: 2, float: 3 };
  if (numRank[a.kind] && numRank[b.kind]) {
    var top = numRank[a.kind] >= numRank[b.kind] ? a.kind : b.kind;
    return { kind: top };
  }
  if (a.kind === 'object' && b.kind === 'object') return mergeObjectFields(a, b);
  if (a.kind === 'array' && b.kind === 'array') {
    return { kind: 'array', elem: mergeTypes(a.elem, b.elem) };
  }
  return { kind: 'unknown' };
}

/* node → Kotlin 类型名（纯映射，不依赖选项） */
function kotlinScalarFor(node) {
  if (!node || typeof node !== 'object' || typeof node.kind !== 'string') {
    throw badParam('node', 'kotlinScalarFor(node)：node 须为含 kind 的类型节点');
  }
  switch (node.kind) {
    case 'string': return 'String';
    case 'int': return 'Int';
    case 'long': return 'Long';
    case 'float': return 'Double';
    case 'bool': return 'Boolean';
    case 'null': return 'Any?';
    case 'unknown': return 'Any?';
    case 'array': return 'List<' + kotlinScalarFor(node.elem || { kind: 'unknown' }) + '>';
    case 'object': return node.name ? String(node.name) : 'Any';
    default:
      throw badParam('node', 'kotlinScalarFor(node)：未知 kind ' + JSON.stringify(node.kind));
  }
}

/* ---------- 类收集（命名＋去重） ---------- */
function collectClasses(rootType, rootName) {
  var defs = [];        // [{name, node}]，根类在前、嵌套按首次出现顺序
  var seen = new Map(); // node -> name
  var used = {};        // name -> true

  function uniqueName(base) {
    if (!used[base]) { used[base] = true; return base; }
    var i = 2;
    while (used[base + i]) i++;
    used[base + i] = true;
    return base + i;
  }

  function visit(type, suggested) {
    if (!type) return;
    if (type.kind === 'object') {
      if (seen.has(type)) return;
      var name = uniqueName(suggested);
      seen.set(type, name);
      defs.push({ name: name, node: type });
      type.fields.forEach(function (f) {
        visit(f.type, toPascalCase(f.key));
      });
      return;
    }
    if (type.kind === 'array') {
      visit(type.elem, suggested + 'Item');
    }
  }

  visit(rootType, rootName);
  return { defs: defs, nameOf: function (t) { return seen.get(t); } };
}

var KOTLIN_KEYWORDS = {
  'as': 1, 'break': 1, 'class': 1, 'continue': 1, 'do': 1, 'else': 1,
  'false': 1, 'for': 1, 'fun': 1, 'if': 1, 'in': 1, 'interface': 1,
  'is': 1, 'null': 1, 'object': 1, 'package': 1, 'return': 1, 'super': 1,
  'this': 1, 'throw': 1, 'true': 1, 'try': 1, 'typealias': 1, 'val': 1,
  'var': 1, 'when': 1, 'while': 1
};

function escapeKotlinString(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/* ---------- 主生成函数 ---------- */
function generateKotlin(parsed, opts) {
  if (parsed === null || typeof parsed !== 'object') {
    throw badParam('json', 'generateKotlin(parsed, opts)：parsed 须为对象或数组');
  }
  opts = opts || {};
  var rootName = opts.rootName === undefined ? 'Root' : opts.rootName;
  if (typeof rootName !== 'string' || rootName.trim() === '') {
    throw badParam('rootName', 'generateKotlin(parsed, opts)：opts.rootName 须为非空字符串');
  }
  var useAnnot = opts.serializedName !== false; // 默认开
  var useNullable = opts.nullable !== false;    // 默认开
  var root = toPascalCase(rootName.trim()) || 'Root';

  var rootType = inferKotlin(parsed);
  var ctx = collectClasses(rootType, root);
  var defs = ctx.defs;
  var hasAnnot = false;

  function renderType(t) {
    switch (t.kind) {
      case 'string': return 'String';
      case 'int': return 'Int';
      case 'long': return 'Long';
      case 'float': return 'Double';
      case 'bool': return 'Boolean';
      case 'null': return useNullable ? 'Any?' : 'Any';
      case 'unknown': return 'Any';
      case 'array': return 'List<' + renderType(t.elem) + '>';
      case 'object': return ctx.nameOf(t) || 'Any';
      default: return 'Any';
    }
  }

  function propName(key, usedProps) {
    var p = toCamelCase(key) || 'field';
    if (/^[0-9]/.test(p)) p = 'n' + p;
    if (KOTLIN_KEYWORDS[p]) p = '`' + p + '`';
    var base = p, i = 2;
    while (usedProps[base]) { base = p + i; i++; }
    usedProps[base] = true;
    return base;
  }

  function renderClass(def) {
    var lines = ['data class ' + def.name + '('];
    var usedProps = {};
    def.node.fields.forEach(function (f, idx) {
      var prop = propName(f.key, usedProps);
      var semantic = prop.replace(/^`|`$/g, ''); // 去掉关键字反引号转义后的语义名
      if (useAnnot && semantic !== f.key) {
        hasAnnot = true;
        lines.push('    @SerializedName("' + escapeKotlinString(f.key) + '")');
      }
      var comma = idx < def.node.fields.length - 1 ? ',' : '';
      lines.push('    val ' + prop + ': ' + renderType(f.type) + comma);
    });
    lines.push(')');
    return lines.join('\n');
  }

  var blocks = defs.map(renderClass);
  if (rootType.kind !== 'object') {
    if (blocks.length === 0) {
      // 根为纯标量/无对象数组：用 typealias 表达
      blocks.push('typealias ' + root + ' = ' + renderType(rootType));
    } else {
      // 根为含对象的数组：类已输出，补根别名
      blocks.push('typealias ' + root + ' = ' + renderType(rootType));
    }
  }
  var body = blocks.join('\n\n');
  if (hasAnnot) {
    return 'import com.google.gson.annotations.SerializedName\n\n' + body;
  }
  return body;
}

/* node 测试导出（浏览器侧无 module，走下方 DOM 逻辑） */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    toPascalCase: toPascalCase,
    toCamelCase: toCamelCase,
    kotlinScalarFor: kotlinScalarFor,
    inferKotlin: inferKotlin,
    generateKotlin: generateKotlin
  };
}

/* ---------- DOM 逻辑（仅浏览器） ---------- */
if (typeof document !== 'undefined') {

function $(id) { return document.getElementById(id); }

function toast(msg) {
  var el = document.createElement('div');
  el.textContent = msg;
  el.style.cssText = 'position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);background:#111827;color:#fff;padding:.6rem 1.2rem;border-radius:.5rem;z-index:9999;font-size:.9rem;max-width:86vw;text-align:center;';
  document.body.appendChild(el);
  setTimeout(function () { if (el.parentNode) document.body.removeChild(el); }, 1800);
}

var SAMPLE = {
  user_name: 'zhangsan',
  age: 28,
  vip: true,
  balance: 1234.56,
  big_id: 9223372036854775807,
  nickname: null,
  address: { city: '深圳', zip: '518000' },
  tags: ['开发者', '开源'],
  orders: [
    { order_id: 'A001', amount: 199.9 },
    { order_id: 'A002', amount: 59 }
  ],
  empty_list: []
};

var output = '';
var debounceTimer = null;

function showError(msg) {
  var e = $('jk-error');
  if (msg) { e.textContent = 'JSON 解析失败：' + msg; e.style.display = 'block'; }
  else { e.textContent = ''; e.style.display = 'none'; }
}

function currentOpts() {
  return {
    rootName: $('jk-root').value,
    serializedName: $('jk-annot').checked,
    nullable: $('jk-nullable').checked
  };
}

function fileName() {
  var n = toPascalCase(($('jk-root').value || '').trim() || 'Root') || 'Root';
  return n + '.kt';
}

function generate() {
  var text = $('jk-input').value;
  if (!text.trim()) { output = ''; showError(''); $('jk-output').textContent = ''; return; }
  var data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    showError(e.message);
    return; // 不崩溃、不清屏：保留上一次输出
  }
  showError('');
  try {
    output = generateKotlin(data, currentOpts());
  } catch (e2) {
    showError(e2.message);
    return;
  }
  $('jk-output').textContent = output;
}

function scheduleGenerate() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(generate, 300);
}

document.addEventListener('DOMContentLoaded', function () {
  $('jk-input').addEventListener('input', scheduleGenerate);
  $('jk-root').addEventListener('input', scheduleGenerate);
  $('jk-annot').addEventListener('change', scheduleGenerate);
  $('jk-nullable').addEventListener('change', scheduleGenerate);
  $('jk-sample').addEventListener('click', function () {
    $('jk-input').value = JSON.stringify(SAMPLE, null, 2);
    generate();
    toast('示例已载入');
  });
  $('jk-format').addEventListener('click', function () {
    var text = $('jk-input').value;
    if (!text.trim()) { toast('请先输入 JSON'); return; }
    try {
      $('jk-input').value = JSON.stringify(JSON.parse(text), null, 2);
      showError('');
      generate();
    } catch (e) { showError(e.message); }
  });
  $('jk-clear').addEventListener('click', function () {
    $('jk-input').value = '';
    output = '';
    showError('');
    $('jk-output').textContent = '';
  });
  $('jk-copy').addEventListener('click', function () {
    if (!output) { toast('没有可复制的内容'); return; }
    function done() { toast('已复制生成结果'); }
    function fail() { toast('复制失败，请手动复制'); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(output).then(done, fail);
    } else {
      var ta = document.createElement('textarea');
      ta.value = output; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { fail(); }
      document.body.removeChild(ta);
    }
  });
  $('jk-download').addEventListener('click', function () {
    if (!output) { toast('没有可下载的内容'); return; }
    var blob = new Blob([output], { type: 'text/plain;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName();
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); document.body.removeChild(a); }, 500);
  });
  generate();
});

}
})();
