/* 字体版权查询 - 纯前端：canvas 本地字体探测 + 离线版权状态库，无任何网络请求 */
(function () {
'use strict';

/* 版权状态库：n=名称, a=别名, s=free(免费商用)/paid(需付费授权)/risk(高风险), d=说明, alt=免费商用替代推荐
   信息整理自公开资料，仅供参考，以各权利方官方政策为准。 */
var FONT_DB = [
/* ============ 免费商用 ============ */
{n:"思源黑体",a:["Source Han Sans SC","Noto Sans CJK SC","Noto Sans SC","Source Han Sans CN"],s:"free",d:"Adobe 与 Google 联合开发，SIL OFL 开源协议，个人与企业均可免费商用。",alt:[]},
{n:"思源宋体",a:["Source Han Serif SC","Noto Serif CJK SC","Noto Serif SC"],s:"free",d:"Adobe 与 Google 联合开发，SIL OFL 开源协议，可免费商用。",alt:[]},
{n:"思源柔黑体",a:["GenJyuuGothic"],s:"free",d:"基于思源黑体的圆体衍生开源字体，SIL OFL 协议，可免费商用。",alt:[]},
{n:"思源真黑体",a:["GenSenRounded"],s:"free",d:"基于思源黑体的圆体衍生开源字体，SIL OFL 协议，可免费商用。",alt:[]},
{n:"思源等宽",a:["Source Han Mono"],s:"free",d:"思源黑体等宽版本，SIL OFL 协议，可免费商用。",alt:[]},
{n:"阿里巴巴普惠体",a:["Alibaba PuHuiTi","AlibabaPuHuiTi","普惠体"],s:"free",d:"阿里巴巴官方发布，永久免费商用（含 2.0/3.0 及日韩/繁体版本）。",alt:[]},
{n:"阿里妈妈数黑体",a:["Alimama ShuHeiTi"],s:"free",d:"阿里妈妈官方发布，免费商用，适合数字与标题场景。",alt:[]},
{n:"阿里妈妈东方大楷",a:["Alimama DongFangDaKai"],s:"free",d:"阿里妈妈官方发布，免费商用。",alt:[]},
{n:"站酷快乐体",a:["ZCOOL KuaiLe","站酷快乐体2016修订版"],s:"free",d:"站酷官方发布，免费商用。",alt:[]},
{n:"站酷高端黑",a:["ZCOOL GaoDuanHei"],s:"free",d:"站酷官方发布，免费商用。",alt:[]},
{n:"站酷酷黑",a:["ZCOOL KuHei"],s:"free",d:"站酷官方发布，免费商用。",alt:[]},
{n:"站酷庆科黄油体",a:["ZCOOL QingKe HuangYou","庆科黄油体"],s:"free",d:"站酷 × 郑庆科联名发布，免费商用。",alt:[]},
{n:"站酷小薇LOGO体",a:["ZCOOL XiaoWei"],s:"free",d:"站酷官方发布，免费商用。",alt:[]},
{n:"站酷文艺体",a:["ZCOOL WenYi"],s:"free",d:"站酷官方发布，免费商用。",alt:[]},
{n:"站酷仓耳渔阳体",a:["ZCOOL CangEr YuYang"],s:"free",d:"站酷 × 仓耳字库联名发布，免费商用。",alt:[]},
{n:"OPPO Sans",a:["OPPO Sans SC"],s:"free",d:"OPPO 官方宣布免费授权全社会使用，包括商业用途。",alt:[]},
{n:"HarmonyOS Sans SC",a:["HarmonyOS Sans","鸿蒙字体"],s:"free",d:"华为鸿蒙系统品牌字体，官方免费商用。",alt:[]},
{n:"MiSans",a:["小米字体"],s:"free",d:"小米官方品牌字体，免费商用。",alt:[]},
{n:"Honor Sans",a:["荣耀字体"],s:"free",d:"荣耀官方品牌字体，免费商用。",alt:[]},
{n:"vivo Sans",a:["vivo字体"],s:"free",d:"vivo 与方正字库联合设计，2024 年 10 月宣布面向全社会免费商用。",alt:[]},
{n:"钉钉进步体",a:["DingTalk JinBuTi"],s:"free",d:"钉钉官方发布，免费商用。",alt:[]},
{n:"斗鱼追光体",a:["DouYu ZGZ"],s:"free",d:"斗鱼官方发布，免费商用。",alt:[]},
{n:"抖音美好体",a:["Douyin MeiHaoTi"],s:"free",d:"字节跳动官方发布，免费商用。",alt:[]},
{n:"IBM Plex Sans",a:["IBM Plex Sans SC"],s:"free",d:"IBM 官方开源字体，SIL OFL 协议，可免费商用。",alt:[]},
{n:"得意黑",a:["Smiley Sans"],s:"free",d:"设计师 atDrew 免费发布，可免费商用。",alt:[]},
{n:"霞鹜文楷",a:["LXGW WenKai","LXGW WenKai Mono"],s:"free",d:"落霞孤鹜开源项目，SIL OFL 协议，可免费商用。",alt:[]},
{n:"霞鹜漫黑",a:["LXGW Marker Gothic"],s:"free",d:"落霞孤鹜开源项目，SIL OFL 协议，可免费商用。",alt:[]},
{n:"霞鹜臻楷",a:["LXGW ZhenKai"],s:"free",d:"落霞孤鹜开源项目，SIL OFL 协议，可免费商用。",alt:[]},
{n:"粉圆体",a:["jf open huninn","小赖字体","小赖字体2.0","Open 粉圆"],s:"free",d:"justfont / 落霞孤鹜开源，SIL OFL 协议，可免费商用。",alt:[]},
{n:"一点明体",a:["I.Ming"],s:"free",d:"开源明体，可免费商用。",alt:[]},
{n:"花园明朝体",a:["Hanazono Mincho"],s:"free",d:"开源字体，收字量大（含大量汉字），可免费商用。",alt:[]},
{n:"装甲明朝体",a:["Armada Mincho"],s:"free",d:"开源明朝体，SIL OFL 协议，可免费商用。",alt:[]},
{n:"源界明朝",a:["Genkai Mincho"],s:"free",d:"开源明朝体，SIL OFL 协议，可免费商用。",alt:[]},
{n:"源云明朝",a:["Genun Mincho"],s:"free",d:"开源明朝体，SIL OFL 协议，可免费商用。",alt:[]},
{n:"源泉圆体",a:["Gensen Rounded"],s:"free",d:"开源圆体，SIL OFL 协议，可免费商用。",alt:[]},
{n:"濑户字体",a:["SetoFont"],s:"free",d:"日本开源手写风字体，可免费商用。",alt:[]},
{n:"M+ 系列",a:["M+ 1c","M+ 2c","M+ 1p"],s:"free",d:"日本开源字体，可免费商用。",alt:[]},
{n:"寒蝉全圆体",a:["HanChan Full Circle"],s:"free",d:"开源圆体，SIL OFL 协议，可免费商用。",alt:[]},
{n:"寒蝉点阵体",a:["HanChan Dot"],s:"free",d:"开源点阵字体，SIL OFL 协议，可免费商用。",alt:[]},
{n:"缝合像素字体",a:["Fusion Pixel Font"],s:"free",d:"开源像素字体，SIL OFL 协议，可免费商用。",alt:[]},
{n:"Zpix 点阵字体",a:["Zpix"],s:"free",d:"开源点阵字体，SIL OFL 协议，可免费商用。",alt:[]},
{n:"文泉驿正黑",a:["WenQuanYi Zen Hei"],s:"free",d:"GPL 开源中文字体，可免费商用。",alt:[]},
{n:"文泉驿微米黑",a:["WenQuanYi Micro Hei"],s:"free",d:"GPL 开源中文字体，可免费商用。",alt:[]},
{n:"王汉宗中明体",a:["WangHanZong Middle Ming"],s:"free",d:"王汉宗 GPL 开源字体，可免费商用。",alt:[]},
{n:"王汉宗细明体",a:["WangHanZong Fine Ming"],s:"free",d:"王汉宗 GPL 开源字体，可免费商用。",alt:[]},
{n:"王汉宗粗明体",a:["WangHanZong Bold Ming"],s:"free",d:"王汉宗 GPL 开源字体，可免费商用。",alt:[]},
{n:"王汉宗特明体",a:["WangHanZong Special Ming"],s:"free",d:"王汉宗 GPL 开源字体，可免费商用。",alt:[]},
{n:"王汉宗勘亭流",a:["WangHanZong KanTingLiu"],s:"free",d:"王汉宗 GPL 开源字体，可免费商用。",alt:[]},
{n:"全字库正宋体",a:["QuanZiKu ZhengSong"],s:"free",d:"全字库开源字体，可免费商用。",alt:[]},
{n:"全字库正楷体",a:["QuanZiKu ZhengKai"],s:"free",d:"全字库开源字体，可免费商用。",alt:[]},
{n:"cwTeX圆体",a:["cwTeXYen"],s:"free",d:"cwTeX 开源（GPL+例外），可免费商用。",alt:[]},
{n:"cwTeX仿宋体",a:["cwTeXFangSong"],s:"free",d:"cwTeX 开源（GPL+例外），可免费商用。",alt:[]},
{n:"cwTeX楷体",a:["cwTeXKai"],s:"free",d:"cwTeX 开源（GPL+例外），可免费商用。",alt:[]},
{n:"cwTeX明体",a:["cwTeXMing"],s:"free",d:"cwTeX 开源（GPL+例外），可免费商用。",alt:[]},
{n:"cwTeX黑体",a:["cwTeXHei"],s:"free",d:"cwTeX 开源（GPL+例外），可免费商用。",alt:[]},
{n:"文鼎PL细上海宋",a:["WenDing PL Fine Shanghai Song"],s:"free",d:"文鼎 PL 开源系列（GPL+例外），可免费商用；注意与文鼎商用字库区分。",alt:[]},
{n:"文鼎PL简报宋",a:["WenDing PL Simple BaoSong"],s:"free",d:"文鼎 PL 开源系列（GPL+例外），可免费商用。",alt:[]},
{n:"文鼎PL简中楷",a:["WenDing PL Simple ZhongKai"],s:"free",d:"文鼎 PL 开源系列（GPL+例外），可免费商用。",alt:[]},
{n:"方正黑体",a:["方正黑体简体"],s:"free",d:"方正字库公益免费商用（仅简体版）；繁体及其他字重仍需购买授权。",alt:[]},
{n:"方正书宋",a:["方正书宋简体"],s:"free",d:"方正字库公益免费商用（仅简体版）；繁体仍需购买授权。",alt:[]},
{n:"方正仿宋",a:["方正仿宋简体"],s:"free",d:"方正字库公益免费商用（仅简体版）；繁体仍需购买授权。",alt:[]},
{n:"方正楷体",a:["方正楷体简体"],s:"free",d:"方正字库公益免费商用（仅简体版）；繁体仍需购买授权。",alt:[]},
{n:"方正甲骨文",a:["方正甲骨文简体"],s:"free",d:"方正字库公益免费商用。",alt:[]},
{n:"京華老宋体",a:["京华老宋体"],s:"free",d:"京華老宋体官方免费商用。",alt:[]},
{n:"庞门正道标题体",a:["PangMenZhengDao BiaoTi"],s:"free",d:"庞门正道官方免费商用。",alt:[]},
{n:"庞门正道粗书体",a:["PangMenZhengDao CuShu"],s:"free",d:"庞门正道官方免费商用。",alt:[]},
{n:"庞门正道轻松体",a:["PangMenZhengDao QingSong"],s:"free",d:"庞门正道官方免费商用。",alt:[]},
{n:"优设标题黑",a:["YouShe BiaoTiHei"],s:"free",d:"优设网官方免费商用。",alt:[]},
{n:"优设好身体",a:["YouShe HaoShenTi"],s:"free",d:"优设网官方免费商用。",alt:[]},
{n:"胡晓波真帅体",a:["HuXiaoBo ZhenShuai"],s:"free",d:"胡晓波工作室免费发布，可免费商用。",alt:[]},
{n:"锐字真言体",a:["RuiZi ZhenYan"],s:"free",d:"锐字字库官方免费商用。",alt:[]},
{n:"字魂扁桃体",a:["ZiHun BianTao"],s:"free",d:"字魂官方免费商用字体。",alt:[]},
{n:"字制区喜脉体",a:["ZiZhiQu XiMai"],s:"free",d:"字制区官方免费商用。",alt:[]},
{n:"字制区岳阳体",a:["ZiZhiQu YueYang"],s:"free",d:"字制区官方免费商用。",alt:[]},
{n:"杨任东竹石体",a:["YangRenDong ZhuShi"],s:"free",d:"杨任东官方免费商用。",alt:[]},
{n:"沐瑶软笔手写体",a:["MuYao RuanBi"],s:"free",d:"沐瑶官方免费商用。",alt:[]},
{n:"演示佛系体",a:["YanShi FoXi"],s:"free",d:"演示字库官方免费商用。",alt:[]},
{n:"演示夏行楷",a:["YanShi XiaXingKai"],s:"free",d:"演示字库官方免费商用。",alt:[]},
{n:"演示镇魂行楷",a:["YanShi ZhenHunXingKai"],s:"free",d:"演示字库官方免费商用。",alt:[]},
{n:"演示秋鸿楷",a:["YanShi QiuHongKai"],s:"free",d:"演示字库官方免费商用。",alt:[]},
{n:"千图笔锋手写体",a:["QianTu BiFeng"],s:"free",d:"千图网官方免费商用。",alt:[]},
{n:"千图小兔体",a:["QianTu XiaoTu"],s:"free",d:"千图网官方免费商用。",alt:[]},
{n:"千图马克手写体",a:["QianTu MaKe"],s:"free",d:"千图网官方免费商用。",alt:[]},
{n:"包图小白体",a:["BaoTu XiaoBai"],s:"free",d:"包图网官方免费商用。",alt:[]},
{n:"鸿雷板书简体",a:["鸿雷板书","HongLei BanShu"],s:"free",d:"鸿雷字库官方免费商用。",alt:[]},
{n:"鸿雷拙书简体",a:["鸿雷拙书","HongLei ZhuoShu"],s:"free",d:"鸿雷字库官方免费商用。",alt:[]},
{n:"江西拙楷",a:["JiangXi ZhuoKai"],s:"free",d:"江西拙楷官方免费商用。",alt:[]},
{n:"三极行楷简体",a:["三极行楷","SanJi XingKai"],s:"free",d:"三极字库官方免费商用。",alt:[]},
{n:"三极素纤简体",a:["三极素纤","SanJi SuXian"],s:"free",d:"三极字库官方免费商用。",alt:[]},
{n:"凝书体",a:["NingShu"],s:"free",d:"凝书体官方免费商用。",alt:[]},
{n:"马善政毛笔体",a:["MaShanZheng MaoBi"],s:"free",d:"马善政官方免费商用。",alt:[]},
{n:"辰宇落雁体",a:["ChenYu LuoYan"],s:"free",d:"辰宇落雁体官方免费商用。",alt:[]},
{n:"字体圈欣意冠黑体",a:["ZiTiQuan XinYiGuanHei"],s:"free",d:"字体圈官方免费商用。",alt:[]},
{n:"字体圈欣意吉祥宋",a:["ZiTiQuan XinYiJiXiangSong"],s:"free",d:"字体圈官方免费商用。",alt:[]},
{n:"851手写杂书体",a:["851手写体"],s:"free",d:"作者免费发布，可免费商用。",alt:[]},
{n:"宅在家自动笔",a:["ZhaiZaiJia"],s:"free",d:"作者免费发布，可免费商用。",alt:[]},
{n:"WD-XL滑油字",a:["滑油字","WD-XL HuaYou"],s:"free",d:"夜煞之乐免费发布，可免费商用。",alt:[]},
{n:"猫啃网糖圆体",a:["糖圆体","MaoKen TangYuan"],s:"free",d:"猫啃网 × 夜煞之乐免费发布，可免费商用。",alt:[]},
{n:"仓耳舒圆体",a:["CangEr ShuYuan"],s:"free",d:"仓耳字库官方免费商用。",alt:[]},
{n:"仓耳小丸子",a:["CangEr XiaoWanZi"],s:"free",d:"仓耳字库官方免费商用。",alt:[]},
{n:"仓耳非白",a:["CangEr FeiBai"],s:"free",d:"仓耳字库官方免费商用。",alt:[]},
{n:"仓耳今楷",a:["CangEr JinKai"],s:"free",d:"仓耳字库官方免费商用。",alt:[]},
{n:"仓耳与墨",a:["CangEr YuMo"],s:"free",d:"仓耳字库官方免费商用。",alt:[]},
{n:"仓耳周珂正大榜书",a:["CangEr ZhouKe"],s:"free",d:"仓耳字库官方免费商用。",alt:[]},
{n:"新蒂黑板报体",a:["XinDi HeiBanBao"],s:"free",d:"新蒂字库官方免费商用。",alt:[]},
{n:"新蒂下午茶体",a:["XinDi XiaWuCha"],s:"free",d:"新蒂字库官方免费商用。",alt:[]},
{n:"新蒂泡芙体",a:["XinDi PaoFu"],s:"free",d:"新蒂字库官方免费商用。",alt:[]},
{n:"汉仪霸蛮体",a:["HanYi BaMan"],s:"free",d:"汉仪 × 湖湘文化公益发布，免费商用。",alt:[]},
{n:"Droid Sans Fallback",a:["Droid Sans"],s:"free",d:"Apache 开源协议，Android 系统字体，可免费商用。",alt:[]},
{n:"源样明朝",a:["GenYoMin"],s:"free",d:"开源明朝体，SIL OFL 协议，可免费商用。",alt:[]},
{n:"源样黑体",a:["GenYoGothic"],s:"free",d:"开源黑体，SIL OFL 协议，可免费商用。",alt:[]},
{n:"BIZ UDP哥特体",a:["BIZ UDPGothic"],s:"free",d:"MORISAWA BIZ+ 免费字体，可免费商用。",alt:[]},
{n:"BIZ UDP明朝体",a:["BIZ UDPMincho"],s:"free",d:"MORISAWA BIZ+ 免费字体，可免费商用。",alt:[]},
{n:"DotGothic16",a:["DotGothic 16"],s:"free",d:"开源点阵风字体，SIL OFL 协议，可免费商用。",alt:[]},
{n:"Sawarabi Mincho",a:["Sawarabi明朝"],s:"free",d:"开源日文明朝体，SIL OFL 协议，可免费商用。",alt:[]},
{n:"Sawarabi Gothic",a:["Sawarabi哥特"],s:"free",d:"开源日文哥特体，SIL OFL 协议，可免费商用。",alt:[]},
/* ============ 需付费授权 ============ */
{n:"方正兰亭黑简体",a:["方正兰亭黑"],s:"paid",d:"方正字库商用需购买授权。",alt:["思源黑体","阿里巴巴普惠体","OPPO Sans"]},
{n:"方正兰亭中黑简体",a:["方正兰亭中黑"],s:"paid",d:"方正字库商用需购买授权。",alt:["思源黑体","阿里巴巴普惠体"]},
{n:"方正兰亭特黑简体",a:["方正兰亭特黑"],s:"paid",d:"方正字库商用需购买授权。",alt:["思源黑体"]},
{n:"方正姚体",a:["方正姚体简体"],s:"paid",d:"方正字库商用需购买授权。",alt:["思源宋体","霞鹜文楷"]},
{n:"方正舒体",a:["方正舒体简体"],s:"paid",d:"方正字库商用需购买授权。",alt:["演示夏行楷","沐瑶软笔手写体"]},
{n:"方正小标宋",a:["方正小标宋简体"],s:"paid",d:"方正字库商用需购买授权。",alt:["思源宋体","方正书宋"]},
{n:"方正大标宋",a:["方正大标宋简体"],s:"paid",d:"方正字库商用需购买授权。",alt:["思源宋体"]},
{n:"方正综艺简体",a:["方正综艺"],s:"paid",d:"方正字库商用需购买授权。",alt:["站酷快乐体","庞门正道标题体"]},
{n:"方正粗黑简体",a:["方正粗黑"],s:"paid",d:"方正字库商用需购买授权。",alt:["思源黑体","阿里巴巴普惠体"]},
{n:"方正大黑简体",a:["方正大黑"],s:"paid",d:"方正字库商用需购买授权。",alt:["思源黑体","阿里巴巴普惠体"]},
{n:"方正正大黑简体",a:["方正正大黑"],s:"paid",d:"方正字库商用需购买授权。",alt:["思源黑体","阿里巴巴普惠体"]},
{n:"方正胖头鱼简体",a:["方正胖头鱼"],s:"paid",d:"方正字库商用需购买授权。",alt:["站酷快乐体","千图小兔体"]},
{n:"汉仪旗黑",a:["汉仪旗黑简体"],s:"paid",d:"汉仪字库商用需购买授权。",alt:["思源黑体","阿里巴巴普惠体"]},
{n:"汉仪中黑",a:["汉仪中黑简体"],s:"paid",d:"汉仪字库商用需购买授权。",alt:["思源黑体"]},
{n:"汉仪大黑",a:["汉仪大黑简体"],s:"paid",d:"汉仪字库商用需购买授权。",alt:["阿里巴巴普惠体"]},
{n:"汉仪菱心体",a:["汉仪菱心体简体"],s:"paid",d:"汉仪字库商用需购买授权。",alt:["站酷庆科黄油体","站酷快乐体"]},
{n:"汉仪秀英体",a:["汉仪秀英体简体"],s:"paid",d:"汉仪字库商用需购买授权。",alt:["站酷文艺体","霞鹜文楷"]},
{n:"汉仪水滴体",a:["汉仪水滴体简体"],s:"paid",d:"汉仪字库商用需购买授权。",alt:["站酷快乐体","千图小兔体"]},
{n:"华文宋体",a:["STSong","宋体-简","Songti SC"],s:"paid",d:"华文字库商用需购买授权；随 macOS / Office 附带仅为使用许可。",alt:["思源宋体","方正书宋"]},
{n:"华文黑体",a:["STHeiti","黑体-简"],s:"paid",d:"华文字库商用需购买授权；随系统附带仅为使用许可。",alt:["思源黑体","阿里巴巴普惠体"]},
{n:"华文楷体",a:["STKaiti","楷体-简","Kaiti SC"],s:"paid",d:"华文字库商用需购买授权；随系统附带仅为使用许可。",alt:["霞鹜文楷","方正楷体"]},
{n:"华文仿宋",a:["STFangsong","仿宋-简","仿宋_GB2312"],s:"paid",d:"华文字库商用需购买授权；随系统附带仅为使用许可。",alt:["方正仿宋","cwTeX仿宋体"]},
{n:"华文细黑",a:["STXihei"],s:"paid",d:"华文字库商用需购买授权。",alt:["思源黑体"]},
{n:"华文中宋",a:["STZhongsong"],s:"paid",d:"华文字库商用需购买授权。",alt:["思源宋体"]},
{n:"华文彩云",a:["STCaiyun"],s:"paid",d:"华文字库商用需购买授权。",alt:["站酷快乐体"]},
{n:"华文琥珀",a:["STHupo"],s:"paid",d:"华文字库商用需购买授权。",alt:["站酷庆科黄油体"]},
{n:"华文隶书",a:["STLiti"],s:"paid",d:"华文字库商用需购买授权。",alt:["江西拙楷"]},
{n:"华文新魏",a:["STXinwei"],s:"paid",d:"华文字库商用需购买授权。",alt:["三极行楷"]},
{n:"华文行楷",a:["STXingkai"],s:"paid",d:"华文字库商用需购买授权。",alt:["演示夏行楷","三极行楷"]},
{n:"华康少女文字",a:["华康少女体"],s:"paid",d:"华康字库商用需购买授权。",alt:["站酷快乐体","千图小兔体"]},
{n:"华康海报体",a:["华康海报体简体"],s:"paid",d:"华康字库商用需购买授权。",alt:["庞门正道标题体","优设标题黑"]},
{n:"华康圆体",a:["华康圆体简体"],s:"paid",d:"华康字库商用需购买授权。",alt:["源泉圆体","寒蝉全圆体"]},
{n:"华康金文体",a:["华康金文体简体"],s:"paid",d:"华康字库商用需购买授权。",alt:["方正甲骨文"]},
{n:"华康新综艺体",a:["华康新综艺体简体"],s:"paid",d:"华康字库商用需购买授权。",alt:["站酷酷黑","阿里巴巴普惠体"]},
{n:"造字工房朗宋",a:["造字工房朗宋简体"],s:"paid",d:"造字工房商用需购买授权。",alt:["思源宋体"]},
{n:"造字工房悦黑",a:["造字工房悦黑简体"],s:"paid",d:"造字工房商用需购买授权。",alt:["思源黑体","OPPO Sans"]},
{n:"造字工房力黑",a:["造字工房力黑简体"],s:"paid",d:"造字工房商用需购买授权。",alt:["阿里巴巴普惠体"]},
{n:"造字工房情圆",a:["造字工房情圆简体"],s:"paid",d:"造字工房商用需购买授权。",alt:["源泉圆体"]},
{n:"经典中黑",a:["经典中黑简体"],s:"paid",d:"经典字库商用需购买授权。",alt:["思源黑体"]},
{n:"经典特黑",a:["经典特黑简体"],s:"paid",d:"经典字库商用需购买授权。",alt:["阿里巴巴普惠体"]},
{n:"经典细黑",a:["经典细黑简体"],s:"paid",d:"经典字库商用需购买授权。",alt:["思源黑体"]},
{n:"文鼎粗黑",a:["文鼎粗黑简体"],s:"paid",d:"文鼎字库商用需购买授权（注意与免费的文鼎 PL 系列区分）。",alt:["思源黑体"]},
{n:"文鼎特粗黑",a:["文鼎特粗黑简体"],s:"paid",d:"文鼎字库商用需购买授权。",alt:["阿里巴巴普惠体"]},
{n:"文鼎中楷",a:["文鼎中楷简体"],s:"paid",d:"文鼎字库商用需购买授权。",alt:["霞鹜文楷"]},
{n:"蒙纳黑体",a:["蒙纳黑体简体"],s:"paid",d:"蒙纳字库商用需购买授权。",alt:["思源黑体"]},
{n:"蒙纳宋体",a:["蒙纳宋体简体"],s:"paid",d:"蒙纳字库商用需购买授权。",alt:["思源宋体"]},
{n:"钟齐翰墨体",a:["钟齐翰墨体简体"],s:"paid",d:"钟齐字库商用需购买授权。",alt:["马善政毛笔体","演示镇魂行楷"]},
{n:"汉鼎简黑变",a:["汉鼎简黑变简体"],s:"paid",d:"汉鼎字库商用需购买授权。",alt:["思源黑体"]},
{n:"汉鼎繁黑变",a:["汉鼎繁黑变繁体"],s:"paid",d:"汉鼎字库商用需购买授权。",alt:["思源黑体"]},
{n:"博洋黑体",a:["博洋黑体简体"],s:"paid",d:"博洋字库商用需购买授权。",alt:["思源黑体"]},
{n:"博洋宋体",a:["博洋宋体简体"],s:"paid",d:"博洋字库商用需购买授权。",alt:["思源宋体"]},
{n:"创艺简黑体",a:["创艺简黑体简体"],s:"paid",d:"创艺字库商用需购买授权。",alt:["思源黑体","阿里巴巴普惠体"]},
{n:"创艺简中黑",a:["创艺简中黑简体"],s:"paid",d:"创艺字库商用需购买授权。",alt:["思源黑体"]},
{n:"超研泽中宋",a:["超研泽中宋简体"],s:"paid",d:"超研泽字库商用需购买授权。",alt:["思源宋体"]},
{n:"超研泽中楷",a:["超研泽中楷简体"],s:"paid",d:"超研泽字库商用需购买授权。",alt:["霞鹜文楷"]},
{n:"叶根友微禅云",a:["叶根友微禅云简体"],s:"paid",d:"官网免费下载，但商用需购买授权；免费下载不等于免费商用。",alt:["沐瑶软笔手写体","演示佛系体"]},
{n:"叶根友刀锋黑草",a:["叶根友刀锋黑草简体"],s:"paid",d:"官网免费下载，但商用需购买授权。",alt:["马善政毛笔体"]},
{n:"冬青黑体简体中文",a:["冬青黑体","Hiragino Sans GB"],s:"paid",d:"字游工房字体，随 macOS / iOS 附带仅为使用许可，商用需授权。",alt:["思源黑体","OPPO Sans"]},
{n:"苹方",a:["PingFang SC","苹方-简"],s:"paid",d:"Apple 系统字体，仅限 Apple 平台使用许可，跨平台或商用需授权。",alt:["思源黑体","HarmonyOS Sans SC"]},
{n:"等线",a:["DengXian"],s:"paid",d:"微软系统字体，随 Windows 为使用许可，商业发布建议购买授权。",alt:["思源黑体","阿里巴巴普惠体"]},
{n:"微软正黑体",a:["Microsoft JhengHei"],s:"paid",d:"微软系统字体，商用需购买授权。",alt:["思源黑体"]},
{n:"幼圆",a:["YouYuan"],s:"paid",d:"系统字体，商用需购买授权。",alt:["源泉圆体","寒蝉全圆体"]},
{n:"隶书",a:["SimLi","LiSu"],s:"paid",d:"中易系统字体，商用需购买授权。",alt:["江西拙楷","演示镇魂行楷"]},
{n:"中易宋体",a:["SimSun"],s:"paid",d:"随 Windows 附带的使用许可；商业印刷 / 发布前建议向中易中标购买授权，或改用免费替代。",alt:["思源宋体","方正书宋"]},
{n:"中易黑体",a:["SimHei"],s:"paid",d:"随 Windows 附带的使用许可；商业发布前建议购买授权或改用免费替代。",alt:["思源黑体","阿里巴巴普惠体"]},
{n:"中易楷体",a:["KaiTi","楷体_GB2312"],s:"paid",d:"随 Windows 附带的使用许可；商业发布前建议购买授权或改用免费替代。",alt:["霞鹜文楷","方正楷体"]},
{n:"中易仿宋",a:["FangSong"],s:"paid",d:"随 Windows 附带的使用许可；商业发布前建议购买授权或改用免费替代。",alt:["方正仿宋","cwTeX仿宋体"]},
{n:"新宋体",a:["NSimSun"],s:"paid",d:"随 Windows 附带的使用许可；商业发布前建议购买授权或改用免费替代。",alt:["思源宋体"]},
{n:"宋体",a:["宋体-简"],s:"paid",d:"系统自带宋体的版权归属各字库厂商（中易 / 华文 / Apple 等）；商业发布建议先确认授权，或改用免费替代。",alt:["思源宋体","方正书宋"]},
{n:"黑体",a:["黑体-简"],s:"paid",d:"系统自带黑体的版权归属各字库厂商；商业发布建议先确认授权，或改用免费替代。",alt:["思源黑体","阿里巴巴普惠体"]},
{n:"楷体",a:["楷体-简"],s:"paid",d:"系统自带楷体的版权归属各字库厂商；商业发布建议先确认授权，或改用免费替代。",alt:["霞鹜文楷","方正楷体"]},
{n:"仿宋",a:["仿宋-简"],s:"paid",d:"系统自带仿宋的版权归属各字库厂商；商业发布建议先确认授权，或改用免费替代。",alt:["方正仿宋"]},
{n:"圆体-简",a:["Yuanti SC"],s:"paid",d:"Apple 系统字体，商用需购买授权。",alt:["源泉圆体"]},
{n:"魏碑-简",a:["Weibei SC"],s:"paid",d:"Apple 系统字体，商用需购买授权。",alt:["江西拙楷"]},
{n:"行楷-简",a:["Xingkai SC"],s:"paid",d:"Apple 系统字体，商用需购买授权。",alt:["三极行楷","演示夏行楷"]},
/* ============ 高风险（诉讼高发） ============ */
{n:"微软雅黑",a:["Microsoft YaHei","msyh","微软雅黑 Light","Microsoft YaHei UI"],s:"risk",d:"字体版权归方正字库所有，微软仅获系统内使用许可；未经方正授权用于商业用途属侵权，是字体维权诉讼最高发的字体之一。",alt:["思源黑体","阿里巴巴普惠体","OPPO Sans"]},
{n:"方正（通用）",a:["方正","方正字库"],s:"risk",d:"方正字库维权诉讼量常年居首；除官方公益免费的黑体 / 书宋 / 仿宋 / 楷体 / 甲骨文（简体）外，商用前务必购买授权。",alt:["思源黑体","思源宋体","阿里巴巴普惠体"]},
{n:"汉仪（通用）",a:["汉仪","汉仪字库"],s:"risk",d:"汉仪字库维权活跃，商用前务必购买授权。",alt:["思源黑体","阿里巴巴普惠体"]},
{n:"华康（通用）",a:["华康","华康字库"],s:"risk",d:"华康字库有大规模维权记录，商用前务必购买授权。",alt:["思源黑体"]},
{n:"造字工房（通用）",a:["造字工房","造字工坊"],s:"risk",d:"造字工房维权案例较多，商用前务必购买授权。",alt:["思源黑体","思源宋体"]},
{n:"叶根友（通用）",a:["叶根友","叶根友字库"],s:"risk",d:"叶根友字体曾大规模发送律师函维权；官网「免费下载」不等于免费商用，商用前务必购买授权。",alt:["沐瑶软笔手写体","马善政毛笔体"]},
{n:"经典（通用）",a:["经典","经典字库"],s:"risk",d:"经典字库维权案例较多，商用前务必购买授权。",alt:["思源黑体"]},
];

/* ---------------- 基础工具 ---------------- */
function $(id){return document.getElementById(id);}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function norm(s){return String(s==null?'':s).toLowerCase().replace(/[\s\-_()（）]/g,'');}

var STATUS_META = {
free:{label:'免费商用', cls:'free'},
paid:{label:'需付费授权', cls:'paid'},
risk:{label:'高风险', cls:'risk'},
unknown:{label:'未收录', cls:'unknown'}
};

/* 名称 -> 条目索引（含别名） */
var NAME_INDEX = {};
FONT_DB.forEach(function (e, i) {
var keys = [e.n].concat(e.a || []);
keys.forEach(function (k) {
var nk = norm(k);
if (nk &&!(nk in NAME_INDEX)) NAME_INDEX[nk] = i;
});
});

/* 查询单个字体名，返回 {entry, input}；未命中则 entry=null */
function lookupFont(raw) {
var input = String(raw == null? '': raw).trim();
if (!input) return null;
var ni = norm(input);
if (NAME_INDEX[ni]!== undefined) return {entry: FONT_DB[NAME_INDEX[ni]], input: input};
/* 子串兜底：优先匹配更具体的条目 */
var best = -1, bestLen = 0;
FONT_DB.forEach(function (e, i) {
var keys = [e.n].concat(e.a || []);
for (var k = 0; k < keys.length; k++) {
var nk = norm(keys[k]);
if (!nk || nk.length < 2) continue;
if (ni.indexOf(nk) >= 0 || nk.indexOf(ni) >= 0) {
if (nk.length > bestLen) { best = i; bestLen = nk.length;}
break;
}
}
});
return {entry: best >= 0? FONT_DB[best]: null, input: input};
}

/* ---------------- canvas 本地字体探测 ---------------- */
var DETECT_BASELINES = ['monospace', 'serif', 'sans-serif'];
var DETECT_STRINGS = ['mmmmmmmmmmlli', '的一是不了我有大在人中', '0123456789'];

function fontInstalled(family) {
var canvas = fontInstalled._cv || (fontInstalled._cv = document.createElement('canvas'));
var ctx = canvas.getContext('2d');
var q = '"' + family.replace(/"/g, '') + '"';
for (var s = 0; s < DETECT_STRINGS.length; s++) {
var str = DETECT_STRINGS[s];
var matchedAll = true;
for (var b = 0; b < DETECT_BASELINES.length; b++) {
var base = DETECT_BASELINES[b];
ctx.font = '72px ' + base;
var wBase = ctx.measureText(str).width;
ctx.font = '72px ' + q + ', ' + base;
var wTest = ctx.measureText(str).width;
if (wTest === wBase) { matchedAll = false; break;}
}
if (matchedAll) return true;
}
return false;
}

/* 对版权库全部候选名做探测，返回已安装的条目索引（去重） */
function detectInstalled(onProgress) {
var seen = {}, result = [];
var cands = [];
FONT_DB.forEach(function (e, i) {
var keys = [e.n].concat(e.a || []);
keys.forEach(function (k) {
var nk = norm(k);
if (nk &&!seen[nk]) { seen[nk] = true; cands.push({key: k, idx: i});}
});
});
var hitIdx = {};
return new Promise(function (resolve) {
var p = 0, total = cands.length;
function step() {
var end = Math.min(p + 25, total);
for (; p < end; p++) {
try {
if (fontInstalled(cands[p].key)) hitIdx[cands[p].idx] = true;
} catch (e) { /* 忽略单次探测异常 */}
}
if (onProgress) onProgress(p, total);
if (p < total) { setTimeout(step, 0);} else { resolve(Object.keys(hitIdx).map(Number));}
}
step();
});
}

/* ---------------- 渲染 ---------------- */
function badgeHTML(status) {
var m = STATUS_META[status] || STATUS_META.unknown;
return '<span class="flc-badge ' + m.cls + '">' + m.label + '</span>';
}

function entryHTML(e, showInput) {
var m = STATUS_META[e.s] || STATUS_META.unknown;
var alt = (e.alt && e.alt.length)
? '<div class="flc-alt"><i class="material-icons">recommend</i><span>免费商用替代推荐：' + e.alt.map(esc).join('、') + '</span></div>'
: '';
return '<div class="flc-item st-' + m.cls + '">' +
'<div class="flc-item-head"><span class="flc-name">' + esc(showInput || e.n) + '</span>' + badgeHTML(e.s) + '</div>' +
'<div class="flc-desc">' + esc(e.d) + '</div>' + alt + '</div>';
}

function unknownHTML(input) {
return '<div class="flc-item st-unknown">' +
'<div class="flc-item-head"><span class="flc-name">' + esc(input) + '</span>' + badgeHTML('unknown') + '</div>' +
'<div class="flc-desc">版权库暂未收录该字体。请以该字体权利方的官方授权政策为准，商用前务必确认授权。</div></div>';
}

function groupSummaryHTML(title, items) {
if (!items.length) return '';
var counts = {free: 0, paid: 0, risk: 0, unknown: 0};
items.forEach(function (it) { counts[it.status] = (counts[it.status] || 0) + 1;});
var chips = ['free', 'paid', 'risk', 'unknown'].filter(function (k) { return counts[k] > 0;})
.map(function (k) { return '<span class="flc-chip ' + k + '">' + STATUS_META[k].label + ' ' + counts[k] + '</span>';}).join('');
return '<div class="flc-group"><div class="flc-group-head"><b>' + esc(title) + '</b><span class="flc-chips">' + chips + '</span></div>' +
items.map(function (it) { return it.entry? entryHTML(it.entry, it.input): unknownHTML(it.input);}).join('') + '</div>';
}

/* ---------------- 复制报告 ---------------- */
var LAST_REPORT = {detected: [], manual: [], at: null};

function buildReportText() {
var lines = [];
lines.push('字体版权查询检测报告');
lines.push('生成时间：' + (LAST_REPORT.at || new Date().toLocaleString('zh-CN')));
lines.push('');
if (LAST_REPORT.detected.length) {
lines.push('一、一键检测（本机已安装且在版权库中的字体，共 ' + LAST_REPORT.detected.length + ' 款）：');
['free', 'paid', 'risk'].forEach(function (st) {
var arr = LAST_REPORT.detected.filter(function (it) { return it.entry.s === st;});
if (arr.length) lines.push(' ' + STATUS_META[st].label + '（' + arr.length + '）：' + arr.map(function (it) { return it.entry.n;}).join('、'));
});
lines.push('');
}
if (LAST_REPORT.manual.length) {
lines.push('二、手动输入查询（共 ' + LAST_REPORT.manual.length + ' 条）：');
LAST_REPORT.manual.forEach(function (it) {
var label = it.entry? STATUS_META[it.entry.s].label: '未收录';
lines.push(' ' + it.input + ' → ' + label + (it.entry && it.entry.s!== 'free'? '（' + it.entry.d + '）': ''));
});
lines.push('');
}
if (!LAST_REPORT.detected.length &&!LAST_REPORT.manual.length) lines.push('（暂无检测结果）\n');
lines.push('声明：版权信息整理自公开资料，仅供参考，具体以各权利方官方授权政策为准；如有商用需求请咨询专业人士。');
lines.push('隐私：本工具为纯前端本地检测，字体列表不出浏览器，未上传任何服务器。');
return lines.join('\n');
}

function copyText(t, okMsg) {
function done(ok) {
var el = $('flc-copy-tip');
if (el) { el.textContent = ok? (okMsg || '已复制到剪贴板'): '复制失败，请手动选择文本复制'; el.style.display = 'block';}
}
if (navigator.clipboard && navigator.clipboard.writeText) {
navigator.clipboard.writeText(t).then(function () { done(true);}, function () { done(false);});
} else {
var ta = document.createElement('textarea');
ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
document.body.appendChild(ta); ta.select();
try { done(document.execCommand('copy'));} catch (e) { done(false);}
document.body.removeChild(ta);
}
}

/* ---------------- 版权库浏览（搜索+筛选） ---------------- */
var libFilter = 'all', libQuery = '';

function renderLibrary() {
var q = norm(libQuery);
var list = FONT_DB.filter(function (e) {
if (libFilter!== 'all' && e.s!== libFilter) return false;
if (!q) return true;
var keys = [e.n].concat(e.a || [], e.d || '');
return keys.some(function (k) { return norm(k).indexOf(q) >= 0;});
});
$('flc-lib-count').textContent = list.length;
$('flc-lib-list').innerHTML = list.length
? list.map(function (e) { return entryHTML(e);}).join('')
: '<div class="flc-empty">没有匹配的字体，换个关键词试试。</div>';
}

/* ---------------- 初始化 ---------------- */
document.addEventListener('DOMContentLoaded', function () {
renderLibrary();

/* 筛选 chips */
var chips = document.querySelectorAll('#flc-lib-filters .flc-fchip');
chips.forEach(function (ch) {
ch.addEventListener('click', function () {
chips.forEach(function (c) { c.classList.remove('on');});
ch.classList.add('on');
libFilter = ch.getAttribute('data-f');
renderLibrary();
});
});
var searchTimer = null;
$('flc-lib-search').addEventListener('input', function () {
clearTimeout(searchTimer);
var v = this.value;
searchTimer = setTimeout(function () { libQuery = v; renderLibrary();}, 180);
});

/* 一键检测 */
$('flc-detect').addEventListener('click', function () {
var btn = this;
btn.disabled = true;
$('flc-detect-bar').style.display = 'block';
$('flc-detect-pct').style.display = 'block';
$('flc-detect-result').innerHTML = '';
detectInstalled(function (done, total) {
var pct = Math.round(done / total * 100);
$('flc-detect-fill').style.width = pct + '%';
$('flc-detect-pct').textContent = pct + '%（' + done + '/' + total + '）';
}).then(function (idxs) {
btn.disabled = false;
$('flc-detect-bar').style.display = 'none';
$('flc-detect-pct').style.display = 'none';
var items = idxs.map(function (i) { return {entry: FONT_DB[i], input: FONT_DB[i].n, status: FONT_DB[i].s};});
items.sort(function (a, b) {
var order = {risk: 0, paid: 1, free: 2};
return (order[a.status] - order[b.status]) || (a.entry.n < b.entry.n? -1: 1);
});
LAST_REPORT.detected = items;
LAST_REPORT.at = new Date().toLocaleString('zh-CN');
$('flc-detect-result').innerHTML = items.length
? groupSummaryHTML('检测到本机已安装以下版权库字体（共 ' + items.length + ' 款）', items) +
'<div class="flc-hint">未出现在上面的已安装字体为版权库未收录，可在下方「手动输入查询」逐一核对。</div>'
: '<div class="flc-empty">未在版权库中匹配到本机已安装字体（可能是浏览器限制了字体枚举或字体名不在库中），可用下方手动输入查询。</div>';
$('flc-copy').disabled =!(LAST_REPORT.detected.length || LAST_REPORT.manual.length);
});
});

/* 手动输入查询 */
$('flc-query').addEventListener('click', function () {
var raw = $('flc-input').value.split('\n');
var seen = {}, items = [], empty = 0;
raw.forEach(function (line) {
var t = String(line).trim();
if (!t) { empty++; return;}
var k = norm(t);
if (seen[k]) return;
seen[k] = true;
var r = lookupFont(t);
if (r) items.push({entry: r.entry, input: r.input, status: r.entry? r.entry.s: 'unknown'});
});
if (!items.length) {
$('flc-manual-result').innerHTML = '<div class="flc-empty">请先在输入框填写字体名称（每行一个），空行会被忽略。</div>';
return;
}
LAST_REPORT.manual = items;
LAST_REPORT.at = new Date().toLocaleString('zh-CN');
var order = {risk: 0, paid: 1, unknown: 2, free: 3};
items.sort(function (a, b) { return (order[a.status] - order[b.status]);});
$('flc-manual-result').innerHTML = groupSummaryHTML('查询结果（共 ' + items.length + ' 条）', items);
$('flc-copy').disabled =!(LAST_REPORT.detected.length || LAST_REPORT.manual.length);
});

/* 示例填充 */
$('flc-sample').addEventListener('click', function () {
$('flc-input').value = '微软雅黑\n方正兰亭黑\n汉仪旗黑\n思源黑体\n阿里巴巴普惠体\n站酷快乐体\nOPPO Sans\n宋体\n黑体\n楷体';
});
$('flc-clear').addEventListener('click', function () {
$('flc-input').value = '';
$('flc-manual-result').innerHTML = '';
LAST_REPORT.manual = [];
$('flc-copy').disabled =!(LAST_REPORT.detected.length || LAST_REPORT.manual.length);
});

/* 复制报告 */
$('flc-copy').addEventListener('click', function () {
copyText(buildReportText());
});
});

})();
