/* 简历模板生成器（Resume Builder）：分段表单录入 / 多模板实时预览 / A4 打印导出 PDF / localStorage 暂存
*
* 功能：
*  1) 左侧分段表单：基本信息 / 求职意向 / 教育经历 / 工作经历 / 项目经历 / 专业技能 / 荣誉证书；
*     必填与格式校验（姓名、期望职位、手机号、邮箱），输入长度限制。
*  2) 4 套内置模板（简约商务 minimal / 现代双栏 twocol / 学术严谨 academic / 创意配色 creative）
*     实时预览，一键切换，内容保留。
*  3) @media print A4 打印样式：仅输出简历页，浏览器「另存为 PDF」即得 PDF 简历。
*  4) localStorage 自动暂存（tw_resume_builder_v1），示例简历一键载入。
*  5) 与 /tools/resume-checker 双向互链，形成「生成→诊断」闭环。
* 纯函数全部经 module.exports 暴露，node tests/resume_builder.test.js 自测；
* 浏览器内 init 挂 DOMContentLoaded；无网络请求（零上传）。
*/
(function () {
"use strict";

/* ---------- 1. 基础 ---------- */
var LS_KEY = "tw_resume_builder_v1";

var TEMPLATES = [
  {id: "minimal",  name: "简约商务", desc: "黑白灰经典单栏，标题下划线，适合大多数岗位"},
  {id: "twocol",   name: "现代双栏", desc: "左侧深色信息栏＋右侧经历主栏，层次分明"},
  {id: "academic", name: "学术严谨", desc: "居中标题＋细分割线，稳重克制，适合国企/学术/考公"},
  {id: "creative", name: "创意配色", desc: "彩色头图＋技能标签，适合设计/运营/市场岗位"}
];

var PHONE_RE = /^1[3-9]\d{9}$/;
var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/* 空简历数据结构 */
function defaultData() {
  return {
    basic:     {name: "", gender: "", birth: "", phone: "", email: "", city: ""},
    intention: {position: "", city: "", salary: "", type: "全职"},
    education: [],   /* {school, major, degree, start, end, desc} */
    work:      [],   /* {company, position, start, end, desc} */
    projects:  [],   /* {name, role, tech, start, end, desc} */
    skills:    "",   /* 每行一条 */
    honors:    ""    /* 每行一条 */
  };
}

function isTemplateId(id) {
  for (var i = 0; i < TEMPLATES.length; i++) if (TEMPLATES[i].id === id) return true;
  return false;
}
function normalizeTemplateId(id) { return isTemplateId(id) ? id : TEMPLATES[0].id; }

/* ---------- 2. 文本小工具 ---------- */
/* splitLines：多行文本 → 去空行后的转义行数组 */
function splitLines(text) {
  var lines = String(text == null ? "" : text).split(/\r?\n/), out = [];
  for (var i = 0; i < lines.length; i++) {
    var t = lines[i].trim();
    if (t) out.push(esc(t));
  }
  return out;
}

/* bullets：多行文本 → <li>…</li> 数组（已转义） */
function bullets(text) {
  var ls = splitLines(text), out = [];
  for (var i = 0; i < ls.length; i++) out.push("<li>" + ls[i] + "</li>");
  return out;
}

/* dateRange：起止时间 → "2021.09 – 2024.06"（任一为空则只显示另一端） */
function dateRange(start, end) {
  var s = String(start == null ? "" : start).trim();
  var e = String(end == null ? "" : end).trim();
  if (s && e) return esc(s) + " – " + esc(e);
  return esc(s || e);
}

/* ph：空值占位（预览时灰色「待填写」，打印亦可见、诚实不造假） */
function ph(v) {
  return String(v == null ? "" : v).trim() ? esc(v) : '<span class="rb-ph">待填写</span>';
}

/* ---------- 3. 校验 ---------- */
/* validateResume：{errors[], warnings[], ok}；errors 阻断性（必填/格式），warnings 建议性 */
function validateResume(d) {
  var errors = [], warnings = [];
  d = d || {};
  var basic = d.basic || {}, intention = d.intention || {};
  if (!String(basic.name || "").trim()) errors.push("请填写姓名（基本信息）");
  if (!String(intention.position || "").trim()) errors.push("请填写期望职位（求职意向）");
  var phone = String(basic.phone || "").trim();
  var email = String(basic.email || "").trim();
  if (phone && !PHONE_RE.test(phone)) errors.push("手机号格式不正确（需 11 位大陆手机号）");
  if (email && !EMAIL_RE.test(email)) errors.push("邮箱格式不正确");
  if (!phone && !email) warnings.push("建议至少填写手机号或邮箱中的一项，方便 HR 联系你");
  if (!d.education || !d.education.length) warnings.push("教育经历为空");
  if (!d.work || !d.work.length) warnings.push("工作经历为空（应届生可留空，用项目经历补充）");
  if (!String(d.skills || "").trim()) warnings.push("专业技能为空");
  return {errors: errors, warnings: warnings, ok: errors.length === 0};
}

/* ---------- 4. 打印分页估算 ---------- */
/* textLen：简历全部文本字段字符数（去空白） */
function textLen(d) {
  d = d || {};
  var n = 0;
  function add(v) { n += String(v == null ? "" : v).replace(/\s/g, "").length; }
  var b = d.basic || {}, it = d.intention || {};
  for (var k in b) if (b.hasOwnProperty(k)) add(b[k]);
  for (var k2 in it) if (it.hasOwnProperty(k2)) add(it[k2]);
  add(d.skills); add(d.honors);
  [["education", ["school", "major", "degree", "start", "end", "desc"]],
   ["work",      ["company", "position", "start", "end", "desc"]],
   ["projects",  ["name", "role", "tech", "start", "end", "desc"]]].forEach(function (pair) {
    var list = d[pair[0]] || [];
    for (var i = 0; i < list.length; i++) {
      for (var j = 0; j < pair[1].length; j++) add(list[i][pair[1][j]]);
    }
  });
  return n;
}

/* estimatePages：按 A4 简历排版密度（约 1600 字/页）估算页数，至少 1 页 */
function estimatePages(d) {
  var chars = textLen(d);
  return {chars: chars, pages: Math.max(1, Math.ceil(chars / 1600))};
}

/* ---------- 5. 模板渲染 ---------- */
/* 各模板共享的条目 HTML（条目级，不含模板外壳样式类前缀由各模板自定） */

function contactParts(b) {
  var parts = [];
  if (String(b.phone || "").trim()) parts.push(esc(b.phone));
  if (String(b.email || "").trim()) parts.push(esc(b.email));
  if (String(b.city || "").trim()) parts.push(esc(b.city));
  return parts.join('<span class="rb-dot"> · </span>');
}

function intentionLine(it) {
  var parts = [];
  if (String(it.position || "").trim()) parts.push("<b>" + esc(it.position) + "</b>");
  if (String(it.city || "").trim()) parts.push(esc(it.city));
  if (String(it.salary || "").trim()) parts.push(esc(it.salary));
  if (String(it.type || "").trim()) parts.push(esc(it.type));
  return parts.length ? parts.join('<span class="rb-dot"> · </span>') : "";
}

/* ---- 模板1：简约商务 minimal ---- */
function renderMinimal(d) {
  var b = d.basic || {}, it = d.intention || {};
  var h = ['<div class="rb-t-minimal">'];
  h.push('<div class="rb-m-head"><div class="rb-m-name">' + ph(b.name) + '</div>');
  var sub = [];
  if (String(b.gender || "").trim()) sub.push(esc(b.gender));
  if (String(b.birth || "").trim()) sub.push(esc(b.birth));
  var contact = contactParts(b);
  h.push('<div class="rb-m-contact">' + (contact || '<span class="rb-ph">待填写联系方式</span>') +
         (sub.length ? ' <span class="rb-m-sep">|</span> ' + sub.join(" ") : "") + '</div>');
  var il = intentionLine(it);
  if (il) h.push('<div class="rb-m-intent">求职意向：' + il + '</div>');
  h.push('</div>');

  function sec(title, inner) {
    if (!inner) return "";
    return '<div class="rb-m-sec"><div class="rb-m-sec-t">' + esc(title) + '</div>' + inner + '</div>';
  }
  function eduInner() {
    var list = d.education || [], out = [];
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      out.push('<div class="rb-m-item"><div class="rb-m-row"><b>' + ph(e.school) + '</b>' +
        '<span class="rb-m-sub">' + esc([e.degree, e.major].filter(function (x) { return String(x || "").trim(); }).join(" · ")) + '</span>' +
        '<span class="rb-m-date">' + dateRange(e.start, e.end) + '</span></div>');
      var bl = bullets(e.desc);
      if (bl.length) out.push('<ul class="rb-m-ul">' + bl.join("") + '</ul>');
      out.push('</div>');
    }
    return out.join("");
  }
  function workInner() {
    var list = d.work || [], out = [];
    for (var i = 0; i < list.length; i++) {
      var w = list[i];
      out.push('<div class="rb-m-item"><div class="rb-m-row"><b>' + ph(w.company) + '</b>' +
        '<span class="rb-m-sub">' + esc(w.position) + '</span>' +
        '<span class="rb-m-date">' + dateRange(w.start, w.end) + '</span></div>');
      var bl = bullets(w.desc);
      if (bl.length) out.push('<ul class="rb-m-ul">' + bl.join("") + '</ul>');
      out.push('</div>');
    }
    return out.join("");
  }
  function projInner() {
    var list = d.projects || [], out = [];
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      out.push('<div class="rb-m-item"><div class="rb-m-row"><b>' + ph(p.name) + '</b>' +
        '<span class="rb-m-sub">' + esc([p.role, p.tech].filter(function (x) { return String(x || "").trim(); }).join(" · ")) + '</span>' +
        '<span class="rb-m-date">' + dateRange(p.start, p.end) + '</span></div>');
      var bl = bullets(p.desc);
      if (bl.length) out.push('<ul class="rb-m-ul">' + bl.join("") + '</ul>');
      out.push('</div>');
    }
    return out.join("");
  }
  function skillsInner() {
    var ls = splitLines(d.skills);
    if (!ls.length) return "";
    return '<div class="rb-m-skills">' + ls.join('<span class="rb-dot"> · </span>') + '</div>';
  }
  function honorsInner() {
    var bl = bullets(d.honors);
    if (!bl.length) return "";
    return '<ul class="rb-m-ul">' + bl.join("") + '</ul>';
  }
  h.push(sec("教育经历", eduInner()));
  h.push(sec("工作经历", workInner()));
  h.push(sec("项目经历", projInner()));
  h.push(sec("专业技能", skillsInner()));
  h.push(sec("荣誉证书", honorsInner()));
  h.push('</div>');
  return h.join("");
}

/* ---- 模板2：现代双栏 twocol ---- */
function renderTwoCol(d) {
  var b = d.basic || {}, it = d.intention || {};
  var h = ['<div class="rb-t-twocol">'];
  /* 左栏 */
  h.push('<aside class="rb-tc-side">');
  h.push('<div class="rb-tc-name">' + ph(b.name) + '</div>');
  var il = intentionLine(it);
  if (il) h.push('<div class="rb-tc-intent">' + il + '</div>');
  h.push('<div class="rb-tc-sec"><div class="rb-tc-sec-t">联系方式</div><div class="rb-tc-contact">');
  ["phone", "email", "city"].forEach(function (k) {
    if (String(b[k] || "").trim()) h.push('<div>' + esc(b[k]) + '</div>');
  });
  var extra = [];
  if (String(b.gender || "").trim()) extra.push(esc(b.gender));
  if (String(b.birth || "").trim()) extra.push(esc(b.birth));
  if (extra.length) h.push('<div>' + extra.join(" · ") + '</div>');
  h.push('</div></div>');
  var sk = splitLines(d.skills);
  if (sk.length) {
    h.push('<div class="rb-tc-sec"><div class="rb-tc-sec-t">专业技能</div><ul class="rb-tc-ul">');
    for (var i = 0; i < sk.length; i++) h.push("<li>" + sk[i] + "</li>");
    h.push('</ul></div>');
  }
  var hn = splitLines(d.honors);
  if (hn.length) {
    h.push('<div class="rb-tc-sec"><div class="rb-tc-sec-t">荣誉证书</div><ul class="rb-tc-ul">');
    for (var j = 0; j < hn.length; j++) h.push("<li>" + hn[j] + "</li>");
    h.push('</ul></div>');
  }
  h.push('</aside>');
  /* 右栏 */
  h.push('<main class="rb-tc-main">');
  function itemRow(title, sub, date) {
    return '<div class="rb-tc-row"><b>' + ph(title) + '</b>' +
      (sub ? '<span class="rb-tc-sub">' + sub + '</span>' : "") +
      '<span class="rb-tc-date">' + date + '</span></div>';
  }
  function eduInner() {
    var list = d.education || [], out = [];
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      var sub = esc([e.degree, e.major].filter(function (x) { return String(x || "").trim(); }).join(" · "));
      out.push('<div class="rb-tc-item">' + itemRow(e.school, sub, dateRange(e.start, e.end)));
      var bl = bullets(e.desc);
      if (bl.length) out.push('<ul class="rb-tc-mul">' + bl.join("") + '</ul>');
      out.push('</div>');
    }
    return out.join("");
  }
  function workInner() {
    var list = d.work || [], out = [];
    for (var i = 0; i < list.length; i++) {
      var w = list[i];
      out.push('<div class="rb-tc-item">' + itemRow(w.company, esc(w.position), dateRange(w.start, w.end)));
      var bl = bullets(w.desc);
      if (bl.length) out.push('<ul class="rb-tc-mul">' + bl.join("") + '</ul>');
      out.push('</div>');
    }
    return out.join("");
  }
  function projInner() {
    var list = d.projects || [], out = [];
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      var sub = esc([p.role, p.tech].filter(function (x) { return String(x || "").trim(); }).join(" · "));
      out.push('<div class="rb-tc-item">' + itemRow(p.name, sub, dateRange(p.start, p.end)));
      var bl = bullets(p.desc);
      if (bl.length) out.push('<ul class="rb-tc-mul">' + bl.join("") + '</ul>');
      out.push('</div>');
    }
    return out.join("");
  }
  function secT(title, inner) {
    if (!inner) return "";
    return '<div class="rb-tc-msec"><div class="rb-tc-msec-t">' + esc(title) + '</div>' + inner + '</div>';
  }
  h.push(secT("教育经历", eduInner()));
  h.push(secT("工作经历", workInner()));
  h.push(secT("项目经历", projInner()));
  h.push('</main></div>');
  return h.join("");
}

/* ---- 模板3：学术严谨 academic ---- */
function renderAcademic(d) {
  var b = d.basic || {}, it = d.intention || {};
  var h = ['<div class="rb-t-academic">'];
  h.push('<div class="rb-a-head"><div class="rb-a-name">' + ph(b.name) + '</div>');
  var meta = [];
  if (String(b.gender || "").trim()) meta.push(esc(b.gender));
  if (String(b.birth || "").trim()) meta.push(esc(b.birth));
  if (String(b.phone || "").trim()) meta.push(esc(b.phone));
  if (String(b.email || "").trim()) meta.push(esc(b.email));
  if (String(b.city || "").trim()) meta.push(esc(b.city));
  h.push('<div class="rb-a-meta">' + (meta.join("　") || '<span class="rb-ph">待填写</span>') + '</div>');
  var il = intentionLine(it);
  if (il) h.push('<div class="rb-a-intent">求职意向　' + il + '</div>');
  h.push('</div>');
  function sec(title, inner) {
    if (!inner) return "";
    return '<div class="rb-a-sec"><div class="rb-a-sec-t"><span>' + esc(title) + '</span></div>' + inner + '</div>';
  }
  function itemRow(l, r, date) {
    return '<div class="rb-a-row"><span class="rb-a-l">' + l + '</span>' +
      '<span class="rb-a-r">' + date + '</span></div>' + (r ? '<div class="rb-a-sub">' + r + '</div>' : "");
  }
  function eduInner() {
    var list = d.education || [], out = [];
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      out.push('<div class="rb-a-item">' + itemRow("<b>" + ph(e.school) + "</b>",
        esc([e.degree, e.major].filter(function (x) { return String(x || "").trim(); }).join("，")), dateRange(e.start, e.end)));
      var bl = bullets(e.desc);
      if (bl.length) out.push('<ul class="rb-a-ul">' + bl.join("") + '</ul>');
      out.push('</div>');
    }
    return out.join("");
  }
  function workInner() {
    var list = d.work || [], out = [];
    for (var i = 0; i < list.length; i++) {
      var w = list[i];
      out.push('<div class="rb-a-item">' + itemRow("<b>" + ph(w.company) + "</b>", esc(w.position), dateRange(w.start, w.end)));
      var bl = bullets(w.desc);
      if (bl.length) out.push('<ul class="rb-a-ul">' + bl.join("") + '</ul>');
      out.push('</div>');
    }
    return out.join("");
  }
  function projInner() {
    var list = d.projects || [], out = [];
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      out.push('<div class="rb-a-item">' + itemRow("<b>" + ph(p.name) + "</b>",
        esc([p.role, p.tech].filter(function (x) { return String(x || "").trim(); }).join("，")), dateRange(p.start, p.end)));
      var bl = bullets(p.desc);
      if (bl.length) out.push('<ul class="rb-a-ul">' + bl.join("") + '</ul>');
      out.push('</div>');
    }
    return out.join("");
  }
  h.push(sec("教育背景", eduInner()));
  h.push(sec("工作经历", workInner()));
  h.push(sec("项目经历", projInner()));
  var sk = splitLines(d.skills);
  if (sk.length) h.push(sec("专业技能", '<div class="rb-a-skills">' + sk.join("；") + '</div>'));
  var hn = bullets(d.honors);
  if (hn.length) h.push(sec("荣誉证书", '<ul class="rb-a-ul">' + hn.join("") + '</ul>'));
  h.push('</div>');
  return h.join("");
}

/* ---- 模板4：创意配色 creative ---- */
function renderCreative(d) {
  var b = d.basic || {}, it = d.intention || {};
  var h = ['<div class="rb-t-creative">'];
  h.push('<div class="rb-c-head"><div class="rb-c-name">' + ph(b.name) + '</div>');
  var il = intentionLine(it);
  if (il) h.push('<div class="rb-c-intent">' + il + '</div>');
  var contact = contactParts(b);
  var extra = [];
  if (String(b.gender || "").trim()) extra.push(esc(b.gender));
  if (String(b.birth || "").trim()) extra.push(esc(b.birth));
  h.push('<div class="rb-c-contact">' + (contact || "") + (extra.length ? ' <span class="rb-c-sep">|</span> ' + extra.join(" ") : "") + '</div>');
  h.push('</div>');
  function sec(title, inner) {
    if (!inner) return "";
    return '<div class="rb-c-sec"><div class="rb-c-sec-t">' + esc(title) + '</div>' + inner + '</div>';
  }
  function card(title, sub, date, desc) {
    var out = '<div class="rb-c-card"><div class="rb-c-row"><b>' + ph(title) + '</b>' +
      '<span class="rb-c-date">' + date + '</span></div>';
    if (sub) out += '<div class="rb-c-sub">' + sub + '</div>';
    var bl = bullets(desc);
    if (bl.length) out += '<ul class="rb-c-ul">' + bl.join("") + '</ul>';
    return out + '</div>';
  }
  function eduInner() {
    var list = d.education || [], out = [];
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      out.push(card(e.school,
        esc([e.degree, e.major].filter(function (x) { return String(x || "").trim(); }).join(" · ")),
        dateRange(e.start, e.end), e.desc));
    }
    return out.join("");
  }
  function workInner() {
    var list = d.work || [], out = [];
    for (var i = 0; i < list.length; i++) {
      var w = list[i];
      out.push(card(w.company, esc(w.position), dateRange(w.start, w.end), w.desc));
    }
    return out.join("");
  }
  function projInner() {
    var list = d.projects || [], out = [];
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      out.push(card(p.name,
        esc([p.role, p.tech].filter(function (x) { return String(x || "").trim(); }).join(" · ")),
        dateRange(p.start, p.end), p.desc));
    }
    return out.join("");
  }
  function pills(text) {
    var ls = splitLines(text);
    if (!ls.length) return "";
    var out = ['<div class="rb-c-pills">'];
    for (var i = 0; i < ls.length; i++) out.push('<span class="rb-c-pill">' + ls[i] + '</span>');
    return out.join("") + '</div>';
  }
  h.push(sec("教育经历", eduInner()));
  h.push(sec("工作经历", workInner()));
  h.push(sec("项目经历", projInner()));
  h.push(sec("专业技能", pills(d.skills)));
  h.push(sec("荣誉证书", pills(d.honors)));
  h.push('</div>');
  return h.join("");
}

/* renderResume：模板分发（未知 id 回退到 minimal） */
function renderResume(d, templateId) {
  d = d || defaultData();
  var id = normalizeTemplateId(templateId);
  if (id === "twocol") return renderTwoCol(d);
  if (id === "academic") return renderAcademic(d);
  if (id === "creative") return renderCreative(d);
  return renderMinimal(d);
}

/* ---------- 6. 示例简历 ---------- */
var SAMPLE_RESUME = {
  basic:     {name: "陈晓峰", gender: "男", birth: "1998年5月", phone: "13800138000", email: "chenxiaofeng@example.com", city: "深圳"},
  intention: {position: "前端开发工程师", city: "深圳", salary: "15-20K", type: "全职"},
  education: [
    {school: "深圳大学", major: "计算机科学与技术", degree: "本科", start: "2016.09", end: "2020.06",
     desc: "主修课程：数据结构、操作系统、计算机网络（均 85 分以上）\n连续两年获校级二等奖学金\n毕业设计《基于 Vue 的校园二手交易平台》获院级优秀毕设"}
  ],
  work: [
    {company: "深圳云帆科技有限公司", position: "前端开发工程师", start: "2020.07", end: "2023.03",
     desc: "负责公司 SaaS 后台管理系统前端架构，Vue 2 升级 Vue 3，主导落地 Vite 构建体系，构建耗时从 9 分钟降至 2 分钟\n封装 40+ 通用业务组件，沉淀为内部组件库，支撑 5 条业务线复用\n推动落地前端监控（白屏/异常上报），线上故障平均定位时长从 2 小时缩短到 20 分钟"},
    {company: "广州启明星网络有限公司", position: "前端开发工程师（实习）", start: "2019.07", end: "2020.01",
     desc: "参与电商小程序活动页开发，独立完成 6 个营销活动页，按期上线零延期\n配合后端联调接口，编写接口文档，前后端联调效率提升约 30%"}
  ],
  projects: [
    {name: "低代码表单设计器", role: "前端负责人", tech: "Vue 3 / TypeScript / Vite", start: "2022.03", end: "2022.11",
     desc: "设计拖拽式表单搭建器，支持 20 种字段类型，生成的表单 JSON 可直接渲染\n实现撤销/重做栈与局部渲染优化，复杂表单（200+ 字段）编辑不卡顿\n项目在公司内部推广至 3 个部门使用，表单需求交付周期从 5 天缩短到 1 天"}
  ],
  skills: "熟练掌握 JavaScript / TypeScript，熟悉 ES6+ 语法与异步编程\n熟练使用 Vue 3（含 Composition API）与 React，了解其原理与生态\n熟悉 Vite / Webpack 构建优化，有大型项目构建提速实战经验\n了解 Node.js，能编写 BFF 层与脚手架工具\n熟悉 Git 工作流，有 Code Review 习惯",
  honors: "2022 年度公司优秀员工\n英语 CET-6（512 分），可阅读英文技术文档"
};

/* 深拷贝（示例载入/重置用，避免引用污染） */
function cloneData(d) { return JSON.parse(JSON.stringify(d)); }

/* ---------- 7. 浏览器应用 ---------- */
function hasDOM() {
  return typeof document !== "undefined" && typeof window !== "undefined";
}

function $(id) { return document.getElementById(id); }

function toast(msg) {
  var el = $("rb-toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(el._t);
  el._t = setTimeout(function () { el.classList.remove("show"); }, 2600);
}

var state = {data: defaultData(), template: "minimal"};

function saveState() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({v: 1, template: state.template, data: state.data}));
  } catch (e) { /* 隐私模式等写入失败时静默忽略 */ }
}

function loadState() {
  try {
    var raw = localStorage.getItem(LS_KEY);
    if (!raw) return false;
    var d = JSON.parse(raw);
    if (!d || d.v !== 1 || !d.data) return false;
    var base = defaultData();
    var merged = cloneData(base);
    ["basic", "intention"].forEach(function (sec) {
      if (d.data[sec]) for (var k in merged[sec]) {
        if (typeof d.data[sec][k] === "string") merged[sec][k] = d.data[sec][k];
      }
    });
    ["education", "work", "projects"].forEach(function (sec) {
      if (Array.isArray(d.data[sec])) merged[sec] = d.data[sec];
    });
    if (typeof d.data.skills === "string") merged.skills = d.data.skills;
    if (typeof d.data.honors === "string") merged.honors = d.data.honors;
    state.data = merged;
    state.template = normalizeTemplateId(d.template);
    return true;
  } catch (e) { return false; }
}

/* 表单字段定义（动态区教育/工作/项目）：[key, label, maxlength] */var REPEAT_SECTIONS = {
  education: {title: "教育经历", fields: [
    ["school", "学校", 40], ["major", "专业", 40], ["degree", "学历", 12],
    ["start", "开始时间（如 2020.09）", 16], ["end", "结束时间（在读填“至今”）", 16]
  ], textarea: ["desc", "在校经历 / 主修课程 / 获奖（每行一条）"]},
  work: {title: "工作经历", fields: [
    ["company", "公司", 40], ["position", "职位", 30],
    ["start", "开始时间（如 2020.07）", 16], ["end", "结束时间（在职填“至今”）", 16]
  ], textarea: ["desc", "工作内容与业绩（每行一条，建议“动作＋量化结果”）"]},
  projects: {title: "项目经历", fields: [
    ["name", "项目名称", 40], ["role", "担任角色", 20], ["tech", "技术栈", 60],
    ["start", "开始时间", 16], ["end", "结束时间", 16]
  ], textarea: ["desc", "项目描述与个人贡献（每行一条，建议量化结果）"]}
};

function fieldHTML(sec, key, label, maxlength, required, value) {
  return '<div class="rb-field"><label>' + esc(label) + (required ? ' <span class="rb-req">*</span>' : "") + '</label>' +
    '<input type="text" data-rbf="' + sec + "." + key + '" maxlength="' + maxlength + '" value="' + esc(value || "") + '"' +
    ' placeholder="' + esc(label) + '"></div>';
}

/* 动态条目 HTML（教育/工作/项目） */
function repeatItemHTML(sec, entry, idx) {
  var cfg = REPEAT_SECTIONS[sec];
  var h = ['<div class="rb-item" data-rsec="' + sec + '">'];
  h.push('<div class="rb-item-head"><b>' + esc(cfg.title) + ' ' + (idx + 1) + '</b>' +
    '<button type="button" class="rb-del" data-rdel title="删除本条">删除</button></div>');
  h.push('<div class="rb-grid2">');
  for (var i = 0; i < cfg.fields.length; i++) {
    var f = cfg.fields[i];
    h.push(fieldHTML(sec, f[0], f[1], f[2], false, entry[f[0]]));
  }
  h.push('</div>');
  h.push('<div class="rb-field"><label>' + esc(cfg.textarea[1]) + '</label>' +
    '<textarea data-rbf="' + sec + "." + cfg.textarea[0] + '" rows="3" placeholder="' + esc(cfg.textarea[1]) + '">' +
    esc(entry[cfg.textarea[0]] || "") + '</textarea></div>');
  h.push('</div>');
  return h.join("");
}

function emptyRepeatEntry(sec) {
  var e = {};
  var cfg = REPEAT_SECTIONS[sec];
  for (var i = 0; i < cfg.fields.length; i++) e[cfg.fields[i][0]] = "";
  e[cfg.textarea[0]] = "";
  return e;
}

/* 从 DOM 收集表单 → state.data */
function collectForm() {
  var d = defaultData();
  var nodes = document.querySelectorAll("[data-rbf]");
  for (var i = 0; i < nodes.length; i++) {
    var spec = nodes[i].getAttribute("data-rbf").split(".");
    var sec = spec[0], key = spec[1];
    var item = nodes[i].closest("[data-rsec]");
    if (item) continue; /* 动态条目稍后统一收集 */
    if (d[sec] && d[sec].hasOwnProperty(key)) d[sec][key] = nodes[i].value;
    else if (sec === "skills" || sec === "honors") d[sec] = nodes[i].value;
  }
  ["education", "work", "projects"].forEach(function (sec) {
    var items = document.querySelectorAll('[data-rsec="' + sec + '"]');
    for (var j = 0; j < items.length; j++) {
      var entry = emptyRepeatEntry(sec);
      var inputs = items[j].querySelectorAll("[data-rbf]");
      for (var k = 0; k < inputs.length; k++) {
        var kk = inputs[k].getAttribute("data-rbf").split(".")[1];
        if (entry.hasOwnProperty(kk)) entry[kk] = inputs[k].value;
      }
      d[sec].push(entry);
    }
  });
  /* 意向类型下拉 */
  var typeSel = $("rb-intention-type");
  if (typeSel) d.intention.type = typeSel.value;
  state.data = d;
  return d;
}

/* 把 state.data 回填到表单 */
function fillForm() {
  var d = state.data;
  var nodes = document.querySelectorAll("[data-rbf]");
  for (var i = 0; i < nodes.length; i++) {
    var spec = nodes[i].getAttribute("data-rbf").split(".");
    if (nodes[i].closest("[data-rsec]")) continue;
    var sec = spec[0], key = spec[1];
    if (d[sec] && typeof d[sec][key] === "string") nodes[i].value = d[sec][key];
    else if ((sec === "skills" || sec === "honors") && typeof d[sec] === "string") nodes[i].value = d[sec];
  }
  var typeSel = $("rb-intention-type");
  if (typeSel) typeSel.value = d.intention.type || "全职";
  ["education", "work", "projects"].forEach(function (sec) {
    var list = $( "rb-list-" + sec);
    if (!list) return;
    var html = [];
    for (var j = 0; j < d[sec].length; j++) html.push(repeatItemHTML(sec, d[sec][j], j));
    list.innerHTML = html.join("");
  });
}

function renderAll() {
  var sheet = $("rb-sheet");
  if (sheet) sheet.innerHTML = renderResume(state.data, state.template);
  var btns = document.querySelectorAll("[data-rtpl]");
  for (var i = 0; i < btns.length; i++) {
    btns[i].classList.toggle("on", btns[i].getAttribute("data-rtpl") === state.template);
  }
  var pg = $("rb-pages");
  if (pg) {
    var ep = estimatePages(state.data);
    pg.textContent = "内容约 " + ep.pages + " 页 A4（" + ep.chars + " 字）";
  }
}

var saveT = 0;
function saveSoon() {
  clearTimeout(saveT);
  saveT = setTimeout(saveState, 500);
}

function addRepeat(sec) {
  var list = $("rb-list-" + sec);
  if (!list) return;
  var tmp = document.createElement("div");
  tmp.innerHTML = repeatItemHTML(sec, emptyRepeatEntry(sec), list.children.length);
  list.appendChild(tmp.firstChild);
  collectForm(); renderAll(); saveSoon();
}

function init() {
  var had = loadState();
  if (!had) state.data = cloneData(SAMPLE_RESUME);

  fillForm();
  renderAll();

  var form = $("rb-form");
  if (form) {
    form.addEventListener("input", function () {
      collectForm(); renderAll(); saveSoon(); markInvalid();
    });
    form.addEventListener("change", function () {
      collectForm(); renderAll(); saveSoon(); markInvalid();
    });
    form.addEventListener("click", function (e) {
      var add = e.target.closest("[data-radd]");
      if (add) { addRepeat(add.getAttribute("data-radd")); return; }
      var del = e.target.closest("[data-rdel]");
      if (del) {
        var item = del.closest("[data-rsec]");
        if (item) { item.remove(); collectForm(); renderAll(); saveSoon(); renumberItems(); }
      }
    });
  }

  var tpls = document.querySelectorAll("[data-rtpl]");
  for (var i = 0; i < tpls.length; i++) {
    tpls[i].addEventListener("click", function () {
      state.template = normalizeTemplateId(this.getAttribute("data-rtpl"));
      renderAll(); saveSoon();
      toast("已切换为「" + templateName(state.template) + "」模板");
    });
  }

  var sampleBtn = $("rb-sample");
  if (sampleBtn) sampleBtn.addEventListener("click", function () {
    state.data = cloneData(SAMPLE_RESUME);
    fillForm(); renderAll(); saveState();
    toast("已载入示例简历，可直接改写成你的内容");
  });

  var clearBtn = $("rb-clear");
  if (clearBtn) clearBtn.addEventListener("click", function () {
    state.data = defaultData();
    fillForm(); renderAll(); saveState();
    toast("已清空，可重新填写");
  });

  var printBtn = $("rb-print");
  if (printBtn) printBtn.addEventListener("click", function () {
    collectForm(); renderAll();
    var v = validateResume(state.data);
    markInvalid();
    if (!v.ok) {
      toast("请先补全：" + v.errors.join("；"));
      return;
    }
    if (v.warnings.length) toast("提示：" + v.warnings.join("；") + " —— 仍可打印");
    setTimeout(function () { window.print(); }, v.warnings.length ? 1600 : 60);
  });

  window.addEventListener("beforeprint", function () { collectForm(); renderAll(); });

  saveState();
}

function templateName(id) {
  for (var i = 0; i < TEMPLATES.length; i++) if (TEMPLATES[i].id === id) return TEMPLATES[i].name;
  return TEMPLATES[0].name;
}

/* renumberItems：删除条目后重排序号标题 */
function renumberItems() {
  ["education", "work", "projects"].forEach(function (sec) {
    var items = document.querySelectorAll('[data-rsec="' + sec + '"]');
    for (var j = 0; j < items.length; j++) {
      var b = items[j].querySelector(".rb-item-head b");
      if (b) b.textContent = REPEAT_SECTIONS[sec].title + " " + (j + 1);
    }
  });
}

/* markInvalid：必填项空值标红（输入时实时提示）；
* 手机号/邮箱格式仅在失焦后标红，避免正在输入时被打扰 */
function markInvalid() {
  var map = [["basic", "name"], ["intention", "position"]];
  for (var i = 0; i < map.length; i++) {
    var el = document.querySelector('[data-rbf="' + map[i][0] + "." + map[i][1] + '"]');
    if (el) el.classList.toggle("rb-invalid",
      !String(state.data[map[i][0]][map[i][1]] || "").trim());
  }
  var active = null;
  try { active = document.activeElement; } catch (e) {}
  ["phone", "email"].forEach(function (k) {
    var el2 = document.querySelector('[data-rbf="basic.' + k + '"]');
    if (!el2 || el2 === active) return;
    var v = String(el2.value || "").trim();
    var bad = v && (k === "phone" ? !PHONE_RE.test(v) : !EMAIL_RE.test(v));
    el2.classList.toggle("rb-invalid", !!bad);
  });
}

if (hasDOM()) {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    LS_KEY: LS_KEY, TEMPLATES: TEMPLATES,
    PHONE_RE: PHONE_RE, EMAIL_RE: EMAIL_RE,
    esc: esc, defaultData: defaultData, cloneData: cloneData,
    isTemplateId: isTemplateId, normalizeTemplateId: normalizeTemplateId, templateName: templateName,
    splitLines: splitLines, bullets: bullets, dateRange: dateRange, ph: ph,
    contactParts: contactParts, intentionLine: intentionLine,
    validateResume: validateResume,
    textLen: textLen, estimatePages: estimatePages,
    renderMinimal: renderMinimal, renderTwoCol: renderTwoCol,
    renderAcademic: renderAcademic, renderCreative: renderCreative,
    renderResume: renderResume,
    SAMPLE_RESUME: SAMPLE_RESUME
  };
}
})();
