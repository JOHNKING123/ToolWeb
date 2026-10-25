/* HTML/SVG→JSX 转换器（html_jsx_converter）- 纯前端词法级转换
 * 粘贴 HTML/SVG 源码 → 属性映射（class→className、for→htmlFor、SVG
 * camelCase 如 stroke-width→strokeWidth、xlink:href→xlinkHref）、void 标签
 * 自闭合、内联 style 对象化（style={{color:'red',fontSize:'14px'}}）、
 * HTML 注释→{/* *\/}、布尔属性保留无值；规则逐项可开关。
 * 词法级：只做字面转换，不做语义校验、不解析 JS 表达式、不读用户
 * 项目文件；未知属性原样保留并列入报告。
 * 转换不走 DOM 注入：浏览器与 node 测试共用同一手写分词/解析器。
 * 零网络请求：本文件不发起任何网络请求。 */
(function () {
'use strict';

var VOID_TAGS = { area: 1, base: 1, br: 1, col: 1, embed: 1, hr: 1,
  img: 1, input: 1, link: 1, meta: 1, param: 1, source: 1, track: 1, wbr: 1 };
/* 内容按原文取、不当标签解析的标签（脚本样式不执行、不展开子树）。 */
var RAW_TAGS = { script: 1, style: 1, textarea: 1, title: 1 };

/* 属性映射表（键为小写原名）。事件属性故意不映射：onclick 之类的值是
 * JS 表达式，本工具不解析 JS 表达式，故原样保留并列入报告。 */
var ATTR_MAP = {
  'class': 'className', 'for': 'htmlFor', 'tabindex': 'tabIndex',
  'readonly': 'readOnly', 'maxlength': 'maxLength', 'minlength': 'minLength',
  'colspan': 'colSpan', 'rowspan': 'rowSpan', 'cellpadding': 'cellPadding',
  'cellspacing': 'cellSpacing', 'datetime': 'dateTime', 'usemap': 'useMap',
  'accesskey': 'accessKey', 'contenteditable': 'contentEditable',
  'accept-charset': 'acceptCharset', 'http-equiv': 'httpEquiv',
  'charset': 'charSet', 'crossorigin': 'crossOrigin',
  'autofocus': 'autoFocus', 'autoplay': 'autoPlay', 'formaction': 'formAction',
  'hreflang': 'hrefLang', 'srcset': 'srcSet', 'playsinline': 'playsInline',
  'novalidate': 'noValidate', 'formnovalidate': 'formNoValidate',
  'stroke-width': 'strokeWidth', 'stroke-linecap': 'strokeLinecap',
  'stroke-linejoin': 'strokeLinejoin', 'stroke-dasharray': 'strokeDasharray',
  'stroke-dashoffset': 'strokeDashoffset', 'stroke-miterlimit': 'strokeMiterlimit',
  'stroke-opacity': 'strokeOpacity', 'fill-rule': 'fillRule',
  'fill-opacity': 'fillOpacity', 'clip-path': 'clipPath', 'clip-rule': 'clipRule',
  'font-family': 'fontFamily', 'font-size': 'fontSize',
  'font-weight': 'fontWeight', 'font-style': 'fontStyle',
  'text-anchor': 'textAnchor', 'text-decoration': 'textDecoration',
  'xlink:href': 'xlinkHref', 'xlink:title': 'xlinkTitle', 'xml:space': 'xmlSpace'
};
/* 布尔属性（无值时 JSX 里保留无值形式，如 checked）。 */
var BOOLEAN_ATTRS = { checked: 1, disabled: 1, selected: 1, multiple: 1,
  required: 1, hidden: 1, open: 1, loop: 1, muted: 1, controls: 1, 'default': 1,
  readonly: 1, autofocus: 1, autoplay: 1, async: 1, defer: 1,
  reversed: 1, playsinline: 1 };
/* 原样通过、不计入保留清单的常规属性（本身就是合法 JSX 属性名）。 */
var KNOWN_ATTRS = { id: 1, href: 1, src: 1, alt: 1, title: 1, type: 1,
  value: 1, name: 1, placeholder: 1, target: 1, rel: 1, action: 1,
  method: 1, width: 1, height: 1, viewbox: 1, d: 1, points: 1, cx: 1, cy: 1,
  r: 1, rx: 1, ry: 1, x: 1, y: 1, x1: 1, y1: 1, x2: 1, y2: 1, transform: 1,
  fill: 1, stroke: 1, opacity: 1, color: 1, lang: 1, dir: 1, min: 1, max: 1,
  step: 1, pattern: 1, autocomplete: 1, accept: 1, viewBox: 1,
  preserveaspectratio: 1, gradienttransform: 1, pathlength: 1 };

var DEFAULT_RULES = { map: true, voidSelfClose: true, styleObject: true,
  commentConvert: true, booleanBare: true };

function emptyReport() {
  return { mappingCount: 0, mappings: [], selfClosedCount: 0, selfClosed: [],
    styleCount: 0, styleProps: [], commentCount: 0, preservedCount: 0,
    preserved: [] };
}
function bump(list, key, field) {
  for (var i = 0; i < list.length; i++) {
    if (list[i][field] === key) { list[i].count++; return; }
  }
  var item = { count: 1 }; item[field] = key; list.push(item);
}
function bumpMapping(report, from, to) {
  for (var i = 0; i < report.mappings.length; i++) {
    if (report.mappings[i].from === from && report.mappings[i].to === to) {
      report.mappings[i].count++; report.mappingCount++; return;
    }
  }
  report.mappings.push({ from: from, to: to, count: 1 }); report.mappingCount++;
}

/* ---------- 分词/解析：手写扫描器，不走 DOM 注入/DOMParser ---------- */
function parseAttrs(attrText) {
  var attrs = [];
  var re = /([A-Za-z_:][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  var m;
  while ((m = re.exec(attrText)) !== null) {
    var val = m[2] !== undefined ? m[2] : (m[3] !== undefined ? m[3] : (m[4] !== undefined ? m[4] : null));
    attrs.push({ name: m[1], value: val, hasValue: val !== null });
  }
  return attrs;
}

function parseSource(src) {
  var root = { type: 'root', children: [] };
  var stack = [root];
  var i = 0, n = src.length;
  function top() { return stack[stack.length - 1]; }
  function pushText(t) {
    if (t) top().children.push({ type: 'text', value: t });
  }
  while (i < n) {
    var lt = src.indexOf('<', i);
    if (lt === -1) { pushText(src.slice(i)); break; }
    if (lt > i) pushText(src.slice(i, lt));
    if (src.slice(lt, lt + 4) === '<!--') {
      var end = src.indexOf('-->', lt + 4);
      if (end === -1) {
        top().children.push({ type: 'comment', value: src.slice(lt + 4) }); break;
      }
      top().children.push({ type: 'comment', value: src.slice(lt + 4, end) });
      i = end + 3; continue;
    }
    if (src.slice(lt, lt + 9) === '<![CDATA[') {
      var cend = src.indexOf(']]>', lt + 9);
      if (cend === -1) { pushText(src.slice(lt + 9)); break; }
      pushText(src.slice(lt + 9, cend)); i = cend + 3; continue;
    }
    if (src.slice(lt, lt + 2) === '<!' || src.slice(lt, lt + 2) === '<?') {
      var gend = src.indexOf('>', lt + 2);
      if (gend === -1) { i = n; break; }
      top().children.push({ type: 'directive', value: src.slice(lt + 2, gend) });
      i = gend + 1; continue;
    }
    if (src.slice(lt, lt + 2) === '</') {
      var gend2 = src.indexOf('>', lt + 2);
      if (gend2 === -1) { i = n; break; }
      var closeName = src.slice(lt + 2, gend2).trim().toLowerCase();
      for (var s = stack.length - 1; s >= 1; s--) {
        if (stack[s].tag === closeName) { stack.length = s; break; }
      }
      i = gend2 + 1; continue;
    }
    var ch = src.charAt(lt + 1);
    if (!/[A-Za-z]/.test(ch)) { pushText('<'); i = lt + 1; continue; }
    var gt = -1, quote = null;
    for (var j = lt + 1; j < n; j++) {
      var c = src.charAt(j);
      if (quote) { if (c === quote) quote = null; }
      else if (c === '"' || c === "'") quote = c;
      else if (c === '>') { gt = j; break; }
    }
    if (gt === -1) { pushText(src.slice(lt)); break; }
    var inner = src.slice(lt + 1, gt);
    var selfClosing = /\/\s*$/.test(inner);
    if (selfClosing) inner = inner.replace(/\/\s*$/, '');
    var sp = inner.search(/\s/);
    var tag = (sp === -1 ? inner : inner.slice(0, sp)).toLowerCase();
    var attrText = sp === -1 ? '' : inner.slice(sp + 1);
    var el = { type: 'element', tag: tag, attrs: parseAttrs(attrText),
      children: [], selfClosing: selfClosing };
    top().children.push(el);
    if (VOID_TAGS[tag] || selfClosing) {
      i = gt + 1; continue;
    }
    if (RAW_TAGS[tag]) {
      var closeRe = new RegExp('</' + tag + '\\s*>', 'i');
      var rest = src.slice(gt + 1);
      var cm = closeRe.exec(rest);
      if (cm) {
        if (cm.index > 0) el.children.push({ type: 'text', value: rest.slice(0, cm.index) });
        i = gt + 1 + cm.index + cm[0].length;
      } else {
        if (rest) el.children.push({ type: 'text', value: rest });
        i = n;
      }
      continue;
    }
    stack.push(el);
    i = gt + 1;
  }
  return root;
}

/* ---------- style 对象化：只做字面转换，不补单位、不展开简写 ---------- */
function splitTopLevel(s, sep) {
  var parts = [], depth = 0, quote = null, cur = '';
  for (var i = 0; i < s.length; i++) {
    var c = s.charAt(i);
    if (quote) { cur += c; if (c === quote) quote = null; }
    else if (c === '"' || c === "'") { quote = c; cur += c; }
    else if (c === '(') { depth++; cur += c; }
    else if (c === ')') { if (depth > 0) depth--; cur += c; }
    else if (c === sep && depth === 0) { parts.push(cur); cur = ''; }
    else cur += c;
  }
  parts.push(cur);
  return parts;
}
function cssPropToJs(prop) {
  if (prop.slice(0, 2) === '--') return prop;
  var vendor = false;
  if (prop.charAt(0) === '-') { vendor = true; prop = prop.slice(1); }
  var out = prop.replace(/-([a-z])/g, function (m, l) { return l.toUpperCase(); });
  if (vendor && out) out = out.charAt(0).toUpperCase() + out.slice(1);
  return out;
}
function styleToObject(value, report) {
  var decls = splitTopLevel(value, ';');
  var parts = [];
  for (var i = 0; i < decls.length; i++) {
    var d = decls[i].trim();
    if (!d) continue;
    var ci = -1, depth = 0, quote = null;
    for (var j = 0; j < d.length; j++) {
      var c = d.charAt(j);
      if (quote) { if (c === quote) quote = null; }
      else if (c === '"' || c === "'") quote = c;
      else if (c === '(') depth++;
      else if (c === ')') { if (depth > 0) depth--; }
      else if (c === ':' && depth === 0) { ci = j; break; }
    }
    if (ci === -1) continue;
    var prop = cssPropToJs(d.slice(0, ci).trim());
    var val = d.slice(ci + 1).trim();
    if (!prop || !val) continue;
    if (report.styleProps.indexOf(prop) === -1) report.styleProps.push(prop);
    var key = /^[A-Za-z_$][\w$]*$/.test(prop) ? prop : "'" + prop.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
    parts.push(key + ": '" + val.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'");
  }
  return parts.length ? 'style={{' + parts.join(', ') + '}}' : null;
}

/* ---------- 属性转换 ---------- */
function attrValueString(v) {
  return '"' + String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '"';
}
function convertAttrs(attrs, rules, report) {
  var out = [];
  for (var i = 0; i < attrs.length; i++) {
    var a = attrs[i];
    var key = a.name.toLowerCase();
    if (key === 'style' && rules.styleObject && a.hasValue && a.value.trim() !== '') {
      var obj = styleToObject(a.value, report);
      if (obj) { out.push(obj); report.styleCount++; continue; }
      continue; /* 空 style 或无有效声明：直接丢弃，不计数 */
    }
    if (key === 'style' && !rules.styleObject && a.hasValue) {
      out.push('style=' + attrValueString(a.value)); continue;
    }
    if (key === 'style' && !a.hasValue) continue;
    if (rules.map && Object.prototype.hasOwnProperty.call(ATTR_MAP, key)) {
      var mapped = ATTR_MAP[key];
      bumpMapping(report, a.name, mapped);
      if (BOOLEAN_ATTRS[key] && !a.hasValue) {
        out.push(rules.booleanBare ? mapped : mapped + '="true"');
      } else if (BOOLEAN_ATTRS[key] && rules.booleanBare && a.hasValue &&
                 (a.value === '' || a.value.toLowerCase() === a.name.toLowerCase() ||
                  a.value.toLowerCase() === mapped.toLowerCase())) {
        out.push(mapped);
      } else if (a.hasValue) {
        out.push(mapped + '=' + attrValueString(a.value));
      } else {
        out.push(mapped);
      }
      continue;
    }
    if (BOOLEAN_ATTRS[key] && !a.hasValue) {
      out.push(rules.booleanBare ? a.name : a.name + '="true"');
      continue;
    }
    if (BOOLEAN_ATTRS[key] && rules.booleanBare && a.hasValue &&
        (a.value === '' || a.value.toLowerCase() === a.name.toLowerCase())) {
      out.push(a.name); continue;
    }
    if (!Object.prototype.hasOwnProperty.call(KNOWN_ATTRS, key) &&
        !Object.prototype.hasOwnProperty.call(ATTR_MAP, key)) {
      bump(report.preserved, a.name, 'name'); report.preservedCount++;
    }
    if (a.hasValue) out.push(a.name + '=' + attrValueString(a.value));
    else out.push(a.name);
  }
  return out.length ? ' ' + out.join(' ') : '';
}

/* ---------- 渲染 ---------- */
function escapeJsxText(t) {
  return String(t).replace(/{/g, "{'{'}").replace(/}/g, "{'}'}");
}
function isWsText(node) {
  return node.type === 'text' && /^\s*$/.test(node.value);
}
function renderComment(value, rules, report) {
  if (rules.commentConvert) {
    report.commentCount++;
    return '{/* ' + String(value).replace(/\*\//g, '* /').trim() + ' */}';
  }
  return '<!--' + value + '-->';
}
function renderNode(node, level, rules, report, root) {
  var pad = '';
  for (var p = 0; p < level; p++) pad += '  ';
  if (node.type === 'text') return pad + escapeJsxText(node.value);
  if (node.type === 'comment') return pad + renderComment(node.value, rules, report);
  if (node.type === 'directive') {
    if (rules.commentConvert) {
      report.commentCount++;
      return pad + '{/* ' + String(node.value).replace(/\*\//g, '* /').trim() + ' */}';
    }
    return pad + '<!' + node.value + '>';
  }
  if (node.type !== 'element') return '';
  var attrs = convertAttrs(node.attrs, rules, report);
  var isVoid = !!VOID_TAGS[node.tag];
  if (isVoid) {
    if (rules.voidSelfClose && !node.selfClosing) {
      bump(report.selfClosed, node.tag, 'tag'); report.selfClosedCount++;
      return pad + '<' + node.tag + attrs + ' />';
    }
    if (node.selfClosing) return pad + '<' + node.tag + attrs + ' />';
    return pad + '<' + node.tag + attrs + '>';
  }
  var children = [];
  for (var i = 0; i < node.children.length; i++) {
    if (!isWsText(node.children[i])) children.push(node.children[i]);
  }
  if (children.length === 0) {
    if (node.selfClosing) return pad + '<' + node.tag + attrs + ' />';
    /* 未闭合且无子节点：JSX 里必须自闭合，计入自闭合改动。 */
    bump(report.selfClosed, node.tag, 'tag'); report.selfClosedCount++;
    return pad + '<' + node.tag + attrs + ' />';
  }
  var hasElementChild = false;
  for (var k = 0; k < children.length; k++) {
    if (children[k].type === 'element' || children[k].type === 'comment' ||
        children[k].type === 'directive') { hasElementChild = true; break; }
  }
  if (!hasElementChild) {
    var innerText = '';
    for (var t = 0; t < children.length; t++) {
      if (children[t].type === 'text') innerText += escapeJsxText(children[t].value);
      else innerText += renderNode(children[t], 0, rules, report, false);
    }
    return pad + '<' + node.tag + attrs + '>' + innerText + '</' + node.tag + '>';
  }
  var lines = [pad + '<' + node.tag + attrs + '>'];
  for (var c = 0; c < children.length; c++) {
    var rendered = renderNode(children[c], level + 1, rules, report, false);
    if (rendered !== '') lines.push(rendered);
  }
  lines.push(pad + '</' + node.tag + '>');
  return lines.join('\n');
}

function validateComponentName(name) {
  if (!name) return '请填写组件名。';
  if (!/^[A-Za-z_$][\w$]*$/.test(name)) return '组件名不是合法标识符：' + name + '（只允许字母、数字、下划线、$，且不能以数字开头）。';
  if (!/^[A-Z_$]/.test(name)) return '组件名须以大写字母开头（React 组件名首字母须大写）：“' + name + '”首字母为小写。';
  return null;
}

function convert(source, options) {
  options = options || {};
  var rules = {};
  var dk;
  for (dk in DEFAULT_RULES) {
    rules[dk] = options.rules && options.rules[dk] !== undefined
      ? options.rules[dk] : DEFAULT_RULES[dk];
  }
  var mode = options.mode || 'fragment';
  var report = emptyReport();
  if (source === undefined || source === null || String(source).trim() === '') {
    return { valid: false, error: '请输入 HTML 或 SVG 源码后再转换。', code: '', report: report };
  }
  if (mode === 'component') {
    var nameErr = validateComponentName(options.componentName);
    if (nameErr) return { valid: false, error: nameErr, code: '', report: report };
  }
  var root = parseSource(String(source));
  var top = [];
  for (var i = 0; i < root.children.length; i++) {
    if (!isWsText(root.children[i])) top.push(root.children[i]);
  }
  if (top.length === 0) {
    return { valid: false, error: '请输入 HTML 或 SVG 源码后再转换。', code: '', report: report };
  }
  var parts = [];
  for (var j = 0; j < top.length; j++) {
    var r = renderNode(top[j], 0, rules, report, true);
    if (r !== '') parts.push(r);
  }
  var body = parts.join('\n');
  if (mode === 'component') {
    var name = options.componentName;
    var singleRoot = top.length === 1 && top[0].type === 'element';
    var inner;
    if (singleRoot) {
      inner = body.split('\n').map(function (line, idx) {
        return idx === 0 ? '    ' + line : '    ' + line;
      }).join('\n');
      return { valid: true, error: '', report: report,
        code: 'export default function ' + name + '() {\n  return (\n' + inner + '\n  );\n}' };
    }
    var wrapped = body.split('\n').map(function (line) { return '      ' + line; }).join('\n');
    return { valid: true, error: '', report: report,
      code: 'export default function ' + name + '() {\n  return (\n    <>\n' + wrapped + '\n    </>\n  );\n}' };
  }
  return { valid: true, error: '', code: body, report: report };
}

var EXAMPLES = [
  { title: 'HTML 卡片',
    html: '<!-- 卡片标题区 -->\n<div class="card" data-id="c1">\n  <h2>欢迎回来</h2>\n  <p style="color: #333; font-size: 14px;">这是你的个人主页卡片。</p>\n  <br>\n  <img src="/avatar.png" alt="头像">\n  <label for="nickname">昵称</label>\n  <input type="text" id="nickname" placeholder="输入昵称">\n</div>' },
  { title: 'SVG 图标',
    html: '<svg viewBox="0 0 24 24" class="icon" width="24" height="24" aria-hidden="true">\n  <path d="M12 2L2 7l10 5 10-5-10-5z" fill-rule="evenodd" stroke-width="2" stroke-linejoin="round" />\n  <path d="M2 17l10 5 10-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />\n</svg>' },
  { title: '表单（含布尔属性与原样保留）',
    html: '<!-- 订阅表单 -->\n<form action="/subscribe" method="post">\n  <label for="email">邮箱</label>\n  <input type="email" id="email" name="email" required>\n  <label><input type="checkbox" checked> 接收每周简报</label>\n  <button type="submit" disabled>提交</button>\n  <div data-tracking="signup-form" aria-label="订阅表单" custom-attr="keep-me">提交后请查收确认邮件。</div>\n</form>' }
];

var api = { convert: convert, parseSource: parseSource,
  validateComponentName: validateComponentName, DEFAULT_RULES: DEFAULT_RULES,
  ATTR_MAP: ATTR_MAP, EXAMPLES: EXAMPLES, styleToObject: styleToObject };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.HtmlJsxConverter = api;

/* ---------- 浏览器绑定（只在有 document 时执行；转换本身不走 DOM 注入） ---------- */
if (typeof document !== 'undefined') {
  function $(id) { return document.getElementById(id); }
  function toast(msg) {
    var t = $('jx-toast'); if (!t) return;
    t.textContent = msg; t.style.display = 'block';
    setTimeout(function () { t.style.display = 'none'; }, 2600);
  }
  function showError(msg) {
    var el = $('jx-errors'); if (!el) return;
    if (msg) { el.textContent = msg; el.style.display = 'block'; }
    else { el.textContent = ''; el.style.display = 'none'; }
  }
  function readRules() {
    return {
      map: !!$('jx-rule-map') && $('jx-rule-map').checked,
      voidSelfClose: !!$('jx-rule-void') && $('jx-rule-void').checked,
      styleObject: !!$('jx-rule-style') && $('jx-rule-style').checked,
      commentConvert: !!$('jx-rule-comment') && $('jx-rule-comment').checked,
      booleanBare: !!$('jx-rule-boolean') && $('jx-rule-boolean').checked
    };
  }
  function readMode() {
    var comp = $('jx-mode-component');
    return comp && comp.checked ? 'component' : 'fragment';
  }
  function reportText(report) {
    var lines = [];
    lines.push('属性映射 ' + report.mappingCount + ' 处' +
      (report.mappings.length ? '：' + report.mappings.map(function (m) {
        return m.from + '→' + m.to + '（' + m.count + '）'; }).join('、') : '（无）'));
    lines.push('自闭合 ' + report.selfClosedCount + ' 处' +
      (report.selfClosed.length ? '：' + report.selfClosed.map(function (s) {
        return '<' + s.tag + '>（' + s.count + '）'; }).join('、') : '（无）'));
    lines.push('style 对象化 ' + report.styleCount + ' 处' +
      (report.styleProps.length ? '：' + report.styleProps.join('、') : '（无）'));
    lines.push('注释转换 ' + report.commentCount + ' 处');
    lines.push('原样保留 ' + report.preservedCount + ' 处' +
      (report.preserved.length ? '（data-* / aria-* / 未知属性）：' + report.preserved.map(function (p) {
        return p.name + '（' + p.count + '）'; }).join('、') : '（无）'));
    return lines.join('\n');
  }
  function doConvert() {
    var input = $('jx-input') ? $('jx-input').value : '';
    var mode = readMode();
    var nameEl = $('jx-component-name');
    var res = convert(input, { mode: mode,
      componentName: nameEl ? nameEl.value.trim() : '',
      rules: readRules() });
    if (!res.valid) {
      showError(res.error);
      var rp = $('jx-result'); if (rp) rp.style.display = 'none';
      return;
    }
    showError('');
    var out = $('jx-output'); if (out) out.value = res.code;
    var rep = $('jx-report'); if (rep) rep.textContent = reportText(res.report);
    var panel = $('jx-result'); if (panel) panel.style.display = 'block';
  }
  function bindPage() {
    var btn = $('jx-convert'); if (btn) btn.addEventListener('click', doConvert);
    var input = $('jx-input');
    if (input) input.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') doConvert();
    });
    var exBtns = document.querySelectorAll('[data-example]');
    for (var i = 0; i < exBtns.length; i++) {
      (function (b) {
        b.addEventListener('click', function () {
          var idx = parseInt(b.getAttribute('data-example'), 10);
          if (EXAMPLES[idx] && $('jx-input')) $('jx-input').value = EXAMPLES[idx].html;
        });
      })(exBtns[i]);
    }
    var copyBtn = $('jx-copy');
    if (copyBtn) copyBtn.addEventListener('click', function () {
      var out = $('jx-output'); if (!out || !out.value) return;
      function fallback() {
        try {
          out.focus(); out.select();
          if (document.execCommand('copy')) { toast('已复制到剪贴板'); return; }
        } catch (e) { /* 走降级提示 */ }
        toast('复制失败，请手动选中输出框内容按 Ctrl+C 复制');
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(out.value).then(function () {
          toast('已复制到剪贴板');
        }, fallback);
      } else fallback();
    });
    var dlBtn = $('jx-download');
    if (dlBtn) dlBtn.addEventListener('click', function () {
      var out = $('jx-output'); if (!out || !out.value) return;
      var mode = readMode();
      var nameEl = $('jx-component-name');
      var filename = mode === 'component' && nameEl && /^[A-Za-z_$][\w$]*$/.test(nameEl.value.trim())
        ? nameEl.value.trim() + '.jsx' : 'converted.jsx';
      var blob = new Blob([out.value], { type: 'text/plain;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 500);
      toast('已下载 ' + filename);
    });
    var modeRadios = document.querySelectorAll('input[name="jx-mode"]');
    for (var r = 0; r < modeRadios.length; r++) {
      modeRadios[r].addEventListener('change', function () {
        var wrap = $('jx-name-row');
        if (wrap) wrap.style.display = readMode() === 'component' ? 'flex' : 'none';
      });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindPage);
  else bindPage();
}
})();
