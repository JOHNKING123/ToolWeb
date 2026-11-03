/* Docker Compose → K8s YAML 转换器纯逻辑单元测试（零依赖）：node tests/compose_to_k8s.test.js
 * 覆盖：
 *  1. parseCompose 确定性向量（服务名/image/端口 published-target 映射）＋非法参数 err.field
 *  2. buildDeployment 逐字确定性（键顺序锁定、2 空格缩进、replicas/selector）＋缺 image 抛错
 *  3. buildService 逐字确定性（NodePort 有 nodePort／无 published → ClusterIP）
 *  4. composeToK8s 聚合（results/warnings/errors）与 buildK8sMerged --- 分隔
 *  5. buildK8sDownloadName 文件名格式
 *  6. categories.go 注册（ID/Path/Icon/Category/New）与 Path 总数 263→264
 *  7. 零网络静态检查（无 fetch/XHR/CDN script）
 *  8. 模板：SEO 面板／真限制三条／互链（docker_run_to_compose 双向、json-yaml-converter 单向出链）
 */
"use strict";
var fs = require("fs");
var path = require("path");
var C = require("../static/js/compose_to_k8s.js");
var ROOT = path.join(__dirname, "..");

var pass = 0, fail = 0;
function ok(cond, name) {
    if (cond) { pass++; }
    else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function deepEq(a, b, name) { eq(JSON.stringify(a), JSON.stringify(b), name); }
function contains(s, sub, name) { ok(String(s).indexOf(sub) !== -1, name + "（期望包含 " + JSON.stringify(sub) + "）"); }
function notContains(s, sub, name) { ok(String(s).indexOf(sub) === -1, name + "（期望不含 " + JSON.stringify(sub) + "）"); }

/* ---------- 1. parseCompose 确定性向量 ---------- */

(function () {
    var p = C.parseCompose("services:\n  web:\n    image: nginx:alpine\n    ports:\n      - \"8080:80\"");
    eq(p.services.length, 1, "单服务解析出 1 个服务");
    eq(p.services[0].name, "web", "服务名 web");
    eq(p.services[0].image, "nginx:alpine", "镜像 nginx:alpine");
    eq(p.services[0].ports.length, 1, "端口 1 条");
    eq(p.services[0].ports[0].published, "8080", "端口 published=8080");
    eq(p.services[0].ports[0].target, "80", "端口 target=80");
    eq(p.warnings.length, 0, "基础用例无 warnings");
    eq(p.errors.length, 0, "基础用例无 errors");
})();

(function () {
    var p = C.parseCompose("services:\n  api:\n    image: myorg/api:1.0\n    ports:\n      - \"80\"\n      - \"53:53/udp\"\n    environment:\n      NODE_ENV: production\n      EMPTY:\n    depends_on:\n      - db");
    var s = p.services[0];
    eq(s.ports[0].published, null, "裸端口 published 为 null");
    eq(s.ports[0].target, "80", "裸端口 target=80");
    eq(s.ports[1].protocol, "UDP", "/udp 后缀协议为 UDP");
    eq(s.environment.NODE_ENV, "production", "environment 映射形态");
    eq(s.environment.EMPTY, "", "environment 空值转空字符串");
    deepEq(s.depends_on, ["db"], "depends_on 列表提取");
    ok(p.warnings.some(function (w) { return w.indexOf("depends_on") !== -1; }), "depends_on 进 warnings");
    eq(p.errors.length, 0, "无 errors");
})();

(function () {
    var p = C.parseCompose("services:\n  web:\n    image: nginx\n    volumes:\n      - ./data:/app/data\n    build: .\n    networks:\n      - front\nversion: \"3\"");
    eq(p.services[0].volumes.length, 1, "挂载 1 条");
    eq(p.services[0].volumes[0].source, "./data", "挂载 source");
    eq(p.services[0].volumes[0].target, "/app/data", "挂载 target");
    ok(p.warnings.some(function (w) { return w.indexOf("build") !== -1; }), "超子集字段 build 进 warnings");
    ok(p.warnings.some(function (w) { return w.indexOf("networks") !== -1; }), "超子集字段 networks 进 warnings");
    ok(p.warnings.some(function (w) { return w.indexOf("hostPath") !== -1 && w.indexOf("PVC") !== -1; }), "挂载 hostPath 原样＋PVC 提示");
    ok(p.warnings.some(function (w) { return w.indexOf("version") !== -1; }), "顶层 version 进 warnings");
    eq(p.errors.length, 0, "超子集字段不报错");
})();

(function () {
    var p = C.parseCompose("services:\n  web:\n    ports:\n      - \"8080:80\"");
    eq(p.services[0].image, null, "缺 image 时 image 为 null");
    ok(p.errors.some(function (e) { return e.indexOf("image") !== -1; }), "缺 image 进 errors 数组");
})();

(function () {
    var p = C.parseCompose("version: \"3\"\nnetworks:\n  front: {}");
    ok(p.errors.some(function (e) { return e.indexOf("services") !== -1; }), "无 services 段进 errors");
    eq(p.services.length, 0, "无 services 时 services 为空数组");
})();

(function () {
    try { C.parseCompose(""); ok(false, "空字符串应抛错"); }
    catch (e) { eq(e.field, "text", "parseCompose(\"\") 抛错且 err.field=text"); }
    try { C.parseCompose("   \n  "); ok(false, "空白字符串应抛错"); }
    catch (e) { eq(e.field, "text", "空白字符串 err.field=text"); }
    try { C.parseCompose(null); ok(false, "null 应抛错"); }
    catch (e) { eq(e.field, "text", "parseCompose(null) err.field=text"); }
    try { C.parseCompose(123); ok(false, "数字应抛错"); }
    catch (e) { eq(e.field, "text", "parseCompose(123) err.field=text"); }
})();

/* ---------- 2. buildDeployment 逐字确定性 ---------- */

var FIXTURE = {
    name: "web", image: "nginx:alpine",
    ports: [{ published: "8080", target: "80", protocol: "TCP" }],
    volumes: [{ raw: "./data:/app/data", source: "./data", target: "/app/data", readOnly: false }],
    environment: { NODE_ENV: "production" },
    depends_on: []
};

var EXPECT_DEPLOYMENT = [
    "apiVersion: apps/v1",
    "kind: Deployment",
    "metadata:",
    "  name: web",
    "  labels:",
    "    app: web",
    "spec:",
    "  replicas: 1",
    "  selector:",
    "    matchLabels:",
    "      app: web",
    "  template:",
    "    metadata:",
    "      labels:",
    "        app: web",
    "    spec:",
    "      containers:",
    "        - name: web",
    "          image: nginx:alpine",
    "          ports:",
    "            - containerPort: 80",
    "          env:",
    "            - name: NODE_ENV",
    '              value: "production"',
    "          volumeMounts:",
    "            - name: web-vol-0",
    "              mountPath: /app/data",
    "      volumes:",
    "        - name: web-vol-0",
    "          hostPath:",
    "            path: ./data",
    ""
].join("\n");

(function () {
    eq(C.buildDeployment(FIXTURE), EXPECT_DEPLOYMENT, "buildDeployment 逐字确定性");
})();

(function () {
    var out = C.buildDeployment({ name: "solo", image: "busybox" });
    contains(out, "replicas: 1", "最小服务含 replicas: 1");
    contains(out, "matchLabels:\n      app: solo", "selector.matchLabels.app=solo");
    notContains(out, "ports:", "无端口时不输出 ports 段");
    notContains(out, "env:", "无环境变量时不输出 env 段");
    notContains(out, "volumeMounts:", "无挂载时不输出 volumeMounts 段");
})();

(function () {
    try { C.buildDeployment({ name: "web" }); ok(false, "缺 image 应抛错"); }
    catch (e) { eq(e.field, "image", "buildDeployment 缺 image 抛错且 err.field=image"); }
    try { C.buildDeployment({ name: "web", image: "  " }); ok(false, "空白 image 应抛错"); }
    catch (e) { eq(e.field, "image", "空白 image err.field=image"); }
    try { C.buildDeployment(null); ok(false, "null service 应抛错"); }
    catch (e) { ok(e.field === "service" || e.field === "image", "null service 抛错带 field"); }
})();

/* ---------- 3. buildService 逐字确定性 ---------- */

var EXPECT_SERVICE = [
    "apiVersion: v1",
    "kind: Service",
    "metadata:",
    "  name: web",
    "  labels:",
    "    app: web",
    "spec:",
    "  type: NodePort",
    "  selector:",
    "    app: web",
    "  ports:",
    "    - port: 80",
    "      targetPort: 80",
    "      nodePort: 8080",
    "      protocol: TCP",
    ""
].join("\n");

(function () {
    eq(C.buildService(FIXTURE), EXPECT_SERVICE, "buildService(NodePort) 逐字确定性");
})();

(function () {
    var out = C.buildService({
        name: "api", image: "myorg/api:1.0",
        ports: [{ published: null, target: "3000", protocol: "TCP" }],
        volumes: [], environment: {}, depends_on: []
    });
    contains(out, "type: ClusterIP", "无 published 端口 → ClusterIP");
    contains(out, "    - port: 3000", "ClusterIP 端口 port");
    contains(out, "      targetPort: 3000", "ClusterIP 端口 targetPort");
    notContains(out, "nodePort:", "ClusterIP 无 nodePort");
})();

/* ---------- 4. composeToK8s 聚合 ---------- */

(function () {
    var r = C.composeToK8s("services:\n  web:\n    image: nginx:alpine\n    ports:\n      - \"8080:80\"");
    eq(r.results.length, 1, "composeToK8s 1 个结果");
    eq(r.results[0].name, "web", "结果 name=web");
    contains(r.results[0].deployment, "kind: Deployment", "结果含 Deployment");
    contains(r.results[0].service, "kind: Service", "结果含 Service");
    eq(r.errors.length, 0, "聚合无 errors");
})();

(function () {
    var r = C.composeToK8s("services:\n  web:\n    ports:\n      - \"8080:80\"\n  ok:\n    image: busybox");
    eq(r.results.length, 1, "缺 image 的服务被跳过，只剩 1 个结果");
    ok(r.errors.some(function (e) { return e.indexOf("web") !== -1; }), "跳过的服务错误进聚合 errors");
})();

(function () {
    var r = C.composeToK8s("services:\n  a:\n    image: img-a\n  b:\n    image: img-b");
    var merged = C.buildK8sMerged(r.results);
    contains(merged, "kind: Deployment", "合并含 Deployment");
    contains(merged, "kind: Service", "合并含 Service");
    eq(merged.split("\n---\n").length, 4, "2 服务 × 2 份 = 4 段，以 --- 分隔");
})();

/* ---------- 5. buildK8sDownloadName ---------- */

(function () {
    var n = C.buildK8sDownloadName("web");
    ok(/^k8s_web_\d{8}_\d{6}\.yaml$/.test(n), "文件名匹配 k8s_web_YYYYMMDD_HHmmss.yaml（实得 " + n + "）");
    var n2 = C.buildK8sDownloadName("My App!");
    ok(/^k8s_my-app_\d{8}_\d{6}\.yaml$/.test(n2), "文件名清洗服务名（实得 " + n2 + "）");
    var fixed = new Date(2026, 10, 1, 21, 5, 9);
    eq(C.buildK8sDownloadName("web", fixed), "k8s_web_20261101_210509.yaml", "固定时间确定性");
})();

/* ---------- 6. categories.go 注册 ---------- */

(function () {
    var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");
    contains(GO_SRC, 'ID:          "compose_to_k8s"', "注册 ID 为 compose_to_k8s");
    contains(GO_SRC, 'Path:        "/tools/compose-to-k8s"', "注册 Path 为 /tools/compose-to-k8s");
    contains(GO_SRC, 'Icon:        "settings_applications"', "注册 Icon 为 settings_applications");
    eq((GO_SRC.match(/"settings_applications"/g) || []).length, 1, "settings_applications 全库仅本工具使用（0 占用→1）");
    var m = GO_SRC.match(/ID:\s*"compose_to_k8s"[\s\S]{0,2000}?Category:\s*"([^"]+)"/);
    eq(m ? m[1] : "", "开发工具", "注册 Category 为 开发工具");
    contains(GO_SRC, 'Name:        "Docker Compose→K8s YAML 转换器"', "注册 Name");
    ok(/ID:\s*"compose_to_k8s"[\s\S]{0,2000}?New:\s*true/.test(GO_SRC), "注册 New: true");
    contains(GO_SRC.toLowerCase(), "compose", "Description 中英文双语（含英文）");
    var pathRe = /"\/tools\/[^"]+"/g, seen = {}, mm, pathCount = 0;
    while ((mm = pathRe.exec(GO_SRC)) !== null) { if (!seen[mm[0]]) { seen[mm[0]] = true; pathCount++; } }
    eq(pathCount, 287, "注册 Path 总数 268→270");
})();

/* ---------- 7. 零网络静态检查 ---------- */

(function () {
    var src = fs.readFileSync(path.join(ROOT, "static", "js", "compose_to_k8s.js"), "utf8");
    ["fetch(", "XMLHttpRequest", "WebSocket(", "EventSource("].forEach(function (kw) {
        notContains(src, kw, "JS 内无 " + kw);
    });
    ["parseCompose", "buildDeployment", "buildService", "composeToK8s", "buildK8sDownloadName", "buildK8sMerged"].forEach(function (fn) {
        contains(src, fn, "纯函数 " + fn);
    });
    contains(src, "navigator.clipboard", "复制优先走 navigator.clipboard");
    contains(src, "execCommand", "复制降级走 execCommand");
    contains(src, "Blob", "下载走 Blob");
    contains(src, "module.exports", "Node 自测暴露纯函数");
    var tpl = fs.readFileSync(path.join(ROOT, "templates", "compose_to_k8s.html"), "utf8");
    notContains(tpl, "fetch(", "模板内无 fetch");
    notContains(tpl, "<script src=\"http", "模板无外部 script CDN");
})();

/* ---------- 8. 模板：SEO／真限制／互链 ---------- */

(function () {
    var tpl = fs.readFileSync(path.join(ROOT, "templates", "compose_to_k8s.html"), "utf8");
    /* SEO 面板 */
    contains(tpl, "<title>Docker Compose→K8s YAML 转换器", "SEO：title");
    contains(tpl, 'name="description"', "SEO：description");
    contains(tpl, 'name="keywords"', "SEO：keywords");
    contains(tpl, 'rel="canonical"', "SEO：canonical");
    contains(tpl, 'property="og:title"', "SEO：OG title");
    contains(tpl, "application/ld+json", "SEO：JSON-LD");
    contains(tpl, "https://www.johnkingzcq123.xyz/tools/compose-to-k8s", "SEO：canonical/OG URL 为新 Path");
    contains(tpl, ">settings_applications<", "标题图标 settings_applications");
    /* 真限制三条（页面明示） */
    contains(tpl, "仅映射常用字段子集", "真限制①：仅映射常用字段子集");
    contains(tpl, "networks/build/secrets/configs/healthcheck/deploy", "真限制①：复杂特性不保证 1:1");
    contains(tpl, "baseline", "真限制②：baseline YAML");
    contains(tpl, "生产使用前请按集群实际调整", "真限制②：按集群调整");
    contains(tpl, "100% 浏览器本地处理", "真限制③：纯本地零上传");
    /* 互链（docker_run_to_compose 双向、json-yaml-converter 单向出链） */
    contains(tpl, "/tools/docker-run-to-compose", "与 docker_run_to_compose 互链");
    contains(tpl, "/tools/json-yaml-converter", "与 json-yaml-converter 单向出链");
    contains(tpl, "容器编排一条龙", "互链文案：容器编排一条龙");
    contains(tpl, "Docker Compose→K8s YAML 转换器（当前）", "相关工具含当前态标记");
    /* 输入输出控件 */
    contains(tpl, 'id="k8s-input"', "compose 粘贴输入框");
    contains(tpl, 'id="k8s-convert"', "转换按钮");
    contains(tpl, 'id="k8s-reset"', "重置按钮");
    contains(tpl, 'id="k8s-diag"', "诊断信息区");
    contains(tpl, 'id="k8s-services"', "服务选择区");
    contains(tpl, 'id="k8s-tab-deployment"', "Deployment 标签页");
    contains(tpl, 'id="k8s-tab-service"', "Service 标签页");
    contains(tpl, 'id="k8s-deployment-code"', "Deployment 预览区");
    contains(tpl, 'id="k8s-service-code"', "Service 预览区");
    contains(tpl, 'id="k8s-copy"', "一键复制按钮");
    contains(tpl, 'id="k8s-download"', "逐份下载按钮");
    contains(tpl, 'id="k8s-download-merge"', "合并下载按钮");
    /* 回链（双向互链另一半） */
    var drcTpl = fs.readFileSync(path.join(ROOT, "templates", "docker_run_to_compose.html"), "utf8");
    contains(drcTpl, "/tools/compose-to-k8s", "docker_run_to_compose 模板含回链（双向互链）");
})();

console.log("\n断言通过: " + pass + ", 失败: " + fail + ", 共 " + (pass + fail));
process.exit(fail === 0 ? 0 : 1);
