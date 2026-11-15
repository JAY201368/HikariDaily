/* Solar-only equations adapted from SunCalc 1.9.0, (c) 2011–2015 Vladimir
 * Agafonkin, BSD-2-Clause; see assets/SUNCALC-LICENSE.txt.
 * Fixed local design fixture, not a production solar service. */
'use strict';
window.HIKARI_SOLAR = (() => {
  const rad = Math.PI / 180, start = Date.parse('2026-10-21T00:00:00+08:00');
  function position(minutes) {
    const d = (start + minutes * 60000) / 86400000 - .5 + 2440588 - 2451545;
    const M = rad * (357.5291 + .98560028 * d);
    const L = M + rad * (1.9148*Math.sin(M)+.02*Math.sin(2*M)+.0003*Math.sin(3*M)) + rad*102.9372 + Math.PI;
    const e = rad*23.4397, dec = Math.asin(Math.sin(e)*Math.sin(L));
    const ra = Math.atan2(Math.sin(L)*Math.cos(e),Math.cos(L));
    const phi = 31.23*rad, H = rad*(280.16+360.9856235*d+121.47)-ra;
    return { azimuth:(Math.atan2(Math.sin(H),Math.cos(H)*Math.sin(phi)-Math.tan(dec)*Math.cos(phi))/rad+180+360)%360,
      altitude:Math.asin(Math.sin(phi)*Math.sin(dec)+Math.cos(phi)*Math.cos(dec)*Math.cos(H))/rad };
  }
  // Root-find the SAME position function, avoiding approximate getTimes/stage disagreement.
  function crossing(angle, rising) {
    let lo = rising ? 0 : 720, hi = rising ? 720 : 1440;
    for(let i=0;i<40;i++) { const mid=(lo+hi)/2; if((position(mid).altitude<angle)===rising)lo=mid;else hi=mid; }
    return (lo+hi)/2;
  }
  const events = { dawn:crossing(-6,true), blueEnd:crossing(-4,true), sunrise:crossing(-.833,true), goldEnd:crossing(6,true), goldStart:crossing(6,false), sunset:crossing(-.833,false), blueStart:crossing(-4,false), dusk:crossing(-6,false) };
  const format = minute => { const m=Math.round(minute);return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`; };
  function stage(altitude, minutes) {
    if(altitude < -6)return '夜间';
    if(altitude < -4)return minutes<720?'早蓝调':'晚蓝调';
    if(altitude <= 6)return minutes<720?'早金调':'晚金调';
    return '日间';
  }
  function light(altitude, cloud) {
    if(altitude < -6)return '夜间';
    if(cloud===null || cloud===undefined)return '暂无法判断';
    if(altitude<0)return '暮光 / 无直射';
    return cloud<=25?'可能直射':cloud>=75?'可能漫射':'可能变化光';
  }
  return Object.freeze({position,events,format,stage,light,latitude:31.23,longitude:121.47});
})();
