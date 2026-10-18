/* 照片转十字绣图案生成器 - 纯前端 DMC 量化 + 符号图纸引擎
 *
 * 流程：上传图片 → box 平均下采样到针数网格（宽×高）→ DMC 色卡最近邻量化
 * → 取用最多的 N 色、尾部色彩合并到最近保留色 → 分配符号 → 符号/色块网格预览
 * → 线材清单（每色针数/线长/绞数）→ 导出 PNG 高清符号图 / 浏览器打印 PDF。
 *
 * 图片只在浏览器本地处理：无后端调用、无第三方依赖、无 CDN。
 * 纯函数（hex 解析 / 最近邻 / 布边长换算 / 线量估算 / 色数合并）可在 node 下单元测试。
 *
 * DMC 色卡：基于 MIT 许可的 cross-stitch（neilcochran/cross-stitch，npm 包）
 * 内置 dmcFloss 数据集（有公开 hex 的色号直接采用）；部分色号原数据无 hex，
 * 补用了广泛流传的近似参考值（标注 FB）。屏幕色仅为参考近似值，购线以 DMC 色号为准。
 */
(function () {
'use strict';

/* ---------- DMC 六股绣线色卡：[色号, 色名, hex] ---------- */
var DMC = [
["B5200","Snow White","#ffffff"],
["Blanc","White","#ffffff"],
["White","White","#fefefe"],
["Ecru","Ecru/off-white","#f3ebdb"], // FB
["150","Red - Bright","#ab0249"],
["151","Pink","#f0ced4"],
["152","Tawny - Dark","#e2a099"],
["153","Lilac","#e6ccd9"],
["154","Red - Very Dark","#572433"],
["155","Forget-me-not Blue","#9891b6"],
["156","Blue - Medium","#a3aed1"],
["157","Blue - Light","#bbc3d9"],
["158","Blue - Dark","#4c526e"],
["159","Petrol Blue - Light","#c7cad7"],
["160","Petrol Blue - Medium","#999fb7"],
["161","Petrol Blue - Dark","#7880a4"],
["162","Baby Blue - Light","#dbecf5"],
["163","Green","#4d8361"],
["164","Green - Light","#c8d8b8"],
["165","Green - Bright","#eff4a4"],
["166","Lime Green","#c0c840"],
["167","Khaki Brown","#a77c49"],
["168","Silver Gray","#b3b4b6"], // FB
["169","Pewter Gray","#6f7072"], // FB
["208","Lavender - Very Dark","#835b8b"],
["209","Lavender - Dark","#a37ba7"],
["210","Lavender - Medium","#c39fc3"],
["211","Lavender - Light","#e3cbe3"],
["221","Shell Pink - Very Dark","#883e43"],
["223","Shell Pink - Light","#cc847c"],
["224","Shell Pink - Very Light","#ebb7af"],
["225","Shell Pink - Ultra Very Light","#ffdfd5"],
["300","Mahogany - Very Dark","#6f2f00"],
["301","Mahogany - Medium","#b35f2b"],
["304","Red - Medium","#b71f33"],
["307","Lemon","#fded54"],
["309","Rose - Dark","#d62b5b"],
["310","Black","#000000"], // FB
["311","Blue - Medium","#1c5066"],
["312","Baby Blue - Very Dark","#35668b"],
["315","Antique Mauve - Medium Dark","#814952"],
["316","Antique Mauve - Medium","#b7737f"],
["317","Pewter Gray","#8e9093"], // FB
["318","Steel Gray - Light","#b9bcbe"], // FB
["319","Pistachio Green - Very Dark","#205f2e"],
["320","Pistachio Green - Medium","#69885a"],
["321","Red","#c72b3b"],
["322","Baby Blue","#5a8fb8"],
["326","Rose - Very Dark","#b33b4b"],
["327","Violet","#633666"],
["333","Blue Violet - Very Dark","#5c5478"],
["334","Baby Blue - Medium","#739fc1"],
["335","Rose","#ee546e"],
["336","Blue","#253b73"],
["340","Blue Violet - Medium","#ada7c7"],
["341","Blue Violet - Light","#b7bfdd"],
["347","Salmon - Very Dark","#bf2d2d"],
["349","Coral - Dark","#d21035"],
["350","Coral - Medium","#e04848"],
["351","Coral","#e96a67"],
["352","Coral - Light","#fd9c97"],
["353","Peach","#fed7cc"],
["355","Terra Cotta - Dark","#984436"],
["356","Terra Cotta - Medium","#c56a5b"],
["367","Pistachio Green - Dark","#617a52"],
["368","Pistachio Green - Light","#a6c298"],
["369","Pistachio Green - Very Light","#d7edcc"],
["370","Mustard - Medium","#b89d64"],
["371","Mustard","#bfa671"],
["372","Mustard - Light","#ccb784"],
["400","Mahogany - Dark","#8f430f"],
["402","Mahogany - Very Light","#f7a777"],
["407","Desert Sand - Dark","#a98a68"], // FB
["413","Pewter Gray - Dark","#58595b"], // FB
["414","Steel Gray - Dark","#6e7276"], // FB
["415","Pearl Gray","#bfc0c2"], // FB
["420","Hazelnut Brown - Dark","#a07042"],
["422","Hazelnut Brown - Light","#c69f7b"],
["433","Brown - Medium","#8c5b3c"], // FB
["434","Brown - Light","#a9775a"], // FB
["435","Brown - Very Light","#c29e81"], // FB
["436","Tan","#d2a678"], // FB
["437","Tan - Light","#e9d3b3"], // FB
["444","Lemon - Dark","#ffd600"],
["445","Lemon - Light","#fffb8b"],
["451","Shell Gray - Dark","#8c8b87"], // FB
["452","Shell Gray - Medium","#b5b3ac"], // FB
["453","Shell Gray - Light","#d8d6cf"], // FB
["469","Avocado Green","#72843c"],
["470","Avocado Green - Light","#94ab4f"],
["471","Avocado Green - Very Light","#aebf79"],
["472","Avocado Green - Ultra Light","#d8e498"],
["498","Red - Dark","#a7132b"],
["500","Blue Green - Very Dark","#044d33"],
["501","Blue Green - Dark","#396f52"],
["502","Blue Green","#5b9071"],
["503","Blue Green - Medium","#7bac94"],
["505","Grass Green - Dark","#338362"],
["517","Wedgewood - Dark","#3b768f"],
["518","Wedgewood - Light","#4f93a7"],
["519","Sky Blue","#7eb1c8"],
["520","Fern Green - Dark","#666d4f"],
["522","Fern Green","#969e7e"],
["523","Fern Green - Light","#abb197"],
["524","Fern Green - Very Light","#c4cdac"],
["535","Ash Gray - Very Light","#e8e7e2"], // FB
["543","Beige Brown - Ultra Very Light","#ede4d3"], // FB
["550","Violet - Very Dark","#5c184e"],
["552","Violet - Medium","#803a6b"],
["553","Violet","#a3638b"],
["554","Violet - Light","#dbb3cb"],
["561","Jade - Very Dark","#2c6a45"],
["562","Jade - Medium","#53976a"],
["563","Jade - Light","#8fc098"],
["564","Jade - Very Light","#a7cdaf"],
["580","Moss Green - Dark","#888d33"],
["581","Moss Green","#a7ae38"],
["597","Turquoise","#5ba3b3"],
["598","Turquoise - Light","#90c3cc"],
["600","Cranberry - Very Dark","#cd2f63"],
["601","Cranberry - Dark","#d1286a"],
["602","Cranberry - Medium","#e24874"],
["603","Cranberry - Light Medium","#ffa4be"],
["604","Cranberry - Light","#ffb0be"],
["605","Cranberry - Very Light","#ffc0cd"],
["606","Orange-red - Bright","#fa3203"],
["608","Orange - Bright","#fd5d35"],
["610","Drab Brown - Dark","#796047"],
["611","Drab Brown","#967656"],
["612","Drab Brown - Light","#bc9a78"],
["613","Drab Brown - Very Light","#dcc4aa"],
["632","Desert Sand - Ultra Very Dark","#97795b"], // FB
["640","Beige Gray - Very Dark","#7b7468"], // FB
["642","Beige Gray - Dark","#99917f"], // FB
["644","Beige Gray - Medium","#bdb6a4"], // FB
["645","Beaver Gray - Very Dark","#5b574e"], // FB
["646","Beaver Gray - Dark","#807c70"], // FB
["647","Beaver Gray - Medium","#aba698"], // FB
["648","Beaver Gray - Light","#cbc8ba"], // FB
["666","Red - Bright","#e31d42"],
["676","Old Gold - Light","#e5ce97"],
["677","Old Gold - Very Light","#f5eccb"],
["680","Old Gold - Dark","#bc8d0e"],
["699","Green","#056517"],
["700","Green - Bright","#07731b"],
["701","Green - Light","#3f8f29"],
["702","Kelly Green","#47a72f"],
["703","Chartreuse","#7bb547"],
["704","Chartreuse - Bright","#9ecf34"],
["712","Cream","#fffce8"], // FB
["718","Plum","#9c2462"],
["720","Orange Spice - Dark","#e55c1f"],
["721","Orange Spice - Medium","#f27842"],
["722","Orange Spice - Light","#f7976f"],
["725","Topaz","#ffc840"],
["726","Topaz - Light","#fdd755"],
["727","Topaz - Very Light","#fff1af"],
["728","Golden Yellow","#e4b468"],
["729","Old Gold - Medium","#d0a53e"],
["730","Olive Green - Very Dark","#827b30"],
["732","Olive Green","#948c36"],
["733","Olive Green - Medium","#bcb34c"],
["734","Olive Green - Light","#c7c077"],
["738","Tan - Very Light","#e3c9ac"], // FB
["739","Tan - Ultra Very Light","#f2e3d0"], // FB
["740","Tangerine","#ff8b00"],
["741","Tangerine - Medium","#ffa32b"],
["742","Tangerine - Light","#ffbf57"],
["743","Yellow - Medium","#fed376"],
["744","Yellow - Pale","#ffe793"],
["745","Yellow - Light Pale","#ffe9ad"],
["746","Off White","#fcfcee"],
["747","Sky Blue - Very Light","#e5fcfd"],
["754","Peach - Light","#f7cbbf"],
["758","Terra Cotta - Very Light","#eeaa9b"],
["760","Salmon","#f5adad"],
["761","Salmon - Light","#ffc9c9"],
["762","Pearl Gray - Very Light","#e9e9e7"], // FB
["772","Yellow Green - Very Light","#e4ecd4"],
["775","Baby Blue - Very Light","#d9ebf1"],
["777","Red - Deep","#913546"],
["778","Antique Mauve - Very Light","#dfb3bb"],
["779","Brown","#7c5636"], // FB
["780","Topaz - Ultra Very Dark","#94631a"],
["782","Topaz - Dark","#ae7720"],
["783","Topaz - Medium","#ce9124"],
["791","Cornflower Blue - Very Dark","#464563"],
["792","Cornflower Blue - Dark","#555b7b"],
["793","Cornflower Blue - Medium","#707da2"],
["794","Cornflower Blue - Light","#8f9cc1"],
["796","Royal Blue - Dark","#11416d"],
["797","Royal Blue","#13477d"],
["798","Delft Blue - Dark","#466a8e"],
["799","Delft Blue - Medium","#748eb6"],
["800","Delft Blue - Pale","#c0ccde"],
["801","Coffee Brown - Dark","#5b3a24"], // FB
["803","Blue - Deep","#2c597c"],
["807","Peacock Blue","#64abba"],
["809","Delft Blue","#94a8c6"],
["813","Blue - Light","#a1c2d7"],
["814","Garnet - Dark","#7b001b"],
["815","Garnet - Medium","#87071f"],
["816","Garnet","#970b23"],
["817","Coral Red - Very Dark","#bb051f"],
["818","Baby Pink","#ffdfd9"],
["819","Baby Pink - Light","#ffeeeb"],
["820","Royal Blue - Very Dark","#0e365c"],
["822","Beige Gray - Light","#dbd8d0"], // FB
["823","Blue - Dark","#213063"],
["824","Blue - Very Dark","#396987"],
["825","Blue - Dark","#4781a5"],
["826","Blue - Medium","#6b9ebf"],
["827","Blue - Very Light","#bddded"],
["828","Blue - Ultra Very Light","#c5e8ed"],
["829","Golden Olive - Very Dark","#7e6b42"],
["830","Golden Olive - Dark","#8d784b"],
["831","Golden Olive - Medium","#aa8f56"],
["832","Golden Olive","#bd9b51"],
["833","Golden Olive - Light","#c8ab6c"],
["834","Golden Olive - Very Light","#dbbe7f"],
["838","Beige Brown - Very Dark","#6b5138"], // FB
["839","Beige Brown - Dark","#86694a"], // FB
["840","Beige Brown - Medium","#a08762"], // FB
["841","Beige Brown - Light","#bfa87f"], // FB
["842","Beige Brown - Very Light","#d9cbaf"], // FB
["844","Beaver Gray - Ultra Dark","#4c4a44"], // FB
["869","Hazelnut Brown - Very Dark","#835e39"],
["890","Pistachio Green - Ultra Dark","#174923"],
["891","Carnation - Dark","#ff5773"],
["892","Carnation - Medium","#ff798c"],
["893","Carnation - Light","#fc90a2"],
["894","Carnation - Very Light","#ffb2bb"],
["895","Hunter Green - Very Dark","#1b5300"],
["898","Coffee Brown - Very Dark","#4e3320"], // FB
["899","Rose - Medium","#f27688"],
["900","Burnt Orange - Dark","#d15807"],
["902","Garnet - Very Dark","#822637"],
["904","Parrot Green - Very Dark","#557822"],
["905","Parrot Green - Dark","#628a28"],
["906","Parrot Green - Medium","#7fb335"],
["907","Parrot Green - Light","#c7e666"],
["909","Emerald Green - Very Dark","#156f49"],
["910","Emerald Green - Dark","#187e56"],
["911","Emerald Green - Medium","#189065"],
["912","Emerald Green - Light","#1b9d6b"],
["913","Nile Green - Medium","#6dab77"],
["915","Plum - Dark","#820043"],
["917","Plum - Medium","#9b1359"],
["918","Red Copper - Dark","#82340a"],
["919","Red Copper","#a64510"],
["920","Copper - Medium","#ac5414"],
["921","Copper","#c66218"],
["922","Copper - Light","#e27323"],
["924","Gray Green - Very Dark","#566a6a"],
["926","Gray Green - Medium","#98aeae"],
["927","Gray Green - Light","#bdcbcb"],
["928","Gray Green - Very Light","#dde3e3"],
["930","Antique Blue - Dark","#455c71"],
["931","Antique Blue - Medium","#6a859e"],
["932","Antique Blue - Light","#a2b5c6"],
["934","Avocado Green - BLACK","#313919"],
["935","Avocado Green - Dark","#424d21"],
["936","Avocado Green - Very Dark","#4c5826"],
["937","Avocado Green - Medium","#627133"],
["938","Coffee Brown - Ultra Dark","#3e2a1b"], // FB
["939","Blue - Very Dark","#1b2853"],
["943","Aquamarine - Medium","#3d9384"],
["945","Tawny","#fbd5bb"],
["946","Burnt Orange - Medium","#eb6307"],
["947","Burnt Orange","#ff7b4d"],
["948","Peach - Very Light","#fee7da"],
["950","Desert Sand - Light","#efd2ac"], // FB
["951","Tawny - Light","#ffe2cf"],
["954","Nile Green","#88ba91"],
["955","Nile Green - Light","#a2d6ad"],
["956","Geranium","#ff9191"],
["957","Geranium - Pale","#fdb5b5"],
["958","Seagreen - Dark","#3eb6a1"],
["959","Seagreen - Medium","#59c7b4"],
["961","Dusty Rose - Dark","#cf7373"],
["962","Dusty Rose - Medium","#e68a8a"],
["963","Dusty Rose - Ultra Very Light","#ffd7d7"],
["964","Seagreen - Light","#a9e2d8"],
["966","Baby Green - Medium","#b9d7c0"],
["967","Peach - Light","#ffded5"],
["970","Pumpkin - Light","#f78b13"],
["972","Canary - Deep","#ffb515"],
["973","Canary - Bright","#ffe300"],
["975","Golden Brown - Dark","#914f12"],
["976","Golden Brown - Medium","#c28142"],
["977","Golden Brown - Light","#dc9c56"],
["986","Forest Green - Very Dark","#405230"],
["987","Forest Green - Dark","#587141"],
["988","Forest Green - Medium","#738b5b"],
["989","Forest Green","#8da675"],
["991","Aquamarine - Dark","#477b6e"],
["992","Aquamarine - Light","#6fae9f"],
["993","Aquamarine - Very Light","#90c0b4"],
["995","Electric Blue - Dark","#2696b6"],
["996","Electric Blue - Medium","#30c2ec"],
["3011","Khaki Green - Dark","#898a58"],
["3012","Khaki Green - Medium","#a6a75d"],
["3013","Khaki Green - Light","#b9b982"],
["3021","Brown Gray - Very Dark","#5f5c55"], // FB
["3022","Brown Gray - Medium","#8d887b"], // FB
["3023","Brown Gray - Light","#b5af9f"], // FB
["3024","Brown Gray - Very Light","#d9d5c6"], // FB
["3031","Mocha Brown - Very Dark","#5c4a38"], // FB
["3032","Mocha Brown - Medium","#94826a"], // FB
["3033","Mocha Brown - Very Light","#d5c8b4"], // FB
["3041","Antique Violet - Medium","#956f7c"],
["3042","Antique Violet - Light","#b79da7"],
["3045","Yellow Beige - Dark","#bc966a"],
["3046","Yellow Beige - Medium","#d8bc9a"],
["3047","Yellow Beige - Light","#e7d6c1"],
["3051","Green Gray - Dark","#5f6648"],
["3052","Green Gray - Medium","#889268"],
["3053","Green Gray","#9ca482"],
["3064","Desert Sand","#cca983"], // FB
["3072","Beaver Gray - Very Light","#e5e3dc"], // FB
["3078","Golden Yellow - Very Light","#fdf9cd"],
["3325","Baby Blue - Light","#b8d2e6"],
["3326","Rose - Light","#fbadb4"],
["3328","Salmon - Dark","#e36d6d"],
["3340","Apricot - Medium","#ff836f"],
["3341","Apricot","#fcab98"],
["3345","Hunter Green - Dark","#1b5915"],
["3346","Hunter Green","#406a3a"],
["3347","Yellow Green - Medium","#71935c"],
["3348","Yellow Green - Light","#ccd9b1"],
["3350","Dusty Rose - Ultra Dark","#bc4365"],
["3354","Dusty Rose - Light","#e4a6ac"],
["3362","Pine Green - Dark","#5e6b47"],
["3363","Pine Green - Medium","#728256"],
["3364","Pine Green","#83975f"],
["3371","Black Brown","#2b2119"], // FB
["3607","Plum - Light","#c54989"],
["3608","Plum - Very Light","#ea9cc4"],
["3609","Plum - Ultra Light","#f4aed5"],
["3685","Mauve - Very Dark","#881531"],
["3687","Mauve","#c96b70"],
["3688","Mauve - Medium","#e7a9ac"],
["3689","Mauve - Light","#fbbfc2"],
["3705","Melon - Dark","#ff7992"],
["3706","Melon - Medium","#ffadbc"],
["3708","Melon - Light","#ffcbd5"],
["3712","Salmon - Medium","#f18787"],
["3713","Salmon - Very Light","#fed8d5"], // FB
["3716","Dusty Rose - Very Light","#ffbdbd"],
["3721","Shell Pink - Dark","#a14b51"],
["3722","Shell Pink - Medium","#bc6c64"],
["3726","Antique Mauve - Dark","#9b5b66"],
["3727","Antique Mauve - Light","#dba9b2"],
["3731","Dusty Rose - Very Dark","#da6783"],
["3733","Dusty Rose","#e8879b"],
["3740","Antique Violet - Dark","#785762"],
["3743","Antique Violet - Very Light","#d7cbd3"],
["3746","Blue Violet - Dark","#776b98"],
["3747","Blue Violet - Very Light","#d3d7ed"],
["3750","Antique Blue - Very Dark","#384c5e"],
["3752","Antique Blue - Very Light","#c7d1db"],
["3753","Antique Blue - Ultra Very Light","#dbe2e9"],
["3755","Baby Blue","#93b4ce"],
["3756","Baby Blue - Light","#eefcfc"],
["3760","Wedgewood - Medium","#3e85a2"],
["3761","Sky Blue - Light","#acd8e2"],
["3765","Peacock Blue - Very Dark","#347f8c"],
["3766","Peacock Blue - Light","#99cfd9"],
["3768","Gray Green - Dark","#657f7f"],
["3770","Tawny - Very Light","#ffeee3"],
["3771","Peach - Dark","#f4bba9"],
["3772","Desert Sand - Very Dark","#a67f56"], // FB
["3774","Desert Sand - Very Light","#f4e2c4"], // FB
["3776","Mahogany - Light","#cf7939"],
["3777","Terra Cotta - Very Dark","#863022"],
["3778","Terra Cotta - Light","#d98978"],
["3779","Terra Cotta - Ultra Very Light","#f8cac8"],
["3781","Mocha Brown - Dark","#77593d"], // FB
["3782","Mocha Brown - Light","#c9a87e"], // FB
["3787","Brown Gray - Dark","#76705f"], // FB
["3790","Beige Gray - Ultra Dark","#6e6a61"], // FB
["3799","Pewter Gray - Very Dark","#3f4042"], // FB
["3801","Melon - Very Dark","#e74967"],
["3802","Antique Mauve - Very Dark","#714149"],
["3803","Mauve - Dark","#ab3357"],
["3804","Cyclamen Pink - Dark","#e02876"],
["3805","Cyclamen Pink","#f3478b"],
["3806","Cyclamen Pink - Light","#ff8cae"],
["3807","Cornflower Blue","#60678c"],
["3808","Turquoise - Ultra Very Dark","#366970"],
["3809","Turquoise - Very Dark","#3f7c85"],
["3810","Turquoise - Dark","#488e9a"],
["3811","Turquoise - Very Light","#bce3e6"],
["3812","Seagreen - Very Dark","#2f8c84"],
["3813","Blue Green - Light","#b2d4bd"],
["3814","Aquamarine","#508b7d"],
["3815","Celadon Green - Dark","#477759"],
["3816","Celadon Green","#65a57d"],
["3817","Celadon Green - Light","#99c3aa"],
["3818","Emerald Green - Ultra Very Dark","#115a3b"],
["3819","Moss Green - Light","#e0e868"],
["3820","Straw - Dark","#dfb65f"],
["3821","Straw","#f3ce75"],
["3822","Straw - Light","#f6dc98"],
["3823","Yellow - Ultra Pale","#fffde3"],
["3824","Apricot - Light","#fecdc2"],
["3825","Pumpkin - Pale","#fdbd96"],
["3826","Golden Brown","#ad7239"],
["3827","Golden Brown - Pale","#f7bb77"],
["3828","Hazelnut Brown","#b78b61"],
["3829","Old Gold - Very Dark","#a98204"],
["3830","Terra Cotta","#b95544"],
["3831","Raspberry - Dark","#b32f48"],
["3832","Raspberry - Medium","#db556e"],
["3833","Raspberry - Light","#ea8699"],
["3834","Grape - Dark","#72375d"],
["3835","Grape - Medium","#946083"],
["3836","Grape - Light","#ba91aa"],
["3837","Lavender - Ultra Dark","#6c3a6e"],
["3838","Lavender Blue - Dark","#5c7294"],
["3839","Lavender Blue - Medium","#7b8eab"],
["3840","Lavender Blue - Light","#b0c0da"],
["3841","Baby Blue - Pale","#cddfed"],
["3842","Wedgewood - Dark","#32667c"],
["3843","Electric Blue","#14aad0"],
["3844","Bright Turquoise - Dark","#12aeba"],
["3845","Bright Turquoise - Medium","#04c4ca"],
["3846","Bright Turquoise - Light","#06e3e6"],
["3847","Teal Green - Dark","#347d75"],
["3848","Teal Green - Medium","#559392"],
["3849","Teal Green - Light","#52b3a4"],
["3850","Bright Green - Dark","#378477"],
["3851","Bright Green - Light","#49b3a1"],
["3852","Straw - Very Dark","#cd9d37"],
["3853","Autumn Gold - Dark","#f29746"],
["3854","Autumn Gold - Medium","#f2af68"],
["3855","Autumn Gold - Light","#fad396"],
["3856","Mahogany - Ultra Very Light","#ffd3b5"],
["3857","Rosewood - Dark","#7e3e34"], // FB
["3858","Rosewood - Medium","#964a3f"],
["3859","Rosewood - Light","#ba8b7c"],
["3860","Cocoa","#9c7c5e"], // FB
["3861","Cocoa - Light","#b79b7e"], // FB
["3862","Mocha Beige - Dark","#8a6b4e"], // FB
["3863","Mocha Beige - Medium","#a98e6d"], // FB
["3864","Mocha Beige - Light","#c7ae8c"], // FB
["3865","Winter White","#f8f4e8"], // FB
["3866","Mocha Brown - Ultra Very Light","#e9dcc8"] // FB
];

/* ---------- 纯函数：颜色 / 换算 / 估算（node 可测） ---------- */

function hexToRgb(h) {
    return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

// DMC 预处理为 RGB 数组
var DMC_RGB = DMC.map(function (e) { return { code: e[0], name: e[1], rgb: hexToRgb(e[2]) }; });

// 最近邻 DMC 色号：返回 DMC_RGB 下标（RGB 欧氏距离平方）
function nearestDmcIndex(r, g, b) {
    var best = 0, bestD = Infinity, i, d, c;
    for (i = 0; i < DMC_RGB.length; i++) {
        c = DMC_RGB[i].rgb;
        d = (r - c[0]) * (r - c[0]) + (g - c[1]) * (g - c[1]) + (b - c[2]) * (b - c[2]);
        if (d < bestD) { bestD = d; best = i; }
    }
    return best;
}

// 布边长换算：针数 -> 各 CT 的 宽×高（英寸/cm）
// ct: 每英寸针数（如 14CT=14）
function fabricSize(stitchW, stitchH, ct) {
    function conv(n) {
        var inch = n / ct;
        return { inch: Math.round(inch * 10) / 10, cm: Math.round(inch * 2.54 * 10) / 10 };
    }
    return { w: conv(stitchW), h: conv(stitchH) };
}

// 线量估算：2 股全针，每针约耗 2.5cm 线（双股计）；每绞 8 米
// 返回 { meters: 米数, skeins: 需购绞数（向上取整） }
function estimateThread(stitches) {
    var meters = stitches * 0.025;
    return { meters: Math.round(meters * 10) / 10, skeins: Math.ceil(meters / 8) };
}

// 取用最多的 maxColors 色：counts 为 {dmcIdx: 针数}，尾部色彩合并到最近的保留色
// 返回 { kept: [dmcIdx...]（按针数降序）, remap: {旧dmcIdx: 新dmcIdx} }
function limitColors(counts, maxColors) {
    var entries = Object.keys(counts).map(function (k) { return { idx: +k, n: counts[k] }; });
    entries.sort(function (a, b) { return b.n - a.n; });
    if (entries.length <= maxColors) {
        return { kept: entries.map(function (e) { return e.idx; }), remap: {} };
    }
    var kept = entries.slice(0, maxColors);
    var keptIdx = kept.map(function (e) { return e.idx; });
    var remap = {};
    for (var i = maxColors; i < entries.length; i++) {
        var src = DMC_RGB[entries[i].idx].rgb, best = keptIdx[0], bestD = Infinity;
        for (var j = 0; j < keptIdx.length; j++) {
            var c = DMC_RGB[keptIdx[j]].rgb;
            var d = (src[0] - c[0]) * (src[0] - c[0]) + (src[1] - c[1]) * (src[1] - c[1]) + (src[2] - c[2]) * (src[2] - c[2]);
            if (d < bestD) { bestD = d; best = keptIdx[j]; }
        }
        remap[entries[i].idx] = best;
    }
    return { kept: keptIdx, remap: remap };
}

// 符号池（纯文本符号，打印/导出不依赖字体图标）
var SYMBOLS = ('●▲■◆★♥♦♣♠✚✖◍◎◉⬟⬢✦❖✜♀♂☀☁☂☾♩♪♫⚑⚐⚓⚙⚛☘☕✉✌☮☯♻◐◑◒◓◔◕⬔⬕⬗⬘⬙⬚◤◥◣◢◈⬖⬗').split('');
function assignSymbols(kept) {
    var map = {};
    kept.forEach(function (idx, i) { map[idx] = SYMBOLS[i % SYMBOLS.length]; });
    return map;
}

// 网格量化：small 为下采样后的 ImageData（stitchW×stitchH），返回 cells[y][x] = dmcIdx
function quantizeGrid(imgData, w, h) {
    var d = imgData.data, cells = [], x, y, i, idx;
    for (y = 0; y < h; y++) {
        var row = [];
        for (x = 0; x < w; x++) {
            i = (y * w + x) * 4;
            idx = nearestDmcIndex(d[i], d[i + 1], d[i + 2]);
            row.push(idx);
        }
        cells.push(row);
    }
    return cells;
}

// 统计每色针数
function countStitches(cells) {
    var counts = {};
    for (var y = 0; y < cells.length; y++) {
        for (var x = 0; x < cells[y].length; x++) {
            var k = cells[y][x];
            counts[k] = (counts[k] || 0) + 1;
        }
    }
    return counts;
}

// node 下导出纯函数以便单元测试
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { DMC: DMC, DMC_RGB: DMC_RGB, hexToRgb: hexToRgb, nearestDmcIndex: nearestDmcIndex,
        fabricSize: fabricSize, estimateThread: estimateThread, limitColors: limitColors,
        assignSymbols: assignSymbols, SYMBOLS: SYMBOLS, countStitches: countStitches };
}

/* ---------- 浏览器应用 ---------- */
if (typeof document !== 'undefined') (function () {
    var ACCEPT = ['image/jpeg', 'image/png', 'image/webp'];
    var MAX_SRC = 1600; // 源图工作分辨率上限（长边）
    var CT_LIST = [11, 14, 18];

    var $ = function (id) { return document.getElementById(id); };
    function toast(m) {
        var el = document.createElement('div');
        el.textContent = m;
        el.style.cssText = 'position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);background:#111827;color:#fff;padding:.6rem 1.2rem;border-radius:.5rem;z-index:9999;font-size:.9rem;max-width:86vw;text-align:center;';
        document.body.appendChild(el);
        setTimeout(function () { if (el.parentNode) document.body.removeChild(el); }, 2400);
    }
    function setStatus(m) { $('cs-status').textContent = m || ''; }
    function showTip(m, isErr) {
        var t = $('cs-tip');
        t.style.display = 'block';
        t.className = 'cs-tip' + (isErr ? ' cs-tip-err' : '');
        t.textContent = m;
    }
    function hideTip() { $('cs-tip').style.display = 'none'; }

    var sourceCanvas = null, origW = 0, origH = 0, origName = 'cross-stitch';
    var cells = null, stitchW = 120, stitchH = 90, maxColors = 24, lockAspect = true;
    var legend = []; // [{idx, code, name, hex, symbol, stitches, meters, skeins}]
    var viewMode = 'symbol';

    function loadBitmap(file) {
        if (typeof createImageBitmap === 'function') {
            return createImageBitmap(file, { imageOrientation: 'from-image' }).catch(function () { return createImageBitmap(file); });
        }
        return new Promise(function (res, rej) {
            var url = URL.createObjectURL(file), img = new Image();
            img.onload = function () { URL.revokeObjectURL(url); res(img); };
            img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('decode')); };
            img.src = url;
        });
    }

    function handleFile(file) {
        if (!file) return;
        if (ACCEPT.indexOf(file.type) < 0 && !/\.(jpe?g|png|webp)$/i.test(file.name)) { toast('仅支持 JPG / PNG / WebP 图片'); return; }
        setStatus('载入图片中…');
        loadBitmap(file).then(function (bmp) {
            origW = bmp.width || bmp.naturalWidth; origH = bmp.height || bmp.naturalHeight;
            var scale = Math.min(1, MAX_SRC / Math.max(origW, origH));
            var sw = Math.round(origW * scale), sh = Math.round(origH * scale);
            sourceCanvas = document.createElement('canvas');
            sourceCanvas.width = sw; sourceCanvas.height = sh;
            var ctx = sourceCanvas.getContext('2d');
            ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(bmp, 0, 0, sw, sh);
            if (bmp.close) { try { bmp.close(); } catch (e) {} }
            origName = (file.name || 'cross-stitch').replace(/\.[^.]+$/, '');
            stitchW = 120;
            $('cs-w').value = 120; $('cs-w-num').value = 120;
            recomputeH();
            $('cs-srcinfo').style.display = 'block';
            $('cs-srcinfo').textContent = '已载入：' + file.name + '（' + origW + ' × ' + origH + '，' + (file.size / 1024).toFixed(1) + ' KB）';
            $('cs-controls').style.display = 'block';
            setStatus('');
            hideTip();
            regenerate();
        }).catch(function () { setStatus(''); toast('图片读取失败，请换一张试试'); });
    }

    function recomputeH() {
        if (lockAspect && origW && origH) {
            stitchH = Math.max(20, Math.min(400, Math.round(stitchW * origH / origW)));
        } else {
            stitchH = Math.max(20, Math.min(400, parseInt($('cs-h-num').value, 10) || 90));
        }
        $('cs-h').value = stitchH; $('cs-h-num').value = stitchH;
        updateSizeLine();
    }

    function updateSizeLine() {
        var parts = CT_LIST.map(function (ct) {
            var f = fabricSize(stitchW, stitchH, ct);
            return ct + 'CT：' + f.w.inch + '×' + f.h.inch + ' 英寸（' + f.w.cm + '×' + f.h.cm + ' cm）';
        });
        $('cs-size').innerHTML = '🧵 ' + stitchW + ' × ' + stitchH + ' 针（' + (stitchW * stitchH) + ' 针）<br>' + parts.join('<br>');
    }

    // 下采样到针数网格（drawImage 缩小即做区域平均），再逐格 DMC 最近邻量化
    function regenerate() {
        if (!sourceCanvas) return;
        setStatus('生成图纸中…（' + stitchW + '×' + stitchH + ' 针，' + DMC.length + ' 色 DMC 比对）');
        hideTip();
        setTimeout(function () {
            try {
                var small = document.createElement('canvas');
                small.width = stitchW; small.height = stitchH;
                var sctx = small.getContext('2d');
                sctx.imageSmoothingEnabled = true; sctx.imageSmoothingQuality = 'high';
                sctx.drawImage(sourceCanvas, 0, 0, stitchW, stitchH);
                var imgData = sctx.getImageData(0, 0, stitchW, stitchH);
                cells = quantizeGrid(imgData, stitchW, stitchH);
                var counts = countStitches(cells);
                var unique = Object.keys(counts).length;
                var lc = limitColors(counts, maxColors);
                // 尾部色彩并入最近保留色
                if (Object.keys(lc.remap).length) {
                    for (var y = 0; y < stitchH; y++) {
                        for (var x = 0; x < stitchW; x++) {
                            var k = cells[y][x];
                            if (lc.remap[k] !== undefined) cells[y][x] = lc.remap[k];
                        }
                    }
                }
                var counts2 = countStitches(cells);
                var symbols = assignSymbols(lc.kept);
                legend = lc.kept.map(function (idx) {
                    var n = counts2[idx] || 0;
                    var th = estimateThread(n);
                    return { idx: idx, code: DMC_RGB[idx].code, name: DMC_RGB[idx].name,
                        hex: '#' + DMC_RGB[idx].rgb.map(function (v) { return ('0' + v.toString(16)).slice(-2); }).join(''),
                        symbol: symbols[idx], stitches: n, meters: th.meters, skeins: th.skeins };
                });
                if (legend.length > 40) {
                    showTip('当前用了 ' + legend.length + ' 色，绣制工作量较大：建议把「最多色数」降到 40 以内，尾部相近色会自动合并。', false);
                } else if (unique > maxColors) {
                    showTip('原图共 ' + unique + ' 种 DMC 色，已按针数保留前 ' + maxColors + ' 色，其余合并到最接近的保留色。', false);
                }
                renderPreview();
                renderLegend();
                renderExportInfo();
                setStatus('');
            } catch (e) {
                setStatus(''); toast('生成失败，请调小针数再试');
            }
        }, 30);
    }

    function luminance(rgb) { return 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]; }
    function textColorFor(rgb) { return luminance(rgb) > 140 ? '#1f2937' : '#ffffff'; }

    function renderPreview() {
        var c = $('cs-canvas');
        var maxW = 1100;
        var cell = Math.max(2, Math.min(18, Math.floor(maxW / stitchW)));
        c.width = stitchW * cell; c.height = stitchH * cell;
        var ctx = c.getContext('2d');
        var symMap = {};
        legend.forEach(function (L) { symMap[L.idx] = L; });
        for (var y = 0; y < stitchH; y++) {
            for (var x = 0; x < stitchW; x++) {
                var L = symMap[cells[y][x]];
                var rgb = DMC_RGB[L.idx].rgb;
                ctx.fillStyle = L.hex;
                ctx.fillRect(x * cell, y * cell, cell, cell);
                if (viewMode === 'symbol') {
                    ctx.fillStyle = textColorFor(rgb);
                    ctx.font = Math.max(6, Math.floor(cell * 0.72)) + 'px sans-serif';
                    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                    ctx.fillText(L.symbol, x * cell + cell / 2, y * cell + cell / 2 + 0.5);
                }
            }
        }
        // 网格线：每格细线、每 10 格粗线（方便数格）
        ctx.strokeStyle = 'rgba(0,0,0,0.10)'; ctx.lineWidth = 1;
        ctx.beginPath();
        for (var gx = 0; gx <= stitchW; gx++) { ctx.moveTo(gx * cell + 0.5, 0); ctx.lineTo(gx * cell + 0.5, stitchH * cell); }
        for (var gy = 0; gy <= stitchH; gy++) { ctx.moveTo(0, gy * cell + 0.5); ctx.lineTo(stitchW * cell, gy * cell + 0.5); }
        ctx.stroke();
        ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1;
        ctx.beginPath();
        for (var hx = 0; hx <= stitchW; hx += 10) { ctx.moveTo(hx * cell + 0.5, 0); ctx.lineTo(hx * cell + 0.5, stitchH * cell); }
        for (var hy = 0; hy <= stitchH; hy += 10) { ctx.moveTo(0, hy * cell + 0.5); ctx.lineTo(stitchW * cell, hy * cell + 0.5); }
        ctx.stroke();
        $('cs-result').style.display = 'block';
        $('cs-legend-panel').style.display = 'block';
        $('cs-export-panel').style.display = 'block';
    }

    function swatchStyle(hex) {
        return 'background:' + hex + ';border:1px solid rgba(0,0,0,.2);';
    }

    function renderLegend() {
        var tb = $('cs-legend-body');
        var html = '';
        var totalS = 0, totalM = 0, totalK = 0;
        legend.forEach(function (L, i) {
            totalS += L.stitches; totalM += L.meters; totalK += L.skeins;
            html += '<tr><td>' + (i + 1) + '</td>' +
                '<td><span class="cs-sw" style="' + swatchStyle(L.hex) + '">' + L.symbol + '</span></td>' +
                '<td><b>' + L.code + '</b></td><td>' + L.name + '</td>' +
                '<td>' + L.stitches + '</td><td>' + L.meters + '</td><td>' + L.skeins + '</td></tr>';
        });
        html += '<tr class="cs-total"><td colspan="4">合计（' + legend.length + ' 色）</td>' +
            '<td>' + totalS + '</td><td>' + Math.round(totalM * 10) / 10 + '</td><td>' + totalK + '</td></tr>';
        tb.innerHTML = html;
        $('cs-count-note').textContent = '共 ' + legend.length + ' 色 · ' + totalS + ' 针 · 预估用线 ' +
            (Math.round(totalM * 10) / 10) + ' 米（约 ' + totalK + ' 绞，每绞 8 米）';
    }

    function renderExportInfo() {
        var f14 = fabricSize(stitchW, stitchH, 14);
        $('cs-export-info').innerHTML = '图纸尺寸：' + stitchW + ' × ' + stitchH + ' 针（' + legend.length + ' 色 DMC）<br>' +
            '14CT 参考成品：' + f14.w.inch + ' × ' + f14.h.inch + ' 英寸（' + f14.w.cm + ' × ' + f14.h.cm + ' cm）';
    }

    // 导出 PNG：高清符号图（标题 + 图案 + 图例），cell 24px
    function exportPNG() {
        if (!cells || !legend.length) { toast('请先上传图片生成图纸'); return; }
        setStatus('正在渲染高清导出图…');
        setTimeout(function () {
            try {
                var cell = 24, pad = 40, gap = 30;
                var patW = stitchW * cell, patH = stitchH * cell;
                var titleH = 90;
                var legCols = 2, legRowH = 34;
                var legRows = Math.ceil(legend.length / legCols);
                var legW = 2 * 560, legH = legRows * legRowH + 40;
                var W = Math.max(patW, legW) + pad * 2;
                var H = titleH + patH + gap + legH + pad * 2;
                var c = document.createElement('canvas');
                c.width = W; c.height = H;
                var ctx = c.getContext('2d');
                ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
                ctx.fillStyle = '#111827'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
                ctx.font = 'bold 34px sans-serif';
                ctx.fillText('十字绣图纸 · ' + stitchW + ' × ' + stitchH + ' 针 · ' + legend.length + ' 色（DMC）', pad, 55);
                ctx.font = '22px sans-serif'; ctx.fillStyle = '#6b7280';
                var f14 = fabricSize(stitchW, stitchH, 14);
                ctx.fillText('14CT 成品约 ' + f14.w.cm + ' × ' + f14.h.cm + ' cm · 2 股全针估算 · ' + new Date().toLocaleDateString(), pad, 88);
                var px = pad + (W - pad * 2 - patW) / 2, py = pad + titleH;
                var symMap = {};
                legend.forEach(function (L) { symMap[L.idx] = L; });
                for (var y = 0; y < stitchH; y++) {
                    for (var x = 0; x < stitchW; x++) {
                        var L = symMap[cells[y][x]];
                        ctx.fillStyle = L.hex;
                        ctx.fillRect(px + x * cell, py + y * cell, cell, cell);
                        ctx.fillStyle = textColorFor(DMC_RGB[L.idx].rgb);
                        ctx.font = '17px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                        ctx.fillText(L.symbol, px + x * cell + cell / 2, py + y * cell + cell / 2 + 1);
                    }
                }
                ctx.strokeStyle = 'rgba(0,0,0,.12)'; ctx.lineWidth = 1;
                ctx.beginPath();
                for (var gx = 0; gx <= stitchW; gx++) { ctx.moveTo(px + gx * cell + .5, py); ctx.lineTo(px + gx * cell + .5, py + patH); }
                for (var gy = 0; gy <= stitchH; gy++) { ctx.moveTo(px, py + gy * cell + .5); ctx.lineTo(px + patW, py + gy * cell + .5); }
                ctx.stroke();
                // 图例
                var ly = py + patH + gap;
                ctx.fillStyle = '#111827'; ctx.font = 'bold 26px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
                ctx.fillText('线材清单（DMC 色号 · 符号 · 针数 · 预估线长 · 绞数）', pad, ly);
                ly += 34;
                var colW = (W - pad * 2) / legCols;
                legend.forEach(function (L, i) {
                    var col = Math.floor(i / legRows), row = i % legRows;
                    var lx = pad + col * colW, lyy = ly + row * legRowH;
                    ctx.fillStyle = L.hex;
                    ctx.fillRect(lx, lyy - 20, 26, 26);
                    ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.strokeRect(lx + .5, lyy - 19.5, 26, 26);
                    ctx.fillStyle = textColorFor(DMC_RGB[L.idx].rgb);
                    ctx.font = '18px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                    ctx.fillText(L.symbol, lx + 13, lyy - 6);
                    ctx.fillStyle = '#111827'; ctx.font = '20px sans-serif'; ctx.textAlign = 'left';
                    ctx.fillText('DMC ' + L.code + '  ' + L.stitches + '针  ' + L.meters + '米  ' + L.skeins + '绞', lx + 36, lyy);
                });
                c.toBlob(function (blob) {
                    if (!blob) { setStatus(''); toast('导出失败'); return; }
                    var a = document.createElement('a');
                    a.href = URL.createObjectURL(blob);
                    a.download = origName + '-cross-stitch-' + stitchW + 'x' + stitchH + '.png';
                    document.body.appendChild(a); a.click();
                    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
                    setStatus(''); toast('已导出 PNG 高清符号图');
                }, 'image/png');
            } catch (e) { setStatus(''); toast('导出失败：' + e.message); }
        }, 30);
    }

    // 打印 PDF：打印区只放图纸 canvas + 图例表
    function printPattern() {
        if (!cells || !legend.length) { toast('请先上传图片生成图纸'); return; }
        var pc = $('cs-print-canvas');
        var cell = 10;
        pc.width = stitchW * cell; pc.height = stitchH * cell;
        var ctx = pc.getContext('2d');
        var symMap = {};
        legend.forEach(function (L) { symMap[L.idx] = L; });
        for (var y = 0; y < stitchH; y++) {
            for (var x = 0; x < stitchW; x++) {
                var L = symMap[cells[y][x]];
                ctx.fillStyle = L.hex;
                ctx.fillRect(x * cell, y * cell, cell, cell);
                ctx.fillStyle = textColorFor(DMC_RGB[L.idx].rgb);
                ctx.font = '7px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText(L.symbol, x * cell + cell / 2, y * cell + cell / 2 + 0.5);
            }
        }
        var f14 = fabricSize(stitchW, stitchH, 14);
        $('cs-print-title').textContent = '十字绣图纸 · ' + stitchW + ' × ' + stitchH + ' 针 · ' + legend.length + ' 色（DMC）';
        $('cs-print-sub').textContent = '14CT 成品约 ' + f14.w.cm + ' × ' + f14.h.cm + ' cm · 2 股全针估算 · ' + new Date().toLocaleDateString();
        var html = '';
        legend.forEach(function (L, i) {
            html += '<tr><td>' + (i + 1) + '</td><td>' + L.symbol + '</td><td>' + L.code + '</td><td>' + L.name + '</td><td>' + L.stitches + '</td><td>' + L.meters + '</td><td>' + L.skeins + '</td></tr>';
        });
        $('cs-print-legend-body').innerHTML = html;
        window.print();
    }

    /* ---------- 事件绑定 ---------- */
    function bind() {
        var up = $('cs-upload'), fi = $('cs-file');
        up.addEventListener('click', function () { fi.click(); });
        up.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fi.click(); } });
        ['dragover', 'dragenter'].forEach(function (ev) {
            up.addEventListener(ev, function (e) { e.preventDefault(); up.classList.add('dragover'); });
        });
        ['dragleave', 'drop'].forEach(function (ev) {
            up.addEventListener(ev, function (e) { e.preventDefault(); up.classList.remove('dragover'); });
        });
        up.addEventListener('drop', function (e) {
            var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
            handleFile(f);
        });
        fi.addEventListener('change', function () { handleFile(fi.files[0]); fi.value = ''; });

        $('cs-w').addEventListener('input', function () {
            stitchW = Math.max(40, Math.min(300, parseInt(this.value, 10) || 120));
            $('cs-w-num').value = stitchW; $('cs-w-val').textContent = stitchW + ' 针';
            recomputeH();
        });
        $('cs-w-num').addEventListener('change', function () {
            stitchW = Math.max(40, Math.min(300, parseInt(this.value, 10) || 120));
            $('cs-w').value = stitchW; this.value = stitchW; $('cs-w-val').textContent = stitchW + ' 针';
            recomputeH();
        });
        $('cs-h').addEventListener('input', function () {
            if (lockAspect) return;
            stitchH = Math.max(20, Math.min(400, parseInt(this.value, 10) || 90));
            $('cs-h-num').value = stitchH; $('cs-h-val').textContent = stitchH + ' 针';
            updateSizeLine();
        });
        $('cs-h-num').addEventListener('change', function () {
            if (lockAspect) return;
            stitchH = Math.max(20, Math.min(400, parseInt(this.value, 10) || 90));
            $('cs-h').value = stitchH; this.value = stitchH; $('cs-h-val').textContent = stitchH + ' 针';
            updateSizeLine();
        });
        $('cs-lock').addEventListener('change', function () {
            lockAspect = this.checked;
            $('cs-h').disabled = lockAspect; $('cs-h-num').disabled = lockAspect;
            recomputeH();
        });
        $('cs-regen').addEventListener('click', regenerate);

        $('cs-colors').addEventListener('input', function () {
            maxColors = Math.max(4, Math.min(60, parseInt(this.value, 10) || 24));
            $('cs-colors-num').value = maxColors; $('cs-colors-val').textContent = maxColors + ' 色';
        });
        $('cs-colors-num').addEventListener('change', function () {
            maxColors = Math.max(4, Math.min(60, parseInt(this.value, 10) || 24));
            $('cs-colors').value = maxColors; this.value = maxColors; $('cs-colors-val').textContent = maxColors + ' 色';
        });

        document.querySelectorAll('input[name="csview"]').forEach(function (r) {
            r.addEventListener('change', function () { viewMode = this.value; renderPreview(); });
        });

        $('cs-export').addEventListener('click', exportPNG);
        $('cs-print').addEventListener('click', printPattern);
        $('cs-reupload').addEventListener('click', function () { fi.click(); });
    }

    bind();
    $('cs-h').disabled = true; $('cs-h-num').disabled = true;
})();

})(); // end outer IIFE
