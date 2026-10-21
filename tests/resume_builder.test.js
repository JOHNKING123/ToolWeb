/* 简历模板生成器纯逻辑单元测试（零依赖）：node tests/resume_builder.test.js
* 覆盖：
* 1. 基础（esc 转义 / LS_KEY / 模板清单）
* 2. 数据结构（defaultData / cloneData / 模板 id 归一化）
* 3. 文本小工具（splitLines/bullets/dateRange/ph/contactParts/intentionLine）
* 4. 校验（validateResume：必填/手机号/邮箱/警告）
* 5. 分页估算（textLen/estimatePages）
* 6. 模板渲染（4 套模板字段映射 / 空章节省略 / HTML 转义 / 分发回退）
* 7. 示例简历（可载入且校验通过）
*/
"use strict";
var M = require("../static/js/resume_builder.js");

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function contains(hay, needle, name) { ok(String(hay).indexOf(needle) >= 0, name + "（应包含 " + JSON.stringify(needle) + "）"); }
function notContains(hay, needle, name) { ok(String(hay).indexOf(needle) < 0, name + "（不应包含 " + JSON.stringify(needle) + "）"); }

/* ---------- 1. 基础 ---------- */
eq(M.esc('<b>&"\''), "&lt;b&gt;&amp;&quot;&#39;", "HTML 转义");
eq(M.esc(null), "", "null 转义为空串");
eq(M.esc("张三"), "张三", "普通中文不受影响");
eq(M.LS_KEY, "tw_resume_builder_v1", "localStorage key");

/* ---------- 2. 模板清单 ---------- */
ok(M.TEMPLATES.length >= 3, "模板数量 ≥3（实得 " + M.TEMPLATES.length + "）");
var ids = M.TEMPLATES.map(function (t) { return t.id; });
ok(ids.filter(function (id, i) { return ids.indexOf(id) === i; }).length === ids.length, "模板 id 唯一");
M.TEMPLATES.forEach(function (t) {
  ok(typeof t.id === "string" && t.id.length > 0, "模板 id 非空：" + t.id);
  ok(typeof t.name === "string" && t.name.length > 0, "模板名称非空：" + t.id);
  ok(typeof t.desc === "string" && t.desc.length > 0, "模板描述非空：" + t.id);
});
eq(M.isTemplateId("minimal"), true, "minimal 是合法模板 id");
eq(M.isTemplateId("twocol"), true, "twocol 是合法模板 id");
eq(M.isTemplateId("nope"), false, "未知 id 不合法");
eq(M.normalizeTemplateId("creative"), "creative", "合法 id 保持");
eq(M.normalizeTemplateId("nope"), "minimal", "非法 id 回退 minimal");
eq(M.templateName("twocol"), "现代双栏", "模板名称映射");

/* ---------- 3. 数据结构 ---------- */
var dd = M.defaultData();
["basic", "intention", "education", "work", "projects", "skills", "honors"].forEach(function (k) {
  ok(dd.hasOwnProperty(k), "defaultData 含字段 " + k);
});
ok(Array.isArray(dd.education) && dd.education.length === 0, "教育默认为空数组");
ok(Array.isArray(dd.work) && dd.work.length === 0, "工作默认为空数组");
ok(Array.isArray(dd.projects) && dd.projects.length === 0, "项目默认为空数组");
eq(dd.intention.type, "全职", "求职类型默认全职");
var c1 = M.cloneData(M.SAMPLE_RESUME);
c1.basic.name = "改名";
ok(M.SAMPLE_RESUME.basic.name !== "改名", "cloneData 深拷贝不污染原对象");
eq(c1.education.length, M.SAMPLE_RESUME.education.length, "深拷贝保留条目数");

/* ---------- 4. 文本小工具 ---------- */
var sl = M.splitLines("a\n\n  \nb");
eq(sl.length, 2, "splitLines 跳过空行");
eq(sl[0], "a", "splitLines 首行");
eq(M.splitLines("<b>").length, 1, "splitLines 保留原始行数");
eq(M.splitLines("<b>")[0], "&lt;b&gt;", "splitLines 转义 HTML");
var bl = M.bullets("第一条\n第二条");
eq(bl.length, 2, "bullets 行数");
eq(bl[0], "<li>第一条</li>", "bullets 首条格式");
eq(M.dateRange("2020.09", "2024.06"), "2020.09 – 2024.06", "起止时间拼接");
eq(M.dateRange("2020.09", ""), "2020.09", "只有开始时间");
eq(M.dateRange("", "至今"), "至今", "只有结束时间");
eq(M.dateRange("", ""), "", "起止都空");
eq(M.ph("张三"), "张三", "ph 有值原样转义返回");
contains(M.ph(""), "待填写", "ph 空值给占位");
contains(M.contactParts({phone: "13800138000", email: "a@b.com", city: ""}), "13800138000", "联系方式含手机");
contains(M.contactParts({phone: "13800138000", email: "a@b.com", city: ""}), "a@b.com", "联系方式含邮箱");
contains(M.intentionLine({position: "前端工程师", city: "深圳", salary: "", type: ""}), "前端工程师", "意向行含职位");
eq(M.intentionLine({position: "", city: "", salary: "", type: ""}), "", "意向全空返回空串");

/* ---------- 5. 校验 ---------- */
var vEmpty = M.validateResume(M.defaultData());
eq(vEmpty.ok, false, "空简历校验不通过");
ok(vEmpty.errors.some(function (e) { return e.indexOf("姓名") >= 0; }), "空简历报错含姓名");
ok(vEmpty.errors.some(function (e) { return e.indexOf("期望职位") >= 0; }), "空简历报错含期望职位");
var vBadPhone = M.validateResume({basic: {name: "张三", phone: "12345"}, intention: {position: "工程师"}});
ok(vBadPhone.errors.some(function (e) { return e.indexOf("手机号") >= 0; }), "错误手机号被拦截");
var vBadMail = M.validateResume({basic: {name: "张三", email: "not-an-email"}, intention: {position: "工程师"}});
ok(vBadMail.errors.some(function (e) { return e.indexOf("邮箱") >= 0; }), "错误邮箱被拦截");
var vGoodContact = M.validateResume({basic: {name: "张三", phone: "13800138000", email: "a@b.com"}, intention: {position: "工程师"}});
ok(!vGoodContact.errors.some(function (e) { return e.indexOf("手机号") >= 0; }), "正确手机号通过");
ok(!vGoodContact.errors.some(function (e) { return e.indexOf("邮箱") >= 0; }), "正确邮箱通过");
var vNoContact = M.validateResume({basic: {name: "张三"}, intention: {position: "工程师"}});
ok(vNoContact.warnings.some(function (w) { return w.indexOf("手机号或邮箱") >= 0; }), "无联系方式给警告而非报错");
ok(vNoContact.ok, true, "无联系方式仍可通过（仅警告）");
var vSample = M.validateResume(M.SAMPLE_RESUME);
eq(vSample.ok, true, "示例简历校验通过");
eq(vSample.errors.length, 0, "示例简历 0 错误");
var vWarn = M.validateResume({basic: {name: "张三", phone: "13800138000"}, intention: {position: "工程师"}, education: [], work: [], projects: [], skills: "", honors: ""});
ok(vWarn.warnings.length >= 3, "空经历/技能给多条警告（实得 " + vWarn.warnings.length + "）");

/* ---------- 6. 分页估算 ---------- */
eq(M.textLen(M.defaultData()), 2, "空简历仅含默认求职类型「全职」2 字");
ok(M.textLen(M.SAMPLE_RESUME) > 500, "示例简历文本量充足（实得 " + M.textLen(M.SAMPLE_RESUME) + "）");
var epEmpty = M.estimatePages(M.defaultData());
eq(epEmpty.pages, 1, "空简历至少 1 页");
var epSample = M.estimatePages(M.SAMPLE_RESUME);
eq(epSample.pages, 1, "示例简历 1 页");
var huge = M.cloneData(M.SAMPLE_RESUME);
huge.skills = new Array(60).join("熟练掌握 JavaScript / TypeScript / Vue / React / Node.js / Webpack / Vite；") ;
var epHuge = M.estimatePages(huge);
ok(epHuge.pages >= 2, "超长简历估算多页（实得 " + epHuge.pages + " 页）");

/* ---------- 7. 模板渲染：字段映射 ---------- */
var S = M.SAMPLE_RESUME;
var renders = {
  minimal: M.renderMinimal(S),
  twocol: M.renderTwoCol(S),
  academic: M.renderAcademic(S),
  creative: M.renderCreative(S)
};
Object.keys(renders).forEach(function (id) {
  var h = renders[id];
  contains(h, "陈晓峰", id + " 渲染含姓名");
  contains(h, "前端开发工程师", id + " 渲染含期望职位");
  contains(h, "深圳大学", id + " 渲染含学校");
  contains(h, "深圳云帆科技有限公司", id + " 渲染含公司");
  contains(h, "低代码表单设计器", id + " 渲染含项目名");
  contains(h, "Vue 3", id + " 渲染含技能关键词");
  contains(h, "优秀员工", id + " 渲染含荣誉");
});
/* 分发 */
eq(M.renderResume(S, "nope").indexOf("rb-t-minimal") >= 0, true, "未知模板 id 回退 minimal");
contains(M.renderResume(S, "twocol"), "rb-t-twocol", "分发 twocol");
contains(M.renderResume(S, "academic"), "rb-t-academic", "分发 academic");
contains(M.renderResume(S, "creative"), "rb-t-creative", "分发 creative");
contains(M.renderResume(S, "minimal"), "rb-t-minimal", "分发 minimal");
/* 空章节省略 */
var noWork = M.cloneData(S); noWork.work = [];
notContains(M.renderMinimal(noWork), "工作经历", "minimal 空工作经历省略章节");
notContains(M.renderTwoCol(noWork), "工作经历", "twocol 空工作经历省略章节");
var noHonors = M.cloneData(S); noHonors.honors = "";
notContains(M.renderMinimal(noHonors), "荣誉证书", "minimal 空荣誉省略章节");
/* HTML 转义（防注入） */
var evil = M.cloneData(S); evil.basic.name = "<script>alert(1)</script>";
notContains(M.renderMinimal(evil), "<script>", "minimal 姓名转义无脚本标签");
contains(M.renderMinimal(evil), "&lt;script&gt;", "minimal 姓名转义正确");
notContains(M.renderCreative(evil), "<script>", "creative 姓名转义无脚本标签");
/* 空数据不崩 */
["minimal", "twocol", "academic", "creative"].forEach(function (id) {
  var h = M.renderResume(M.defaultData(), id);
  ok(typeof h === "string" && h.length > 50, id + " 空数据渲染不崩且有外壳");
  contains(h, "待填写", id + " 空数据给待填写占位");
});
/* 日期边界 */
var dEdge = M.cloneData(S);
dEdge.education[0].end = "";
contains(M.renderMinimal(dEdge), "2016.09", "只有开始时间的日期正常渲染");

console.log("通过 " + pass + " / 失败 " + fail);
process.exit(fail === 0 ? 0 : 1);
