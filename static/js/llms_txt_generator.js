/* llms.txt 生成器（llms_txt_generator）- 纯前端本地生成
 * 表单向导（网站标题/一句话摘要/网站根 URL/内容分节链接/细节文本）
 * → 标准 llms.txt 文本实时预览 → 规范校验（逐项定位字段）
 * → 一键复制 / 下载 llms.txt，全程零上传。
 * 纯函数双模式导出：defaultLlmsInput / buildLlmsTxt / validateLlmsTxt / llmsFileName。
 * 失败约定：非法参数抛 Error，err.field 为 "input" / "title" / "link"，不静默钳制。
 * 纯函数经 module.exports 暴露供 node 测试；浏览器里走 DOM。
 * 零网络请求：本文件不发起任何网络请求。 */
(function () {
  'use strict';

  /* ---------- 小工具 ---------- */

  /* 带字段名的失败。 */
  function fail(field, message) {
    var e = new Error(message);
    e.field = field;
    throw e;
  }

  function str(v) { return v == null ? '' : String(v); }

  function trim(v) { return str(v).replace(/^\s+|\s+$/g, ''); }

  /* 是否 http(s):// 开头。 */
  function isHttpUrl(u) { return /^https?:\/\//i.test(trim(u)); }

  /* ---------- 纯函数 ---------- */

  /* 默认输入对象：sections 至少一个默认节（含一个空链接行，表单可直接编辑）。 */
  function defaultLlmsInput() {
    return {
      title: '',
      summary: '',
      detail: '',
      rootUrl: '',
      sections: [
        { name: '', links: [{ text: '', url: '' }] }
      ]
    };
  }

  /* 输入对象 → 标准 llms.txt 文本。
   * 版式：首行 "# {title}"、空行、"> {summary}"、空行、
   * （detail 非空时细节段＋空行）、每个 section "## {name}"、空行、
   * 每条 "- [{text}]({url})"，section 间空行分隔，末尾单个换行。
   * rootUrl 为表单辅助字段（相对链接提示／使用说明动态地址），不写入文本，
   * 因 llmstxt.org 标准格式中无此指令位。 */
  function buildLlmsTxt(input) {
    if (input == null || typeof input !== 'object' || Array.isArray(input)) {
      fail('input', '输入必须是对象（含 title / summary / sections 等字段）');
    }
    if (Object.keys(input).length === 0) {
      fail('input', '输入对象为空，请至少填写网站标题');
    }
    var title = trim(input.title);
    if (title === '') {
      fail('title', '网站标题（title）不能为空');
    }
    var summary = trim(input.summary);
    var detail = trim(input.detail);
    var sections = input.sections == null ? [] : input.sections;
    if (!Array.isArray(sections)) {
      fail('input', 'sections 必须是数组（每项含 name / links）');
    }

    var lines = [];
    lines.push('# ' + title);
    lines.push('');
    lines.push(summary === '' ? '>' : '> ' + summary);
    lines.push('');
    if (detail !== '') {
      detail.split('\n').forEach(function (ln) {
        lines.push(ln.replace(/\s+$/g, ''));
      });
      lines.push('');
    }
    sections.forEach(function (sec) {
      if (sec == null || typeof sec !== 'object' || Array.isArray(sec)) {
        fail('input', 'section 必须是对象（含 name / links）');
      }
      var links = sec.links == null ? [] : sec.links;
      if (!Array.isArray(links)) {
        fail('input', 'section.links 必须是数组（每项含 text / url）');
      }
      lines.push('## ' + trim(sec.name));
      lines.push('');
      links.forEach(function (lk) {
        if (lk == null || typeof lk !== 'object' || Array.isArray(lk)) {
          fail('input', 'link 必须是对象（含 text / url）');
        }
        lines.push('- [' + trim(lk.text) + '](' + trim(lk.url) + ')');
      });
      lines.push('');
    });
    while (lines.length > 0 && lines[lines.length - 1] === '') {
      lines.pop();
    }
    return lines.length > 0 ? lines.join('\n') + '\n' : '';
  }

  /* 标准文本 → issues 数组（每项 {field, message}）。
   * 规则：首行须为 "# " 开头（否则 field=title）；
   * 以 "- [" 起始的行须符合 "- [text](url)" 形状（否则 field=link）；
   * 链接 URL 须 http(s):// 开头（否则 field=link）。
   * text 非字符串时抛 Error（err.field=input）。 */
  function validateLlmsTxt(text) {
    if (typeof text !== 'string') {
      fail('input', '待校验内容必须是字符串');
    }
    var issues = [];
    var lines = text.split('\n');
    var first = lines.length > 0 ? lines[0] : '';
    if (first.indexOf('# ') !== 0) {
      issues.push({
        field: 'title',
        message: '首行应为「# 网站标题」格式（# 后加一个空格），当前首行为「' + first + '」'
      });
    }
    var linkShape = /^-\s*\[([^\]]*)\]\(([^)]*)\)$/;
    lines.forEach(function (raw, i) {
      var line = trim(raw);
      if (!/^-\s*\[/.test(line)) {
        return; /* 非链接行（如细节段里的普通列表／分隔线），不按链接校验 */
      }
      var n = i + 1;
      var m = linkShape.exec(line);
      if (!m) {
        issues.push({
          field: 'link',
          message: '第 ' + n + ' 行不是合法的链接行，应为「- [链接文本](https://…)」格式'
        });
        return;
      }
      var url = trim(m[2]);
      if (!isHttpUrl(url)) {
        issues.push({
          field: 'link',
          message: '第 ' + n + ' 行链接 URL 须以 http:// 或 https:// 开头，当前为「' + url + '」'
        });
      }
    });
    return issues;
  }

  /* 下载文件名。 */
  function llmsFileName() {
    return 'llms.txt';
  }

  /* ---------- 导出：node 下导出纯函数并提前返回，浏览器里继续走 DOM ---------- */

  var API = {
    defaultLlmsInput: defaultLlmsInput,
    buildLlmsTxt: buildLlmsTxt,
    validateLlmsTxt: validateLlmsTxt,
    llmsFileName: llmsFileName
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
    return;
  }
  if (typeof window !== 'undefined') {
    window.LlmsTxtGenerator = API;
  }

  /* ---------------- 浏览器 DOM 逻辑（零网络） ---------------- */

  function $(id) { return document.getElementById(id); }

  var titleEl = $('llg-title');
  var summaryEl = $('llg-summary');
  var rootUrlEl = $('llg-rooturl');
  var detailEl = $('llg-detail');
  var sectionsEl = $('llg-sections');
  var previewEl = $('llg-preview');
  var warnBox = $('llg-warn');
  var warnList = $('llg-warn-list');
  var issuesBox = $('llg-issues');
  var issuesList = $('llg-issues-list');
  var step3Url = $('llg-step3-url');

  if (!titleEl || !sectionsEl || !previewEl) {
    return; /* 非本工具页 */
  }

  /* state 与 defaultLlmsInput() 同构，可直接编辑 */
  var state = defaultLlmsInput();

  /* ---------- 表单级实时警告（中文，不阻断输入） ---------- */
  function formWarnings() {
    var ws = [];
    if (trim(state.title) === '') {
      ws.push({ field: 'title', target: 'llg-title', message: '网站标题为空：llms.txt 首行「# 标题」必填，请填写。' });
    }
    var ru = trim(state.rootUrl);
    if (ru !== '' && !isHttpUrl(ru)) {
      ws.push({ field: 'rootUrl', target: 'llg-rooturl', message: '网站根 URL 应以 http:// 或 https:// 开头，当前为「' + ru + '」。' });
    }
    state.sections.forEach(function (s, si) {
      var sn = si + 1;
      s.links.forEach(function (l, li) {
        var t = trim(l.text), u = trim(l.url);
        if (t === '' && u === '') {
          return;
        }
        var ln = li + 1;
        if (t === '' || u === '') {
          ws.push({ field: 'link', target: 'llg-sections', message: '第 ' + sn + ' 节第 ' + ln + ' 条链接：链接文本与 URL 须成对填写。' });
        } else if (!isHttpUrl(u)) {
          ws.push({ field: 'link', target: 'llg-sections', message: '第 ' + sn + ' 节第 ' + ln + ' 条链接 URL 应以 http(s):// 开头，当前为「' + u + '」。' });
        }
      });
      if (trim(s.name) === '' && s.links.some(function (l) { return trim(l.text) !== '' || trim(l.url) !== ''; })) {
        ws.push({ field: 'section', target: 'llg-sections', message: '第 ' + sn + ' 节名称为空：节名会生成「## 」空标题行，请补上节名。' });
      }
    });
    return ws;
  }

  /* ---------- 文本生成（过滤全空行／全空节） ---------- */
  function cleanedInput() {
    var sections = [];
    state.sections.forEach(function (s) {
      var links = s.links.filter(function (l) {
        return trim(l.text) !== '' || trim(l.url) !== '';
      });
      if (trim(s.name) === '' && links.length === 0) {
        return;
      }
      sections.push({ name: s.name, links: links });
    });
    return {
      title: state.title,
      summary: state.summary,
      detail: state.detail,
      rootUrl: state.rootUrl,
      sections: sections
    };
  }

  function currentText() {
    return buildLlmsTxt(cleanedInput());
  }

  /* ---------- 渲染（用户输入一律经 textContent／DOM 写入，不拼 HTML） ---------- */
  function renderPreview() {
    var text = '';
    try {
      text = currentText();
    } catch (e) {
      text = '';
    }
    previewEl.innerHTML = '';
    if (text === '') {
      var hint = document.createElement('span');
      hint.className = 'llg-empty';
      hint.textContent = trim(state.title) === ''
        ? '# 请先在左侧填写「网站标题」，标准 llms.txt 将在这里实时生成'
        : '# 暂无可生成的内容，请补充一句话摘要或分节链接';
      previewEl.appendChild(hint);
    } else {
      previewEl.textContent = text;
    }
    /* 使用说明第三步的验证地址随根 URL 动态变化 */
    var ru = trim(state.rootUrl);
    step3Url.textContent = (ru !== '' && isHttpUrl(ru) ? ru.replace(/\/+$/g, '') : 'https://你的域名') + '/llms.txt';
  }

  function renderWarnings(ws) {
    warnList.innerHTML = '';
    if (ws.length === 0) {
      warnBox.classList.remove('show');
      return;
    }
    warnBox.classList.add('show');
    ws.forEach(function (w) {
      var li = document.createElement('li');
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'llg-issue-link';
      b.textContent = w.message;
      b.addEventListener('click', function () { locate(w.target); });
      li.appendChild(b);
      warnList.appendChild(li);
    });
  }

  function issueFieldName(f) {
    return f === 'title' ? '标题' : (f === 'link' || f === 'section') ? '链接' : '输入';
  }

  function issueTarget(f) {
    return f === 'title' ? 'llg-title' : (f === 'rootUrl' ? 'llg-rooturl' : 'llg-sections');
  }

  function renderIssues(issues) {
    issuesList.innerHTML = '';
    issuesBox.classList.remove('ok');
    if (issues.length === 0) {
      issuesBox.classList.add('ok');
      var li = document.createElement('li');
      li.textContent = '校验通过：符合 llms.txt 基本规范（# 标题 / > 摘要 / ## 分节 / - [文本](URL)，链接均为 http(s) 开头）。';
      issuesList.appendChild(li);
      return;
    }
    issues.forEach(function (it) {
      var item = document.createElement('li');
      var tag = document.createElement('b');
      tag.textContent = '【' + issueFieldName(it.field) + '】';
      item.appendChild(tag);
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'llg-issue-link';
      b.textContent = it.message;
      b.addEventListener('click', function () { locate(issueTarget(it.field)); });
      item.appendChild(b);
      issuesList.appendChild(item);
    });
    issuesBox.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function locate(targetId) {
    var el = $(targetId);
    if (!el) {
      return;
    }
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      setTimeout(function () { el.focus({ preventScroll: true }); }, 350);
    } else {
      el.classList.add('llg-flash');
      setTimeout(function () { el.classList.remove('llg-flash'); }, 1600);
    }
  }

  function renderSections() {
    sectionsEl.innerHTML = '';
    state.sections.forEach(function (s, si) {
      var box = document.createElement('div');
      box.className = 'llg-section';

      var head = document.createElement('div');
      head.className = 'llg-section-head';
      var badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = '第 ' + (si + 1) + ' 节';
      head.appendChild(badge);

      var nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.placeholder = '节名，如：文档 / 博客 / 产品';
      nameInput.value = s.name;
      nameInput.setAttribute('autocomplete', 'off');
      nameInput.setAttribute('aria-label', '第 ' + (si + 1) + ' 节名称');
      nameInput.addEventListener('input', function () { s.name = nameInput.value; update(); });
      head.appendChild(nameInput);

      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'llg-del';
      del.textContent = '删除本节';
      del.addEventListener('click', function () {
        state.sections.splice(si, 1);
        if (state.sections.length === 0) {
          state.sections.push({ name: '', links: [{ text: '', url: '' }] });
        }
        sync();
      });
      head.appendChild(del);
      box.appendChild(head);

      s.links.forEach(function (l, li) {
        var row = document.createElement('div');
        row.className = 'llg-row';
        var t = document.createElement('input');
        t.type = 'text';
        t.placeholder = '链接文本，如：API 文档';
        t.value = l.text;
        t.setAttribute('autocomplete', 'off');
        t.setAttribute('aria-label', '第 ' + (si + 1) + ' 节第 ' + (li + 1) + ' 条链接文本');
        t.addEventListener('input', function () { l.text = t.value; update(); });
        var u = document.createElement('input');
        u.type = 'text';
        u.placeholder = 'URL，如：https://example.com/docs/api';
        u.value = l.url;
        u.setAttribute('autocomplete', 'off');
        u.setAttribute('aria-label', '第 ' + (si + 1) + ' 节第 ' + (li + 1) + ' 条链接 URL');
        u.addEventListener('input', function () { l.url = u.value; update(); });
        var rm = document.createElement('button');
        rm.type = 'button';
        rm.className = 'llg-rm';
        rm.title = '删除该链接';
        rm.textContent = '✕';
        rm.addEventListener('click', function () { s.links.splice(li, 1); sync(); });
        row.appendChild(t);
        row.appendChild(u);
        row.appendChild(rm);
        box.appendChild(row);
      });

      var add = document.createElement('button');
      add.type = 'button';
      add.className = 'llg-btn-sm';
      add.textContent = '＋ 新增链接';
      add.addEventListener('click', function () { s.links.push({ text: '', url: '' }); sync(); });
      box.appendChild(add);

      sectionsEl.appendChild(box);
    });
  }

  /* update: 只刷新警告＋预览（输入时调用，不重建 DOM，避免焦点丢失）
   * sync: 数据结构变化后重建分节编辑区 ＋ update */
  function update() {
    renderWarnings(formWarnings());
    renderPreview();
  }
  function sync() {
    renderSections();
    update();
  }

  /* ---------- 复制 / 下载 / 提示 ---------- */
  function copyText(t, okMsg) {
    if (!t) {
      toast('内容为空，无需复制');
      return;
    }
    function done() { toast(okMsg || '已复制到剪贴板'); }
    function failTip() { toast('复制失败，请手动复制'); }
    if (navigator.clipboard && window.isSecureContext !== false) {
      navigator.clipboard.writeText(t).then(done, function () { fallbackCopy(t, done, failTip); });
    } else {
      fallbackCopy(t, done, failTip);
    }
  }
  function fallbackCopy(t, done, failTip) {
    var ta = document.createElement('textarea');
    ta.value = t;
    ta.style.cssText = 'position:fixed;opacity:0;';
    document.body.appendChild(ta);
    ta.select();
    try {
      if (document.execCommand('copy')) {
        done();
      } else {
        failTip();
      }
    } catch (e) {
      failTip();
    }
    document.body.removeChild(ta);
  }
  function toast(msg) {
    var el = document.createElement('div');
    el.textContent = msg;
    el.style.cssText = 'position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);background:#111827;color:#fff;padding:.6rem 1.2rem;border-radius:.5rem;z-index:9999;font-size:.9rem;max-width:90vw;text-align:center;';
    document.body.appendChild(el);
    setTimeout(function () { if (el.parentNode) { el.parentNode.removeChild(el); } }, 1800);
  }

  /* ---------- 事件绑定 ---------- */
  titleEl.addEventListener('input', function () { state.title = titleEl.value; update(); });
  summaryEl.addEventListener('input', function () { state.summary = summaryEl.value; update(); });
  rootUrlEl.addEventListener('input', function () { state.rootUrl = rootUrlEl.value; update(); });
  detailEl.addEventListener('input', function () { state.detail = detailEl.value; update(); });

  $('llg-add-section').addEventListener('click', function () {
    state.sections.push({ name: '', links: [{ text: '', url: '' }] });
    sync();
  });
  $('llg-copy').addEventListener('click', function () {
    var text = '';
    try {
      text = currentText();
    } catch (e) {
      toast(e.message);
      return;
    }
    copyText(text, 'llms.txt 已复制');
  });
  $('llg-download').addEventListener('click', function () {
    var text = '';
    try {
      text = currentText();
    } catch (e) {
      toast(e.message);
      return;
    }
    var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = llmsFileName();
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
    toast('llms.txt 已开始下载');
  });
  $('llg-validate').addEventListener('click', function () {
    var issues;
    try {
      issues = validateLlmsTxt(currentText());
    } catch (e) {
      issues = [{ field: e.field || 'input', message: e.message }];
    }
    renderIssues(issues);
  });

  /* ---------- 初始化 ---------- */
  sync();
})();
