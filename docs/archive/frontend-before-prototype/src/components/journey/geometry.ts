/** Native-scroll progress. Every pose is a pure function, so reverse scrolling is exact. */
export const clamp = (n: number) => Math.max(0, Math.min(1, n));
export const phase = (n: number, from: number, to: number) => n >= to - .001 ? 1 : n <= from + .001 ? 0 : clamp((n - from) / (to - from));
export const mix = (a: number, b: number, p: number) => a + (b - a) * p;
export function foldPose(p: number) {
  return { first: phase(p, .08, .28), second: phase(p, .34, .54), align: phase(p, .54, .75), descend: phase(p, .75, .85), lift: phase(p, .85, .92), travel: phase(p, .92, 1) };
}
export function bookPose(p: number) {
  return { lift: phase(p, 0, .35), travel: phase(p, .35, .72), open: phase(p, .72, 1) };
}
export function slipPose(p: number) {
  return { turn: phase(p, 0, .28), lift: phase(p, .4, .56), travel: phase(p, .56, .9), settle: phase(p, .9, 1) };
}
/** A visual-only copy can never introduce an ID, a form, or an accessible control. */
export function decorativeCopy(source: HTMLElement) {
  const clone = source.cloneNode(true) as HTMLElement;
  for (const node of [clone, ...clone.querySelectorAll<HTMLElement>("*")]) {
    for (const attr of [...node.attributes]) if (attr.name === "id" || attr.name.startsWith("aria-") || attr.name === "for" || attr.name === "name" || attr.name === "data-genre") node.removeAttribute(attr.name);
    if (node.matches("a,button,input,select,textarea,summary,[tabindex]")) node.setAttribute("tabindex", "-1");
  }
  clone.inert = true; clone.setAttribute("aria-hidden", "true");
  return clone;
}
