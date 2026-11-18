/* 首页搜索过滤（homepage_search）回归测试：
 * 缺陷：filterTools 用 category.querySelectorAll('.tool-card[style=""]') 计数可见卡；
 * 匹配卡初始无 style 属性，card.style.display='' 不会产生 style="" 属性，计数恒为 0，
 * 一打字 19 个分类全被 display:none 藏起（仅分类外的热门／新工具卡可见）。
 * 修复：search.js:30 与 script.js:250 改为逐张判断 card.style.display !== 'none'。
 *
 * 运行：node tests/homepage_search.test.js
 * 两种模式（自动选择，启动时打印）：
 *  1) jsdom 模式：require("jsdom") 可用且环境变量 HOMEPAGE_HTML 指向一份真实渲染首页
 *     HTML（如本地服务 http://127.0.0.1:18099/ 抓回的文件）时，用真实 HTML＋真实
 *     static/js/search.js 跑全部锚点（搜 "json"→57 张／可见分类＝含匹配卡的分类数、
 *     "jso" 一致、清空 19/19、零匹配提示、'/' 聚焦与 ESC 清空、双框同步）。
 *     例：HOMEPAGE_HTML=/tmp/home-2026-11-18.html NODE_PATH=<jsdom 所在 node_modules> node tests/homepage_search.test.js
 *  2) 最小 DOM 桩模式（零依赖默认）：用最小 DOM 桩加载真实 search.js 源码，跑同一组
 *     不变量（可见分类＝含 >=1 张匹配卡的分类；每个可见分类内 >=1 张可见卡；
 *     每个隐藏分类内 0 张可见卡；零匹配提示实际创建并挂在 #all 内；快捷键与双框同步），
 *     外加源码静态断言（两文件均无 [style=""]、匹配逻辑 search.js:24-26 未动、
 *     templates/index.html 加载 search.js）。
 * 开发轮 jsdom 实测（2026-11-18，真实首页 HTML＋真实 search.js）：搜 "json"→可见卡 57 张，
 * 可见分类 9 个（分类外 28 张：热门 1＋新工具 27；分类内 29 张，修复前被困），"jso"→57 张／9 类，
 * 清空→19/19，零匹配→0 卡 0 类＋「未找到匹配的工具」可见，'/'／ESC／双框同步均正常。
 */
"use strict";
var fs = require("fs");
var path = require("path");

var ROOT = path.join(__dirname, "..");
var searchJsPath = path.join(ROOT, "static/js/search.js");
var searchSrc = fs.readFileSync(searchJsPath, "utf-8");
var scriptSrc = fs.readFileSync(path.join(ROOT, "static/js/script.js"), "utf-8");
var indexHtml = fs.readFileSync(path.join(ROOT, "templates/index.html"), "utf-8");

var pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name, extra !== undefined ? "(" + extra + ")" : ""); }
}
function eq(a, b, name) { ok(a === b, name, "期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a)); }

/* ---------- 源码静态断言（两种模式共用） ---------- */
ok(searchSrc.indexOf('[style=""]') === -1, "search.js 不再使用 [style=\"\"] 属性选择器计数");
ok(scriptSrc.indexOf('[style=""]') === -1, "script.js 不再使用 [style=\"\"] 属性选择器计数");
ok(searchSrc.indexOf("card.style.display !== 'none'") !== -1, "search.js 按实际可见性计数（style.display !== 'none')");
ok(scriptSrc.indexOf("card.style.display !== 'none'") !== -1, "script.js 按实际可见性计数（style.display !== 'none')");
ok(searchSrc.indexOf("const isMatch = name.includes(term) || description.includes(term);") !== -1,
  "search.js 匹配逻辑未动（:24-26 name/description includes）");
ok(indexHtml.indexOf("search.js") !== -1, "templates/index.html 加载 search.js");

/* ---------- 共用断言：对任一已挂载 search.js 的 document 跑锚点 ---------- */
function runAnchors(api, label) {
  // api: { document, input, inputSmall, allCards(), allCats(), visibleCards(), visibleCats(),
  //        expectedMatches(term), type(term), fireKey(key) }
  var doc = api.document;
  var totalCards = api.allCards().length;
  var totalCats = api.allCats().length;
  console.log("[" + label + "] cards=" + totalCards + " categories=" + totalCats);

  function checkInvariants(tag) {
    var badVisible = 0, badHidden = 0;
    api.allCats().forEach(function (cat) {
      var n = api.cardsIn(cat).filter(function (c) { return c.style.display !== "none"; }).length;
      if (cat.style.display !== "none" && n < 1) badVisible++;
      if (cat.style.display === "none" && n !== 0) badHidden++;
    });
    ok(badVisible === 0, label + " " + tag + "：可见分类内均 >=1 张可见卡", "违规 " + badVisible + " 个");
    ok(badHidden === 0, label + " " + tag + "：隐藏分类内 0 张可见卡", "违规 " + badHidden + " 个");
  }

  api.type("json");
  var expJson = api.expectedMatches("json");
  eq(api.visibleCards().length, expJson.length, label + " 搜 \"json\" 可见卡片 = 匹配集合大小");
  ok(api.visibleCards().length === 57 || totalCards !== 630, label + " 搜 \"json\" 可见卡片 57 张（真实首页）", "实得 " + api.visibleCards().length);
  var expJsonCats = {};
  expJson.forEach(function (c) { var cat = api.closestCategory(c); if (cat) expJsonCats[api.catId(cat)] = true; });
  eq(api.visibleCats().length, Object.keys(expJsonCats).length, label + " 搜 \"json\" 可见分类 = 含匹配卡的分类数");
  ok(api.visibleCats().length > 0, label + " 搜 \"json\" 可见分类 > 0", "实得 " + api.visibleCats().length);
  checkInvariants("\"json\"");
  ok(!doc.getElementById("noResults"), label + " 有匹配时无 noResults 提示");

  api.type("jso");
  var expJso = api.expectedMatches("jso");
  eq(api.visibleCards().length, expJso.length, label + " 搜 \"jso\" 可见卡片 = 匹配集合大小");
  var expJsoCats = {};
  expJso.forEach(function (c) { var cat = api.closestCategory(c); if (cat) expJsoCats[api.catId(cat)] = true; });
  eq(api.visibleCats().length, Object.keys(expJsoCats).length, label + " 搜 \"jso\" 可见分类 = 含匹配卡的分类数");
  ok(api.visibleCats().length > 0, label + " 搜 \"jso\" 可见分类 > 0", "实得 " + api.visibleCats().length);
  checkInvariants("\"jso\"");

  api.type("");
  eq(api.visibleCats().length, totalCats, label + " 清空后全部分类可见");
  eq(api.visibleCards().length, totalCards, label + " 清空后全部卡片可见");
  ok(!doc.getElementById("noResults"), label + " 清空后无 noResults 提示");

  api.type("zzzzqqq");
  eq(api.visibleCards().length, 0, label + " 零匹配可见卡片 0 张");
  eq(api.visibleCats().length, 0, label + " 零匹配可见分类 0 个");
  var nr = doc.getElementById("noResults");
  ok(!!nr, label + " 零匹配时 #noResults 已创建");
  ok(nr && nr.textContent.indexOf("未找到匹配的工具") !== -1, label + " 提示文案为「未找到匹配的工具」");
  ok(nr && nr.style.display !== "none", label + " 提示元素未被隐藏");
  ok(nr && api.parentId(nr) === "all", label + " 提示挂载在 #all 内");
  ok(nr && api.sectionVisible("all"), label + " 挂载点 #all 本身可见");
  api.type("");
  eq(api.visibleCats().length, totalCats, label + " 零匹配后清空恢复全部分类可见");
  ok(!doc.getElementById("noResults"), label + " 零匹配后清空提示已移除");

  api.type("json");
  eq(api.inputSmall.value, "json", label + " 双框同步：大框输入同步到小框");
  api.typeSmall("base64");
  eq(api.input.value, "base64", label + " 双框同步：小框输入同步到大框");
  eq(api.visibleCards().length, api.expectedMatches("base64").length, label + " 小框输入后过滤一致");
  api.fireKey("/");
  ok(doc.activeElement === api.input, label + " 按 / 聚焦大搜索框");
  api.fireKey("Escape");
  eq(api.input.value, "", label + " ESC 清空大框");
  eq(api.inputSmall.value, "", label + " ESC 清空小框");
  eq(api.visibleCats().length, totalCats, label + " ESC 后恢复全部分类可见");
  eq(api.visibleCards().length, totalCards, label + " ESC 后全部卡片可见");
}

/* ---------- 模式 1：jsdom＋真实首页 HTML ---------- */
var jsdom = null;
try { jsdom = require("jsdom"); } catch (e) { /* 未安装则走桩模式 */ }
var homepageHtmlPath = process.env.HOMEPAGE_HTML || "";
if (jsdom && homepageHtmlPath && fs.existsSync(homepageHtmlPath)) {
  console.log("模式：jsdom（真实首页 HTML：" + homepageHtmlPath + "）");
  var JSDOM = jsdom.JSDOM;
  var html = fs.readFileSync(homepageHtmlPath, "utf-8");
  var dom = new JSDOM(html, { url: "https://www.it-tool.eu.cc/tool-web/index", runScripts: "outside-only" });
  var window = dom.window;
  var document = window.document;
  window.eval(searchSrc);
  document.dispatchEvent(new window.Event("DOMContentLoaded", { bubbles: true }));
  var input = document.getElementById("toolSearchLarge");
  var inputSmall = document.getElementById("toolSearch");
  ok(!!input && !!inputSmall, "jsdom：双搜索框俱在");
  var allCards = Array.prototype.slice.call(document.querySelectorAll(".tool-card"));
  var allCats = Array.prototype.slice.call(document.querySelectorAll(".category"));
  eq(allCats.length, 19, "jsdom：真实首页 19 个分类");
  runAnchors({
    document: document, input: input, inputSmall: inputSmall,
    allCards: function () { return allCards; },
    allCats: function () { return allCats; },
    cardsIn: function (cat) { return Array.prototype.slice.call(cat.querySelectorAll(".tool-card")); },
    visibleCards: function () { return allCards.filter(function (c) { return c.style.display !== "none"; }); },
    visibleCats: function () { return allCats.filter(function (c) { return c.style.display !== "none"; }); },
    expectedMatches: function (term) {
      var t = term.toLowerCase();
      return allCards.filter(function (c) {
        var h = c.querySelector("h3"), p = c.querySelector("p");
        return ((h ? h.textContent : "") + " " + (p ? p.textContent : "")).toLowerCase().indexOf(t) !== -1;
      });
    },
    closestCategory: function (card) { return card.closest(".category"); },
    catId: function (cat) { return allCats.indexOf(cat); },
    parentId: function (el) { return el.parentElement ? el.parentElement.id : ""; },
    sectionVisible: function (id) { var s = document.getElementById(id); return !!s && s.style.display !== "none"; },
    type: function (term) {
      input.value = term;
      input.dispatchEvent(new window.Event("input", { bubbles: true }));
    },
    typeSmall: function (term) {
      inputSmall.value = term;
      inputSmall.dispatchEvent(new window.Event("input", { bubbles: true }));
    },
    fireKey: function (key) {
      document.dispatchEvent(new window.KeyboardEvent("keydown", { key: key, bubbles: true }));
    }
  }, "jsdom");
} else {
  /* ---------- 模式 2：最小 DOM 桩（零依赖默认） ---------- */
  console.log("模式：最小 DOM 桩（jsdom 不可用或未设 HOMEPAGE_HTML；jsdom 锚点见本文件头注释）");
  if (jsdom && !homepageHtmlPath) console.log("提示：已装 jsdom，设 HOMEPAGE_HTML=<真实首页 HTML> 可跑真实锚点");
  if (!jsdom) console.log("提示：未找到 jsdom（npm i jsdom 后可跑真实锚点），当前以桩覆盖计数逻辑");

  /* --- 最小 DOM：仅实现 search.js 用到的接口 --- */
  function Style(el) {
    this._el = el;
    this.display = "";
    this._attr = null; // 序列化后的 style 属性：null＝无属性（jsdom 实测：display='' 不产生属性）
  }
  Style.prototype._setDisplay = function (v) {
    if (v === "") { if (this._attr !== null) this._attr = ""; }
    else { this._attr = "display: " + v + ";"; }
    this.display = v;
  };
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
    var self = this;
    this.style = new Proxy(new Style(this), {
      set: function (t, k, v) { if (k === "display") t._setDisplay(v); else t[k] = v; return true; },
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
    (this.listeners[ev.type] || []).forEach(function (fn) { fn(ev); });
    return true;
  };
  El.prototype.appendChild = function (child) { child.parent = this; this.children.push(child); return child; };
  El.prototype.remove = function () {
    if (!this.parent) return;
    var i = this.parent.children.indexOf(this);
    if (i !== -1) this.parent.children.splice(i, 1);
    this.parent = null;
  };
  El.prototype.focus = function () { document.activeElement = this; };
  El.prototype.matchesSel = function (sel) {
    if (sel === ".tool-card") return this.className.split(" ").indexOf("tool-card") !== -1;
    if (sel === ".category") return this.className.split(" ").indexOf("category") !== -1;
    if (sel === ".tool-card[style=\"\"]") {
      return this.className.split(" ").indexOf("tool-card") !== -1 && this.style._attr === "";
    }
    return false;
  };
  El.prototype.querySelectorAll = function (sel) {
    var out = [];
    (function walk(el) {
      el.children.forEach(function (ch) { if (ch.matchesSel(sel)) out.push(ch); walk(ch); });
    })(this);
    return out;
  };
  El.prototype.querySelector = function (sel) {
    if (sel === "#all") return document.getElementById("all");
    if (sel === "h3" || sel === "p") {
      for (var i = 0; i < this.children.length; i++) {
        if (this.children[i].tagName === sel.toUpperCase()) return this.children[i];
      }
      return null;
    }
    return null;
  };
  El.prototype.closest = function (sel) {
    var el = this;
    while (el) {
      if (sel === ".category" && el.className.split(" ").indexOf("category") !== -1) return el;
      el = el.parent;
    }
    return null;
  };

  var document = {
    _byId: {},
    activeElement: null,
    listeners: {},
    addEventListener: function (type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); },
    dispatchEvent: function (ev) {
      ev.target = this;
      (this.listeners[ev.type] || []).forEach(function (fn) { fn(ev); });
      return true;
    },
    getElementById: function (id) { return this._byId[id] || null; },
    createElement: function (tag) { return new El(tag); },
    querySelectorAll: function (sel) { return this.root.querySelectorAll(sel); },
    querySelector: function (sel) { return this.root.querySelector(sel); }
  };
  document.activeElement = new El("body");

  function mkCard(name, desc) {
    var card = new El("div", "tool-card");
    var h = new El("h3"); h.textContent = name;
    var p = new El("p"); p.textContent = desc;
    card.appendChild(h); card.appendChild(p);
    return card;
  }
  // 夹具：结构与真实首页一致（热门区＋新工具区在分类外；#all 内 19 个分类），
  // 名称／描述取自真实工具名；"json" 在 9 个分类中有匹配。
  var root = new El("div");
  document.root = root;
  var toolSearch = new El("input"); toolSearch.id = "toolSearch";
  var toolSearchLarge = new El("input"); toolSearchLarge.id = "toolSearchLarge";
  var secPopular = new El("section"); secPopular.id = "popular";
  var secNew = new El("section"); secNew.id = "new-tools";
  var secAll = new El("section"); secAll.id = "all";
  [toolSearch, toolSearchLarge, secPopular, secNew, secAll].forEach(function (el) {
    if (el.id) document._byId[el.id] = el;
    root.appendChild(el);
  });
  var jsonNames = ["JSON 解析", "JSON 格式化", "JSON 转 CSV", "JSON 转 YAML", "JSON 转 TypeScript", "JSONPath 提取", "JSON 压缩", "JSON 对比", "JSON 转 XML"];
  var otherNames = ["Base64 编码", "时间戳转换", "正则测试", "UUID 生成", "密码生成", "颜色选择器", "Markdown 预览", "Cron 表达式", "URL 编解码", "哈希计算", "二维码生成", "文本对比", "进制转换", "图片压缩", "代码格式化"];
  var popularCards = [mkCard("JSON 解析", "在线解析 JSON 数据"), mkCard("Base64 编码", "Base64 编解码工具")];
  popularCards.forEach(function (c) { secPopular.appendChild(c); });
  var newCards = [mkCard("JSON 格式化", "格式化 JSON 字符串"), mkCard("时间戳转换", "Unix 时间戳互转")];
  newCards.forEach(function (c) { secNew.appendChild(c); });
  var cats = [];
  var jsonIdx = 0, otherIdx = 0;
  for (var ci = 0; ci < 19; ci++) {
    var cat = new El("div", "category");
    cat._idx = ci;
    secAll.appendChild(cat);
    cats.push(cat);
    var nCards = 2 + (ci % 3); // 2~4 张
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
    }
  }
  // #noResults 由 filterTools 动态创建：append 到 #all 时登记 id，remove 时注销
  var origAppend = secAll.appendChild.bind(secAll);
  secAll.appendChild = function (child) {
    var r = origAppend(child);
    if (child.id) document._byId[child.id] = child;
    return r;
  };
  // remove 时注销
  El.prototype.remove = (function (origRemove) {
    return function () {
      if (this.id && document._byId[this.id] === this) delete document._byId[this.id];
      return origRemove.call(this);
    };
  })(El.prototype.remove);

  // 加载真实 search.js：以 document/window 桩为全局环境执行
  var vm = require("vm");
  var sandbox = {
    document: document,
    window: { Event: function (type, opts) { this.type = type; this.bubbles = !!(opts && opts.bubbles); } },
    console: console
  };
  sandbox.window.Event.prototype.preventDefault = function () {};
  sandbox.window.KeyboardEvent = function (type, opts) {
    this.type = type; this.key = (opts && opts.key) || ""; this.bubbles = !!(opts && opts.bubbles);
    this.preventDefault = function () {};
  };
  vm.createContext(sandbox);
  vm.runInContext(searchSrc, sandbox, { filename: "search.js" });
  document.dispatchEvent({ type: "DOMContentLoaded" });
  // DOMContentLoaded 监听器挂在 document 上，上面 dispatch 已触发 search.js 的初始化

  var stubCards = root.querySelectorAll(".tool-card");
  var stubCats = root.querySelectorAll(".category");
  eq(stubCats.length, 19, "桩：夹具含 19 个分类");
  ok(stubCards.length > 50, "桩：夹具卡片数 > 50", "实得 " + stubCards.length);
  // 桩上 document.getElementById('noResults') 初始为 null（search.js 内部也依赖此行为）
  ok(document.getElementById("noResults") === null, "桩：初始无 noResults");

  runAnchors({
    document: document, input: toolSearchLarge, inputSmall: toolSearch,
    allCards: function () { return stubCards; },
    allCats: function () { return stubCats; },
    cardsIn: function (cat) { return cat.querySelectorAll(".tool-card"); },
    visibleCards: function () { return stubCards.filter(function (c) { return c.style.display !== "none"; }); },
    visibleCats: function () { return stubCats.filter(function (c) { return c.style.display !== "none"; }); },
    expectedMatches: function (term) {
      var t = term.toLowerCase();
      return stubCards.filter(function (c) {
        var h = c.querySelector("h3"), p = c.querySelector("p");
        return ((h ? h.textContent : "") + " " + (p ? p.textContent : "")).toLowerCase().indexOf(t) !== -1;
      });
    },
    closestCategory: function (card) { return card.closest(".category"); },
    catId: function (cat) { return cat._idx; },
    parentId: function (el) { return el.parent ? el.parent.id : ""; },
    sectionVisible: function (id) { var s = document.getElementById(id); return !!s && s.style.display !== "none"; },
    type: function (term) {
      toolSearchLarge.value = term;
      toolSearchLarge.dispatchEvent({ type: "input", preventDefault: function () {} });
    },
    typeSmall: function (term) {
      toolSearch.value = term;
      toolSearch.dispatchEvent({ type: "input", preventDefault: function () {} });
    },
    fireKey: function (key) {
      document.dispatchEvent({ type: "keydown", key: key, preventDefault: function () {} });
    }
  }, "桩");
}

console.log("homepage_search: pass=" + pass + " fail=" + fail);
process.exit(fail ? 1 : 0);
