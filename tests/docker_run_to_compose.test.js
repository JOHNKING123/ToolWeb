/* Docker run → Compose 转换器纯逻辑单元测试（零依赖）：node tests/docker_run_to_compose.test.js
 * 覆盖：
 *  1. shell 词法切分（单双引号、转义、行尾续行、未闭合引号）
 *  2. 旗标映射（--name、-p/--publish、-v/--volume、-e/--env、--restart、--network/--net、
 *     -i/-t、--entrypoint、-w/--workdir、--user、--hostname、--expose、--label）
 *  3. 组合短旗标（-it、-dp）、= 形态、IP 端口、/udp 后缀、:ro 挂载
 *  4. 服务名推导（--name 优先、镜像 basename 清洗、container_name 保留原值）
 *  5. 启动命令、重复项按序保留、诊断列表（不支持/已忽略/$ 转 $$）、YAML 引号与无 version
 *  6. 非法输入（空输入、非 docker run、缺镜像、未闭合引号）不输出畸形 YAML
 *  7. 示例静态检查（4 组示例均可解析成功且 YAML 非空）
 */
"use strict";
var D = require("../static/js/docker_run_to_compose.js");

var pass = 0, fail = 0;
function ok(cond, name) {
    if (cond) { pass++; }
    else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function contains(s, sub, name) { ok(String(s).indexOf(sub) !== -1, name + "（期望包含 " + JSON.stringify(sub) + "，实得 " + JSON.stringify(s).slice(0, 300) + "）"); }
function notContains(s, sub, name) { ok(String(s).indexOf(sub) === -1, name + "（期望不含 " + JSON.stringify(sub) + "，实得 " + JSON.stringify(s).slice(0, 300) + "）"); }

/* ---------- 1. 词法切分 ---------- */

(function () {
    var t = D.tokenize("docker run -e 'MSG=hello world' \"a'b\" end");
    eq(t.tokens[3], "MSG=hello world", "单引号内空格保留为一个 token");
    eq(t.tokens[4], "a'b", "双引号内单引号原样保留");
    eq(t.errors.length, 0, "引号嵌套无错误");
})();

(function () {
    var t = D.tokenize("docker run nginx \\\n  -p 8080:80 \\\n  -d");
    eq(t.tokens.length, 6, "续行折叠后 token 数");
    eq(t.tokens[4], "8080:80", "续行后端口 token 正确");
})();

(function () {
    var t = D.tokenize('docker run -e "MSG=a\\"b" nginx');
    eq(t.tokens[3], 'MSG=a"b', "双引号内转义双引号");
})();

(function () {
    var t = D.tokenize("docker run -e 'MSG=abc nginx");
    ok(t.errors.length > 0, "单引号未闭合报错");
})();

(function () {
    var t = D.tokenize("docker run -p 8080\\:80 nginx");
    eq(t.tokens[3], "8080:80", "裸词反斜杠转义冒号");
})();

/* ---------- 2. nginx 简单用例 ---------- */

(function () {
    var r = D.parseRun("docker run -d --name web -p 8080:80 nginx:1.25");
    eq(r.errors.length, 0, "nginx 用例无错误");
    eq(r.service, "web", "--name 优先为服务名");
    eq(r.containerName, "web", "container_name 保留 --name 原值");
    eq(r.image, "nginx:1.25", "镜像解析");
    eq(r.ports.length, 1, "端口 1 条");
    eq(r.ports[0], "8080:80", "端口值");
    eq(r.command, null, "无启动命令时 command 为空");
    contains(r.yaml, "services:", "YAML 有 services 段");
    contains(r.yaml, "image: nginx:1.25", "YAML 镜像行");
    contains(r.yaml, '- "8080:80"', "YAML 端口加引号");
    notContains(r.yaml, "version:", "YAML 不含 version 字段");
    ok(r.diagnostics.some(function (d) { return d.kind === "ignored" && d.flag === "-d"; }), "-d 记为已忽略而非报错");
})();

/* ---------- 3. postgres 复合用例 ---------- */

(function () {
    var r = D.parseRun("docker run -d --name db -e POSTGRES_PASSWORD=s3cret -e POSTGRES_DB=myapp -v pgdata:/var/lib/postgresql/data -p 5432:5432 --restart unless-stopped postgres:16");
    eq(r.service, "db", "postgres 服务名");
    eq(r.environment.length, 2, "环境变量 2 条");
    eq(r.environment[0], "POSTGRES_PASSWORD=s3cret", "环境变量 1");
    eq(r.volumes[0], "pgdata:/var/lib/postgresql/data", "命名卷挂载");
    eq(r.restart, "unless-stopped", "重启策略 unless-stopped");
    contains(r.yaml, "restart: unless-stopped", "YAML 重启行");
    contains(r.yaml, '- "pgdata:/var/lib/postgresql/data"', "YAML 挂载加引号");
    contains(r.yaml, '- "POSTGRES_PASSWORD=s3cret"', "YAML 环境变量加引号");
})();

/* ---------- 4. 组合短旗标与 = 形态 ---------- */

(function () {
    var r = D.parseRun("docker run -it --name worker -w /app myapp:latest node server.js");
    eq(r.stdinOpen, true, "-it 拆出 stdin_open");
    eq(r.tty, true, "-it 拆出 tty");
    eq(r.workingDir, "/app", "-w 工作目录");
    eq(r.command, "node server.js", "镜像后剩余 token 为启动命令");
    contains(r.yaml, "stdin_open: true", "YAML stdin_open");
    contains(r.yaml, "tty: true", "YAML tty");
    contains(r.yaml, 'working_dir: "/app"', "YAML working_dir（以 / 开头故加引号）");
    contains(r.yaml, 'command: "node server.js"', "YAML command（含空格故加引号）");
})();

(function () {
    var r = D.parseRun("docker run -dp 8080:80 nginx");
    eq(r.ports[0], "8080:80", "-dp 组合中 -d 忽略、-p 取值");
    ok(r.diagnostics.some(function (d) { return d.kind === "ignored"; }), "-dp 中的 -d 记已忽略");
})();

(function () {
    var r = D.parseRun("docker run --name=web -p=8080:80 nginx");
    eq(r.service, "web", "--name= 形态服务名");
    eq(r.ports[0], "8080:80", "-p= 形态端口");
})();

(function () {
    var r = D.parseRun("docker run -p 127.0.0.1:8080:80 -p 53:53/udp nginx");
    eq(r.ports[0], "127.0.0.1:8080:80", "IP 限定端口");
    eq(r.ports[1], "53:53/udp", "/udp 后缀端口");
    eq(r.ports.length, 2, "重复端口按序保留不去重");
})();

(function () {
    var r = D.parseRun("docker run -v /data:/app:ro -v /data:/app:rw nginx");
    eq(r.volumes[0], "/data:/app:ro", "只读挂载 :ro");
    eq(r.volumes[1], "/data:/app:rw", "重复挂载按序保留");
})();

/* ---------- 5. 服务名推导与清洗 ---------- */

(function () {
    var r = D.parseRun("docker run registry.example.com/team/my_app:2.0");
    eq(r.service, "my-app", "镜像 basename 去仓库前缀与 tag 后清洗为 my-app");
    eq(r.containerName, null, "无 --name 时无 container_name");
    notContains(r.yaml, "container_name:", "无 --name 时 YAML 不输出 container_name");
})();

(function () {
    var r = D.parseRun("docker run --name My_App nginx");
    eq(r.service, "my-app", "--name 清洗后为服务名");
    eq(r.containerName, "My_App", "--name 原值保留为 container_name");
    contains(r.yaml, "container_name: My_App", "YAML container_name 原值");
})();

(function () {
    var r = D.parseRun("docker run nginx@sha256:abcdef1234567890");
    eq(r.service, "nginx", "@digest 镜像 basename 为 nginx");
})();

(function () {
    var r = D.parseRun("sudo docker run -p 80:80 nginx");
    eq(r.image, "nginx", "sudo 前缀可接受");
    eq(r.errors.length, 0, "sudo 前缀无错误");
})();

/* ---------- 6. 其余旗标子集 ---------- */

(function () {
    var r = D.parseRun("docker run --network mynet --hostname web01 --user 1000:1000 --entrypoint /bin/sh --expose 8080 --expose 9090 --label app=web --label tier=front nginx -g 'daemon off;'");
    eq(r.networks[0], "mynet", "--network 进 networks 列表");
    eq(r.hostname, "web01", "--hostname");
    eq(r.user, "1000:1000", "--user");
    eq(r.entrypoint, "/bin/sh", "--entrypoint");
    eq(r.expose.length, 2, "--expose 2 条");
    eq(r.labels.length, 2, "--label 2 条单值");
    eq(r.command, "-g 'daemon off;'", "启动命令含空格 token 单引号还原");
    contains(r.yaml, "networks:", "YAML networks 段");
    contains(r.yaml, '- "8080"', "YAML expose 加引号");
    contains(r.yaml, '- "app=web"', "YAML labels 加引号");
})();

(function () {
    var r = D.parseRun("docker run --net host nginx");
    eq(r.networkMode, "host", "--net host 输出 network_mode");
    eq(r.networks.length, 0, "host 不进 networks 列表");
    contains(r.yaml, "network_mode: host", "YAML network_mode");
    ok(r.diagnostics.some(function (d) { return d.kind === "warning"; }), "host 网络有语义提示诊断");
})();

(function () {
    var r = D.parseRun("docker run --net none nginx");
    eq(r.networkMode, "none", "--net none 输出 network_mode");
})();

(function () {
    var r = D.parseRun("docker run --restart on-failure:3 nginx");
    eq(r.restart, "on-failure:3", "重启策略 on-failure:3 原样");
})();

/* ---------- 7. 诊断不丢项 ---------- */

(function () {
    var r = D.parseRun("docker run --privileged --cap-add SYS_ADMIN --device /dev/kvm --dns 8.8.8.8 --add-host host1:1.2.3.4 --health-cmd 'curl -f http://localhost' --link db nginx");
    var uns = r.diagnostics.filter(function (d) { return d.kind === "unsupported"; });
    eq(uns.length, 7, "7 项特殊旗标逐项进诊断");
    eq(r.image, "nginx", "不支持旗标参数消费后镜像仍正确");
    notContains(r.yaml, "privileged", "YAML 不编造 privileged 字段");
})();

(function () {
    var r = D.parseRun("docker run --rm -d nginx");
    eq(r.diagnostics.filter(function (d) { return d.kind === "ignored"; }).length, 2, "--rm 与 -d 均记已忽略");
    eq(r.errors.length, 0, "已忽略旗标不报错");
})();

(function () {
    var r = D.parseRun("docker run -e 'PRICE=$5' -e BARE nginx");
    contains(r.yaml, '- "PRICE=$$5"', "环境变量值含 $ 时转 $$");
    ok(r.diagnostics.some(function (d) { return d.message.indexOf("$$") !== -1; }), "$ 转 $$ 有提示诊断");
    ok(r.diagnostics.some(function (d) { return d.message.indexOf("BARE") !== -1; }), "裸 KEY 环境变量进诊断");
    contains(r.yaml, '- "BARE"', "裸 KEY 保留为 BARE 不编造值");
})();

(function () {
    var r = D.parseRun("docker run --label barelabel nginx");
    eq(r.labels.length, 0, "非 KEY=VAL 的 label 不进 labels");
    ok(r.diagnostics.length > 0, "非 KEY=VAL 的 label 进诊断");
})();

/* ---------- 8. 非法输入 ---------- */

(function () {
    var r = D.parseRun("");
    ok(r.errors.length > 0, "空输入报错");
    eq(r.yaml, "", "空输入不输出 YAML");
})();

(function () {
    var r = D.parseRun("docker ps -a");
    ok(r.errors.length > 0, "非 docker run 输入报错");
    eq(r.yaml, "", "非 docker run 不输出 YAML");
})();

(function () {
    var r = D.parseRun("curl https://example.com");
    ok(r.errors.length > 0, "curl 命令报错");
})();

(function () {
    var r = D.parseRun("docker run -p 8080:80");
    ok(r.errors.length > 0, "缺镜像报错");
    eq(r.yaml, "", "缺镜像不输出 YAML");
})();

(function () {
    var r = D.parseRun("docker run -e 'MSG=abc nginx");
    ok(r.errors.length > 0, "未闭合引号报错");
    eq(r.yaml, "", "未闭合引号不输出 YAML");
})();

/* ---------- 9. 示例静态检查 ---------- */

(function () {
    eq(D.samples.length, 4, "4 组示例");
    D.samples.forEach(function (s, idx) {
        var r = D.parseRun(s.cmd);
        eq(r.errors.length, 0, "示例 " + idx + "（" + s.name + "）解析无错误");
        ok(r.yaml.length > 0, "示例 " + idx + " YAML 非空");
        notContains(r.yaml, "version:", "示例 " + idx + " YAML 无 version");
    });
    var r4 = D.parseRun(D.samples[3].cmd);
    ok(r4.diagnostics.some(function (d) { return d.kind === "unsupported"; }), "示例 4 触发不支持诊断");
    contains(r4.yaml, ":ro", "示例 4 只读挂载进 YAML");
})();

/* ---------- 10. YAML 引号辅助 ---------- */

(function () {
    eq(D.yamlDQ('a"b', false), '"a\\"b"', "双引号标量转义双引号");
    eq(D.yamlDQ("a$b", true), '"a$$b"', "环境变量标量 $ 转 $$");
    eq(D.cleanServiceName("My_App.Service"), "my-app-service", "服务名清洗：非法字符转 -");
    eq(D.imageBasename("registry.io/team/app:1.0"), "app", "镜像 basename 去仓库与 tag");
})();

console.log("\n通过 " + pass + " / 失败 " + fail + "（共 " + (pass + fail) + "）");
process.exit(fail ? 1 : 0);
