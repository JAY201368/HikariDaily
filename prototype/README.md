# 逐光日刊 · 视觉原型参考

视觉原型阶段已完成。本目录保留可运行设计、固定夹具、素材与历史证据，供正式网页实现对照。

固定上海城市参考点、2026-10-21、北京时间；天气和空气为手工演示数据，太阳角度为本地固定日期计算。没有真实天气、定位、后端或订阅发送。

## 打开与操作

浏览器直接打开[index.html](index.html)，无需安装、构建或联网；转发时保留整个`prototype/`目录。或在仓库根目录运行：

```sh
python3 -m http.server 8765 --bind 127.0.0.1 --directory prototype
```

访问`http://localhost:8765`，按Ctrl-C结束。

- 顶部导航可直达报纸、仪表、手册、订阅单；滚动连续折报入袋、提表、抽册翻页，最后翻额外一页发现完整纸单。反向滚动可回看。
- 无链24小时表盘可点选／拖针；方向键、Home／End及前后小时按钮选择00–23整点。小时变化同步仪表、摘要与详情，全天建议不随之重写。
- 点击整件器材或键盘进入详情，Escape关闭并返回焦点。可演示缺失、旧数据和来源分歧。
- 手机手册原生横滑切题材，页面保持纵读。静态阅读及系统减少动态按顺序展示完整内容。
- 订阅单只接受07:00／12:00，填写、调整、停止均为不发送的界面预览。

## 可选检查

从仓库根目录执行，无第三方依赖的检查：

```sh
for f in prototype/*.js prototype/*.cjs; do node --check "$f" || exit; done
node prototype/check-local.cjs
TZ=UTC node prototype/check-solar.cjs
TZ=Asia/Shanghai node prototype/check-solar.cjs
```

浏览器检查另外需要已安装的Playwright及Chromium／Chrome；浏览原型不需要这些工具。可指定`PLAYWRIGHT_MODULE`与`CHROME_PATH`本地路径。始终使用新的`REVIEW_DIR`，避免覆盖历史证据，套件串行执行：

```sh
REVIEW_DIR=/tmp/hikari-review-new/browser node prototype/check-browser.cjs
REVIEW_DIR=/tmp/hikari-review-new/objects node prototype/check-objects.cjs
REVIEW_DIR=/tmp/hikari-review-new/watch node prototype/check-watch.cjs
REVIEW_DIR=/tmp/hikari-review-new/folds node prototype/check-folds.cjs
REVIEW_DIR=/tmp/hikari-review-new/slip node prototype/check-slip.cjs
```

缺工具或未运行不算通过；固定夹具与浏览器模拟不验证生产服务、真实设备或气象准确率。历史截图与过程检查记录未纳入 GitHub 发布快照。

## 设计、素材与历史

- [最终视觉基线](../docs/DESIGN_REFERENCE.md)：当前采用的物件映射与动作。
- [素材出处和许可边界](assets/PROVENANCE.md)：所有历史素材保留，公开使用权尚未核实。
- [开发过程档案](../docs/archive/visual-prototype/README.md)：旧任务、决策与分镜。
- [完整历史操作指南](../docs/archive/visual-prototype/PROTOTYPE_GUIDE.md)：逐次几何、精确时间轴与旧检查记录。

正式应用应建立独立数据模型与服务端流程，不能将本目录固定夹具当作真实数据回退。
