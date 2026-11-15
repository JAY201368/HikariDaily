'use strict';
// Shared browser helper targets the current slider-semantic 24h watch, not retired UI.
function hourDial(page) { return page.getByRole('slider', { name: '拨针选择样例小时，北京时间' }); }
async function dialPoint(page, hour, radius = .37) {
  const box = await hourDial(page).boundingBox();
  const angle = hour * Math.PI / 12;
  return { x: box.x + box.width * (.5 + Math.sin(angle) * radius), y: box.y + box.height * (.5 - Math.cos(angle) * radius) };
}
async function chooseHour(page, hour) {
  const point = await dialPoint(page,hour);
  await page.mouse.click(point.x,point.y);
}
module.exports = { hourDial, dialPoint, chooseHour };
