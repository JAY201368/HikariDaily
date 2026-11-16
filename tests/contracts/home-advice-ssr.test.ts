import { describe, expect, it, vi } from "vitest";
vi.mock("server-only",()=>({}));
import { loadHomeAdvice, handleAdviceContext } from "../../src/server/workspace/home-advice";
import { homeAdviceFixture, homeContext } from "../fixtures/workspace/home-advice";
import { qualityBriefing } from "../fixtures/workspace/advice";
const request=(authenticated=true)=>new Request("https://hikari.invalid/",{headers:authenticated?{cookie:`hikari_identity.session_token=${"a".repeat(43)}`}:{}});
describe("private SSR advice uses one already loaded fact snapshot",()=>{
  it("does not consult persistence for anonymous weather",async()=>{
    const getAdviceContext=vi.fn(),enhanceBriefing=vi.fn(),rateLimit=vi.fn();
    expect(await loadHomeAdvice(qualityBriefing(),request(false),{getAdviceContext,enhanceBriefing,rateLimit})).toEqual({context:null,advice:null});
    expect(getAdviceContext).not.toHaveBeenCalled();expect(enhanceBriefing).not.toHaveBeenCalled();
  });
  it("enhances the exact same deterministic base once, returning the initial attempt for hydration",async()=>{
    const base=qualityBriefing(),advice=await homeAdviceFixture(base),getAdviceContext=vi.fn(async()=>homeContext),enhanceBriefing=vi.fn(async (...args: Parameters<typeof import("../../src/server/workspace/advice").enhanceBriefing>)=>{expect(args[1]).toBe(base);return advice;}),rateLimit=vi.fn(async()=>{});
    const result=await loadHomeAdvice(base,request(),{getAdviceContext,enhanceBriefing,rateLimit});
    expect(result.advice).toBe(advice);expect(enhanceBriefing).toHaveBeenCalledTimes(1);expect(enhanceBriefing.mock.calls[0][1]).toBe(base);
    expect(rateLimit).toHaveBeenCalledWith(`advice:${homeContext.ownerId}`,12);
  });
  it("no Key and persistence/model failures remain local to the enhancement",async()=>{
    const base=qualityBriefing(),enhanceBriefing=vi.fn(),rateLimit=vi.fn(async()=>{});
    const context={...homeContext,enabled:false,reason:"MODEL_NOT_CONFIGURED"};
    expect(await loadHomeAdvice(base,request(),{getAdviceContext:async()=>context,enhanceBriefing,rateLimit})).toEqual({context,advice:null});
    expect(await loadHomeAdvice(base,request(),{getAdviceContext:async()=>{throw Error("db");},enhanceBriefing,rateLimit})).toEqual({context:null,advice:null});
    expect(enhanceBriefing).not.toHaveBeenCalled();
    expect((await loadHomeAdvice(base,request(),{getAdviceContext:async()=>homeContext,enhanceBriefing:async()=>{throw Error("model");},rateLimit})).advice).toBeNull();
  });
  it("the read-only context rejects anonymous sessions and has no-store headers",async()=>{
    const response=await handleAdviceContext(request(false));expect(response.status).toBe(401);expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(JSON.stringify(await response.json())).not.toContain("apiKey");
  });
});
