'use strict';
// Focused offline fold review: native-scroll keyframes + isolated zero-angle handoff.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
let chromium;
try { ({ chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')); }
catch { console.error('SKIPPED: set PLAYWRIGHT_MODULE to an installed Playwright module.'); process.exit(2); }
const review = path.resolve(process.env.REVIEW_DIR || path.join(__dirname, 'review/T02/focused'));
fs.mkdirSync(review, { recursive: true });
const url = pathToFileURL(path.join(__dirname, 'index.html')).href;
const results = [], samples = [], pixels = [], errors = [], external = [];
function ok(value, message) { assert(value, message); results.push(message); }
function watch(page) {
  page.on('pageerror', e => errors.push(String(e)));
  page.on('request', r => { if (/^https?:/i.test(r.url())) external.push(r.url()); });
}
async function seek(page, p) {
  await page.evaluate(v => {
    const j = document.querySelector('#journey');
    scrollTo(0, j.offsetTop + Number(j.dataset.readingDistance) * v);
  }, p);
  await page.waitForTimeout(100);
}
async function snapshot(page, name) {
  return page.screenshot({ path: path.join(review, `${name}.png`) });
}
async function state(page) {
  return page.evaluate(() => {
    const q = s => document.querySelector(s), style = n => getComputedStyle(n);
    const folding = style(q('#folding'));
    return {
      progress: Number(q('#stage').dataset.progress),
      paper: style(q('#paper-object')).transform,
      vertical: style(q('.fold-panel.right')).transform,
      horizontal: style(q('.fold-row.lower')).transform,
      vShade: Number(folding.getPropertyValue('--hinge-v')),
      hShade: Number(folding.getPropertyValue('--hinge-h')),
      display: folding.display,
      original: style(q('#newspaper')).visibility
    };
  });
}
async function safety(page, label) {
  ok(await page.evaluate(() => {
    const f = document.querySelector('#folding');
    return f.inert && f.getAttribute('aria-hidden') === 'true' && !f.querySelector('[id]') &&
      [...f.querySelectorAll('.newspaper')].every(n => n.inert && n.getAttribute('aria-hidden') === 'true') &&
      [...f.querySelectorAll('button,a,input,select,textarea,[tabindex]')].every(n => n.tabIndex === -1);
  }), `${label}: replicas inert, aria-hidden, ID-free and no tab stops`);
  ok(await page.locator('.fold-face').evaluateAll(ns => ns.every(n => {
    const s = getComputedStyle(n);
    return s.borderTopWidth === '0px' && s.borderRightWidth === '0px' && s.borderBottomWidth === '0px' && s.borderLeftWidth === '0px' && s.boxShadow === 'none';
  })), `${label}: no panel borders or panel box shadows`);
  ok(await page.evaluate(() => {
    const original = document.querySelector('#newspaper');
    const clones = [...document.querySelectorAll('#folding .newspaper')];
    return clones.every(n => n.offsetWidth === original.offsetWidth && n.offsetHeight === original.offsetHeight &&
      ['::before', '::after'].every(p => {
        const a = getComputedStyle(original, p), b = getComputedStyle(n, p);
        return a.backgroundImage === b.backgroundImage && a.backgroundSize === b.backgroundSize && a.opacity === b.opacity;
      }));
  }), `${label}: full-size clone dimensions and both worn crease layers match canonical DOM`);
  ok(await page.locator('.fold-face.back, .lower-back').evaluateAll(ns => ns.length === 6 && ns.every(n => {
    const s = getComputedStyle(n);
    return n.childElementCount === 0 && n.textContent.trim() === '' && s.backgroundImage.includes('paper-texture.webp');
  })), `${label}: both fold backs and static pocket paper are unprinted textured surfaces`);
  ok(await page.locator('.fold-face.back').evaluateAll(ns => ns.every(n => {
    const s = getComputedStyle(n, '::after');
    return s.backgroundImage.includes('paper-crease-h.svg') && Number(s.opacity) === .68;
  })), `${label}: first-fold backs retain existing faint horizontal wear`);
}
async function staticPocket(page, label) {
  await page.locator('nav [data-nav="bag"]').click();
  ok(await page.locator('.static-pocket-paper').evaluate(n => {
    const s = getComputedStyle(n), r = n.getBoundingClientRect();
    return n.inert && n.getAttribute('aria-hidden') === 'true' && n.childElementCount === 0 && n.textContent === '' &&
      s.display === 'block' && s.backgroundImage.includes('paper-texture.webp') && r.width > 0 && r.height > 0;
  }), `${label}: static pocket replica remains blank, textured, rendered and inert`);
  await snapshot(page, `${label}-static-pocket-paper`);
}
// Decode screenshots inside the existing browser; no extra image library or network.
async function compare(page, before, after, regions) {
  return page.evaluate(async ({ a, b, regions }) => {
    async function decode(src) {
      const image = new Image(); image.src = src; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
      return ctx.getImageData(0, 0, canvas.width, canvas.height);
    }
    const [aPixels, bPixels] = await Promise.all([decode(a), decode(b)]);
    return regions.map(({ name, x, y, width, height }) => {
      let total = 0, changed = 0, max = 0;
      for (let j = y; j < y + height; j++) for (let i = x; i < x + width; i++) {
        let peak = 0;
        for (let c = 0; c < 3; c++) {
          const index = (j * aPixels.width + i) * 4 + c;
          const delta = Math.abs(aPixels.data[index] - bPixels.data[index]);
          total += delta; peak = Math.max(peak, delta);
        }
        max = Math.max(max, peak); if (peak > 8) changed++;
      }
      return { name, meanAbsoluteChannelDelta: total / (width * height * 3), fractionPixelsOver8: changed / (width * height), max };
    });
  }, { a: `data:image/png;base64,${before.toString('base64')}`, b: `data:image/png;base64,${after.toString('base64')}`, regions });
}
async function montage(page, buffers, crop, name) {
  const encoded = await page.evaluate(async ({ sources, crop }) => {
    const canvas = document.createElement('canvas'); canvas.width = crop.width * sources.length; canvas.height = crop.height;
    const ctx = canvas.getContext('2d');
    for (let i = 0; i < sources.length; i++) {
      const image = new Image(); image.src = sources[i]; await image.decode();
      ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height, i * crop.width, 0, crop.width, crop.height);
    }
    return canvas.toDataURL('image/png').split(',')[1];
  }, { sources: buffers.map(b => `data:image/png;base64,${b.toString('base64')}`), crop });
  fs.writeFileSync(path.join(review, `${name}.png`), Buffer.from(encoded, 'base64'));
}
async function run() {
  const options = { headless: true }; if (process.env.CHROME_PATH) options.executablePath = process.env.CHROME_PATH;
  const browser = await chromium.launch(options);
  try {
    for (const viewport of [{ width: 1440, height: 960 }, { width: 1920, height: 958 }]) {
      const label = `${viewport.width}x${viewport.height}`;
      const page = await browser.newPage({ viewport }); watch(page);
      await page.goto(url); await page.waitForTimeout(150);
      await seek(page, .141); // Measure replicas while their clipping host is displayed.
      await safety(page, label);
      await seek(page, .139);
      const box = await page.locator('#newspaper').boundingBox();
      const flat = await snapshot(page, `${label}-zero-reading`);
      // Hold native progress before onset; expose precisely the flat clipped surfaces.
      // This isolates DOM handoff registration from actual 3D perspective movement.
      await page.evaluate(() => {
        document.querySelector('#newspaper').style.visibility = 'hidden';
        document.querySelector('#folding').style.display = 'block';
      });
      const replica = await snapshot(page, `${label}-zero-surfaces`);
      const x = Math.round(box.x), y = Math.round(box.y), w = Math.round(box.width), h = Math.round(box.height);
      const comparisons = await compare(page, flat, replica, [
        { name: 'paper-interior', x: x + 2, y: y + 2, width: w - 4, height: h - 4 },
        { name: 'vertical-crease', x: x + w / 2 - 16, y: y + 2, width: 32, height: h - 4 },
        { name: 'horizontal-crease', x: x + 2, y: y + h / 2 - 14, width: w - 4, height: 28 }
      ]);
      pixels.push({ viewport: label, comparisons });
      for (const c of comparisons) {
        // Chrome's composited 3D surfaces can round RGB by a few levels even at 0°.
        // Bound every pixel as well as the mean, so a thin seam cannot hide in an average.
        ok(c.meanAbsoluteChannelDelta < 1 && c.max <= 4,
          `${label}: zero-angle ${c.name} registration (mean <1/255; every channel delta <=4/255)`);
      }
      await seek(page, .138); // Restore ordinary rendering, no persistent test override.
      const keyframes = [.139, .140, .141, .16, .18, .20, .22, .24, .26, .28, .30, .365, .46];
      const forward = new Map(), onset = [];
      for (const p of keyframes) {
        await seek(page, p);
        const s = await state(page); forward.set(p, s); samples.push({ viewport: label, requested: p, ...s });
        const buffer = await snapshot(page, `${label}-${p.toFixed(3)}`);
        if (p <= .141) onset.push(buffer);
        if (p === .18) ok(s.vShade > .999 && s.hShade === 0, `${label}: first midpoint deepens only vertical hinge`);
        if (p === .26) ok(s.vShade === 0 && s.hShade > .999, `${label}: second midpoint deepens only horizontal hinge`);
        if (p === .30) ok(s.vShade === 0 && s.hShade < .003, `${label}: completed folds release contact shading`);
      }
      await montage(page, onset, { x: x + w / 2 - 210, y: y + h / 2 - 180, width: 420, height: 360 }, `${label}-onset-strip-139-140-141`);
      for (const p of [...keyframes].reverse()) {
        await seek(page, p); assert.deepEqual(await state(page), forward.get(p));
        results.push(`${label}: reverse state matches at ${p}`);
        if ([.139, .140, .141, .18, .26, .30].includes(p)) await snapshot(page, `${label}-reverse-${p.toFixed(3)}`);
      }
      // Exact endpoint matrices retain the two independent 180-degree folds.
      await seek(page, .221);
      ok(await page.locator('.fold-panel.right').evaluateAll(ns => ns.every(n => {
        const m = new DOMMatrix(getComputedStyle(n).transform); return Math.abs(m.m11 + 1) < .00001 && Math.abs(m.m33 + 1) < .00001;
      })), `${label}: first hinge reaches 180 degrees`);
      await seek(page, .301);
      ok(await page.locator('.fold-row.lower').evaluate(n => {
        const m = new DOMMatrix(getComputedStyle(n).transform); return Math.abs(m.m22 + 1) < .00001 && Math.abs(m.m33 + 1) < .00001;
      }), `${label}: second hinge reaches 180 degrees`);
      await page.locator('#motion-toggle').click();
      await page.locator('nav [data-nav="paper"]').click();
      await snapshot(page, `${label}-manual-static`);
      ok(await page.locator('#newspaper').evaluate(n => !n.inert && getComputedStyle(n).visibility === 'visible'), `${label}: static canonical paper readable and active`);
      await staticPocket(page, label);
      await page.close();
    }
    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); watch(mobile);
    await mobile.goto(url); await mobile.waitForTimeout(150); await safety(mobile, '390x844');
    await snapshot(mobile, '390x844-first-view');
    await mobile.locator('#newspaper').screenshot({ path: path.join(review, '390x844-complete-newspaper.png') });
    ok(await mobile.locator('#newspaper').evaluate(n => n.offsetHeight > 1500 && getComputedStyle(n.querySelector('.headline h2')).fontSize === '28px'), 'Mobile paper reflows, not scaled to read');
    const forward = new Map();
    for (const p of [0, .034, .035, .036, .0825, .13, .175, .22, .28]) {
      await seek(mobile, p); forward.set(p, await state(mobile));
      if (p === .034) ok(await mobile.locator('#newspaper').evaluate(n => !n.inert && getComputedStyle(n).visibility === 'visible'), 'Mobile reading DOM remains active before fold onset');
      if (p === .036) ok(await mobile.locator('#newspaper').evaluate(n => n.inert && getComputedStyle(n).visibility === 'hidden'), 'Mobile fold hides reading DOM: no duplicate paper or ghost crease behind moving surfaces');
      await snapshot(mobile, `390x844-${p.toFixed(4)}`);
    }
    for (const [p, s] of [...forward].reverse()) {
      await seek(mobile, p); assert.deepEqual(await state(mobile), s); results.push(`Mobile reverse state matches at ${p}`);
      if ([.0825, .175, .22].includes(p)) await snapshot(mobile, `390x844-reverse-${p.toFixed(4)}`);
    }
    await mobile.emulateMedia({ reducedMotion: 'reduce' });
    await mobile.locator('nav [data-nav="paper"]').click(); await snapshot(mobile, '390x844-reduced-newspaper');
    ok(await mobile.evaluate(() => {
      const n = document.querySelector('#newspaper'), r = n.getBoundingClientRect();
      return document.body.classList.contains('static') && getComputedStyle(document.querySelector('#folding')).display === 'none' && !n.inert && r.width > 300 && r.height > 1500 && r.top < 150 && r.bottom > innerHeight;
    }), 'Reduced mobile shows an actually rendered, native-size canonical paper in view, not replicas');
    ok(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile static has no horizontal page overflow');
    await staticPocket(mobile, '390x844-reduced');
    const reduced = await browser.newPage({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' }); watch(reduced);
    await reduced.goto(url); await snapshot(reduced, '1440x960-reduced-newspaper');
    ok(await reduced.locator('#newspaper').evaluate(n => getComputedStyle(n, '::before').backgroundImage.includes('paper-crease-v.svg') && getComputedStyle(n, '::after').backgroundImage.includes('paper-crease-h.svg')), 'Reduced desktop retains both original worn axes');
    await staticPocket(reduced, '1440x960-reduced');
    ok(errors.length === 0, 'No page errors'); ok(external.length === 0, 'No HTTP(S) requests');
    fs.writeFileSync(path.join(review, 'results.json'), JSON.stringify({ status: 'passed', checks: results.length, browser: await browser.version(), results, pixels, samples, pageErrors: errors, externalRequests: external }, null, 2) + '\n');
    console.log(`PASS: ${results.length} focused fold checks; Chrome ${await browser.version()}; evidence ${review}`);
  } finally { await browser.close(); }
}
run().catch(e => {
  console.error(e.stack);
  fs.writeFileSync(path.join(review, 'failure.txt'), `${e.stack}\n${JSON.stringify({ pixels, results, errors, external }, null, 2)}\n`);
  process.exitCode = 1;
});
