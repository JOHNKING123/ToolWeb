/* 简历预检工具 - 纯前端：JD关键词匹配 / ATS友好度检测 / 逻辑链检查 / 雷区清单，无任何网络请求 */
(function () {
'use strict';

/* ============ 技术栈词典：n=名称, a=别名, c=方向 ============ */
var CAT_NAMES = {lang:"编程语言",fe:"前端",be:"后端",db:"数据库/中间件",mobile:"移动端",test:"测试",ops:"运维/DevOps",pm:"产品/运营",ai:"AI/算法",soft:"通用/软技能"};
var TECH_DICT = [
/* ---- 编程语言 ---- */
{n:"Java",a:["Java8","Java 8","JDK"],c:"lang"},
{n:"Python",a:["Python3","Python 3"],c:"lang"},
{n:"Go",a:["Golang","Go语言"],c:"lang"},
{n:"C",a:["C语言"],c:"lang"},
{n:"C++",a:[],c:"lang"},
{n:"C#",a:["C Sharp"],c:"lang"},
{n:"JavaScript",a:["JS","ECMAScript","ES6","ES2015"],c:"lang"},
{n:"TypeScript",a:["TS"],c:"lang"},
{n:"Kotlin",a:[],c:"lang"},
{n:"Swift",a:[],c:"lang"},
{n:"PHP",a:[],c:"lang"},
{n:"Ruby",a:[],c:"lang"},
{n:"Rust",a:[],c:"lang"},
{n:"Scala",a:[],c:"lang"},
{n:"SQL",a:[],c:"lang"},
{n:"Shell",a:["Bash","Shell脚本"],c:"lang"},
{n:"Lua",a:[],c:"lang"},
{n:"Dart",a:[],c:"lang"},
{n:"Objective-C",a:["OC"],c:"lang"},
{n:"R",a:["R语言"],c:"lang"},
{n:"Perl",a:[],c:"lang"},
{n:"VBA",a:[],c:"lang"},
/* ---- 前端 ---- */
{n:"Vue",a:["Vue.js","Vue2","Vue3"],c:"fe"},
{n:"React",a:["React.js"],c:"fe"},
{n:"Angular",a:["AngularJS","Angular.js"],c:"fe"},
{n:"HTML",a:["HTML5"],c:"fe"},
{n:"CSS",a:["CSS3"],c:"fe"},
{n:"jQuery",a:["JQuery"],c:"fe"},
{n:"Bootstrap",a:[],c:"fe"},
{n:"Tailwind",a:["TailwindCSS","Tailwind CSS"],c:"fe"},
{n:"Element UI",a:["ElementUI","Element-UI"],c:"fe"},
{n:"Ant Design",a:["antd","AntD"],c:"fe"},
{n:"Uni-app",a:["uniapp","uni-app"],c:"fe"},
{n:"微信小程序",a:["小程序"],c:"fe"},
{n:"Taro",a:[],c:"fe"},
{n:"Nuxt.js",a:["Nuxt"],c:"fe"},
{n:"Next.js",a:["Next"],c:"fe"},
{n:"Vite",a:[],c:"fe"},
{n:"Webpack",a:["webpack"],c:"fe"},
{n:"Less",a:[],c:"fe"},
{n:"Sass",a:["SCSS","Sass/SCSS"],c:"fe"},
{n:"ECharts",a:["echarts"],c:"fe"},
{n:"Three.js",a:["Threejs","ThreeJS"],c:"fe"},
{n:"Electron",a:[],c:"fe"},
{n:"Axios",a:[],c:"fe"},
{n:"Pinia",a:["Vuex"],c:"fe"},
{n:"Redux",a:[],c:"fe"},
{n:"MVVM",a:[],c:"fe"},
{n:"SPA",a:["单页应用"],c:"fe"},
{n:"PWA",a:[],c:"fe"},
{n:"微前端",a:["qiankun","single-spa","Micro-Frontends"],c:"fe"},
{n:"SSR",a:["服务端渲染"],c:"fe"},
{n:"Canvas",a:[],c:"fe"},
{n:"WebGL",a:[],c:"fe"},
{n:"H5",a:[],c:"fe"},
{n:"响应式",a:["响应式布局","Responsive"],c:"fe"},
/* ---- 后端 ---- */
{n:"Spring",a:[],c:"be"},
{n:"Spring Boot",a:["SpringBoot"],c:"be"},
{n:"Spring Cloud",a:["SpringCloud"],c:"be"},
{n:"Spring MVC",a:["SpringMVC"],c:"be"},
{n:"MyBatis",a:[],c:"be"},
{n:"MyBatis-Plus",a:["MyBatisPlus","MP"],c:"be"},
{n:"Hibernate",a:[],c:"be"},
{n:"Dubbo",a:[],c:"be"},
{n:"gRPC",a:["GRPC"],c:"be"},
{n:"RESTful",a:["REST API","Restful","REST"],c:"be"},
{n:"GraphQL",a:[],c:"be"},
{n:"Django",a:[],c:"be"},
{n:"Flask",a:[],c:"be"},
{n:"FastAPI",a:[],c:"be"},
{n:"Node.js",a:["Node"],c:"be"},
{n:"Express",a:["Express.js"],c:"be"},
{n:"Koa",a:["Koa2"],c:"be"},
{n:"NestJS",a:["Nest.js","Nest"],c:"be"},
{n:"Gin",a:[],c:"be"},
{n:"Laravel",a:[],c:"be"},
{n:".NET",a:["DotNet",".NET Core","ASP.NET"],c:"be"},
{n:"Ruby on Rails",a:["Rails"],c:"be"},
{n:"Struts",a:["Struts2"],c:"be"},
{n:"微服务",a:["Microservices"],c:"be"},
{n:"分布式",a:["分布式系统"],c:"be"},
{n:"高并发",a:[],c:"be"},
{n:"缓存",a:["Cache"],c:"be"},
{n:"消息队列",a:["MQ"],c:"be"},
{n:"定时任务",a:["Quartz","XXL-JOB"],c:"be"},
{n:"JWT",a:[],c:"be"},
{n:"OAuth2",a:["OAuth"],c:"be"},
{n:"Shiro",a:[],c:"be"},
/* ---- 数据库/中间件 ---- */
{n:"MySQL",a:[],c:"db"},
{n:"PostgreSQL",a:["PG","Postgres"],c:"db"},
{n:"Oracle",a:[],c:"db"},
{n:"SQL Server",a:["MSSQL"],c:"db"},
{n:"MongoDB",a:["Mongo"],c:"db"},
{n:"Redis",a:[],c:"db"},
{n:"Elasticsearch",a:["ES","ElasticSearch"],c:"db"},
{n:"Kafka",a:[],c:"db"},
{n:"RabbitMQ",a:[],c:"db"},
{n:"RocketMQ",a:[],c:"db"},
{n:"Memcached",a:[],c:"db"},
{n:"SQLite",a:[],c:"db"},
{n:"TiDB",a:[],c:"db"},
{n:"ClickHouse",a:["CK"],c:"db"},
{n:"Hive",a:[],c:"db"},
{n:"HBase",a:[],c:"db"},
{n:"Zookeeper",a:["ZK","ZooKeeper"],c:"db"},
{n:"Nginx",a:[],c:"db"},
{n:"Tomcat",a:[],c:"db"},
{n:"分库分表",a:["ShardingSphere","Mycat"],c:"db"},
/* ---- 移动端 ---- */
{n:"Android",a:["安卓"],c:"mobile"},
{n:"iOS",a:["IOS"],c:"mobile"},
{n:"Flutter",a:[],c:"mobile"},
{n:"React Native",a:["RN"],c:"mobile"},
{n:"HarmonyOS",a:["鸿蒙","Harmony"],c:"mobile"},
{n:"Jetpack",a:["Jetpack Compose"],c:"mobile"},
{n:"SwiftUI",a:[],c:"mobile"},
{n:"快应用",a:[],c:"mobile"},
{n:"混合开发",a:["Hybrid"],c:"mobile"},
{n:"热更新",a:[],c:"mobile"},
{n:"原生开发",a:["Native开发"],c:"mobile"},
{n:"App Store",a:["应用上架"],c:"mobile"},
/* ---- 测试 ---- */
{n:"Selenium",a:[],c:"test"},
{n:"Appium",a:[],c:"test"},
{n:"JMeter",a:["jmeter"],c:"test"},
{n:"Postman",a:[],c:"test"},
{n:"TestNG",a:[],c:"test"},
{n:"JUnit",a:[],c:"test"},
{n:"接口测试",a:["API测试"],c:"test"},
{n:"自动化测试",a:[],c:"test"},
{n:"性能测试",a:[],c:"test"},
{n:"压力测试",a:[],c:"test"},
{n:"单元测试",a:[],c:"test"},
{n:"集成测试",a:[],c:"test"},
{n:"黑盒测试",a:[],c:"test"},
{n:"白盒测试",a:[],c:"test"},
{n:"用例设计",a:["测试用例"],c:"test"},
{n:"缺陷管理",a:["Bug管理"],c:"test"},
{n:"Fiddler",a:[],c:"test"},
{n:"Charles",a:[],c:"test"},
{n:"LoadRunner",a:["LR"],c:"test"},
{n:"禅道",a:["Zentao"],c:"test"},
{n:"冒烟测试",a:[],c:"test"},
{n:"回归测试",a:[],c:"test"},
/* ---- 运维/DevOps ---- */
{n:"Linux",a:[],c:"ops"},
{n:"Docker",a:[],c:"ops"},
{n:"Kubernetes",a:["K8s","k8s"],c:"ops"},
{n:"Jenkins",a:[],c:"ops"},
{n:"GitLab CI",a:["GitLab"],c:"ops"},
{n:"GitHub Actions",a:[],c:"ops"},
{n:"Ansible",a:[],c:"ops"},
{n:"Terraform",a:[],c:"ops"},
{n:"Prometheus",a:[],c:"ops"},
{n:"Grafana",a:[],c:"ops"},
{n:"Zabbix",a:[],c:"ops"},
{n:"ELK",a:["Elastic Stack","EFK"],c:"ops"},
{n:"CI/CD",a:["持续集成","持续交付","CICD"],c:"ops"},
{n:"灰度发布",a:["蓝绿部署","金丝雀发布"],c:"ops"},
{n:"监控告警",a:[],c:"ops"},
{n:"日志分析",a:[],c:"ops"},
{n:"负载均衡",a:["SLB","LB"],c:"ops"},
{n:"反向代理",a:[],c:"ops"},
{n:"运维自动化",a:[],c:"ops"},
{n:"云原生",a:["Cloud Native"],c:"ops"},
{n:"容器化",a:[],c:"ops"},
{n:"DevOps",a:[],c:"ops"},
{n:"阿里云",a:["Aliyun"],c:"ops"},
{n:"腾讯云",a:[],c:"ops"},
{n:"AWS",a:["亚马逊云"],c:"ops"},
/* ---- 产品/运营 ---- */
{n:"Axure",a:["Axure RP"],c:"pm"},
{n:"墨刀",a:[],c:"pm"},
{n:"Figma",a:[],c:"pm"},
{n:"Sketch",a:[],c:"pm"},
{n:"PRD",a:["需求文档"],c:"pm"},
{n:"原型设计",a:["Prototype"],c:"pm"},
{n:"用户调研",a:[],c:"pm"},
{n:"数据分析",a:[],c:"pm"},
{n:"A/B测试",a:["AB测试","A/B Test"],c:"pm"},
{n:"漏斗分析",a:[],c:"pm"},
{n:"留存分析",a:[],c:"pm"},
{n:"用户画像",a:[],c:"pm"},
{n:"转化率",a:[],c:"pm"},
{n:"ROI",a:[],c:"pm"},
{n:"GMV",a:[],c:"pm"},
{n:"DAU",a:[],c:"pm"},
{n:"MAU",a:[],c:"pm"},
{n:"PV",a:[],c:"pm"},
{n:"UV",a:[],c:"pm"},
{n:"SEO",a:[],c:"pm"},
{n:"SEM",a:[],c:"pm"},
{n:"新媒体运营",a:[],c:"pm"},
{n:"内容运营",a:[],c:"pm"},
{n:"用户运营",a:[],c:"pm"},
{n:"活动策划",a:[],c:"pm"},
{n:"私域流量",a:[],c:"pm"},
{n:"增长黑客",a:["增长"],c:"pm"},
{n:"竞品分析",a:[],c:"pm"},
{n:"版本规划",a:[],c:"pm"},
{n:"需求评审",a:[],c:"pm"},
/* ---- AI/算法 ---- */
{n:"机器学习",a:["ML"],c:"ai"},
{n:"深度学习",a:["DL"],c:"ai"},
{n:"自然语言处理",a:["NLP"],c:"ai"},
{n:"计算机视觉",a:["CV"],c:"ai"},
{n:"TensorFlow",a:["TF"],c:"ai"},
{n:"PyTorch",a:[],c:"ai"},
{n:"大模型",a:["LLM","GPT"],c:"ai"},
{n:"提示词工程",a:["Prompt","提示词"],c:"ai"},
{n:"数据挖掘",a:[],c:"ai"},
{n:"推荐算法",a:[],c:"ai"},
{n:"神经网络",a:[],c:"ai"},
{n:"模型训练",a:[],c:"ai"},
{n:"模型部署",a:[],c:"ai"},
{n:"知识图谱",a:[],c:"ai"},
{n:"语音识别",a:["ASR"],c:"ai"},
{n:"图像识别",a:[],c:"ai"},
/* ---- 通用/软技能 ---- */
{n:"Git",a:[],c:"soft"},
{n:"SVN",a:[],c:"soft"},
{n:"敏捷开发",a:["Agile"],c:"soft"},
{n:"Scrum",a:[],c:"soft"},
{n:"Kanban",a:["看板"],c:"soft"},
{n:"Jira",a:[],c:"soft"},
{n:"Confluence",a:[],c:"soft"},
{n:"项目管理",a:["PMP"],c:"soft"},
{n:"需求分析",a:[],c:"soft"},
{n:"沟通能力",a:[],c:"soft"},
{n:"团队协作",a:[],c:"soft"},
{n:"跨部门协作",a:[],c:"soft"},
{n:"抗压能力",a:[],c:"soft"},
{n:"学习能力",a:[],c:"soft"},
{n:"时间管理",a:[],c:"soft"}
];

/* ============ 动作动词库 ============ */
var VERB_STRONG_CN = ["主导","设计","实现","开发","构建","搭建","优化","提升","降低","重构","推动","推进","落地","带领","指导","协调","完成","交付","上线","迭代","改造","迁移","整合","封装","抽象","沉淀","梳理","建立","制定","规划","评审","攻克","解决","排查","定位","保障","缩短","减少","增加","提高","扩大","拓展","覆盖","支撑","承载","孵化","策划","执行","统筹","复盘","驱动","打磨","攻坚"];
var VERB_WEAK_CN = ["负责","参与","协助","配合","跟进","从事","做过","做了","进行","帮忙"];
var VERB_EN = ["led","developed","designed","implemented","built","launched","optimized","improved","reduced","increased","drove","delivered","shipped","refactored","migrated","architected","spearheaded","managed","mentored","coordinated","established","created","owned","executed","streamlined","automated","enhanced","accelerated","pioneered"];

/* ============ 易错词表：[错误写法, 正确写法] ============ */
var TYPO_LIST = [
["做为","作为"],["帐号","账号"],["定单","订单"],["付于","赋予"],["予盾","矛盾"],
["原由","缘由"],["渡假","度假"],["座标","坐标"],["其它","其他（泛指建议统一用“其他”）"],
["暴发","爆发（“暴发户”除外）"],["必需品","必须品（表需要用“必须”）"],["按排","安排"]
];

/* ============ 基础工具 ============ */
function escRe(s){return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
function escHtml(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
/* 词条匹配器：纯字母数字词用严格词边界（含前后 & + # 排除，避免 R&D / C# 误伤） */
function termPattern(term){
  var e = escRe(term);
  if(/^[A-Za-z][A-Za-z0-9]*$/.test(term)){
    return '(?<![A-Za-z0-9_&+#])' + e + '(?![A-Za-z0-9_&+#])';
  }
  return e;
}
function findAllRanges(text, term){
  var out = [];
  try{
    var re = new RegExp(termPattern(term), 'gi');
    var m;
    while((m = re.exec(text)) !== null){
      out.push([m.index, m.index + m[0].length]);
      if(m[0].length === 0) re.lastIndex++;
    }
  }catch(e){ /* 极端词条降级为 indexOf */
    var lower = text.toLowerCase(), t = term.toLowerCase(), i = 0;
    while((i = lower.indexOf(t, i)) !== -1){ out.push([i, i + term.length]); i += term.length; }
  }
  return out;
}
function rangesOverlap(r, list){
  for(var i=0;i<list.length;i++){
    if(r[0] < list[i][1] && list[i][0] < r[1]) return true;
  }
  return false;
}
/* 扫描文本中的词典词条：按词条长度降序，占用字符区间去重（长的优先，如 C++ 优先于 C） */
function scanTerms(text){
  var hits = {}, occupied = [], terms = [];
  TECH_DICT.forEach(function(en){
    terms.push({t:en.n, en:en});
    (en.a||[]).forEach(function(a){ terms.push({t:a, en:en}); });
  });
  terms.sort(function(x,y){ return y.t.length - x.t.length; });
  terms.forEach(function(item){
    var fresh = findAllRanges(text, item.t).filter(function(r){ return !rangesOverlap(r, occupied); });
    if(fresh.length){
      var k = item.en.n;
      if(!hits[k]) hits[k] = {en:item.en, ranges:[], count:0};
      fresh.forEach(function(r){ hits[k].ranges.push(r); occupied.push(r); });
      hits[k].count += fresh.length;
    }
  });
  return {hits:hits, occupied:occupied};
}
/* 简历关键词高亮 */
function highlightResume(text, occupied){
  var ranges = occupied.slice().sort(function(a,b){ return a[0]-b[0]; });
  var out = '', last = 0;
  ranges.forEach(function(r){
    out += escHtml(text.slice(last, r[0]));
    out += '<mark class="rc-hit">' + escHtml(text.slice(r[0], r[1])) + '</mark>';
    last = r[1];
  });
  out += escHtml(text.slice(last));
  return out;
}

/* ============ 模块一：JD 关键词匹配度 ============ */
function analyzeKeywords(resume, jd){
  var jdScan = scanTerms(jd);
  var names = Object.keys(jdScan.hits);
  if(!names.length) return {empty:true};
  var totalFreq = 0, hitFreq = 0;
  var hitList = [], missList = [];
  var rScan = scanTerms(resume);
  names.forEach(function(n){
    var f = jdScan.hits[n].count;
    totalFreq += f;
    if(rScan.hits[n]){ hitFreq += f; hitList.push({n:n, freq:f, cat:jdScan.hits[n].en.c}); }
    else { missList.push({n:n, freq:f, cat:jdScan.hits[n].en.c}); }
  });
  hitList.sort(function(a,b){ return b.freq-a.freq; });
  missList.sort(function(a,b){ return b.freq-a.freq; });
  var score = totalFreq ? Math.round(hitFreq/totalFreq*100) : 0;
  var grade = score>=85 ? ['优秀','rc-great'] : score>=70 ? ['良好','rc-good'] : score>=50 ? ['待提升','rc-mid'] : ['较低','rc-low'];
  return {empty:false, score:score, grade:grade, hitList:hitList, missList:missList,
    totalKw:names.length, hitCount:hitList.length, resumeRanges:rScan.occupied};
}
function renderKeywords(r, jdEmpty){
  if(jdEmpty) return '<div class="rc-empty">未填写 JD 文本，已跳过关键词匹配。粘贴 JD 后重新分析即可。</div>';
  if(r.empty) return '<div class="rc-empty">JD 中未识别到技术栈词典关键词（词典覆盖编程/前端/后端/数据库/移动/测试/运维/产品运营/AI/通用方向约 200 词）。请确认 JD 文本有效。</div>';
  var h = '';
  h += '<div class="rc-score-wrap"><div class="rc-score"><span class="rc-score-num '+r.grade[1]+'">'+r.score+'</span><span class="rc-score-den">/100</span></div>';
  h += '<div class="rc-score-meta"><b>'+r.grade[0]+'</b><span>JD 关键词 '+r.totalKw+' 个，简历命中 '+r.hitCount+' 个（按 JD 出现频次加权）</span></div></div>';
  h += '<div class="rc-bar"><div class="rc-bar-fill '+r.grade[1]+'" style="width:'+r.score+'%"></div></div>';
  h += '<div class="rc-sub">命中关键词（'+r.hitList.length+'）</div>';
  if(r.hitList.length){
    h += '<div class="rc-chips">' + r.hitList.map(function(k){
      return '<span class="rc-chip hit" title="'+escHtml(CAT_NAMES[k.cat]||'')+' · JD 出现 '+k.freq+' 次">'+escHtml(k.n)+' ×'+k.freq+'</span>';
    }).join('') + '</div>';
    h += '<details class="rc-details"><summary>在简历中高亮命中词（点击展开）</summary><pre class="rc-hl">'+highlightResume(window.__rcResumeText||'', r.resumeRanges)+'</pre></details>';
  } else {
    h += '<div class="rc-empty">简历中未命中任何 JD 关键词，建议对照下方缺失清单补充。</div>';
  }
  h += '<div class="rc-sub">缺失关键词（'+r.missList.length+'，按 JD 出现频次排序）</div>';
  if(r.missList.length){
    h += '<div class="rc-chips">' + r.missList.slice(0,40).map(function(k){
      return '<span class="rc-chip miss" title="'+escHtml(CAT_NAMES[k.cat]||'')+'">'+escHtml(k.n)+' ×'+k.freq+'</span>';
    }).join('') + '</div>';
    if(r.missList.length>40) h += '<div class="rc-hint">另有 '+(r.missList.length-40)+' 个低频缺失词未展示，详见复制报告。</div>';
    h += '<div class="rc-tip"><i class="material-icons">tips_and_updates</i><span>确实掌握的缺失词，建议补充进「专业技能」或对应项目经历的 bullet 中（每条经历点到为止，不要堆砌）；不掌握的词不要硬写，面试会被追问。</span></div>';
  } else {
    h += '<div class="rc-pass-line"><i class="material-icons">check_circle</i> JD 关键词全命中，覆盖很完整。</div>';
  }
  return h;
}

/* ============ 模块二：ATS 友好度检测 ============ */
var CJK = '\\u4e00-\\u9fa5\\u3400-\\u4dbf';
function countRe(text, re){ var m = text.match(re); return m ? m.length : 0; }
function analyzeATS(text){
  var checks = [];
  var push = function(t,s,d,f){ checks.push({t:t,s:s,d:d,f:f}); };
  /* 1. emoji */
  var emojiN = countRe(text, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2B00}-\u{2BFF}]/gu);
  if(emojiN>0) push('Emoji / 表情符号','fail','检测到 '+emojiN+' 处 emoji/表情符号。','删除所有 emoji，ATS 解析器可能直接丢弃或乱码。');
  else push('Emoji / 表情符号','pass','未检测到 emoji。','—');
  /* 2. 装饰符号 */
  var decoN = countRe(text, /[●◆■▲▼★☆♦♣♠♥♤►◄▪◾⬛⬜✔✘❀✿❁❖➤➢]/g);
  if(decoN>0) push('装饰性特殊符号','warn','检测到 '+decoN+' 处装饰符号（● ◆ ★ 等）。','删掉装饰符号，项目符号统一用「-」或「•」，ATS 对异形符号解析不稳定。');
  else push('装饰性特殊符号','pass','未检测到装饰性符号。','—');
  /* 3. 表格转文本残留 */
  var tabN = countRe(text, /\t/g);
  var boxN = countRe(text, /[┌┐└┘├┤┬┴┼─│]/g);
  var pipeLine = text.split('\n').filter(function(l){ return (l.match(/\|/g)||[]).length>=2; }).length;
  var multiSpace = text.split('\n').filter(function(l){ return / {3,}/.test(l.replace(/^\s+/,'')); }).length;
  var residue = [];
  if(tabN>0) residue.push('制表符 '+tabN+' 处');
  if(boxN>0) residue.push('表格框线字符 '+boxN+' 处');
  if(pipeLine>0) residue.push('疑似表格行 '+pipeLine+' 行（含多个 | ）');
  if(multiSpace>0) residue.push('连续多空格 '+multiSpace+' 行');
  if(residue.length) push('表格转文本残留','warn',residue.join('；')+'。','Word 表格复制粘贴易残留制表符/框线/多空格，建议粘贴为纯文本后手动整理对齐，或直接重写为条目式文本。');
  else push('表格转文本残留','pass','未发现制表符、框线字符与表格残留痕迹。','—');
  /* 4. 中英混排空格 */
  var mixN = countRe(text, new RegExp('['+CJK+'][A-Za-z0-9]|[A-Za-z0-9]['+CJK+']','g'));
  if(mixN>0) push('中英文混排空格','warn','检测到 '+mixN+' 处中文与英文/数字直接相邻（如“熟悉Java开发”）。','中英文、中文与数字之间加一个半角空格（如“熟悉 Java 开发”），ATS 分词与人工阅读都更友好。');
  else push('中英文混排空格','pass','中英文之间空格使用规范。','—');
  /* 5. 全角/半角标点混用 */
  var puncN = countRe(text, new RegExp('['+CJK+'][,.;:!?]|[，；：][A-Za-z]','g'));
  if(puncN>0) push('中英文标点混用','warn','检测到 '+puncN+' 处疑似标点混用（中文后跟半角标点等）。','中文语境统一用全角标点（，。；：），英文语境统一用半角标点。');
  else push('中英文标点混用','pass','未发现明显标点混用。','—');
  /* 6. 联系方式 */
  var emailM = text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  var phoneM = text.match(/1[3-9]\d[\s-]?\d{4}[\s-]?\d{4}/);
  if(emailM && phoneM) push('联系方式格式','pass','识别到邮箱与手机号，格式正常。','建议放在简历顶部，手机号与邮箱各占一行。');
  else{
    var missing = [];
    if(!emailM) missing.push('邮箱');
    if(!phoneM) missing.push('手机号');
    push('联系方式格式','warn','未识别到'+missing.join('、')+'（邮箱形如 name@example.com，手机为 11 位）。','ATS 抓取联系方式失败=白投。请把手机号、邮箱放在简历最顶部，单独成行。');
  }
  /* 7. 分节标题 */
  var secs = [];
  if(/工作经[历验]|Work Experience/i.test(text)) secs.push('工作经历');
  if(/项目经[历验]|项目经验|Project/i.test(text)) secs.push('项目经历');
  if(/教育背景|教育经历|Education/i.test(text)) secs.push('教育背景');
  if(/专业技能|技能清单|Skills/i.test(text)) secs.push('专业技能');
  if(secs.indexOf('工作经历')===-1 && secs.indexOf('项目经历')===-1)
    push('分节标题','warn','未识别到「工作经历/项目经历」分节标题。','ATS 按标题定位经历区块，请用标准分节标题：工作经历、项目经历、教育背景、专业技能。');
  else push('分节标题','pass','已识别分节：'+secs.join('、')+'。','保持标题单独成行、不要合并到正文段落里。');
  /* 8. PDF 文本层提示 */
  push('PDF 文本可复制性','info','纯文本无法判定。','投递前请确认：PDF 由 Word/Markdown 直接导出、文字可选可复制；扫描件或图片式 PDF 会被 ATS 直接丢弃。文件名见模块四。');
  return checks;
}
var ATS_STYLE = {pass:['check_circle','rc-pass'],warn:['warning','rc-warn'],fail:['error','rc-fail'],info:['info','rc-info']};
var ATS_LABEL = {pass:'通过',warn:'警告',fail:'不通过',info:'提示'};
function renderATS(checks){
  var h = '<div class="rc-ats">';
  checks.forEach(function(c){
    var st = ATS_STYLE[c.s];
    h += '<div class="rc-ats-item '+st[1]+'"><i class="material-icons">'+st[0]+'</i><div><div class="rc-ats-head"><b>'+escHtml(c.t)+'</b><span class="rc-badge '+st[1]+'">'+ATS_LABEL[c.s]+'</span></div><div class="rc-ats-d">'+escHtml(c.d)+'</div>';
    if(c.f && c.f!=='—') h += '<div class="rc-ats-f">修复建议：'+escHtml(c.f)+'</div>';
    h += '</div></div>';
  });
  return h + '</div>';
}

/* ============ 模块三：「做了什么 → 结果如何」逻辑链检查 ============ */
var BULLET_RE = /^\s*(?:[-–—•·*▪◆>+➢]|（\d+）|\(\d+\)|\d+[.、）)]\s*)/;
function splitBullets(text){
  var out = [];
  text.split('\n').forEach(function(line){
    var m = line.match(BULLET_RE);
    if(m){
      var content = line.slice(m[0].length).trim();
      if(content.length>=4) out.push(content);
    }
  });
  return out;
}
function verbKind(content){
  for(var i=0;i<VERB_STRONG_CN.length;i++){
    if(content.indexOf(VERB_STRONG_CN[i])===0) return 'strong';
  }
  for(var j=0;j<VERB_WEAK_CN.length;j++){
    if(content.indexOf(VERB_WEAK_CN[j])===0) return 'weak';
  }
  var firstWord = (content.match(/^[A-Za-z]+/)||[''])[0].toLowerCase();
  if(firstWord && VERB_EN.indexOf(firstWord)!==-1) return 'strong';
  return 'none';
}
function analyzeLogic(text){
  var bullets = splitBullets(text);
  var items = bullets.map(function(b){
    var cpLen = Array.from(b).length;
    var vk = verbKind(b);
    var hasNum = /\d/.test(b);
    var hints = [];
    if(vk==='none') hints.push('建议以动作动词开头，如：主导 / 设计 / 实现 / 优化 / 推动');
    else if(vk==='weak') hints.push('「'+b.slice(0,2)+'」偏弱，换成具体动作：主导 / 推动 / 落地 / 交付');
    if(!hasNum) hints.push('补充量化结果，如：提升 30%、支撑 10 万 DAU、节省 20 人天');
    if(cpLen>140) hints.push('超过 140 字，建议拆成 2 条，单条只讲一件事');
    else if(cpLen<25) hints.push('不足 25 字，补充背景 / 动作 / 结果三要素');
    var lenKind = cpLen>140 ? 'long' : cpLen<25 ? 'short' : 'ok';
    return {text:b, len:cpLen, vk:vk, hasNum:hasNum, hints:hints, lenKind:lenKind};
  });
  return {bullets:items};
}
function renderLogic(r){
  if(!r.bullets.length)
    return '<div class="rc-empty">未识别到条目式经历（以 - / • / 数字编号开头的行）。建议把项目经历写成条目式，每条讲一件事，分析会更准。</div>';
  var strongN = r.bullets.filter(function(b){return b.vk==='strong';}).length;
  var numN = r.bullets.filter(function(b){return b.hasNum;}).length;
  var n = r.bullets.length;
  var h = '<div class="rc-logic-sum">共识别 <b>'+n+'</b> 条经历条目 · 动作动词开头 <b>'+Math.round(strongN/n*100)+'%</b> · 含数字量化 <b>'+Math.round(numN/n*100)+'%</b></div>';
  h += '<div class="rc-logic-list">';
  r.bullets.slice(0,40).forEach(function(b){
    var vkBadge = b.vk==='strong' ? '<span class="rc-mini-badge ok">动词✓</span>'
      : b.vk==='weak' ? '<span class="rc-mini-badge warn">动词弱</span>'
      : '<span class="rc-mini-badge bad">缺动词</span>';
    var numBadge = b.hasNum ? '<span class="rc-mini-badge ok">量化✓</span>' : '<span class="rc-mini-badge bad">缺量化</span>';
    var lenBadge = b.lenKind==='ok' ? '<span class="rc-mini-badge ok">长度✓</span>'
      : b.lenKind==='long' ? '<span class="rc-mini-badge warn">过长('+b.len+'字)</span>'
      : '<span class="rc-mini-badge warn">过短('+b.len+'字)</span>';
    h += '<div class="rc-logic-item"><div class="rc-logic-text">'+escHtml(b.text.length>90?b.text.slice(0,90)+'…':b.text)+'</div>';
    h += '<div class="rc-logic-badges">'+vkBadge+numBadge+lenBadge+'</div>';
    if(b.hints.length) h += '<div class="rc-logic-hint">改写提示：'+escHtml(b.hints.join('；'))+'</div>';
    h += '</div>';
  });
  h += '</div>';
  if(n>40) h += '<div class="rc-hint">另有 '+(n-40)+' 条未展示，详见复制报告。</div>';
  h += '<div class="rc-tip"><i class="material-icons">tips_and_updates</i><span>好 bullet 公式：<b>动作动词 + 做了什么 + 量化结果</b>，如“主导订单中心重构，将下单接口 P99 从 800ms 降至 200ms”。</span></div>';
  return h;
}

/* ============ 模块四：简历雷区清单 ============ */
function analyzeMines(text){
var mines = [];
var push = function(t,s,d,f){ mines.push({t:t,s:s,d:d,f:f});};
/* 1. 身份证号 */
var idN = countRe(text, /[1-9]\d{5}(19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{3}[\dXx]/g);
if(idN>0) push('身份证号泄露','fail','检测到 '+idN+' 处疑似完整身份证号。','立即删除！身份证号只在入职背调环节提供，简历上出现=信息泄露高风险。');
else push('身份证号泄露','pass','未检测到身份证号。','—');
/* 2. 详细住址 */
var addrN = countRe(text, /[省市区县][^，。；\n]{0,14}(路|街|巷|号|栋|幢|单元|室|小区|花园|公寓|弄)/g);
if(addrN>0) push('住址过度披露','warn','检测到 '+addrN+' 处详细住址（精确到路/小区/门牌）。','只保留到城市/区（如“深圳 · 南山”），精确住址面试通过后再提供。');
else push('住址过度披露','pass','未发现精确到门牌的住址。','—');
/* 3. 无关敏感信息 */
var sens = [];
if(/已婚|未婚|离异|丧偶/.test(text)) sens.push('婚育状况');
if(/身高|体重|\d+\s*cm/.test(text)) sens.push('身高体重');
if(/宗教|佛教|基督/.test(text)) sens.push('宗教信仰');
if(sens.length) push('无关敏感信息','warn','检测到：'+sens.join('、')+'。','与岗位无关的个人信息建议删除（特殊岗位明确要求除外），避免无意识偏见。');
else push('无关敏感信息','pass','未发现婚育/身高体重等无关信息。','—');
/* 4. 出生日期 */
if(/\d{4}年\d{1,2}月\d{1,2}日/.test(text)) push('出生日期粒度','info','写到了完整出生日期（精确到日）。','建议只保留年月或直接写年龄，精确到日无必要。');
/* 5. 日期格式一致性 */
var fmts = [];
if(/\d{4}年\d{1,2}月/.test(text)) fmts.push('2021年9月');
if(/\d{4}-\d{1,2}/.test(text)) fmts.push('2021-09');
if(/\d{4}\.\d{1,2}/.test(text)) fmts.push('2021.09');
if(/\d{4}\/\d{1,2}/.test(text)) fmts.push('2021/09');
if(fmts.length>=2) push('日期格式一致性','warn','混用了 '+fmts.length+' 种日期格式：'+fmts.join('、')+'。','全文统一一种格式，推荐「2021.09 – 2023.06」或「2021年9月 – 2023年6月」。');
else if(fmts.length===1) push('日期格式一致性','pass','日期格式统一（'+fmts[0]+'式）。','—');
var endWords = [];
if(/至今/.test(text)) endWords.push('至今');
if(/现在/.test(text)) endWords.push('现在');
if(/present/i.test(text)) endWords.push('Present');
if(endWords.length>=2) push('在职时间表述','warn','在职结束时间混用：'+endWords.join('、')+'。','统一为「至今」（中文简历）或「Present」（英文简历）。');
/* 6. 易错词 */
var typoHits = [];
TYPO_LIST.forEach(function(p){
var idx = text.indexOf(p[0]);
if(idx!==-1){
var ctx = text.slice(Math.max(0,idx-8), idx+p[0].length+8).replace(/\n/g,' ');
typoHits.push({w:p[0], r:p[1], ctx:ctx});
}
});
if(typoHits.length) push('易错词扫描','warn','发现 '+typoHits.length+' 处疑似错别字/不规范用词。', typoHits.map(function(t){ return '「'+t.w+'」→「'+t.r+'」（…'+t.ctx+'…）';}).join('；'));
else push('易错词扫描','pass','未发现常见易错词。','—');
/* 7. 自我评价用词 */
var jtN = countRe(text, /精通/g);
if(jtN>0) push('“精通”自评','info','「精通」出现 '+jtN+' 次。','「精通」面试必被深挖追问，建议按 熟悉 / 掌握 / 了解 三档分级表述，更可信。');
/* 8. 文件命名 */
push('投递文件命名','info','纯文本无法判定。','文件名建议「姓名-应聘岗位-年份.pdf」，如“张三-前端开发-2026.pdf”；避免“简历-最终版(2).pdf”。');
/* 9. 页数估算 */
var chars = text.replace(/\s/g,'').length;
var pages = chars/2200;
var pageStr = '正文约 '+chars+' 字，按每页约 2200 字估算为 '+pages.toFixed(1)+' 页。';
if(pages>2.2) push('页数估算','warn',pageStr,'超过 2 页：HR 平均只看 30 秒，建议压缩到 1–2 页，删减早期/无关经历。');
else push('页数估算','pass',pageStr,'—');
return mines;
}
function renderMines(mines){ return renderATS(mines);}

/* ============ 报告组装 / 复制 / 事件绑定 ============ */
var MAX_LEN = 100000;
var lastReport = null;

function fmtTime(d){
var p = function(x){ return (x<10?'0':'')+x;};
return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+' '+p(d.getHours())+':'+p(d.getMinutes());
}
function showErr(msg){
var el = document.getElementById('rc-err');
el.textContent = msg; el.style.display = 'block';
}
function hideErr(){ document.getElementById('rc-err').style.display = 'none';}

function buildTextReport(rep){
var L = [];
L.push('');
L.push('生成时间：'+fmtTime(new Date())+'（ToolWeb 简历预检工具，浏览器本地生成）');
L.push('输入：简历 '+rep.resumeLen+' 字符 / JD '+rep.jdLen+' 字符');
L.push('');
L.push('一、JD 关键词匹配度');
if(rep.jdEmpty){ L.push('（未填写 JD，跳过）');}
else if(rep.kw.empty){ L.push('（JD 中未识别到技术栈关键词）');}
else{
L.push('综合评分：'+rep.kw.score+'/100（'+rep.kw.grade[0]+'）');
L.push('命中（'+rep.kw.hitList.length+'）：'+rep.kw.hitList.map(function(k){return k.n+'(JD×'+k.freq+')';}).join('、'));
L.push('缺失（按 JD 频次排序）：');
rep.kw.missList.forEach(function(k){ L.push(' - '+k.n+'（JD 出现 '+k.freq+' 次）→ 建议补充进技能清单/项目经历');});
}
L.push('');
L.push('二、ATS 友好度检测');
rep.ats.forEach(function(c){
L.push('['+ATS_LABEL[c.s]+'] '+c.t+'：'+c.d+(c.f&&c.f!=='—'?' 修复建议：'+c.f:''));
});
L.push('');
L.push('三、逻辑链检查（做了什么 → 结果如何）');
if(!rep.logic.bullets.length){ L.push('（未识别到条目式经历）');}
else{
var n=rep.logic.bullets.length;
var sn=rep.logic.bullets.filter(function(b){return b.vk==='strong';}).length;
var qn=rep.logic.bullets.filter(function(b){return b.hasNum;}).length;
L.push('共 '+n+' 条，动作动词开头 '+Math.round(sn/n*100)+'%（'+sn+'/'+n+'），含数字量化 '+Math.round(qn/n*100)+'%（'+qn+'/'+n+'）');
rep.logic.bullets.forEach(function(b,i){
var tags=[];
tags.push(b.vk==='strong'?'动词✓':(b.vk==='weak'?'动词弱':'缺动词'));
tags.push(b.hasNum?'量化✓':'缺量化');
tags.push(b.lenKind==='ok'?'长度✓':(b.lenKind==='long'?'过长':'过短'));
L.push(' '+(i+1)+'. ['+tags.join('/')+'] '+b.text);
if(b.hints.length) L.push(' 改写提示：'+b.hints.join('；'));
});
}
L.push('');
L.push('四、简历雷区清单');
rep.mines.forEach(function(c){
L.push('['+ATS_LABEL[c.s]+'] '+c.t+'：'+c.d+(c.f&&c.f!=='—'?' 修复建议：'+c.f:''));
});
L.push('');
L.push('—— 本报告由 ToolWeb 简历预检工具在浏览器本地生成：简历文本不出浏览器，未上传任何服务器。');
return L.join('\n');
}

function doAnalyze(){
hideErr();
var resumeEl = document.getElementById('rc-resume');
var jdEl = document.getElementById('rc-jd');
var resume = resumeEl.value, jd = jdEl.value;
if(!resume.trim()){ showErr('请先粘贴简历文本，再点击一键分析。'); resumeEl.focus(); return;}
if(resume.length>MAX_LEN){ showErr('简历文本过长（'+resume.length+' 字符），请控制在 10 万字符以内。'); return;}
if(jd.length>MAX_LEN){ showErr('JD 文本过长（'+jd.length+' 字符），请控制在 10 万字符以内。'); return;}
window.__rcResumeText = resume;
var jdEmpty =!jd.trim();
var kw = analyzeKeywords(resume, jd);
var ats = analyzeATS(resume);
var logic = analyzeLogic(resume);
var mines = analyzeMines(resume);
lastReport = {resumeLen:resume.length, jdLen:jd.length, jdEmpty:jdEmpty, kw:kw, ats:ats, logic:logic, mines:mines};

var html = '';
html += '<div class="rc-mod"><h3><span class="rc-mod-num">①</span> JD 关键词匹配度</h3>'+renderKeywords(kw, jdEmpty)+'</div>';
html += '<div class="rc-mod"><h3><span class="rc-mod-num">②</span> ATS 友好度检测</h3>'+renderATS(ats)+'</div>';
html += '<div class="rc-mod"><h3><span class="rc-mod-num">③</span> 「做了什么 → 结果如何」逻辑链检查</h3>'+renderLogic(logic)+'</div>';
html += '<div class="rc-mod"><h3><span class="rc-mod-num">④</span> 简历雷区清单</h3>'+renderMines(mines)+'</div>';
document.getElementById('rc-report').innerHTML = html;
document.getElementById('rc-report-card').style.display = 'block';
document.getElementById('rc-copy').disabled = false;
document.getElementById('rc-report-card').scrollIntoView({behavior:'smooth', block:'start'});
}

function doCopy(){
if(!lastReport) return;
var text = buildTextReport(lastReport);
var tip = document.getElementById('rc-copy-tip');
var done = function(){ tip.textContent = '已复制到剪贴板，可直接粘贴保存。'; tip.style.display='block'; setTimeout(function(){tip.style.display='none';},3000);};
if(navigator.clipboard && navigator.clipboard.writeText){
navigator.clipboard.writeText(text).then(done, function(){ fallbackCopy(text, done);});
}else{ fallbackCopy(text, done);}
}
function fallbackCopy(text, done){
var ta = document.createElement('textarea');
ta.value = text; ta.style.position='fixed'; ta.style.opacity='0';
document.body.appendChild(ta); ta.select();
try{ document.execCommand('copy'); done();}catch(e){ showErr('复制失败，请手动选择报告内容复制。');}
document.body.removeChild(ta);
}

var SAMPLE_RESUME = [
'张伟',
'电话：13800138000 邮箱：zhangwei@example.com',
'求职意向：高级前端开发工程师',
'',
'教育背景',
'2019.09-2023.06 华南理工大学 计算机科学与技术 本科',
'',
'专业技能',
'熟悉 HTML、CSS、JavaScript，掌握 Vue2/Vue3 全家桶，了解 React',
'熟悉 Element UI、ECharts 数据可视化，了解 Node.js 与 Webpack 构建',
'',
'工作经历',
'2023.07-至今 深圳XX科技有限公司 前端开发工程师',
'- 负责公司官网重构，使用 Vue3 + Vite 搭建新项目，提升了页面加载速度',
'- 参与电商后台管理系统开发，实现了商品管理、订单管理、权限管理模块',
'- 做过一个数据可视化大屏项目，用 ECharts 展示销售数据',
'- 负责日常需求开发与线上问题排查',
'',
'项目经历',
'2024.03-2024.08 官网重构项目',
'- 主导官网从 Vue2 迁移到 Vue3，首屏加载时间从 3.2s 降至 1.1s',
'- 封装 20+ 通用组件，沉淀到团队组件库，3 个业务线复用'
].join('\n');
var SAMPLE_JD = [
'高级前端开发工程师',
'岗位职责：',
'1. 负责核心业务线 Web 前端架构设计与开发，技术栈 Vue3 + TypeScript；',
'2. 主导性能优化专项，优化页面秒开率、LCP 等核心指标；',
'3. 推动微前端架构落地（qiankun），实现多团队应用聚合；',
'4. 建设组件库与工程化体系（Vite/Webpack、CI/CD）；',
'5. 指导初级工程师，组织 Code Review。',
'任职要求：',
'1. 5 年以上前端开发经验，精通 Vue3/React，熟悉 TypeScript；',
'2. 熟悉 Node.js，能编写 BFF 层接口与构建脚本；',
'3. 有微前端（qiankun / single-spa）实战经验者优先；',
'4. 熟悉性能优化手段：懒加载、虚拟列表、SSR 服务端渲染；',
'5. 加分项：微信小程序、Jest 单元测试、Docker 容器化部署经验。'
].join('\n');

function bindCount(id, label){
var el = document.getElementById(id);
var out = document.getElementById(id+'-count');
var update = function(){ out.textContent = el.value.length + ' 字符';};
el.addEventListener('input', update); update();
}
function init(){
bindCount('rc-resume'); bindCount('rc-jd');
document.getElementById('rc-analyze').addEventListener('click', doAnalyze);
document.getElementById('rc-copy').addEventListener('click', doCopy);
document.getElementById('rc-sample').addEventListener('click', function(){
document.getElementById('rc-resume').value = SAMPLE_RESUME;
document.getElementById('rc-jd').value = SAMPLE_JD;
bindCount('rc-resume'); bindCount('rc-jd');
hideErr();
});
document.getElementById('rc-clear').addEventListener('click', function(){
document.getElementById('rc-resume').value = '';
document.getElementById('rc-jd').value = '';
document.getElementById('rc-report').innerHTML = '';
document.getElementById('rc-report-card').style.display = 'none';
document.getElementById('rc-copy').disabled = true;
lastReport = null; hideErr();
bindCount('rc-resume'); bindCount('rc-jd');
});
}
if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
})();
