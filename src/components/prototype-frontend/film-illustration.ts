import type { GenreAdvice } from '../../domain/types';

type FilmStock = { brand: string; name: string; speed: string; image: string };

// Presentation examples only; the weather-based film advice stays brand-neutral.
function stocks(film: GenreAdvice['film']): FilmStock[] {
 const low = film.sensitivity === '低感';
 const high = film.sensitivity.includes('高感');
 if (film.type === '黑白负片') {
  const speed = low ? '100' : high ? '3200' : '400';
  return [
   { brand: 'ILFORD', name: 'DELTA', speed, image: `ilford-delta-${speed}` },
   { brand: 'Kodak', name: 'T-MAX', speed: high ? 'P3200' : speed, image: `kodak-t-max-${high ? 'p3200' : speed}` },
  ];
 }
 if (film.type === '彩色反转片') {
  return [{ brand: 'FUJICHROME', name: 'PROVIA', speed: '100F', image: 'fuji-provia-100f' }];
 }
 if (film.type === '彩色负片') {
  return [low
   ? { brand: 'Kodak', name: 'GOLD', speed: '200', image: 'kodak-gold-200' }
   : high
    ? { brand: 'Kodak', name: 'PORTRA', speed: '800', image: 'kodak-portra-800' }
    : { brand: 'Kodak', name: 'ULTRAMAX', speed: '400', image: 'kodak-ultramax-400' }];
 }
 return [];
}

export function filmIllustrationHtml(film: GenreAdvice['film']): string {
 const examples = stocks(film);
 if (!examples.length) return '';
 // Labels and local image paths come from the authored catalogue, never API text.
 return `<div class="film-cans${examples.length > 1 ? ' film-cans--pair' : ''}">${examples.map(stock =>
  `<img class="film-can" src="/films/illustrated/${stock.image}.webp" width="50" height="67" alt="${stock.brand} ${stock.name} ${stock.speed}" title="${stock.brand} ${stock.name} ${stock.speed}" decoding="async">`
 ).join('')}</div>`;
}
