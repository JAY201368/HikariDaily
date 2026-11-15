/* Fixed visual-review fixture. Not a provider response or a production API. */
'use strict';
window.HIKARI = (() => {
  const temperature = [16,16,15,15,14,14,14,15,17,19,20,21,22,22,22,21,20,19,18,18,17,17,16,16];
  const cloud = [36,32,30,28,25,24,28,32,38,42,48,55,62,68,65,60,58,65,72,76,70,62,54,48];
  const wind = [1.6,1.5,1.4,1.3,1.2,1.2,1.4,1.7,2.0,2.4,2.6,2.8,3.0,3.2,3.5,3.6,3.4,3.1,2.7,2.4,2.1,1.9,1.8,1.7];
  const S = window.HIKARI_SOLAR;
  // Independently authored 24-hour PM10 design fixture; not inferred from AQI/PM2.5.
  const pm10 = [24,23,22,22,21,23,25,28,30,29,27,26,28,31,33,32,30,29,28,27,26,25,24,24];
  const hours = temperature.map((temp, hour) => ({
    hour, time: `${String(hour).padStart(2,'0')}:00`, temperature: temp,
    humidity: [78,79,80,81,82,83,81,77,70,64,60,57,54,55,57,61,65,69,73,75,76,77,78,78][hour],
    wind: wind[hour], gust: Number((wind[hour] + (hour >= 12 && hour <= 18 ? 2.8 : 1.6)).toFixed(1)),
    cloud: cloud[hour], low: hour === 17 ? 50 : Math.round(cloud[hour]*.6), mid: hour === 17 ? 50 : Math.round(cloud[hour]*.7), high: 20,
    rain: 0, visibility: hour >= 17 ? 15 : hour >= 9 ? 18 : 12,
    aqi: hour < 12 ? 54 : hour < 18 ? 58 : 62, pm25: hour < 12 ? 13 : hour < 18 ? 15 : 18,
    pm10: pm10[hour], ...S.position(hour*60),
    note: hour < 6 ? `日出前；可提前准备早蓝调 ${S.format(S.events.dawn)}—${S.format(S.events.blueEnd)}，现场复核云层与通行。` : hour >= 18 ? '当日自然光窗口已结束；收好器材，留意返程。' : hour < 11 ? '上午变化光；等云隙经过，再观察明暗边界。' : hour < 15 ? '午间反差较强；人像可先转入开阔阴影。' : '午后云隙与低角度光；先复核西侧遮挡，再等一束光。'
  }));
  const genres = [
    { id:'landscape', name:'风光', english:'LANDSCAPE', title:'留一层天空，\n等一束侧光。', window:'16:35—17:32', secondary:'17:32—17:41 · 晚蓝调', reason:'傍晚金调叠加中高云，15 km 能见度可保留远近层次；并非保证出现霞色。', steps:[['16:35','先看地平线','找无遮挡的西向视野，给建筑与天空各留一层。'],['17:16','等云隙，不追颜色','日落前后观察云底；低云可能挡住最后一束光。'],['17:32','留下蓝调','如霞色未出现，转拍明暗层次；17:41 后结束自然光计划。']], film:'低感彩色负片', filmNote:'细颗粒适合层次与建筑。反转片只作晴稳光线下的风格备选，曝光宽容度较小。', limit:'西向远方云场、地形与建筑遮挡未验证；风增大时收起高位支撑。', diagram:'horizon' },
    { id:'portrait', name:'人像', english:'PORTRAIT', title:'让脸部留在\n柔和的一侧。', window:'15:30—16:30', secondary:'16:35—17:05 · 侧逆光备选', reason:'下午云层带来间歇遮光，较早时段便于调整姿态；云隙直射时改用开放阴影。', steps:[['15:30','先选柔光','让人物面向明亮天空，避开斑驳光落在眼睛上。'],['16:00','照顾风与体感','平均风 3.4 m/s、阵风 6.2 m/s；固定发丝与衣摆，留一件外套。'],['16:35','有光再用轮廓','只在太阳可见时尝试侧逆光；没有金光就继续阴影方案。']], film:'中感彩色负片', filmNote:'为肤色与明暗过渡留余地；色彩是风格参考，不保证还原现场光色。', limit:'云隙使亮度变化，需现场测光；不依据天气提供快门或光圈。', diagram:'portrait' },
    { id:'street', name:'街拍', english:'STREET', title:'沿着光影边界，\n走慢一点。', window:'14:00—16:00', secondary:'17:32—17:41 · 暮色备选', reason:'午后云隙带来变化光，适合等行人经过亮暗边界；暮色则转向轮廓与亮窗。', steps:[['14:00','等一条光影边界','直射出现才有清晰长影；阴天改看层次与动作。'],['15:20','停留比追逐有效','选一个有明暗关系的背景，等待主体进入画面。'],['17:32','短留暮色','如现场有湿地面可利用反光，样例无降水，不预设雨后积水。']], film:'中高感黑白负片', filmNote:'适合移动拍摄与明暗结构；可接受颗粒。感光度与手持稳定性仍需现场判断。', limit:'注意交通与行人，不为追光进入车道；随身带防雨袋，暮色结束及时返程。', diagram:'street' }
  ];
  const replacements = {'06:00':S.format(S.events.sunrise),'17:16':S.format(S.events.sunset),'16:35':S.format(S.events.goldStart),'17:32':S.format(S.events.blueStart),'17:41':S.format(S.events.dusk)};
  const update = value => typeof value === 'string' ? value.replace(/06:00|17:16|16:35|17:32|17:41/g, t=>replacements[t]) : Array.isArray(value) ? value.map(update) : Object.fromEntries(Object.entries(value).map(([k,v])=>[k,update(v)]));
  return Object.freeze({ date:'2026-10-21', place:'上海 · 城市参考点', timezone:'Asia/Shanghai', updated:'15:20', sunrise:S.format(S.events.sunrise), sunset:S.format(S.events.sunset), morningBlue:`${S.format(S.events.dawn)}—${S.format(S.events.blueEnd)}`, morningGold:`${S.format(S.events.blueEnd)}—${S.format(S.events.goldEnd)}`, eveningGold:`${S.format(S.events.goldStart)}—${S.format(S.events.blueStart)}`, eveningBlue:`${S.format(S.events.blueStart)}—${S.format(S.events.dusk)}`, hours, genres:update(genres), levels:['很低','偏低','一般','较高','很高'] });
})();
