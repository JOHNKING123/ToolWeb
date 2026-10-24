/* HTTP 状态码速查（http_status_reference）纯前端核心逻辑
 * 纯函数经 module.exports 暴露，node tests/http_status_reference.test.js 自测；
 * 浏览器端：window.HttpStatusRef 全局 + DOM 装配（本文件末尾）。
 *
 * 数据说明（规格见 BACKLOG 2026-10-24 07:44 PM 排期条目）：
 * - 静态数组 STATUS_CODES，共 62 条（1xx×3、2xx×10、3xx×9、4xx×29、5xx×11），
 *   类别归属与 IANA/MDN 一致（418/451 归 4xx、103 归 1xx 等）；
 * - 每条七字段：code（码号）、name_en（英文原名）、name_cn（中文名称）、
 *   category（1xx/2xx/3xx/4xx/5xx）、meaning_cn（中文含义）、
 *   scenario（常见场景）、fix（排查建议）；中文释义为自有改写、非 MDN 照搬；
 * - 可选字段 note：冷知识备注（418/451/306/413 等）；py：中文名称拼音首字母，
 *   供搜索匹配（如 200「成功」→ cg）。
 * - 零 fetch/XHR：纯静态数据，页面不发起任何后端请求。
 */
(function () {
"use strict";

/* ================= 0. 类别标签 ================= */

var CATEGORY_LABELS = {
    "1xx": "1xx 信息响应",
    "2xx": "2xx 成功",
    "3xx": "3xx 重定向",
    "4xx": "4xx 客户端错误",
    "5xx": "5xx 服务端错误"
};
var CATEGORY_KEYS = ["1xx", "2xx", "3xx", "4xx", "5xx"];

/* ================= 1. 状态码数据（62 条，码号升序） ================= */

var STATUS_CODES = [
/* ---- 1xx 信息响应 ---- */
{code:100, name_en:"Continue", name_cn:"继续", category:"1xx", py:"jx",
 meaning_cn:"服务端已经收到请求头，告诉客户端可以继续发送请求体。这是一个临时响应，最终还会有一个正式的状态码。",
 scenario:"上传大文件前客户端先发 Expect: 100-continue 探路；分块传输前确认服务端意愿。",
 fix:"客户端一直卡在等待时，检查服务端/代理是否透传了 100 响应；抓包确认中间件没有吞掉这个临时响应；不需要时去掉 Expect 头即可绕开。"},
{code:101, name_en:"Switching Protocols", name_cn:"切换协议", category:"1xx", py:"qhxy",
 meaning_cn:"服务端同意切换到客户端请求的协议，之后双方就用新协议继续通信，比如从 HTTP 切换到 WebSocket。",
 scenario:"WebSocket 握手（ws:// 连接建立）；HTTP/1.1 升级到 HTTP/2（Upgrade 头）。",
 fix:"握手失败没拿到 101 时，检查 Upgrade、Connection、Sec-WebSocket-Key 等头是否齐全；确认反向代理支持 WebSocket 透传。"},
{code:103, name_en:"Early Hints", name_cn:"早期提示", category:"1xx", py:"zqts",
 meaning_cn:"正式响应还没准备好，服务端先发一些提示头（通常是 Link 预加载），让浏览器提前开始加载关键资源，省掉等待时间。",
 scenario:"服务端边渲染边先推送 CSS/字体等关键资源链接，浏览器提前预加载。",
 fix:"效果不明显时检查 CDN/代理是否剥离了 103 响应；注意 103 只是临时提示，最终必须有一个完整的正式响应跟上。"},

/* ---- 2xx 成功 ---- */
{code:200, name_en:"OK", name_cn:"成功", category:"2xx", py:"cg",
 meaning_cn:"请求已成功处理，响应体里就是你要的结果。这是最常见的成功码。",
 scenario:"API 查询正常返回、页面正常加载、绝大多数 GET/POST 成功场景。",
 fix:"拿到 200 但数据不对时先看业务 payload（很多接口把业务错误包在 200 里）；不要只看状态码就断定一切正常。"},
{code:201, name_en:"Created", name_cn:"已创建", category:"2xx", py:"ycj",
 meaning_cn:"请求成功，并且服务端新建了一个资源。通常会在 Location 头里给出新资源的地址。",
 scenario:"POST 创建用户/订单/文章；任何「新建资源」类接口的规范返回。",
 fix:"创建成功却返回 200 也能用，但 201 更规范；若 Location 指向的地址打不开，检查服务端拼接的新资源 URL 是否正确。"},
{code:202, name_en:"Accepted", name_cn:"已受理", category:"2xx", py:"ysl",
 meaning_cn:"请求已收到，但还没处理完，适合耗时长的异步任务。注意：202 只代表「收下了」，不代表「做完了」。",
 scenario:"任务队列提交、批量导入、视频转码、邮件群发等异步接口。",
 fix:"拿到 202 后要轮询任务状态接口拿最终结果；别把 202 当成操作成功去刷新页面展示。"},
{code:203, name_en:"Non-Authoritative Information", name_cn:"非权威信息", category:"2xx", py:"fqwxx",
 meaning_cn:"请求成功了，但返回的元信息来自代理的转换版本，可能和源站原始信息不一致。",
 scenario:"缓存代理改写过响应头/响应体后返回；某些网关做内容转换的场景。",
 fix:"对数据一致性敏感的场景绕开代理直连源站核对；一般业务代码无需特殊处理。"},
{code:204, name_en:"No Content", name_cn:"无内容", category:"2xx", py:"wnr",
 meaning_cn:"请求成功，但服务端认为没有必要返回响应体，响应是空的。客户端不要刷新页面。",
 scenario:"DELETE 删除资源、PUT 更新资源后只确认成功；表单提交后无需返回数据。",
 fix:"前端（如 axios）不要对 204 做 JSON 解析，会报空体解析错；单独处理「成功但无返回」的分支。"},
{code:205, name_en:"Reset Content", name_cn:"重置内容", category:"2xx", py:"cznr",
 meaning_cn:"请求成功，服务端希望客户端重置当前文档视图，比如清空刚提交的表单。",
 scenario:"表单提交后让浏览器重置输入框；极少实际使用。",
 fix:"基本无需排查；若页面没按预期重置，检查前端是否实现了 205 的视图重置逻辑。"},
{code:206, name_en:"Partial Content", name_cn:"部分内容", category:"2xx", py:"bfnr",
 meaning_cn:"服务端只返回了客户端请求的那一段内容（Range 请求），用于断点续传和分片下载，配合 Content-Range 头说明区间。",
 scenario:"视频拖动进度条、下载工具断点续传、大文件分片并行下载。",
 fix:"检查请求 Range 头与响应 Content-Range 是否对齐；若发了 Range 却收到 200 全量，说明服务端忽略了分段请求。"},
{code:207, name_en:"Multi-Status", name_cn:"多状态", category:"2xx", py:"dzt",
 meaning_cn:"一次请求涉及多个资源，每个资源有各自的状态，统一包在 XML 响应体里返回（WebDAV 专用）。",
 scenario:"WebDAV 的 PROPFIND 批量查询多个文件属性。",
 fix:"不要只看外层 207，要逐项解析响应 XML 里每个资源的子状态码定位问题。"},
{code:208, name_en:"Already Reported", name_cn:"已报告", category:"2xx", py:"ybg",
 meaning_cn:"WebDAV 深度查询时的内部优化码，表示该成员已经在本次响应里报告过，避免重复列出。",
 scenario:"PROPFIND 带 Depth: infinity 的深层目录枚举。",
 fix:"内部优化码，客户端按正常集合成员处理即可，基本无需排查。"},
{code:226, name_en:"IM Used", name_cn:"已使用实例操作", category:"2xx", py:"yysls",
 meaning_cn:"服务端按客户端的「实例操作」（如差量请求）返回了处理结果，响应是差异而非完整内容（HTTP 增量编码）。",
 scenario:"支持差量更新的缓存同步、带宽敏感的增量传输；实际极少用。",
 fix:"客户端必须能按 A-IM 头把差异合并回完整内容；合并不上就退回普通 GET 全量拉取。"},

/* ---- 3xx 重定向 ---- */
{code:300, name_en:"Multiple Choices", name_cn:"多重选择", category:"3xx", py:"dczx",
 meaning_cn:"目标资源有多种表示形式（如多语言、多格式），服务端把选项列出来，让客户端自己选一个。",
 scenario:"内容协商：同一 URL 有中文/英文、多格式版本时让用户选择。",
 fix:"实际中服务端多半直接按 Accept 头帮你选好，很少真的返回 300；收到时按 Location 列表引导用户选择即可。"},
{code:301, name_en:"Moved Permanently", name_cn:"永久重定向", category:"3xx", py:"yjcx",
 meaning_cn:"资源永久搬到新地址了（Location 头），以后请直接用新 URL。浏览器和搜索引擎会记住这次搬迁。",
 scenario:"域名迁移、http 全站跳 https、URL 规范化（www 与非 www 统一）。",
 fix:"浏览器会缓存 301，配错跳转会「记住错地址」，改完务必清缓存验证；POST 跟随 301 可能被改成 GET，跨方法跳转请用 308 更保险。"},
{code:302, name_en:"Found", name_cn:"临时重定向", category:"3xx", py:"lscx",
 meaning_cn:"资源暂时放在另一个地址（Location 头），以后还可能搬回来，别把这次跳转当永久。",
 scenario:"登录后跳回原页面、活动临时跳转、A/B 测试分流。",
 fix:"别拿 302 做永久跳转（权重不传递）；注意老客户端跟随 302 时可能把 POST 改成 GET，需要保持方法请用 307。"},
{code:303, name_en:"See Other", name_cn:"查看其他", category:"3xx", py:"ckqt",
 meaning_cn:"请用 GET 方法去另一个 URL 看结果。典型用法是 POST 提交后跳转，避免刷新重复提交。",
 scenario:"表单提交成功后跳转到成功页（PRG 模式：Post/Redirect/Get）。",
 fix:"跳转后若参数丢失，检查是不是 303 把 POST 转成了 GET；需要保持方法和请求体时改用 307。"},
{code:304, name_en:"Not Modified", name_cn:"未修改", category:"3xx", py:"wxg",
 meaning_cn:"资源没有变化，客户端直接用本地缓存副本就行，响应体是空的。配合 If-None-Match / If-Modified-Since 做缓存验证。",
 scenario:"静态资源（JS/CSS/图片）的协商缓存命中，省流量加速加载。",
 fix:"304 本身不带响应体；调试时想强制拿最新内容用 Ctrl+F5 或发 Cache-Control: no-cache 绕过缓存验证。"},
{code:305, name_en:"Use Proxy", name_cn:"使用代理", category:"3xx", py:"sydl",
 meaning_cn:"必须通过指定的代理才能访问该资源。这是历史遗留码，现代浏览器都不再支持。",
 scenario:"早期 HTTP 规范里的代理强制场景，现已废弃。",
 fix:"现代环境基本见不到；若网关返回此码，检查是否用了过时的代理配置。"},
{code:306, name_en:"Unused", name_cn:"保留未用", category:"3xx", py:"blwy",
 meaning_cn:"曾经预留的状态码，现在官方明确不再使用，遇到它说明对端实现有问题或在开玩笑。",
 scenario:"无实际使用场景。",
 fix:"检查返回该码的服务端/代理实现是否写错了状态码。",
 note:"冷知识：306 曾短暂叫作 Switch Proxy（切换代理），后来被废弃，成为状态码表里少数「官方盖章不用」的空位。"},
{code:307, name_en:"Temporary Redirect", name_cn:"临时重定向（保持方法）", category:"3xx", py:"lscxbcff",
 meaning_cn:"和 302 一样是临时跳转，但严格要求重定向时保持原来的请求方法和请求体不变（POST 过去还是 POST）。",
 scenario:"临时维护跳转但必须保持 POST 请求体；表单数据不能丢的临时跳转。",
 fix:"跟随跳转后若方法被改成了 GET，说明客户端把它当 302 处理了，检查客户端/库的重定向实现。"},
{code:308, name_en:"Permanent Redirect", name_cn:"永久重定向（保持方法）", category:"3xx", py:"yjcxbcff",
 meaning_cn:"和 301 一样是永久搬家，但保持请求方法和请求体不变，是现代版的 301。",
 scenario:"http→https 永久迁移且要保持 POST；API 域名永久变更。",
 fix:"SEO 上等同 301 传递权重；极老客户端可能不认识 308，必要时回退到 301。"},

/* ---- 4xx 客户端错误 ---- */
{code:400, name_en:"Bad Request", name_cn:"错误请求", category:"4xx", py:"cwqq",
 meaning_cn:"请求报文有问题，服务端看不懂或拒绝处理：参数格式错、JSON 坏了、URL 非法都归这一类。",
 scenario:"接口参数缺失/类型错误、JSON 语法错误、URL 含非法字符、请求体过大被前置拒绝。",
 fix:"对照接口文档检查请求方法、URL、请求头、请求体格式；看响应体里的错误详情，它通常会指出具体哪个字段有问题。"},
{code:401, name_en:"Unauthorized", name_cn:"未授权", category:"4xx", py:"wsq",
 meaning_cn:"没提供凭证，或凭证无效/过期：服务端没认出你是谁，请先完成认证。注意名字有误导性，它其实是「未认证」。",
 scenario:"没带 token 调接口、token 过期、登录态失效、Basic 认证账号密码错误。",
 fix:"检查 Authorization 头、Cookie 登录态是否有效；401 是「没认出你」→去登录/刷新 token，别和 403（没权限）搞混。"},
{code:402, name_en:"Payment Required", name_cn:"需要付款", category:"4xx", py:"xytk",
 meaning_cn:"为未来的付费场景预留的状态码，表示「先付费再用」，目前几乎没有实际使用。",
 scenario:"付费墙、API 按量计费场景的预留语义。",
 fix:"基本见不到；若业务真用它做付费拦截，按其返回的付款指引处理即可。"},
{code:403, name_en:"Forbidden", name_cn:"禁止访问", category:"4xx", py:"jzfw",
 meaning_cn:"服务端认出了你，但明确拒绝：权限不足、IP 被封、目录被禁止访问都返回 403。",
 scenario:"普通用户访问管理员接口、IP 被拉黑、WAF 规则拦截、nginx 禁止目录浏览。",
 fix:"确认账号角色/权限配置；检查是否被 WAF/防火墙规则误伤；403 是权限问题，重新登录通常没用，别反复试密码。"},
{code:404, name_en:"Not Found", name_cn:"未找到", category:"4xx", py:"wzhd",
 meaning_cn:"服务器上没有这个资源：地址写错了，或者资源已经被删了。",
 scenario:"URL 拼写错误、资源下架删除、API 路径变更、SPA 刷新 404。",
 fix:"核对 URL 大小写、斜杠、后缀；SPA 应用要配 history 路由回退到 index.html；后端检查路由表是否注册了该路径。"},
{code:405, name_en:"Method Not Allowed", name_cn:"方法不允许", category:"4xx", py:"ffbyx",
 meaning_cn:"资源是存在的，但这个 HTTP 方法它不支持（比如只读接口收到了 POST）。",
 scenario:"对只支持 GET 的接口发了 POST/DELETE；REST 路由方法注册不全。",
 fix:"看响应 Allow 头，它会列出该资源支持的方法；检查前端请求方法与后端路由注册是否一致。"},
{code:406, name_en:"Not Acceptable", name_cn:"不可接受", category:"4xx", py:"bkj",
 meaning_cn:"服务端没有客户端想要的那种内容格式：你 Accept 头里要的东西它给不出来。",
 scenario:"客户端只要 application/json，服务端只能返回 XML；图片格式协商失败。",
 fix:"放宽 Accept 头（加上 */*），或让服务端增加对应格式的支持。"},
{code:407, name_en:"Proxy Authentication Required", name_cn:"需要代理认证", category:"4xx", py:"xydlrz",
 meaning_cn:"和 401 类似，但要求的是向代理服务器提供认证，而不是目标网站。",
 scenario:"企业内网代理、付费代理出口要求先认证。",
 fix:"给请求加上 Proxy-Authorization 头或在代理客户端里配好账号密码。"},
{code:408, name_en:"Request Timeout", name_cn:"请求超时", category:"4xx", py:"qqcs",
 meaning_cn:"服务端等客户端把请求发完整等得太久，主动断开了连接。",
 scenario:"弱网环境下请求体发一半卡住；客户端发包过慢被服务端掐掉。",
 fix:"检查客户端网络质量；大文件改分片上传；服务端可适当调大请求超时时间。"},
{code:409, name_en:"Conflict", name_cn:"冲突", category:"4xx", py:"ct",
 meaning_cn:"请求和资源的当前状态冲突了：比如重复创建同名资源、两个人同时改同一条数据。",
 scenario:"重复提交创建导致唯一键冲突、并发编辑覆盖、版本号不一致。",
 fix:"先 GET 拿最新状态再重试；用版本号/ETag 做乐观锁避免并发覆盖；重复提交场景做幂等处理。"},
{code:410, name_en:"Gone", name_cn:"已删除", category:"4xx", py:"ysc",
 meaning_cn:"资源曾经存在，但现在永久没了。比 404 更明确：「别找了，它不会回来了」。",
 scenario:"下架的商品详情页、删除的文章永久地址。",
 fix:"SEO 上 410 会告诉搜索引擎删除索引，比 404 更干净；用户侧按「资源已下架」展示即可。"},
{code:411, name_en:"Length Required", name_cn:"需要长度头", category:"4xx", py:"xycdt",
 meaning_cn:"服务端要求请求必须带 Content-Length 头，拒绝长度不确定的请求。",
 scenario:"用 chunked 分块传输上传时被严格配置的服务端拒绝。",
 fix:"显式设置 Content-Length 请求头；无法预知长度时改走支持分块的服务端配置。"},
{code:412, name_en:"Precondition Failed", name_cn:"前置条件失败", category:"4xx", py:"qztjsb",
 meaning_cn:"请求里带的条件头（如 If-Match、If-Unmodified-Since）没满足，服务端拒绝执行，多用于并发控制。",
 scenario:"两个人同时编辑同一文档，后提交的人版本对不上被拒绝，防覆盖。",
 fix:"重新 GET 获取最新 ETag/版本号，基于最新版本再提交修改。"},
{code:413, name_en:"Content Too Large", name_cn:"内容过大", category:"4xx", py:"nrgd",
 meaning_cn:"请求体超过了服务端的体积限制，服务端拒绝接收。",
 scenario:"上传超大文件/图片、POST 提交了巨型 JSON。",
 fix:"查服务端限制（如 nginx 的 client_max_body_size）并调大；或前端压缩、分片上传。",
 note:"冷知识：这个码在 RFC 9110 里改名为 Content Too Large，老名字 Payload Too Large 仍常见于旧文档和旧实现中。"},
{code:414, name_en:"URI Too Long", name_cn:"URI 过长", category:"4xx", py:"urigc",
 meaning_cn:"URL 太长，服务端拒绝处理（很多服务端对 URL 长度有限制）。",
 scenario:"GET 请求把几十上百个参数全塞进 URL 查询串。",
 fix:"把参数改放到 POST 请求体里；精简查询参数，避免 URL 膨胀。"},
{code:415, name_en:"Unsupported Media Type", name_cn:"不支持的媒体类型", category:"4xx", py:"bzcdmtlx",
 meaning_cn:"请求体的 Content-Type 服务端不支持：格式对，但人家不吃这一套。",
 scenario:"接口只要 application/json，你发了 text/plain；上传了服务端不支持的文件类型。",
 fix:"把 Content-Type 改成接口文档要求的类型；检查文件/数据格式是否在服务端白名单里。"},
{code:416, name_en:"Range Not Satisfiable", name_cn:"请求范围无效", category:"4xx", py:"qqfwwx",
 meaning_cn:"Range 头要的字节区间服务端给不了：比如文件只有 100 字节，你要 200-300。",
 scenario:"断点续传时本地记录的位置超过了服务端文件实际大小。",
 fix:"核对文件实际大小，修正 Range 区间；续传错乱时删掉本地分片从头下载。"},
{code:417, name_en:"Expectation Failed", name_cn:"期望失败", category:"4xx", py:"qwsb",
 meaning_cn:"请求 Expect 头里的期望服务端满足不了，于是拒绝整个请求。",
 scenario:"发了 Expect: 100-continue，但服务端不支持或拒绝该期望。",
 fix:"去掉 Expect 头直接重发；或确认服务端是否支持该期望机制。"},
{code:418, name_en:"I'm a teapot", name_cn:"我是茶壶", category:"4xx", py:"wsthk",
 meaning_cn:"服务端拒绝泡咖啡——因为它是一只茶壶。这是来自愚人节 RFC 的玩笑码，偶尔被当作彩蛋或反爬标识使用。",
 scenario:"API 彩蛋、反爬虫时的趣味返回、某些框架的默认玩笑响应。",
 fix:"不是故障码，无需修复；若在生产接口里看到它，检查是不是反爬/彩蛋逻辑被触发了。",
 note:"冷知识：418 出自 1998 年愚人节 RFC 2324《超文本咖啡壶控制协议》，2017 年曾有人提议删除它，引发开发者强烈反对而保留，堪称「最有群众基础的状态码」；搜索 teapot 即可找到它。"},
{code:421, name_en:"Misdirected Request", name_cn:"请求被误导", category:"4xx", py:"qqbwd",
 meaning_cn:"请求被送到了处理不了它的服务器上，常见于连接复用把请求发错了地方。",
 scenario:"HTTP/2 连接复用、SNI/Host 与证书域名不匹配、多站点共用 IP。",
 fix:"检查客户端连接复用逻辑与 Host 头；服务端检查虚拟主机/证书域名配置。"},
{code:422, name_en:"Unprocessable Content", name_cn:"无法处理的内容", category:"4xx", py:"wfcldnr",
 meaning_cn:"请求格式没问题，服务端也看懂了，但语义上有错处理不了（比如字段校验不通过）。",
 scenario:"JSON 结构正确但字段值非法：邮箱格式不对、必填字段为空、业务规则校验失败。",
 fix:"看响应体里的字段级错误信息，逐个修正后重发；它是「语义错」不是「格式错」，别去检查 JSON 括号。"},
{code:423, name_en:"Locked", name_cn:"已锁定", category:"4xx", py:"ysd",
 meaning_cn:"资源当前被锁定，不能修改（WebDAV 专用）。",
 scenario:"WebDAV 文件被其他用户锁定编辑中。",
 fix:"等待锁定释放或联系锁定者解锁后再操作。"},
{code:424, name_en:"Failed Dependency", name_cn:"依赖失败", category:"4xx", py:"ylsb",
 meaning_cn:"因为它依赖的另一个请求失败了，所以这个请求也没法执行（WebDAV 专用）。",
 scenario:"WebDAV 批量操作中前一个 COPY/MOVE 失败导致后续连锁失败。",
 fix:"先修好它依赖的那个请求，再整体重试。"},
{code:425, name_en:"Too Early", name_cn:"请求过早", category:"4xx", py:"qggz",
 meaning_cn:"服务端不愿处理可能被重放的「早期数据」（TLS 1.3 的 0-RTT 早发数据），要求客户端正常重发一次。",
 scenario:"启用 TLS 1.3 early-data（0-RTT）的请求被服务端拒绝早发。",
 fix:"客户端收到 425 后用常规握手重发一次即可；服务端确认重放保护配置正确。"},
{code:426, name_en:"Upgrade Required", name_cn:"需要升级", category:"4xx", py:"xysj",
 meaning_cn:"当前协议不满足要求，请升级后再来（比如必须用 TLS 或 HTTP/2）。",
 scenario:"服务端强制要求 HTTPS、强制协议升级的 API 网关。",
 fix:"按响应 Upgrade 头的指示升级客户端协议/连接方式后重试。"},
{code:428, name_en:"Precondition Required", name_cn:"需要前置条件", category:"4xx", py:"xqztj",
 meaning_cn:"服务端要求请求必须带条件头（如 If-Match），防止无保护的并发覆盖，是一种强制乐观锁。",
 scenario:"要求带版本校验的更新接口；防「丢失更新」严格模式的 API。",
 fix:"请求加上 If-Match（带当前 ETag/版本号）等条件头后重试。"},
{code:429, name_en:"Too Many Requests", name_cn:"请求过多", category:"4xx", py:"qqgd",
 meaning_cn:"请求太频繁，触发服务端的限流了：慢一点，歇会儿再来。通常会带 Retry-After 头告诉你等多久。",
 scenario:"爬虫被反爬限流、压测打爆接口、前端轮询太猛、突发流量触发网关限流。",
 fix:"按 Retry-After 头退避重试（指数退避）；减少请求频率、加缓存、合并请求；长期超量就去申请更高配额。"},
{code:431, name_en:"Request Header Fields Too Large", name_cn:"请求头过大", category:"4xx", py:"qqtgd",
 meaning_cn:"请求头太大了，服务端拒绝处理。最常见的原因是 Cookie 膨胀。",
 scenario:"Cookie 越积越大、自定义头塞了太多内容、SSO 票据过大。",
 fix:"清理过期 Cookie、精简自定义请求头；必要时调大服务端的请求头大小限制。"},
{code:451, name_en:"Unavailable For Legal Reasons", name_cn:"因法律原因不可用", category:"4xx", py:"yflyybky",
 meaning_cn:"因为法律要求，这部分内容不能提供（比如版权下架、合规审查）。响应里通常会说明法律依据。",
 scenario:"版权方要求下架的内容、地区合规屏蔽的页面、法院禁令涉及的资源。",
 fix:"普通用户侧无法「修复」；可查看响应/页面中注明的法律依据与申诉渠道。",
 note:"冷知识：451 致敬雷·布拉德伯里的小说《华氏451度》（Fahrenheit 451）——书中「451 华氏度是纸张的燃点」，用焚书隐喻内容因法律原因消失。"},

/* ---- 5xx 服务端错误 ---- */
{code:500, name_en:"Internal Server Error", name_cn:"服务器内部错误", category:"5xx", py:"fwqnbcw",
 meaning_cn:"服务端自己出 bug 了：代码异常、空指针、配置错误都可能抛 500，但它不会告诉你具体哪儿错了。",
 scenario:"后端代码抛未捕获异常、数据库连不上、模板渲染失败。",
 fix:"看服务端日志里的堆栈定位 bug；客户端侧只能重试或联系后端，刷新通常没用。"},
{code:501, name_en:"Not Implemented", name_cn:"未实现", category:"5xx", py:"wsx",
 meaning_cn:"服务端不支持这个功能或请求方法：不是你不该发，是它还不会处理。",
 scenario:"代理/网关不支持新的 HTTP 方法、调用了服务端没实现的老接口。",
 fix:"确认方法名没拼错；换服务端支持的方式调用；后端按需补实现。"},
{code:502, name_en:"Bad Gateway", name_cn:"网关错误", category:"5xx", py:"wgcw",
 meaning_cn:"作为网关/代理的服务器，没能从上游拿到有效响应：上游挂了、超时了，或者返回了网关看不懂的东西。",
 scenario:"nginx 后面的应用挂了、PHP-FPM 崩了、上游端口配错、网关等上游超时。",
 fix:"检查上游服务是否存活、端口/地址配置是否正确；看网关错误日志定位是上游挂了还是超时。"},
{code:503, name_en:"Service Unavailable", name_cn:"服务不可用", category:"5xx", py:"fwbky",
 meaning_cn:"服务端暂时扛不住：过载、发版维护、熔断限流都可能返回 503，通常是暂时的。",
 scenario:"流量洪峰打满、发布中新旧版本切换、主动熔断保护。",
 fix:"看 Retry-After 头稍后重试；持续 503 联系运维扩容或确认维护窗口。"},
{code:504, name_en:"Gateway Timeout", name_cn:"网关超时", category:"5xx", py:"wgcs",
 meaning_cn:"网关等上游响应等得太久，只能超时返回：上游没挂，但慢得离谱。",
 scenario:"上游接口慢查询、数据库死锁、第三方依赖响应慢拖住网关。",
 fix:"优化上游接口耗时（慢查询、锁等待）；网关适当调大超时；检查上游是否被打满导致排队。"},
{code:505, name_en:"HTTP Version Not Supported", name_cn:"HTTP 版本不支持", category:"5xx", py:"httpbbbzc",
 meaning_cn:"服务端不支持请求里用的那个 HTTP 版本。",
 scenario:"客户端用了古董 HTTP 版本或服务端没开启对应版本支持。",
 fix:"客户端降级到 HTTP/1.1 重试；服务端按需开启新版本支持。"},
{code:506, name_en:"Variant Also Negotiates", name_cn:"变体协商异常", category:"5xx", py:"btxsyc",
 meaning_cn:"服务端内容协商配错了，导致协商过程死循环，只能报错。",
 scenario:"Apache 等的内容协商（variant negotiation）配置错误。",
 fix:"服务端检查并修正内容协商/变体配置；客户端侧无解。"},
{code:507, name_en:"Insufficient Storage", name_cn:"存储空间不足", category:"5xx", py:"cckjbz",
 meaning_cn:"服务端存不下了：磁盘满了或配额用完了，写不进去。",
 scenario:"WebDAV 上传、磁盘写满、云存储配额耗尽。",
 fix:"清理磁盘空间、扩容或申请更大配额后重试。"},
{code:508, name_en:"Loop Detected", name_cn:"检测到循环", category:"5xx", py:"jcdxh",
 meaning_cn:"服务端在处理请求时发现了无限循环，只能叫停（WebDAV 专用）。",
 scenario:"WebDAV Depth: infinity 深层遍历遇到循环引用。",
 fix:"检查资源之间的引用关系，消除循环引用后重试。"},
{code:510, name_en:"Not Extended", name_cn:"未扩展", category:"5xx", py:"wkz",
 meaning_cn:"请求要求某个扩展，但服务端没实现它，无法满足。",
 scenario:"HTTP 扩展协商机制的遗留场景，实际极少见。",
 fix:"确认是否真的需要该扩展；去掉扩展需求后重试。"},
{code:511, name_en:"Network Authentication Required", name_cn:"需要网络认证", category:"5xx", py:"xywlrz",
 meaning_cn:"要先通过网络层的认证（比如 captive portal 登录页）才能上网，请求被拦截了。",
 scenario:"机场/酒店/商场 WiFi 的强制登录页、校园网认证。",
 fix:"打开浏览器完成 portal 页登录认证；认证通过后重发请求。"}
];

/* ================= 2. 纯逻辑：查询/筛选 ================= */

/* 规范化查询串：去首尾空格、转小写 */
function normalizeQuery(q) {
    if (q === null || q === undefined) return "";
    return String(q).replace(/^\s+|\s+$/g, "").toLowerCase();
}

/* 按码号取条目，未找到返回 null */
function getStatusByCode(code) {
    var n = parseInt(code, 10);
    if (isNaN(n)) return null;
    for (var i = 0; i < STATUS_CODES.length; i++) {
        if (STATUS_CODES[i].code === n) return STATUS_CODES[i];
    }
    return null;
}

/* 单条目是否匹配查询串：码号/英文原名/中文名称/拼音首字母/含义/场景/排查建议 */
function matchEntry(entry, q) {
    if (!q) return true;
    var hay = [
        String(entry.code),
        entry.name_en,
        entry.name_cn,
        entry.py || "",
        entry.meaning_cn,
        entry.scenario,
        entry.fix
    ].join("\n").toLowerCase();
    return hay.indexOf(q) !== -1;
}

/* 搜索：返回匹配条目数组（保持码号升序） */
function searchStatus(query) {
    var q = normalizeQuery(query);
    var out = [];
    for (var i = 0; i < STATUS_CODES.length; i++) {
        if (matchEntry(STATUS_CODES[i], q)) out.push(STATUS_CODES[i]);
    }
    return out;
}

/* 类别筛选：cat 取 all/1xx/2xx/3xx/4xx/5xx */
function filterByCategory(cat) {
    if (!cat || cat === "all") return STATUS_CODES.slice();
    var out = [];
    for (var i = 0; i < STATUS_CODES.length; i++) {
        if (STATUS_CODES[i].category === cat) out.push(STATUS_CODES[i]);
    }
    return out;
}

/* 搜索 + 类别双条件过滤 */
function queryStatus(query, cat) {
    var q = normalizeQuery(query);
    var out = [];
    for (var i = 0; i < STATUS_CODES.length; i++) {
        var e = STATUS_CODES[i];
        if (cat && cat !== "all" && e.category !== cat) continue;
        if (matchEntry(e, q)) out.push(e);
    }
    return out;
}

/* HTML 转义（卡片渲染防 XSS） */
function escHtml(s) {
    return String(s === null || s === undefined ? "" : s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

/* 单卡片 HTML（详情区默认收起，点击展开） */
function renderCard(entry) {
    var html = "";
    html += '<article class="hsr-card hsr-cat-' + escHtml(entry.category) + '" data-code="' + entry.code + '" tabindex="0" role="button" aria-expanded="false">';
    html += '<div class="hsr-card-head">';
    html += '<span class="hsr-code">' + entry.code + '</span>';
    html += '<span class="hsr-cat-badge">' + escHtml(entry.category) + '</span>';
    html += '</div>';
    html += '<div class="hsr-name-cn">' + escHtml(entry.name_cn) + '</div>';
    html += '<div class="hsr-name-en">' + escHtml(entry.name_en) + '</div>';
    html += '<div class="hsr-detail">';
    html += '<dl>';
    html += '<dt>英文原名</dt><dd>' + escHtml(entry.code) + ' ' + escHtml(entry.name_en) + '</dd>';
    html += '<dt>中文含义</dt><dd>' + escHtml(entry.meaning_cn) + '</dd>';
    html += '<dt>常见场景</dt><dd>' + escHtml(entry.scenario) + '</dd>';
    html += '<dt>排查建议</dt><dd>' + escHtml(entry.fix) + '</dd>';
    if (entry.note) {
        html += '<dt>冷知识</dt><dd class="hsr-note">' + escHtml(entry.note) + '</dd>';
    }
    html += '</dl>';
    html += '<p class="hsr-disclaimer">中文释义仅供参考，规范语义以 RFC/MDN 为准。</p>';
    html += '</div>';
    html += '</article>';
    return html;
}

/* 结果为空时的占位 HTML */
function renderEmpty(query) {
    return '<div class="hsr-empty">没有找到与「' + escHtml(query) + '」相关的状态码，换个关键词试试（支持码号/中英文/拼音首字母）。</div>';
}

var api = {
    STATUS_CODES: STATUS_CODES,
    CATEGORY_LABELS: CATEGORY_LABELS,
    CATEGORY_KEYS: CATEGORY_KEYS,
    normalizeQuery: normalizeQuery,
    getStatusByCode: getStatusByCode,
    searchStatus: searchStatus,
    filterByCategory: filterByCategory,
    queryStatus: queryStatus,
    escHtml: escHtml,
    renderCard: renderCard,
    renderEmpty: renderEmpty
};

if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
} else if (typeof window !== "undefined") {
    window.HttpStatusRef = api;
}

/* ================= 3. 浏览器 DOM 装配 ================= */

if (typeof document !== "undefined" && typeof window !== "undefined") {
(function () {
var H = (typeof window.HttpStatusRef !== "undefined") ? window.HttpStatusRef : api;

function $(id) { return document.getElementById(id); }

function currentState() {
    var searchEl = $("hsr-search");
    var tabEl = document.querySelector(".hsr-tab.active");
    return {
        query: searchEl ? searchEl.value : "",
        cat: tabEl ? tabEl.getAttribute("data-cat") : "all"
    };
}

function render() {
    var grid = $("hsr-grid");
    var count = $("hsr-count");
    if (!grid) return;
    var st = currentState();
    var list = H.queryStatus(st.query, st.cat);
    var html = "";
    for (var i = 0; i < list.length; i++) {
        html += H.renderCard(list[i]);
    }
    if (list.length === 0) {
        html = H.renderEmpty(H.normalizeQuery(st.query) || "当前筛选");
    }
    grid.innerHTML = html;
    if (count) {
        count.textContent = "共 " + list.length + " 个状态码" +
            (st.cat !== "all" ? "（" + (H.CATEGORY_LABELS[st.cat] || st.cat) + "）" : "");
    }
    bindCards(grid);
}

function bindCards(grid) {
    var cards = grid.querySelectorAll(".hsr-card");
    for (var i = 0; i < cards.length; i++) {
        (function (card) {
            function toggle() {
                var open = card.classList.toggle("hsr-open");
                card.setAttribute("aria-expanded", open ? "true" : "false");
            }
            card.addEventListener("click", toggle);
            card.addEventListener("keydown", function (e) {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggle();
                }
            });
        })(cards[i]);
    }
}

function init() {
    var searchEl = $("hsr-search");
    if (searchEl) {
        searchEl.addEventListener("input", render);
    }
    var tabs = document.querySelectorAll(".hsr-tab");
    for (var i = 0; i < tabs.length; i++) {
        (function (tab) {
            tab.addEventListener("click", function () {
                for (var j = 0; j < tabs.length; j++) {
                    tabs[j].classList.remove("active");
                }
                tab.classList.add("active");
                render();
            });
        })(tabs[i]);
    }
    var clearBtn = $("hsr-clear");
    if (clearBtn) {
        clearBtn.addEventListener("click", function () {
            if (searchEl) searchEl.value = "";
            var allTab = document.querySelector('.hsr-tab[data-cat="all"]');
            if (allTab) allTab.click(); else render();
            if (searchEl) searchEl.focus();
        });
    }
    render();
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
} else {
    init();
}

})();
}

})();
