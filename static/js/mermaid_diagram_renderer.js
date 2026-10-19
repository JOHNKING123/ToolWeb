/* Mermaid 图表渲染与导出器（纯前端）
 * 左侧 textarea 输入 → 防抖 500ms → mermaid.js 渲染右侧 SVG 预览；
 * mermaid.js 经 cdnjs 懒加载（版本号 10.9.3 锁定），除此之外无任何网络请求、无后端、无上传。
 */
(function () {
    'use strict';

    var MERMAID_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/mermaid/10.9.3/mermaid.min.js';

    var $ = function (id) { return document.getElementById(id); };
    var codeEl = $('mm-code'), previewEl = $('mm-preview'), errEl = $('mm-err'),
        cdnTipEl = $('mm-cdn-tip'), statEl = $('mm-statline'), copyTipEl = $('mm-copytip');

    var state = { svg: '', svgId: '', renderToken: 0, cdnLoading: null, theme: 'default' };

    /* ---------- 6 套模板 ---------- */
    var TEMPLATES = {
        flowchart: 'graph TD\n' +
            '    A[开始] --> B{资料齐全?}\n' +
            '    B -->|是| C[提交审核]\n' +
            '    B -->|否| D[补充材料]\n' +
            '    D --> B\n' +
            '    C --> E[审批通过]\n' +
            '    E --> F[结束]',
        sequence: 'sequenceDiagram\n' +
            '    participant 用户\n' +
            '    participant 前端\n' +
            '    participant 后端\n' +
            '    participant 数据库\n' +
            '    用户->>前端: 提交表单（点击提交）\n' +
            '    前端->>后端: POST /api/submit\n' +
            '    后端->>数据库: INSERT 记录\n' +
            '    数据库-->>后端: 写入成功\n' +
            '    后端-->>前端: 200 OK（中文注释）\n' +
            '    前端-->>用户: 显示成功提示',
        gantt: 'gantt\n' +
            '    title 项目排期（中文任务名示例）\n' +
            '    dateFormat YYYY-MM-DD\n' +
            '    section 需求阶段\n' +
            '    需求调研       :a1, 2026-10-20, 5d\n' +
            '    原型设计       :a2, after a1, 4d\n' +
            '    section 开发阶段\n' +
            '    后端接口开发   :b1, after a2, 8d\n' +
            '    前端页面开发   :crit, b2, after a2, 8d\n' +
            '    section 上线阶段\n' +
            '    联调测试       :c1, after b1 b2, 3d\n' +
            '    灰度发布       :milestone, c2, after c1, 0d',
        class: 'classDiagram\n' +
            '    class 订单 {\n' +
            '        +String 订单号\n' +
            '        +Date 下单时间\n' +
            '        +submit() 提交订单\n' +
            '        +cancel() 取消订单\n' +
            '    }\n' +
            '    class 商品 {\n' +
            '        +String 名称\n' +
            '        +Decimal 价格\n' +
            '    }\n' +
            '    class 用户 {\n' +
            '        +String 姓名\n' +
            '        +login() 登录\n' +
            '    }\n' +
            '    用户 "1" --> "0..*" 订单 : 下单\n' +
            '    订单 "1" --> "1..*" 商品 : 包含',
        er: '%% ER 图：mermaid 语法规定的实体名/属性名须用英文标识符（流程图/时序图/甘特图/类图/状态图可直接写中文）\n' +
            'erDiagram\n' +
            '    USER ||--o{ ORDERS : places\n' +
            '    ORDERS ||--|{ ORDER_ITEM : contains\n' +
            '    PRODUCT ||--o{ ORDER_ITEM : purchased\n' +
            '    USER {\n' +
            '        int userId PK\n' +
            '        string name\n' +
            '        string phone\n' +
            '    }\n' +
            '    ORDERS {\n' +
            '        int orderId PK\n' +
            '        date orderDate\n' +
            '        decimal totalAmount\n' +
            '    }\n' +
            '    PRODUCT {\n' +
            '        int productId PK\n' +
            '        string name\n' +
            '        decimal price\n' +
            '    }',
        state: 'stateDiagram-v2\n' +
            '    [*] --> 待审核\n' +
            '    待审核 --> 审核通过 : 资料合规\n' +
            '    待审核 --> 驳回 : 资料缺失\n' +
            '    驳回 --> 待审核 : 补充后重新提交\n' +
            '    审核通过 --> 已上线\n' +
            '    已上线 --> [*]'
    };

    /* ---------- 中文错误提示 ---------- */
    function friendlyError(err) {
        var msg = (err && (err.str || err.message || String(err))) || '';
        var line = '';
        var m = msg.match(/[Ll]ine\s+(\d+)/) || msg.match(/行\s*(\d+)/);
        if (m) line = '（出错位置：第 ' + m[1] + ' 行附近）';
        var zh = msg;
        zh = zh.replace(/Parse error on line \d+/i, '语法解析失败');
        zh = zh.replace(/Expecting .* got /i, '应为').replace(/got '([^']*)'/i, '实际读到「$1」');
        zh = zh.replace(/Expecting/i, '期望');
        zh = zh.replace(/Syntax error/i, '语法错误');
        zh = zh.replace(/Diagram not found/i, '未知的图表类型，请确认首行声明正确（如 graph TD、sequenceDiagram、gantt 等）');
        zh = zh.replace(/Too many arguments/i, '参数过多');
        zh = zh.replace(/Expecting '([^']+)'/i, '期望「$1」');
        return '⚠ Mermaid 代码有语法问题，暂无法渲染' + line + '：\n' +
            (zh.length > 500 ? zh.slice(0, 500) + '…' : zh) +
            '\n\n对照 ① 区模板的写法逐行检查，或参考上方「使用说明」的语法速查。';
    }

    /* ---------- mermaid.js 懒加载 ---------- */
    function loadMermaid() {
        if (window.mermaid) return Promise.resolve(window.mermaid);
        if (state.cdnLoading) return state.cdnLoading;
        state.cdnLoading = new Promise(function (resolve, reject) {
            var s = document.createElement('script');
            s.src = MERMAID_CDN;
            s.async = true;
            s.onload = function () {
                if (window.mermaid) resolve(window.mermaid);
                else reject(new Error('脚本已加载但 mermaid 对象不可用'));
            };
            s.onerror = function () { reject(new Error('CDN 加载失败')); };
            document.head.appendChild(s);
            setTimeout(function () {
                if (!window.mermaid) reject(new Error('CDN 加载超时'));
            }, 20000);
        });
        return state.cdnLoading;
    }

    function initMermaid() {
        window.mermaid.initialize({
            startOnLoad: false,
            theme: state.theme,
            securityLevel: 'loose',
            flowchart: { useMaxWidth: true },
            sequence: { useMaxWidth: true },
            fontFamily: '"PingFang SC","Microsoft YaHei","Noto Sans SC",system-ui,sans-serif'
        });
    }

    /* ---------- 渲染 ---------- */
    function setExportEnabled(enabled) {
        $('mm-png').disabled = !enabled;
        $('mm-svgdl').disabled = !enabled;
        $('mm-svgcopy').disabled = !enabled;
    }

    function renderNow() {
        var code = codeEl.value.trim();
        errEl.style.display = 'none';
        cdnTipEl.style.display = 'none';
        if (!code) {
            previewEl.innerHTML = '<div class="mm-empty">代码输入或模板插入后，这里会显示渲染结果</div>';
            state.svg = '';
            setExportEnabled(false);
            statEl.textContent = '';
            return;
        }
        var token = ++state.renderToken;
        loadMermaid().then(function () {
            if (token !== state.renderToken) return;
            initMermaid();
            var rid = 'mm-svg-' + token;
            return window.mermaid.render(rid, code).then(function (res) {
                if (token !== state.renderToken) return;
                state.svg = res.svg;
                previewEl.innerHTML = res.svg;
                setExportEnabled(true);
                statEl.textContent = '渲染成功（主题：' + themeName(state.theme) + '）';
            }).catch(function (err) {
                if (token !== state.renderToken) return;
                state.svg = '';
                previewEl.innerHTML = '<div class="mm-empty">渲染失败，请查看下方错误提示</div>';
                errEl.textContent = friendlyError(err);
                errEl.style.display = 'block';
                setExportEnabled(false);
                statEl.textContent = '';
            });
        }).catch(function () {
            if (token !== state.renderToken) return;
            state.svg = '';
            setExportEnabled(false);
            previewEl.innerHTML = '<div class="mm-empty">渲染引擎尚未加载</div>';
            cdnTipEl.textContent = '⚠ 渲染引擎（Mermaid.js）未能从 CDN 加载成功（当前网络可能打不开 cdnjs），暂时无法渲染。你的代码还完整保留在左侧输入框中，请检查网络后重试，或稍后再来。不用刷新页面。';
            cdnTipEl.style.display = 'block';
            statEl.textContent = '';
        });
    }

    function themeName(t) {
        return { default: '默认', neutral: '中性', dark: '深色', forest: '森林' }[t] || t;
    }

    /* ---------- 防抖 ---------- */
    var debounceTimer = null;
    codeEl.addEventListener('input', function () {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(renderNow, 500);
    });

    /* ---------- 模板按钮 ---------- */
    var tplBtns = document.querySelectorAll('#mm-templates .mm-tpl-btn[data-tpl]');
    Array.prototype.forEach.call(tplBtns, function (btn) {
        btn.addEventListener('click', function () {
            codeEl.value = TEMPLATES[btn.getAttribute('data-tpl')];
            renderNow();
        });
    });
    $('mm-clear').addEventListener('click', function () {
        codeEl.value = '';
        renderNow();
        codeEl.focus();
    });

    /* ---------- 主题切换 ---------- */
    $('mm-theme').addEventListener('change', function () {
        state.theme = this.value;
        if (codeEl.value.trim()) renderNow();
    });

    /* ---------- 下载工具 ---------- */
    function downloadBlob(blob, filename) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(function () {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 2000);
    }

    function ts() {
        var d = new Date();
        function p(n) { return (n < 10 ? '0' : '') + n; }
        return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
    }

    $('mm-svgdl').addEventListener('click', function () {
        if (!state.svg) return;
        var svg = ensureSvgHeader(state.svg);
        downloadBlob(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), 'mermaid-' + ts() + '.svg');
    });

    function ensureSvgHeader(svg) {
        var out = svg;
        if (out.indexOf('xmlns=') < 0) out = out.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
        return out;
    }

    /* ---------- SVG → PNG（canvas 转码） ---------- */
    function svgSize(svg) {
        var w = svg.match(/width="([\d.]+)"/), h = svg.match(/height="([\d.]+)"/);
        if (w && h) return { w: parseFloat(w[1]), h: parseFloat(h[1]) };
        var vb = svg.match(/viewBox="[\d.\s-]+([\d.]+)\s+([\d.]+)"/);
        if (vb) return { w: parseFloat(vb[1]), h: parseFloat(vb[2]) };
        return { w: 1200, h: 800 };
    }

    $('mm-png').addEventListener('click', function () {
        if (!state.svg) return;
        var btn = this;
        btn.disabled = true;
        var scale = parseInt($('mm-scale').value, 10) || 2;
        var bgMode = $('mm-bg').value;
        var svg = ensureSvgHeader(state.svg);
        var size = svgSize(svg);
        var cw = Math.round(size.w * scale), ch = Math.round(size.h * scale);
        var img = new Image();
        var svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
        var url = URL.createObjectURL(svgBlob);
        img.onload = function () {
            try {
                var canvas = document.createElement('canvas');
                canvas.width = cw;
                canvas.height = ch;
                var ctx = canvas.getContext('2d');
                if (bgMode === 'white') {
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, cw, ch);
                }
                ctx.drawImage(img, 0, 0, cw, ch);
                canvas.toBlob(function (blob) {
                    URL.revokeObjectURL(url);
                    btn.disabled = false;
                    if (blob) {
                        downloadBlob(blob, 'mermaid-' + ts() + '-' + scale + 'x.png');
                    } else {
                        tip('PNG 转码失败：浏览器无法生成图片，请重试。');
                    }
                }, 'image/png');
            } catch (e) {
                URL.revokeObjectURL(url);
                btn.disabled = false;
                tip('PNG 转码失败：' + (e && e.message ? e.message : '未知错误') + '，请重试。');
            }
        };
        img.onerror = function () {
            URL.revokeObjectURL(url);
            btn.disabled = false;
            tip('PNG 转码失败：SVG 图像解码失败，请先确认预览正常后再试。');
        };
        img.src = url;
    });

    /* ---------- 复制 ---------- */
    function copyText(text, okMsg) {
        function done(ok) {
            tip(ok ? okMsg : '复制失败：浏览器未授权剪贴板，请手动选中复制。');
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(function () { done(true); }, function () {
                fallbackCopy(text, done);
            });
        } else {
            fallbackCopy(text, done);
        }
    }

    function fallbackCopy(text, done) {
        try {
            var ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            var ok = document.execCommand('copy');
            document.body.removeChild(ta);
            done(ok);
        } catch (e) { done(false); }
    }

    function tip(msg) {
        copyTipEl.textContent = msg;
        copyTipEl.style.display = 'block';
        clearTimeout(tip._t);
        tip._t = setTimeout(function () { copyTipEl.style.display = 'none'; }, 4000);
    }

    $('mm-svgcopy').addEventListener('click', function () {
        if (!state.svg) return;
        copyText(ensureSvgHeader(state.svg), 'SVG 代码已复制到剪贴板，可直接粘贴保存为 .svg 文件。');
    });

    $('mm-srccopy').addEventListener('click', function () {
        var code = codeEl.value.trim();
        if (!code) { tip('左侧编辑框为空，先输入或插入模板再复制。'); return; }
        copyText(code, 'Mermaid 源码已复制到剪贴板。');
    });

    /* ---------- 首次渲染 ---------- */
    setExportEnabled(false);
})();
