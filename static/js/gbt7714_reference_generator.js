/* GB/T 7714-2015 参考文献格式生成器 — 纯前端，数据不出浏览器 */
(function () {
    'use strict';

    /* ---------- 文献类型定义 ---------- */
    var TYPES = [
        { key: 'J',      name: '期刊文章',   mark: '[J]',     desc: '学术期刊论文' },
        { key: 'M',      name: '专著',       mark: '[M]',     desc: '图书 / 教材' },
        { key: 'D',      name: '学位论文',   mark: '[D]',     desc: '硕士 / 博士论文' },
        { key: 'C',      name: '论文集析出', mark: '[C]',     desc: '会议 / 论文集中的文章' },
        { key: 'N',      name: '报纸文章',   mark: '[N]',     desc: '报纸上的文章' },
        { key: 'S',      name: '标准',       mark: '[S]',     desc: '国家 / 行业标准' },
        { key: 'R',      name: '报告',       mark: '[R]',     desc: '研究报告' },
        { key: 'P',      name: '专利',       mark: '[P]',     desc: '专利文献' },
        { key: 'EB/OL',  name: '电子文献',   mark: '[EB/OL]', desc: '网页 / 在线资源' },
        { key: 'A',      name: '档案',       mark: '[A]',     desc: '档案资料' }
    ];

    /* ---------- 字段定义：key → {label, placeholder, hint} ---------- */
    var FIELD_DEFS = {
        authors:    { label: '作者',           placeholder: '多人用逗号或分号分隔，如：张三, 李四, 王五', hint: '≤3 人全列；>3 人自动取前 3 + 等/et al；无作者可留空，条目以题名开头' },
        title:      { label: '题名',           placeholder: '如：深度学习在图像识别中的应用' },
        journal:    { label: '期刊名',         placeholder: '如：计算机学报' },
        year:       { label: '出版年',         placeholder: '如：2023' },
        volume:     { label: '卷',             placeholder: '如：46' },
        issue:      { label: '期',             placeholder: '如：5' },
        startPage:  { label: '起始页',         placeholder: '如：1234' },
        endPage:    { label: '终止页',         placeholder: '如：1245' },
        edition:    { label: '版次',           placeholder: '如：4版（第 1 版可省略）' },
        place:      { label: '出版地',         placeholder: '如：北京' },
        publisher:  { label: '出版社',         placeholder: '如：清华大学出版社' },
        org:        { label: '学位授予单位',   placeholder: '如：清华大学' },
        collection: { label: '论文集名 / 会议名', placeholder: '如：第20届全国机器翻译研讨会论文集' },
        newspaper:  { label: '报纸名',         placeholder: '如：人民日报' },
        newsdate:   { label: '出版日期',       placeholder: '如：2024-05-01' },
        page:       { label: '版次',           placeholder: '如：06' },
        standardOrg:{ label: '起草单位',       placeholder: '如：全国信息与文献标准化技术委员会' },
        standardNo: { label: '标准号',         placeholder: '如：GB/T 7714-2015' },
        reportOrg:  { label: '出版单位',       placeholder: '如：中国互联网络信息中心' },
        patno:      { label: '专利号',         placeholder: '如：CN202310000001.1' },
        pubdate:    { label: '公告日期',       placeholder: '如：2024-03-15' },
        doi:        { label: 'DOI',            placeholder: '如：10.1000/xyz123（自动补全 https://doi.org/）' },
        url:        { label: 'URL',            placeholder: '如：https://example.com/article' },
        updateDate: { label: '更新日期',       placeholder: '如：2024-01-01（可选）' },
        accessDate: { label: '引用日期',       placeholder: '如：2026-10-17' },
        archiveloc: { label: '收藏地',         placeholder: '如：北京' },
        archiveNo:  { label: '档号',           placeholder: '如：J002-001-00001' }
    };

    /* ---------- 每种类型的字段顺序 + 必填 ---------- */
    var TYPE_FIELDS = {
        'J':      [['authors', 0], ['title', 1], ['journal', 1], ['year', 1], ['volume', 0], ['issue', 0], ['startPage', 0], ['endPage', 0], ['doi', 0], ['url', 0]],
        'M':      [['authors', 0], ['title', 1], ['edition', 0], ['place', 0], ['publisher', 1], ['year', 1], ['doi', 0]],
        'D':      [['authors', 0], ['title', 1], ['place', 0], ['org', 1], ['year', 1]],
        'C':      [['authors', 0], ['title', 1], ['collection', 1], ['place', 0], ['publisher', 0], ['year', 1], ['startPage', 0], ['endPage', 0]],
        'N':      [['authors', 0], ['title', 1], ['newspaper', 1], ['newsdate', 1], ['page', 0]],
        'S':      [['standardOrg', 0], ['title', 1], ['standardNo', 0], ['place', 0], ['publisher', 0], ['year', 1]],
        'R':      [['authors', 0], ['title', 1], ['place', 0], ['reportOrg', 1], ['year', 1]],
        'P':      [['authors', 0], ['title', 1], ['patno', 1], ['pubdate', 1]],
        'EB/OL':  [['authors', 0], ['title', 1], ['url', 1], ['updateDate', 0], ['accessDate', 1]],
        'A':      [['authors', 0], ['title', 1], ['archiveloc', 1], ['archiveNo', 1]]
    };

    var FIELD_LABELS_REQUIRED = {
        'S':  { title: '标准名称' },
        'P':  { authors: '专利权人' },
        'A':  { authors: '责任者' },
        'EB/OL': { title: '电子文献题名' }
    };

    /* ---------- 每类一条标准样例 ---------- */
    function todayStr() {
        var d = new Date();
        function p(n) { return (n < 10 ? '0' : '') + n; }
        return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
    }
    var SAMPLES = {
        'J':      { authors: '张三, 李四, 王五, 赵六', title: '深度学习在图像识别中的应用', journal: '计算机学报', year: '2023', volume: '46', issue: '5', startPage: '1234', endPage: '1245' },
        'M':      { authors: '谭浩强', title: 'C程序设计', edition: '4版', place: '北京', publisher: '清华大学出版社', year: '2010' },
        'D':      { authors: '张明', title: '基于深度学习的文本分类研究', place: '北京', org: '清华大学', year: '2022' },
        'C':      { authors: '李雷, 韩梅梅', title: '基于Transformer的机器翻译研究', collection: '第20届全国机器翻译研讨会论文集', place: '北京', publisher: '科学出版社', year: '2024', startPage: '88', endPage: '95' },
        'N':      { authors: '王芳', title: '人工智能赋能千行百业', newspaper: '人民日报', newsdate: '2024-05-01', page: '06' },
        'S':      { standardOrg: '全国信息与文献标准化技术委员会', title: '信息与文献 参考文献著录规则', standardNo: 'GB/T 7714-2015', place: '北京', publisher: '中国标准出版社', year: '2015' },
        'R':      { authors: '中国互联网络信息中心', title: '第52次中国互联网络发展状况统计报告', place: '北京', reportOrg: '中国互联网络信息中心', year: '2023' },
        'P':      { authors: '张三', title: '一种图像识别方法', patno: 'CN202310000001.1', pubdate: '2024-03-15' },
        'EB/OL':  { authors: '中国互联网络信息中心', title: '中国互联网络发展状况统计报告', url: 'https://www.cnnic.cn/', updateDate: '', accessDate: todayStr() },
        'A':      { authors: '北京市档案馆', title: '清代北京城市建设档案', archiveloc: '北京', archiveNo: 'J002-001-00001' }
    };

    /* ================= 纯函数：作者 / 模板引擎（可单元测试） ================= */

    function splitAuthors(str) {
        if (!str) return [];
        return str.split(/[,，;；、]/).map(function (s) { return s.trim(); }).filter(function (s) { return s.length > 0; });
    }

    function hasCJK(s) { return /[\u4e00-\u9fff]/.test(s); }

    // 文末作者串（顺序编码制）：≤3 全列；>3 取前3 + 等/et al；末尾带句点
    function formatAuthors(authors) {
        if (!authors || authors.length === 0) return '';
        var chinese = hasCJK(authors[0]);
        var head = authors.length <= 3 ? authors : authors.slice(0, 3);
        var s = head.join(', ');
        if (authors.length > 3) s += chinese ? ', 等' : ', et al';
        return s + '. ';
    }

    // 著者-出版年制文末作者串：无末尾句点（后面跟 ", 年."）
    function formatAuthorsAY(authors) {
        if (!authors || authors.length === 0) return '';
        var chinese = hasCJK(authors[0]);
        var head = authors.length <= 3 ? authors : authors.slice(0, 3);
        var s = head.join(', ');
        if (authors.length > 3) s += chinese ? ', 等' : ', et al';
        return s;
    }

    // 文内引用：(张三, 2023) / (张三等, 2023) / (Smith, 2023) / (Smith et al., 2023)
    function inTextCite(authors, year) {
        var y = year || '年份';
        if (!authors || authors.length === 0) return '(佚名, ' + y + ')';
        var chinese = hasCJK(authors[0]);
        var a;
        if (authors.length === 1) a = authors[0];
        else if (authors.length <= 3) a = chinese ? authors.join('、') : authors.join(', ');
        else a = chinese ? authors[0] + '等' : authors[0].split(' ')[0] + ' et al.';
        return '(' + a + ', ' + y + ')';
    }

    function normalizeDoi(doi) {
        if (!doi) return '';
        var d = doi.trim();
        if (!d) return '';
        if (/^https?:\/\//i.test(d)) return d;
        d = d.replace(/^doi:\s*/i, '');
        return 'https://doi.org/' + d;
    }

    function pagesOf(d) {
        var s = (d.startPage || '').trim(), e = (d.endPage || '').trim();
        if (s && e) return s + '-' + e;
        return s || e || '';
    }

    function yearOf(d) { return (d.year || d.newsdate || d.pubdate || '').trim(); }

    // 条目主体（不含序号/作者年前缀）。mode: 'seq' | 'ay'
    function buildBody(type, d, mode) {
        var isAY = mode === 'ay';
        var authorPart = isAY ? '' : formatAuthors(splitAuthors(d.authors));
        var noAuthor = splitAuthors(d.authors).length === 0;
        var title = (d.title || '').trim();
        var year = yearOf(d);
        var out = '';

        function ayPrefix() {
            if (noAuthor) return title + ', ' + year + '. ';
            return formatAuthorsAY(splitAuthors(d.authors)) + ', ' + year + '. ';
        }

        switch (type) {
            case 'J': {
                var vol = (d.volume || '').trim();
                var iss = (d.issue || '').trim();
                var pg = pagesOf(d);
                out = title + '[J]. ' + (d.journal || '').trim();
                if (!isAY) out += ', ' + (d.year || '').trim();
                if (vol) out += ', ' + vol + (iss ? '(' + iss + ')' : '');
                if (pg) out += ': ' + pg;
                out += '.';
                if (d.doi && d.doi.trim()) out += ' DOI: ' + normalizeDoi(d.doi) + '.';
                if (d.url && d.url.trim()) out += ' URL: ' + d.url.trim() + '.';
                break;
            }
            case 'M': {
                out = title + '[M]. ';
                if (d.edition && d.edition.trim()) out += d.edition.trim() + '. ';
                if (d.place && d.place.trim()) out += d.place.trim() + ': ';
                out += (d.publisher || '').trim() + (isAY ? '.' : ', ' + (d.year || '').trim() + '.');
                if (d.doi && d.doi.trim()) out += ' DOI: ' + normalizeDoi(d.doi) + '.';
                break;
            }
            case 'D': {
                out = title + '[D]. ';
                if (d.place && d.place.trim()) out += d.place.trim() + ': ';
                out += (d.org || '').trim() + (isAY ? '.' : ', ' + (d.year || '').trim() + '.');
                break;
            }
            case 'C': {
                var pgc = pagesOf(d);
                out = title + '[C]//' + (d.collection || '').trim() + '. ';
                if (d.place && d.place.trim()) out += d.place.trim() + ': ';
                out += (d.publisher || '').trim();
                if (d.publisher && d.publisher.trim() && !isAY) out += ', ';
                if (!isAY) out += (d.year || '').trim();
                if (pgc) out += ': ' + pgc;
                out += '.';
                break;
            }
            case 'N': {
                out = title + '[N]. ' + (d.newspaper || '').trim();
                if (!isAY) out += ', ' + (d.newsdate || '').trim();
                if (d.page && d.page.trim()) out += '(' + d.page.trim() + ')';
                out += '.';
                break;
            }
            case 'S': {
                var orgA = splitAuthors(d.standardOrg);
                out = title + (d.standardNo && d.standardNo.trim() ? ': ' + d.standardNo.trim() : '') + '[S]. ';
                if (d.place && d.place.trim()) out += d.place.trim() + ': ';
                out += (d.publisher || '').trim();
                if (d.publisher && d.publisher.trim() && !isAY) out += ', ';
                if (!isAY) out += (d.year || '').trim();
                out += '.';
                if (!isAY) authorPart = formatAuthors(orgA);
                else if (orgA.length) return formatAuthorsAY(orgA) + ', ' + year + '. ' + out;
                else return title + ', ' + year + '. ' + out;
                break;
            }
            case 'R': {
                out = title + '[R]. ';
                if (d.place && d.place.trim()) out += d.place.trim() + ': ';
                out += (d.reportOrg || '').trim() + (isAY ? '.' : ', ' + (d.year || '').trim() + '.');
                break;
            }
            case 'P': {
                out = title + '[P]. ' + (d.patno || '').trim() + (isAY ? '.' : ', ' + (d.pubdate || '').trim() + '.');
                break;
            }
            case 'EB/OL': {
                var upd = (d.updateDate || '').trim();
                out = title + '[EB/OL]. ' + (upd ? '(' + upd + ')' : '') + '[' + (d.accessDate || '').trim() + ']. ' + (d.url || '').trim() + '.';
                break;
            }
            case 'A': {
                out = title + '[A]. ' + (d.archiveloc || '').trim() + ': ' + (d.archiveNo || '').trim() + '.';
                break;
            }
            default:
                out = title + '.';
        }

        if (isAY) return ayPrefix() + out;
        return authorPart + out;
    }

    // 排序键：著者-出版年制用。返回 {chinese: bool, key: string}
    function sortKeyOf(entry) {
        var authors = splitAuthors(entry.type === 'S' ? entry.data.standardOrg : entry.data.authors);
        var k = authors.length ? authors[0] : (entry.data.title || '').trim();
        return { chinese: hasCJK(k), key: k };
    }

    function compareAY(a, b) {
        var ka = sortKeyOf(a), kb = sortKeyOf(b);
        if (ka.chinese !== kb.chinese) return ka.chinese ? -1 : 1; // 中文在前
        try {
            return ka.key.localeCompare(kb.key, ka.chinese ? 'zh' : 'en');
        } catch (e) {
            return ka.key < kb.key ? -1 : ka.key > kb.key ? 1 : 0;
        }
    }

    /* ================= UI 逻辑 ================= */
    var entries = [];
    var mode = 'seq'; // 'seq' 顺序编码制 | 'ay' 著者-出版年制
    var curType = 'J';
    var uid = 0;

    function $(id) { return document.getElementById(id); }

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function showErr(msg) {
        var el = $('gbt-err');
        el.textContent = msg;
        el.style.display = msg ? 'block' : 'none';
    }

    function showTip(msg) {
        var el = $('gbt-tip');
        el.textContent = msg;
        el.style.display = msg ? 'block' : 'none';
    }

    function typeDef(key) {
        for (var i = 0; i < TYPES.length; i++) if (TYPES[i].key === key) return TYPES[i];
        return TYPES[0];
    }

    function renderTypeCards() {
        var grid = $('gbt-type-grid');
        grid.innerHTML = '';
        TYPES.forEach(function (t) {
            var lab = document.createElement('label');
            lab.className = 'gbt-type-card' + (t.key === curType ? ' active' : '');
            lab.innerHTML = '<input type="radio" name="gbt-type" value="' + esc(t.key) + '"' +
                (t.key === curType ? ' checked' : '') + '>' +
                '<span class="gbt-type-mark">' + esc(t.mark) + '</span>' +
                '<span class="gbt-type-name">' + esc(t.name) + '</span>' +
                '<span class="gbt-type-desc">' + esc(t.desc) + '</span>';
            lab.querySelector('input').addEventListener('change', function () {
                curType = t.key;
                renderTypeCards();
                renderForm();
            });
            grid.appendChild(lab);
        });
    }

    function renderForm() {
        var box = $('gbt-form');
        box.innerHTML = '';
        var defs = TYPE_FIELDS[curType];
        var overrides = FIELD_LABELS_REQUIRED[curType] || {};
        defs.forEach(function (fd) {
            var key = fd[0], req = fd[1];
            var def = FIELD_DEFS[key];
            var label = overrides[key] || def.label;
            var wrap = document.createElement('div');
            wrap.className = 'gbt-field';
            var hint = def.hint ? '<div class="gbt-hint">' + esc(def.hint) + '</div>' : '';
            var ph = (key === 'accessDate') ? '如：' + todayStr() : def.placeholder;
            wrap.innerHTML = '<label>' + esc(label) +
                (req ? ' <span class="gbt-req">*</span>' : '') + '</label>' +
                '<input class="gbt-inp" id="gbt-f-' + key + '" placeholder="' + esc(ph) + '" autocomplete="off">' + hint;
            box.appendChild(wrap);
        });
        // EB/OL 引用日期默认填今天
        if (curType === 'EB/OL') {
            var ad = $('gbt-f-accessDate');
            if (ad && !ad.value) ad.value = todayStr();
        }
        showErr('');
    }

    function readForm() {
        var d = {};
        TYPE_FIELDS[curType].forEach(function (fd) {
            var el = $('gbt-f-' + fd[0]);
            d[fd[0]] = el ? el.value.trim() : '';
        });
        return d;
    }

    function validate(type, d) {
        var missing = [];
        var overrides = FIELD_LABELS_REQUIRED[type] || {};
        TYPE_FIELDS[type].forEach(function (fd) {
            if (fd[1] && !d[fd[0]]) missing.push(overrides[fd[0]] || FIELD_DEFS[fd[0]].label);
        });
        return missing;
    }

    function addEntry() {
        var d = readForm();
        var missing = validate(curType, d);
        if (missing.length) {
            showErr('还有必填项没填：' + missing.join('、') + '。补上后再添加到列表吧。');
            var first = $('gbt-f-' + TYPE_FIELDS[curType].filter(function (fd) { return fd[1] && !d[fd[0]]; })[0][0]);
            if (first) first.focus();
            return;
        }
        showErr('');
        var authors = splitAuthors(curType === 'S' ? d.standardOrg : d.authors);
        if (authors.length === 0) {
            showTip('提示：没有填写作者/责任者，条目将以题名开头。');
        } else {
            showTip('');
        }
        entries.push({ id: ++uid, type: curType, data: d });
        renderList();
        // 清空表单，方便录下一条
        renderForm();
        var ok = $('gbt-ok');
        ok.textContent = '已添加到列表（第 ' + entries.length + ' 条），可继续录入下一条。';
        ok.style.display = 'block';
        setTimeout(function () { ok.style.display = 'none'; }, 2500);
    }

    function fillSample() {
        var s = SAMPLES[curType];
        TYPE_FIELDS[curType].forEach(function (fd) {
            var el = $('gbt-f-' + fd[0]);
            if (el) el.value = s[fd[0]] || '';
        });
        showErr('');
        showTip('已填入「' + typeDef(curType).name + '」示例，可直接点「添加到列表」试试。');
    }

    function orderedEntries() {
        if (mode === 'ay') return entries.slice().sort(compareAY);
        return entries;
    }

    function entryText(e, idx) {
        var body = buildBody(e.type, e.data, mode);
        if (mode === 'seq') return '[' + (idx + 1) + '] ' + body;
        return body;
    }

    function renderList() {
        var list = $('gbt-list');
        var empty = $('gbt-empty');
        var ordered = orderedEntries();
        list.innerHTML = '';
        if (!ordered.length) {
            empty.style.display = 'block';
            list.style.display = 'none';
        } else {
            empty.style.display = 'none';
            list.style.display = 'block';
            ordered.forEach(function (e, i) {
                var div = document.createElement('div');
                div.className = 'gbt-item';
                div.innerHTML = '<div class="gbt-text">' + esc(entryText(e, i)) + '</div>' +
                    '<div class="gbt-item-btns">' +
                    '<button class="gbt-mini" data-act="copy">复制</button>' +
                    '<button class="gbt-mini" data-act="up"' + (i === 0 || mode === 'ay' ? ' disabled' : '') + '>上移</button>' +
                    '<button class="gbt-mini" data-act="down"' + (i === ordered.length - 1 || mode === 'ay' ? ' disabled' : '') + '>下移</button>' +
                    '<button class="gbt-mini gbt-danger" data-act="del">删除</button>' +
                    '</div>';
                div.querySelectorAll('button').forEach(function (btn) {
                    btn.addEventListener('click', function () { itemAction(e.id, btn.getAttribute('data-act')); });
                });
                list.appendChild(div);
            });
        }
        $('gbt-count').textContent = entries.length;
        var has = entries.length > 0;
        $('gbt-copyall').disabled = !has;
        $('gbt-export').disabled = !has;
        $('gbt-clear').disabled = !has;
        renderCiteNote(ordered);
    }

    function renderCiteNote(ordered) {
        var box = $('gbt-citenote');
        if (mode === 'ay' && ordered.length) {
            var cites = ordered.map(function (e) {
                var authors = splitAuthors(e.type === 'S' ? e.data.standardOrg : e.data.authors);
                return inTextCite(authors, yearOf(e.data));
            });
            box.innerHTML = '<b>文内引用示例：</b>' + cites.map(esc).join('、') +
                '<br><span class="gbt-hint">著者-出版年制：正文中用「' + '（作者, 年）' + '」标注，文末列表按作者拼音（中文）/ 字母（英文）排序，不编号。</span>';
            box.style.display = 'block';
        } else {
            box.style.display = 'none';
        }
    }

    function itemAction(id, act) {
        var idx = -1;
        for (var i = 0; i < entries.length; i++) if (entries[i].id === id) { idx = i; break; }
        if (idx < 0) return;
        if (act === 'del') {
            entries.splice(idx, 1);
        } else if (act === 'up' && idx > 0) {
            var t = entries[idx - 1]; entries[idx - 1] = entries[idx]; entries[idx] = t;
        } else if (act === 'down' && idx < entries.length - 1) {
            var u = entries[idx + 1]; entries[idx + 1] = entries[idx]; entries[idx] = u;
        } else if (act === 'copy') {
            var ordered = orderedEntries();
            var pos = -1;
            for (var j = 0; j < ordered.length; j++) if (ordered[j].id === id) { pos = j; break; }
            if (pos >= 0) copyText(entryText(ordered[pos], pos), '已复制该条目。');
            return;
        }
        renderList();
    }

    function copyText(text, okMsg) {
        function done() {
            var tip = $('gbt-copytip');
            tip.textContent = okMsg || '已复制到剪贴板。';
            tip.style.display = 'block';
            setTimeout(function () { tip.style.display = 'none'; }, 2000);
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
        } else {
            fallbackCopy(text); done();
        }
    }

    function fallbackCopy(text) {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch (e) {}
        document.body.removeChild(ta);
    }

    function exportTxt() {
        if (!entries.length) return;
        var ordered = orderedEntries();
        var lines = ordered.map(function (e, i) { return entryText(e, i); });
        var blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/plain;charset=utf-8' });
        var a = document.createElement('a');
        var d = new Date();
        function p(n) { return (n < 10 ? '0' : '') + n; }
        a.href = URL.createObjectURL(blob);
        a.download = 'gbt7714-references-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + '.txt';
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    }

    function bind() {
        renderTypeCards();
        renderForm();
        renderList();
        $('gbt-sample').addEventListener('click', fillSample);
        $('gbt-add').addEventListener('click', addEntry);
        $('gbt-clearform').addEventListener('click', function () { renderForm(); showTip(''); });
        document.querySelectorAll('input[name="gbt-mode"]').forEach(function (r) {
            r.addEventListener('change', function () {
                mode = document.querySelector('input[name="gbt-mode"]:checked').value;
                renderList();
            });
        });
        $('gbt-copyall').addEventListener('click', function () {
            var ordered = orderedEntries();
            copyText(ordered.map(function (e, i) { return entryText(e, i); }).join('\n'), '已复制全部 ' + ordered.length + ' 条。');
        });
        $('gbt-export').addEventListener('click', exportTxt);
        $('gbt-clear').addEventListener('click', function () {
            if (!entries.length) return;
            if (confirm('确定清空全部 ' + entries.length + ' 条文献吗？')) {
                entries = [];
                renderList();
            }
        });
    }

    if (typeof document !== 'undefined' && document.getElementById('gbt-type-grid')) {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
        else bind();
    }

    /* 导出纯函数供测试 */
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            splitAuthors: splitAuthors, hasCJK: hasCJK, formatAuthors: formatAuthors,
            formatAuthorsAY: formatAuthorsAY, inTextCite: inTextCite,
            normalizeDoi: normalizeDoi, buildBody: buildBody, compareAY: compareAY,
            SAMPLES: SAMPLES, TYPES: TYPES
        };
    } else {
        window.GBT7714 = {
            splitAuthors: splitAuthors, buildBody: buildBody, inTextCite: inTextCite,
            normalizeDoi: normalizeDoi, compareAY: compareAY, SAMPLES: SAMPLES
        };
    }
})();
