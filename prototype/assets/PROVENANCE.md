# 素材出处与使用边界

2026-11-16 项目负责人确认当前素材可随公开源码仓库发布。以下保留历史来源和核验记录；部分原始供应商、作者及授权链未独立核实，不据此推断其他使用场景的权利。

## 从参考稿复制的文件

以下源路径均相对仓库根目录。2026-10-21 本次交接用 `cmp` 对照，六项均与来源逐字节相同；原参考文件未编辑。图片里的显示窗配以原型 DOM LCD 文字，不是实时设备读数。

| 原型文件 | 原始来源 | 用途 |
| --- | --- | --- |
| `weather-meter.webp` | `temp/refs/gpt-prototype/assets/weather-meter.webp` | 叶轮式风温湿仪的无标识器材外形 |
| `barometer-watch.png` | `temp/refs/gpt-prototype/assets/barometer-watch.png` | 腕上气压计外形 |
| `solar-radiometer.png` | `temp/refs/gpt-prototype/assets/solar-radiometer.png` | 分体式日射读表及传感器外形 |
| `gps-receiver.png` | `temp/refs/gpt-prototype/assets/gps-receiver.png` | 黄黑手持导航器外形；不获取用户位置 |
| `paper-texture.webp` | `temp/refs/gpt-prototype/assets/paper-texture.webp` | 报纸、页面背景、手册与表单纸纹 |
| `riverside-film.webp` | `temp/refs/gpt-prototype/assets/riverside-film.webp` | 江岸城市氛围图，经 CSS 黑白／网点处理；非当日实况或预测 |

这些图像更早的创作方式、作者和授权链未知，不冒称真实历史器材照片。没有复制工具箱底板、木工作台或整张参考设计截图。

## 本轮原创绘制

| 文件／位置 | 内容与来源说明 |
| --- | --- |
| `satchel-back.svg` / `satchel-front.svg` | T01 历史肩包图保留，T03 当前场景不再使用；未改写历史资产 |
| `backpack-back.svg` | T03 原创摄影背包：肩带／提手、翻起软盖、厚侧幅、外鼓包身、凹入织物隔仓、压缩带、黄铜环；无参考工具箱底图 |
| `backpack-mid.svg` | T03 原创上下错层中间软套，遮住上层器材底端、位于下层器材之后，避免遮住 LCD |
| `backpack-front.svg` | T03 原创前袋、侧册袋、厚袋唇、车缝、鼓面、局部褶皱与铜扣；负责报纸／手册／器材下沿的独立前景遮挡 |
| `leather-grain.webp` / `draw-backpack.py` | T03 原创确定性程序皮孔纹理与背包几何生成源；本机已有 Pillow，仅用于生成，不是浏览依赖。三个 SVG 内嵌该本地 WebP，避免 CSS SVG 的嵌套资源限制；不请求外部图片 |
| `../index.html` / `../styles.css` / `../app.js` 的怀表及铭文 | T03 原创 CSS 金属表圈／表冠／旧纸珐琅表面、SVG 链及 24h 刻度、DOM 表针和 `HIKARI FIELD` / HF–96、HP–98、SR–250、HN–99 / `H.K.` 虚拟壳体铭文。没有真实厂牌、外部素材或自动走时 |
| `../styles.css`、`../index.html` | 本轮 CSS 黄封手册、叠页、书脊、通用胶片罐与封面线描；纸纹仍使用上表参考素材 |
| `../app.js` 中 `diagram()` | 本轮内联 SVG 地平线／人像受光／街头光影关系图，非现场机位或光路验证 |
| `../styles.css` / `../app.js` 的订阅纸单／纸套 | T04 历史原创 CSS 纸唇模型，已由 T07 下项替换；历史截图保留。复用上表 `paper-texture.webp`，其许可限制不变 |
| `paper-crease-v.svg` / `paper-crease-h.svg` | T02 原创不规则旧折痕：宽窄变化的浅压痕、断续纤维及亮脊；平面正文与折叠副本共用，不使用外部素材 |

整体视觉方向综合 `temp/refs/claude-prototype/` 的报刊网格与手册编排，以及 `temp/refs/gpt-prototype/` 的器材与连续物件动作。此为设计来源说明，不是参考稿的版权许可声明；本轮原创部分也不替参考图像提供授权保证。

## 器材历史线索（继承自参考稿，未独立核验）

- 风温湿仪：1996 年起的 Kestrel 早期便携叶轮仪家族。
- 腕表：1998 年 Suunto Vector 类户外腕表。
- 日射仪：1996 年 LI-COR LI-250 / LI-200SA 类分体读表与传感器。
- 导航器：1999 年初代 Garmin eTrex 类设备。

以上仅记录造型研究线索，不声称重新核对了厂商档案、精确型号或年代。产品可见器材不展示这些品牌，建议也不推荐品牌胶卷。字体使用本机系统字体栈，未复制或下载字体文件。气压、日射及太阳时刻均为固定演示，不据器材外形宣称实测、卫星锁定或曝光测量能力。


## T06 写实替换（2026-10-22，历史；背包继续使用）

主代理使用内置 `image_gen` 工具、`transparent_background=true`，不是 CLI、外部 API 或下载照片。工作代理使用主代理已保存并检查的五张所选输出；没有再次生成。[逐字提示词](T06-IMAGEGEN-PROMPTS.md) 保留生成模式、目标和约束。生成不等于实物摄影或公开素材授权验证。

| 当前文件 | 来源与处理 | 当前用途 |
| --- | --- | --- |
| `backpack-photo-v2.png` | 主代理内置 imagegen 新生成的无品牌、空袋背包；1359×1157 RGBA | 完整背包后层，原图保持不变 |
| `backpack-photo-mid.png` / `backpack-photo-front.png` | `split-backpack.py` 仅对上图做二值 alpha 选择；完整原画布不裁切，保留像素 RGBA 逐字节相同 | 两个内袋面／前袋口、侧幅及右侧册袋的物理遮挡；无重绘 |
| `wind-photo-v2.png` | 内置 imagegen 编辑本地 `weather-meter.webp`，加入实物磨损、HF-96 和 H.K. 等虚拟刻字 | 风温湿仪外壳，LCD 仍为 DOM |
| `pressure-photo-v2.png` | 内置 imagegen 编辑本地 `barometer-watch.png`，HP-98 / H.K. 刻字已在图中；图中缺少的 HIKARI FIELD 由 DOM 壳体小字补足 | 腕上气压计外壳，LCD 仍为 DOM |
| `solar-photo-v2.png` | 内置 imagegen 编辑本地 `solar-radiometer.png`，保留传感器／连线和空 LCD；虚拟 SR-250 / H.K. 刻字在图中 | 分体日射仪外壳，能量读数仍为 DOM |
| `gps-photo-v2.png` | 内置 imagegen 编辑本地 `gps-receiver.png`，空 LCD；虚拟 HN-99 / H.K. 刻字在图中 | 导航器外壳，坐标／日期／太阳样例仍为 DOM |

此前的 SVG 背包和所有四张输入原图仍保留，未修改 `temp/refs/`。图片中已有的刻字不在 DOM 重复叠印；数据属性／无障碍标签／说明保留 HIKARI FIELD、各型号与主人刻字。怀表仍为 T03 原创 CSS/SVG，不是生成照片；T06 只增加其物理出袋与链条随动，不假称自动走时。

生成外壳所用参考原图的更早来源仍未知。T06 没有引入生产天气、定位、订阅或外部请求。


## T06A 当前物件替换（2026-10-22，待验收）

此前 T06A 尝试使用内置 image_gen，全部 transparent_background=true；Sol接管保留这些输出，未重新生成。[逐字提示词、输入和生成源路径](T06A-IMAGEGEN-PROMPTS.md)。T06背包与注册遮挡图字节未改。

| 文件 | 来源与当前用途 |
| --- | --- |
| wind-photo-v3.png | 对 wind-photo-v2.png 有边界外观编辑；保留开放叶轮、空LCD和按键，旧镍包边／握纹／原创HF-96刻字；当前风温湿外壳 |
| solar-direction-v1.png | 新生成原创太阳方向器材，旧黄铜圆盘／空DOM读数窗／SD-21刻字；太阳刻度和角度是本地DOM计算显示，不测设备朝向 |
| light-meter-v1.png | 初始生成的原创经典受光罩手持表，保留历史源文件 |
| light-meter-v2.png | 对v1去除周围影棚背景的内置编辑输出，选用的当前外壳；空窗内DOM只显示条件性光照和阶段，无曝光参数 |
| ../styles.css / ../index.html 气象记录卡 | 原生CSS／DOM纸卡，复用原有paper-texture.webp；六项读数不烘焙入图，放大来源文字随纸面增高 |
| ../solar.js / SUNCALC-LICENSE.txt | 太阳位置公式改编自SunCalc v1.9.0，(c)2011–2015 Vladimir Agafonkin，BSD-2-Clause；无新增浏览依赖／请求，保留完整许可 |

T06旧气压／日射／导航外壳及T03链条为历史材料，当前产品不再使用；参考器材年代未独立核验。当前表盘仍为原创CSS/SVG，移除了链条、表冠和挂环。生成素材是具有摄影外观的插图，不是历史实物照片。PM10为独立编写的24小时演示样例，不是实况或服务响应。


## T07 — 原创额外页片与完整松散纸单

`../app.js` / `../styles.css` 的额外3D叶片、完整下层书页、纸单分离阴影与尾声文字动效为本轮原创代码；页片正面使用当前原生题材末页的inert、aria-hidden、ID-free装饰副本，背面为暖白纸。完整订阅单是既有唯一表单本身，无表单截图／副本／新栅格图／新imagegen调用。纸纹仍为上表既有`paper-texture.webp`，许可未核实，使用边界仍为本地评审。T04纸套／纸唇不再进入当前画面。没有更改T06/T06A任何器材、包体或遮挡资产。
