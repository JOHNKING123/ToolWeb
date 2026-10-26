/* Conventional Commit 提交信息生成器（conventional_commit_generator）- 纯前端零上传
* 选 type（11 项）／填 scope（可选）／描述（必填）／正文（可选）／breaking 开关＋说明
* → 实时生成单条提交信息：标题行＋（空行＋正文）＋（空行＋BREAKING CHANGE footer）。
* 标题：无 scope 为 `type: 描述`，有 scope 为 `type(scope): 描述`；
* breaking 开启时标题加 `!`，有说明时追加 `BREAKING CHANGE: 说明` footer，
* 无说明时只加 `!`、不生成空 footer，并提示建议填写说明。
* 校验：描述为空中文提示且不输出；scope 只允许小写字母／数字／连字符／下划线，
* 非法中文提示且不输出；描述超 72 字符仅软提示仍生成。
* 正文与 breaking 说明中的换行统一转为空格；渲染一律用 textContent，
* 输入里的 HTML 只显示为文本。零网络请求：本文件不发起任何请求。
* 浏览器与 node 测试共用同一纯函数；浏览器绑定只在有 document 时执行。 */
(function () {
'use strict';

var TYPES = [
  { id: 'feat', label: 'feat', desc: '新功能：向用户交付的新特性' },
  { id: 'fix', label: 'fix', desc: '修复缺陷：修掉一个 bug' },
  { id: 'docs', label: 'docs', desc: '文档：只改文档，不改代码' },
  { id: 'style', label: 'style', desc: '格式：空格、分号、换行等，不影响代码含义' },
  { id: 'refactor', label: 'refactor', desc: '重构：既不修 bug 也不加功能，只改代码结构' },
  { id: 'perf', label: 'perf', desc: '性能优化：提升运行速度或降低资源占用' },
  { id: 'test', label: 'test', desc: '测试：补测试、改测试，不改业务代码' },
  { id: 'build', label: 'build', desc: '构建：构建系统、依赖、打包配置' },
  { id: 'ci', label: 'ci', desc: '持续集成：CI 配置与脚本' },
  { id: 'chore', label: 'chore', desc: '杂项：不改源码与测试的其他改动' },
  { id: 'revert', label: 'revert', desc: '回滚：撤销之前的一次提交' }
];

function trim(s) { return String(s == null ? '' : s).replace(/^\s+|\s+$/g, ''); }

/* 换行展平：CRLF／LF／孤 CR 各转一个空格；其他字符与首尾外的空格原样保留。 */
function flattenText(s) {
  return String(s == null ? '' : s).replace(/\r\n|\r|\n/g, ' ');
}

/* scope 校验：空（留空不生成括号）合法；非空只允许小写字母／数字／连字符／下划线。
* 先去首尾空格再校验，含空格或非法字符返回 invalid。 */
function validateScope(scope) {
  var s = trim(scope);
  if (s === '') return { valid: true, scope: '', error: '' };
  if (/^[a-z0-9_-]+$/.test(s)) return { valid: true, scope: s, error: '' };
  return {
    valid: false, scope: s,
    error: 'scope 格式不对：只允许小写字母、数字、连字符（-）和下划线（_），请去掉空格与大写字母、中文等非法字符。'
  };
}

/* 描述校验：空为硬错；超 72 字符为软提示（仍生成）。 */
function validateDescription(description) {
  var s = trim(description);
  if (s === '') return { valid: false, description: '', error: '描述不能为空：请填写本次提交做了什么，再生成提交信息。', tooLong: false };
  return {
    valid: true, description: s, error: '',
    tooLong: s.length > 72,
    soft: s.length > 72 ? '提示：描述已超过 72 字符（当前 ' + s.length + ' 字符），建议精简，仍可正常生成。' : ''
  };
}

/* 生成单条提交信息。opts: { type, scope, description, body, breaking, breakingDesc }。
* 返回 { message, error, warnings }：硬错时 message 为空串且不输出误导结果；
* warnings 为软提示数组（超长、breaking 无说明），不阻塞生成。 */
function buildCommit(opts) {
  opts = opts || {};
  var type = 'feat';
  var i;
  for (i = 0; i < TYPES.length; i++) {
    if (TYPES[i].id === opts.type) { type = opts.type; break; }
  }
  var scopeCheck = validateScope(opts.scope);
  if (!scopeCheck.valid) return { message: '', error: scopeCheck.error, warnings: [] };
  var descCheck = validateDescription(opts.description);
  if (!descCheck.valid) return { message: '', error: descCheck.error, warnings: [] };
  var warnings = [];
  if (descCheck.tooLong) warnings.push(descCheck.soft);
  var breaking = !!opts.breaking;
  var breakingDesc = trim(flattenText(opts.breakingDesc));
  if (breaking && breakingDesc === '') {
    warnings.push('提示：已开启 breaking，但破坏性说明为空，标题只加 !，未生成 BREAKING CHANGE footer，建议填写破坏性说明。');
  }
  var header = type;
  if (scopeCheck.scope !== '') header += '(' + scopeCheck.scope + ')';
  if (breaking) header += '!';
  header += ': ' + descCheck.description;
  var parts = [header];
  var body = trim(flattenText(opts.body));
  if (body !== '') { parts.push(''); parts.push(body); }
  if (breaking && breakingDesc !== '') { parts.push(''); parts.push('BREAKING CHANGE: ' + breakingDesc); }
  return { message: parts.join('\n'), error: '', warnings: warnings };
}

var DEFAULTS = {
  type: 'feat', scope: '', description: '', body: '', breaking: false, breakingDesc: ''
};

var SAMPLE_FEAT = {
  type: 'feat', scope: 'api', description: '重构鉴权接口',
  body: '将 token 校验抽离为独立中间件，统一错误码。',
  breaking: true, breakingDesc: '旧鉴权接口不再接受明文 token，请改用 Bearer 方案'
};
var SAMPLE_FIX = {
  type: 'fix', scope: '', description: '修复登录页在弱网下重复提交的问题',
  body: '', breaking: false, breakingDesc: ''
};
var SAMPLE_DOCS = {
  type: 'docs', scope: '', description: '补充提交信息规范说明',
  body: '说明 type 与 scope 的取值范围与 breaking 写法。',
  breaking: false, breakingDesc: ''
};

var api = {
  TYPES: TYPES,
  trim: trim,
  flattenText: flattenText,
  validateScope: validateScope,
  validateDescription: validateDescription,
  buildCommit: buildCommit,
  DEFAULTS: DEFAULTS,
  SAMPLE_FEAT: SAMPLE_FEAT,
  SAMPLE_FIX: SAMPLE_FIX,
  SAMPLE_DOCS: SAMPLE_DOCS
};
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.ConventionalCommitGenerator = api;

/* ---------------- 浏览器绑定（仅有 document 时执行） ---------------- */
if (typeof document !== 'undefined') {
  function $(id) { return document.getElementById(id); }

  function readForm() {
    return {
      type: $('ccg-type') ? $('ccg-type').value : 'feat',
      scope: $('ccg-scope') ? $('ccg-scope').value : '',
      description: $('ccg-description') ? $('ccg-description').value : '',
      body: $('ccg-body') ? $('ccg-body').value : '',
      breaking: $('ccg-breaking') ? $('ccg-breaking').checked : false,
      breakingDesc: $('ccg-breaking-desc') ? $('ccg-breaking-desc').value : ''
    };
  }

  function applyForm(values) {
    if ($('ccg-type')) $('ccg-type').value = values.type;
    if ($('ccg-scope')) $('ccg-scope').value = values.scope;
    if ($('ccg-description')) $('ccg-description').value = values.description;
    if ($('ccg-body')) $('ccg-body').value = values.body;
    if ($('ccg-breaking')) $('ccg-breaking').checked = values.breaking;
    if ($('ccg-breaking-desc')) $('ccg-breaking-desc').value = values.breakingDesc;
    renderAll();
  }

  function renderAll() {
    var result = buildCommit(readForm());
    var outEl = $('ccg-output');
    var warnEl = $('ccg-warn');
    var hintEl = $('ccg-hint');
    var copyBtn = $('ccg-copy');
    var dlBtn = $('ccg-download');
    if (outEl) outEl.value = result.message;
    if (warnEl) {
      var msgs = [];
      if (result.error) msgs.push(result.error);
      if (result.warnings) msgs = msgs.concat(result.warnings);
      if (msgs.length > 0) {
        warnEl.style.display = 'block';
        warnEl.textContent = msgs.join('\n');
      } else {
        warnEl.style.display = 'none';
        warnEl.textContent = '';
      }
    }
    if (hintEl) {
      hintEl.textContent = result.message === ''
        ? '暂无可复制的提交信息：请先按提示修正输入。'
        : '已生成单条提交信息，可复制或下载 commit-message.txt。';
    }
    if (copyBtn) copyBtn.disabled = result.message === '';
    if (dlBtn) dlBtn.disabled = result.message === '';
  }

  function copyOutput() {
    var outEl = $('ccg-output');
    var hintEl = $('ccg-copy-hint');
    if (!outEl || outEl.value === '') return;
    function ok() { if (hintEl) hintEl.textContent = '已复制到剪贴板。'; }
    function fail() {
      if (hintEl) hintEl.textContent = '复制失败：请手动全选输出框内容复制（点击输出框，按 Ctrl+A 全选，再按 Ctrl+C 复制）。';
      if (outEl) { outEl.focus(); outEl.select(); }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(outEl.value).then(ok, fail);
    } else {
      outEl.focus();
      outEl.select();
      try { if (document.execCommand('copy')) ok(); else fail(); } catch (e) { fail(); }
    }
  }

  function downloadOutput() {
    var outEl = $('ccg-output');
    if (!outEl || outEl.value === '') return;
    var blob = new Blob([outEl.value], { type: 'text/plain;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'commit-message.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  document.addEventListener('DOMContentLoaded', function () {
    var typeSel = $('ccg-type');
    if (typeSel) {
      var typeHint = $('ccg-type-hint');
      typeSel.addEventListener('change', function () {
        var t = null;
        var i;
        for (i = 0; i < TYPES.length; i++) {
          if (TYPES[i].id === typeSel.value) { t = TYPES[i]; break; }
        }
        if (typeHint) typeHint.textContent = t ? t.desc : '';
        renderAll();
      });
    }
    var ids = ['ccg-scope', 'ccg-description', 'ccg-body', 'ccg-breaking-desc'];
    var j;
    for (j = 0; j < ids.length; j++) {
      var el = $(ids[j]);
      if (el) el.addEventListener('input', renderAll);
    }
    var breakingEl = $('ccg-breaking');
    if (breakingEl) breakingEl.addEventListener('change', renderAll);
    var s1 = $('ccg-sample-feat');
    if (s1) s1.addEventListener('click', function () { applyForm(SAMPLE_FEAT); });
    var s2 = $('ccg-sample-fix');
    if (s2) s2.addEventListener('click', function () { applyForm(SAMPLE_FIX); });
    var s3 = $('ccg-sample-docs');
    if (s3) s3.addEventListener('click', function () { applyForm(SAMPLE_DOCS); });
    var resetBtn = $('ccg-reset');
    if (resetBtn) resetBtn.addEventListener('click', function () { applyForm(DEFAULTS); });
    var copyBtn = $('ccg-copy');
    if (copyBtn) copyBtn.addEventListener('click', copyOutput);
    var dlBtn = $('ccg-download');
    if (dlBtn) dlBtn.addEventListener('click', downloadOutput);
    renderAll();
  });
}
})();
