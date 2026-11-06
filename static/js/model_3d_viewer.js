/* 3D 模型预览器（model_3d_viewer）- 纯前端 3D 模型预览工具
 *
 * 流程：上传/拖拽 STL/OBJ/GLB（≤100MB，全本地，不上传）→ FileReader 读入
 *   ArrayBuffer → 按扩展名分发：STL 用本地 vendor 的 STLLoader 解析（ASCII/
 *   二进制自动判定），OBJ 用 OBJLoader 解析文本，GLB 用 GLTFLoader 解析 →
 *   three.js WebGL 渲染 + OrbitControls 轨道控制（旋转/缩放/平移）、自动旋转
 *   开关、线框/实体切换、重置视角 → 信息面板（格式/三角面数/顶点数/包围盒
 *   尺寸/文件大小），加载后按 fitScale 自适应缩放居中 → 当前视角导出 PNG。
 *   内置程序化示例模型（TorusKnot）一键加载，无需外部文件。
 *
 * three.js 及四个加载器均为仓库内 vendor 文件（pinned r128 UMD），离线可用，
 * 模板零外部静态资源。模型只在浏览器本地处理：无后端调用、无第三方依赖。
 * 纯函数（detectModelFormat / detectSTLFormat / parseSTLAscii /
 * parseSTLBinaryHeader / parseOBJCounts / computeBounds / fitScale /
 * formatFileSize / formatCount / validateViewerConfig / validateViewerState）
 * 在 node 下可单元测试。
 * 真限制：① 只做预览，不做编辑/切片/格式转换；② GLB 若含外部纹理引用或
 *   DRACO 压缩可能无法加载（DRACO 需额外解码器，本轮暂不支持）；③ 大模型
 *   （>50MB 或 >100 万面）在移动端/低配设备上可能卡顿；④ 全程浏览器本地
 *   计算，零上传。
 */
(function () {
'use strict';

/* ================= 纯函数 ================= */

function m3dErr(message, field) {
    var e = new Error(message);
    e.field = field;
    return e;
}

function isFiniteNum(x) {
    return typeof x === 'number' && isFinite(x);
}

// 文件名 → 'stl' | 'obj' | 'glb'（扩展名大小写不敏感）。
// 锚点：model.STL→'stl'、a.OBJ→'obj'、x.glb→'glb'；a.gltf/a.txt 抛错 field='format'；'' 抛错 field='fileName'。
function detectModelFormat(fileName) {
    if (typeof fileName !== 'string' || fileName.length === 0) throw m3dErr('fileName 须为非空字符串', 'fileName');
    var dot = fileName.lastIndexOf('.');
    if (dot < 0 || dot === fileName.length - 1) throw m3dErr('未知模型格式：缺少扩展名', 'format');
    var ext = fileName.slice(dot + 1).toLowerCase();
    if (ext === 'stl') return 'stl';
    if (ext === 'obj') return 'obj';
    if (ext === 'glb') return 'glb';
    throw m3dErr('不支持的模型格式：' + ext + '（支持 stl/obj/glb）', 'format');
}

// STL 二进制/ASCII 判定：以 'solid' 开头且含 'endsolid' → 'ascii'，其余 → 'binary'。
// bytes 须为 Uint8Array 且长度 >0，否则抛错 field='stl'。
function detectSTLFormat(bytes) {
    if (!(bytes instanceof Uint8Array) || bytes.length === 0) throw m3dErr('stl 须为非空 Uint8Array', 'stl');
    var SOLID = [115, 111, 108, 105, 100];       // 'solid'
    var ENDSOLID = [101, 110, 100, 115, 111, 108, 105, 100]; // 'endsolid'
    function eqAt(off, word) {
        for (var i = 0; i < word.length; i++) {
            var b = bytes[off + i];
            if (b === undefined) return false;
            // 大小写不敏感：A-Z 与 a-z 差 32
            if (b !== word[i] && b !== word[i] - 32) return false;
        }
        return true;
    }
    if (!eqAt(0, SOLID)) return 'binary';
    for (var off = 0; off + ENDSOLID.length <= bytes.length; off++) {
        if (eqAt(off, ENDSOLID)) return 'ascii';
    }
    return 'binary';
}

// ASCII STL 解析 → {triangleCount, vertexCount, min:{x,y,z}, max:{x,y,z}}。
// 无 'facet' 抛错 field='stl'；非字符串抛错 field='stl'。
function parseSTLAscii(text) {
    if (typeof text !== 'string') throw m3dErr('stl 文本须为字符串', 'stl');
    if (text.indexOf('facet') === -1) throw m3dErr('不是 ASCII STL：未找到 facet', 'stl');
    var lines = text.split(/\r?\n/);
    var positions = [];
    var triangleCount = 0;
    var vertexRe = /^\s*vertex\s+(-?[\d.eE+]+)\s+(-?[\d.eE+]+)\s+(-?[\d.eE+]+)/;
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        var t = line.replace(/^\s+/, '');
        if (t.indexOf('facet') === 0) triangleCount++;
        var m = vertexRe.exec(line);
        if (m) {
            positions.push(parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]));
        }
    }
    if (triangleCount === 0 || positions.length === 0) throw m3dErr('ASCII STL 无有效三角面', 'stl');
    var b = computeBounds(positions);
    return { triangleCount: triangleCount, vertexCount: positions.length / 3, min: b.min, max: b.max };
}

// 二进制 STL 头解析 → {triangleCount, expectedBytes}（expectedBytes = 84 + 50n）。
// bytes 须为 Uint8Array 且长度 ≥84；实长不足抛错 field='stl'。
function parseSTLBinaryHeader(bytes) {
    if (!(bytes instanceof Uint8Array) || bytes.length < 84) throw m3dErr('二进制 STL 头须为 ≥84 字节的 Uint8Array', 'stl');
    var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    var n = dv.getUint32(80, true);
    var expectedBytes = 84 + 50 * n;
    if (bytes.length < expectedBytes) throw m3dErr('二进制 STL 长度不足：期望 ' + expectedBytes + ' 字节，实得 ' + bytes.length, 'stl');
    return { triangleCount: n, expectedBytes: expectedBytes };
}

// OBJ 计数 → {vertexCount, faceCount}：只计 'v ' 顶点行与 'f ' 面行，'vn '/'vt ' 不计。
// 空文本返回 {0,0}；非字符串抛错 field='obj'。
function parseOBJCounts(text) {
    if (typeof text !== 'string') throw m3dErr('obj 文本须为字符串', 'obj');
    var vertexCount = 0, faceCount = 0;
    var lines = text.split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i].replace(/^\s+/, '');
        if (/^v\s/.test(line)) vertexCount++;
        else if (/^f\s/.test(line)) faceCount++;
    }
    return { vertexCount: vertexCount, faceCount: faceCount };
}

// 包围盒 → {min:{x,y,z}, max:{x,y,z}, center:{x,y,z}, size:{x,y,z}}。
// positions 须为长度 ≥3 且为 3 倍数的有限数数组，否则抛错 field='positions'。
function computeBounds(positions) {
    if (!positions || typeof positions.length !== 'number' || positions.length < 3 ||
        positions.length % 3 !== 0) throw m3dErr('positions 须为长度 ≥3 且为 3 倍数的数组', 'positions');
    var minX = Infinity, minY = Infinity, minZ = Infinity;
    var maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (var i = 0; i < positions.length; i += 3) {
        var x = positions[i], y = positions[i + 1], z = positions[i + 2];
        if (!isFiniteNum(x) || !isFiniteNum(y) || !isFiniteNum(z)) throw m3dErr('positions 须全为有限数', 'positions');
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (z < minZ) minZ = z;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
        if (z > maxZ) maxZ = z;
    }
    var min = { x: minX, y: minY, z: minZ };
    var max = { x: maxX, y: maxY, z: maxZ };
    return {
        min: min, max: max,
        center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2, z: (minZ + maxZ) / 2 },
        size: { x: maxX - minX, y: maxY - minY, z: maxZ - minZ }
    };
}

// 自适应缩放因子 = targetSize / maxDimension。
// 锚点 (10,2)→0.2、(0.5,2)→4；maxDimension 非法抛错 field='size'；targetSize 非法抛错 field='target'。
function fitScale(maxDimension, targetSize) {
    if (!isFiniteNum(maxDimension) || maxDimension <= 0) throw m3dErr('size 须为 >0 的有限数', 'size');
    if (!isFiniteNum(targetSize) || targetSize <= 0) throw m3dErr('target 须为 >0 的有限数', 'target');
    return targetSize / maxDimension;
}

// 字节 → "N B" / "N.N KB" / "N.N MB"（一位小数）。锚点 1536→"1.5 KB"、1048576→"1.0 MB"。
function formatFileSize(bytes) {
    if (!isFiniteNum(bytes) || bytes < 0) throw m3dErr('bytes 须为 ≥0 的有限数字', 'bytes');
    if (bytes < 1024) return Math.floor(bytes) + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
}

// 千分位逗号。锚点 0→"0"、1234→"1,234"、1234567→"1,234,567"；非法抛错 field='count'。
function formatCount(n) {
    if (typeof n !== 'number' || Math.floor(n) !== n || n < 0 || !isFinite(n)) throw m3dErr('count 须为 ≥0 的整数', 'count');
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// 查看器配置校验：wireframe/autoRotate 如出现须为 boolean；background 如出现须为 #rrggbb。
function validateViewerConfig(config) {
    if (!config || typeof config !== 'object') throw m3dErr('config 须为对象', 'config');
    if (config.wireframe !== undefined && typeof config.wireframe !== 'boolean') throw m3dErr('wireframe 须为 boolean', 'wireframe');
    if (config.autoRotate !== undefined && typeof config.autoRotate !== 'boolean') throw m3dErr('autoRotate 须为 boolean', 'autoRotate');
    if (config.background !== undefined && !/^#[0-9a-fA-F]{6}$/.test(config.background)) throw m3dErr('background 须为 #rrggbb 六位十六进制', 'background');
    return config;
}

// 查看器状态校验：progress 0–100；status ∈ idle/loading/ready/error。
function validateViewerState(state) {
    if (!state || typeof state !== 'object') throw m3dErr('state 须为对象', 'progress');
    if (!isFiniteNum(state.progress) || state.progress < 0 || state.progress > 100) throw m3dErr('progress 须为 0–100 的有限数', 'progress');
    if (state.status !== 'idle' && state.status !== 'loading' && state.status !== 'ready' &&
        state.status !== 'error') throw m3dErr('status 须为 idle/loading/ready/error 之一', 'status');
    return state;
}

// 浏览器端挂 window.Model3DViewer；node 下导出纯函数以便单元测试
if (typeof window !== 'undefined') {
    window.Model3DViewer = { detectModelFormat: detectModelFormat, detectSTLFormat: detectSTLFormat,
        parseSTLAscii: parseSTLAscii, parseSTLBinaryHeader: parseSTLBinaryHeader,
        parseOBJCounts: parseOBJCounts, computeBounds: computeBounds, fitScale: fitScale,
        formatFileSize: formatFileSize, formatCount: formatCount,
        validateViewerConfig: validateViewerConfig, validateViewerState: validateViewerState };
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { detectModelFormat: detectModelFormat, detectSTLFormat: detectSTLFormat,
        parseSTLAscii: parseSTLAscii, parseSTLBinaryHeader: parseSTLBinaryHeader,
        parseOBJCounts: parseOBJCounts, computeBounds: computeBounds, fitScale: fitScale,
        formatFileSize: formatFileSize, formatCount: formatCount,
        validateViewerConfig: validateViewerConfig, validateViewerState: validateViewerState };
    return;
}

/* ================= 浏览器侧：状态 ================= */

var M3D_MAX_BYTES = 104857600;   // 100MB 上限
var M3D_ACCEPT_RE = /\.(stl|obj|glb)$/i;
var M3D_FIT_SIZE = 2;            // 归一化目标尺寸：模型最长边缩放至 2 个单位
var M3D_BIG_WARN_BYTES = 52428800;   // >50MB 提示可能卡顿
var M3D_BIG_WARN_FACES = 1000000;    // >100 万面提示可能卡顿

var state = {
    format: '',          // 'stl' | 'obj' | 'glb'
    formatLabel: '',     // 面板显示：STL · ASCII / STL · 二进制 / OBJ / GLB
    fileName: '',        // 源文件名
    fileSize: 0,         // 源文件字节数
    triangleCount: 0,
    vertexCount: 0,
    bounds: null,        // {min,max,center,size}（模型原始尺寸）
    status: 'idle',      // idle/loading/ready/error
    progress: 0,
    wireframe: false,
    autoRotate: false,
    background: '#1a1a1a',
    runId: 0,            // 加载轮次 token：重新上传/重置时递增，旧轮次异步回调凭此丢弃
    object: null,        // 当前模型 Group（已归一化缩放居中）
    sample: false        // 当前显示的是内置示例模型
};

var three = { renderer: null, scene: null, camera: null, controls: null, grid: null, raf: 0 };

function $(id) { return document.getElementById(id); }

var el = {};
['m3d-upload', 'm3d-file', 'm3d-srcinfo', 'm3d-status',
 'm3d-viewport-wrap', 'm3d-viewport', 'm3d-alt',
 'm3d-info', 'm3d-info-format', 'm3d-info-triangles', 'm3d-info-vertices',
 'm3d-info-bounds', 'm3d-info-size',
 'm3d-progress-wrap', 'm3d-progress-bar', 'm3d-progress-text',
 'm3d-controls', 'm3d-wireframe', 'm3d-autorotate', 'm3d-bg',
 'm3d-reset', 'm3d-sample', 'm3d-export-png', 'm3d-reupload'
].forEach(function (id) { el[id.replace(/-/g, '_').replace(/^m3d_/, '')] = $(id); });

function setStatus(msg) { el.status.textContent = msg || ''; }
function setAltText(msg) {
    el.alt.textContent = msg || '';
    el.viewport.setAttribute('aria-label', '3D 模型预览区。' + (msg || '尚未加载模型。'));
}

function setViewerState(status, progress) {
    validateViewerState({ progress: progress, status: status });
    state.status = status;
    state.progress = progress;
}

function setProgress(pct) {
    var p = Math.max(0, Math.min(100, Math.round(pct)));
    setViewerState(state.status, p);
    el.progress_wrap.style.display = '';
    el.progress_bar.style.width = p + '%';
    el.progress_bar.textContent = p + '%';
    el.progress_text.textContent = p >= 100 ? '加载完成' : '正在加载模型…' + p + '%';
}

function hideProgress() {
    el.progress_wrap.style.display = 'none';
    el.progress_text.textContent = '';
}

/* ================= three.js 场景 ================= */

function ensureThree() {
    if (typeof THREE === 'undefined') throw new Error('three.js 未能加载（vendor 文件缺失），请检查网络或刷新页面');
    if (three.renderer) return;
    var w = el.viewport.clientWidth || 800;
    var h = el.viewport.clientHeight || 480;
    var renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h);
    el.viewport.appendChild(renderer.domElement);
    var scene = new THREE.Scene();
    scene.background = new THREE.Color(state.background);
    var camera = new THREE.PerspectiveCamera(45, w / h, 0.01, 1000);
    camera.position.set(1.8, 1.2, 2.6);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.9));
    var dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(5, 10, 7);
    scene.add(dir);
    var grid = new THREE.GridHelper(4, 8, 0x888888, 0x555555);
    scene.add(grid);
    var controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.autoRotateSpeed = 2.0;
    if (typeof controls.listenToKeyEvents === 'function') controls.listenToKeyEvents(window);
    three.renderer = renderer;
    three.scene = scene;
    three.camera = camera;
    three.controls = controls;
    three.grid = grid;
    window.addEventListener('resize', onResize);
    (function loop() {
        three.raf = requestAnimationFrame(loop);
        controls.update();
        renderer.render(scene, camera);
    })();
}

function onResize() {
    if (!three.renderer) return;
    var w = el.viewport.clientWidth || 800;
    var h = el.viewport.clientHeight || 480;
    three.camera.aspect = w / h;
    three.camera.updateProjectionMatrix();
    three.renderer.setSize(w, h);
}

/* ================= 模型统计与归一化 ================= */

// 遍历模型统计三角面数/顶点数/包围盒（复用纯函数 computeBounds，不复制顶点数组）
function computeModelStats(object) {
    var triangles = 0, vertices = 0;
    var min = null, max = null;
    object.traverse(function (child) {
        if (!child.isMesh || !child.geometry || !child.geometry.attributes || !child.geometry.attributes.position) return;
        var pos = child.geometry.attributes.position;
        vertices += pos.count;
        var idx = child.geometry.index;
        triangles += Math.floor((idx ? idx.count : pos.count) / 3);
        var b = computeBounds(pos.array);
        if (!min) { min = b.min; max = b.max; }
        else {
            min = { x: Math.min(min.x, b.min.x), y: Math.min(min.y, b.min.y), z: Math.min(min.z, b.min.z) };
            max = { x: Math.max(max.x, b.max.x), y: Math.max(max.y, b.max.y), z: Math.max(max.z, b.max.z) };
        }
    });
    if (!min) throw new Error('模型中没有可渲染的网格顶点');
    return { triangleCount: triangles, vertexCount: vertices,
        bounds: { min: min, max: max,
            center: { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2, z: (min.z + max.z) / 2 },
            size: { x: max.x - min.x, y: max.y - min.y, z: max.z - min.z } } };
}

// 归一化：最长边缩放到 M3D_FIT_SIZE，中心移到原点；相机复位到默认视角
// （直接对模型根节点做缩放/平移，不包多余 Group，重置视角可反复调用）
function fitView(object, bounds) {
    var size = bounds.size;
    var maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim <= 0) throw new Error('模型包围盒尺寸无效，无法自适应缩放');
    var scale = fitScale(maxDim, M3D_FIT_SIZE);
    object.scale.setScalar(scale);
    object.position.set(-bounds.center.x * scale, -bounds.center.y * scale, -bounds.center.z * scale);
    three.scene.add(object);
    three.camera.position.set(1.8, 1.2, 2.6);
    three.controls.target.set(0, 0, 0);
    three.controls.update();
    return object;
}

function disposeObject(object) {
    if (!object) return;
    object.traverse(function (child) {
        if (child.isMesh) {
            if (child.geometry) child.geometry.dispose();
            var mats = Array.isArray(child.material) ? child.material : [child.material];
            mats.forEach(function (m) { if (m) m.dispose(); });
        }
    });
}

function applyWireframe() {
    if (!state.object) return;
    state.object.traverse(function (child) {
        if (child.isMesh) {
            var mats = Array.isArray(child.material) ? child.material : [child.material];
            mats.forEach(function (m) { if (m) m.wireframe = state.wireframe; });
        }
    });
}

function applyAutoRotate() {
    if (three.controls) three.controls.autoRotate = state.autoRotate;
}

function applyBackground() {
    validateViewerConfig({ background: state.background });
    if (three.scene) three.scene.background = new THREE.Color(state.background);
}

/* ================= 信息面板 ================= */

function fmtSizeVec(size) {
    function r(n) { return Math.round(n * 1000) / 1000; }
    return r(size.x) + ' × ' + r(size.y) + ' × ' + r(size.z);
}

function updateInfoPanel() {
    el.info_format.textContent = state.formatLabel || '–';
    el.info_triangles.textContent = state.triangleCount ? formatCount(state.triangleCount) : '–';
    el.info_vertices.textContent = state.vertexCount ? formatCount(state.vertexCount) : '–';
    el.info_bounds.textContent = state.bounds ? fmtSizeVec(state.bounds.size) : '–';
    el.info_size.textContent = state.fileSize ? formatFileSize(state.fileSize) : '–';
    el.info.style.display = '';
    el.controls.style.display = '';
}

function showModel(object, stats, formatLabel, fileName, fileSize) {
    if (state.object) {
        three.scene.remove(state.object);
        disposeObject(state.object);
        state.object = null;
    }
    var group = fitView(object, stats.bounds);
    state.object = group;
    state.triangleCount = stats.triangleCount;
    state.vertexCount = stats.vertexCount;
    state.bounds = stats.bounds;
    state.formatLabel = formatLabel;
    state.fileName = fileName;
    state.fileSize = fileSize;
    state.sample = fileName === '内置示例模型';
    applyWireframe();
    applyAutoRotate();
    updateInfoPanel();
    setViewerState('ready', 100);
    hideProgress();
    var warn = '';
    if (fileSize > M3D_BIG_WARN_BYTES || stats.triangleCount > M3D_BIG_WARN_FACES) {
        warn = '（大模型，低配设备可能卡顿）';
    }
    setStatus('✅ 已加载：' + fileName + '（' + formatLabel + '，' + formatCount(stats.triangleCount) +
        ' 面，' + formatCount(stats.vertexCount) + ' 顶点）' + warn);
    setAltText('已加载 ' + fileName + '：' + formatLabel + '，' + formatCount(stats.triangleCount) +
        ' 个三角面，' + formatCount(stats.vertexCount) + ' 个顶点，包围盒尺寸 ' + fmtSizeVec(stats.bounds.size) + '。' +
        '可用鼠标拖拽旋转、滚轮缩放、右键平移；方向键也可平移视角。');
    el.viewport_wrap.style.display = '';
}

/* ================= 解析分发 ================= */

function parseModel(format, buffer) {
    return new Promise(function (resolve, reject) {
        try {
            if (format === 'stl') {
                var stlBytes = new Uint8Array(buffer);
                var kind = detectSTLFormat(stlBytes);
                var loader = new THREE.STLLoader();
                var geometry;
                if (kind === 'ascii') {
                    geometry = loader.parse(new TextDecoder().decode(buffer));
                } else {
                    geometry = loader.parse(buffer);
                }
                var mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0x2563eb, metalness: 0.1, roughness: 0.4 }));
                var g = new THREE.Group();
                g.add(mesh);
                resolve({ object: g, formatLabel: kind === 'ascii' ? 'STL · ASCII' : 'STL · 二进制' });
            } else if (format === 'obj') {
                var text = new TextDecoder().decode(buffer);
                var objLoader = new THREE.OBJLoader();
                var obj = objLoader.parse(text);
                obj.traverse(function (child) {
                    if (child.isMesh && !child.material) {
                        child.material = new THREE.MeshStandardMaterial({ color: 0x2563eb, metalness: 0.1, roughness: 0.4 });
                    }
                });
                resolve({ object: obj, formatLabel: 'OBJ' });
            } else if (format === 'glb') {
                var gltfLoader = new THREE.GLTFLoader();
                gltfLoader.parse(buffer, '', function (gltf) {
                    resolve({ object: gltf.scene, formatLabel: 'GLB' });
                }, function (err) {
                    reject(new Error('GLB 解析失败：' + (err && err.message ? err.message : '未知错误') +
                        '（含外部纹理引用或 DRACO 压缩的 GLB 本轮暂不支持）'));
                });
            } else {
                reject(new Error('不支持的模型格式：' + format));
            }
        } catch (e) {
            reject(e);
        }
    });
}

/* ================= 上传与加载 ================= */

function handleFile(file) {
    if (!file) return;
    var format;
    try {
        format = detectModelFormat(file.name);
    } catch (e) {
        setStatus('❌ 不支持的文件类型：' + file.name + '（支持 STL / OBJ / GLB）');
        setViewerState('error', 0);
        return;
    }
    if (file.size > M3D_MAX_BYTES) {
        setStatus('❌ 文件过大：' + formatFileSize(file.size) + '，上限 100MB（' + formatFileSize(M3D_MAX_BYTES) + '）');
        setViewerState('error', 0);
        return;
    }
    try {
        ensureThree();
    } catch (e) {
        setStatus('❌ ' + e.message);
        setViewerState('error', 0);
        return;
    }
    state.runId = (state.runId || 0) + 1;
    var runToken = state.runId;
    state.format = format;
    setViewerState('loading', 0);
    setProgress(5);
    setStatus('⏳ 正在读取 ' + file.name + '（' + formatFileSize(file.size) + '）…');
    el.srcinfo.style.display = '';
    el.srcinfo.textContent = '源文件：' + file.name + '（' + formatFileSize(file.size) + '）';
    var reader = new FileReader();
    reader.onprogress = function (ev) {
        if (runToken !== state.runId) return;
        if (ev.lengthComputable && ev.total > 0) setProgress(5 + Math.round(ev.loaded / ev.total * 55));
    };
    reader.onerror = function () {
        if (runToken !== state.runId) return;
        setStatus('❌ 文件读取失败');
        setViewerState('error', 0);
        hideProgress();
    };
    reader.onload = function () {
        if (runToken !== state.runId) return;
        setProgress(65);
        setStatus('⏳ 正在解析模型…');
        parseModel(format, reader.result).then(function (parsed) {
            if (runToken !== state.runId) return;
            setProgress(90);
            var stats;
            try {
                stats = computeModelStats(parsed.object);
            } catch (e) {
                setStatus('❌ 模型统计失败：' + e.message);
                setViewerState('error', 0);
                hideProgress();
                return;
            }
            showModel(parsed.object, stats, parsed.formatLabel, file.name, file.size);
        }).catch(function (e) {
            if (runToken !== state.runId) return;
            setStatus('❌ ' + e.message);
            setViewerState('error', 0);
            hideProgress();
        });
    };
    reader.readAsArrayBuffer(file);
}

/* ================= 内置示例模型 ================= */

function buildSampleModel() {
    var geo = new THREE.TorusKnotGeometry(0.55, 0.18, 128, 24);
    var mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x2563eb, metalness: 0.1, roughness: 0.35 }));
    var g = new THREE.Group();
    g.add(mesh);
    return g;
}

function loadSample() {
    try {
        ensureThree();
    } catch (e) {
        setStatus('❌ ' + e.message);
        setViewerState('error', 0);
        return;
    }
    state.runId = (state.runId || 0) + 1;
    setViewerState('loading', 0);
    setProgress(50);
    setStatus('⏳ 正在生成内置示例模型…');
    el.srcinfo.style.display = 'none';
    try {
        var object = buildSampleModel();
        var stats = computeModelStats(object);
        showModel(object, stats, '示例 · 程序化生成', '内置示例模型', 0);
    } catch (e) {
        setStatus('❌ 示例模型生成失败：' + e.message);
        setViewerState('error', 0);
        hideProgress();
    }
}

/* ================= 导出 PNG ================= */

function exportPng() {
    if (!three.renderer || !state.object) {
        setStatus('❌ 请先加载模型再导出截图');
        return;
    }
    try {
        three.renderer.render(three.scene, three.camera);
        three.renderer.domElement.toBlob(function (blob) {
            if (!blob) { setStatus('❌ PNG 截图导出失败'); return; }
            var a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            var stem = state.fileName ? state.fileName.replace(/\.[^.]+$/, '') : 'model';
            a.download = stem + '-view.png';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
            setStatus('✅ 当前视角 PNG 已导出：' + a.download);
        }, 'image/png');
    } catch (e) {
        setStatus('❌ PNG 截图导出失败：' + e.message);
    }
}

/* ================= 重置 ================= */

function resetView() {
    if (!three.controls || !state.object) {
        setStatus('❌ 请先加载模型再重置视角');
        return;
    }
    var stats;
    try {
        // 几何顶点数组不受 Group 缩放影响，computeModelStats 直接给出原始包围盒
        stats = computeModelStats(state.object);
    } catch (e) {
        setStatus('❌ 重置视角失败：' + e.message);
        return;
    }
    var object = state.object;
    object.position.set(0, 0, 0);
    object.scale.setScalar(1);
    three.scene.remove(object);
    state.object = fitView(object, stats.bounds);
    applyWireframe();
    applyAutoRotate();
    setStatus('✅ 视角已重置（模型居中，缩放已归一化）');
}

/* ================= 初始化 ================= */

function init() {
    el.upload.addEventListener('click', function () { el.file.click(); });
    el.upload.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); el.file.click(); }
    });
    el.file.addEventListener('change', function () { handleFile(el.file.files[0]); });
    ['dragenter', 'dragover'].forEach(function (t) {
        el.upload.addEventListener(t, function (ev) { ev.preventDefault(); el.upload.classList.add('dragover'); });
    });
    ['dragleave', 'drop'].forEach(function (t) {
        el.upload.addEventListener(t, function (ev) { ev.preventDefault(); el.upload.classList.remove('dragover'); });
    });
    el.upload.addEventListener('drop', function (ev) {
        var f = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
        handleFile(f);
    });

    el.wireframe.addEventListener('change', function () {
        state.wireframe = el.wireframe.checked;
        try {
            validateViewerConfig({ wireframe: state.wireframe });
        } catch (e) {
            setStatus('❌ 线框配置无效：' + e.message);
            return;
        }
        applyWireframe();
        setStatus(state.wireframe ? '线框模式已开启' : '实体模式已开启');
    });
    el.autorotate.addEventListener('change', function () {
        state.autoRotate = el.autorotate.checked;
        try {
            validateViewerConfig({ autoRotate: state.autoRotate });
        } catch (e) {
            setStatus('❌ 自动旋转配置无效：' + e.message);
            return;
        }
        applyAutoRotate();
        setStatus(state.autoRotate ? '自动旋转已开启' : '自动旋转已关闭');
    });
    el.bg.addEventListener('input', function () {
        state.background = el.bg.value;
        try {
            applyBackground();
        } catch (e) {
            setStatus('❌ 背景色无效：' + e.message);
        }
    });

    el.reset.addEventListener('click', resetView);
    el.sample.addEventListener('click', loadSample);
    el.export_png.addEventListener('click', exportPng);
    el.reupload.addEventListener('click', function () {
        state.runId = (state.runId || 0) + 1;
        if (state.object) {
            three.scene.remove(state.object);
            disposeObject(state.object);
            state.object = null;
        }
        state.format = '';
        state.formatLabel = '';
        state.fileName = '';
        state.fileSize = 0;
        state.triangleCount = 0;
        state.vertexCount = 0;
        state.bounds = null;
        state.sample = false;
        el.srcinfo.style.display = 'none';
        el.info.style.display = 'none';
        el.controls.style.display = 'none';
        el.file.value = '';
        setViewerState('idle', 0);
        hideProgress();
        setStatus('');
        setAltText('尚未加载模型。上传 STL、OBJ 或 GLB 文件，或点击「加载内置示例模型」查看演示。');
    });

    // 方向键旋转视角（焦点在预览区时；OrbitControls 已绑定按键）
    el.viewport.addEventListener('keydown', function (ev) {
        if (!three.controls) return;
        if (ev.key === 'r' || ev.key === 'R') { resetView(); }
    });

    try {
        ensureThree();
    } catch (e) {
        setStatus('⚠️ ' + e.message);
    }
    setAltText('尚未加载模型。上传 STL、OBJ 或 GLB 文件，或点击「加载内置示例模型」查看演示。');
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

})();
