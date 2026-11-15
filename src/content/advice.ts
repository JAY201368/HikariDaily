import { HAZARD_WORDS } from "./interpret/hazard-words";
import { SUNSET_NEAR_ACTION, SUNSET_WORDS } from "./interpret/sunset-words";
import type { NormalizedDay } from "../domain/normalization";
import type { Genre, GenreAdvice, Location, Opportunity, SolarEvents } from "../domain/types";
import { assessLight } from "../domain/photography/light";
import { createScoredSlices, mergeScoredWindows, publicWindow, selectRecommendedWindows } from "../domain/photography/windows";
import { eveningOver, freezingRange, nightLine, snowing } from "./interpret/genres";
import { HEAVY_RAIN_MM } from "../domain/photography/risks";
import { assessHourRisks } from "../domain/photography/risks";
import { freezingRain, hasConflict, metricLimitations, present, rangeLabel, timeLabel, unique } from "../domain/photography/shared";
import { toEpoch } from "../domain/time";
import { suggestFilm } from "./film-types";
import { NIGHT_LIGHT, TWILIGHT_LIGHT, twilightKey } from "./interpret/light-context";
import { distanceText, windEffect, windLevel } from "./interpret/levels";

const GENRE_HINT: Record<Genre, string> = {
  landscape: "先看远处是否清楚，再用云和地形拉开层次",
  portrait: "让人物侧对或背对光，避免脸上出现浓重的影子",
  street: "找一处有光影的街角，等行人走进光里",
};
const FIELD_NAMES: Record<string, string> = { cloudTotal: "云量", windSpeed: "风", precipitation: "降水", weatherCode: "天气类型", visibility: "能见度" };

/** P6.3/P6.5: copy is derived from this genre's actual windows and field availability. */
export function createGenreAdvice(day: NormalizedDay, solar: SolarEvents, location: Location,
  genre: Genre, now: string | number, sunset: Opportunity): GenreAdvice {
  const current = toEpoch(now);
  const all = mergeScoredWindows(createScoredSlices(day, solar, location, genre, now), now);
  const recommended = selectRecommendedWindows(all, now);
  const future = all.filter((window) => Date.parse(window.end) > current);
  const representative = recommended[0] ?? future[0];
  const hourAt = (epoch: number) => day.hours.find((item) => Date.parse(item.start) <= epoch && epoch < Date.parse(item.end));
  const hour = representative ? hourAt(Date.parse(representative.start)) : undefined;
  const light = hour && representative ? assessLight(Date.parse(representative.start), location, hour.weather.cloudTotal, solar) : null;
  const lightKey = representative && light ? twilightKey(representative, representative.reasonCodes.find(code => code.startsWith("phase:"))?.slice(6) ?? light.phase, { solar, now, location }) : null;
  const night = eveningOver(solar, now) || (!representative && (solar.sunrise === null || current >= Date.parse(solar.sunrise)) && assessLight(current, location, hourAt(current)?.weather.cloudTotal ?? { value: null, state: "missing", sourceIds: [], notes: [] }, solar).phase === "night");
  const upcoming = day.hours.filter((item) => Date.parse(item.end) > current);
  // Without a window, describe the next daylight hour (or now) instead of declaring visibility unknown.
  const daylight = upcoming.find((item) => {
    const mid = (Date.parse(item.start) + Date.parse(item.end)) / 2;
    return solar.sunrise !== null && solar.sunset !== null && mid > Date.parse(solar.sunrise) && mid < Date.parse(solar.sunset);
  });
  const lookHour = hour ?? daylight ?? upcoming[0] ?? day.hours.at(-1);
  const last = all.at(-1);
  const freeze = freezingRange(day.hours, now);
  const pausedForFreeze = freeze !== null && recommended.length === 0;
  const timing = recommended.length
    ? `${recommended[0].status === "current" ? `现在到 ${timeLabel(recommended[0].end)} 就是好时段` : `最值得拍的时间是 ${rangeLabel(recommended[0])}`}；${lightKey && TWILIGHT_LIGHT[lightKey] ? "留意天边的颜色与明暗变化" : GENRE_HINT[genre]}。`
    : freeze ? `${rangeLabel(freeze)}有冻雨，路面结冰，别外出拍摄。`
    : future.length ? `今天剩下的时间条件一般，${rangeLabel(future[0])} 可以试试。`
    : last ? `今天的时段记录已经过去（最后一段是 ${rangeLabel(last)}）。`
    : "缺少云量、降水等预报，或者白天都有风雨风险，今天排不出具体时间。";
  const riskNotes = day.hours.flatMap((item) => assessHourRisks(item));
  const risks = unique(riskNotes.map((risk) =>
    `${rangeLabel(risk)}${Date.parse(risk.end) <= current ? "（已经过去）" : ""}：${risk.message}`));
  const missingFields = ["cloudTotal", "windSpeed", "precipitation", "weatherCode", ...(genre === "landscape" ? ["visibility"] : [])]
    .filter((name) => upcoming.some((item) => !present(item.weather[name as keyof typeof item.weather])));
  // A complete short first sentence fits the printed page; full facts stay below it.
  const firstRisk = riskNotes.find((risk) => Date.parse(risk.end) > current) ?? riskNotes[0];
  const shortLimit = firstRisk
    ? `${rangeLabel(firstRisk)}：${HAZARD_WORDS[firstRisk.code].printedLabel}，${Date.parse(firstRisk.end) <= current ? "已经过去" : HAZARD_WORDS[firstRisk.code].printedAction}。`
    : freeze ? `${rangeLabel(freeze)}：有冻雨，户外停拍。`
    : missingFields.length ? "部分小时缺预报，已跳过这些时间。"
    : upcoming.some((item) => Object.values(item.weather).some((metric) => metric.state === "stale")) ? "部分预报是早些时候存下的，留意云雨变化。"
    : upcoming.some((item) => Object.values(item.weather).some(hasConflict)) ? "两家预报有分歧，拍前再看云雨变化。"
    : "时段按逐小时预报挑选，留意云雨变化。";
  const limitations = unique([shortLimit, ...risks, ...all.flatMap((window) => window.limitations),
    ...(missingFields.length ? [`接下来有几个小时缺少${missingFields.map((name) => FIELD_NAMES[name]).join("、")}预报，这些时间没有参与挑选。`] : []),
    ...(upcoming.some((item) => !present(item.air.referenceAqi)) && !all.length ? ["接下来有几个小时没有空气质量预报。"] : []),
  ]);
  const visibility = lookHour?.weather.visibility;
  const rain = lookHour?.weather.precipitation;
  const wind = lookHour?.weather.windSpeed;
  const gust = lookHour?.weather.windGust;
  const temperature = lookHour?.weather.temperature;
  const averageLevel = wind && present(wind) ? windLevel(wind.value) : null;
  const gustLevel = gust && present(gust) ? windLevel(gust.value) : null;
  const strongerGust = gustLevel !== null && gustLevel > 1 && (averageLevel === null || gustLevel > averageLevel);
  const portraitWind = strongerGust ? `${averageLevel === null ? "没有平均风的预报；" : ""}阵风可到 ${gustLevel} 级，${windEffect(gustLevel)}`
    : !wind || !present(wind) ? gust && present(gust) ? "没有平均风的预报" : "没有风的预报" : wind.value > 3
    ? `平均风 ${averageLevel} 级，${windEffect(averageLevel!)}` : "风不大";
  const portraitTemperature = !temperature || !present(temperature) ? "没有气温预报"
    : temperature.value <= 5 ? "天冷，让人物少站一会儿"
    : temperature.value >= 30 ? "天热，缩短站位时间、记得补水"
    : `气温 ${Math.round(temperature.value)}°C${wind && present(wind) && wind.value <= 3 && !strongerGust ? "，人物站得住" : ""}`;
  const sunsetPassed = solar.sunset !== null && Date.parse(solar.sunset) <= current;
  const sunsetWords = SUNSET_WORDS[sunset.level ?? "unknown"];
  const sunsetHour = sunset.targetTime ? hourAt(Date.parse(sunset.targetTime)) : undefined;
  // The invitation includes arriving twenty minutes early, not just the sunset hour.
  const sunsetArrival = sunset.targetTime ? Date.parse(sunset.targetTime) - 20 * 60000 : null;
  const sunsetActionStart = sunsetArrival === null ? null : Math.max(current, sunsetArrival);
  const sunsetActionEnd = sunsetHour ? Date.parse(sunsetHour.end) : null;
  const duringSunsetAction = (range: { start: string; end: string }) => sunsetActionStart !== null && sunsetActionEnd !== null &&
    Date.parse(range.start) < sunsetActionEnd && sunsetActionStart < Date.parse(range.end);
  const sunsetFrozen = day.hours.some(item => duringSunsetAction(item) && freezingRain(item.weather.weatherCode));
  const sunsetRisk = riskNotes.find(risk => risk.code !== "air-quality" && duringSunsetAction(risk));
  const sunsetAction = sunset.level === 5 && sunsetArrival !== null && current >= sunsetArrival ? SUNSET_NEAR_ACTION : sunsetWords.action;
  const sunsetLine = sunset.status !== "assessed" || sunset.level === null
    ? `${SUNSET_WORDS.unknown.prospect}，${SUNSET_WORDS.unknown.action}。`
    : sunsetPassed ? `今天的日落已经过去，${sunsetWords.retrospective}。`
    : `${sunsetWords.prospect}，${sunsetFrozen ? `${HAZARD_WORDS.sleet.label}，${HAZARD_WORDS.sleet.action}` : sunsetRisk ? `${HAZARD_WORDS[sunsetRisk.code].label}，${HAZARD_WORDS[sunsetRisk.code].action}` : sunsetAction}。`;
  let opportunities = genre === "landscape" ? [
    visibility && present(visibility)
      ? visibility.value >= 10000 ? `能见度约 ${distanceText(visibility.value)}，远景清楚，可以用云和地形拉出前后层次。`
        : `能见度约 ${distanceText(visibility.value)}，远处发灰，适合拍近处的轮廓和雾里的层次。`
      : "这段时间没有能见度预报，可以拍近处的纹理和色彩。",
    sunsetLine,
  ] : genre === "portrait" ? [
    lightKey && TWILIGHT_LIGHT[lightKey] ? TWILIGHT_LIGHT[lightKey]
      : light?.character === "diffuse" ? "柔光让人物脸上受光均匀，选个简洁的背景，注意眼睛够不够亮。"
      : light?.phase === "golden" ? "太阳很低，可以让人物背对太阳拍逆光轮廓，注意脸别太暗。"
      : "按实际光向安排人物朝向；阳光太硬就找树荫或楼影，天暗了让人物站稳。",
    `${portraitWind}；${portraitTemperature}。`,
  ] : [
    lightKey && TWILIGHT_LIGHT[lightKey] ? TWILIGHT_LIGHT[lightKey]
      : light?.character === "direct" ? "阳光下街上的楼影和行人影子很清楚，找一条光带，等人走进去。"
      : light?.character === "variable" ? "云一开一合，街面忽明忽暗，等人和光斑凑到一起再按快门。"
      : "光线柔和或天色偏暗，可以多拍街上的招牌、色彩和人物关系，手持注意拿稳。",
    lookHour && snowing(lookHour) ? "正在下雪，注意防滑和电池保暖。"
      : rain && present(rain) && rain.value >= HEAVY_RAIN_MM ? `${HAZARD_WORDS["heavy-rain"].label}，${HAZARD_WORDS["heavy-rain"].detail}。`
      : rain && present(rain) && rain.value > 0.1 ? "有雨，找有遮挡的骑楼或屋檐，拍街面的倒影和打伞的人。" : "如果街面是湿的，可以拍路面的反光。",
  ];
  let alternatives = genre === "landscape" ? ["远处看不清，就拍近处纹理和雾感。", "遇到雷雨、大风或大雨，取消户外安排。"]
    : genre === "portrait" ? ["阳光太硬就转到楼影或树荫下。", "天气不好就改去有遮挡、允许拍摄的室内，或者改天再拍。"]
    : ["不适合久走的话，就找有遮挡、允许拍摄的地方。", "雨停后确认路面不滑，再去拍地面反光。"];
  const futureHazard = riskNotes.find(risk => risk.code !== "air-quality" && Date.parse(risk.end) > current);
  const hazardLine = futureHazard ? `接下来${HAZARD_WORDS[futureHazard.code].label}，${HAZARD_WORDS[futureHazard.code].action}。` : freeze ? `${HAZARD_WORDS.sleet.detail}。` : null;
  const windyNight = upcoming.some(item => [item.weather.windSpeed, item.weather.windGust].some(metric => present(metric) && windLevel(metric.value) >= 6));
  if (pausedForFreeze) {
    opportunities = [`${HAZARD_WORDS.sleet.detail}。`, genre === "landscape" ? sunsetLine : "先取消户外安排，等结冰消退后再看。"];
    alternatives = ["改在允许拍摄的室内取景，或者改天再拍。"];
  }
  if (night) {
    const rainAhead = upcoming.some(item => present(item.weather.precipitation) && item.weather.precipitation.value > 0.1);
    opportunities = [hazardLine ?? `${nightLine(genre, rainAhead, windyNight)}。`,
      genre === "landscape" ? sunsetLine
        : hazardLine ? "先取消户外安排，等天气缓和再看。" : genre === "portrait" ? `${portraitWind}；${portraitTemperature}。` : "先确认路面和周围环境，再决定拍摄位置。"];
    alternatives = hazardLine || windyNight ? ["改在允许拍摄的室内取景，或者改天再拍。"]
      : genre === "portrait" ? ["现场灯光太暗就用补光，或者改在允许拍摄的室内取景。"]
      : ["灯光太暗或不便停留，就改在允许拍摄的室内取景。"];
  }
  const stable = Boolean(hour && ![hour.weather.cloudTotal, hour.weather.precipitation, hour.weather.windSpeed]
    .some((metric) => metric.state === "stale" || hasConflict(metric)) && present(hour.weather.precipitation) && hour.weather.precipitation.value <= 0.1);
  return { genre, allWindows: all.map(publicWindow), recommendedWindows: recommended.map(publicWindow), timing,
    light: pausedForFreeze ? "冻雨会让路面结冰，先取消户外拍摄。" : night ? NIGHT_LIGHT : light ? `${rangeLabel(representative!)}：${lightKey && TWILIGHT_LIGHT[lightKey] ? TWILIGHT_LIGHT[lightKey] : light.phase === "blue" ? "蓝调时刻，天空深蓝、光很暗。"
      : light.phase === "golden" ? light.character === "diffuse" ? "黄金时刻，但厚云遮光，影子淡。" : light.character === "variable" ? "黄金时刻，云隙让暖光忽明忽暗。" : "黄金时刻，光偏暖、影子长。"
      : light.character === "direct" ? light.altitude! > 30 ? "阳光直射，反差强、影子浓。" : "阳光从侧面来，影子长。"
      : light.character === "diffuse" ? "厚云形成柔光，影子淡。" : light.character === "variable" ? "云时开时合，等云缝里漏下的光。" : "云量预报缺失，光线软硬还不清楚。"}` : "今天没有能挑出来的时段，光线情况可以看「光线时刻」。",
    opportunities, limitations: unique([...limitations, ...(hour ? metricLimitations(Object.values(hour.weather)) : [])]),
    alternatives, film: suggestFilm(genre, light, stable, night, Boolean(hazardLine) || windyNight) };
}
