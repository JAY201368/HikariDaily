import Image from "next/image";
import type { Briefing, Genre } from "../../domain/types";
import { Notes, range, stamp, time } from "../briefing";
import styles from "./newspaper.module.css";
const genres = { landscape: "风光", portrait: "人像", street: "街拍" } as const;
const states = { ready: "数据可用", partial: "部分数据可用", stale: "使用允许范围内的旧数据", unavailable: "气象数据不可用" };
export function Newspaper({ briefing: b }: { briefing: Briefing }) {
  const t = b.summary.temperatureRange;
  // Remove only the repeated dateline and temperature sentence, retaining any risk prefix.
  const lead = b.summary.headline.replace(`${b.location.name} ${b.localDate}（北京时间）：`, "").replace(/温度模型范围[^。]*。/, "");
  const [headline, ...conditions] = lead.split("；");
  const change = b.summary.changes.find(item => item.includes("随后预报")) ?? b.summary.changes[0];
  const reference = b.hours.find(h => Date.parse(h.end) > Date.parse(b.generatedAt)) ?? b.hours[23];
  return <div className={styles.paper} id="newspaper">
    <div className={styles.masthead}><p>摄影天气专刊<strong>{b.location.name}</strong><small>{b.location.granularity === "city" ? "城市级地点" : "区县级地点"} · 模型格网，非现场实测</small></p><div className={styles.title}>逐光日刊<span>THE HIKARI DAILY · 读天空，再出发</span></div><p className={styles.sun}>傍晚的片刻<strong>{time(b.solar.sunset)}</strong><small>日落 · 北京时间</small></p></div>
    <div className={styles.dateline}><span>{b.localDate} · 00:00–次日00:00</span><span>生成时间 {stamp(b.generatedAt)}</span><b>{states[b.state]}</b></div>
    <section className={styles.headline} aria-labelledby="overview-heading"><h2 id="overview-heading">当天概览</h2><h3 className={headline.length > 45 ? styles.longHeadline : undefined}>{headline}</h3><p>{conditions.join("；") || b.summary.limitations[0]}</p><div className={styles.context}>{b.location.name} · {b.location.administrativePath.join(" / ")} · {b.localDate} · {states[b.state]}</div></section>
    <div className={styles.columns}>
      <section className={styles.story}><figure><Image unoptimized src="/textures/riverside-film.webp" alt="江岸与云层的黑白氛围参考" width="640" height="360"/><figcaption>江岸 · 氛围参考图，非所选地点实况或预测画面；仅供本地评审。</figcaption></figure>
        <section className={styles.sunset} aria-labelledby="sunset-heading"><h3 id="sunset-heading">晚霞 / 火烧云机会 · 启发式推断</h3><strong>{b.sunsetOpportunity.level === null ? "暂无法判断" : `${b.sunsetOpportunity.level} / 5 级 · ${b.sunsetOpportunity.label}`}</strong><p>目标日落 {time(b.sunsetOpportunity.targetTime)}。仅基于本地预报，仍需现场复核。</p><details><summary>读懂五级与判断依据 ↗</summary><p>五级依次为很低、偏低、一般、较高、很高；未知独立于最低等级，高等级也非保证或统计概率。</p><Notes items={b.sunsetOpportunity.reasons}/><Notes items={b.sunsetOpportunity.limitations}/><p>依据完备性：{b.sunsetOpportunity.confidence === "medium" ? "中" : b.sunsetOpportunity.confidence === "low" ? "低" : "未知"}。来源 {b.sunsetOpportunity.sourceIds.join("、") || "必要依据不足"}。</p></details></section>
        {change && <p className={styles.change}><b>主要变化 / </b>{change}</p>}
        <details><summary>完整概览、变化与限制</summary><p>{b.summary.headline}</p><p>{b.location.granularity === "city" ? "城市级地点，天气代表模型格网，不能视为区县精确天气。" : "区县级地点选择，天气仍代表模型格网，非当地站点实测。"}</p><h3>主要变化</h3><Notes items={b.summary.changes}/><h3>机会与限制</h3><Notes items={b.summary.opportunities}/><Notes items={b.summary.limitations}/></details>
      </section>
      <section><h3 className={styles.columnTitle}>天气与出发</h3><p className={styles.temperature}>{t.min ?? "暂无"}<span>–</span>{t.max ?? "暂无"}<small>°C</small></p><p className={styles.coverage}>温度覆盖 {t.coveredHours} / {t.totalHours} 小时</p><p>天气为模型预报，出发前仍需复核。</p><h3 className={styles.columnTitle}>三种拍法</h3><dl className={styles.genres}>{(Object.keys(genres) as Genre[]).map(g => <div key={g}><dt>{genres[g]}</dt><dd>{b.advice[g].recommendedWindows[0] ? range(b.advice[g].recommendedWindows[0]) : "暂无优先窗口"}</dd><p>{b.advice[g].recommendedWindows[0]?.reasons[0] ?? "请阅读限制与替代方向。"}</p></div>)}</dl><a href="#handbook">翻开当天手册 →</a></section>
      <section><h3 className={styles.columnTitle}>逐时摘录</h3><table><thead><tr><th>时</th><th>°C</th><th>云%</th><th>雨mm</th></tr></thead><tbody>{[6, 9, 12, 14, 16, 17, 18, 21].map(i => <tr key={i} data-afternoon={i === 16 || i === 17}><th>{String(i).padStart(2, "0")}</th><td>{b.hours[i].weather.temperature.value ?? "暂无"}</td><td>{b.hours[i].weather.cloudTotal.value ?? "暂无"}</td><td>{b.hours[i].weather.precipitation.value ?? "暂无"}</td></tr>)}</tbody></table><p className={styles.note}>24 小时可明细。降水按所示小时累计。</p><a href="#instruments">完整逐时表 ↗</a></section>
      <section aria-labelledby="solar-heading"><h3 id="solar-heading" className={styles.columnTitle}>太阳时段 · 天文计算</h3><dl className={styles.almanac}><dt>日出 / 日落</dt><dd>{time(b.solar.sunrise)} / {time(b.solar.sunset)}</dd>{([['morningBlue', '早晨蓝调'], ['morningGolden', '早晨金调'], ['eveningGolden', '傍晚金调'], ['eveningBlue', '傍晚蓝调']] as const).map(([k, l]) => <div key={k}><dt>{l}</dt><dd>{b.solar[k] ? range(b.solar[k]) : "暂无 / 不适用"}</dd></div>)}</dl><p className={styles.note}>蓝调 −6°至−4°；金调 −4°至+6°。时段不保证可见光效。</p><details><summary>太阳计算说明</summary><Notes items={b.solar.notes}/></details>
      <h3 className={styles.columnTitle}>空气 ≠ 能见度</h3><div className={styles.air}><strong>{reference.air.referenceAqi.value ?? "暂无"}</strong><span>参考 AQI<br/>美国 EPA 口径</span></div><p className={styles.note}>{time(reference.start)} 模型小时：PM2.5 {reference.air.pm25.value ?? "暂无"} μg/m³；能见度 {reference.weather.visibility.value === null ? "暂无" : `${Number((reference.weather.visibility.value / 1000).toFixed(1))} km`}。</p><p className={styles.note}>CAMS 模型小时序列（含插值），非中国官方 AQI；非区县实测。</p></section>
    </div>
    <footer className={styles.footer}><span>天气与空气：模型预报 / 太阳：天文计算 / 摄影：规则推断</span><a href="#sources-heading">数据与出处 ↗</a><a href="#instruments">折好日报，打开皮包 ↓</a></footer>
  </div>;
}
