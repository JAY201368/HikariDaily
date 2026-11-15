import type { Briefing, Genre, Metric, RecommendedWindow } from "../../domain/types";
import { AIR_UNITS, WEATHER_UNITS } from "../../domain/schemas";
import { shanghaiIso, windowStatus } from "../../domain/time";
import styles from "./readable.module.css";
import { HourStrip } from "../briefing-client/hour-strip";
import interactive from "../briefing-client/interactive.module.css";

const genres = { landscape: "风光", portrait: "人像", street: "街拍" } as const;
const states = { ready: "数据可用", partial: "部分数据可用", stale: "使用允许范围内的旧数据", unavailable: "气象数据不可用" };
const metricStates = { ok: "有效", missing: "缺失", stale: "旧数据", conflict: "来源分歧" };
const names = { temperature: "温度", humidity: "湿度", weatherCode: "天气代码", precipitation: "小时降水",
  precipitationProbability: "降水概率", windSpeed: "平均风", windGust: "小时最大阵风", windFrom: "风向（来向）",
  cloudTotal: "总云量", cloudLow: "低云量", cloudMid: "中云量", cloudHigh: "高云量", visibility: "能见度",
  pm25: "PM2.5", pm10: "PM10", referenceAqi: "参考 AQI（美国 EPA 口径）" };
export function time(instant: string | null) { return instant ? shanghaiIso(instant).slice(11, 16) : "暂无数据"; }
export function stamp(instant: string | null) { return instant ? `${shanghaiIso(instant).slice(0, 19).replace("T", " ")} 北京时间` : "未知 / 未提供"; }
export function range(value: { start: string; end: string }) { return `${time(value.start)}–${time(value.end)}${shanghaiIso(value.end).slice(11, 16) === "00:00" ? "（次日）" : ""}`; }
export function Notes({ items }: { items: string[] }) {
  return items.length > 0 ? <ul>{items.map((item, i) => <li key={`${i}-${item}`}>{item}</li>)}</ul> : null;
}
export function MetricValue({ name, metric, unit }: { name: string; metric: Metric<number>; unit: string }) {
  return <div className={styles.metric}><dt>{name}</dt><dd>{metric.value === null ? "暂无数据" : `${metric.value} ${unit}`} · {metricStates[metric.state]}
    {metric.sourceIds.length > 0 && <span> · 来源 {metric.sourceIds.join("、")}</span>}
    <Notes items={metric.notes} />
    {metric.alternatives?.map((alternative) => <p key={alternative.sourceId}>对比来源 {alternative.sourceId}：{alternative.value} {unit}</p>)}
  </dd></div>;
}
export function Windows({ windows }: { windows: RecommendedWindow[] }) {
  return windows.length > 0 ? <ul>{windows.map((window) => <li key={`${window.start}-${window.end}`}>
    <strong>{range(window)} · {{ past: "已过", current: "进行中", future: "将来" }[window.status]}</strong>
    <Notes items={window.reasons} /><Notes items={window.limitations} />
    <p>依据来源：{window.sourceIds.join("、") || "暂无气象依据"}</p>
  </li>)}</ul> : <p>没有符合条件的窗口；请阅读限制与替代方向。</p>;
}
export function ReadableBriefing({ briefing: b, genre = "landscape", selectedHour, onSelectHour, onSelectGenre }: { briefing: Briefing; genre?: Genre; selectedHour?: number | null; onSelectHour?: (hour: number) => void; onSelectGenre?: (genre: Genre) => void }) {
  const fixture = b.warnings.some((warning) => warning.includes("演示数据"));
  return <article className={styles.briefing}>
    {fixture && <p className={styles.notice} role="note">演示数据：人工合成，非真实预报或观测，不用于判断当前天气。</p>}
    <section aria-labelledby="overview-heading">
      <h2 id="overview-heading">当天概览</h2>
      <p><strong>{b.location.name}</strong> · {b.location.administrativePath.join(" / ")}</p>
      <p>{b.location.granularity === "city" ? "城市级地点，天气代表模型格网，不能视为区县精确天气。" : "区县级地点选择，天气仍代表模型格网，非当地站点实测。"}</p>
      <p>{b.localDate} · Asia/Shanghai · 00:00–次日00:00</p>
      <p>简报状态：<strong>{states[b.state]}</strong> · 生成时间：{stamp(b.generatedAt)}</p>
      <p>{b.summary.headline}</p>
      <h3>主要变化</h3><Notes items={b.summary.changes} />
      <h3>机会与限制</h3><Notes items={b.summary.opportunities} /><Notes items={b.summary.limitations} />
    </section>
    <section aria-labelledby="hours-heading">
      <h2 id="hours-heading">24 小时天气与光照</h2>
      <p>天气与空气为模型预报，已过时段也不是实况。瞬时气象值参考小时起点，降水及阵风对应所示小时区间。光照解释及太阳角度参考每小时中点（:30），并非整点角度。</p>
      <p>能见度与空气质量分别展示；不从 AQI 推算能见度或污染物浓度。参考 AQI 为 US_EPA（美国 EPA 口径），非中国官方 AQI。CAMS 全球约45 km网格、原生3小时，模型小时序列含插值，非区县实测。</p>
      {onSelectHour && <HourStrip selected={selectedHour ?? null} onSelect={onSelectHour} />}
      {b.hours.map((hour, index) => (!onSelectHour || selectedHour === index) && <section key={hour.start} className={styles.hour} aria-labelledby={`hour-${index}`}>
        <h3 id={`hour-${index}`}>{range(hour)} · {{ past: "已过", current: "当前小时", future: "随后预报" }[windowStatus(hour.start, hour.end, b.generatedAt)]}</h3>
        <p>{hour.light.description}</p>
        <p>太阳计算参考 {String(index).padStart(2, "0")}:30：高度 {hour.light.altitude?.toFixed(1) ?? "未知"}°，方位 {hour.light.azimuth?.toFixed(1) ?? "未知"}°（北0°顺时针，非设备朝向）。</p>
        <Notes items={hour.risks.map((risk) => risk.message)} />
        <details><summary>天气、空气与推断依据</summary>
          <dl>{Object.entries(hour.weather).map(([key, metric]) => <MetricValue key={key} name={names[key as keyof typeof names]} metric={metric} unit={WEATHER_UNITS[key as keyof typeof WEATHER_UNITS]} />)}
            {Object.entries(hour.air).map(([key, metric]) => <MetricValue key={key} name={names[key as keyof typeof names]} metric={metric} unit={AIR_UNITS[key as keyof typeof AIR_UNITS]} />)}</dl>
          <Notes items={hour.light.reasons} /><Notes items={hour.light.limitations} />
          <p>光照依据来源：{hour.light.sourceIds.join("、") || "仅太阳计算 / 气象依据不足"}</p>
          {hour.risks.map((risk) => <p key={`${risk.code}-${risk.start}`}>风险时段 {range(risk)} · 来源 {risk.sourceIds.join("、")}。模型风险提示，非官方预警。</p>)}
        </details>
      </section>)}
    </section>
    <section aria-labelledby="solar-heading"><h2 id="solar-heading">太阳时段 · 天文计算</h2>
      <p>日出 {time(b.solar.sunrise)} · 日落 {time(b.solar.sunset)}</p>
      <dl>{([['morningBlue', '早晨蓝调'], ['morningGolden', '早晨金调'], ['eveningGolden', '傍晚金调'], ['eveningBlue', '傍晚蓝调']] as const).map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{b.solar[key] ? range(b.solar[key]) : "暂无数据 / 不适用"}</dd></div>)}</dl>
      <p>本产品蓝调采用太阳高度 −6°至−4°，金调采用−4°至+6°；事件存在不保证实际天气光效。</p><Notes items={b.solar.notes} />
    </section>
    <section aria-labelledby="sunset-heading"><h2 id="sunset-heading">晚霞 / 火烧云机会 · 启发式推断</h2>
      <p>{b.sunsetOpportunity.label}{b.sunsetOpportunity.level !== null ? `（${b.sunsetOpportunity.level}/5级）` : "（无法判断，独立于最低等级）"}</p>
      <p>目标日落时刻：{time(b.sunsetOpportunity.targetTime)} · 依据完备性：{b.sunsetOpportunity.confidence === "medium" ? "中" : b.sunsetOpportunity.confidence === "low" ? "低" : "未知"}，非统计概率。</p>
      <p>五级依次为：很低、偏低、一般、较高、很高；高等级也不保证发生。</p>
      <Notes items={b.sunsetOpportunity.reasons} /><Notes items={b.sunsetOpportunity.limitations} />
      <p>依据来源：{b.sunsetOpportunity.sourceIds.join("、") || "必要气象依据不足"}</p>
    </section>
    <section aria-labelledby="advice-heading"><h2 id="advice-heading">三题材摄影建议</h2><p>当前题材：{genres[genre]}。三类建议均来自同一简报，切换题材不重新计算。</p>
      {onSelectGenre && <nav aria-label="摄影题材" className={interactive.genreNav}>{(Object.keys(genres) as Genre[]).map((key) => <button type="button" key={key} aria-pressed={key === genre} onClick={() => onSelectGenre(key)}>{genres[key]}</button>)}</nav>}
      {(Object.keys(genres) as Genre[]).filter((key) => !onSelectGenre || key === genre).map((key) => { const advice = b.advice[key]; return <section key={key} aria-labelledby={`advice-${key}`}>
        <h3 id={`advice-${key}`}>{genres[key]}</h3><p>{advice.timing}</p><p>{advice.light}</p>
        <h4>尚未结束的主推荐</h4><Windows windows={advice.recommendedWindows} />
        <details><summary>全天窗口（含已过时段）</summary><Windows windows={advice.allWindows} /></details>
        <h4>画面机会</h4><Notes items={advice.opportunities} /><h4>限制与替代</h4><Notes items={advice.limitations} /><Notes items={advice.alternatives} />
        <h4>胶片氛围参考</h4><p>{advice.film.type} · {advice.film.sensitivity}：{advice.film.reason}</p><p>{advice.film.caveat}</p>
      </section>; })}
    </section>
    <section aria-labelledby="sources-heading"><h2 id="sources-heading">来源、更新时间与缺失说明</h2>
      <p>天气和空气是模型预报；太阳事件与角度是天文计算；光照解释、窗口和晚霞机会是规则推断，均非站点实况。</p>
      <p>参考 AQI：US_EPA（美国 EPA 口径），非中国官方 AQI；CAMS 全球约45 km网格、原生3小时，模型小时序列含插值，不表示区县实测。</p>
      <p>地点：Open-Meteo Geocoding / <a href="https://www.geonames.org/">GeoNames</a>（<a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>）。区县无结果时请选择所属城市。</p>
      <p>气象数据许可：<a href="https://open-meteo.com/en/terms">Open-Meteo 服务条款</a>、<a href="https://creativecommons.org/licenses/by/4.0/">数据 CC BY 4.0</a>、<a href="https://api.met.no/doc/License">MET Norway 许可</a>。来源接口不等于独立观测。</p>
      {b.sources.map((source) => <section key={source.id}><h3>{source.provider} · {source.id}</h3>
        <p>{source.dataset} · {source.model ?? "未提供模型"} · {source.kind === "astronomical" ? "天文计算" : source.kind === "forecast" ? "模型预报" : "观测"}</p>
        <p>状态：{{ ok: "可用", stale: "旧数据", failed: "失败", disabled: "已禁用" }[source.status]} · {source.nativeResolution ?? "原生分辨率未知"}</p>
        <p>抓取：{stamp(source.fetchedAt)}；发布：{stamp(source.issuedAt)}</p><p>有效范围：{stamp(source.validFrom)} 至 {stamp(source.validTo)}</p>
        <a href={source.attributionUrl}>来源与署名说明</a>
      </section>)}
      <Notes items={b.warnings} /><p>schema {b.schemaVersion} · 规则 {b.rulesVersion}。初版规则未证明预测准确率；未触发风险不代表安全，请结合现场与官方安全信息。</p>
    </section>
  </article>;
}
