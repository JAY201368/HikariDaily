/** One deliberate wheel burst advances one file/leaf, including inertial tails. */
export class PaperWheelGesture {
  private last = -Infinity;
  private amount = 0;
  private used = false;
  consume(delta: number, mode: number, height: number, now: number) {
    if (now - this.last > 220) { this.amount = 0; this.used = false; }
    this.last = now;
    if (this.used) return 0;
    this.amount += delta * (mode === 1 ? 16 : mode === 2 ? height : 1);
    if (Math.abs(this.amount) < 52) return 0;
    this.used = true;
    return Math.sign(this.amount);
  }
}
export function paperGestureProtected(target: EventTarget | null, boundary: HTMLElement) {
  if (!(target instanceof Element)) return false;
  if (target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[data-paper-wheel-native]')) return true;
  for (let node: Element | null = target; node && node !== boundary; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 1) return true;
  }
  return false;
}
/** Native non-passive listener belongs to this paper window, never the document. */
export function bindPaperGestures(node: HTMLElement, move: (delta: number) => boolean, contain = false) {
  const wheel = new PaperWheelGesture(); let composing = false, dragging = false;
  let touch: { x: number; y: number; protected: boolean } | null = null;
  const compositionStart = () => { composing = true; }, compositionEnd = () => { composing = false; };
  const pointerDown = (event: PointerEvent) => { if (event.pointerType !== 'touch') dragging = true; };
  const pointerUp = () => { dragging = false; };
  const blocked = (event: Event) => composing || dragging || paperGestureProtected(event.target,node) || !!window.getSelection()?.toString();
  const onWheel = (event: WheelEvent) => {
    if (event.ctrlKey || event.metaKey || Math.abs(event.deltaX)>Math.abs(event.deltaY) || blocked(event)) return;
    const delta = wheel.consume(event.deltaY,event.deltaMode,node.clientHeight,event.timeStamp);
    if (delta && move(delta)) event.preventDefault();
    else if (contain) event.preventDefault();
  };
  const key = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.isComposing || blocked(event)) return;
    const delta = ['ArrowRight','ArrowDown','PageDown'].includes(event.key) ? 1 : ['ArrowLeft','ArrowUp','PageUp'].includes(event.key) ? -1 : 0;
    if (delta && move(delta)) event.preventDefault();
  };
  const start = (event: TouchEvent) => { const p=event.touches.length===1?event.touches[0]:null; touch = p ? {x:p.clientX,y:p.clientY,protected:blocked(event)} : null; };
  const touchMove=(event:TouchEvent)=>{if(event.touches.length!==1)touch=null;};
  const end = (event: TouchEvent) => { const p=event.changedTouches[0], t=touch; touch=null; if (!p || !t || t.protected || blocked(event)) return; const dx=t.x-p.clientX,dy=t.y-p.clientY; if(Math.max(Math.abs(dx),Math.abs(dy))>60)move(Math.sign(Math.abs(dx)>Math.abs(dy)?dx:dy)); };
  node.addEventListener('wheel',onWheel,{passive:false}); node.addEventListener('keydown',key);
  node.addEventListener('compositionstart',compositionStart); node.addEventListener('compositionend',compositionEnd);
  node.addEventListener('pointerdown',pointerDown); window.addEventListener('pointerup',pointerUp); window.addEventListener('pointercancel',pointerUp);
  node.addEventListener('touchstart',start,{passive:true});node.addEventListener('touchend',end,{passive:true});node.addEventListener('touchmove',touchMove,{passive:true});
  return () => {node.removeEventListener('wheel',onWheel);node.removeEventListener('keydown',key);node.removeEventListener('compositionstart',compositionStart);node.removeEventListener('compositionend',compositionEnd);node.removeEventListener('pointerdown',pointerDown);window.removeEventListener('pointerup',pointerUp);window.removeEventListener('pointercancel',pointerUp);node.removeEventListener('touchstart',start);node.removeEventListener('touchend',end);node.removeEventListener('touchmove',touchMove);};
}
