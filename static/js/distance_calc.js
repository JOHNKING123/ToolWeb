/* 两地距离计算器 - 纯前端工具：
 * ① 输入：两组十进制经纬度（纬度 ±90、经度 ±180 范围校验）
 * ② 内置 ≥30 城市坐标速查表，点选回填
 * ③ Haversine 公式（R=6371.0088 km）大圆距离，km/mi/nmi 三单位切换
 * ④ 输出保留 2 位小数 ＋ 等效参照文案（跑道圈数/赤道百分比）
 * ⑤ 3 组示例一键填充 ＋ 一键复制 ＋ localStorage 本地保存
 * ⑥ 纯前端零上传
 *
 * 纯函数契约（浏览器/Node 通用；非法参数抛 Error，err.field 给出字段名，不静默钳制）：
 * haversine(lat1, lon1, lat2, lon2) -> km（大圆距离，R=6371.0088 km）。
 *   纬度须为 [-90, 90] 有限数字，否则 err.field='lat1'/'lat2'；
 *   经度须为 [-180, 180] 有限数字，否则 err.field='lon1'/'lon2'。
 * convertKm(km, unit) -> 按单位换算后保留 2 位小数的数字。
 *   km 须为有限非负数（err.field='km'）；unit ∈ {'km','mi','nmi'}（err.field='unit'）。
 *   换算因子精确值：1 mi = 1.609344 km（国际英里定义），1 nmi = 1.852 km。
 * cityList() -> ≥30 城市数组 [{name, country, lat, lon}]。
 * refText(km) -> 等效参照文案（标准跑道圈数＋赤道周长百分比）字符串。
 *   km 须为有限非负数（err.field='km'）。
 *
 * 浏览器内运行：文件尾部把 init 挂到 DOMContentLoaded；挂 window.DistanceCalc。
 * Node 自测：module.exports 暴露纯函数。
 */
(function () {
'use strict';

/* ---------------- 基础工具 ---------------- */

var PI = Math.PI;
var R_KM = 6371.0088;          // 平均地球半径（IUGG 推荐值）
var MI_PER_KM = 1 / 1.609344;  // 1 km = 0.621371... mi（国际英里精确定义）
var NMI_PER_KM = 1 / 1.852;    // 1 km = 0.539957... nmi（海里精确定义）
var TRACK_M = 400;             // 标准田径跑道周长（米）
var EQUATOR_KM = 2 * PI * R_KM; // 赤道周长 ≈ 40030.17 km
var STORE_KEY = 'distance_calc_v1';

function mkErr(field, msg) {
  var e = new Error(msg);
  e.field = field;
  return e;
}

function checkLat(v, field) {
  if (typeof v !== 'number' || !isFinite(v)) {
    throw mkErr(field, '纬度 ' + field + ' 必须为有限数字');
  }
  if (v < -90 || v > 90) {
    throw mkErr(field, '纬度 ' + field + ' 超出范围 [-90, 90]，实得 ' + v);
  }
  return v;
}

function checkLon(v, field) {
  if (typeof v !== 'number' || !isFinite(v)) {
    throw mkErr(field, '经度 ' + field + ' 必须为有限数字');
  }
  if (v < -180 || v > 180) {
    throw mkErr(field, '经度 ' + field + ' 超出范围 [-180, 180]，实得 ' + v);
  }
  return v;
}

function checkKm(v) {
  if (typeof v !== 'number' || !isFinite(v)) {
    throw mkErr('km', '距离必须为有限数字');
  }
  if (v < 0) {
    throw mkErr('km', '距离不能为负数，实得 ' + v);
  }
  return v;
}

function checkUnit(unit) {
  if (unit !== 'km' && unit !== 'mi' && unit !== 'nmi') {
    throw mkErr('unit', "单位必须为 'km'（公里）/ 'mi'（英里）/ 'nmi'（海里）");
  }
  return unit;
}

/* ---------------- 纯函数：Haversine ---------------- */

function haversine(lat1, lon1, lat2, lon2) {
  checkLat(lat1, 'lat1');
  checkLon(lon1, 'lon1');
  checkLat(lat2, 'lat2');
  checkLon(lon2, 'lon2');
  var dLat = (lat2 - lat1) * PI / 180;
  var dLon = (lon2 - lon1) * PI / 180;
  var r1 = lat1 * PI / 180;
  var r2 = lat2 * PI / 180;
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(r1) * Math.cos(r2) *
          Math.sin(dLon / 2) * Math.sin(dLon / 2);
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R_KM * c;
}

/* ---------------- 纯函数：单位换算 ---------------- */

function convertKm(km, unit) {
  checkKm(km);
  checkUnit(unit);
  var v = km;
  if (unit === 'mi') { v = km * MI_PER_KM; }
  else if (unit === 'nmi') { v = km * NMI_PER_KM; }
  return Math.round(v * 100) / 100;
}

function unitLabel(unit) {
  checkUnit(unit);
  if (unit === 'mi') { return 'mi（英里）'; }
  if (unit === 'nmi') { return 'nmi（海里）'; }
  return 'km（公里）';
}

/* ---------------- 纯函数：城市速查表 ---------------- */

var CITIES = [
  { name: '北京',   country: '中国',       lat: 39.9042,  lon: 116.4074 },
  { name: '上海',   country: '中国',       lat: 31.2304,  lon: 121.4737 },
  { name: '广州',   country: '中国',       lat: 23.1291,  lon: 113.2644 },
  { name: '深圳',   country: '中国',       lat: 22.5431,  lon: 114.0579 },
  { name: '香港',   country: '中国',       lat: 22.3193,  lon: 114.1694 },
  { name: '台北',   country: '中国',       lat: 25.0330,  lon: 121.5654 },
  { name: '东京',   country: '日本',       lat: 35.6762,  lon: 139.6503 },
  { name: '大阪',   country: '日本',       lat: 34.6937,  lon: 135.5023 },
  { name: '首尔',   country: '韩国',       lat: 37.5665,  lon: 126.9780 },
  { name: '新加坡', country: '新加坡',     lat: 1.3521,   lon: 103.8198 },
  { name: '曼谷',   country: '泰国',       lat: 13.7563,  lon: 100.5018 },
  { name: '吉隆坡', country: '马来西亚',   lat: 3.1390,   lon: 101.6869 },
  { name: '雅加达', country: '印度尼西亚', lat: -6.2088,  lon: 106.8456 },
  { name: '马尼拉', country: '菲律宾',     lat: 14.5995,  lon: 120.9842 },
  { name: '新德里', country: '印度',       lat: 28.6139,  lon: 77.2090 },
  { name: '孟买',   country: '印度',       lat: 19.0760,  lon: 72.8777 },
  { name: '迪拜',   country: '阿联酋',     lat: 25.2048,  lon: 55.2708 },
  { name: '利雅得', country: '沙特阿拉伯', lat: 24.7136,  lon: 46.6753 },
  { name: '悉尼',   country: '澳大利亚',   lat: -33.8688, lon: 151.2093 },
  { name: '墨尔本', country: '澳大利亚',   lat: -37.8136, lon: 144.9631 },
  { name: '奥克兰', country: '新西兰',     lat: -36.8485, lon: 174.7633 },
  { name: '莫斯科', country: '俄罗斯',     lat: 55.7558,  lon: 37.6173 },
  { name: '伦敦',   country: '英国',       lat: 51.5074,  lon: -0.1278 },
  { name: '巴黎',   country: '法国',       lat: 48.8566,  lon: 2.3522 },
  { name: '柏林',   country: '德国',       lat: 52.5200,  lon: 13.4050 },
  { name: '马德里', country: '西班牙',     lat: 40.4168,  lon: -3.7038 },
  { name: '罗马',   country: '意大利',     lat: 41.9028,  lon: 12.4964 },
  { name: '阿姆斯特丹', country: '荷兰',   lat: 52.3676,  lon: 4.9041 },
  { name: '苏黎世', country: '瑞士',       lat: 47.3769,  lon: 8.5417 },
  { name: '伊斯坦布尔', country: '土耳其', lat: 41.0082,  lon: 28.9784 },
  { name: '开罗',   country: '埃及',       lat: 30.0444,  lon: 31.2357 },
  { name: '开普敦', country: '南非',       lat: -33.9249, lon: 18.4241 },
  { name: '纽约',   country: '美国',       lat: 40.7128,  lon: -74.0060 },
  { name: '洛杉矶', country: '美国',       lat: 34.0522,  lon: -118.2437 },
  { name: '旧金山', country: '美国',       lat: 37.7749,  lon: -122.4194 },
  { name: '芝加哥', country: '美国',       lat: 41.8781,  lon: -87.6298 },
  { name: '华盛顿', country: '美国',       lat: 38.9072,  lon: -77.0369 },
  { name: '多伦多', country: '加拿大',     lat: 43.6532,  lon: -79.3832 },
  { name: '温哥华', country: '加拿大',     lat: 49.2827,  lon: -123.1207 },
  { name: '圣保罗', country: '巴西',       lat: -23.5558, lon: -46.6396 }
];

function cityList() {
  return CITIES.map(function (c) {
    return { name: c.name, country: c.country, lat: c.lat, lon: c.lon };
  });
}

/* ---------------- 纯函数：等效参照文案 ---------------- */

function refText(km) {
  checkKm(km);
  var laps = km * 1000 / TRACK_M;
  var pct = km / EQUATOR_KM * 100;
  return '≈' + laps.toFixed(1) + ' 圈标准田径跑道（400 米）' +
         ' · 约占赤道周长（约 40030 km）的 ' + pct.toFixed(2) + '%';
}

var DistanceCalc = {
  haversine: haversine,
  convertKm: convertKm,
  unitLabel: unitLabel,
  cityList: cityList,
  refText: refText,
  R_KM: R_KM
};

/* ---------------- 浏览器 UI ---------------- */

var SAMPLES = [
  { label: '示例① 北京→纽约', a: [39.9042, 116.4074], b: [40.7128, -74.0060], cityA: '北京', cityB: '纽约' },
  { label: '示例② 伦敦→巴黎', a: [51.5074, -0.1278], b: [48.8566, 2.3522], cityA: '伦敦', cityB: '巴黎' },
  { label: '示例③ 上海→悉尼', a: [31.2304, 121.4737], b: [-33.8688, 151.2093], cityA: '上海', cityB: '悉尼' }
];

function $(id) {
  return document.getElementById(id);
}

function toast(msg) {
  var t = $('dc-toast');
  if (!t) { return; }
  t.textContent = msg;
  t.style.display = 'block';
  clearTimeout(t._h);
  t._h = setTimeout(function () { t.style.display = 'none'; }, 2200);
}

function showError(msg) {
  var e = $('dc-error');
  if (!e) { return; }
  e.textContent = msg;
  e.style.display = msg ? 'block' : 'none';
}

function currentUnit() {
  var r = document.querySelector('input[name="dc-unit"]:checked');
  return r ? r.value : 'km';
}

function readNum(id) {
  var s = $(id).value.trim();
  if (s === '') { return null; }
  var v = Number(s);
  return v;
}

function buildCityOptions(sel) {
  var opts = ['<option value="">— 自定义输入 —</option>'];
  CITIES.forEach(function (c, i) {
    opts.push('<option value="' + i + '">' + c.name + '（' + c.country + '）</option>');
  });
  sel.innerHTML = opts.join('');
}

function fillPoint(suffix, lat, lon) {
  $('dc-lat-' + suffix).value = lat;
  $('dc-lon-' + suffix).value = lon;
}

function saveLocal() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({
      latA: $('dc-lat-a').value, lonA: $('dc-lon-a').value,
      latB: $('dc-lat-b').value, lonB: $('dc-lon-b').value,
      unit: currentUnit()
    }));
  } catch (e) { /* 忽略 */ }
}

function loadLocal() {
  try {
    var raw = localStorage.getItem(STORE_KEY);
    if (!raw) { return; }
    var data = JSON.parse(raw);
    ['latA', 'lonA', 'latB', 'lonB'].forEach(function (k) {
      if (typeof data[k] === 'string' && data[k] !== '') {
        $('dc-' + k.replace(/([A-Z])/, function (m, p) { return '-' + p.toLowerCase(); })).value = data[k];
      }
    });
    if (data.unit) {
      var r = document.querySelector('input[name="dc-unit"][value="' + data.unit + '"]');
      if (r) { r.checked = true; }
    }
  } catch (e) { /* 忽略 */ }
}

function render() {
  var box = $('dc-result');
  var latA = readNum('dc-lat-a'), lonA = readNum('dc-lon-a');
  var latB = readNum('dc-lat-b'), lonB = readNum('dc-lon-b');
  var unit = currentUnit();
  if (latA === null || lonA === null || latB === null || lonB === null) {
    box.style.display = 'none';
    showError('');
    saveLocal();
    return;
  }
  try {
    var km = haversine(latA, lonA, latB, lonB);
    var val = convertKm(km, unit);
    $('dc-value').textContent = val.toFixed(2);
    $('dc-unitname').textContent = unitLabel(unit);
    $('dc-kmline').textContent = '大圆距离 ' + km.toFixed(2) + ' km（保留 2 位小数）';
    $('dc-ref').textContent = refText(km);
    box.style.display = 'block';
    showError('');
    saveLocal();
    box._lastCopy = '两地距离：' + km.toFixed(2) + ' km（=' + val.toFixed(2) + ' ' + unit + '）；' + refText(km);
  } catch (e) {
    box.style.display = 'none';
    showError('输入有误：' + e.message);
    saveLocal();
  }
}

function fillSample(i) {
  var s = SAMPLES[i];
  var sa = $('dc-city-a'), sb = $('dc-city-b');
  sa.selectedIndex = CITIES.findIndex(function (c) { return c.name === s.cityA; }) + 1;
  sb.selectedIndex = CITIES.findIndex(function (c) { return c.name === s.cityB; }) + 1;
  fillPoint('a', s.a[0], s.a[1]);
  fillPoint('b', s.b[0], s.b[1]);
  render();
}

function swapPoints() {
  var la = $('dc-lat-a').value, lo = $('dc-lon-a').value;
  var ca = $('dc-city-a').selectedIndex;
  $('dc-lat-a').value = $('dc-lat-b').value;
  $('dc-lon-a').value = $('dc-lon-b').value;
  $('dc-lat-b').value = la;
  $('dc-lon-b').value = lo;
  $('dc-city-a').selectedIndex = $('dc-city-b').selectedIndex;
  $('dc-city-b').selectedIndex = ca;
  render();
}

function copyResult() {
  var box = $('dc-result');
  var text = box && box._lastCopy ? box._lastCopy : '（请先输入两组有效经纬度）';
  function done() { toast('已复制到剪贴板'); }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done, function () { toast('复制失败，请手动选择复制'); });
  } else {
    var ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); done(); }
    catch (e) { toast('复制失败，请手动选择复制'); }
    document.body.removeChild(ta);
  }
}

function clearAll() {
  ['dc-lat-a', 'dc-lon-a', 'dc-lat-b', 'dc-lon-b'].forEach(function (id) { $(id).value = ''; });
  $('dc-city-a').selectedIndex = 0;
  $('dc-city-b').selectedIndex = 0;
  render();
}

function init() {
  if (!$('distance-app')) { return; }
  buildCityOptions($('dc-city-a'));
  buildCityOptions($('dc-city-b'));
  loadLocal();
  $('dc-city-a').addEventListener('change', function () {
    var i = this.selectedIndex - 1;
    if (i >= 0) { fillPoint('a', CITIES[i].lat, CITIES[i].lon); }
    render();
  });
  $('dc-city-b').addEventListener('change', function () {
    var i = this.selectedIndex - 1;
    if (i >= 0) { fillPoint('b', CITIES[i].lat, CITIES[i].lon); }
    render();
  });
  ['dc-lat-a', 'dc-lon-a', 'dc-lat-b', 'dc-lon-b'].forEach(function (id) {
    $(id).addEventListener('input', render);
  });
  document.querySelectorAll('input[name="dc-unit"]').forEach(function (r) {
    r.addEventListener('change', render);
  });
  $('dc-swap').addEventListener('click', swapPoints);
  SAMPLES.forEach(function (s, i) {
    var btn = document.createElement('button');
    btn.className = 'btn btn-secondary';
    btn.type = 'button';
    btn.textContent = s.label;
    btn.addEventListener('click', function () { fillSample(i); });
    $('dc-samples').appendChild(btn);
  });
  $('dc-copy').addEventListener('click', copyResult);
  $('dc-clear').addEventListener('click', clearAll);
  render();
}

if (typeof window !== 'undefined') {
  window.DistanceCalc = DistanceCalc;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = DistanceCalc;
}

})();
