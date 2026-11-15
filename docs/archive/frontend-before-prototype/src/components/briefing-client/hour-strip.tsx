import type { KeyboardEvent } from "react";
import styles from "./interactive.module.css";

export function HourStrip({ selected, onSelect }: { selected: number | null; onSelect: (hour: number) => void }) {
  function keyboard(event: KeyboardEvent<HTMLButtonElement>, hour: number) {
    const next = event.key === "Home" ? 0 : event.key === "End" ? 23 : event.key === "ArrowRight" || event.key === "ArrowDown" ? Math.min(23, hour + 1) : event.key === "ArrowLeft" || event.key === "ArrowUp" ? Math.max(0, hour - 1) : null;
    if (next === null) return;
    event.preventDefault(); onSelect(next);
    event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`[data-hour="${next}"]`)?.focus();
  }
  return <div className={styles.hourControls}>
    <p>选择 00–23 时查看对应小时读数。箭头逐小时，Home / End 到首末小时；不重新获取天气。</p>
    <div role="group" aria-label="选择小时" className={styles.hourStrip}>{Array.from({ length: 24 }, (_, hour) => <button type="button" key={hour} data-hour={hour}
      aria-label={`${String(hour).padStart(2, "0")} 时`} aria-pressed={selected === hour} tabIndex={hour === (selected ?? 0) ? 0 : -1}
      onKeyDown={(event) => keyboard(event, hour)} onClick={() => onSelect(hour)}>{String(hour).padStart(2, "0")}</button>)}</div>
    <div className={styles.stepHours}><button type="button" onClick={() => onSelect(Math.max(0, (selected ?? 1) - 1))} disabled={selected === 0}>前一小时</button>
      <button type="button" onClick={() => onSelect(Math.min(23, (selected ?? -1) + 1))} disabled={selected === 23}>后一小时</button></div>
    <p role="status">{selected === null ? "尚未选择小时；概览与手册提供全天信息。" : `已选 ${String(selected).padStart(2, "0")}:00–${selected === 23 ? "次日00" : String(selected + 1).padStart(2, "0")}:00。概览与全天建议保持不变。`}</p>
  </div>;
}
