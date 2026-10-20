/* 图片批量缩放器纯逻辑单元测试（零依赖）：node tests/bulk_image_resizer.test.js
 * 覆盖：
 *  1. 四预设等比尺寸计算（按宽度/按高度/百分比/最长边）+ 已知尺寸复核
 *  2. 非法输入返回 null（零/负/NaN/未知模式/百分比超界）
 *  3. 大图保护钳制（8192px 双轴钳制、因子逻辑）
 *  4. 输出文件名命名规则（原名_宽x高.扩展名、keep 取原扩展名、无扩展名推导、去重）
 *  5. 格式规则（透明判定、垫白底判定、扩展名映射、mime 校验、质量映射）
 */
"use strict";
var B = require("../static/js/bulk_image_resizer.js");

var pass = 0, fail = 0;
function ok(cond, name) {
    if (cond) { pass++; }
    else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + ")"); }
function eqSize(r, w, h, name) {
    ok(r && r.w === w && r.h === h, name + "（期望 " + w + "x" + h + "，实得 " + (r ? r.w + "x" + r.h : "null") + ")");
}

/* ---------- 1. 四预设等比计算 ---------- */
/* 1920x1080 (16:9) */
eqSize(B.birTargetSize(1920, 1080, 'width', 960), 960, 540, "按宽度 1920x1080→960宽");
eqSize(B.birTargetSize(1920, 1080, 'height', 540), 960, 540, "按高度 1920x1080→540高");
eqSize(B.birTargetSize(1920, 1080, 'percent', 50), 960, 540, "百分比50 1920x1080");
eqSize(B.birTargetSize(1920, 1080, 'max', 960), 960, 540, "最长边960 1920x1080");
/* 竖图 1080x1920 */
eqSize(B.birTargetSize(1080, 1920, 'width', 540), 540, 960, "按宽度 1080x1920→540宽");
eqSize(B.birTargetSize(1080, 1920, 'max', 960), 540, 960, "最长边960 1080x1920");
/* 方图 */
eqSize(B.birTargetSize(1000, 1000, 'percent', 25), 250, 250, "百分比25 方图");
eqSize(B.birTargetSize(1000, 1000, 'max', 400), 400, 400, "最长边400 方图");
/* 小数四舍五入：800x600 按宽度 500 → 500x375 */
eqSize(B.birTargetSize(800, 600, 'width', 500), 500, 375, "按宽度 800x600→500宽 四舍五入");
/* 非整除比：1000x700 按高度 300 → 429x300 */
eqSize(B.birTargetSize(1000, 700, 'height', 300), 429, 300, "按高度 1000x700→300高 四舍五入");
/* 放大：百分比 200 */
eqSize(B.birTargetSize(800, 600, 'percent', 200), 1600, 1200, "百分比200 放大");
/* 字符串数值输入 */
eqSize(B.birTargetSize(800, 600, 'width', '400'), 400, 300, "字符串数值输入");
/* 最长边不放大不缩小：短边为长边时 */
eqSize(B.birTargetSize(600, 800, 'max', 1200), 900, 1200, "最长边1200 600x800 放大");

/* ---------- 2. 非法输入 ---------- */
eq(B.birTargetSize(0, 600, 'width', 500), null, "原图宽0 → null");
eq(B.birTargetSize(800, 0, 'width', 500), null, "原图高0 → null");
eq(B.birTargetSize(-800, 600, 'width', 500), null, "原图宽负数 → null");
eq(B.birTargetSize(800, 600, 'width', 0), null, "数值0 → null");
eq(B.birTargetSize(800, 600, 'width', -10), null, "数值负数 → null");
eq(B.birTargetSize(800, 600, 'width', NaN), null, "数值NaN → null");
eq(B.birTargetSize(800, 600, 'width', ''), null, "数值空串 → null");
eq(B.birTargetSize(800, 600, 'bogus', 500), null, "未知模式 → null");
eq(B.birTargetSize(800, 600, 'percent', 0), null, "百分比0 → null");
eq(B.birTargetSize(800, 600, 'percent', 1001), null, "百分比1001 超界 → null");
eq(B.birTargetSize(800, 600, 'percent', -5), null, "百分比负数 → null");
eq(B.birTargetSize(800, 600, 'max', 0), null, "最长边0 → null");
eqSize(B.birTargetSize(800, 600, 'width', 1), 1, 1, "宽度1 → 最小1x1");

/* ---------- 3. 大图保护 ---------- */
/* 16000x9000 最长边16000：钳制到 8192x4608 */
eqSize(B.birTargetSize(16000, 9000, 'max', 16000), 8192, 4608, "16000x9000 钳制到8192");
/* 百分比放大超限同样钳制 */
eqSize(B.birTargetSize(4000, 3000, 'percent', 500), 8192, 6144, "百分比放大超限钳制");
/* 未超限不钳制 */
eqSize(B.birTargetSize(4000, 3000, 'percent', 100), 4000, 3000, "未超限不钳制");
/* 自定义上限 */
eqSize(B.birTargetSize(2000, 1000, 'percent', 100, 1024), 1024, 512, "自定义上限1024");
/* 钳制因子 */
eq(B.birClampFactor(16000, 9000, 8192), 8192 / 16000, "钳制因子 16000→8192");
eq(B.birClampFactor(1000, 800, 8192), 1, "未超限因子1");
eq(B.birClampFactor(0, 0, 8192), null, "因子非法输入 → null");

/* ---------- 4. 输出文件名 ---------- */
eq(B.birOutName("photo.png", 960, 540, "image/png", "keep"), "photo_960x540.png", "keep 取原扩展名 png");
eq(B.birOutName("IMG_001.JPG", 800, 600, "image/jpeg", "keep"), "IMG_001_800x600.JPG", "keep 保留原扩展名大小写");
eq(B.birOutName("photo.png", 960, 540, "image/png", "jpeg"), "photo_960x540.jpg", "输出 jpeg → .jpg");
eq(B.birOutName("photo.jpg", 960, 540, "image/jpeg", "webp"), "photo_960x540.webp", "输出 webp → .webp");
eq(B.birOutName("photo", 960, 540, "image/png", "keep"), "photo_960x540.png", "无扩展名按 mime 推导");
eq(B.birOutName("my.photo.v2.png", 100, 100, "image/png", "keep"), "my.photo.v2_100x100.png", "多点文件名取最后扩展名");
eq(B.birOutName(".png", 100, 100, "image/png", "keep"), "image_100x100.png", "空主名回退 image");
/* 同名去重 */
eq(B.birUniqueName("a_100x100.jpg", []), "a_100x100.jpg", "无冲突直接用");
eq(B.birUniqueName("a_100x100.jpg", ["a_100x100.jpg"]), "a_100x100-2.jpg", "冲突追加-2");
eq(B.birUniqueName("a_100x100.jpg", ["a_100x100.jpg", "a_100x100-2.jpg"]), "a_100x100-3.jpg", "连冲追加-3");

/* ---------- 5. 格式规则 ---------- */
ok(B.birHasAlpha("image/png"), "PNG 有透明通道");
ok(B.birHasAlpha("image/webp"), "WebP 有透明通道");
ok(!B.birHasAlpha("image/jpeg"), "JPEG 无透明通道");
ok(B.birNeedWhiteBg("image/png", "jpeg"), "PNG转JPEG 需垫白底");
ok(B.birNeedWhiteBg("image/webp", "jpeg"), "WebP转JPEG 需垫白底");
ok(!B.birNeedWhiteBg("image/jpeg", "jpeg"), "JPEG转JPEG 不垫");
ok(!B.birNeedWhiteBg("image/png", "webp"), "PNG转WebP 不垫（保留透明）");
ok(!B.birNeedWhiteBg("image/png", "keep"), "keep 不垫");
eq(B.birOutExt("jpeg"), ".jpg", "jpeg→.jpg");
eq(B.birOutExt("webp"), ".webp", "webp→.webp");
eq(B.birOutExt("png"), ".png", "png→.png");
eq(B.birOutExt("bogus"), null, "未知格式→null");
ok(B.birAcceptableType("image/png") && B.birAcceptableType("image/jpeg") && B.birAcceptableType("image/webp"), "三种输入类型合法");
ok(!B.birAcceptableType("image/gif"), "GIF 不在输入类型");
ok(!B.birAcceptableType("text/plain"), "文本类型非法");
eq(B.birQualityToAlpha(92), 0.92, "质量92→0.92");
eq(B.birQualityToAlpha(1), 0.01, "质量1→0.01");
eq(B.birQualityToAlpha(100), 1, "质量100→1");
eq(B.birQualityToAlpha(0), 0.01, "质量0 钳制1");
eq(B.birQualityToAlpha(200), 1, "质量200 钳制100");
eq(B.birQualityToAlpha("abc"), 0.92, "质量非法回退0.92");

console.log("\n通过 " + pass + "，失败 " + fail);
process.exit(fail ? 1 : 0);
