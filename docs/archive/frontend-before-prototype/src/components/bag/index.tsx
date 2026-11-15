"use client";
import Image from "next/image";
import { useRef, useState } from "react";
import type { Briefing } from "../../domain/types";
import { BookCover } from "../handbook";
import { Device, InstrumentArt, HourDial, deviceNames, type DeviceKind } from "../instruments";
import { HourReading } from "../instruments/hour-reading";
import styles from "./bag.module.css";
export function Bag({ briefing: b, selectedHour, onSelectHour }: {
    briefing: Briefing;
    selectedHour: number | null;
    onSelectHour: (hour: number) => void;
}) {
    const dialog = useRef<HTMLDialogElement>(null), opener = useRef<HTMLButtonElement | null>(null);
    const [detail, setDetail] = useState<DeviceKind | "hours">("wind");
    const hour = selectedHour === null ? undefined : b.hours[selectedHour];
    function open(kind: DeviceKind | "hours", button: HTMLButtonElement) { setDetail(kind); opener.current = button; dialog.current?.showModal(); }
    return <section id="instruments" className={styles.section} aria-labelledby="hours-heading"><header className={styles.heading}><div><p>02 / 随身气象</p><h2 id="hours-heading">24 小时天气与光照</h2><h3>把天气带在身边。</h3></div><p>{b.location.name}<br />{selectedHour === null ? "拨针选一个小时" : `${String(selectedHour).padStart(2, "0")}:00 · 模型预报`}</p></header>
 <div className={styles.scene}><div data-pack-home><div className={styles.pack} data-bag="registered-layers"><Image unoptimized className={styles.back} src="/objects/backpack-photo-v2.png" width="1359" height="1157" alt="旧棕色皮革摄影背包，装有随身气象器材"/>
 {(["wind", "weather", "direction", "light"] as const).map(kind => <Device key={kind} kind={kind} hour={hour} onOpen={open}/>)}
 <div className={styles.pocketBook} data-pocket-book aria-hidden="true"><BookCover pocket/></div><div className={styles.pocketPaper} data-pocket-paper aria-hidden="true"/>
 <Image unoptimized className={styles.mid} src="/objects/backpack-photo-mid.png" width="1359" height="1157" alt="" aria-hidden="true"/><Image unoptimized className={styles.front} src="/objects/backpack-photo-front.png" width="1359" height="1157" alt="" aria-hidden="true"/></div></div>
 <div className={styles.side}><div data-dial-home><HourDial selected={selectedHour} onSelect={onSelectHour} onDetails={button => open("hours", button)}/></div><p className={styles.caption}>点一件器材，读懂一个条件。</p> {hour && <p className={styles.numericSummary}>平均风 {hour.weather.windSpeed.value ?? "暂无"} m/s · 阵风 {hour.weather.windGust.value ?? "暂无"} m/s · 温度 {hour.weather.temperature.value ?? "暂无"} °C · 湿度 {hour.weather.humidity.value ?? "暂无"}%<br />能见度 {hour.weather.visibility.value === null ? "暂无" : (hour.weather.visibility.value / 1000).toFixed(1)} km · 参考 AQI {hour.air.referenceAqi.value ?? "暂无"}（US_EPA）</p>}</div></div>
 <dialog ref={dialog} className={styles.dialog} aria-labelledby="instrument-detail-title" onClose={() => opener.current?.focus({ preventScroll: true })}><div className={styles.dialogTop}><span>逐光 · 读数说明</span><button type="button" autoFocus onClick={() => dialog.current?.close()} aria-label="关闭说明">×</button></div><h2 id="instrument-detail-title">{detail === "hours" ? "24 小时 · 天气与光照" : deviceNames[detail]}</h2>{detail === "hours" ? <div data-hour-details>
 <p>{b.location.name} · {b.localDate} · 北京时间。天气与空气为模型预报，已过时段也不是实况。瞬时气象值参考小时起点，降水及阵风对应所示小时区间。光照解释及太阳角度参考每小时中点（:30），并非整点角度。</p>
 <div className={styles.hourTableWrap} tabIndex={0} aria-label="24小时表，可横向滚动"><table className={styles.hourTable}><thead><tr><th>时</th><th>°C</th><th>风 m/s</th><th>云 %</th><th>雨 mm</th><th>能见 km</th></tr></thead><tbody>{b.hours.map((h,i) => <tr key={h.start} aria-selected={selectedHour === i}><th><button type="button" aria-label={`${String(i).padStart(2,"0")} 时`} aria-pressed={selectedHour === i} onClick={() => onSelectHour(i)}>{String(i).padStart(2,"0")}:00</button></th><td>{h.weather.temperature.value ?? "暂无"}</td><td>{h.weather.windSpeed.value ?? "暂无"}</td><td>{h.weather.cloudTotal.value ?? "暂无"}</td><td>{h.weather.precipitation.value ?? "暂无"}</td><td>{h.weather.visibility.value === null ? "暂无" : Number((h.weather.visibility.value/1000).toFixed(1))}</td></tr>)}</tbody></table></div>
 {hour && selectedHour !== null ? <HourReading hour={hour} index={selectedHour} generatedAt={b.generatedAt}/> : <p>点选表格中的小时，查看完整指标、来源和推断依据。</p>}
 <p>能见度与空气质量分别展示；不从 AQI 推算能见度或污染物浓度。参考 AQI 为 US_EPA（美国 EPA 口径），非中国官方 AQI。CAMS 全球约45 km网格、原生3小时，模型小时序列含插值，非区县实测。</p>
 </div> : <div className={styles.detailGrid}><div className={styles.detailArt}><InstrumentArt kind={detail} hour={hour}/></div><div><p>{b.location.name} · {b.localDate} · {selectedHour === null ? "尚未选择小时" : `${String(selectedHour).padStart(2, "0")}:00–${selectedHour === 23 ? "次日00" : String(selectedHour + 1).padStart(2, "0")}:00`}</p>{!hour ? <p>请先关闭说明并拨针选时。暂无读数，不显示示例数字。</p> : <><p>{hour.light.description}</p>{detail === "wind" && <p>平均风 {hour.weather.windSpeed.value ?? "暂无"} m/s；小时最大阵风 {hour.weather.windGust.value ?? "暂无"} m/s；温度 {hour.weather.temperature.value ?? "暂无"} °C；湿度 {hour.weather.humidity.value ?? "暂无"}%。风向表示来向；缺少阵风时保持暂无。</p>}{detail === "direction" && <p>计算太阳参考 {String(selectedHour).padStart(2, "0")}:30：方位 {hour.light.azimuth?.toFixed(1) ?? "暂无"}°，高度 {hour.light.altitude?.toFixed(1) ?? "暂无"}°。北0°顺时针，高度以地平线0°为基准，负值在地平线下。不是设备朝向，不读取传感器或用户定位，也不考虑现场建筑与山体遮挡。</p>}{detail === "light" && <><p>基于天气预报与太阳阶段的条件性光照解释，非现场测光，不提供 EV、lux 或曝光参数。</p><p>{hour.light.reasons.join("；")}</p><p>{hour.light.limitations.join("；")}</p></>}{detail === "weather" && <p>总云 {hour.weather.cloudTotal.value ?? "暂无"}%；小时降水 {hour.weather.precipitation.value ?? "暂无"} mm；能见度 {hour.weather.visibility.value === null ? "暂无" : (hour.weather.visibility.value / 1000).toFixed(1)} km；参考 AQI {hour.air.referenceAqi.value ?? "暂无"}（US_EPA）；PM2.5 {hour.air.pm25.value ?? "暂无"} / PM10 {hour.air.pm10.value ?? "暂无"} μg/m³。CAMS 模型小时序列含插值，非中国官方站点实况。</p>}<p>逐字段来源、缺失、旧数据与分歧可在表盘下方的“24 小时明细”中展开阅读。</p><ul>{[...Object.values(hour.weather), ...Object.values(hour.air)].flatMap(m => m.notes).filter((v, i, a) => a.indexOf(v) === i).map(note => <li key={note}>{note}</li>)}</ul></>}</div></div>}</dialog>
 </section>;
}
