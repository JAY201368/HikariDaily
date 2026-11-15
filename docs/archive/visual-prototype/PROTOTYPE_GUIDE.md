# 逐光日刊 · 离线视觉样刊

固定上海城市参考点、2026-10-21、北京时间的本地设计评审原型，**不是真实天气或生产应用**。无需构建、安装依赖或联网即可预览；请启用浏览器本地 JavaScript。

## 打开

- 直接用现代浏览器打开 `prototype/index.html`（`file://`）。转发时保留整个 `prototype/` 目录。
- 或在仓库根目录运行：

  ```sh
  python3 -m http.server 8765 --directory prototype
  ```

  打开 `http://localhost:8765`；结束时按 Ctrl-C。仅本机访问可追加 `--bind 127.0.0.1`。

## 阅读与操作

- 顶部章节导航可直达稳定阅读位置。桌面原生滚动依次展示报纸、竖折、横折、入袋、仪表、同一本黄手册抽出与打开，以及风光／人像／街拍翻页；反向滚动可回看。不会接管滚轮。
- 宽屏时间轴：0–14% 报纸；14–30% 两次折叠；30–39% 入袋；39–57% 仪表；57–75% 抽册、开册；75% 起阅读，约 83%／91% 翻页。以上为原阅读时间轴（900vh 行程），节点不变；T04 在其后追加 250vh 尾声行程，T07 用于额外翻页、夹单发现和落定，舞台总高 1250vh。题材按钮和前后页也可导航。
- 宽度不足 1100px 或高度不足 820px 使用紧凑布局：报纸按原字号重排；保留折叠、入袋、抽册交接；打开后的手册原生横滑翻题材，也能用按钮，页面仍可纵向滚动。
- 「静态阅读」按正常文档顺序展示完整内容。系统「减少动态」默认启用此模式；仍可选小时、开说明、查看全部题材。紧凑布局的静态手册仍可横滑。订阅单顺序直接可填，不运行抽单。
- T06 使用写实皮革摄影背包：外鼓侧幅、肩带、翻盖、织物内衬、软袋、黄铜扣与自然皮纹；四件器材换成本地生成的实物质感外壳，使用原创虚拟 `HIKARI FIELD` 型号／`H.K.` 刻字。没有真实厂牌。右侧（手机下方）无链表盘**拨针选时，不会自动走时**：24 小时盘，00 在上、06 在右、12 在下、18 在左。点击刻度或按住拖动吸附整点，23↔00 连续跨越；只在盘面捕获触摸，其他位置仍可纵向滚动。表盘可聚焦，方向键 ±1 小时，Home / End 到 00 / 23；另有可见的上一／下一小时按钮、精确时间与逐时明细。旧小时长条／range 已移除。
- 选择 09／16／18 可比较 LCD、注解与模态说明；全天概览、手册建议和日落语境不随小时重写。读数直接同步到选定夹具，不随机抖数、不经过虚构中间值。风温湿、计算太阳角度、光照解释及气象卡同步显示同一小时。
- 整件仪器可点击或键盘 Enter 打开详情；关闭按钮或 Escape 退出并返回焦点。夹具状态可演示缺失、旧数据与来源分歧。晚霞五级不是概率，缺失必要输入时独立显示「暂无法判断」。
- T07 三题材阅读之后继续滚动，额外翻过一张页面，露出完整躺在书页之间的红线订阅单；纸单先停留，再抬起、移出、放大与落定。没有纸套、纸唇或开缝裁切。尾声文字在落定期间分组淡入并轻移，交接前已完整出现；反滚使用同一公式。手机从当前横选题材末页发现夹单，保留横向选择和自然纵读。始终是原来的一个表单 DOM，无表单副本；回滚、重排及静态切换保留地点／时段／预览。最后正常流启用控件，长表单可原生滚动，章节导航直达。
- 订阅单须填写非空地点，只提供 07:00／12:00。提交、调整和停止都是**不发送的界面预览**，不查询地点、不持久保存、不采集身份或创建订阅。

空气采用 US EPA / CAMS 参考口径，能见度单列；太阳角度与事件是本地固定日期计算；四个载体不是现场传感器、测光结果或生产 API。三题材包含不同窗口、理由、限制与通用胶片类别。

## 检查（从仓库根目录执行）

仅需 Node.js、无第三方依赖的检查：

```sh
node --check prototype/app.js
node --check prototype/data.js
node --check prototype/check-local.cjs
node --check prototype/check-browser.cjs
node prototype/check-local.cjs
```

新增聚焦检查／共用测试 helper 也可做语法检查：

```sh
node --check prototype/check-folds.cjs
node --check prototype/check-watch.cjs
node --check prototype/hour-control.cjs
node --check prototype/check-slip.cjs
```

本地检查验证静态资源引用、24 小时、09／16／18 差异、全天与日落夹具、凌晨／晚间注解及独立 PM10 样例；不是生产服务测试。

浏览器烟测还需**已安装的 Playwright Node 模块及可启动的 Chromium／Chrome**。原型浏览本身不需要这些工具。当前 T07 验证环境版本与限制见 [验证记录](../../../prototype/review/T07/VERIFICATION.md)；较早轮次记录作为历史证据保留。

```sh
# 如果当前 Node 可解析 playwright，且其默认 Chromium 已可用：
node prototype/check-browser.cjs

# 否则显式指定你自己的本地安装位置（替换下面占位路径）：
PLAYWRIGHT_MODULE='/absolute/path/to/node_modules/playwright' \
CHROME_PATH='/absolute/path/to/chrome-executable' \
REVIEW_DIR='/absolute/path/to/review-output' \
node prototype/check-browser.cjs
```

三个环境变量均可选：`PLAYWRIGHT_MODULE` 默认 `playwright`；`CHROME_PATH` 未设置则用 Playwright 的默认 Chromium；`REVIEW_DIR` 默认 `prototype/review/`。默认输出会覆盖同名截图和 `browser-results.json`，**保留既有证据时请设新输出目录**。模块缺失会输出 `SKIPPED` 并退出 2，不是通过；浏览器缺失或断言失败会退出非零。

脚本直接访问 `file://`，无需启动 HTTP 服务；覆盖 1440×960、390×844 触摸模拟、减少动态、正反关键帧、仪表键盘与焦点、24 小时太阳角度与四载体同步、异常状态、手册横滑、输入转义及不发送预览，并检查页面错误和 HTTP(S) 请求。输出 JPG、通过结果 JSON；失败时输出 `browser-failure.txt`。这些是离线烟测，不是完整无障碍、跨浏览器或实机性能认证。

## 文件与边界

- `index.html` / `styles.css` / `app.js`：DOM、材质与可逆场景。
- `data.js`：唯一固定天气／空气夹具；`solar.js`：固定上海日期的本地太阳计算；没有地理编码、天气接口、后端、数据库、构建或部署工程。
- `assets/`：本地器材与原创皮包；[逐项出处与许可限制](../../../prototype/assets/PROVENANCE.md)。
- `review/`：历史证据保留；当前物件映射、收纳路径与回归以 [T06A 验证记录](../../../prototype/review/T06A/VERIFICATION.md) 为准。额外翻页／完整夹单／尾声动效以 [T07 验证记录](../../../prototype/review/T07/VERIFICATION.md) 为准。

## T03 聚焦复核与几何交接

将上面的 `PLAYWRIGHT_MODULE` / `CHROME_PATH` 用 `export` 提供（或逐次放在命令前），将 `REVIEW_DIR` 指向新目录后运行：

```sh
REVIEW_DIR='/absolute/path/to/T03-watch-evidence' node prototype/check-watch.cjs
REVIEW_DIR='/absolute/path/to/T03-fold-evidence' node prototype/check-folds.cjs
```

`check-watch.cjs` 覆盖 1440×960、1920×958、1150×830 实际缩放、390×844 真正 Chrome touch 事件与减少动态；全 24 时、键盘／按钮／跨零、拖动到盘外释放、取消／丢失捕获、原生竖滚、LCD/标签/指针同步、铭文详情、正反关键帧、静态袋内锚点。`hour-control.cjs` 供聚焦检查和烟测共用（T03 为 185 项；T04 加入延迟关闭焦点竞态回归后为 186 项），按 slider 语义与实际表盘矩形点选，不保留旧控件。

以下保留 T03 历史几何（T06／T06A 替换值见后文）。T03 **不改变**手册阅读与翻页节点。其皮包三层 SVG 使用同一 800×680 画布，桌面 `(0,80)`；紧凑布局 `(-25,62)`、410×348.5。后层负责包体／衬里，中层软套在上层器材之前、下层器材之后，独立前层遮住报纸、手册及器材下沿。黄册初始桌面 `(625,365), scale .28, rotate 6°`，紧凑 `(294,235), scale .14, rotate 6°`；仍先向上抽离，再旅行至原来的开册位置。报纸最终桌面 `(165,537), scale .42`；紧凑 `(222,296), scale .13, rotate 90°`。静态袋内纸／册是同内容、ID-free、inert 装饰副本，锚点与动态核对；正文／可交互手册仍只有一份。上述为保留的 T03 几何，T04 不改变这些入袋／抽册锚点。

`assets/draw-backpack.py` 可用现有 Python + Pillow 重新生成原创背包 SVG 和确定性皮孔纹理（`python3 prototype/assets/draw-backpack.py`）；**浏览、检查原型不需要 Pillow 或生成步骤**。自绘纹理内嵌在 SVG，避免 CSS SVG 图片无法加载嵌套本地图片的限制；本地引用检查只允许与该本地纹理逐字节一致的内嵌 WebP。

## T04 历史抽单模型（T07 替换纸套与时序）

```sh
REVIEW_DIR='/absolute/path/to/T04-slip-evidence' node prototype/check-slip.cjs
```

仍需上述本地 Playwright／Chrome 环境变量。检查 1440×960、1920×958、390×844，抽单正反 11 个关键帧、来源纸套位置、固定纸单到正常流的 <2px 交接、唯一表单节点、过渡不可聚焦、键盘、空白校验／文字安全／07:00 与 12:00／调整停止、实际触摸横滑与纵读、三个当前题材抽单、输入／预览回滚保留、1090↔1150 断点重排及静态／系统减少动态变化。JPG 和采样 JSON 在指定目录；不覆盖旧轮次证据。

- 宽屏原阅读行程仍为 `900vh`；`p=.785/.875/.96` 仍为三个稳定题材。手册最后一页在 `p=.935` 翻页完成后就能看到露出的红线抬头，不提前拉出。总舞台 `1250vh`：前 `900vh` 阅读行程 + 后 `250vh` 抽单行程 + 一个视口的 sticky 舞台高度。
- 紧凑原阅读行程仍为 `680vh`、舞台 `780svh`，原开册交接不变。正文手册保持正常字号横滑；其 reader 在末页读完后才 sticky，追加 `250vh` 行程抽单。末页底部增加仅用于夹单的留白，不遮住题材限制段；不改变任何题材内容或强制回到风光。
- 独立抽单进度 `q`：`0–.04` 露头停留；`.04–.56` 沿纸套向上抽，依据原表单实际高度解除下部遮挡；`.56–.88` 完全清边后移位、放大，手册向下让开；`.88–1` 纸单落定保持，`1` 与正常流位置精确重合后启用控件。反滚使用同一公式，无淡入替换。
- 来源纸套取实际可见末页的 `getBoundingClientRect()`；最终尺寸取正常流 `.slip-home`。移动的是同一个 `#subscription`，始终不克隆表单／输入。袖口是原创 ID-free、inert、aria-hidden CSS 纸唇，使用已记录的本地纸纹；没有新外来素材。
- 原测试 seek helper 改读 `#journey.dataset.readingDistance`，避免追加行程改变 T02/T03 的采样节点；未放宽既有断言。当前精确验证结果和历史超时说明见 T04 报告。

不加载远程字体、脚本或数据，不遥测、不定位。**素材许可尚未核实，仅供本地设计评审；公开发布前必须核实或替换。** 参考稿的器材历史线索也未经独立核验。

## T06 写实素材、真实袋口与怀表出袋（历史；T06A 覆盖路径与映射）

生成方式为内置 `image_gen`，透明底；四件仪器基于保留的本地原图编辑，背包为新生成图。[逐字提示词与输出文件](../../../prototype/assets/T06-IMAGEGEN-PROMPTS.md)、[出处及许可边界](../../../prototype/assets/PROVENANCE.md)。浏览无需生成步骤、安装或联网。

`backpack-photo-v2.png` 是完整后层；`backpack-photo-mid.png` 和 `backpack-photo-front.png` 仅以二值 alpha 选择原图中的两个内袋面及 U 形前袋／侧幅／侧册袋。三层都保留 **1359×1157** 原画布，保留像素的 RGBA 与原图逐字节相同，没有重绘或重新取样。可用本机已有 Pillow 执行 `python3 prototype/assets/split-backpack.py` 重现遮挡层。运行时三层共用桌面 `(0,80),800×680`、紧凑 `(-25,62),410×348.5` 的位置与缩放。

- 当前报纸最终锚点：桌面 `(183,478),scale .42`；紧凑 `(196,268),scale .13,rotate 90°`。同内容的静态副本保持一致。
- 同一黄册在真实右侧袋中：桌面 `(655,310),scale .21,rotate 6°`；紧凑 `(310,180),scale .14,rotate 6°`。抽册／开册和三个题材的阅读时间点仍保持原有节点。
- 同一怀表起始部分藏在前袋唇后：桌面 `(175,470),scale .42`，紧凑 `(64,260),scale .43`。桌面原阅读进度 `p=.305–.35` 竖直提到 `y=130`，`.35–.39` 横移／放大至 `(824,182),scale 1`；紧凑 `.23–.28` 提到 `y=85`，`.28–.34` 移至 `(14,414),scale 1`。链条与同一怀表一起连续运动，反向同公式。
- 怀表独立于 `.bag-controls` 的显隐门；表壳始终不透明，先靠前袋 alpha 遮挡。完整表壳清过所有前层后才换到侧幅前方，交接点没有重叠。过渡期整个怀表 inert，只有稳定阅读区才可操作；动作按钮随落定连续显现。静态／减少动态直接显示最终完整怀表。
- 字体读数仍为 DOM，保留全对象按钮、24h 指针／触摸／键盘及原夹具状态。已刻在图片上的厂牌／型号／主人字样不再重复印 DOM；气压计图中缺少的 `HIKARI FIELD` 仍以壳体小字补足。无障碍标签及放大说明都保留型号／主人信息。

T06 聚焦命令（仓库根目录；环境中的两个本地程序路径为本次实际使用位置）：

```sh
export PLAYWRIGHT_MODULE='/Users/jay/Desktop/SE/课题/photo-or-not/node_modules/playwright'
export CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
REVIEW_DIR="$PWD/prototype/review/T06/watch-final" node prototype/check-watch.cjs
REVIEW_DIR="$PWD/prototype/review/T06/folds" node prototype/check-folds.cjs
REVIEW_DIR="$PWD/prototype/review/T06/aggregate" node prototype/check-browser.cjs
REVIEW_DIR="$PWD/prototype/review/T06/slip-regression" node prototype/check-slip.cjs
```

聚焦怀表检查在原 T03 输入／静态锚点回归之外，增加桌面1440／1920、手机390各八个提起／横移边界和中点、反向相同几何、同一节点／全不透明／inert、起始跨袋唇／提清后才横移／落定后才启用、亚像素边界连续性，保存正反截图与采样 JSON。已授权的图片刻字断言按新素材更新，没有放宽输入、数据、模态或阅读不变量。最终结果和初稿失败的明确区分见 T06 报告。


## T06A 当前映射、袋内路径与本地计算

T06A 已于 2026-10-22 经主代理独立验收。沿用 T06 写实背包及原注册遮挡图，不重绘包体。当前四物件为：开放叶轮风温湿仪（平均风、阵风、温湿度）、计算太阳方位仪（北0°顺时针方位／地平线0°高度）、经典测光表意象（条件性光照解释与太阳阶段）、原生 DOM 气象记录卡（云%、小时雨mm、能见度km、US EPA/CAMS参考AQI、PM2.5与PM10 μg/m³）。气压／日射／GPS退出当前场景与来源说明，历史文件保留。独立24小时PM10演示数组在 data.js；缺失演示单独缺PM10仍保留PM2.5，不以零补齐。

三件外壳由先前 T06A 尝试通过内置 imagegen 保存，接管未重新生成；[逐字提示词与源输出路径](../../../prototype/assets/T06A-IMAGEGEN-PROMPTS.md)。太阳刻度／指示针、全部读数和纸卡均为原生 DOM/CSS。放大详情左栏预留阴影间距，纸卡高度由内容决定；紧凑详情为上图下文，长说明使用模态框原生滚动。

- 报纸桌面先在 p=.30–.35 完成缩放和对齐到 (260,360)、scale190/560，再于 .35–.39 竖直下降至 y465。紧凑先于 .22–.29 对齐 (220,230)、rotate90°、scale220/实际纸高，再于 .29–.34 下降至 y276。两次折叠先完成；对齐之前保持在遮挡层前，对齐且全纸仍悬空后才进入实际前唇层，只由原图实际袋口遮挡。静态副本与终点共享锚点。
- 黄册桌面主仓右后内夹层起点 (495,285)、scale.19、rotate3°；p=.57–.65 提至 y90，完全清口后 .65–.70 才移位放大，.70–.75 开册。紧凑起点 (230,168)、scale.14、rotate3°；.59–.69 提至 y58，.69–.77 才移位放大，.77–.87 开册。提离前同一本册位于包内层级，内袋面在其前；清口后移回舞台。静态书封使用相同位置关系。
- 表盘移除链条、表冠和挂链环，保留同一个24h拨针节点、T06提起／旅行时间及全部控制；不会自动走时。T04纸套模型已由下节T07额外翻页／完整夹单替换。

solar.js 为 SunCalc 1.9.0 太阳位置公式的本地太阳专用改编，保留 [BSD-2-Clause许可](../../../prototype/assets/SUNCALC-LICENSE.txt)。上海31.23°N/121.47°E、2026-10-21，北京时间以显式+08:00转换，不读系统时区或设备方向。事件在同一位置函数上二分求高度阈值交点，避免近似事件算法与阶段标签错位。现为日出06:01、日落17:17、早蓝05:36—05:46、早金05:46—06:34、晚金16:44—17:32、晚蓝17:32—17:42；报纸、手册和详情共用这些值。旧示意时间及上游近似算法约57–62秒差异见验证报告。仅校准这一天的离线样例，不声称天文精度认证。

当前规范检查命令（从仓库根目录；浏览器套件串行运行，保留旧证据时使用新 REVIEW_DIR）：

```sh
for f in prototype/*.js prototype/*.cjs; do node --check "$f" || exit; done
node prototype/check-local.cjs
TZ=UTC REVIEW_DIR="$PWD/prototype/review/T06A/solar-utc-new" node prototype/check-solar.cjs
TZ=Asia/Shanghai REVIEW_DIR="$PWD/prototype/review/T06A/solar-shanghai-new" node prototype/check-solar.cjs
export PLAYWRIGHT_MODULE='/Users/jay/Desktop/SE/课题/photo-or-not/node_modules/playwright'
export CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
REVIEW_DIR="$PWD/prototype/review/T06A/objects-new" node prototype/check-objects.cjs
REVIEW_DIR="$PWD/prototype/review/T06A/watch-new" node prototype/check-watch.cjs
REVIEW_DIR="$PWD/prototype/review/T06A/folds-new" node prototype/check-folds.cjs
REVIEW_DIR="$PWD/prototype/review/T06A/browser-new" node prototype/check-browser.cjs
REVIEW_DIR="$PWD/prototype/review/T06A/slip-new" node prototype/check-slip.cjs
```

objects 聚焦三视口的密集纸张对口／下放、黄册提离和反向同几何、独立缺失状态、四件放大详情的视口界限／阴影不遮文字／完整纸卡来源、静态截图。watch 保留24h鼠标、真实Chrome触摸事件、键盘、跨零、缩放、捕获取消、同节点提离、异常及焦点；folds/browser/slip复核既有不变量。具体结果、草稿失败与限制见 [T06A验证记录](../../../prototype/review/T06A/VERIFICATION.md)。这些检查不验证真实服务、物理手机或公开素材许可。


## T07 当前额外翻页、完整夹单与尾声文字

规范聚焦命令（仓库根目录，直接 file://，无需服务／安装／构建）：

```sh
export PLAYWRIGHT_MODULE='/Users/jay/Desktop/SE/课题/photo-or-not/node_modules/playwright'
export CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
REVIEW_DIR="$PWD/prototype/review/T07/focused-new" node prototype/check-slip.cjs
```

使用新 `REVIEW_DIR` 保留已有证据；先前 T04 命令调用的是当前脚本，旧轮次数字和截图只作为历史。T07 检查桌面1440×960／1920×958和390×844触摸、21个正反关键帧、额外页面180°转动、完整纸单四边在真实末页内、翻完后的静置、抬起与阅读位置、来源页跟随、未裁切、尾声各组渐入和<2px固定到正常流交接。保留唯一表单、过渡不可聚焦、三个手机题材、真实触摸横滑／纵读、预览保存后整单仍放得下、文字安全、07:00/12:00、调整停止、断点重排和静态／减少动态检查；输出截图及完整采样JSON。浏览器回归串行运行 `check-browser.cjs`、`check-watch.cjs`、`check-folds.cjs`；共用书册几何另由 `check-objects.cjs` 复核。全部11个顶层JS/CJS需语法检查，`check-local.cjs`与太阳时区回归命令见上节。

原阅读距离／题材节点保持：宽屏900vh、p=.785/.875/.96；原来两次题材翻页.83–.855／.91–.935。总舞台1250vh；q从原阅读结束开始，至正常流订阅章节起点结束，仍为250vh尾声。紧凑原680vh阅读和780svh舞台不变，当前题材两页先按正常字号纵读，reader读到底才sticky，再进入250vh尾声。取消旧纸套专用末页105px留白。不会强制回到风光。

| q | 动作 |
| --- | --- |
| 0–.04 | 当前末页完整覆盖夹单，页面图文与原页对齐，无可见切换 |
| .04–.34 | 额外叶片围绕真实书脊转180°，正面是当前末页的inert/ID-free副本，背面为暖白纸；下方是完整松散纸单，无clip-path |
| .34–.46 | 全部四边可见的纸单静置于书页内，尺寸同时适配真实页宽／页高及保留的预览内容 |
| .46–.62 | 单独抬起，放大7%、轻转2.5°并加深分离阴影；宽屏上移74px，手机保持固定导航下完整可见 |
| .62–.90（宽屏） | 纸单移至最终表单宽度／位置，书册向下让开 |
| .62–.82、.82–.96（紧凑） | 先移至最终宽度／位置下方14px，书册向上退出以避免长册首面重新进入；再轻落14px到最终位置 |
| .96–1 | 表单与文字均已完整落定；q=1只改变固定／正常流定位并启用原表单，不切换可见性 |

尾声三组文字逐组opacity0→1、translateY18→0：宽屏分别q=.66–.79、.70–.845、.74–.90；紧凑分别.82–.88、.845–.915、.87–.95，纸单先让开文字区域。每组均在q=.96前完整显示。正文与表单各有真实尺寸占位，q=1前后位置相同；反滚原式反向。静态／系统减少动态清除定位和各组内联样式，直接完整顺序阅读。

新增画面仅为原创CSS纸层／3D叶片和既有纸纹，没有新栅格图、外来图像或生成步骤。表单始终是唯一`#subscription`；装饰叶片不复制表单。许可限制及离线夹具边界不变。
