/** Page-local coordination. No private content or persisted HTML crosses this boundary. */
export type PeerObject = 'handbook' | 'subscription' | 'planner';
export type PeerPhase = 'docked' | 'extracting' | 'travelling' | 'opening' | 'reading';
type Handler = { open: (trigger: HTMLElement | null, immediate: boolean) => Promise<void>; close: (immediate: boolean) => Promise<void> };
const handlers=new Map<PeerObject,Handler>();
let current:{value:PeerObject;handler:Handler}|null=null,desired:PeerObject|null=null,running=false;
let trigger:HTMLElement|null=null,instant=false;
export function activePeer(){return desired;}
async function reconcile(){
  if(running)return;
  running=true;
  try{
    for(;;){
      // Handler identity is its mount generation. An obsolete completion can never
      // establish that a replacement runtime has opened its new physical nodes.
      if(current&&(current.value!==desired||handlers.get(current.value)!==current.handler)){
        const previous=current;current=null;await previous.handler.close(instant);continue;
      }
      if(!current&&desired){
        const handler=handlers.get(desired);if(!handler)break;
        current={value:desired,handler};await handler.open(trigger,instant);continue;
      }
      break;
    }
  }catch{
    const failed=current;current=null;desired=null;
    await failed?.handler.close(true);
  }finally{running=false;}
}
export function requestPeer(value:PeerObject|null,opener:HTMLElement|null=null,immediate=false){const changed=desired!==value;desired=value;trigger=opener;instant=immediate;if(changed&&typeof window!=='undefined')window.dispatchEvent(new Event('hikari:peer-intent'));void reconcile();}
export function registerPeer(value:PeerObject,handler:Handler){
  handlers.set(value,handler);queueMicrotask(()=>void reconcile());
  return()=>{if(handlers.get(value)===handler)handlers.delete(value);queueMicrotask(()=>void reconcile());};
}
export function forgetPeer(value:PeerObject){if(desired===value)desired=null;void reconcile();}
export function reducedObjects(){return document.body.classList.contains('static')||matchMedia('(prefers-reduced-motion:reduce)').matches;}
export async function objectMotion(node:HTMLElement,frames:Keyframe[],duration:number,immediate=false){
  if(immediate||reducedObjects())return;
  const animation=node.animate(frames,{duration,easing:'cubic-bezier(.2,.75,.2,1)',fill:'both'});
  const cancel=()=>animation.cancel();window.addEventListener('hikari:peer-intent',cancel,{once:true});
  try{await animation.finished;}catch{/* teardown or a newer intent cancels this movement */}
  window.removeEventListener('hikari:peer-intent',cancel);animation.cancel();
}
export function rectTransform(from:DOMRect,to:DOMRect){return `translate(${from.left-to.left}px,${from.top-to.top}px) scale(${from.width/to.width},${from.height/to.height})`;}
export function preparePeerDock(){window.dispatchEvent(new Event('hikari:peer-dock'));}
export function dockLift(node:HTMLElement){
  const pose=getComputedStyle(node).transform, matrix=new DOMMatrix(pose==='none'?undefined:pose);
  // Translate in parent CSS pixels, outside the small object's local scale.
  matrix.f-=Math.max(node.offsetHeight*Math.hypot(matrix.c,matrix.d)+45,160);
  return {pose,raised:matrix.toString()};
}
