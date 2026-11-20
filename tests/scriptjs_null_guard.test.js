/* script.js 空值守卫（scriptjs_null_guard）回归测试：
 * 缺陷：static/js/script.js 的 DOMContentLoaded 回调在无搜索框的页面抛 TypeError——
 * :222-223 getElementById('toolSearch'/'toolSearchLarge') 取到 null，:228
 * toolSearch.addEventListener 直接抛 `TypeError: Cannot read properties of null
 * (reading 'addEventListener')`，回调中段中断，其后 :276-282 '/' 快捷键注册被
 * 跳过（且即使走到 :280，toolSearchLarge.focus() 在 null 上同样会抛）。
 * 受影响页：cron-parser／regex-tester（均加载 script.js，页内 0 处 toolSearch；
 * 首页不加载 script.js，只引 search.js，故首页搜索不受影响）。
 * 修复：① :227-236 搜索框接线加 `if (toolSearch && toolSearchLarge)` 守卫，任一
 * 缺失时跳过接线、不抛错、不中断回调其余部分；filterTools 定义保留，:250 实际
 * 可见性计数（11-18 轮已修）一字不动（行号因上方守卫 +2 行顺延，内容不变）。
 * ② :275-282 '/' 快捷键处理函数内守卫 `if (toolSearchLarge) toolSearchLarge.focus()`，
 * 监听器照常注册、按 '/' 安全跳过（口径：handler 已注册且安全跳过）。
 * 未动：下拉菜单接线（:180-219）与回调其余逻辑；未给两模板补搜索框、未给两页
 * 加载 search.js；未碰 main.go／tools/categories.go；Path 328、sitemap 329 不变。
 *
 * 运行：node tests/scriptjs_null_guard.test.js（零依赖，最小 DOM 桩）
 * 场景 A：无搜索框 DOM（cron-parser／regex-tester 同款：nav 下拉在、cronForm 在、
 * 无 toolSearch／toolSearchLarge、无工具卡）——加载真实 script.js、触发
 * DOMContentLoaded、按 '/' 均不抛错；回调完整执行（document 上 keydown 监听器
 * 2 个：ESC＋'/'，'/' 为回调末尾注册）；下拉开合／ESC 关闭仍工作；另覆仅有
 * toolSearchLarge（A2：按 '/' 聚焦大框）与仅有 toolSearch（A3：按 '/' 安全跳过）。
 * 场景 B：有搜索框 DOM（首页同款桩，19 分类）——双框 input 同步、filterTools
 * 按实际可见性计数（可见卡＝匹配集合、可见分类＝含匹配卡的分类）、清空恢复
 * 19/19、零匹配提示、'/' 聚焦大框、ESC 只关下拉不清空搜索（script.js 的 ESC
 * 行为，与 search.js 的 ESC 清空不同，勿混淆）。
 * 另有源码静态断言（守卫写法、:250 计数行内容、模板范围：两页 0 处 toolSearch
 * 且不加载 search.js）。
 * 真实首页 57 张锚点由 tests/homepage_search.test.js（jsdom 模式）覆盖，本文件
 * 桩夹具按匹配集合动态计算期望值，不硬编 57。
 */
"use strict";
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var ROOT = path.join(__dirname, "..");
var scriptSrc = fs.readFileSync(path.join(ROOT, "static/js/script.js"), "utf-8");
var cronHtml = fs.readFileSync(path.join(ROOT, "templates/cron_parser.html"), "utf-8");
var regexHtml = fs.readFileSync(path.join(ROOT, "templates/regex_tester.html"), "utf-8");
var indexHtml = fs.readFileSync(path.join(ROOT, "templates/index.html"), "utf-8");

var pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name, extra !== undefined ? "(" + extra + ")" : ""); }
}
function eq(a, b, name) { ok(a === b, name, "期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a)); }

/* ---------- 源码静态断言 ---------- */
ok(scriptSrc.indexOf("if (toolSearch && toolSearchLarge) {") !== -1,
  "script.js 搜索框接线有双框存在守卫（if (toolSearch && toolSearchLarge)）");
ok(scriptSrc.indexOf("toolSearch.addEventListener('input'") !== -1,
  "script.js 小框 input 接线保留（守卫内）");
ok(scriptSrc.indexOf("toolSearchLarge.addEventListener('input'") !== -1,
  "script.js 大框 input 接线保留（守卫内）");
ok(scriptSrc.indexOf("if (toolSearchLarge) {") !== -1 &&
   scriptSrc.indexOf("toolSearchLarge.focus();") !== -1,
  "script.js '/' 处理函数内守卫 toolSearchLarge.focus()");
ok(scriptSrc.indexOf("const visibleTools = Array.from(category.querySelectorAll('.tool-card')).filter(card => card.style.display !== 'none').length;") !== -1,
  "script.js :250 实际可见性计数行一字未动（card.style.display !== 'none'）");
ok(scriptSrc.indexOf("toolsDropdownBtn.addEventListener('click'") !== -1,
  "script.js 下拉菜单接线未动（toolsDropdownBtn click）");
ok(scriptSrc.indexOf("if (e.key === 'Escape')") !== -1,
  "script.js ESC 关闭下拉逻辑未动");
ok((cronHtml.match(/toolSearch/g) || []).length === 0, "cron_parser 模板内 0 处 toolSearch（未补搜索框）");
ok((regexHtml.match(/toolSearch/g) || []).length === 0, "regex_tester 模板内 0 处 toolSearch（未补搜索框）");
ok(cronHtml.indexOf("search.js") === -1, "cron_parser 未加载 search.js");
ok(regexHtml.indexOf("search.js") === -1, "regex_tester 未加载 search.js");
ok(cronHtml.indexOf("static/js/script.js") !== -1, "cron_parser 加载 script.js（缺陷页确认）");
ok(regexHtml.indexOf("static/js/script.js") !== -1, "regex_tester 加载 script.js（缺陷页确认）");
ok(indexHtml.indexOf("static/js/script.js") === -1, "首页不加载 script.js（只引 search.js，守卫修不了首页搜索）");

/* ---------- 最小 DOM 桩工厂（每场景一份独立 document） ---------- */
function makeDom(opts) {
  opts = opts || {};

  function Style() { this.display = ""; }
  function El(tag, cls) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.parent = null;
    this.listeners = {};
    this.id = "";
    this.className = cls || "";
    this._text = "";
    this._html = "";
    this.value = "";
    this._classes = {};
    var self = this;
    this.classList = {
      add: function (c) { self._classes[c] = true; },
      remove: function (c) { delete self._classes[c]; },
      toggle: function (c) { if (self._classes[c]) { delete self._classes[c]; return false; } self._classes[c] = true; return true; },
      contains: function (c) { return !!self._classes[c]; }
    };
    this.style = new Proxy(new Style(), {
      set: function (t, k, v) { t[k] = v; return true; },
      get: function (t, k) { return t[k]; }
    });
  }
  Object.defineProperty(El.prototype, "textContent", {
    get: function () {
      if (this.children.length) return this.children.map(function (c) { return c.textContent; }).join(" ");
      return this._text;
    },
    set: function (v) { this._text = v; }
  });
  Object.defineProperty(El.prototype, "innerHTML", {
    get: function () { return this._html; },
    set: function (v) { this._html = v; this._text = String(v).replace(/<[^>]*>/g, " "); }
  });
  El.prototype.addEventListener = function (type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); };
  El.prototype.dispatchEvent = function (ev) {
    ev.target = this;
    if (typeof ev.preventDefault !== "function") ev.preventDefault = function () {};
    if (typeof ev.stopPropagation !== "function") ev.stopPropagation = function () {};
    (this.listeners[ev.type] || []).slice().forEach(function (fn) { fn(ev); });
    return true;
  };
  El.prototype.appendChild = function (child) {
    child.parent = this;
    this.children.push(child);
    if (child.id) document._byId[child.id] = child;
    return child;
  };
  El.prototype.remove = function () {
    if (this.id && document._byId[this.id] === this) delete document._byId[this.id];
    if (!this.parent) return;
    var i = this.parent.children.indexOf(this);
    if (i !== -1) this.parent.children.splice(i, 1);
    this.parent = null;
  };
  El.prototype.focus = function () { document.activeElement = this; };
  El.prototype._matches = function (sel) {
    if (sel.charAt(0) === ".") return this.className.split(" ").indexOf(sel.slice(1)) !== -1;
    if (sel.charAt(0) === "#") return this.id === sel.slice(1);
    return this.tagName === sel.toUpperCase();
  };
  El.prototype.querySelectorAll = function (sel) {
    var out = [];
    (function walk(el) {
      el.children.forEach(function (ch) { if (ch._matches(sel)) out.push(ch); walk(ch); });
    })(this);
    return out;
  };
  El.prototype.querySelector = function (sel) {
    if (sel.charAt(0) === "#") return document.getElementById(sel.slice(1));
    var all = this.querySelectorAll(sel);
    return all.length ? all[0] : null;
  };
  El.prototype.closest = function (sel) {
    var el = this;
    while (el) { if (el._matches(sel)) return el; el = el.parent; }
    return null;
  };

  var document = {
    _byId: {},
    activeElement: null,
    listeners: {},
    addEventListener: function (type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); },
    dispatchEvent: function (ev) {
      ev.target = this;
      if (typeof ev.preventDefault !== "function") ev.preventDefault = function () {};
      if (typeof ev.stopPropagation !== "function") ev.stopPropagation = function () {};
      (this.listeners[ev.type] || []).slice().forEach(function (fn) { fn(ev); });
      return true;
    },
    getElementById: function (id) { return this._byId[id] || null; },
    createElement: function (tag) { return new El(tag); },
    querySelectorAll: function (sel) { return this.root.querySelectorAll(sel); },
    querySelector: function (sel) { return this.root.querySelector(sel); }
  };
  document.activeElement = new El("body");

  var root = new El("div");
  document.root = root;

  // nav 下拉（两工具页经 {{template "nav" .}} 引入，俱在；下拉接线 :180-219 不动）
  var dropdown = new El("div", "tools-dropdown");
  var dropdownBtn = new El("button", "tools-dropdown-btn");
  var dropdownContent = new El("div", "tools-dropdown-content");
  dropdown.appendChild(dropdownBtn);
  dropdown.appendChild(dropdownContent);
  root.appendChild(dropdown);

  // cron-parser 同款：cronForm 在（submit 处理器注册后不触发，无副作用）
  if (opts.cronForm) {
    var cronForm = new El("form");
    cronForm.id = "cronForm";
    document._byId.cronForm = cronForm;
    root.appendChild(cronForm);
  }

  var toolSearch = null, toolSearchLarge = null;
  if (opts.smallBox) {
    toolSearch = new El("input");
    toolSearch.id = "toolSearch";
    document._byId.toolSearch = toolSearch;
    root.appendChild(toolSearch);
  }
  if (opts.largeBox) {
    toolSearchLarge = new El("input");
    toolSearchLarge.id = "toolSearchLarge";
    document._byId.toolSearchLarge = toolSearchLarge;
    root.appendChild(toolSearchLarge);
  }

  var secAll = null, cards = [], cats = [];
  if (opts.withCards) {
    var secPopular = new El("section"); secPopular.id = "popular";
    var secNew = new El("section"); secNew.id = "new-tools";
    secAll = new El("section"); secAll.id = "all";
    document._byId.popular = secPopular;
    document._byId["new-tools"] = secNew;
    document._byId.all = secAll;
    root.appendChild(secPopular);
    root.appendChild(secNew);
    root.appendChild(secAll);
    var jsonNames = ["JSON 解析", "JSON 格式化", "JSON 转 CSV", "JSON 转 YAML", "JSON 转 TypeScript", "JSONPath 提取", "JSON 压缩", "JSON 对比", "JSON 转 XML"];
    var otherNames = ["Base64 编码", "时间戳转换", "正则测试", "UUID 生成", "密码生成", "颜色选择器", "Markdown 预览", "Cron 表达式", "URL 编解码", "哈希计算", "二维码生成", "文本对比", "进制转换", "图片压缩", "代码格式化"];
    var jsonIdx = 0, otherIdx = 0;
    function mkCard(name, desc) {
      var card = new El("div", "tool-card");
      var h = new El("h3"); h.textContent = name;
      var p = new El("p"); p.textContent = desc;
      card.appendChild(h); card.appendChild(p);
      return card;
    }
    [mkCard("JSON 解析", "在线解析 JSON 数据"), mkCard("Base64 编码", "Base64 编解码工具")]
      .forEach(function (c) { secPopular.appendChild(c); cards.push(c); });
    [mkCard("JSON 格式化", "格式化 JSON 字符串"), mkCard("时间戳转换", "Unix 时间戳互转")]
      .forEach(function (c) { secNew.appendChild(c); cards.push(c); });
    for (var ci = 0; ci < 19; ci++) {
      var cat = new El("div", "category");
      cat._idx = ci;
      secAll.appendChild(cat);
      cats.push(cat);
      var nCards = 2 + (ci % 3);
      for (var k = 0; k < nCards; k++) {
        var isJsonCat = [0, 2, 4, 6, 8, 10, 12, 14, 16].indexOf(ci) !== -1;
        var card;
        if (isJsonCat && k === 0 && jsonIdx < jsonNames.length) {
          card = mkCard(jsonNames[jsonIdx], "处理 JSON 数据的在线工具");
          jsonIdx++;
        } else {
          card = mkCard(otherNames[otherIdx % otherNames.length], "实用的在线开发工具");
          otherIdx++;
        }
        cat.appendChild(card);
        cards.push(card);
      }
    }
  }

  return {
    document: document,
    dropdown: dropdown, dropdownBtn: dropdownBtn, dropdownContent: dropdownContent,
    toolSearch: toolSearch, toolSearchLarge: toolSearchLarge,
    secAll: secAll, cards: cards, cats: cats
  };
}

/* 加载真实 script.js 并触发 DOMContentLoaded；返回首个抛错（无则 null） */
function loadScript(dom) {
  var sandbox = {
    document: dom.document,
    console: console,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout
  };
  vm.createContext(sandbox);
  try {
    vm.runInContext(scriptSrc, sandbox, { filename: "script.js" });
  } catch (e) {
    return e;
  }
  try {
    dom.document.dispatchEvent({ type: "DOMContentLoaded" });
  } catch (e) {
    return e;
  }
  return null;
}

function fireKey(dom, key) {
  dom.document.dispatchEvent({ type: "keydown", key: key, preventDefault: function () {}, stopPropagation: function () {} });
}
function typeInto(dom, input, term) {
  input.value = term;
  input.dispatchEvent({ type: "input", preventDefault: function () {}, stopPropagation: function () {} });
}
function expectedMatches(dom, term) {
  var t = term.toLowerCase();
  return dom.cards.filter(function (c) {
    var h = c.querySelector("h3"), p = c.querySelector("p");
    return ((h ? h.textContent : "") + " " + (p ? p.textContent : "")).toLowerCase().indexOf(t) !== -1;
  });
}
function visibleCards(dom) { return dom.cards.filter(function (c) { return c.style.display !== "none"; }); }
function visibleCats(dom) { return dom.cats.filter(function (c) { return c.style.display !== "none"; }); }

/* ---------- 场景 A：无搜索框（cron-parser／regex-tester 同款） ---------- */
(function scenarioA() {
  var dom = makeDom({ cronForm: true });
  var err = loadScript(dom);
  ok(err === null, "A 无搜索框：加载真实 script.js＋DOMContentLoaded 不抛错", err && (err.name + ": " + err.message));
  ok(!dom.toolSearch && !dom.toolSearchLarge, "A 桩确认：双搜索框均缺失");
  eq((dom.document.listeners.keydown || []).length, 2,
    "A 回调完整执行：document 上 keydown 监听器 2 个（ESC＋'/'，'/' 为回调末尾注册）");
  // 下拉菜单（:180-219 未动）仍工作：证明回调前半段正常跑完
  ok(!dom.dropdown.classList.contains("active"), "A 下拉初始未展开");
  dom.dropdownBtn.dispatchEvent({ type: "click", preventDefault: function () {}, stopPropagation: function () {} });
  ok(dom.dropdown.classList.contains("active"), "A 下拉点击按钮展开");
  dom.document.dispatchEvent({ type: "click", preventDefault: function () {}, stopPropagation: function () {} });
  ok(!dom.dropdown.classList.contains("active"), "A 下拉点击页面空白处关闭");
  // '/' 快捷键：监听器已注册，按下不抛错、无框可聚焦是预期行为
  var threw = null;
  try { fireKey(dom, "/"); } catch (e) { threw = e; }
  ok(threw === null, "A 无搜索框：按 '/' 不抛错", threw && (threw.name + ": " + threw.message));
  ok(dom.document.activeElement.tagName === "BODY", "A 按 '/' 后焦点仍在 body（无框可聚焦）");
  // ESC 关闭下拉仍工作
  dom.dropdownBtn.dispatchEvent({ type: "click", preventDefault: function () {}, stopPropagation: function () {} });
  ok(dom.dropdown.classList.contains("active"), "A ESC 前下拉已展开");
  fireKey(dom, "Escape");
  ok(!dom.dropdown.classList.contains("active"), "A 按 ESC 关闭下拉");
})();

/* ---------- 场景 A2：仅有大框（任一缺失即跳过接线） ---------- */
(function scenarioA2() {
  var dom = makeDom({ largeBox: true });
  var err = loadScript(dom);
  ok(err === null, "A2 仅大框：加载＋DOMContentLoaded 不抛错", err && (err.name + ": " + err.message));
  var threw = null;
  try {
    typeInto(dom, dom.toolSearchLarge, "json"); // 未接线：无同步、无过滤、无抛错
    fireKey(dom, "/");
  } catch (e) { threw = e; }
  ok(threw === null, "A2 仅大框：大框输入＋按 '/' 均不抛错", threw && (threw.name + ": " + threw.message));
  ok(dom.document.activeElement === dom.toolSearchLarge, "A2 仅大框：按 '/' 聚焦唯一存在的大框");
})();

/* ---------- 场景 A3：仅有小框 ---------- */
(function scenarioA3() {
  var dom = makeDom({ smallBox: true });
  var err = loadScript(dom);
  ok(err === null, "A3 仅小框：加载＋DOMContentLoaded 不抛错", err && (err.name + ": " + err.message));
  var threw = null;
  try {
    typeInto(dom, dom.toolSearch, "json");
    fireKey(dom, "/");
  } catch (e) { threw = e; }
  ok(threw === null, "A3 仅小框：小框输入＋按 '/' 均不抛错", threw && (threw.name + ": " + threw.message));
  ok(dom.document.activeElement.tagName === "BODY", "A3 仅小框：按 '/' 安全跳过、焦点仍在 body");
})();

/* ---------- 场景 B：有搜索框（首页同款桩，19 分类） ---------- */
(function scenarioB() {
  var dom = makeDom({ smallBox: true, largeBox: true, withCards: true });
  var err = loadScript(dom);
  ok(err === null, "B 有搜索框：加载＋DOMContentLoaded 不抛错", err && (err.name + ": " + err.message));
  eq(dom.cats.length, 19, "B 桩：夹具含 19 个分类");
  ok(dom.cards.length > 50, "B 桩：夹具卡片数 > 50", "实得 " + dom.cards.length);

  typeInto(dom, dom.toolSearchLarge, "json");
  var expJson = expectedMatches(dom, "json");
  eq(visibleCards(dom).length, expJson.length, "B 搜 \"json\" 可见卡片 = 匹配集合大小");
  var expJsonCats = {};
  expJson.forEach(function (c) { var cat = c.closest(".category"); if (cat) expJsonCats[cat._idx] = true; });
  eq(visibleCats(dom).length, Object.keys(expJsonCats).length, "B 搜 \"json\" 可见分类 = 含匹配卡的分类数");
  ok(visibleCats(dom).length > 0, "B 搜 \"json\" 可见分类 > 0", "实得 " + visibleCats(dom).length);
  var badVisible = 0, badHidden = 0;
  dom.cats.forEach(function (cat) {
    var n = cat.querySelectorAll(".tool-card").filter(function (c) { return c.style.display !== "none"; }).length;
    if (cat.style.display !== "none" && n < 1) badVisible++;
    if (cat.style.display === "none" && n !== 0) badHidden++;
  });
  ok(badVisible === 0, "B 搜 \"json\"：可见分类内均 >=1 张可见卡", "违规 " + badVisible + " 个");
  ok(badHidden === 0, "B 搜 \"json\"：隐藏分类内 0 张可见卡", "违规 " + badHidden + " 个");
  ok(!dom.document.getElementById("noResults"), "B 有匹配时无 noResults 提示");

  eq(dom.toolSearch.value, "json", "B 双框同步：大框输入同步到小框");
  typeInto(dom, dom.toolSearch, "base64");
  eq(dom.toolSearchLarge.value, "base64", "B 双框同步：小框输入同步到大框");
  eq(visibleCards(dom).length, expectedMatches(dom, "base64").length, "B 小框输入后过滤一致");

  typeInto(dom, dom.toolSearchLarge, "");
  eq(visibleCats(dom).length, 19, "B 清空后 19/19 分类可见");
  eq(visibleCards(dom).length, dom.cards.length, "B 清空后全部卡片可见");
  ok(!dom.document.getElementById("noResults"), "B 清空后无 noResults 提示");

  typeInto(dom, dom.toolSearchLarge, "zzzzqqq");
  eq(visibleCards(dom).length, 0, "B 零匹配可见卡片 0 张");
  eq(visibleCats(dom).length, 0, "B 零匹配可见分类 0 个");
  var nr = dom.document.getElementById("noResults");
  ok(!!nr, "B 零匹配时 #noResults 已创建");
  ok(nr && nr.textContent.indexOf("未找到匹配的工具") !== -1, "B 提示文案为「未找到匹配的工具」");
  ok(nr && nr.parent && nr.parent.id === "all", "B 提示挂载在 #all 内");
  typeInto(dom, dom.toolSearchLarge, "");
  eq(visibleCats(dom).length, 19, "B 零匹配后清空恢复 19/19");
  ok(!dom.document.getElementById("noResults"), "B 零匹配后清空提示已移除");

  fireKey(dom, "/");
  ok(dom.document.activeElement === dom.toolSearchLarge, "B 按 '/' 聚焦大搜索框");
  // script.js 的 ESC 只关下拉、不清空搜索（与 search.js 不同）
  typeInto(dom, dom.toolSearchLarge, "json");
  dom.dropdownBtn.dispatchEvent({ type: "click", preventDefault: function () {}, stopPropagation: function () {} });
  ok(dom.dropdown.classList.contains("active"), "B ESC 前下拉已展开");
  fireKey(dom, "Escape");
  ok(!dom.dropdown.classList.contains("active"), "B 按 ESC 关闭下拉");
  eq(dom.toolSearchLarge.value, "json", "B ESC 后搜索值保留（script.js 的 ESC 不清空搜索）");
})();

console.log("scriptjs_null_guard: pass=" + pass + " fail=" + fail);
process.exit(fail ? 1 : 0);
