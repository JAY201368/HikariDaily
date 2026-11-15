import Image from "next/image";
import type { CSSProperties } from "react";
import type { Hour } from "../../domain/types";
import styles from "./instruments.module.css";
export type DeviceKind = "wind" | "direction" | "light" | "weather";
export const deviceNames = { wind: "风温湿仪", direction: "太阳方位仪", light: "经典测光表 · 光照解释", weather: "气象记录卡" };
export function value(n: number | null | undefined, unit = "", precision = 1) { return n == null ? "暂无" : `${Number(n.toFixed(precision))}${unit}`; }
const characters = { direct: "可能直射", diffuse: "可能漫射", variable: "变化光线", unknown: "暂无判断" };
const phases = { night: "夜间", blue: "蓝调", golden: "金调", day: "日间", unknown: "暂无时段" };
export function InstrumentArt({ kind, hour }: {
    kind: DeviceKind;
    hour: Hour | undefined;
}) {
    const w = hour?.weather, a = hour?.air;
    if (kind === "weather")
        return <div className={styles.card}><strong>气象记录</strong><small>HIKARI / MODEL FORECAST</small><span>所选小时 · 北京时间</span><div className={styles.cardGrid}>{[["总云量", value(w?.cloudTotal.value, " %")], ["小时降水", value(w?.precipitation.value, " mm")], ["能见度", value(w?.visibility.value == null ? null : w.visibility.value / 1000, " km")], ["参考 AQI", value(a?.referenceAqi.value)], ["PM2.5", value(a?.pm25.value, " μg/m³")], ["PM10", value(a?.pm10.value, " μg/m³")]].map(([label, v]) => <span key={label}>{label}<b>{v}</b></span>)}</div><small>US EPA / CAMS 模型小时序列<br />含插值，非区县实测</small></div>;
    const asset = { wind: "wind-photo-v3.png", direction: "solar-direction-v1.png", light: "light-meter-v2.png" }[kind];
    return <div className={`${styles.art} ${styles[kind]}`} data-instrument-art={kind}>
    <Image unoptimized src={`/objects/${asset}`} alt="" width={kind === "wind" ? 899 : kind === "direction" ? 1121 : 1024} height={kind === "wind" ? 1750 : kind === "direction" ? 1403 : 1536}/>
    {kind === "wind" && <span className={`${styles.lcd} ${styles.windLcd}`}><small>平均风 · m/s</small><strong>{value(w?.windSpeed.value)}</strong><span>阵风 {value(w?.windGust.value)} m/s</span><span>{value(w?.temperature.value)}°C / {value(w?.humidity.value)}%</span></span>}
    {kind === "direction" && <><span className={styles.sunDial} aria-hidden="true"><i>N</i><i>E</i><i>S</i><i>W</i>{hour?.light.azimuth != null && <b style={{ transform: `rotate(${hour.light.azimuth}deg)` }}/>}<small>计算太阳</small></span><span className={`${styles.lcd} ${styles.directionLcd}`}><span>方位 {value(hour?.light.azimuth, "°")}</span><span>高度 {value(hour?.light.altitude, "°")}</span></span></>}
    {kind === "light" && <span className={`${styles.lcd} ${styles.lightLcd}`}><strong>{hour ? characters[hour.light.character] : "拨针选时"}</strong><span>{hour ? phases[hour.light.phase] : "暂无时段"}</span><small>预报解释 · 非现场测光</small></span>}
  </div>;
}
export function Device({ kind, hour, onOpen }: {
    kind: DeviceKind;
    hour: Hour | undefined;
    onOpen: (kind: DeviceKind, opener: HTMLButtonElement) => void;
}) { return <button type="button" className={`${styles.device} ${styles[`${kind}Device`]}`} aria-label={`${deviceNames[kind]}，打开说明`} onClick={e => onOpen(kind, e.currentTarget)}><InstrumentArt kind={kind} hour={hour}/></button>; }
export function HourDial({ selected, onSelect, onDetails }: {
    selected: number | null;
    onSelect: (hour: number) => void;
    onDetails?: (opener: HTMLButtonElement) => void;
}) {
    return <div className={styles.watch}><div className={styles.watchCase}><div className={styles.dial} role="slider" tabIndex={0} aria-label="拨针选择小时，北京时间" aria-valuemin={0} aria-valuemax={23} aria-valuenow={selected ?? undefined} aria-valuetext={selected === null ? "尚未选择小时" : `${String(selected).padStart(2, "0")}:00，北京时间`} aria-describedby="dial-help" onKeyDown={e => { const h = selected ?? 0; const next = e.key === "Home" ? 0 : e.key === "End" ? 23 : ["ArrowRight", "ArrowUp"].includes(e.key) ? Math.min(23, h + 1) : ["ArrowLeft", "ArrowDown"].includes(e.key) ? Math.max(0, h - 1) : null; if (next !== null) {
        e.preventDefault();
        onSelect(next);
    } }} onPointerDown={e => { if (!e.isPrimary || e.button !== 0)
        return; const r = e.currentTarget.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5; if (Math.hypot(x, y) < .09)
        return; e.currentTarget.focus({ preventScroll: true }); e.currentTarget.setPointerCapture(e.pointerId); onSelect((Math.round(Math.atan2(x, -y) * 12 / Math.PI) + 24) % 24); }} onPointerMove={e => { if (!e.currentTarget.hasPointerCapture(e.pointerId))
        return; const r = e.currentTarget.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5; if (Math.hypot(x, y) > .09)
        onSelect((Math.round(Math.atan2(x, -y) * 12 / Math.PI) + 24) % 24); }} onPointerUp={e => { if (e.currentTarget.hasPointerCapture(e.pointerId))
        e.currentTarget.releasePointerCapture(e.pointerId); }}>
    <svg viewBox="0 0 240 240" aria-hidden="true">{Array.from({ length: 24 }, (_, h) => { const a = h * Math.PI / 12; return <g key={h}><line x1={Number((120 + Math.sin(a) * 103).toFixed(3))} y1={Number((120 - Math.cos(a) * 103).toFixed(3))} x2={Number((120 + Math.sin(a) * 111).toFixed(3))} y2={Number((120 - Math.cos(a) * 111).toFixed(3))}/><text x={Number((120 + Math.sin(a) * 87).toFixed(3))} y={Number((120 - Math.cos(a) * 87).toFixed(3))} className={h % 6 === 0 ? styles.major : undefined}>{String(h).padStart(2, "0")}</text></g>; })}</svg>
    <span className={styles.maker}>HIKARI FIELD<small>24 H / SELECT</small></span>{selected !== null && <span className={styles.hand} style={{ "--hour-angle": `${selected * 15}deg` } as CSSProperties}/>}<span className={styles.pivot}/><strong className={styles.watchTime}>{selected === null ? "拨针选时" : `${String(selected).padStart(2, "0")}:00`}</strong></div></div><p id="dial-help">24h 选时表盘 · 非实时时钟<br />点击刻度 / 箭头 / Home / End</p><div className={styles.watchActions}><button type="button" aria-label="表盘前一小时" onClick={() => onSelect(Math.max(0, (selected ?? 1) - 1))} disabled={selected === 0}>−1 时</button><button type="button" aria-label="表盘后一小时" onClick={() => onSelect(Math.min(23, (selected ?? -1) + 1))} disabled={selected === 23}>+1 时</button></div>{onDetails && <button type="button" className={styles.hourDetails} aria-label="24 小时明细" onClick={e => onDetails(e.currentTarget)}>24 小时明细 ↗</button>}</div>;
}
