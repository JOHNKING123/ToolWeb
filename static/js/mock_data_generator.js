'use strict';
/*
 * 假数据/Mock 生成器（Mock Data Generator）—— 纯前端、零依赖、零后端、零上传
 *
 * 能力：
 * 1. 字段勾选：中文姓名 / 性别 / 中国真实号段手机号 / 邮箱 / 身份证（虚拟，18 位校验位正确）
 *    / 银行卡（虚拟，Luhn 正确） / 省市区三级地址 / UUID / 时间戳-日期范围
 * 2. 行数（最多 20000）＋ seed（mulberry32 PRNG，同 seed 同配置结果可复现）
 * 3. 数据表格预览：分页渲染（每页 100 行），万行不卡
 * 4. JSON / CSV / SQL INSERT 三格式导出，一键复制 / 下载；SQL 支持表名 + MySQL/PostgreSQL 方言
 * 5. 全部配置经 localStorage 持久化
 * 6. 全程浏览器本地运行，无任何后端调用与网络上传
 */
(function () {
  var $ = function (id) { return document.getElementById(id); };

  /* ---------- 可复现随机数：mulberry32 ---------- */
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------- 基础数据表 ---------- */
  var SURNAMES = ('王李张刘陈杨赵黄周吴徐孙胡朱高林何郭马罗梁宋郑谢韩唐冯董萧程曹袁邓许傅沈曾彭吕苏卢蒋蔡贾丁魏薛叶阎余潘杜戴夏钟汪田任姜范方石姚谭廖邹熊金陆郝孔白崔康毛邱秦江史顾侯邵孟龙万段雷钱汤尹黎易常武乔贺赖龚文陶').split('');
  var GIVENS = ('伟芳娜秀英华慧巧美静淑惠珠翠雅芝玉萍红娥玲芬燕桂丹蕊薇菁梦岚苑婕馨韵融园艺咏聪澜纯毓悦昭冰爽琬茗羽希宁欣飘育滢筠柔竹凝晓璐洋明翰凯睿哲轩晨曦宇阳博涛远帆航峰磊鑫森炎焱晶尧舜禹铭泽昊天俊杰雄威魁鹏飞龙翔瑞祥安康平顺泰和琳珊媛婷倩姗雪霜霞露霄雷震海江河湖山石铁钢铜强刚毅勇猛胜利光亮晶磊鑫').split('');

  /* 中国移动电话真实号段（三大运营商 + 广电在用号段） */
  var PHONE_PREFIXES = [
    '130','131','132','133','134','135','136','137','138','139',
    '145','147','148','149',
    '150','151','152','153','155','156','157','158','159',
    '162','163','165','166','167','168','169',
    '170','171','172','173','174','175','176','177','178','179',
    '180','181','182','183','184','185','186','187','188','189',
    '190','191','192','193','195','196','197','198','199'
  ];

  var EMAIL_DOMAINS = ['163.com', '126.com', 'qq.com', 'sina.com', 'gmail.com', 'outlook.com', 'hotmail.com', 'foxmail.com'];
  var EMAIL_LOCAL_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';

  /* 身份证行政区划代码（6 位，真实） */
  var IDCARD_AREAS = [
    '110101','110102','110105','110108', '120101','120103',
    '130102','130202', '140105', '150102',
    '210102','210202', '220102', '230102',
    '310101','310104','310115',
    '320102','320502', '330102','330203',
    '340102', '350102','350203', '360102',
    '370102','370202', '410102', '420102',
    '430102', '440103','440104','440301','440305','440111',
    '450102', '460102',
    '500101', '510104', '520102', '530102',
    '610102', '620102', '630102', '640104',
    '650102', '540102'
  ];
  var IDCARD_WEIGHTS = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  var IDCARD_CHECKMAP = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2'];

  /* 银行卡 BIN（真实发卡行号段，生成卡号仅虚拟测试用） */
  var BANK_BINS = [
    { bin: '622202', len: 19 }, /* 工商银行 */
    { bin: '622848', len: 19 }, /* 农业银行 */
    { bin: '621661', len: 19 }, /* 中国银行 */
    { bin: '621700', len: 19 }, /* 建设银行 */
    { bin: '621483', len: 16 }, /* 招商银行 */
    { bin: '621799', len: 19 }, /* 邮储银行 */
    { bin: '623058', len: 16 }, /* 平安银行 */
    { bin: '622588', len: 16 }, /* 招商银行 */
    { bin: '621226', len: 19 }  /* 工商银行 */
  ];

  /* 省市区三级地址（真实地名） */
  var AREAS = [
    { p: '北京市', c: [{ n: '北京市', d: ['东城区', '西城区', '朝阳区', '海淀区', '丰台区', '石景山区'] }] },
    { p: '天津市', c: [{ n: '天津市', d: ['和平区', '河西区', '南开区', '河北区', '滨海新区'] }] },
    { p: '河北省', c: [{ n: '石家庄市', d: ['长安区', '桥西区', '新华区'] }, { n: '唐山市', d: ['路南区', '路北区', '丰南区'] }, { n: '保定市', d: ['竞秀区', '莲池区'] }] },
    { p: '山西省', c: [{ n: '太原市', d: ['小店区', '迎泽区', '万柏林区'] }, { n: '大同市', d: ['平城区', '云冈区'] }] },
    { p: '内蒙古自治区', c: [{ n: '呼和浩特市', d: ['新城区', '回民区', '玉泉区'] }, { n: '包头市', d: ['东河区', '青山区', '九原区'] }] },
    { p: '辽宁省', c: [{ n: '沈阳市', d: ['和平区', '沈河区', '皇姑区'] }, { n: '大连市', d: ['中山区', '西岗区', '沙河口区'] }] },
    { p: '吉林省', c: [{ n: '长春市', d: ['南关区', '宽城区', '朝阳区'] }, { n: '吉林市', d: ['昌邑区', '船营区'] }] },
    { p: '黑龙江省', c: [{ n: '哈尔滨市', d: ['道里区', '南岗区', '道外区'] }, { n: '齐齐哈尔市', d: ['龙沙区', '建华区'] }] },
    { p: '上海市', c: [{ n: '上海市', d: ['黄浦区', '徐汇区', '长宁区', '静安区', '浦东新区'] }] },
    { p: '江苏省', c: [{ n: '南京市', d: ['玄武区', '秦淮区', '建邺区'] }, { n: '苏州市', d: ['姑苏区', '虎丘区', '吴中区'] }, { n: '无锡市', d: ['梁溪区', '滨湖区'] }] },
    { p: '浙江省', c: [{ n: '杭州市', d: ['上城区', '西湖区', '拱墅区'] }, { n: '宁波市', d: ['海曙区', '江北区', '鄞州区'] }, { n: '温州市', d: ['鹿城区', '龙湾区'] }] },
    { p: '安徽省', c: [{ n: '合肥市', d: ['瑶海区', '庐阳区', '蜀山区'] }, { n: '芜湖市', d: ['镜湖区', '弋江区'] }] },
    { p: '福建省', c: [{ n: '福州市', d: ['鼓楼区', '台江区', '仓山区'] }, { n: '厦门市', d: ['思明区', '湖里区', '集美区'] }] },
    { p: '江西省', c: [{ n: '南昌市', d: ['东湖区', '西湖区', '青云谱区'] }, { n: '赣州市', d: ['章贡区', '南康区'] }] },
    { p: '山东省', c: [{ n: '济南市', d: ['历下区', '市中区', '槐荫区'] }, { n: '青岛市', d: ['市南区', '市北区', '李沧区'] }] },
    { p: '河南省', c: [{ n: '郑州市', d: ['金水区', '二七区', '中原区'] }, { n: '洛阳市', d: ['老城区', '西工区', '涧西区'] }] },
    { p: '湖北省', c: [{ n: '武汉市', d: ['江岸区', '江汉区', '硚口区'] }, { n: '襄阳市', d: ['襄城区', '樊城区'] }] },
    { p: '湖南省', c: [{ n: '长沙市', d: ['芙蓉区', '天心区', '岳麓区'] }, { n: '株洲市', d: ['荷塘区', '芦淞区'] }] },
    { p: '广东省', c: [
      { n: '广州市', d: ['天河区', '越秀区', '海珠区', '白云区'] },
      { n: '深圳市', d: ['福田区', '罗湖区', '南山区', '宝安区'] },
      { n: '东莞市', d: ['东城街道', '南城街道', '万江街道'] },
      { n: '佛山市', d: ['禅城区', '南海区', '顺德区'] }
    ] },
    { p: '广西壮族自治区', c: [{ n: '南宁市', d: ['兴宁区', '青秀区', '江南区'] }, { n: '桂林市', d: ['秀峰区', '叠彩区', '七星区'] }] },
    { p: '海南省', c: [{ n: '海口市', d: ['秀英区', '龙华区', '琼山区'] }, { n: '三亚市', d: ['海棠区', '吉阳区', '天涯区'] }] },
    { p: '重庆市', c: [{ n: '重庆市', d: ['渝中区', '大渡口区', '江北区', '沙坪坝区'] }] },
    { p: '四川省', c: [{ n: '成都市', d: ['锦江区', '青羊区', '金牛区'] }, { n: '绵阳市', d: ['涪城区', '游仙区'] }] },
    { p: '贵州省', c: [{ n: '贵阳市', d: ['南明区', '云岩区', '花溪区'] }, { n: '遵义市', d: ['红花岗区', '汇川区'] }] },
    { p: '云南省', c: [{ n: '昆明市', d: ['五华区', '盘龙区', '官渡区'] }, { n: '玉溪市', d: ['红塔区'] }] },
    { p: '陕西省', c: [{ n: '西安市', d: ['新城区', '碑林区', '莲湖区'] }, { n: '咸阳市', d: ['秦都区', '渭城区'] }] },
    { p: '甘肃省', c: [{ n: '兰州市', d: ['城关区', '七里河区', '西固区'] }, { n: '天水市', d: ['秦州区', '麦积区'] }] },
    { p: '青海省', c: [{ n: '西宁市', d: ['城东区', '城中区', '城西区'] }] },
    { p: '宁夏回族自治区', c: [{ n: '银川市', d: ['兴庆区', '西夏区', '金凤区'] }] },
    { p: '新疆维吾尔自治区', c: [{ n: '乌鲁木齐市', d: ['天山区', '沙依巴克区', '新市区'] }, { n: '吐鲁番市', d: ['高昌区'] }] },
    { p: '西藏自治区', c: [{ n: '拉萨市', d: ['城关区', '堆龙德庆区', '达孜区'] }] },
    { p: '香港特别行政区', c: [{ n: '香港', d: ['中西区', '湾仔区', '东区', '观塘区'] }] },
    { p: '澳门特别行政区', c: [{ n: '澳门', d: ['花地玛堂区', '圣安多尼堂区', '大堂区'] }] },
    { p: '台湾省', c: [{ n: '台北市', d: ['中正区', '大同区', '中山区'] }, { n: '高雄市', d: ['新兴区', '前金区', '苓雅区'] }] }
  ];

  var FIELDS = [
    { key: 'name',     label: '中文姓名' },
    { key: 'gender',   label: '性别' },
    { key: 'phone',    label: '手机号' },
    { key: 'email',    label: '邮箱' },
    { key: 'idcard',   label: '身份证（虚拟·测试用）' },
    { key: 'bankcard', label: '银行卡（虚拟·测试用）' },
    { key: 'address',  label: '省市区地址' },
    { key: 'uuid',     label: 'UUID' },
    { key: 'datetime', label: '时间戳/日期' }
  ];

  var DT_FORMATS = {
    ts_s: '秒时间戳', ts_ms: '毫秒时间戳', dt: '日期时间', date: '日期'
  };

  /* ---------- 状态 ---------- */
  var state = {
    rows: [],        // 当前生成的数据（对象数组，键为字段 key）
    fieldKeys: [],   // 本次生成使用的字段 key 顺序
    total: 0,
    page: 1,
    pageSize: 100,
    genMs: 0
  };

  var LS_KEY = 'mock_data_generator_opts_v1';

  /* ---------- 随机小工具 ---------- */
  function pick(rand, arr) { return arr[Math.floor(rand() * arr.length)]; }
  function intBetween(rand, min, max) { return min + Math.floor(rand() * (max - min + 1)); }
  function digitStr(rand, n) { var s = ''; for (var i = 0; i < n; i++) s += intBetween(rand, 0, 9); return s; }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  /* 身份证校验位：前 17 位 → 第 18 位 */
  function idcardCheck(first17) {
    var sum = 0;
    for (var i = 0; i < 17; i++) sum += parseInt(first17.charAt(i), 10) * IDCARD_WEIGHTS[i];
    return IDCARD_CHECKMAP[sum % 11];
  }

  /* Luhn 校验位：前缀 → 校验位 */
  function luhnCheck(prefix) {
    var sum = 0, alt = true;
    for (var i = prefix.length - 1; i >= 0; i--) {
      var d = parseInt(prefix.charAt(i), 10);
      if (alt) { d *= 2; if (d > 9) d -= 9; }
      sum += d; alt = !alt;
    }
    return String((10 - (sum % 10)) % 10);
  }

  function genUUIDv4(rand) {
    var hexs = '0123456789abcdef', out = '';
    for (var i = 0; i < 32; i++) {
      var h = hexs[intBetween(rand, 0, 15)];
      if (i === 12) h = '4';
      if (i === 16) h = hexs[8 + intBetween(rand, 0, 3)];
      out += h;
      if (i === 7 || i === 11 || i === 15 || i === 19) out += '-';
    }
    return out;
  }

  function formatDT(ts, fmt) {
    var d = new Date(ts);
    if (fmt === 'ts_s') return Math.floor(ts / 1000);
    if (fmt === 'ts_ms') return ts;
    var s = d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
    if (fmt === 'date') return s;
    return s + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
  }

  /* ---------- 生成一行 ---------- */
  function genRow(rand, keys, opts) {
    var row = {};
    var gender = intBetween(rand, 0, 1) === 0 ? '男' : '女';
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (k === 'name') {
        var givenLen = intBetween(rand, 1, 2);
        var g = '';
        for (var j = 0; j < givenLen; j++) g += pick(rand, GIVENS);
        row.name = pick(rand, SURNAMES) + g;
      } else if (k === 'gender') {
        row.gender = gender;
      } else if (k === 'phone') {
        row.phone = pick(rand, PHONE_PREFIXES) + digitStr(rand, 8);
      } else if (k === 'email') {
        var localLen = intBetween(rand, 5, 12), local = '';
        for (var e = 0; e < localLen; e++) local += EMAIL_LOCAL_CHARS.charAt(intBetween(rand, 0, EMAIL_LOCAL_CHARS.length - 1));
        row.email = local + '@' + pick(rand, EMAIL_DOMAINS);
      } else if (k === 'idcard') {
        var area = pick(rand, IDCARD_AREAS);
        var bd = opts.birthTsStart + Math.floor(rand() * (opts.birthTsEnd - opts.birthTsStart));
        var bdD = new Date(bd);
        var bdStr = bdD.getFullYear() + pad2(bdD.getMonth() + 1) + pad2(bdD.getDate());
        /* 顺序码：末位奇偶对应性别（性别字段启用时联动） */
        var seqNum = intBetween(rand, 1, 999);
        var needOdd = keys.indexOf('gender') !== -1 ? (gender === '男') : (seqNum % 2 === 1);
        seqNum = seqNum - (seqNum % 2) + (needOdd ? 1 : 0);
        if (seqNum < 1) seqNum = needOdd ? 1 : 2;
        if (seqNum > 999) seqNum = needOdd ? 999 : 998;
        var seq = ('00' + seqNum).slice(-3);
        var first17 = area + bdStr + seq;
        row.idcard = first17 + idcardCheck(first17);
      } else if (k === 'bankcard') {
        var b = pick(rand, BANK_BINS);
        var prefix = b.bin + digitStr(rand, b.len - b.bin.length - 1);
        row.bankcard = prefix + luhnCheck(prefix);
      } else if (k === 'address') {
        var prov = pick(rand, AREAS);
        var city = pick(rand, prov.c);
        row.address = prov.p + city.n + pick(rand, city.d);
      } else if (k === 'uuid') {
        row.uuid = genUUIDv4(rand);
      } else if (k === 'datetime') {
        var ts = opts.dtTsStart + Math.floor(rand() * (opts.dtTsEnd - opts.dtTsStart));
        row.datetime = formatDT(ts, opts.dtFormat);
      }
    }
    return row;
  }

  /* ---------- 配置读写 ---------- */
  function readOpts() {
    var keys = [];
    var boxes = document.querySelectorAll('input[name="mdg-field"]:checked');
    for (var i = 0; i < boxes.length; i++) keys.push(boxes[i].value);
    var count = parseInt($('mdg-count').value, 10);
    if (!count || count < 1) count = 1;
    if (count > 20000) count = 20000;
    $('mdg-count').value = count;
    var seed = parseInt($('mdg-seed').value, 10);
    if (isNaN(seed)) { seed = Math.floor(Math.random() * 1000000000); $('mdg-seed').value = seed; }
    var dateStart = $('mdg-date-start').value || '2015-01-01';
    var dateEnd = $('mdg-date-end').value || '2026-10-20';
    var dtFormat = $('mdg-dt-format').value;
    var tableName = ($('mdg-table').value || 'mock_data').trim() || 'mock_data';
    var dialect = $('mdg-dialect').value;
    return {
      keys: keys, count: count, seed: seed,
      birthTsStart: new Date(dateStart + 'T00:00:00').getTime(),
      birthTsEnd: new Date(dateEnd + 'T23:59:59').getTime(),
      dtTsStart: new Date(dateStart + 'T00:00:00').getTime(),
      dtTsEnd: new Date(dateEnd + 'T23:59:59').getTime(),
      dtFormat: dtFormat, tableName: tableName, dialect: dialect
    };
  }

  function saveOpts() {
    try {
      var checked = [];
      var boxes = document.querySelectorAll('input[name="mdg-field"]');
      for (var i = 0; i < boxes.length; i++) checked.push({ key: boxes[i].value, on: boxes[i].checked });
      localStorage.setItem(LS_KEY, JSON.stringify({
        fields: checked,
        count: $('mdg-count').value,
        seed: $('mdg-seed').value,
        dateStart: $('mdg-date-start').value,
        dateEnd: $('mdg-date-end').value,
        dtFormat: $('mdg-dt-format').value,
        tableName: $('mdg-table').value,
        dialect: $('mdg-dialect').value
      }));
    } catch (e) { /* 忽略存储异常 */ }
  }

  function loadOpts() {
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch (e) { saved = null; }
    var fieldWrap = $('mdg-fields');
    FIELDS.forEach(function (f, idx) {
      var label = document.createElement('label');
      label.className = 'mdg-check';
      var cb = document.createElement('input');
      cb.type = 'checkbox'; cb.name = 'mdg-field'; cb.value = f.key;
      var defOn = (idx <= 3) || f.key === 'address'; /* 默认：姓名/性别/手机号/邮箱/地址 */
      if (saved && saved.fields) {
        for (var i = 0; i < saved.fields.length; i++) {
          if (saved.fields[i].key === f.key) { defOn = saved.fields[i].on; break; }
        }
      }
      cb.checked = defOn;
      cb.addEventListener('change', saveOpts);
      label.appendChild(cb);
      label.appendChild(document.createTextNode(' ' + f.label));
      fieldWrap.appendChild(label);
    });
    if (saved) {
      if (saved.count) $('mdg-count').value = saved.count;
      if (saved.seed) $('mdg-seed').value = saved.seed;
      if (saved.dateStart) $('mdg-date-start').value = saved.dateStart;
      if (saved.dateEnd) $('mdg-date-end').value = saved.dateEnd;
      if (saved.dtFormat) $('mdg-dt-format').value = saved.dtFormat;
      if (saved.tableName) $('mdg-table').value = saved.tableName;
      if (saved.dialect) $('mdg-dialect').value = saved.dialect;
    }
    ['mdg-count', 'mdg-seed', 'mdg-date-start', 'mdg-date-end', 'mdg-dt-format', 'mdg-table', 'mdg-dialect'].forEach(function (id) {
      $(id).addEventListener('change', saveOpts);
    });
    if (!$('mdg-seed').value) $('mdg-seed').value = Math.floor(Math.random() * 1000000000);
  }

  /* ---------- 生成 ---------- */
  function generate() {
    var opts = readOpts();
    if (!opts.keys.length) { toast('请至少勾选一个字段'); return; }
    if (opts.birthTsEnd < opts.birthTsStart) { toast('日期范围无效：结束日期早于开始日期'); return; }
    saveOpts();
    var rand = mulberry32(opts.seed);
    var t0 = performance.now();
    var rows = new Array(opts.count);
    for (var i = 0; i < opts.count; i++) rows[i] = genRow(rand, opts.keys, opts);
    state.rows = rows;
    state.fieldKeys = opts.keys;
    state.total = opts.count;
    state.page = 1;
    state.genMs = Math.round(performance.now() - t0);
    renderTable();
    toast('已生成 ' + opts.count + ' 行（' + state.genMs + ' ms）');
  }

  function escHTML(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ---------- 预览：分页渲染 ---------- */
  function renderTable() {
    var head = $('mdg-thead'), body = $('mdg-tbody'), info = $('mdg-pageinfo');
    if (!state.total) {
      head.innerHTML = ''; body.innerHTML = '<tr><td style="text-align:center;color:#9ca3af;">点击「生成数据」开始</td></tr>';
      info.textContent = ''; return;
    }
    var totalPages = Math.ceil(state.total / state.pageSize);
    if (state.page > totalPages) state.page = totalPages;
    var start = (state.page - 1) * state.pageSize;
    var end = Math.min(start + state.pageSize, state.total);
    var th = '<tr><th style="width:3.5em;">#</th>' + state.fieldKeys.map(function (k) {
      return '<th>' + escHTML(fieldLabel(k)) + '</th>';
    }).join('') + '</tr>';
    head.innerHTML = th;
    var html = '';
    for (var i = start; i < end; i++) {
      var r = state.rows[i];
      html += '<tr><td class="mdg-idx">' + (i + 1) + '</td>' + state.fieldKeys.map(function (k) {
        return '<td>' + escHTML(r[k] === undefined ? '' : r[k]) + '</td>';
      }).join('') + '</tr>';
    }
    body.innerHTML = html;
    info.textContent = '第 ' + state.page + ' / ' + totalPages + ' 页 · 共 ' + state.total + ' 行 · 生成耗时 ' + state.genMs + ' ms';
    $('mdg-prev').disabled = state.page <= 1;
    $('mdg-next').disabled = state.page >= totalPages;
    $('mdg-first').disabled = state.page <= 1;
    $('mdg-last').disabled = state.page >= totalPages;
  }

  function fieldLabel(k) {
    for (var i = 0; i < FIELDS.length; i++) if (FIELDS[i].key === k) return FIELDS[i].label;
    return k;
  }

  function gotoPage(p) {
    var totalPages = Math.ceil(state.total / state.pageSize);
    if (p < 1) p = 1;
    if (p > totalPages) p = totalPages;
    state.page = p;
    renderTable();
  }

  /* ---------- 导出 ---------- */
  function buildJSON() {
    return JSON.stringify(state.rows, null, 2);
  }

  function csvCell(v) {
    var s = String(v === undefined || v === null ? '' : v);
    if (s.indexOf(',') !== -1 || s.indexOf('"') !== -1 || s.indexOf('\n') !== -1 || s.indexOf('\r') !== -1) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  function buildCSV() {
    var lines = [state.fieldKeys.map(csvCell).join(',')];
    for (var i = 0; i < state.rows.length; i++) {
      var r = state.rows[i];
      lines.push(state.fieldKeys.map(function (k) { return csvCell(r[k]); }).join(','));
    }
    return '\uFEFF' + lines.join('\n'); /* UTF-8 BOM，Excel 打开不乱码 */
  }

  function sqlIdent(name, dialect) {
    var clean = String(name).replace(/[^a-zA-Z0-9_$]/g, '');
    if (!clean) clean = 'mock_data';
    if (dialect === 'postgres') return '"' + clean.replace(/"/g, '""') + '"';
    return '`' + clean.replace(/`/g, '``') + '`';
  }

  function sqlValue(v, dialect) {
    if (v === undefined || v === null) return 'NULL';
    if (typeof v === 'number') return String(v);
    return "'" + String(v).replace(/'/g, "''") + "'";
  }

  function buildSQL(opts) {
    var table = sqlIdent(opts.tableName, opts.dialect);
    var cols = state.fieldKeys.map(function (k) { return sqlIdent(k, opts.dialect); }).join(', ');
    var batch = 1000, stmts = [];
    for (var i = 0; i < state.rows.length; i += batch) {
      var chunk = [];
      for (var j = i; j < Math.min(i + batch, state.rows.length); j++) {
        var r = state.rows[j];
        chunk.push('(' + state.fieldKeys.map(function (k) { return sqlValue(r[k], opts.dialect); }).join(', ') + ')');
      }
      stmts.push('INSERT INTO ' + table + ' (' + cols + ') VALUES\n' + chunk.join(',\n') + ';');
    }
    var head = opts.dialect === 'postgres'
      ? '-- Mock Data Generator · 虚拟测试数据（仅供测试使用）\n-- PostgreSQL 方言\nSET client_encoding = \'UTF8\';\n\n'
      : '-- Mock Data Generator · 虚拟测试数据（仅供测试使用）\n-- MySQL 方言\nSET NAMES utf8mb4;\n\n';
    return head + stmts.join('\n\n');
  }

  function doExport(format, toClipboard) {
    if (!state.total) { toast('请先生成数据'); return; }
    var opts = readOpts();
    var text, filename, mime;
    var stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    if (format === 'json') { text = buildJSON(); filename = 'mock-data-' + stamp + '.json'; mime = 'application/json'; }
    else if (format === 'csv') { text = buildCSV(); filename = 'mock-data-' + stamp + '.csv'; mime = 'text/csv'; }
    else { text = buildSQL(opts); filename = 'mock-data-' + stamp + '.sql'; mime = 'text/sql'; }
    if (toClipboard) {
      copyText(text, '已复制 ' + format.toUpperCase() + '（' + state.total + ' 行）');
    } else {
      var blob = new Blob([text], { type: mime + ';charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
      toast('已下载 ' + filename);
    }
  }

  function copyText(t, okMsg) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).then(function () { toast(okMsg || '已复制'); },
        function () { fallbackCopy(t, okMsg); });
    } else {
      fallbackCopy(t, okMsg);
    }
  }

  function fallbackCopy(t, okMsg) {
    var ta = document.createElement('textarea');
    ta.value = t;
    ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); toast(okMsg || '已复制'); }
    catch (e) { toast('复制失败，请手动复制'); }
    document.body.removeChild(ta);
  }

  function toast(msg) {
    var el = document.createElement('div');
    el.textContent = msg;
    el.style.cssText = 'position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);background:#111827;color:#fff;padding:.6rem 1.2rem;border-radius:.5rem;z-index:9999;font-size:.9rem;max-width:90vw;';
    document.body.appendChild(el);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 1800);
  }

  /* ---------- 暴露给模板的入口 ---------- */
  window.mdgGenerate = generate;
  window.mdgExport = doExport;
  window.mdgGotoPage = function (delta) { gotoPage(state.page + delta); };
  window.mdgFirst = function () { gotoPage(1); };
  window.mdgLast = function () { gotoPage(Math.ceil(state.total / state.pageSize)); };
  window.mdgNewSeed = function () {
    $('mdg-seed').value = Math.floor(Math.random() * 1000000000);
    saveOpts();
    toast('已换新 seed');
  };

  document.addEventListener('DOMContentLoaded', function () {
    loadOpts();
    renderTable();
  });
})();
