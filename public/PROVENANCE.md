# 正式网页物件素材与发布门禁

2026-10-23 · T09。以下文件从独立视觉原型逐字节复制到正式应用；未修改原图。仅供本地设计评审，**公开使用许可尚未核实，发布前必须逐项确认授权或替换**。用户提供参考、无商标和生成图片均不等于已取得公开发布权。

| 正式路径 | 原型路径与来源 | 用途 |
| --- | --- | --- |
| objects/backpack-photo-v2.png | prototype/assets/backpack-photo-v2.png；原型主代理内置 imagegen 新生成，无品牌空袋，1359×1157 RGBA | 完整包体后层 |
| objects/backpack-photo-mid.png、backpack-photo-front.png | 同名原型文件；split-backpack.py 对完整包体二值 alpha 选择，保留原画布和像素 | 同画布内袋与前袋物理遮挡 |
| objects/wind-photo-v3.png | prototype/assets/wind-photo-v3.png；内置 imagegen 基于 wind-photo-v2.png 编辑，后者源自用户参考 weather-meter.webp | 开放叶轮风温湿仪外壳；空窗数据为 DOM |
| objects/solar-direction-v1.png | prototype/assets/solar-direction-v1.png；内置 imagegen 原创太阳方向器材 | 方位/高度为正式 Briefing 的天文计算，非设备朝向 |
| objects/light-meter-v2.png | prototype/assets/light-meter-v2.png；内置 imagegen 受光罩手持表插图及背景移除 | 条件性光照解释，无实测曝光数值 |
| textures/paper-texture.webp | prototype/assets/paper-texture.webp；更早源为 temp/refs/gpt-prototype/assets/paper-texture.webp，作者及授权链未知 | 纸张/背景纹理 |
| textures/riverside-film.webp | prototype/assets/riverside-film.webp；更早源为 temp/refs/gpt-prototype/assets/riverside-film.webp，作者及授权链未知 | 江岸氛围参考；不是所选地点实况或预测 |
| textures/paper-crease-v.svg、paper-crease-h.svg | 同名原型文件；原型原创 CSS/SVG 折痕 | 浅旧折痕，可供下一阶段时间轴复用 |

报刊版式、CSS/DOM气象记录卡、无链24h表盘、黄手册、胶片罐与线描，依据原型最终方案移植为生产 React/CSS。三件器材文字为安全 DOM，真实天气结论只来自正式 Briefing。没有复制原型 globals、夹具或 solar.js。字体为本机系统宋体/系统无衬线/等宽栈，无第三方 CDN 或字体下载；没有复制字体文件。

完整历史生成过程及限制：仓库 prototype/assets/PROVENANCE.md、T06-IMAGEGEN-PROMPTS.md、T06A-IMAGEGEN-PROMPTS.md。生成过程记录不替代权利核实。当前未恢复旧气压/日射/GPS素材或链条；也未调用新的 imagegen。气象来源署名与许可由页面来源说明单独呈现，素材许可不代表数据服务用途已核实。


## V09 新手册封皮（2026-10-24）

`objects/handbook-cover-v2.png`：本轮使用内置 image_gen 生成并复制到项目，无文字、品牌或商标。用户给出的旧摄影指南照片仅作为材质、配色及时代风格参考；没有直接使用参考照片像素。原始生成文件保留在Codex生成目录。深蓝封皮与橙黄光圈为图片，标题/日期为DOM；书壳/书脊/纸边/投影和翻页用CSS呈现。旧黄手册描述仅为历史。

最终生成提示词（内置工具，非CLI）：

> Create a production texture image for an original vintage photography field-guide front cover, portrait aspect 460:610. Reference inspiration: 1970s professional photography pocket manuals, dark desaturated navy blue pebbled cloth-coated card, subtle edge wear, warm ivory print, burnt orange and golden yellow camera aperture motif. This is a FLAT full-bleed cover artwork texture, straight orthographic face-on, rectangular fills entire image, no external background, no perspective, no cast shadow, no book/page edges. Top 38 percent entirely blank navy textured area for live HTML title overlay. Lower middle: large beautiful cream circular ring with six swirling orange and golden yellow aperture blades and navy outlines, printed aged ink, center near x50% y66%, circle diameter 70% width. Bottom 8 percent blank navy. Fine tactile worn paper grain, subtle rubbed edges, tasteful authentic printed imperfections, high detail, not cartoon. NO WORDS, NO LETTERS, NO logos, NO Kodak brand, no watermark. The texture will be mapped onto a 3D CSS book cover. Generate a single image.

## 产品展示素材

`showcase/` 中的 WebP 截图和 `folding.gif` 于2026-11-16从本仓库 `/showcase/demo` 的实际桌面界面采集，沿用上述物件、纹理、江岸照片及正式胶片插图的来源记录。截图经过尺寸与格式压缩。

天气画面使用 `src/content/showcase/briefing.json` 固定人工样例，由正式简报服务结合显式合成来源生成，日期为2026-11-16。`src/content/showcase/notebook.ts` 保存原创示例计划文字，参考图沿用 `textures/riverside-film.webp`。展示页直接复用正式界面的报纸、仪表、手册与计划本编辑器，演示编辑仅保留在页面会话中。
