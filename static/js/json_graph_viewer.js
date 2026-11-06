/* JSON 结构图可视化（JSON Crack 模式）- 纯前端（零后端、零上传）
 *
 * 纯逻辑层（JG-CORE）：JSON.parse 校验 → 自研树→图分层布局（按深度分列、
 * 父节点 y 为子节点 y 均值、贝塞尔连线）生成 SVG 节点连线图。无 DOM，可在
 * Node 下单测。DOM 层：节点折叠／展开、拖拽平移、滚轮＋按钮缩放 0.2–3x、
 * 按 key／值搜索定位高亮、一键复制 JSON Path 与节点值、统计面板、
 * SVG 下载与 PNG 2x 导出。只做结构图可视化，不做格式化／校验／JSONPath 查询。
 * 不引 d3、不走 CDN；模板零外部静态资源。
 */
(function () {
'use strict';

var MAX_INPUT = 100000;
var MAX_NODES = 3000;
var COL_WIDTH = 260;
var ROW_HEIGHT = 64;
var NODE_WIDTH = 200;
var NODE_HEIGHT = 44;
var MIN_SCALE = 0.2;
var MAX_SCALE = 3;

var IDENT_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

var TYPE_COLORS = {
    object: '#2563eb',
    array: '#7c3aed',
    string: '#047857',
    number: '#b45309',
    boolean: '#be185d',
    'null': '#6b7280'
};

var TYPE_LABELS = {
    object: '对象',
    array: '数组',
    string: '字符串',
    number: '数字',
    boolean: '布尔',
    'null': 'null'
};

function fail(field, message) {
    var e = new Error(message);
    e.field = field;
    return e;
}

function typeOf(v) {
    if (v === null) return 'null';
    if (Array.isArray(v)) return 'array';
    return typeof v; /* object / string / number / boolean */
}

/* 只接受 JSON 合法值：undefined 与函数不是 JSON.parse 的返回值。 */
function checkJsonValue(v, field) {
    if (v === undefined || typeof v === 'function') {
        throw fail(field, '只接受 JSON 合法值（undefined 与函数无法表示为 JSON）');
    }
}

function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* ================= parseJsonInput ================= */

/* 粘贴的 JSON 文本 → 解析值。非法／空／超长抛错 err.field='input'，
 * 错误信息保留 JSON.parse 原生 message，不渲染半截图由调用方保证。 */
function parseJsonInput(input) {
    if (typeof input !== 'string') throw fail('input', '输入须为字符串');
    if (input.trim() === '') throw fail('input', '输入为空：请粘贴 JSON 文本');
    if (input.length > MAX_INPUT) {
        throw fail('input', '输入超过 ' + MAX_INPUT + ' 字符上限（实得 ' + input.length + ' 字符），请拆分后粘贴');
    }
    try {
        return JSON.parse(input);
    } catch (e) {
        throw fail('input', 'JSON 解析失败：' + e.message);
    }
}

/* ================= buildGraph ================= */

function makeNode(key, path, pathStr, value, depth, parentId) {
    return {
        id: pathStr,
        key: key,
        path: path,
        pathStr: pathStr,
        type: typeOf(value),
        value: value,
        depth: depth,
        parentId: parentId,
        children: [],
        collapsed: false,
        truncated: false,
        truncatedCount: 0
    };
}

/* 取一个容器节点的直接子条目；遇循环引用（子值是祖先）抛错 err.field='value'。 */
function childEntries(value, ancestors) {
    var list = [];
    var i, k, child;
    if (Array.isArray(value)) {
        for (i = 0; i < value.length; i++) {
            child = value[i];
            checkJsonValue(child, 'value');
            if (child !== null && typeof child === 'object' && ancestors.indexOf(child) !== -1) {
                throw fail('value', '不支持循环引用：数组下标 ' + i + ' 处出现重复引用');
            }
            list.push({ key: String(i), path: null, pathStr: null, value: child, index: i });
        }
    } else if (value !== null && typeof value === 'object') {
        var keys = Object.keys(value);
        for (i = 0; i < keys.length; i++) {
            k = keys[i];
            child = value[k];
            checkJsonValue(child, 'value');
            if (child !== null && typeof child === 'object' && ancestors.indexOf(child) !== -1) {
                throw fail('value', '不支持循环引用：键 "' + k + '" 处出现重复引用');
            }
            list.push({ key: k, path: null, pathStr: null, value: child, index: -1 });
        }
    }
    return list;
}

/* 值 → 图：{nodes, edges, truncated, truncatedDepth, truncatedCount}。
 * 根节点 id '$'、path []。edges 长度恒为 nodes 长度 − 1（每个非根节点恰一条边）。
 * 节点数护栏：按层（BFS）展开，展开下一层会超过 MAX_NODES 时停在当前层，
 * 该层节点打 truncated 标记并记未展开子节点数，不静默截断。 */
function buildGraph(value, options) {
    checkJsonValue(value, 'value');
    var opts = options || {};
    var maxNodes = (typeof opts.maxNodes === 'number' && opts.maxNodes > 0)
        ? Math.floor(opts.maxNodes) : MAX_NODES;
    var nodes = [], edges = [];
    var root = makeNode('$', [], '$', value, 0, null);
    nodes.push(root);
    var ancestorsById = {};
    ancestorsById[root.id] = [];
    var truncated = false, truncatedDepth = -1, truncatedCount = 0;
    var frontier = [root];
    while (frontier.length > 0) {
        var childLists = [], childTotal = 0, fi, ci;
        for (fi = 0; fi < frontier.length; fi++) {
            var list = childEntries(frontier[fi].value, ancestorsById[frontier[fi].id]);
            childLists.push(list);
            childTotal += list.length;
        }
        if (nodes.length + childTotal > maxNodes) {
            truncated = true;
            truncatedDepth = frontier[0].depth;
            for (fi = 0; fi < frontier.length; fi++) {
                frontier[fi].truncated = true;
                frontier[fi].truncatedCount = childLists[fi].length;
                truncatedCount += childLists[fi].length;
            }
            break;
        }
        var next = [];
        for (fi = 0; fi < frontier.length; fi++) {
            var parent = frontier[fi];
            var list2 = childLists[fi];
            for (ci = 0; ci < list2.length; ci++) {
                var e = list2[ci];
                /* 路径段：数组下标用数字，对象键用字符串 */
                var seg = (Array.isArray(parent.value)) ? e.index : e.key;
                var childPath = parent.path.concat([seg]);
                var childPathStr = formatJsonPath(childPath);
                var child = makeNode(e.key, childPath, childPathStr, e.value, parent.depth + 1, parent.id);
                nodes.push(child);
                edges.push({ from: parent.id, to: child.id });
                parent.children.push(child.id);
                ancestorsById[child.id] = ancestorsById[parent.id].concat([parent.value]);
                next.push(child);
            }
        }
        frontier = next;
    }
    return {
        nodes: nodes,
        edges: edges,
        truncated: truncated,
        truncatedDepth: truncatedDepth,
        truncatedCount: truncatedCount
    };
}

/* ================= layoutGraph ================= */

/* 图 → 分层布局：{nodes:[{...node, x, y}], width, height, hiddenCount}。
 * 同深度节点 x 相同（按深度分列）；父节点 y 为其可见子节点 y 的均值；
 * 同列节点 y 间距 ≥ ROW_HEIGHT（节点高 44），无重叠；折叠节点的子树不参与布局。
 * 空图返回 width／height 为 0，不抛错；非法 graph 抛错 err.field='graph'。 */
function layoutGraph(graph, options) {
    if (!graph || typeof graph !== 'object' || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
        throw fail('graph', 'graph 须为 buildGraph 返回的结构（含 nodes／edges 数组）');
    }
    var nodes = graph.nodes;
    if (nodes.length === 0) return { nodes: [], width: 0, height: 0, hiddenCount: 0 };
    var byId = {};
    var i;
    for (i = 0; i < nodes.length; i++) byId[nodes[i].id] = nodes[i];
    var root = null;
    for (i = 0; i < nodes.length; i++) {
        if (nodes[i].parentId === null || nodes[i].parentId === undefined) { root = nodes[i]; break; }
    }
    if (!root) throw fail('graph', 'graph 缺少根节点（parentId 为 null 的节点）');
    var opts = options || {};
    var colWidth = opts.colWidth || COL_WIDTH;
    var rowHeight = opts.rowHeight || ROW_HEIGHT;

    function visibleChildren(n) {
        if (n.collapsed) return [];
        var out = [];
        var kids = n.children || [];
        for (var k = 0; k < kids.length; k++) {
            if (byId[kids[k]]) out.push(byId[kids[k]]);
        }
        return out;
    }

    var placed = {};
    var order = [];
    var leafCount = 0, maxDepth = 0, slot = 0;
    function assign(n) {
        order.push(n);
        if (n.depth > maxDepth) maxDepth = n.depth;
        var kids = visibleChildren(n);
        if (kids.length === 0) {
            placed[n.id] = { x: n.depth * colWidth, y: slot * rowHeight };
            slot++;
            leafCount++;
        } else {
            var ys = [];
            for (var k = 0; k < kids.length; k++) {
                assign(kids[k]);
                ys.push(placed[kids[k].id].y);
            }
            var sum = 0;
            for (var j = 0; j < ys.length; j++) sum += ys[j];
            placed[n.id] = { x: n.depth * colWidth, y: sum / ys.length };
        }
    }
    assign(root);
    var out = order.map(function (n) {
        var c = {};
        for (var k in n) c[k] = n[k];
        c.x = placed[n.id].x;
        c.y = placed[n.id].y;
        return c;
    });
    return {
        nodes: out,
        width: (maxDepth + 1) * colWidth,
        height: leafCount * rowHeight,
        hiddenCount: nodes.length - order.length
    };
}

/* ================= formatJsonPath ================= */

/* 路径段数组 → JSON Path 字符串：[] → '$'；
 * ['store','book',0,'title'] → '$.store.book[0].title'；
 * 特殊 key 用括号引号形式，如 ['my-key'] → "$['my-key']"。
 * 非数组／非法段抛错 err.field='segments'。 */
function formatJsonPath(segments) {
    if (!Array.isArray(segments)) throw fail('segments', '路径段须为数组');
    var out = '$';
    for (var i = 0; i < segments.length; i++) {
        var s = segments[i];
        if (typeof s === 'number') {
            if (!isFinite(s) || Math.floor(s) !== s || s < 0) {
                throw fail('segments', '数组下标须为非负整数（实得 ' + s + '）');
            }
            out += '[' + s + ']';
        } else if (typeof s === 'string') {
            if (IDENT_RE.test(s)) out += '.' + s;
            else out += "['" + s.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "']";
        } else {
            throw fail('segments', '路径段须为字符串或数字（实得 ' + typeof s + '）');
        }
    }
    return out;
}

/* ================= searchNodes ================= */

/* 按 key 或叶子值子串匹配（不区分大小写），返回命中节点 id 数组。
 * graph 非法抛错 err.field='graph'；query 非空字符串否则 err.field='query'。 */
function searchNodes(graph, query) {
    if (!graph || typeof graph !== 'object' || !Array.isArray(graph.nodes)) {
        throw fail('graph', 'graph 须为 buildGraph 返回的结构（含 nodes 数组）');
    }
    if (typeof query !== 'string' || query.trim() === '') {
        throw fail('query', '搜索关键词须为非空字符串');
    }
    var q = query.toLowerCase();
    var hits = [];
    graph.nodes.forEach(function (n) {
        var keyHit = String(n.key).toLowerCase().indexOf(q) !== -1;
        var valHit = false;
        if (n.type === 'string') valHit = String(n.value).toLowerCase().indexOf(q) !== -1;
        else if (n.type === 'number' || n.type === 'boolean') valHit = String(n.value).toLowerCase().indexOf(q) !== -1;
        else if (n.type === 'null') valHit = 'null'.indexOf(q) !== -1;
        if (keyHit || valHit) hits.push(n.id);
    });
    return hits;
}

/* ================= countStats ================= */

/* 值 → 统计：{totalNodes, maxDepth, objects, arrays, leaves}。
 * 锚点：{"a":{"b":[1,2]},"c":null} → {totalNodes:6, maxDepth:3, objects:2, arrays:1, leaves:3}。
 * 非法值／循环引用抛错 err.field='value'。 */
function countStats(value) {
    checkJsonValue(value, 'value');
    var st = { totalNodes: 0, maxDepth: 0, objects: 0, arrays: 0, leaves: 0 };
    var ancestors = [];
    function walk(v, depth) {
        st.totalNodes++;
        if (depth > st.maxDepth) st.maxDepth = depth;
        var t = typeOf(v);
        if (t === 'object') {
            st.objects++;
            ancestors.push(v);
            Object.keys(v).forEach(function (k) {
                var child = v[k];
                checkJsonValue(child, 'value');
                if (child !== null && typeof child === 'object' && ancestors.indexOf(child) !== -1) {
                    throw fail('value', '不支持循环引用：键 "' + k + '" 处出现重复引用');
                }
                walk(child, depth + 1);
            });
            ancestors.pop();
        } else if (t === 'array') {
            st.arrays++;
            ancestors.push(v);
            for (var i = 0; i < v.length; i++) {
                var item = v[i];
                checkJsonValue(item, 'value');
                if (item !== null && typeof item === 'object' && ancestors.indexOf(item) !== -1) {
                    throw fail('value', '不支持循环引用：数组下标 ' + i + ' 处出现重复引用');
                }
                walk(item, depth + 1);
            }
            ancestors.pop();
        } else {
            st.leaves++;
        }
    }
    walk(value, 0);
    return st;
}

/* ================= 预设示例 ================= */

var SAMPLES = [
    {
        name: 'API 响应（深嵌套）',
        desc: '典型后端接口返回：用户信息＋订单数组，深嵌套看结构关系',
        json: '{"code":0,"message":"ok","data":{"user":{"id":1001,"name":"张三","vip":true,"tags":["go","后端"],"profile":{"age":28,"city":"深圳","address":{"district":"南山区","street":"科技园路"}}},"orders":[{"id":"A001","total":129.9,"paid":true},{"id":"A002","total":59,"paid":false}]},"meta":{"page":1,"size":10,"total":2}}'
    },
    {
        name: '应用配置对象',
        desc: '服务配置：嵌套对象＋null 占位＋数组，结构一目了然',
        json: '{"app":{"name":"toolweb","version":"1.0.0","debug":false},"server":{"host":"127.0.0.1","port":8080,"tls":null},"features":["search","export","dark-mode"],"limits":{"maxUploadMB":10,"timeoutSec":30}}'
    },
    {
        name: '商店图书列表',
        desc: 'JSONPath 经典示例：store.book 数组，含数字、字符串与嵌套对象',
        json: '{"store":{"book":[{"category":"reference","author":"Nigel Rees","title":"Sayings of the Century","price":8.95},{"category":"fiction","author":"Evelyn Waugh","title":"Sword of Honour","price":12.99}],"bicycle":{"color":"red","price":19.95}}}'
    },
    {
        name: '深嵌套长链',
        desc: '六层单链嵌套：父节点 y 自动取子节点均值，长链不挤作一团',
        json: '{"level1":{"level2":{"level3":{"level4":{"level5":{"level6":{"leaf":"到底了"}}}}}}}'
    },
    {
        name: '边界：空容器与特殊键',
        desc: '空对象／空数组＋含连字符的键（路径用 $[\'my-key\'] 形式）＋各类叶子',
        json: '{"emptyObj":{},"emptyArr":[],"my-key":"含连字符的键","items":[null,true,0,""],"nested":{"deep":[]}}'
    }
];

/* ================= svgForLayout（纯函数，可单测） ================= */

/* 文本截断（纯函数，供节点标签用）。 */
function shortText(s, n) {
    s = String(s);
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function nodeSubLabel(n) {
    if (n.type === 'object') return '对象 · ' + Object.keys(n.value).length + ' 个子节点';
    if (n.type === 'array') return '数组 · ' + n.value.length + ' 项';
    if (n.type === 'string') return '字符串 · "' + shortText(n.value, 18) + '"';
    if (n.type === 'number') return '数字 · ' + String(n.value);
    if (n.type === 'boolean') return '布尔 · ' + String(n.value);
    return 'null';
}

function nodeLabel(n, byId) {
    if (n.id === '$') return '$ 根节点';
    var parent = (byId && n.parentId !== null && n.parentId !== undefined) ? byId[n.parentId] : null;
    if (parent && parent.type === 'array') return '[' + n.key + ']';
    return n.key;
}

/* 布局 → SVG 字符串（纯函数）。
 * forExport=true 时 viewBox 固定为完整布局 "0 0 <width> <height>"（导出全图，
 * 不受当前缩放／平移影响）；展示时传 forExport=false 与当前 view（viewBox 跟随可视区）。
 * xmlns 只在此处输出一次，导出路径不再拼接补写，避免重复属性导致非法 XML。 */
function svgForLayout(layout, selectedId, matchSet, forExport, view) {
    if (!layout || typeof layout !== 'object' || !Array.isArray(layout.nodes)) {
        throw fail('graph', 'layout 须为 layoutGraph 返回的结构（含 nodes 数组）');
    }
    var parts = [];
    var W = Math.max(layout.width, 1), H = Math.max(layout.height, 1);
    var byId = {};
    layout.nodes.forEach(function (n) { byId[n.id] = n; });
    /* 连线：贝塞尔曲线，父右缘 → 子左缘 */
    layout.nodes.forEach(function (n) {
        if (n.parentId === null || n.parentId === undefined) return;
        var p = byId[n.parentId];
        if (!p) return;
        var x1 = p.x + NODE_WIDTH, y1 = p.y + NODE_HEIGHT / 2;
        var x2 = n.x, y2 = n.y + NODE_HEIGHT / 2;
        var mx = (x1 + x2) / 2;
        parts.push('<path d="M ' + x1 + ' ' + y1 + ' C ' + mx + ' ' + y1 + ', ' + mx + ' ' + y2 + ', ' + x2 + ' ' + y2 +
            '" fill="none" stroke="#94a3b8" stroke-width="1.5"/>');
    });
    /* 节点 */
    layout.nodes.forEach(function (n) {
        var color = TYPE_COLORS[n.type] || '#6b7280';
        var selected = n.id === selectedId;
        var matched = matchSet && matchSet[n.id];
        var stroke = matched ? '#dc2626' : (selected ? '#111827' : color);
        var sw = (matched || selected) ? 3 : 2;
        var hasKids = (n.children || []).length > 0;
        var badge = '';
        if (hasKids) {
            var sign = n.collapsed ? '+' : '−';
            badge = '<g data-collapse="' + escapeHtml(n.id) + '" style="cursor:pointer">' +
                '<circle cx="' + NODE_WIDTH + '" cy="0" r="11" fill="#2563eb" stroke="#fff" stroke-width="2"/>' +
                '<text x="' + NODE_WIDTH + '" y="4.5" text-anchor="middle" font-size="14" font-weight="700" fill="#fff">' + sign + '</text></g>';
        }
        var trunc = n.truncated ? ' · 以下已截断' : '';
        parts.push('<g class="jg-node" data-id="' + escapeHtml(n.id) + '" transform="translate(' + n.x + ',' + n.y + ')" style="cursor:pointer">' +
            '<rect x="0" y="0" width="' + NODE_WIDTH + '" height="' + NODE_HEIGHT + '" rx="8" fill="#fff" stroke="' + stroke + '" stroke-width="' + sw + '"/>' +
            '<text x="10" y="18" font-size="13" font-weight="700" fill="#111827" font-family="sans-serif">' + escapeHtml(shortText(nodeLabel(n, byId), 20)) + '</text>' +
            '<text x="10" y="36" font-size="11.5" fill="#6b7280" font-family="sans-serif">' + escapeHtml(shortText(nodeSubLabel(n) + trunc, 26)) + '</text>' +
            badge + '</g>');
    });
    var vb = forExport ? ('0 0 ' + W + ' ' + H)
        : (view ? (view.x + ' ' + view.y + ' ' + view.w + ' ' + view.h) : ('0 0 ' + W + ' ' + H));
    return '<svg id="jg-svg" xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H +
        '" viewBox="' + vb + '" font-family="sans-serif">' + parts.join('') + '</svg>';
}

var API = {
    MAX_INPUT: MAX_INPUT,
    MAX_NODES: MAX_NODES,
    COL_WIDTH: COL_WIDTH,
    ROW_HEIGHT: ROW_HEIGHT,
    NODE_WIDTH: NODE_WIDTH,
    NODE_HEIGHT: NODE_HEIGHT,
    MIN_SCALE: MIN_SCALE,
    MAX_SCALE: MAX_SCALE,
    TYPE_COLORS: TYPE_COLORS,
    TYPE_LABELS: TYPE_LABELS,
    parseJsonInput: parseJsonInput,
    buildGraph: buildGraph,
    layoutGraph: layoutGraph,
    formatJsonPath: formatJsonPath,
    searchNodes: searchNodes,
    countStats: countStats,
    svgForLayout: svgForLayout,
    samples: SAMPLES,
    SAMPLES: SAMPLES
};

if (typeof window !== 'undefined') window.JsonGraphViewer = API;
if (typeof module !== 'undefined' && module.exports) module.exports = API;

/* ================= DOM 层（仅浏览器） ================= */

if (typeof document !== 'undefined') {
    var $ = function (id) { return document.getElementById(id); };
    var state = {
        value: null, graph: null, layout: null,
        selectedId: null, matches: [], matchIdx: -1,
        view: { x: 0, y: 0, w: 0, h: 0 }, /* viewBox */
        dragging: null
    };

    function toast(msg) {
        var t = $('jg-tip');
        if (!t) return;
        t.textContent = msg;
        t.style.display = 'block';
        setTimeout(function () { t.style.display = 'none'; }, 2600);
    }

    function copyText(text, okMsg) {
        function done() { toast(okMsg); }
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text, done); });
        } else fallbackCopy(text, done);
    }
    function fallbackCopy(text, done) {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch (e) { /* 忽略 */ }
        document.body.removeChild(ta);
        done();
    }

    function applyView() {
        var svg = $('jg-svg');
        if (!svg) return;
        svg.setAttribute('viewBox', state.view.x + ' ' + state.view.y + ' ' + state.view.w + ' ' + state.view.h);
        var k = state.layout && state.view.w > 0 ? state.layout.width / state.view.w : 1;
        var zl = $('jg-zoom-label');
        if (zl) zl.textContent = Math.round(k * 100) + '%';
    }

    function scaleNow() {
        if (!state.layout || state.view.w <= 0) return 1;
        return state.layout.width / state.view.w;
    }

    function zoomAt(px, py, factor) {
        /* px/py：画布容器内的像素坐标；以该点为中心缩放 */
        var wrap = $('jg-graph-wrap');
        var svg = $('jg-svg');
        if (!wrap || !svg || !state.layout) return;
        var rect = wrap.getBoundingClientRect();
        var k0 = scaleNow();
        var k1 = Math.min(MAX_SCALE, Math.max(MIN_SCALE, k0 * factor));
        if (k1 === k0) return;
        var w1 = state.layout.width / k1;
        var h1 = state.layout.height / k1;
        var svgX = state.view.x + (px / rect.width) * state.view.w;
        var svgY = state.view.y + (py / rect.height) * state.view.h;
        state.view.x = svgX - (px / rect.width) * w1;
        state.view.y = svgY - (py / rect.height) * h1;
        state.view.w = w1;
        state.view.h = h1;
        applyView();
    }

    function centerNode(node) {
        if (!state.layout) return;
        var k = scaleNow();
        var w = state.layout.width / k, h = state.layout.height / k;
        state.view.w = w; state.view.h = h;
        state.view.x = (node.x + NODE_WIDTH / 2) - w / 2;
        state.view.y = (node.y + NODE_HEIGHT / 2) - h / 2;
        applyView();
    }

    function renderSvg() {
        var wrap = $('jg-graph-wrap');
        if (!wrap || !state.layout) return;
        var matchSet = {};
        state.matches.forEach(function (id) { matchSet[id] = true; });
        wrap.innerHTML = svgForLayout(state.layout, state.selectedId, matchSet, false, state.view);
        bindSvgEvents();
        applyView();
    }

    function renderStats() {
        var box = $('jg-stats');
        if (!box || !state.value) return;
        var st;
        try { st = countStats(state.value); } catch (e) { return; }
        var g = state.graph;
        var truncNote = '';
        if (g && g.truncated) {
            truncNote = '<div class="jg-trunc">节点超过 ' + MAX_NODES + ' 个，仅展开到第 ' + g.truncatedDepth +
                ' 层（共截断 ' + g.truncatedCount + ' 个子节点），其余未渲染——请拆分输入或先折叠无关分支。</div>';
        }
        box.innerHTML =
            '<div class="jg-stat"><b>' + st.totalNodes + '</b><span>节点总数</span></div>' +
            '<div class="jg-stat"><b>' + st.maxDepth + '</b><span>最大深度</span></div>' +
            '<div class="jg-stat"><b>' + st.objects + '</b><span>对象数</span></div>' +
            '<div class="jg-stat"><b>' + st.arrays + '</b><span>数组数</span></div>' +
            '<div class="jg-stat"><b>' + st.leaves + '</b><span>叶子数</span></div>' +
            '<div class="jg-stat"><b>' + (g ? g.nodes.length : 0) + '</b><span>已渲染节点</span></div>' +
            truncNote;
        var line = $('jg-statline');
        if (line) line.textContent = '已渲染 ' + (g ? g.nodes.length : 0) + ' 个节点，最大深度 ' + st.maxDepth;
    }

    function showSelected() {
        var box = $('jg-selected');
        var cp = $('jg-copy-path'), cv = $('jg-copy-value');
        if (!box) return;
        if (!state.selectedId || !state.graph) {
            box.innerHTML = '<span class="jg-muted">点击任意节点，这里显示它的 JSON Path 与值。</span>';
            if (cp) cp.disabled = true;
            if (cv) cv.disabled = true;
            return;
        }
        var node = null;
        for (var i = 0; i < state.graph.nodes.length; i++) {
            if (state.graph.nodes[i].id === state.selectedId) { node = state.graph.nodes[i]; break; }
        }
        if (!node) return;
        var valText = (node.type === 'object' || node.type === 'array')
            ? JSON.stringify(node.value) : String(node.value);
        box.innerHTML = '<div><b>路径：</b><code>' + escapeHtml(node.pathStr) + '</code></div>' +
            '<div><b>类型：</b>' + TYPE_LABELS[node.type] + '（' + escapeHtml(node.type) + '）</div>' +
            '<div><b>值：</b><code>' + escapeHtml(shortText(valText, 200)) + '</code></div>';
        if (cp) cp.disabled = false;
        if (cv) cv.disabled = false;
    }

    function renderAll() {
        var inputEl = $('jg-input'), errEl = $('jg-err');
        if (!inputEl) return;
        var raw = inputEl.value;
        try {
            var value = parseJsonInput(raw);
            var graph = buildGraph(value);
            var layout = layoutGraph(graph);
            state.value = value;
            state.graph = graph;
            state.layout = layout;
            state.selectedId = null;
            state.matches = [];
            state.matchIdx = -1;
            state.view = { x: 0, y: 0, w: layout.width, h: layout.height };
            if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
            renderStats();
            renderSvg();
            showSelected();
            var si = $('jg-search-info');
            if (si) si.textContent = '';
            var svgdl = $('jg-svgdl'), png = $('jg-png');
            if (svgdl) svgdl.disabled = false;
            if (png) png.disabled = false;
        } catch (e) {
            /* 非法 JSON：只显示错误，不渲染半截图 */
            state.value = null; state.graph = null; state.layout = null;
            state.selectedId = null; state.matches = []; state.matchIdx = -1;
            var wrap = $('jg-graph-wrap');
            if (wrap) wrap.innerHTML = '<div class="jg-empty">JSON 不合法，修正后重新生成结构图</div>';
            var box = $('jg-stats');
            if (box) box.innerHTML = '<div class="jg-muted">解析失败，暂无统计。</div>';
            if (errEl) { errEl.textContent = e.message || String(e); errEl.style.display = 'block'; }
            showSelected();
            var svgdl2 = $('jg-svgdl'), png2 = $('jg-png');
            if (svgdl2) svgdl2.disabled = true;
            if (png2) png2.disabled = true;
        }
    }

    /* 清空：直接复位画布／统计／搜索，不走 renderAll（空输入会抛错弹提示）。 */
    function resetView() {
        state.value = null; state.graph = null; state.layout = null;
        state.selectedId = null; state.matches = []; state.matchIdx = -1;
        state.view = { x: 0, y: 0, w: 0, h: 0 };
        var wrap = $('jg-graph-wrap');
        if (wrap) wrap.innerHTML = '<div class="jg-empty">生成结构图后，这里会显示节点连线图<br>拖拽空白处平移画布 · 滚轮缩放（0.2–3x）· 点击节点查看路径与值 · 点节点右上角 ＋／－ 折叠展开</div>';
        var box = $('jg-stats');
        if (box) box.innerHTML = '<div class="jg-muted">生成结构图后，这里显示节点总数、最大深度与各类节点数。</div>';
        var errEl = $('jg-err');
        if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
        var q = $('jg-search');
        if (q) q.value = '';
        var si = $('jg-search-info');
        if (si) si.textContent = '';
        showSelected();
        var svgdl = $('jg-svgdl'), png = $('jg-png');
        if (svgdl) svgdl.disabled = true;
        if (png) png.disabled = true;
    }

    function bindSvgEvents() {
        var wrap = $('jg-graph-wrap');
        var svg = $('jg-svg');
        if (!wrap || !svg) return;
        svg.addEventListener('click', function (ev) {
            var t = ev.target;
            var col = t.closest ? t.closest('[data-collapse]') : null;
            if (col) {
                ev.stopPropagation();
                var cid = col.getAttribute('data-collapse');
                for (var i = 0; i < state.graph.nodes.length; i++) {
                    if (state.graph.nodes[i].id === cid) {
                        state.graph.nodes[i].collapsed = !state.graph.nodes[i].collapsed;
                        break;
                    }
                }
                state.layout = layoutGraph(state.graph);
                state.view = { x: 0, y: 0, w: state.layout.width, h: state.layout.height };
                renderSvg();
                renderStats();
                return;
            }
            var g = t.closest ? t.closest('[data-id]') : null;
            if (g) {
                state.selectedId = g.getAttribute('data-id');
                renderSvg();
                showSelected();
            }
        });
        svg.addEventListener('wheel', function (ev) {
            ev.preventDefault();
            var rect = wrap.getBoundingClientRect();
            zoomAt(ev.clientX - rect.left, ev.clientY - rect.top, ev.deltaY < 0 ? 1.15 : 1 / 1.15);
        }, { passive: false });
        svg.addEventListener('pointerdown', function (ev) {
            if (ev.target.closest && ev.target.closest('[data-id]')) return;
            state.dragging = { x: ev.clientX, y: ev.clientY, vx: state.view.x, vy: state.view.y };
            svg.setPointerCapture(ev.pointerId);
        });
        svg.addEventListener('pointermove', function (ev) {
            if (!state.dragging) return;
            var rect = wrap.getBoundingClientRect();
            state.view.x = state.dragging.vx - (ev.clientX - state.dragging.x) * (state.view.w / rect.width);
            state.view.y = state.dragging.vy - (ev.clientY - state.dragging.y) * (state.view.h / rect.height);
            applyView();
        });
        svg.addEventListener('pointerup', function () { state.dragging = null; });
        svg.addEventListener('pointercancel', function () { state.dragging = null; });
    }

    function doSearch(centerFirst) {
        var qEl = $('jg-search'), info = $('jg-search-info');
        if (!qEl || !state.graph) return;
        var q = qEl.value;
        if (!q.trim()) {
            state.matches = []; state.matchIdx = -1;
            if (info) info.textContent = '';
            renderSvg();
            return;
        }
        try {
            state.matches = searchNodes(state.graph, q);
        } catch (e) {
            state.matches = [];
        }
        state.matchIdx = state.matches.length > 0 ? 0 : -1;
        if (info) {
            info.textContent = state.matches.length === 0
                ? '未命中任何节点'
                : '命中 ' + state.matches.length + ' 个节点' + (state.matches.length > 0 ? '（第 1 个已定位）' : '');
        }
        renderSvg();
        if (centerFirst && state.matches.length > 0) {
            var node = null;
            for (var i = 0; i < state.layout.nodes.length; i++) {
                if (state.layout.nodes[i].id === state.matches[0]) { node = state.layout.nodes[i]; break; }
            }
            if (node) centerNode(node);
        }
    }

    function locateNext() {
        if (state.matches.length === 0 || !state.layout) return;
        state.matchIdx = (state.matchIdx + 1) % state.matches.length;
        var node = null;
        for (var i = 0; i < state.layout.nodes.length; i++) {
            if (state.layout.nodes[i].id === state.matches[state.matchIdx]) { node = state.layout.nodes[i]; break; }
        }
        if (node) centerNode(node);
        var info = $('jg-search-info');
        if (info) info.textContent = '命中 ' + state.matches.length + ' 个节点（第 ' + (state.matchIdx + 1) + ' 个）';
    }

    function exportSVG() {
        if (!state.layout) { toast('暂无可导出的结构图'); return; }
        var svgHtml = svgForLayout(state.layout, null, {}, true);
        var blob = new Blob([svgHtml], { type: 'image/svg+xml;charset=utf-8' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'json-graph.svg';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 500);
        toast('已下载 json-graph.svg');
    }

    function exportPNG() {
        if (!state.layout) { toast('暂无可导出的结构图'); return; }
        var svgHtml = svgForLayout(state.layout, null, {}, true);
        var blob = new Blob([svgHtml], { type: 'image/svg+xml;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var img = new Image();
        img.onload = function () {
            var scale = 2;
            var canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(state.layout.width * scale));
            canvas.height = Math.max(1, Math.round(state.layout.height * scale));
            var ctx = canvas.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            URL.revokeObjectURL(url);
            canvas.toBlob(function (b) {
                if (!b) { toast('PNG 导出失败：浏览器不支持 canvas 导出'); return; }
                var a = document.createElement('a');
                a.href = URL.createObjectURL(b);
                a.download = 'json-graph.png';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(function () { URL.revokeObjectURL(a.href); }, 500);
                toast('已下载 json-graph.png（2x）');
            }, 'image/png');
        };
        img.onerror = function () { URL.revokeObjectURL(url); toast('PNG 导出失败：SVG 无法转为图片'); };
        img.src = url;
    }

    function init() {
        var inputEl = $('jg-input');
        if (!inputEl) return;
        inputEl.addEventListener('input', function () {
            var c = $('jg-count');
            if (c) c.textContent = inputEl.value.length + ' / ' + MAX_INPUT + ' 字符';
        });
        var renderBtn = $('jg-render-btn');
        if (renderBtn) renderBtn.addEventListener('click', renderAll);
        var clearBtn = $('jg-clear');
        if (clearBtn) clearBtn.addEventListener('click', function () {
            inputEl.value = '';
            var c = $('jg-count');
            if (c) c.textContent = '0 / ' + MAX_INPUT + ' 字符';
            resetView();
        });
        var presetBox = $('jg-presets');
        if (presetBox) {
            SAMPLES.forEach(function (s) {
                var b = document.createElement('button');
                b.type = 'button';
                b.className = 'jg-preset-btn';
                b.textContent = s.name;
                b.title = s.desc;
                b.addEventListener('click', function () {
                    inputEl.value = s.json;
                    var c = $('jg-count');
                    if (c) c.textContent = inputEl.value.length + ' / ' + MAX_INPUT + ' 字符';
                    renderAll();
                });
                presetBox.appendChild(b);
            });
        }
        var zi = $('jg-zoom-in'), zo = $('jg-zoom-out'), zr = $('jg-zoom-reset');
        if (zi) zi.addEventListener('click', function () {
            var wrap = $('jg-graph-wrap');
            var r = wrap.getBoundingClientRect();
            zoomAt(r.width / 2, r.height / 2, 1.25);
        });
        if (zo) zo.addEventListener('click', function () {
            var wrap = $('jg-graph-wrap');
            var r = wrap.getBoundingClientRect();
            zoomAt(r.width / 2, r.height / 2, 1 / 1.25);
        });
        if (zr) zr.addEventListener('click', function () {
            if (!state.layout) return;
            state.view = { x: 0, y: 0, w: state.layout.width, h: state.layout.height };
            applyView();
        });
        var searchEl = $('jg-search');
        if (searchEl) {
            searchEl.addEventListener('input', function () { doSearch(false); });
            searchEl.addEventListener('keydown', function (ev) {
                if (ev.key === 'Enter') { ev.preventDefault(); doSearch(true); }
            });
        }
        var sb = $('jg-search-btn');
        if (sb) sb.addEventListener('click', function () { doSearch(true); });
        var ln = $('jg-locate-next');
        if (ln) ln.addEventListener('click', locateNext);
        var cp = $('jg-copy-path');
        if (cp) cp.addEventListener('click', function () {
            if (!state.selectedId) return;
            copyText(state.selectedId, '已复制 JSON Path：' + state.selectedId);
        });
        var cv = $('jg-copy-value');
        if (cv) cv.addEventListener('click', function () {
            if (!state.selectedId || !state.graph) return;
            var node = null;
            for (var i = 0; i < state.graph.nodes.length; i++) {
                if (state.graph.nodes[i].id === state.selectedId) { node = state.graph.nodes[i]; break; }
            }
            if (!node) return;
            var text = (node.type === 'object' || node.type === 'array')
                ? JSON.stringify(node.value) : String(node.value);
            copyText(text, '已复制节点值');
        });
        var svgdl = $('jg-svgdl');
        if (svgdl) svgdl.addEventListener('click', exportSVG);
        var png = $('jg-png');
        if (png) png.addEventListener('click', exportPNG);
        if (!inputEl.value) inputEl.value = SAMPLES[0].json;
        renderAll();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}
})();
