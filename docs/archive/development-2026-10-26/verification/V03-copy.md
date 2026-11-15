# V03 界面文案清理

2026-10-23，按用户明确指令清理报纸、仪表、详情、三题材手册、订阅预览及简报生成层的重复免责措辞。直接修改源文本；无渲染过滤、计算逻辑、阈值、接口、依赖或环境变更。原型保留。

## 验收

- 用户列举的措辞及同类重复免责语句已从正式运行文本删除。来源面板的内部版本和素材发布门禁说明移出界面，权利记录仍在仓库。
- 保留预报/天文计算/摄影建议分类、来源/署名、时间/单位、EPA口径、分辨率与插值信息，以及实际风险、缺失/过期/分歧、人工数据和订阅预览标记。
- 主agent审查源码diff和宽屏手册、窄屏报纸截图；39项浏览器检查覆盖宽/窄/减少动效、详情焦点、小时/题材、订阅预览及异常状态。浏览器截图在 /tmp/hikari-v02-recovery/（继承测试输出位置），不入Git。

## 实际命令及结果

- `pnpm typecheck`：exit0。
- `pnpm lint`：worker和主agent均exit0。
- `pnpm test`：最终worker和主agent均391/391，12文件，exit0。
- `HIKARI_SOURCE_MODE=fixture NODE_OPTIONS='--import=./tests/fixtures/briefing-browser-preload.mjs' pnpm test:e2e`：最终39/39，0跳过，exit0。
- `pnpm build`：exit0。
- `curl -s -o /tmp/hikari-v03-preview.html -w '%{http_code}' 'http://localhost:3000/?genre=landscape&place=geonames%3A1796236'`：200，默认live开发服务保持运行。
- workflow validator及`git diff --check`：exit0。

首次单元测试5项仍断言已删除的太阳遮挡措辞；首次浏览器33/39，6项为旧订阅断言及对已评估晚霞样例误断言未知状态。更正为计算依据、预览单和日落目标的有效信息断言后复跑全部通过。

配置worker：spec-worker-sol-medium / gpt-6.1-sol / medium；可观察runtime model/thinking metadata未提供。主agent独立验收；无push/deploy。人工浏览器样例只验证界面及交互，不新增外部服务验证。本次未执行T12。
