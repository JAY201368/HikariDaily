import { afterEach, describe, expect, it, vi } from "vitest";
import { BriefingController, type ClientRuntime } from "../../src/components/briefing-client/controller";
import { adviceHtml, bookHtml, detailHtml, newspaperHtml, pageHtml } from "../../src/components/prototype-frontend/adapter";
import { adviceResultSchema, type AdviceContext } from "../../src/domain/workspace/advice";
import { canonicalSnapshot, snapshotHash } from "../../src/domain/workspace/snapshot";
import { homeAdviceFixture, homeContext, homeBaseBriefing } from "../fixtures/workspace/home-advice";
import { createDayHours, shanghaiDate, shanghaiIso } from "../../src/domain/time";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BriefingClient } from "../../src/components/prototype-frontend";
const genres = ["landscape", "portrait", "street"] as const;
const nextOwner = "e0e3081f-2404-4c41-84a8-9a5f74573477";
function deferred<T>() { let resolve!: (value:T)=>void; const promise = new Promise<T>(done => { resolve=done; }); return { resolve, promise }; }
async function harness(initial = false) {
  const base = homeBaseBriefing(); vi.useFakeTimers(); vi.setSystemTime(Date.parse(base.generatedAt));
  const advice = await homeAdviceFixture(base); let context: AdviceContext|null = homeContext;
  const response = vi.fn(async () => Response.json({data:advice,error:null}));
  const fetcher = vi.fn<ClientRuntime["fetch"]>(async url => {
    if (url.endsWith("/context")) return context ? Response.json({data:context,error:null}) : Response.json({data:null,error:{code:"UNAUTHORIZED"}}, {status:401});
    if (url.endsWith("/advice")) return response();
    const b = structuredClone(base); b.location.id=new URL(url,"https://local.test").searchParams.get("place")!;
    b.localDate=shanghaiDate(Date.now()); b.generatedAt=shanghaiIso(Date.now()); b.hours.forEach((h,i)=>Object.assign(h,createDayHours(b.localDate)[i]));
    b.solar.sunset=`${b.localDate}T17:30:00+08:00`;
    return Response.json({data:b,error:null});
  });
  const runtime:ClientRuntime={now:Date.now,fetch:fetcher,visible:()=>true,timer:(cb,ms)=>{const id=setTimeout(cb,ms);return()=>clearTimeout(id);},
    readUrl:()=>`https://local.test/?place=${base.location.id}`,writeUrl:()=>{},readMemory:()=>null,writeMemory:()=>{},workspace:true};
  const controller=new BriefingController({place:base.location.id,genre:"landscape",result:{status:200,data:base,error:null},
    ...(initial?{workspace:{context:homeContext,advice:structuredClone(advice)}}:{})});
  return {base,advice,controller,runtime,fetcher,response,setContext:(value:AdviceContext|null)=>{context=value;}};
}
afterEach(()=>vi.useRealTimers());
const settle = () => vi.advanceTimersByTimeAsync(0);
describe("private homepage narrative lifecycle",()=>{
  it("reuses SSR once across hydration, focus, selection and StrictMode restart",async()=>{
    const h=await harness(true); h.controller.start(h.runtime); await settle();
    expect(h.response).not.toHaveBeenCalled(); expect(h.controller.getSnapshot().advice?.baseBriefing).toBe(h.base);
    h.controller.selectGenre("portrait");h.controller.selectHour(17);h.controller.focusChanged();await settle();
    h.controller.stop();h.controller.start(h.runtime);await settle();expect(h.response).not.toHaveBeenCalled();
    expect(h.controller.getSnapshot().advice?.enhancement.portrait.status).toBe("generated");h.controller.stop();
  });
  it("validates and installs the API's newer authoritative base and hash together",async()=>{
    const h=await harness(), original=canonicalSnapshot(h.base),newBase=structuredClone(h.base);newBase.generatedAt="2026-10-22T12:00:01+08:00";
    const newer=await homeAdviceFixture(newBase);h.response.mockResolvedValue(Response.json({data:newer,error:null}));
    h.controller.start(h.runtime);await vi.waitFor(()=>expect(h.controller.getSnapshot().advice).not.toBeNull());
    expect(h.controller.getSnapshot().result?.data?.generatedAt).toBe(newBase.generatedAt);
    expect(h.controller.getSnapshot().advice?.factsHash).toBe(await snapshotHash(newBase));
    expect(h.controller.getSnapshot().advice?.baseBriefing).toBe(h.controller.getSnapshot().result?.data);
    expect(canonicalSnapshot(h.base)).toBe(original);h.controller.stop();
  });
  it.each(["owner","config","location","snapshot"])("discards late %s responses even if transport ignores cancellation",async mode=>{
    const h=await harness(),old=deferred<Response>();h.response.mockReturnValueOnce(old.promise);
    h.controller.start(h.runtime);await settle();expect(h.response).toHaveBeenCalledTimes(1);
    if(mode==="owner")h.setContext({...homeContext,ownerId:nextOwner,enabled:false,reason:"MODEL_NOT_CONFIGURED"});
    if(mode==="config")h.setContext({...homeContext,configVersion:2,enabled:false,reason:"MODEL_NOT_CONFIGURED"});
    if(mode==="location")h.controller.selectPlace("geonames:1816670");
    else if(mode==="snapshot") {h.setContext(null);h.controller.retry();}
    else h.controller.workspaceChanged();
    await settle();old.resolve(Response.json({data:h.advice,error:null}));await settle();
    expect(h.controller.getSnapshot().advice).toBeNull();
    if(mode==="location")expect(h.controller.getSnapshot().result?.data?.location.id).toBe("geonames:1816670");
    h.controller.stop();
  });
  it("checks the current cookie identity after generation even without an invalidation event",async()=>{
    const h=await harness(),pending=deferred<Response>();h.response.mockReturnValue(pending.promise);h.controller.start(h.runtime);await settle();
    h.setContext({...homeContext,ownerId:nextOwner});pending.resolve(Response.json({data:h.advice,error:null}));await settle();
    await vi.waitFor(()=>expect(h.controller.getSnapshot().adviceContext?.ownerId).toBe(nextOwner));expect(h.controller.getSnapshot().advice).toBeNull();h.controller.stop();
  });
  it.each(["hash","constraints","short","owner","config"])("rejects mismatched %s and leaves the displayed base intact",async mode=>{
    const h=await harness(),bad=structuredClone(h.advice);
    if(mode==="hash")bad.factsHash="0".repeat(64);
    if(mode==="constraints")bad.enhancement.landscape.constraints.limitations=["伪造限制"];
    if(mode==="short")bad.enhancement.landscape.short!.newspaper="伪造短文。";
    if(mode==="owner")bad.metadata.ownerId=nextOwner;if(mode==="config")bad.metadata.configVersion=2;
    h.response.mockResolvedValue(Response.json({data:bad,error:null}));h.controller.start(h.runtime);await settle();
    expect(h.controller.getSnapshot().advice).toBeNull();expect(h.controller.getSnapshot().result?.data).toBe(h.base);h.controller.stop();
  });
  it("keeps a failed attempt bounded on focus and retries only on explicit request",async()=>{
    const h=await harness();h.response.mockRejectedValue(new Error("network"));h.controller.start(h.runtime);await settle();
    h.controller.focusChanged();await settle();expect(h.response).toHaveBeenCalledTimes(1);
    h.controller.retryAdvice();await settle();expect(h.response).toHaveBeenCalledTimes(2);h.controller.stop();
  });
  it("clears a pending response crossing midnight and reloads the new day",async()=>{
    const h=await harness(),pending=deferred<Response>();h.response.mockReturnValue(pending.promise);h.controller.start(h.runtime);await settle();
    vi.setSystemTime(Date.parse("2026-10-23T00:00:01+08:00"));h.setContext(null);h.controller.focusChanged();await settle();
    pending.resolve(Response.json({data:h.advice,error:null}));await settle();expect(h.controller.getSnapshot().advice).toBeNull();
    expect(h.controller.getSnapshot().result?.data?.localDate).toBe("2026-10-23");h.controller.stop();
  });
  it.each([401,503])("workspace %s leaves ordinary weather and rule suggestions usable",async status=>{
    const h=await harness();h.setContext(null);if(status===503)h.fetcher.mockResolvedValueOnce(Response.json({data:null,error:{code:"WORKSPACE_UNAVAILABLE"}},{status}));h.controller.start(h.runtime);await settle();
    expect(h.response).not.toHaveBeenCalled();expect(h.controller.getSnapshot().result?.data).toBe(h.base);h.controller.stop();
  });
});
describe("all advice projections share full text, facts and actual citations",()=>{
  it("shows concrete knowledge coverage for a per-genre fallback without blocking the weather",async()=>{
    const advice=await homeAdviceFixture(),base=advice.baseBriefing;
    advice.enhancement.portrait={...advice.enhancement.portrait,status:"fallback",reason:"KNOWLEDGE_NOT_COVERED",full:null,short:null,evidence:[]};
    const html=renderToStaticMarkup(createElement(BriefingClient,{initialPlace:base.location.id,initialGenre:"portrait",initialResult:{status:200,data:base,error:null},initialWorkspace:{context:homeContext,advice}}));
    expect(html.includes("摄影知识暂无匹配条目，使用规则建议")).toBe(true);expect(html.includes('id="newspaper"')).toBe(true);
  });
  it("preserves every base object and projects matching short/full text in paper, book, static and no-script",async()=>{
    const advice=await homeAdviceFixture(),b=advice.baseBriefing,before=canonicalSnapshot(b);
    expect(adviceResultSchema.safeParse(advice).success).toBe(true);
    const paper=newspaperHtml(b,advice),book=bookHtml(b,advice),page=pageHtml(b,12,advice);
    for(const g of genres){const n=advice.enhancement[g].full!,full=adviceHtml(b,g,advice);
      expect(paper.includes(n.subject.short)).toBe(true);expect(book.includes(n.light.short)).toBe(true);
      for(const f of Object.values(n)){expect(full.includes(f.text)).toBe(true);expect(page.includes(f.text)).toBe(true);}
      expect(full.includes(b.advice[g].timing)).toBe(true);expect(full.includes(b.advice[g].film.type)).toBe(true);expect(full.includes(b.advice[g].film.caveat)).toBe(true);
      expect(detailHtml(b,`advice-${g}`,12,advice)).toBe(full);expect(full.includes("CC BY 4.0")).toBe(true);
    }
    expect(canonicalSnapshot(b)).toBe(before);expect(page.includes('class="full-advice-reading"')).toBe(true);expect(page.includes('<noscript>')).toBe(true);expect(page.includes('class="bag-reserved-slot"')).toBe(true);
  });
  it("escapes model and evidence text at every imperative HTML outlet",async()=>{
    const advice=await homeAdviceFixture(),x=advice.enhancement.landscape;x.full!.light.text='<img src=x onerror="bad()">';x.short!.newspaper='<script>bad()</script>';x.evidence[0]={...x.evidence[0],title:'<script>citation()</script>'};
    const html=pageHtml(advice.baseBriefing,12,advice);expect(html.includes('<script>bad()')).toBe(false);expect(html.includes('<img src=x')).toBe(false);
    expect(html.includes('&lt;img')).toBe(true);expect(html.includes('&lt;script&gt;')).toBe(true);
  });
});
