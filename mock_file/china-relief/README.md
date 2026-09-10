# 中国浮雕地形预览

现有 Go 服务入口：`/tools/mock/china-relief/`。也可从项目根目录运行
`rtk proxy python3 -m http.server 8765 --bind 127.0.0.1 --directory mock_file`，
然后打开 `http://127.0.0.1:8765/china-relief/`。

全部浏览器资源保存在 assets 中，运行时无需 CDN、API token 或在线地图请求。
本页面无需编译；使用现代浏览器的 ES Modules、Import Maps 和 WebGL。

## 数据与实现

- 高程源：[Mapzen / AWS Terrain Tiles](https://registry.opendata.aws/terrain-tiles/)，Terrarium 编码，zoom 6。
- 数据源与署名说明：[Terrain Tiles attribution](https://github.com/tilezen/joerd/blob/master/docs/attribution.md)。综合源包括 SRTM、GMTED、ETOPO1 等，精度随区域变化。
- 范围：东经 70–138°、北纬 15–56°，覆盖中国主体与周边，非完整领土或行政区划地图。
- 纹理由真实高程生成，包含固定西北侧光的晕渲和地貌色彩处理；不使用用户参考图作为贴图。
- 网格为 900 × 700 顶点；高度文件为 little-endian uint16，高程 = 值 − 32768 米。
- 使用 Web Mercator 平面，垂直倍率以北纬 35° 的地面比例计算；海底与负高程在三维网格中压到零面。
- 配色为地貌示意，不是卫星影像。海拔图例是基础配色，坡度和区域调色会改变最终颜色。
- 目前使用固定精度，不支持无限放大的地形瓦片；标注未实现地形遮挡检测。
- 38 处地理标注按三档缩放距离逐步显示；悬停、聚焦或点击显示说明卡。近距离观察时自动介绍靠近视野中心的标注，停留 450ms 后切换。参考位置不代表区域边界。
- Three.js 0.160.0，MIT，许可证在 `assets/THREE-LICENSE.txt`。

## 重新生成

安装 Pillow 和 numpy 后，从项目根目录运行：

```sh
rtk proxy python3 tools/terrain/build_relief.py
```

生成器下载并缓存 143 张瓦片，输出本地纹理、高程和元数据。缓存保存在系统临时目录，原始瓦片不进入仓库。
