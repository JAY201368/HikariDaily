import { beforeEach, expect, it, vi } from 'vitest';
beforeEach(()=>vi.resetModules());
const deferred=()=>{let resolve!:()=>void;const promise=new Promise<void>(r=>{resolve=r;});return {promise,resolve};};
it('opens the replacement mount when an obsolete open completes',async()=>{
 const peer=await import('../../src/components/prototype-frontend/peer-objects');const gate=deferred();
 const old={open:vi.fn(()=>gate.promise),close:vi.fn(async()=>{})};
 const remove=peer.registerPeer('handbook',old);peer.requestPeer('handbook');await vi.waitFor(()=>expect(old.open).toHaveBeenCalledOnce());
 remove();const fresh={open:vi.fn(async()=>{}),close:vi.fn(async()=>{})};peer.registerPeer('handbook',fresh);peer.requestPeer('handbook',null,true);gate.resolve();
 await vi.waitFor(()=>expect(fresh.open).toHaveBeenCalledOnce());expect(old.close).toHaveBeenCalledOnce();
});
it('rechecks the newest mount and intent after a pending return',async()=>{
 const peer=await import('../../src/components/prototype-frontend/peer-objects');const gate=deferred();
 const old={open:vi.fn(async()=>{}),close:vi.fn(()=>gate.promise)};
 peer.registerPeer('handbook',old);peer.requestPeer('handbook');await vi.waitFor(()=>expect(old.open).toHaveBeenCalledOnce());
 peer.requestPeer('subscription');await vi.waitFor(()=>expect(old.close).toHaveBeenCalledOnce());
 const fresh={open:vi.fn(async()=>{}),close:vi.fn(async()=>{})};peer.registerPeer('handbook',fresh);peer.requestPeer('handbook');gate.resolve();
 await vi.waitFor(()=>expect(fresh.open).toHaveBeenCalledOnce());expect(peer.activePeer()).toBe('handbook');
});
it('coalesces rapid switches without opening an abandoned peer',async()=>{
 const peer=await import('../../src/components/prototype-frontend/peer-objects');const gate=deferred();
 const book={open:vi.fn(()=>gate.promise),close:vi.fn(async()=>{})},slip={open:vi.fn(async()=>{}),close:vi.fn(async()=>{})};
 peer.registerPeer('handbook',book);peer.registerPeer('subscription',slip);peer.requestPeer('handbook');peer.requestPeer('subscription');peer.requestPeer(null);gate.resolve();
 await vi.waitFor(()=>expect(book.close).toHaveBeenCalledOnce());expect(slip.open).not.toHaveBeenCalled();expect(peer.activePeer()).toBeNull();
});
it('releases reconciliation after a failed handler',async()=>{
 const peer=await import('../../src/components/prototype-frontend/peer-objects');const broken={open:vi.fn(async()=>{throw Error('failed');}),close:vi.fn(async()=>{})};peer.registerPeer('handbook',broken);peer.requestPeer('handbook');
 await vi.waitFor(()=>expect(broken.close).toHaveBeenCalledOnce());const fresh={open:vi.fn(async()=>{}),close:vi.fn(async()=>{})};peer.registerPeer('subscription',fresh);peer.requestPeer('subscription');await vi.waitFor(()=>expect(fresh.open).toHaveBeenCalledOnce());
});
