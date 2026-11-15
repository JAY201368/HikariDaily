# V09 实体手册外观及翻页

2026-10-24，主对话直接实施。最初按仓库规则派发spec-worker-sol-high后，用户明确要求不用worker，立即中断；worker没有文件修改，全部实现/生成/验证由主对话完成，不宣称观察到worker模型运行元数据。

## 实现与验收

- 新生成深蓝压纹、橙黄光圈封皮，保留DOM标题和日期。封壳、圆角包边、书脊、层叠纸边、接触投影独立构造；新资产与完整提示词见 [PROVENANCE](../../../../public/PROVENANCE.md)。
- 桌面开封后封面仍在纸块下面，不再display:none。开封与题材翻页使用缓入缓出，双面纸页投影随角度变化。原纸页与克隆用显式左右属性保持书沟、边框和背景一致。
- 街拍右页到纸单副本用源CSS宽高排版，再施加与原书一致的相机缩放；仅在下一叶开始转动时接管显示，纸单同步藏在下面。避免重新排版和提前遮挡。
- adapter及解释层没有修改，内页字句、内容选择、图示、详情全文保持。手机横滑、静态/减少动效、正反翻页及订阅预览保留。
- 查看关闭、开封、展开、转页、街拍及纸单代表截图，以及窄屏和减少动效。截图在 `/tmp/hikari-v09/`，不入Git。桌面1440×1000、1366×900；窄屏390×844。检查两次翻页正反30个采样点、固定纸面与六页边界；街拍副本宽高和字体与源页一致，文本相同；开封边界正反采样封面保持渲染。

## 实际命令及结果

- `pnpm typecheck`：通过；最终修改后再次通过。
- `pnpm exec eslint src/components/prototype-frontend/runtime.ts src/components/prototype-frontend/template.ts tests/e2e/prototype-frontend.spec.ts --max-warnings=0`：通过。
- `pnpm exec vitest run tests/unit/prototype-adapter.test.ts`：23/23通过。
- 浏览器均显式前缀 `HIKARI_SOURCE_MODE=fixture NODE_OPTIONS='--import=./tests/fixtures/briefing-browser-preload.mjs'`。
- `pnpm test:e2e --grep 'manual stays|printed advice|native reversible'`：首次6通过、3失败。失败为旧长文测试仍定位左页完整建议按钮，当前adapter在右页提供入口；未改产品内容，只将测试定位改为右页。
- `pnpm test:e2e --grep 'printed advice'`：纠正后3/3通过，含三题材长文详情/归焦，宽窄及减少动效。
- `pnpm test:e2e --grep 'physical handbook'`：新增回归3/3通过。视觉复核发现静止街拍页提前露出纸单，随后修复纸单显露时机并增加断言。
- 最终 `pnpm test:e2e --grep 'physical handbook|native reversible'`：6/6通过（10.6秒，0跳过），覆盖最终修复后的纸单隐藏/完整抽出、开封持续渲染、街拍尺寸和正反交接。已通过的固定纸面/长文检查未重复扩大全量。
- 工作流结构校验通过（脚本识别原12张T任务）；V09按补充卡人工核对。本地文档链接与`git diff --check`通过。

L2有界验证；未跑全量测试、全量E2E或build，没有更改打包依赖、服务器或数据契约。人工fixture/本机Chromium不代表真实设备或上游服务验证；本轮未部署、推送。保留用户`.gitignore`与两处原型`.DS_Store`改动。

## 用户截图复核：左页落地仍跳变（2026-10-24）

用户提供倾斜街拍左页和落平后截图。本次主对话复核发现：足够细的终点采样中，源页与副本已有小于1px的几何一致性，但原控制器直接把滚轮位置作为翻页角度，粗滚动越过终点会在一个输入帧删除尚倾斜的翻页。因此此前仅检查固定书本外框不足以验证动作连续。

修正仅限桌面翻叶：视觉进度按时间追随原生滚动，每帧限制翻动区间的行进幅度；阅读停留区可快速经过，两次实际翻叶均连续绘制，落平才交给静态页。显式题材按钮继续直接导航。纸单可见性随视觉落页完成，减少动效与手机横滑不进入该控制器。翻动面的Z偏移与悬空投影随角度归零，避免落地时突然消失。

新增测试直接比较两种桌面尺寸、两次翻页终点前后的纸面及全部直接子元素x/y/宽高（误差<1px），另以一次大步滚动从.929跨到.96，验证初始帧仍保留翻动页，再等待落平。既有正反60位置检查现在等待视觉进度，保留几何断言。

测试开发时：过近采样因整数滚动像素直接落在终点而找不到副本，调整采样距离；过严目标进度对比受整数像素量化影响，改与实际stage进度比较；60位置测试增加真实落页等待后超出旧30秒，改为60秒并使用16ms轮询，未放宽纸面误差要求。最终结果见本节后续记录。

最终命令：`HIKARI_SOURCE_MODE=fixture NODE_OPTIONS='--import=./tests/fixtures/briefing-browser-preload.mjs' pnpm test:e2e --project wide --grep 'turning left face|manual stays|physical handbook'`，3/3通过、0跳过、36.2秒。`pnpm typecheck`、`pnpm exec eslint src/components/prototype-frontend/runtime.ts tests/e2e/prototype-frontend.spec.ts --max-warnings=0`、`git diff --check`均通过。查看`/tmp/hikari-v09-landing/landed.png`。没有内文/adapter改动，未扩大全量测试/build或重跑不受影响的手机套件。

## 第二次用户复核：底部纸层在交接时新增（2026-10-24）

用户明确指出底部纸线跳变，街拍到订阅单正常。此前文字坐标及时间连续性检查没有覆盖装饰纸层。根因是spread上的多层box-shadow：翻动时clip-path将越过spread边界的阴影裁掉，落平恢复clip-path:none时整组纸线突然新增；开封也有同类裁切。

此次主对话将左右纸厚度独立放入book-shell的paper-stack，左侧随开封旋转，展开后始终承托各题材；桌面spread/book-block取消重复层叠阴影。运行逻辑、内页文字、街拍到纸单动作未改。窄屏/静态原有book-shell隐藏规则继续生效，原spread装饰保持。

验证命令：`HIKARI_SOURCE_MODE=fixture NODE_OPTIONS='--import=./tests/fixtures/briefing-browser-preload.mjs' pnpm test:e2e --project wide --grep 'paper thickness|turning left face|physical handbook'`：3/3、0跳过、14.6秒。新增检查要求两侧纸层独立于spreads、无裁切且持续渲染，spread无重复厚度阴影；保留两尺寸纸面落地误差<1px、大步滚动及街拍纸单尺寸回归。

逐张查看 `/tmp/hikari-v09-paper-stack/` 下cover-before/after、portrait-before/after、street-before/after六张底边截图：交接前后纸层持续存在。未扩大到全套测试/build；不重跑不受影响的手机动作，无数据/服务/API/依赖变化。

最终`pnpm typecheck`、`pnpm exec eslint src/components/prototype-frontend/template.ts tests/e2e/prototype-frontend.spec.ts --max-warnings=0`、`git diff --check`均通过。本轮未新增文档路径链接。用户既有.gitignore与两处原型.DS_Store修改保留。

## 六页页脚对齐补正（2026-10-25）

用户截图显示静态双页的左右页脚跟随正文长度，纵向位置不同。统一 `.page-number` 为相对纸页的绝对底部定位，距纸内底边 13px；页底预留 54px 防止正文重叠，小屏左右边距沿用 23px。桌面动作模式已有相同底部定位，正文、题材与翻页代码不改。

本次视觉对齐为核心，使用一次性定向浏览器几何检查；未保留新的测试用例或基础设施。显式 fixture 下，宽/窄/减少动效三项目检查静态模式全部六页页脚位置、纸边内可见、正文不重叠和无纸内滚动，最终 3/3（4.3 秒）。初次手机断言计入 1px 纸页底边框；按纸内边界扣除边框后通过。主对话查看 `/tmp/hikari-handbook-footer-aligned.png`，宽屏左右页脚水平对齐。临时验证用例已删除；最终差异检查通过，未跑全套/build，也未重复验证未改动的翻页动作。原有三项无关修改保留。

## 胶片图文一致（2026-10-25）

修正街拍胶片罐文字按题材固定为 B&W 的错误，改用同一条 `advice.film.type`：黑白类型显示 B&W，彩色负片/彩色反转片显示 COLOR。三题材共用，推荐规则与正文不改。L1：代码/差异审查、adapter 既有单元 25/25、`git diff --check` 通过；未新增测试或运行浏览器/build/全套。原有三项无关修改保留。
