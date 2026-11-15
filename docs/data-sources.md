# 数据来源与适配边界

按服务主题查看当前能力、字段及实际接通状态，见[后端数据能力清单](BACKEND_DATA_CATALOG.md)。本文保留适配器与缓存的详细技术约定。

## 地点：Open-Meteo Geocoding / GeoNames

地点服务仅在服务器使用固定 HTTPS 主机 `geocoding-api.open-meteo.com` 的 `/v1/search` 和 `/v1/get`。搜索固定 `language=zh`、`countryCode=CN`、`count=10`、JSON；按 ID 解析使用 `geonames:<positive integer>`，请求 `/v1/get?id=…&language=zh`。重定向被拒绝，单次超时 4 秒，无立即重试。用户不能配置主机、坐标、日期、字段或绕开缓存。

公开接口为 `GET /api/locations?q=…`：去首尾空白后 2–40 个 Unicode 字符；仅接受单个 q，拒绝额外参数。返回 `{data: Location[], error:null}`，最多 10 个；无结果是 200 空数组。400 `INVALID_LOCATION`、404 `LOCATION_NOT_FOUND`、503 `LOCATION_UNAVAILABLE` 统一为 `{data:null,error:{code,message}}`。404 由服务器 `resolveLocation` 供 SSR/BriefingService 使用，不另设公开 ID 解析路由。异常内容和上游 reason 不透传。

### 服务范围与粒度

服务端二次检查 `country_code=CN`、GeoNames 官方省级表中的 31 个大陆行政 ID，以及 `Asia/Shanghai` / `Asia/Urumqi` 来源时区；产品输出统一北京时间。香港、澳门、台湾及未知省级行政 ID 不接纳。省级名单来源：[GeoNames admin1CodesASCII](https://download.geonames.org/export/dump/admin1CodesASCII.txt)，2026-10-23 实际读取核对。

分类为显式保守白名单，依据 [GeoNames feature codes](https://www.geonames.org/export/codes.html)：PPLC/PPLA/PPLA2/ADM2 → city，PPLA3/ADM3 → district（后者包含区、县及县级市，如五常，不代表所有同级名称都叫“区”）。district 额外要求 admin2 城市上下文。PPL、PPLA4、ADM4、ADMD、村落、历史及未知分类均过滤；不以人口、名称后缀猜测行政级别，也不猜坐标。去重后的行政路径保留省、市和区域文本；同名结果按不同 ID 保留供用户辨认。上游中文翻译缺失时可能保留原名，不能宣称全国行政中文覆盖。

区县无结果时，请搜索并选择所属城市；城市级地点不代表区县精确天气。该说明以 `LOCATION_FALLBACK_NOTE` 导出供界面使用，不会自动替用户选城市。地点粒度与气象网格分辨率分别表达，地点坐标不是气象站实况。

### 缓存和署名

搜索与解析使用 Next 共享 Data Cache，键含适配器版本、操作、语言、国家及实际查询/ID，搜索另含固定数量。重验证 24 小时；缓存保存原始 fetchedAt 毫秒，不因复用改写。业务层拒绝年龄达到 24 小时或异常时间的旧条目，避免 Next 重验证失败无限延长旧值；首次过期请求可能得到 503，后台刷新后可恢复。上游失败不作为成功值缓存。未使用进程内 Map 冒充共享缓存；本机测试不证明生产跨实例缓存和配额保证，发布前仍需验证平台行为。

[Open-Meteo Geocoding 文档](https://open-meteo.com/en/docs/geocoding-api)注明地点数据来自 **GeoNames**。保留 [GeoNames 署名](https://www.geonames.org/)及 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) 链接；`LOCATION_ATTRIBUTION` 供来源 UI 使用。[GeoNames 使用说明](https://www.geonames.org/export/)和 [Open-Meteo 条款](https://open-meteo.com/en/terms)需在公开发布时再次核对。数据许可与免费托管服务的非商业用途/额度条件分别适用，本次接入不证明项目用途获准。

### 验证限制

契约测试为人工合成，验证映射、过滤、缓存时限与错误处理，不验证气象准确率或全国覆盖。2026-10-23 独立真实检查结果见 [T03 证据](archive/development-2026-10-26/verification/T03.md)：海淀、五个城市、五常、朝阳和不存在区县；仅代表当前机器通过临时代理可达。没有真实大陆终端、部署缓存或许可审批证据。

## 天气与空气质量

本节为已实现的服务端内部适配接口，由 BriefingService 接入网页与公开 API。适配器不读取 prototype fixture、不做共享缓存或调度；源加载层见下文。本地测试样例均为人工合成，历史三源真实检查见 T11 记录。三种逐时天气／空气快照的固定 ID／版本如下；晚霞使用下文独立ECMWF空间字段。服务商、数据集和模型分别保存，不能把两个 Open-Meteo 接口称为两个独立天气模型。

| 模块导出 | source.id / adapterVersion | 模型与固定端点 |
| --- | --- | --- |
| `fetchGfs` / `parseGfs` | `open-meteo-gfs` / `gfs-v1` | `gfs_seamless`；`https://api.open-meteo.com/v1/forecast` |
| `fetchMet` / `parseMet` | `met-norway` / `met-complete-v1` | Locationforecast complete，全球 ECMWF 经 MET 处理；`https://api.met.no/weatherapi/locationforecast/2.0/complete` |
| `fetchCams` / `parseCams` | `open-meteo-cams` / `cams-global-v1` | `cams_global`；`https://air-quality-api.open-meteo.com/v1/air-quality` |

### 内部源接口

`src/domain/normalization/snapshot.ts` 导出 `SourceSnapshotSchema`、推导类型 `SourceSnapshot` / `SourceHour` / `SourceTarget`、`SOURCE_IDS` / `ADAPTER_VERSIONS`。源快照是内部契约，与公开 Briefing 分开。

```ts
type SourceTarget = {
  locationId: string; localDate: string; latitude: number; longitude: number;
};
// 实际 TS 类型由 Zod 推导；以下为形状说明。
type SourceSnapshot = {
  source: Source; adapterVersion: string; target: SourceTarget;
  grid: { latitude: number; longitude: number } | null;
  hours: { start: string; end: string; weather: Weather; air: Air }[]; // 严格24格
  semantics: Record<string, {
    upstreamField: string; unit: string;
    timing: "instant" | "preceding-hour" | "following-hour"; notes: string[];
  }>;
  notes: string[];
};
```

`weather` / `air` 复用公开字段及 `Metric`。标准单位不改变：温度°C、湿度/云/概率%、风m/s、来向北0°顺时针、降水mm、能见度m、污染物μg/m³、指数US_EPA；`semantics.unit` 保留上游原单位字符串（如 MET `celsius`，CAMS `USAQI`）。`grid` 单独保存实际网格坐标；不能把地点 ID 精度等同于气象网格或站点观测。

三个 `fetch*` 接受已由服务端地点解析得到的 `SourceTarget` 和可选 `{fetcher,clock,signal}`，不从客户端收任意URL。MET 另收 `{userAgent,ifModifiedSince}`。`clock` 只在成功读完响应时生成实际 `fetchedAt`；`parse*(body,target,fetchedAt)` 可单独运行纯响应校验映射。源失败或禁用时保留24格且值均null、fetchedAt=null。Open-Meteo 未提供模型发布时间，issuedAt=null；MET仅使用 `meta.updated_at`，不以获取时间冒充发布时间。

返回 `ProviderResult`（定义于 `src/server/providers/shared/values.ts`）：

- `{kind:"snapshot",snapshot,http}`：已完成 Zod 结构和字段校验。
- `{kind:"not-modified",http}`：304，不产生新快照、不刷新 fetchedAt。源加载层结合原缓存处理；没有原缓存不能当作成功数据。
- `{kind:"unavailable",snapshot,http,code}`：稳定原因代码与 failed/disabled 来源。异常栈和上游 reason 不透传。

`http={status,expires,lastModified,retryAfter}`，全部可null，原始头供 源加载层按时钟解释。源模块不重试、不睡眠、不维护 Map 缓存；源加载层负责 Expires 等待、If-Modified-Since／304、Retry-After、共享缓存、过期≤3h和覆盖范围检查。`normalizeSources` 接受的 stale 已经过上述可用性判断，不能独自承担缓存寿命验证。版本、模型、字段集合、目标日期、时区、四位小数请求坐标均用于构建缓存键。坐标截断至最多四位小数。

所有源通过 `shared/http.ts` 的固定端点枚举请求；HTTPS、拒绝重定向、`cache:no-store`、单次4秒 AbortController 预算覆盖响应体，调用者 signal 可取消；JSON/网络/超时/HTTP错误分别稳定编码。上游JSON不记录到日志，MET联系方式不返回公开元数据。该层不开放代理路由。

### 小时语义与校验

[Forecast 官方字段文档](https://open-meteo.com/en/docs)于2026-10-23核对：`temperature_2m`、`relative_humidity_2m`、`weather_code`、`wind_speed_10m`、`wind_direction_10m`、总云和低/中/高云、`visibility` 均按小时起点读取；`precipitation`、`precipitation_probability`、`wind_gusts_10m` 是此前一小时的累计／概率／最大值。请求固定北京时间、unixtime（UTC秒）、两天、m/s、GFS；按绝对epoch匹配，后三字段使用下一时间戳。当天23时仅读取次日00补完整区间，次日其他小时不进入结果。缺下一整点则保留null，不借邻小时补值。

响应坐标、时区/offset、时间单位和严格递增整点轴先校验；字段数组长度不一致则该字段全日缺失，绝不截断或按错位数组拼接。缺单位／未知单位、数值字符串、非有限数、负降水/风/能见度/污染物、百分比超0–100、未知天气码均null并附原因。温度采用−100至70°C防错范围；风向360归北0，超0–360缺失。无依据的上限不用于过滤强风、降水或AQI危险值。

[MET 数据模型](https://docs.api.met.no/doc/locationforecast/datamodel.html)和[JSON格式](https://docs.api.met.no/doc/ForecastJSON.html)于2026-10-23核对：瞬时温湿风云从 `instant.details` 读；本小时累计仅用 `next_1_hours.details.precipitation_amount`。没有 next_1_hours 时缺失，不拆 next_6_hours。全球文档未承诺概率/阵风/能见度，本适配器这些能力保持缺失；真实大陆覆盖尚未实测。MET低/中/高云仅作为该源独立输入保留。

天气符号依据 [MET 官方符号库](https://github.com/metno/weathericons)显式映射：晴0、少云1、局部云2、阴3、雾45；雨61/63/65、阵雨80/81/82、雪71/73/75、雪阵雨85/86，雷暴家族95。合法时段后缀仅移除 day/night/polartwilight；未知符号为missing。MET非原生WMO数据，此为近似分类并带说明，不能据此增加精度。已知 sleet（雨夹雪）在既有公开WMO集合中没有等价类型，保留缺失和原因，避免错标为冻雨。

[Air Quality 官方文档](https://open-meteo.com/en/docs/air-quality-api)于2026-10-23核对 `pm2_5` / `pm10` / `us_aqi`，CAMS global约45km、原生3小时；保存“模型小时序列，含插值”说明。参考AQI明确US_EPA；指数可能超过500，不做500封顶。不从指数推浓度或能见度，不把单小时PM值套中国AQI，不把API小时输出称为原生小时观测。

### 合并与风险边界

`normalizeSources(target,snapshots)` 是纯函数，拒绝目标地点/日期/坐标不一致及重复source ID，输出 `NormalizedDay={target,sources,hours}`。24格按epoch取源；源failed/disabled无贡献。主源有效优先，不求平均。主源缺字段仅以 MET 实际提供的兼容字段回退，notes标明回退和原缺失；备用无阵风、概率、能见度时不补。分层云在合并主值中保持主源；MET层云仍可通过riskInputs独立读取。专用晚霞空间源不进入本归一化，也不与GFS／MET层云拼接。

严格使用spec阈值：温差≥5°C、平均风差≥4m/s、总云差≥30个百分点，或一源降水≥1mm另一源≤0.1mm。达到阈值保留主值、`alternatives`和分歧说明，不把不同高度定义的层云互判冲突。状态遵循missing/stale/conflict/ok；参与比较源为stale时分歧仍写notes。

每小时额外保留 `riskInputs: {source,weather,air}[]`（每个可用源各一份），供摄影规则**先逐源判风险**，不能只看合并主值；备用源雷暴/强风/强雨不得被正常主值覆盖。`primaryWeather`保留GFS原字段及state，晚霞只读取其总云／降水参与分歧限级，不使用其层云或能见度替代IFS空间输入。总云/降水既有多源分歧也供晚霞限级；适配器本身不生成摄影结论或风险文案。

### 身份、许可和当前限制

MET无真实可联系项目标识则 `MET_IDENTITY_REQUIRED` / disabled，不发请求。`validMetUserAgent` 仅做语法/常见placeholder拒绝，不能验证联系方式真实归属；部署者须提供并核实真实身份。测试中的 `.invalid` 联系方式仅用于注入的mock fetch，永不发送到真实端点。适配器不读取或写入环境配置，不伪造MET身份。

[MET条款](https://api.met.no/doc/TermsOfService)及[许可](https://api.met.no/doc/License)于2026-10-23核对：识别项目和联系入口、遵守Expires、条件请求、四位小数坐标及署名；数据一般为NLOD2.0 / CC BY4.0，需保留“Data from MET Norway”、源和许可链接。文档查阅不证明本项目身份/用途已获核实。[Open-Meteo条款](https://open-meteo.com/en/terms)的免费非商业与服务额度条件仍独立于数据许可，公开部署前重新检查；CAMS需同时署名 Copernicus CAMS 和 Open-Meteo，保留[数据许可](https://open-meteo.com/en/licence)链接。不能因本地可访问或fixture通过宣称全国覆盖、准确度、用途许可或部署配额通过。

2026-10-23核对的Forecast表包含97（强雷暴），当前schema支持它，风险集合为95/96/97/99；其他未知码仍missing。MET映射依据上文官方数据模型和符号库，曾失效的文档页不作为字段证据。独立live脚本及结果见 [T04证据](archive/development-2026-10-26/verification/T04.md)。

## 正式晚霞空间云场

独立适配器[sunset-ecmwf](../src/server/providers/sunset-ecmwf/index.ts)通过固定 `https://api.open-meteo.com/v1/forecast` 请求 `models=ecmwf_ifs`，来源ID为 `open-meteo-ecmwf-sunset`；使用ECMWF IFS HRES全球9km网格，前90小时原生逐小时，模型每6小时更新。它无需密钥，与普通GFS逐时天气并行加载。

空间契约与规划位于[sunset-input.ts](../src/domain/photography/sunset-input.ts)，模型版本为 `ecmwf-spatial-2026-10`。SunCalc计算当天实际日落方位，沿该方位及左右25°各采样25、75、150、250、400km，加入本地共16点，采用大圆目的地与四位小数请求坐标。一次多地点请求显式指定 `cell_selection=nearest`、北京时间、unixtime及目标日和次日。请求 `cloud_cover`、`cloud_cover_low/mid/high`、`visibility`、`precipitation`、`relative_humidity_2m`。

返回值保存每个请求点、实际网格和当天24个整点；逐项检查地点编号（首项可省略0）、地点数量、网格距请求点≤20km、时区、时间轴、单位和数组长度。时间错位或地点错配拒绝整个响应；坏字段及非法值保留null。降水读取下一整点的前一小时累计，含次日00时补足23–24时。上游没有提供模型发布时间，`issuedAt=null`；有效范围取各点实际时间轴的交集，`fetchedAt`只记真实获取时刻。

正式[晚霞模型](../src/domain/photography/sunset.ts)比较日落前后半小时五个时刻的球面受光与观察遮挡，使用同一IFS的完整分层云场及本地能见度／降水。GFS总云／降水只作分歧限级，不混合层云。云量遮挡与1.5／5／10km代表云高是工程近似；没有地形、建筑、精细云缝或独立的现场准确率保证。空间源缺失时机会为unknown，不回退旧GFS公式；五级不表示概率。精确契约见[规格6.4](../spec.md#64-晚霞火烧云五级机会)。

专用[SunsetSourceStore](../src/server/cache/sunset-store.ts)保存原始云场、HTTP元数据与冷却时间；[加载器](../src/server/source-loader/sunset.ts)正常1小时重验证、失败冷却15分钟，遵守更长的429 Retry-After。原始获取年龄≤3小时且覆盖目标日才可复用失败后的旧值，并标stale；缓存命中不改写获取时间。Vercel适配与逐时源共用项目命名空间，以专用key和记录schema隔离；关闭／失败／过期均有结构化来源状态。

按[Open-Meteo条款](https://open-meteo.com/en/terms)，免费托管API只限非商业用途，当前限额为每日少于10,000次、每小时5,000次、每分钟600次。16点请求按16个地点计量，不等于一次额度；没有共享缓存时每次简报仍可能重新请求并显式标降级，不具备跨实例复用或硬限流保证。保留Open-Meteo／ECMWF与[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)署名；数据许可与免费托管服务的用途、配额条件分别适用。[ECMWF API文档](https://open-meteo.com/en/docs/ecmwf-api)说明实际模型、分辨率及更新时效。

## 源缓存与受控加载

服务端入口 `src/server/source-loader/index.ts` 导出 `loadSources(target: SourceTarget)`，由 BriefingService 调用。返回 `{ snapshots: SourceSnapshot[], sunset: SunsetCloudField, mode: 'live'|'fixture', cacheStatus: 'shared-configured'|'degraded'|'unused', warnings: string[] }`；逐时快照顺序固定为 GFS / MET / CAMS，晚霞云场独立保存。组装简报时保留 warnings、演示标签和各源 disabled/failed/stale 信息，晚霞来源加入统一出处及整体数据状态，不能把 `shared-configured` 描述为已经实测共享。快照目标还原为调用者的准确解析坐标，源请求及键仅用最多四位小数；同一网格缓存复用不改变地点语境。没有公开 cache-bypass 参数，不生成或缓存摄影规则结果、Briefing 或整页。

`src/server/cache/source-store.ts` 定义可替换的 `SharedSourceStore.get/set` 和严格 Zod `SourceRecordSchema`。记录包含原快照、HTTP 元数据、checkedAt、nextAllowedAt、稳定 lastError。缓存键为 SHA-256 摘要，原键包含缓存/schema版本、适配器版本、来源/模型、地点ID、四位坐标、目标日期、排序变量集合、Asia/Shanghai；原始坐标和联系信息不进入缓存 key 或应用日志。PostgreSQL适配器把逐时和晚霞记录分别按key存入迁移013创建的 `source_cache_entries` 表。Vercel适配器只调用官方 `@vercel/functions@3.10.3` 的 `getCache({ namespace, keyHashFunction })`、get 和 set，set 使用空观测 name；命名空间隔离项目、preview/production、源缓存版本。地点使用 Next Data Cache。

冷缓存四路并行，单源上游最多 4 秒（向适配器传递取消信号），聚合含缓存读写最多 6 秒。超时不等待不响应取消的注入 promise，也不在其迟到完成后启动下一次请求/写入；已发出的平台写入无法用该 SDK 的公开 API 撤回。每次网页请求没有立即重试。部分成功保留，失败源为 null 字段或空空间云场。缓存命中从不改 fetchedAt/issuedAt；逐时源正常15分钟后重验证，晚霞为1小时。MET 的更晚 Expires 会推迟请求，Last-Modified 原样进入下一次 If-Modified-Since；304 只更新检查时间/允许下次请求时间，仍保留原下载 fetchedAt。

每次返回均重新检查原始 fetchedAt，未来时间/年龄超过 3 小时拒绝使用。失败后仅允许年龄 **≤3 小时且 validFrom/validTo 包住目标日**的旧快照；标 source.status=stale、所有有效 metric.state=stale。覆盖不足或超限则所有字段 missing，不会因物理缓存还在、304 或长冷却而无限续命。新鲜的部分源仍保留部分字段；不得把不完整源包装为完整简报。`issuedAt` 未知仍 null。物理 TTL 至少保留 3 小时或更长的 Expires/Retry-After 元数据，不等于业务可用时长，也不保证条目不会被提前驱逐。

429 的整数秒或 HTTP-date Retry-After 写入 nextAllowedAt，至少等待正常 15 分钟失败冷却（上游要求更久则等待更久）；失效前不请求，过期仅下一次调用尝试，不主动排队或 Cron。429 保留旧成功 entity 的验证头与快照；冷却可长于快照的 3 小时预算，届时返回 missing 但继续遵守冷却。非法/已过去的 Retry-After 使用正常冷却。

### 明确降级、SDK 前提与配额门禁

未配置缓存存储、缓存读异常或记录 schema/目标异常时，GFS/CAMS及晚霞ECMWF空间源可直接获取并返回 `cacheStatus=degraded`、warnings和源说明；MET fail closed 为 disabled，避免在不知道 Expires/验证头时请求。写异常保留本次成功取得的数据，同时警告后续共享复用/冷却无法保证；本次不立即重试缓存。应用日志严格只有 requestId、duration、sourceStatus、errorCode，不输出异常、响应内容、坐标或联系方式。

Vercel平台适配默认关闭。必须同时具备 `HIKARI_SOURCE_CACHE=vercel`、正式 Vercel 项目/preview 或 production 环境，以及部署者在**真实跨实例验证后**设置 `HIKARI_SHARED_CACHE_VERIFIED=true`，才创建 SDK 客户端。此开关是运维声明，不能探测实际后端。SDK 缺运行上下文时可能退回内存，部分错误会吞掉/自行日志；公开 API 无法完全探测这些行为。不能凭环境变量、mock 测试或本机内存往返认定Vercel共享已通过。配置 `postgres` 使用 `HIKARI_DATABASE_URL` 中的数据库，不设置 Vercel运维声明；数据库必须先应用迁移013。两种适配器都通过 get/fetch/set 管理单个键，没有跨取数原子锁；并发冷启动可能重复请求，TTL与冷却不是全局硬限流。Vercel SDK风险、内部日志、真实缓存区域/驱逐与计费验证仍阻断Vercel发布；没有证据时保持 Vercel 开关关闭。

Runtime Cache 是区域性临时缓存，可提前驱逐；Hobby 存储可能团队共享，已加项目命名空间，但不提供原子锁/全局限流。并发冷请求、并发覆盖写、跨区域、驱逐后丢失 Retry-After 均可能增加上游调用；不能把 get/set 或本地开发请求合并当作跨实例硬配额。公开部署前必须独立验证流量控制、额度、套餐/预算；仓库历史记录不含真实 Vercel 缓存验收；配置不会自动开通服务。迁移平台仅替换 SharedSourceStore 适配器。

fixture 只通过 `HIKARI_SOURCE_MODE=fixture` 显式选择，production 一律抛 `PRODUCTION_FIXTURE_FORBIDDEN`。独立人工阴天样例不读取 prototype；每个源、有效字段和返回 warnings 均标注演示，不声明真实预报/观测。live 失败绝不触发 fixture。配置和历史验证结果分别见 [开发说明](DEVELOPMENT.md)与 [T05证据](archive/development-2026-10-26/verification/T05.md)。
