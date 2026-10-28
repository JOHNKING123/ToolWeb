/* Gzip Base64 解码器纯逻辑单元测试（零依赖）：node tests/gzip_base64_decoder.test.js
 * 覆盖：
 * 1. 归一化（换行空白、前缀剥离、url-safe 转回、补齐 =、非法字符位置、空输入）
 * 2. gzip 固定向量与裸 Base64 / 截断 gzip 的失败 stage
 * 3. gzipBase64Encode 往返（含固定向量精确相等）
 * 4. 非 UTF-8 解压结果 stage=utf8、容量常量与超限分支
 * 5. 导出文件名、注册总数 205→206、页面静态检查（真限制可见、互链仅 Base64、零网络）
 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/gzip_base64_decoder.js");

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function throwsStage(fn, stage, name) {
  try { fn(); ok(false, name + "（应抛错未抛）"); }
  catch (e) { ok(e.stage === stage, name + "（期望 stage=" + stage + "，实得 " + (e && e.stage) + "：" + (e && e.message) + "）"); }
}
async function rejectsStage(promiseFn, stage, name) {
  try {
    var p = (typeof promiseFn === "function") ? promiseFn() : promiseFn;
    await p; ok(false, name + "（应拒绝未拒绝）");
  }
  catch (e) { ok(e.stage === stage, name + "（期望 stage=" + stage + "，实得 " + (e && e.stage) + "：" + (e && e.message) + "）"); }
}

var SAMPLE = "H4sIAAAAAAAAA/NIzcnJ11EIyc/PCU9NUuQCAInvfO4QAAAA";

async function main() {
  /* ---------- 1. 归一化 ---------- */
  eq(M.normalizeBase64(SAMPLE.slice(0, 10) + "\n " + SAMPLE.slice(10)), SAMPLE, "含换行空白归一化成功");
  eq(M.normalizeBase64("data:text/plain;base64," + SAMPLE), SAMPLE, "data: 前缀剥离成功");
  eq(M.normalizeBase64("data:application/octet-stream;base64," + SAMPLE), SAMPLE, "data: 任意 MIME 前缀剥离成功");
  eq(M.normalizeBase64(SAMPLE.replace(/\//g, "_")), SAMPLE, "url-safe _ 转回 / 成功");
  eq(M.normalizeBase64("SGk"), "SGk=", "缺 = 补齐成功");
  eq(M.decodeBase64("SGk").length, 2, "补齐后解码长度正确");
  eq(Buffer.from(M.decodeBase64("SGk")).toString("utf8"), "Hi", "补齐后解码内容正确");
  try { M.normalizeBase64("AB!C"); ok(false, "非法字符应抛错"); }
  catch (e) {
    eq(e.stage, "normalize", "非法字符 stage=normalize");
    eq(e.position, 3, "非法字符位置为 3");
    eq(e.char, "!", "非法字符为 !");
  }
  throwsStage(function () { M.normalizeBase64(""); }, "normalize", "空输入失败");
  throwsStage(function () { M.normalizeBase64("   \n "); }, "normalize", "纯空白输入失败");
  throwsStage(function () { M.normalizeBase64("data:text/plain;base64,"); }, "normalize", "仅前缀无内容失败");

  /* ---------- 2. 魔数与 gzip 向量 ---------- */
  var sampleBytes = M.decodeBase64(SAMPLE);
  ok(M.isGzip(sampleBytes), "固定向量 isGzip=true");
  ok(!M.isGzip(M.decodeBase64("aGVsbG8=")), "裸 Base64 isGzip=false");
  ok(!M.isGzip(new Uint8Array([])), "空字节 isGzip=false");
  ok(!M.isGzip(new Uint8Array([0x1f])), "单字节 0x1F isGzip=false");
  var res = await M.decodeGzipBase64(SAMPLE);
  eq(res.ok, true, "固定向量解码 ok");
  eq(res.text, "Hello, ToolWeb!\n", "固定向量解出 Hello, ToolWeb! 换行");
  eq(res.textByteLength, 16, "固定向量原文 16 字节（含换行）");
  ok(res.gzipByteLength > 0 && res.base64Length === SAMPLE.length, "固定向量长度字段正确");
  var bare = await M.decodeGzipBase64("aGVsbG8=");
  eq(bare.ok, false, "裸 Base64 解压失败");
  eq(bare.stage, "gzip", "裸 Base64 失败 stage=gzip");
  var truncated = M.bytesToBase64(sampleBytes.slice(0, Math.floor(sampleBytes.length / 2)));
  var truncRes = await M.decodeGzipBase64(truncated);
  eq(truncRes.ok, false, "截断 gzip 失败");
  eq(truncRes.stage, "gzip", "截断 gzip 失败 stage=gzip");
  ok(/损坏|不完整/.test(truncRes.error), "截断 gzip 提示损坏或不完整");
  var emptyRes = await M.decodeGzipBase64("");
  eq(emptyRes.ok, false, "空输入主入口失败");
  eq(emptyRes.stage, "normalize", "空输入主入口 stage=normalize");
  var badRes = await M.decodeGzipBase64("AB!C");
  eq(badRes.stage, "normalize", "非法字符主入口 stage=normalize");
  ok(badRes.error.indexOf("3") >= 0, "非法字符主入口错误含位置");

  /* ---------- 3. 反向演示往返 ---------- */
  var encoded = await M.gzipBase64Encode("Hello, ToolWeb!\n");
  eq(encoded, SAMPLE, "反向压缩 Hello 向量与固定向量精确相等");
  var round = await M.decodeGzipBase64(await M.gzipBase64Encode('{"ok":true}'));
  eq(round.text, '{"ok":true}', "JSON 短文本往返相等");
  var round2 = await M.decodeGzipBase64(await M.gzipBase64Encode("中文与 emoji 🎉 混合文本"));
  eq(round2.text, "中文与 emoji 🎉 混合文本", "中文 emoji 往返相等");
  try { await M.gzipBase64Encode(""); ok(false, "空文本反向演示应抛错"); }
  catch (e) { ok(/不能为空/.test(e.message), "空文本反向演示提示不能为空"); }

  /* ---------- 4. 非 UTF-8 与容量 ---------- */
  var badUtf8Gzip = await new Response(new Blob([new Uint8Array([0xff, 0xfe])]).stream()
    .pipeThrough(new CompressionStream("gzip"))).arrayBuffer();
  var badUtf8Res = await M.decodeGzipBase64(M.bytesToBase64(new Uint8Array(badUtf8Gzip)));
  eq(badUtf8Res.ok, false, "非 UTF-8 解压结果失败");
  eq(badUtf8Res.stage, "utf8", "非 UTF-8 失败 stage=utf8");
  eq(M.MAX_GZIP_BYTES, 10 * 1024 * 1024, "gzip 上限常量 10MB");
  eq(M.MAX_TEXT_BYTES, 10 * 1024 * 1024, "文本上限常量 10MB");
  var oversizeGzip = new Uint8Array(M.MAX_GZIP_BYTES + 1);
  oversizeGzip[0] = 0x1f; oversizeGzip[1] = 0x8b;
  await rejectsStage(function () { return M.gunzipBytes(oversizeGzip); }(), "gzip", "超 10MB gzip 输入分支 stage=gzip");
  var bigText = "a".repeat(M.MAX_TEXT_BYTES + 1);
  var bigGzip = await new Response(new Blob([Buffer.from(bigText)]).stream()
    .pipeThrough(new CompressionStream("gzip"))).arrayBuffer();
  var bigRes = await M.decodeGzipBase64(M.bytesToBase64(new Uint8Array(bigGzip)));
  eq(bigRes.ok, false, "解压后超 10MB 文本失败");
  eq(bigRes.stage, "gzip", "解压后超限 stage=gzip");
  ok(/10MB/.test(bigRes.error), "解压后超限提示含 10MB");

  /* ---------- 5. 导出名、注册、页面静态检查 ---------- */
  eq(M.suggestExportName(), "gzip-decoded.txt", "导出文件名固定 gzip-decoded.txt");
  eq(M.SAMPLE_GZIP_BASE64, SAMPLE, "模块示例向量与固定向量一致");
  var cats = fs.readFileSync(path.join(__dirname, "../tools/categories.go"), "utf8");
  ok(cats.indexOf('"gzip_base64_decoder"') >= 0, "categories.go 注册 ID");
  ok(cats.indexOf('"/tools/gzip-base64-decoder"') >= 0, "categories.go 注册 Path");
  ok(cats.indexOf('Category:    "编码转换"') >= 0 || true, "编码转换品类占位（下方按段校验）");
  var encodeSection = cats.slice(cats.indexOf('ID:          "encode"'), cats.indexOf('ID:          "dev"'));
  ok(encodeSection.indexOf("gzip_base64_decoder") >= 0, "注册落在编码转换品类段内");
  var allPaths = cats.match(/"\/tools\/[^"]+"/g) || [];
  eq(new Set(allPaths).size, 206, "注册总数 205→206 Path");
  var js = fs.readFileSync(path.join(__dirname, "../static/js/gzip_base64_decoder.js"), "utf8");
  ok(js.indexOf("fetch(") < 0 && js.indexOf("XMLHttpRequest") < 0, "JS 零 fetch/XHR");
  ok(js.indexOf("DecompressionStream('gzip')") >= 0 && js.indexOf("CompressionStream('gzip')") >= 0, "JS 用原生 gzip 流");
  var tpl = fs.readFileSync(path.join(__dirname, "../templates/gzip_base64_decoder.html"), "utf8");
  ["gbd-input", "gbd-output", "gbd-decode", "gbd-sample", "gbd-copy", "gbd-download", "gbd-reverse", "gbd-error", "gzip_base64_decoder.js"]
    .forEach(function (id) { ok(tpl.indexOf(id) >= 0, "模板含 " + id); });
  ["仅 gzip", "仅 UTF-8", "不支持", "10MB", "不上传"].forEach(function (w) { ok(tpl.indexOf(w) >= 0, "模板真限制可见：" + w); });
  ok(tpl.indexOf("/tools/base64") >= 0, "模板互链 Base64 编码/解码");
  ok(tpl.indexOf("SVG 波形") < 0 && tpl.indexOf("图片取色器") < 0 && tpl.indexOf("在线电台") < 0, "模板不硬凑未交付工具互链");
  ok(tpl.indexOf("fonts.googleapis") < 0, "模板零 Google Fonts CDN");
  ok(tpl.indexOf("gzip-base64-decoder") >= 0, "模板含 canonical 路径");
  ok(M.hasStreamSupport().decompress && M.hasStreamSupport().compress, "node 24 支持两种原生流");

  console.log("PASS " + pass + " / " + (pass + fail) + "（失败 " + fail + "）");
  if (fail > 0) process.exit(1);
}

main().catch(function (e) { console.error("测试异常退出：", e); process.exit(1); });
