/* MAP 文件内存分析器纯逻辑单元测试（零依赖）：node tests/map_memory_analyzer.test.js
 * 覆盖：确定性向量（规格逐字命中）、错误约定（err.field="input"）、
 * 双模式导出、注册与零网络请求静态检查、真限制四条页面明示、嵌入式簇互链。 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/map_memory_analyzer.js");

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function deepEq(a, b, name) { ok(JSON.stringify(a) === JSON.stringify(b), name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function throwsField(fn, field, name) {
  try { fn(); } catch (e) {
    ok(e instanceof Error && e.field === field,
      name + "（期望抛 Error 且 err.field=" + JSON.stringify(field) + "，实得 " +
      (e instanceof Error ? "Error field=" + JSON.stringify(e.field) : typeof e) + "）");
    return;
  }
  fail++; console.error("FAIL:", name + "（未抛出异常）");
}

var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "map_memory_analyzer.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "map_memory_analyzer.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

var SAMPLE = M.generateExampleMap();

/* ---------- 1. detectMapFormat ---------- */
eq(M.detectMapFormat(SAMPLE), "gcc", "detectMapFormat(SAMPLE)='gcc'");
eq(M.detectMapFormat("Module Summary\nKind                    ro code"), null, "detectMapFormat(IAR风格)=null");
eq(M.detectMapFormat("hello world"), null, "detectMapFormat('hello world')=null");
eq(M.detectMapFormat(""), null, "detectMapFormat('')=null");
eq(M.detectMapFormat("Memory Configuration\n"), null, "缺 Linker script and memory map 标记即 null");

/* ---------- 2. parseMemoryRegions 逐字命中 ---------- */
deepEq(M.parseMemoryRegions(SAMPLE), [
  { name: "FLASH", origin: 0x08000000, length: 0x40000, attrs: "xr" },
  { name: "RAM", origin: 0x20000000, length: 0x8000, attrs: "xrw" }
], "parseMemoryRegions(SAMPLE) 逐字命中（跳过 *default*）");

/* ---------- 3. parseMapSections 逐字命中 ---------- */
var secs = M.parseMapSections(SAMPLE);
eq(secs.length, 4, "parseMapSections(SAMPLE).length=4");
eq(secs[0].name, ".text", ".text 段名");
eq(secs[0].vma, 0x08000000, ".text VMA");
eq(secs[0].size, 0x120, ".text 大小 0x120");
eq(secs[0].entries.length, 3, ".text entries=3");
eq(secs[0].entries[0].file, "/build/startup.o", ".text 首项 startup.o");
eq(secs[0].entries[0].size, 0x80, "startup.o 0x80");
eq(secs[0].entries[1].file, "/build/main.o", ".text 次项 main.o");
eq(secs[0].entries[1].size, 0x40, "main.o .text 0x40");
eq(secs[0].entries[2].isFill, true, ".text fill 项 isFill=true");
eq(secs[0].entries[2].size, 0x4, "fill 大小 0x4");
eq(secs[0].entries[2].file, "", "fill 无对象文件");
eq(secs[1].name, ".rodata", ".rodata 段名");
eq(secs[1].size, 0x20, ".rodata 大小 0x20");
eq(secs[2].name, ".data", ".data 段名");
eq(secs[2].loadVma, 0x08000144, ".data loadVma=0x08000144");
eq(secs[2].vma, 0x20000000, ".data VMA=0x20000000");
eq(secs[3].name, ".bss", ".bss 段名");
eq(secs[3].size, 0x30, ".bss 大小 0x30");
throwsField(function () { M.parseMapSections("hello world"); }, "input", "parseMapSections('hello world') 抛 Error err.field=input");
throwsField(function () { M.parseMapSections(""); }, "input", "parseMapSections('') 抛 Error err.field=input");

/* ---------- 4. computeRegionUsage 逐字命中 ---------- */
var regions = M.parseMemoryRegions(SAMPLE);
var usage = M.computeRegionUsage(regions, secs);
function byName(u, n) { for (var i = 0; i < u.length; i++) if (u[i].name === n) return u[i]; return null; }
var flash = byName(usage, "FLASH"), ram = byName(usage, "RAM");
eq(flash.used, 0x150, "FLASH used=0x150（0x120+0x20+load镜像0x10）");
eq(flash.length, 0x40000, "FLASH length=0x40000");
eq(ram.used, 0x40, "RAM used=0x40（0x10+0x30）");
eq(ram.length, 0x8000, "RAM length=0x8000");
eq(flash.free, 0x40000 - 0x150, "FLASH free=length-used");
ok(typeof flash.pct === "number" && flash.pct === Math.round(flash.pct * 100) / 100, "pct 保留两位小数");
throwsField(function () { M.computeRegionUsage(null, secs); }, "regions", "computeRegionUsage 非法 regions 抛错");

/* ---------- 5. topObjects 逐字命中 ---------- */
deepEq(M.topObjects(secs, 2), [["/build/main.o", 0xA0], ["/build/startup.o", 0x80]], "topObjects(…,2) 逐字命中");
throwsField(function () { M.topObjects(secs, 0); }, "n", "topObjects n=0 抛错");

/* ---------- 6. summarizeMap ---------- */
var sum = M.summarizeMap(SAMPLE);
deepEq(sum.totals, { text: 0x120, rodata: 0x20, data: 0x10, bss: 0x30, fill: 0x4 }, "summarizeMap(SAMPLE).totals 逐字命中");
eq(sum.sectionCount, 4, "summarizeMap sectionCount=4");
eq(sum.objectCount, 2, "summarizeMap objectCount=2");
eq(sum.topObjects.length, 2, "summarizeMap topObjects 全量 2 个");
throwsField(function () { M.summarizeMap("hello world"); }, "input", "summarizeMap 非 GCC 抛错 err.field=input");

/* ---------- 7. formatBytes / generateExampleMap ---------- */
eq(M.formatBytes(1536), "1.5 KB", "formatBytes(1536)");
eq(M.formatBytes(500), "500 B", "formatBytes(500)");
eq(M.formatBytes(1048576), "1.00 MB", "formatBytes(1MB)");
ok(M.generateExampleMap().indexOf("Memory Configuration") !== -1, "generateExampleMap 含 Memory Configuration");
ok(M.generateExampleMap().indexOf("Linker script and memory map") !== -1, "generateExampleMap 含 Linker script and memory map");
eq(M.baseName("/build/main.o"), "main.o", "baseName 取文件名");

/* ---------- 8. 双模式导出 ---------- */
["detectMapFormat", "parseMemoryRegions", "parseMapSections", "computeRegionUsage",
 "topObjects", "summarizeMap", "formatBytes", "generateExampleMap", "baseName"]
  .forEach(function (k) { ok(typeof M[k] === "function", "导出函数 " + k); });

/* ---------- 9. 注册 ---------- */
ok(/ID:\s*"map_memory_analyzer"/.test(GO_SRC), "categories.go 注册 ID map_memory_analyzer");
ok(/Path:\s*"\/tools\/map-memory-analyzer"/.test(GO_SRC), "categories.go 注册 Path /tools/map-memory-analyzer");
ok(/ID:\s*"map_memory_analyzer"[\s\S]{0,800}?Category:\s*"开发工具"/.test(GO_SRC), "map_memory_analyzer 归属开发工具品类");
ok(/ID:\s*"map_memory_analyzer"[\s\S]{0,800}?New:\s*true/.test(GO_SRC), "map_memory_analyzer New:true");
ok(/ID:\s*"map_memory_analyzer"[\s\S]{0,800}?Icon:\s*"analytics"/.test(GO_SRC), "map_memory_analyzer Icon:analytics");
ok(/{{define "map_memory_analyzer"}}/.test(TPL_SRC), "模板 define map_memory_analyzer");
ok(/https:\/\/www\.johnkingzcq123\.xyz\/tools\/map-memory-analyzer/.test(TPL_SRC), "模板 canonical");
var paths = GO_SRC.match(/"\/tools\/[^"]+"/g) || [];
ok(new Set(paths).size === 236, "全量 Path 数 236（实得 " + new Set(paths).size + "）");

/* ---------- 10. 真限制四条页面明示 ---------- */
ok(/仅支持 GCC ld -Map 输出/.test(TPL_SRC), "真限制①：仅 GCC ld -Map");
ok(/只有输入节粒度/.test(TPL_SRC), "真限制②：只有输入节粒度");
ok(/\.data 初始化段同时占 Flash 与 RAM/.test(TPL_SRC), "真限制③：.data 同时占 Flash 与 RAM");
ok(/全程本地解析/.test(TPL_SRC), "真限制④：全程本地解析零上传");

/* ---------- 11. 嵌入式簇互链 ---------- */
ok(/\/tools\/hex-c-array/.test(TPL_SRC), "模板互链 HEX↔C 数组互转器");
ok(/\/tools\/register-bitfield/.test(TPL_SRC), "模板互链寄存器位域");
ok(/\/tools\/modbus-frame/.test(TPL_SRC), "模板互链 Modbus");
ok(/\/tools\/crc-checksum-calculator/.test(TPL_SRC), "模板互链 CRC");

/* ---------- 12. 零网络请求静态检查 ---------- */
ok(!/fetch\s*\(/.test(JS_SRC), "JS 无 fetch");
ok(!/XMLHttpRequest/.test(JS_SRC), "JS 无 XMLHttpRequest");
ok(!/WebSocket/.test(JS_SRC), "JS 无 WebSocket");
ok(!/<script[^>]*src\s*=\s*"https?:\/\//.test(TPL_SRC), "模板无外部 script");
ok(!/<link[^>]*rel\s*=\s*"stylesheet"[^>]*href\s*=\s*"https?:\/\//.test(TPL_SRC), "模板无外部样式");
ok(!/fetch\s*\(|XMLHttpRequest/.test(TPL_SRC), "模板无 fetch/XHR");

console.log("map_memory_analyzer: pass=" + pass + " fail=" + fail);
process.exit(fail ? 1 : 0);
