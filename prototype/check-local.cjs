'use strict';
// No packages needed. Checks the offline asset graph and fixed fixture invariants.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = __dirname;
let references = 0;
for (const file of ['index.html', 'styles.css', 'app.js', 'data.js', 'solar.js', 'assets/backpack-back.svg', 'assets/backpack-mid.svg', 'assets/backpack-front.svg', 'assets/paper-crease-v.svg', 'assets/paper-crease-h.svg']) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const patterns = [/\b(?:src|href)=["']([^"']+)["']/g, /url\(["']?([^\s)'";]+)["']?\)/g];
  for (const pattern of patterns) for (const match of source.matchAll(pattern)) {
    const ref = match[1];
    if (ref.startsWith('#')) continue;
    // Only the exact locally-generated hide raster may be embedded in authored SVG.
    if (file.startsWith('assets/backpack-') && ref === `data:image/webp;base64,${fs.readFileSync(path.join(root,'assets/leather-grain.webp')).toString('base64')}`) { references++; continue; }
    assert(!/^(?:https?:|\/\/|data:)/i.test(ref), `Unexpected nonlocal reference: ${file}: ${ref}`);
    const resolved = path.resolve(root, path.dirname(file), ref);
    assert(resolved.startsWith(root + path.sep), `Reference outside prototype: ${ref}`);
    assert(fs.existsSync(resolved), `Missing local reference: ${file}: ${ref}`);
    references++;
  }
}
const sandbox = { window: {} }; vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'solar.js'), 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'data.js'), 'utf8'), sandbox);
const f = sandbox.window.HIKARI;
assert.equal(f.hours.length, 24);
assert.deepEqual(Array.from(f.hours, r => r.hour), Array.from({length:24}, (_,i)=>i));
assert.equal(new Set(f.hours.map(r=>r.time)).size, 24);
assert.equal(f.date, '2026-10-21'); assert.equal(f.timezone, 'Asia/Shanghai');
assert.equal(Math.min(...f.hours.map(r=>r.temperature)),14);
assert.equal(Math.max(...f.hours.map(r=>r.temperature)),22);
assert.equal(f.sunset,'17:17');
assert.deepEqual(Array.from(['low','mid','high','visibility','rain'],k=>f.hours[17][k]),[50,50,20,15,0]);
assert.equal(f.levels.length,5);assert.equal(f.genres.length,3);
for(const key of ['wind','temperature','humidity','azimuth','altitude','note']) assert.equal(new Set([9,16,18].map(h=>f.hours[h][key])).size,3,`${key} differs at 09/16/18`);
for(const row of f.hours){assert(row.gust>=row.wind);assert(row.cloud>=0&&row.cloud<=100);assert.equal(row.rain,0);}
for(const row of f.hours){
  if(row.hour < 6){
    assert(row.note.includes('日出前') && row.note.includes(f.morningBlue), `Predawn ${row.time} retains morning context`);
    assert(!row.note.includes('已结束'), `Predawn ${row.time} must not claim the day has ended`);
  }else if(row.hour >= 18) assert(row.note.includes('当日自然光窗口已结束'), `Late ${row.time} ends today's window`);
  else assert(!row.note.includes('已结束'), `Daylight ${row.time} must not claim the day has ended`);
}
assert.deepEqual(Array.from(f.hours,r=>r.pm10),[24,23,22,22,21,23,25,28,30,29,27,26,28,31,33,32,30,29,28,27,26,25,24,24]);
console.log(`PASS: ${references} local references; exactly24 unique hours; coherent 09/16/18 values; independent PM10 fixture; daily range, sunset inputs, five levels, genres and day/night notes.`);
