/* 国际电话区号查询（dial_code_lookup）- 纯前端（零后端、零上传）
 *
 * 数据基准：国家／地区国际电话区号以 ITU E.164 国家区号为准，
 * 开发轮逐条核对，核对日期 2026-11-07。区号变更时以运营商／ITU 公布为准。
 * 收录 246 个国家／地区（含中国香港／中国澳门／中国台湾）；
 * 无公众电话区号的国家／地区（如南极洲）未收录，未收录不代表不存在。
 * 北美编号计划（NANP）成员以「1＋地区码」形式收录（如巴哈马 1242、
 * 多米尼加 1809、波多黎各 1787），美国与加拿大收录为 1；反向查询
 * +1 时只返回美国与加拿大，其余 NANP 成员请用完整区号（如 +1242）查询。
 * 多米尼加另有 1829／1849、波多黎各另有 1939 备用区号，本表只收主区号。
 * 不引第三方库、不走 CDN；模板零外部静态资源。
 */
(function () {
'use strict';

/* [中文名, 英文名, ISO 二字码, 区号（纯数字，不含 +）] */
var DATA = [
    ["美国", "United States", "US", "1"],
    ["加拿大", "Canada", "CA", "1"],
    ["巴哈马", "Bahamas", "BS", "1242"],
    ["巴巴多斯", "Barbados", "BB", "1246"],
    ["安圭拉", "Anguilla", "AI", "1264"],
    ["安提瓜和巴布达", "Antigua and Barbuda", "AG", "1268"],
    ["美属萨摩亚", "American Samoa", "AS", "1684"],
    ["百慕大", "Bermuda", "BM", "1441"],
    ["英属维尔京群岛", "British Virgin Islands", "VG", "1284"],
    ["开曼群岛", "Cayman Islands", "KY", "1345"],
    ["多米尼克", "Dominica", "DM", "1767"],
    ["多米尼加", "Dominican Republic", "DO", "1809"],
    ["格林纳达", "Grenada", "GD", "1473"],
    ["关岛", "Guam", "GU", "1671"],
    ["牙买加", "Jamaica", "JM", "1876"],
    ["蒙特塞拉特", "Montserrat", "MS", "1664"],
    ["北马里亚纳群岛", "Northern Mariana Islands", "MP", "1670"],
    ["波多黎各", "Puerto Rico", "PR", "1787"],
    ["圣基茨和尼维斯", "Saint Kitts and Nevis", "KN", "1869"],
    ["圣卢西亚", "Saint Lucia", "LC", "1758"],
    ["荷属圣马丁", "Sint Maarten", "SX", "1721"],
    ["特克斯和凯科斯群岛", "Turks and Caicos Islands", "TC", "1649"],
    ["特立尼达和多巴哥", "Trinidad and Tobago", "TT", "1868"],
    ["圣文森特和格林纳丁斯", "Saint Vincent and the Grenadines", "VC", "1784"],
    ["美属维尔京群岛", "United States Virgin Islands", "VI", "1340"],
    ["埃及", "Egypt", "EG", "20"],
    ["南非", "South Africa", "ZA", "27"],
    ["希腊", "Greece", "GR", "30"],
    ["荷兰", "Netherlands", "NL", "31"],
    ["比利时", "Belgium", "BE", "32"],
    ["法国", "France", "FR", "33"],
    ["西班牙", "Spain", "ES", "34"],
    ["匈牙利", "Hungary", "HU", "36"],
    ["意大利", "Italy", "IT", "39"],
    ["罗马尼亚", "Romania", "RO", "40"],
    ["瑞士", "Switzerland", "CH", "41"],
    ["奥地利", "Austria", "AT", "43"],
    ["英国", "United Kingdom", "GB", "44"],
    ["根西", "Guernsey", "GG", "44"],
    ["泽西", "Jersey", "JE", "44"],
    ["马恩岛", "Isle of Man", "IM", "44"],
    ["丹麦", "Denmark", "DK", "45"],
    ["瑞典", "Sweden", "SE", "46"],
    ["挪威", "Norway", "NO", "47"],
    ["斯瓦尔巴", "Svalbard", "SJ", "47"],
    ["波兰", "Poland", "PL", "48"],
    ["德国", "Germany", "DE", "49"],
    ["秘鲁", "Peru", "PE", "51"],
    ["墨西哥", "Mexico", "MX", "52"],
    ["古巴", "Cuba", "CU", "53"],
    ["阿根廷", "Argentina", "AR", "54"],
    ["巴西", "Brazil", "BR", "55"],
    ["智利", "Chile", "CL", "56"],
    ["哥伦比亚", "Colombia", "CO", "57"],
    ["委内瑞拉", "Venezuela", "VE", "58"],
    ["马来西亚", "Malaysia", "MY", "60"],
    ["澳大利亚", "Australia", "AU", "61"],
    ["科科斯群岛", "Cocos (Keeling) Islands", "CC", "61"],
    ["圣诞岛", "Christmas Island", "CX", "61"],
    ["印度尼西亚", "Indonesia", "ID", "62"],
    ["菲律宾", "Philippines", "PH", "63"],
    ["新西兰", "New Zealand", "NZ", "64"],
    ["皮特凯恩群岛", "Pitcairn Islands", "PN", "64"],
    ["新加坡", "Singapore", "SG", "65"],
    ["泰国", "Thailand", "TH", "66"],
    ["日本", "Japan", "JP", "81"],
    ["韩国", "South Korea", "KR", "82"],
    ["越南", "Vietnam", "VN", "84"],
    ["中国", "China", "CN", "86"],
    ["土耳其", "Turkey", "TR", "90"],
    ["印度", "India", "IN", "91"],
    ["巴基斯坦", "Pakistan", "PK", "92"],
    ["阿富汗", "Afghanistan", "AF", "93"],
    ["斯里兰卡", "Sri Lanka", "LK", "94"],
    ["缅甸", "Myanmar", "MM", "95"],
    ["伊朗", "Iran", "IR", "98"],
    ["南苏丹", "South Sudan", "SS", "211"],
    ["摩洛哥", "Morocco", "MA", "212"],
    ["阿尔及利亚", "Algeria", "DZ", "213"],
    ["突尼斯", "Tunisia", "TN", "216"],
    ["利比亚", "Libya", "LY", "218"],
    ["冈比亚", "Gambia", "GM", "220"],
    ["塞内加尔", "Senegal", "SN", "221"],
    ["毛里塔尼亚", "Mauritania", "MR", "222"],
    ["马里", "Mali", "ML", "223"],
    ["几内亚", "Guinea", "GN", "224"],
    ["科特迪瓦", "Côte d'Ivoire", "CI", "225"],
    ["布基纳法索", "Burkina Faso", "BF", "226"],
    ["尼日尔", "Niger", "NE", "227"],
    ["多哥", "Togo", "TG", "228"],
    ["贝宁", "Benin", "BJ", "229"],
    ["毛里求斯", "Mauritius", "MU", "230"],
    ["利比里亚", "Liberia", "LR", "231"],
    ["塞拉利昂", "Sierra Leone", "SL", "232"],
    ["加纳", "Ghana", "GH", "233"],
    ["尼日利亚", "Nigeria", "NG", "234"],
    ["乍得", "Chad", "TD", "235"],
    ["中非", "Central African Republic", "CF", "236"],
    ["喀麦隆", "Cameroon", "CM", "237"],
    ["佛得角", "Cabo Verde", "CV", "238"],
    ["圣多美和普林西比", "São Tomé and Príncipe", "ST", "239"],
    ["赤道几内亚", "Equatorial Guinea", "GQ", "240"],
    ["加蓬", "Gabon", "GA", "241"],
    ["刚果（布）", "Congo", "CG", "242"],
    ["刚果（金）", "Congo (DRC)", "CD", "243"],
    ["安哥拉", "Angola", "AO", "244"],
    ["几内亚比绍", "Guinea-Bissau", "GW", "245"],
    ["英属印度洋领地", "British Indian Ocean Territory", "IO", "246"],
    ["阿森松岛", "Ascension Island", "AC", "247"],
    ["塞舌尔", "Seychelles", "SC", "248"],
    ["苏丹", "Sudan", "SD", "249"],
    ["卢旺达", "Rwanda", "RW", "250"],
    ["埃塞俄比亚", "Ethiopia", "ET", "251"],
    ["索马里", "Somalia", "SO", "252"],
    ["吉布提", "Djibouti", "DJ", "253"],
    ["肯尼亚", "Kenya", "KE", "254"],
    ["坦桑尼亚", "Tanzania", "TZ", "255"],
    ["乌干达", "Uganda", "UG", "256"],
    ["布隆迪", "Burundi", "BI", "257"],
    ["莫桑比克", "Mozambique", "MZ", "258"],
    ["赞比亚", "Zambia", "ZM", "260"],
    ["马达加斯加", "Madagascar", "MG", "261"],
    ["留尼汪", "Réunion", "RE", "262"],
    ["马约特", "Mayotte", "YT", "262"],
    ["津巴布韦", "Zimbabwe", "ZW", "263"],
    ["纳米比亚", "Namibia", "NA", "264"],
    ["马拉维", "Malawi", "MW", "265"],
    ["莱索托", "Lesotho", "LS", "266"],
    ["博茨瓦纳", "Botswana", "BW", "267"],
    ["斯威士兰", "Eswatini", "SZ", "268"],
    ["科摩罗", "Comoros", "KM", "269"],
    ["圣赫勒拿", "Saint Helena", "SH", "290"],
    ["特里斯坦-达库尼亚", "Tristan da Cunha", "TA", "290"],
    ["厄立特里亚", "Eritrea", "ER", "291"],
    ["阿鲁巴", "Aruba", "AW", "297"],
    ["法罗群岛", "Faroe Islands", "FO", "298"],
    ["格陵兰", "Greenland", "GL", "299"],
    ["直布罗陀", "Gibraltar", "GI", "350"],
    ["葡萄牙", "Portugal", "PT", "351"],
    ["卢森堡", "Luxembourg", "LU", "352"],
    ["爱尔兰", "Ireland", "IE", "353"],
    ["冰岛", "Iceland", "IS", "354"],
    ["阿尔巴尼亚", "Albania", "AL", "355"],
    ["马耳他", "Malta", "MT", "356"],
    ["塞浦路斯", "Cyprus", "CY", "357"],
    ["芬兰", "Finland", "FI", "358"],
    ["奥兰群岛", "Åland Islands", "AX", "358"],
    ["保加利亚", "Bulgaria", "BG", "359"],
    ["立陶宛", "Lithuania", "LT", "370"],
    ["拉脱维亚", "Latvia", "LV", "371"],
    ["爱沙尼亚", "Estonia", "EE", "372"],
    ["摩尔多瓦", "Moldova", "MD", "373"],
    ["亚美尼亚", "Armenia", "AM", "374"],
    ["白俄罗斯", "Belarus", "BY", "375"],
    ["安道尔", "Andorra", "AD", "376"],
    ["摩纳哥", "Monaco", "MC", "377"],
    ["圣马力诺", "San Marino", "SM", "378"],
    ["梵蒂冈", "Vatican City", "VA", "379"],
    ["乌克兰", "Ukraine", "UA", "380"],
    ["塞尔维亚", "Serbia", "RS", "381"],
    ["黑山", "Montenegro", "ME", "382"],
    ["科索沃", "Kosovo", "XK", "383"],
    ["克罗地亚", "Croatia", "HR", "385"],
    ["斯洛文尼亚", "Slovenia", "SI", "386"],
    ["波斯尼亚和黑塞哥维那", "Bosnia and Herzegovina", "BA", "387"],
    ["北马其顿", "North Macedonia", "MK", "389"],
    ["捷克", "Czechia", "CZ", "420"],
    ["斯洛伐克", "Slovakia", "SK", "421"],
    ["列支敦士登", "Liechtenstein", "LI", "423"],
    ["福克兰群岛", "Falkland Islands", "FK", "500"],
    ["南乔治亚和南桑威奇群岛", "South Georgia and the South Sandwich Islands", "GS", "500"],
    ["伯利兹", "Belize", "BZ", "501"],
    ["危地马拉", "Guatemala", "GT", "502"],
    ["萨尔瓦多", "El Salvador", "SV", "503"],
    ["洪都拉斯", "Honduras", "HN", "504"],
    ["尼加拉瓜", "Nicaragua", "NI", "505"],
    ["哥斯达黎加", "Costa Rica", "CR", "506"],
    ["巴拿马", "Panama", "PA", "507"],
    ["圣皮埃尔和密克隆", "Saint Pierre and Miquelon", "PM", "508"],
    ["海地", "Haiti", "HT", "509"],
    ["瓜德罗普", "Guadeloupe", "GP", "590"],
    ["圣巴泰勒米", "Saint Barthélemy", "BL", "590"],
    ["圣马丁（法属）", "Saint Martin", "MF", "590"],
    ["玻利维亚", "Bolivia", "BO", "591"],
    ["圭亚那", "Guyana", "GY", "592"],
    ["厄瓜多尔", "Ecuador", "EC", "593"],
    ["法属圭亚那", "French Guiana", "GF", "594"],
    ["巴拉圭", "Paraguay", "PY", "595"],
    ["马提尼克", "Martinique", "MQ", "596"],
    ["苏里南", "Suriname", "SR", "597"],
    ["乌拉圭", "Uruguay", "UY", "598"],
    ["库拉索", "Curaçao", "CW", "599"],
    ["博内尔", "Bonaire", "BQ", "599"],
    ["东帝汶", "Timor-Leste", "TL", "670"],
    ["诺福克岛", "Norfolk Island", "NF", "672"],
    ["文莱", "Brunei", "BN", "673"],
    ["瑙鲁", "Nauru", "NR", "674"],
    ["巴布亚新几内亚", "Papua New Guinea", "PG", "675"],
    ["汤加", "Tonga", "TO", "676"],
    ["所罗门群岛", "Solomon Islands", "SB", "677"],
    ["瓦努阿图", "Vanuatu", "VU", "678"],
    ["斐济", "Fiji", "FJ", "679"],
    ["帕劳", "Palau", "PW", "680"],
    ["瓦利斯和富图纳", "Wallis and Futuna", "WF", "681"],
    ["库克群岛", "Cook Islands", "CK", "682"],
    ["纽埃", "Niue", "NU", "683"],
    ["萨摩亚", "Samoa", "WS", "685"],
    ["基里巴斯", "Kiribati", "KI", "686"],
    ["新喀里多尼亚", "New Caledonia", "NC", "687"],
    ["图瓦卢", "Tuvalu", "TV", "688"],
    ["法属波利尼西亚", "French Polynesia", "PF", "689"],
    ["托克劳", "Tokelau", "TK", "690"],
    ["密克罗尼西亚", "Micronesia", "FM", "691"],
    ["马绍尔群岛", "Marshall Islands", "MH", "692"],
    ["俄罗斯", "Russia", "RU", "7"],
    ["哈萨克斯坦", "Kazakhstan", "KZ", "7"],
    ["朝鲜", "North Korea", "KP", "850"],
    ["中国香港", "Hong Kong", "HK", "852"],
    ["中国澳门", "Macao", "MO", "853"],
    ["柬埔寨", "Cambodia", "KH", "855"],
    ["老挝", "Laos", "LA", "856"],
    ["孟加拉国", "Bangladesh", "BD", "880"],
    ["中国台湾", "Taiwan", "TW", "886"],
    ["马尔代夫", "Maldives", "MV", "960"],
    ["黎巴嫩", "Lebanon", "LB", "961"],
    ["约旦", "Jordan", "JO", "962"],
    ["叙利亚", "Syria", "SY", "963"],
    ["伊拉克", "Iraq", "IQ", "964"],
    ["科威特", "Kuwait", "KW", "965"],
    ["沙特阿拉伯", "Saudi Arabia", "SA", "966"],
    ["也门", "Yemen", "YE", "967"],
    ["阿曼", "Oman", "OM", "968"],
    ["巴勒斯坦", "Palestine", "PS", "970"],
    ["阿联酋", "United Arab Emirates", "AE", "971"],
    ["以色列", "Israel", "IL", "972"],
    ["巴林", "Bahrain", "BH", "973"],
    ["卡塔尔", "Qatar", "QA", "974"],
    ["不丹", "Bhutan", "BT", "975"],
    ["蒙古", "Mongolia", "MN", "976"],
    ["尼泊尔", "Nepal", "NP", "977"],
    ["塔吉克斯坦", "Tajikistan", "TJ", "992"],
    ["土库曼斯坦", "Turkmenistan", "TM", "993"],
    ["阿塞拜疆", "Azerbaijan", "AZ", "994"],
    ["格鲁吉亚", "Georgia", "GE", "995"],
    ["吉尔吉斯斯坦", "Kyrgyzstan", "KG", "996"],
    ["乌兹别克斯坦", "Uzbekistan", "UZ", "998"]
];

function makeError(field, message) {
    var e = new Error(message);
    e.field = field;
    return e;
}

function trim(s) { return s.replace(/^\s+|\s+$/g, ''); }

function toPublic(row) {
    return { name: row[0], nameEn: row[1], iso: row[2], dialCode: row[3] };
}

/* 区号数字升序；同一区号按中文名排序 */
function compareRows(a, b) {
    var da = parseInt(a[3], 10), db = parseInt(b[3], 10);
    if (da !== db) { return da - db; }
    if (a[0] < b[0]) { return -1; }
    if (a[0] > b[0]) { return 1; }
    return 0;
}

var SORTED = DATA.slice().sort(compareRows);

var BY_ISO = {};
var BY_CODE = {};
(function buildIndex() {
    var i, row;
    for (i = 0; i < SORTED.length; i++) {
        row = SORTED[i];
        BY_ISO[row[2]] = row;
        if (!BY_CODE[row[3]]) { BY_CODE[row[3]] = []; }
        BY_CODE[row[3]].push(row);
    }
})();

/* ---------- 全部国家（区号升序、同区号按中文名排序） ---------- */
function getAllCountries() {
    var out = [], i;
    for (i = 0; i < SORTED.length; i++) { out.push(toPublic(SORTED[i])); }
    return out;
}

/* ---------- 国家搜索：中文名／英文名／ISO／区号即筛 ---------- */
function searchCountries(query) {
    if (typeof query !== 'string') {
        throw makeError('query', '搜索关键词须为字符串');
    }
    var q = trim(query);
    if (!q) { return getAllCountries(); }
    var qLower = q.toLowerCase();
    var out = [], i, row;
    for (i = 0; i < SORTED.length; i++) {
        row = SORTED[i];
        if (row[0].indexOf(q) !== -1 ||
            row[1].toLowerCase().indexOf(qLower) !== -1 ||
            row[2].toLowerCase().indexOf(qLower) !== -1 ||
            row[3].indexOf(q) !== -1) {
            out.push(toPublic(row));
        }
    }
    return out;
}

/* ---------- 按 ISO 查国家 ---------- */
function getByIso(iso) {
    if (typeof iso !== 'string' || !/^[A-Za-z]{2}$/.test(trim(iso))) {
        throw makeError('iso', 'ISO 二字码须为 2 位字母，如 CN、US');
    }
    var row = BY_ISO[trim(iso).toUpperCase()];
    if (!row) {
        throw makeError('iso', '未收录该 ISO 二字码：' + trim(iso).toUpperCase());
    }
    return toPublic(row);
}

/* ---------- 反向查区号：接受 +86／86／0086 三种写法 ---------- */
function normalizeDialCode(code) {
    if (typeof code !== 'string') {
        throw makeError('code', '区号须为字符串，如 +86、86 或 0086');
    }
    var s = trim(code);
    if (s.charAt(0) === '+') { s = s.slice(1); }
    else if (s.slice(0, 2) === '00') { s = s.slice(2); }
    if (!/^[0-9]+$/.test(s)) {
        throw makeError('code', '区号写法非法：只接受 +86、86 或 0086 形式的纯数字区号');
    }
    return s;
}

function getByDialCode(code) {
    var digits = normalizeDialCode(code);
    var rows = BY_CODE[digits] || [];
    var out = [], i;
    for (i = 0; i < rows.length; i++) { out.push(toPublic(rows[i])); }
    return out;
}

/* ---------- 拨号格式示例（占位号段，仅作格式演示） ---------- */
function formatExample(iso) {
    var c = getByIso(iso);
    return '+' + c.dialCode + ' 138 0000 0000（从中国拨打：00' + c.dialCode + ' 138 0000 0000）';
}

/* ---------- 号码解析：最长区号匹配，无法识别返回 null ---------- */
function parseNumber(input) {
    if (typeof input !== 'string') {
        throw makeError('input', '号码须为字符串');
    }
    var s = trim(input).replace(/[\s\-]/g, '');
    var rest = null;
    if (s.charAt(0) === '+') { rest = s.slice(1); }
    else if (s.slice(0, 2) === '00') { rest = s.slice(2); }
    else { return null; }
    if (!/^[0-9]+$/.test(rest)) { return null; }
    var len, prefix;
    for (len = 4; len >= 1; len--) {
        if (rest.length <= len) { continue; }
        prefix = rest.slice(0, len);
        if (BY_CODE[prefix]) {
            return {
                dialCode: prefix,
                nationalNumber: rest.slice(len),
                countries: getByDialCode(prefix)
            };
        }
    }
    return null;
}

var API = {
    getAllCountries: getAllCountries,
    searchCountries: searchCountries,
    getByIso: getByIso,
    getByDialCode: getByDialCode,
    formatExample: formatExample,
    parseNumber: parseNumber
};

if (typeof window !== 'undefined') window.DialCodeLookup = API;
if (typeof module !== 'undefined' && module.exports) module.exports = API;

/* ================= 浏览器绑定（DOM 只做浏览器端） ================= */
if (typeof document !== 'undefined') {
    (function () {
        function $(id) { return document.getElementById(id); }
        function esc(s) {
            return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
                .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        }
        function copyText(text, okMsg) {
            var tip = $('dc-tip');
            function done(msg) {
                if (tip) { tip.textContent = msg; tip.style.display = 'block'; }
            }
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).then(function () { done(okMsg); },
                    function () { fallbackCopy(text, okMsg, done); });
            } else {
                fallbackCopy(text, okMsg, done);
            }
        }
        function fallbackCopy(text, okMsg, done) {
            var ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            try { document.execCommand('copy'); done(okMsg); }
            catch (e) { done('复制失败，请手动选择复制。'); }
            document.body.removeChild(ta);
        }

        /* 常用国家速查一键填入：中国／美国／英国／日本／韩国／新加坡／香港／台湾／澳大利亚／德国 */
        var QUICK = ['CN', 'US', 'GB', 'JP', 'KR', 'SG', 'HK', 'TW', 'AU', 'DE'];
        var current = null; /* 当前选中国家（公开对象） */
        var lastSearch = [];

        function renderStats() {
            var el = $('dc-stats');
            if (!el) { return; }
            var all = getAllCountries();
            var groups = {}, i;
            for (i = 0; i < all.length; i++) { groups[all[i].dialCode] = (groups[all[i].dialCode] || 0) + 1; }
            var shared = 0;
            for (var k in groups) { if (groups[k] > 1) { shared++; } }
            el.innerHTML = '<div><b>' + all.length + '</b> 个国家／地区已收录</div>' +
                '<div><b>' + shared + '</b> 组共享区号（多国共用同一区号）</div>' +
                '<div>当前筛选：<b>' + lastSearch.length + '</b> 个结果</div>' +
                '<div>数据基准：ITU E.164，核对日期 <b>2026-11-07</b></div>';
        }

        function countryLine(c) {
            return '<button type="button" class="dc-item" data-iso="' + c.iso + '">' +
                '<span class="dc-item-name">' + esc(c.name) + ' <span class="dc-item-en">' + esc(c.nameEn) + '</span></span>' +
                '<span class="dc-item-code">+' + c.dialCode + ' · ' + c.iso + '</span></button>';
        }

        function renderList(list) {
            var el = $('dc-list');
            if (!el) { return; }
            lastSearch = list;
            if (!list.length) {
                el.innerHTML = '<span class="dc-muted">没有匹配的国家／地区：换个关键词试试（中文名／英文名／ISO／区号均可）。</span>';
            } else {
                var html = '', i;
                for (i = 0; i < list.length; i++) { html += countryLine(list[i]); }
                el.innerHTML = html;
                var items = el.querySelectorAll('.dc-item');
                for (i = 0; i < items.length; i++) {
                    items[i].addEventListener('click', function () { selectCountry(this.getAttribute('data-iso')); });
                }
            }
            renderStats();
        }

        function selectCountry(iso) {
            var c;
            try { c = getByIso(iso); } catch (e) { return; }
            current = c;
            var detail = $('dc-detail');
            if (detail) {
                var shared = getByDialCode(c.dialCode);
                var sharedNote = '';
                if (shared.length > 1) {
                    var names = [], i;
                    for (i = 0; i < shared.length; i++) { names.push(shared[i].name); }
                    sharedNote = '<p class="dc-hint">注意：+' + c.dialCode + ' 由多国共享（' + esc(names.join('、')) + '），拨打前请结合国家名确认。</p>';
                }
                detail.innerHTML =
                    '<div class="dc-big">+' + c.dialCode + '</div>' +
                    '<div class="dc-meta"><b>' + esc(c.name) + '</b> · ' + esc(c.nameEn) + ' · ISO ' + c.iso + '</div>' +
                    '<div class="dc-example"><div>拨号格式示例（占位号段，仅作格式演示）：</div>' +
                    '<code>' + esc(formatExample(c.iso)) + '</code></div>' +
                    sharedNote +
                    '<div class="dc-actions">' +
                    '<button type="button" class="dc-btn" id="dc-copy-code"><i class="material-icons">content_copy</i>复制区号 +' + c.dialCode + '</button>' +
                    '<button type="button" class="dc-btn" id="dc-copy-example"><i class="material-icons">content_copy</i>复制拨号示例</button>' +
                    '</div>';
                var cc = $('dc-copy-code');
                if (cc) { cc.addEventListener('click', function () { copyText('+' + c.dialCode, '已复制区号 +' + c.dialCode + '。'); }); }
                var ce = $('dc-copy-example');
                if (ce) { ce.addEventListener('click', function () { copyText(formatExample(c.iso), '已复制拨号示例。'); }); }
            }
            var q = $('dc-search');
            if (q) { q.value = c.name; }
            renderList(searchCountries(c.name));
        }

        function doReverse() {
            var input = $('dc-reverse');
            var out = $('dc-reverse-result');
            if (!input || !out) { return; }
            var v = trim(input.value);
            if (!v) { out.innerHTML = '<span class="dc-muted">输入区号（如 +86、86 或 0086）即可反查国家。</span>'; return; }
            var list;
            try { list = getByDialCode(v); }
            catch (e) { out.innerHTML = '<span class="dc-err">' + esc(e.message) + '</span>'; return; }
            if (!list.length) {
                out.innerHTML = '<span class="dc-muted">未找到区号 ' + esc(v) + ' 对应的国家：请检查区号是否正确，或以 ITU 公布为准。</span>';
                return;
            }
            var html = '<div>区号 <b>+' + list[0].dialCode + '</b> 对应 <b>' + list.length + '</b> 个国家／地区：</div>', i;
            for (i = 0; i < list.length; i++) {
                html += '<div class="dc-rev-item">' + esc(list[i].name) + '（' + esc(list[i].nameEn) + ' · ' + list[i].iso + '）</div>';
            }
            if (list.length > 1) { html += '<p class="dc-hint">该区号由多国共享，拨打前请结合国家名确认。</p>'; }
            out.innerHTML = html;
        }

        function doParse() {
            var input = $('dc-parse');
            var out = $('dc-parse-result');
            if (!input || !out) { return; }
            var v = trim(input.value);
            if (!v) { out.innerHTML = '<span class="dc-muted">粘贴一串以 + 或 00 开头的国际号码即可解析。</span>'; return; }
            var r;
            try { r = parseNumber(v); }
            catch (e) { out.innerHTML = '<span class="dc-err">' + esc(e.message) + '</span>'; return; }
            if (!r) {
                out.innerHTML = '<span class="dc-err">无法识别：号码须以 + 或 00 开头，且开头须为已收录的国家区号；本工具不猜测，请检查号码。</span>';
                return;
            }
            var names = [], i;
            for (i = 0; i < r.countries.length; i++) { names.push(r.countries[i].name + '（' + r.countries[i].iso + '）'); }
            out.innerHTML = '<div>区号：<b>+' + r.dialCode + '</b></div>' +
                '<div>本地号码：<b>' + esc(r.nationalNumber) + '</b></div>' +
                '<div>所属国家／地区：<b>' + esc(names.join('、')) + '</b></div>' +
                (r.countries.length > 1 ? '<p class="dc-hint">该区号由多国共享，请结合国家名确认。</p>' : '');
        }

        function buildResultText() {
            var lines = ['国际电话区号查询结果（数据基准：ITU E.164，核对日期 2026-11-07）'];
            if (current) {
                lines.push('选中国家：' + current.name + '（' + current.nameEn + ' · ' + current.iso + '）区号 +' + current.dialCode);
                lines.push('拨号示例：' + formatExample(current.iso));
            }
            lines.push('当前筛选结果 ' + lastSearch.length + ' 个：');
            var i;
            for (i = 0; i < lastSearch.length; i++) {
                lines.push('+' + lastSearch[i].dialCode + ' ' + lastSearch[i].name + '（' + lastSearch[i].nameEn + ' · ' + lastSearch[i].iso + '）');
            }
            return lines.join('\n');
        }

        function clearAll() {
            var q = $('dc-search'), rv = $('dc-reverse'), pv = $('dc-parse');
            if (q) { q.value = ''; }
            if (rv) { rv.value = ''; }
            if (pv) { pv.value = ''; }
            current = null;
            var detail = $('dc-detail');
            if (detail) { detail.innerHTML = '<span class="dc-muted">点上方列表中的国家，这里显示它的区号与拨号格式示例。</span>'; }
            var rr = $('dc-reverse-result');
            if (rr) { rr.innerHTML = '<span class="dc-muted">输入区号（如 +86、86 或 0086）即可反查国家。</span>'; }
            var pr = $('dc-parse-result');
            if (pr) { pr.innerHTML = '<span class="dc-muted">粘贴一串以 + 或 00 开头的国际号码即可解析。</span>'; }
            var tip = $('dc-tip');
            if (tip) { tip.style.display = 'none'; tip.textContent = ''; }
            renderList(getAllCountries());
        }

        document.addEventListener('DOMContentLoaded', function () {
            var q = $('dc-search');
            if (q) {
                q.addEventListener('input', function () {
                    try { renderList(searchCountries(q.value)); }
                    catch (e) { renderList(getAllCountries()); }
                });
            }
            var rv = $('dc-reverse');
            if (rv) { rv.addEventListener('input', doReverse); }
            var pv = $('dc-parse');
            if (pv) { pv.addEventListener('input', doParse); }
            var quick = $('dc-quick');
            if (quick) {
                var html = '', i, c;
                for (i = 0; i < QUICK.length; i++) {
                    c = getByIso(QUICK[i]);
                    html += '<button type="button" class="dc-chip" data-iso="' + c.iso + '">' + esc(c.name) + ' +' + c.dialCode + '</button>';
                }
                quick.innerHTML = html;
                var chips = quick.querySelectorAll('.dc-chip');
                for (i = 0; i < chips.length; i++) {
                    chips[i].addEventListener('click', function () { selectCountry(this.getAttribute('data-iso')); });
                }
            }
            var copyBtn = $('dc-copy-btn');
            if (copyBtn) {
                copyBtn.addEventListener('click', function () {
                    if (!current && !lastSearch.length) {
                        var tip = $('dc-tip');
                        if (tip) { tip.textContent = '暂无可复制的结果：请先搜索或选择国家。'; tip.style.display = 'block'; }
                        return;
                    }
                    copyText(buildResultText(), '已复制查询结果。');
                });
            }
            var clearBtn = $('dc-clear');
            if (clearBtn) { clearBtn.addEventListener('click', clearAll); }
            renderList(getAllCountries());
        });
    })();
}

})();
