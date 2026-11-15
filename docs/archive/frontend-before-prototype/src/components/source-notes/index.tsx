import type { Briefing } from "../../domain/types";
import { Notes, stamp } from "../briefing";
export function SourceNotes({ briefing: b }: {
    briefing: Briefing;
}) {
    return <section aria-labelledby="sources-heading"><h2 id="sources-heading">来源、更新时间与缺失说明</h2>
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
      <Notes items={b.warnings}/><p>schema {b.schemaVersion} · 规则 {b.rulesVersion}。初版规则未证明预测准确率；未触发风险不代表安全，请结合现场与官方安全信息。</p>
    </section>;
}
