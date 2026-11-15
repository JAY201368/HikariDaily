'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const box={window:{}};vm.createContext(box);for(const file of ['solar.js','data.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,file),'utf8'),box);
const S=box.window.HIKARI_SOLAR,F=box.window.HIKARI;
// Independently obtained upstream SunCalc v1.9.0 getPosition/getTimes reference;
// URL and full conventions/differences recorded in review/T06A/VERIFICATION.md.
const refs=[[0,14.065,-68.563],[6,101.592,-1.018],[9,130.994,33.486],[12,187.648,47.955],[16,247.444,14.910],[17,255.870,2.729],[18,263.524,-9.891],[23,334.090,-67.542]];
let checks=0;function ok(v,m){assert(v,m);checks++;}
for(const [h,az,alt]of refs){const p=S.position(h*60);ok(Math.abs(p.azimuth-az)<.001&&Math.abs(p.altitude-alt)<.001,`reference ${h}`);}
for(const h of F.hours){ok(h.azimuth>=0&&h.azimuth<360&&h.altitude>=-90&&h.altitude<=90,`range ${h.hour}`);ok(Math.abs(h.azimuth-S.position(h.hour*60).azimuth)<1e-10,`same instant ${h.hour}`);ok(Number.isFinite(h.pm10),`PM10 ${h.hour}`);}
const events=[['dawn',-6,true,337+17/60],['blueEnd',-4,true,346+46/60],['sunrise',-.833,true,361+51/60],['goldEnd',6,true,394+47/60],['goldStart',6,false,1005+10/60],['sunset',-.833,false,1038+7/60],['blueStart',-4,false,1053+12/60],['dusk',-6,false,1062+41/60]];
const differences=[];
for(const [key,angle,rising,ref]of events){const m=S.events[key];ok(Math.abs(S.position(m).altitude-angle)<1e-7,`${key} position root`);ok(Math.abs(m-ref)<1.1,`${key} within 1.1min upstream approximate getTimes`);ok((S.position(m-.01).altitude<angle)===rising&& (S.position(m+.01).altitude>angle)===rising,`${key} direction crossing`);differences.push({event:key,minutes:m,display:S.format(m),upstreamMinusRootSeconds:(ref-m)*60});}
for(const [key,before,after]of [['dawn','夜间','早蓝调'],['blueEnd','早蓝调','早金调'],['goldEnd','早金调','日间'],['goldStart','日间','晚金调'],['blueStart','晚金调','晚蓝调'],['dusk','晚蓝调','夜间']]){const m=S.events[key];ok(S.stage(S.position(m-.01).altitude,m-.01)===before&&S.stage(S.position(m+.01).altitude,m+.01)===after,`${key} stage boundaries`);}
for(const [alt,cloud,want]of [[30,25,'可能直射'],[30,75,'可能漫射'],[30,50,'可能变化光'],[30,null,'暂无法判断'],[-2,20,'暮光 / 无直射'],[-7,null,'夜间']])ok(S.light(alt,cloud)===want,`conditional ${alt}/${cloud}`);
ok(F.sunrise===S.format(S.events.sunrise)&&F.sunset===S.format(S.events.sunset),'shared rise/set');
ok(F.genres[0].window===F.eveningGold&&F.genres[0].secondary.startsWith(F.eveningBlue),'book event links');
ok(F.hours[0].note.includes(F.morningBlue),'predawn link');
ok(S.position(360).azimuth>90&&S.position(1080).azimuth>270-10,'north clockwise east morning/west evening');
const report={checks,timezone:process.env.TZ||'environment',references:refs,events:differences,old:{sunrise:'06:00',sunset:'17:16',morningBlue:'05:35—05:44',morningGold:'05:44—06:41',eveningGold:'16:35—17:32',eveningBlue:'17:32—17:41'},current:Object.fromEntries(['sunrise','sunset','morningBlue','morningGold','eveningGold','eveningBlue'].map(k=>[k,F[k]]))};
if(process.env.REVIEW_DIR){fs.mkdirSync(process.env.REVIEW_DIR,{recursive:true});fs.writeFileSync(path.join(process.env.REVIEW_DIR,'solar.json'),JSON.stringify(report,null,2));}
console.log(`PASS ${checks} solar/fixture checks; ${JSON.stringify(report.current)}`);
