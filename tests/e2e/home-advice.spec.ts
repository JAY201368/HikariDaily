import { test, expect, type BrowserContext } from "@playwright/test";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homeBaseBriefing } from "../fixtures/workspace/home-advice";
import type { AdviceEnhancementResult } from "../../src/domain/workspace/advice";
test.skip(!process.env.HIKARI_TEST_DATABASE_URL||process.env.HIKARI_SOURCE_MODE!=="fixture","Explicit isolated database and weather fixtures required");
const origin="http://localhost:3100";
async function bridge(context:BrowserContext,input:Record<string,unknown>){
  const token=(await context.cookies()).find(c=>c.name==="hikari_identity.session_token")?.value;
  return new Promise<{data:AdviceEnhancementResult;error?:unknown}>((resolve,reject)=>{
    const child=spawn(process.execPath,["--conditions=react-server","--import","tsx","tests/fixtures/workspace/advice-model-bridge.ts"],{env:{...process.env,HIKARI_AUTH_SECRET:process.env.HIKARI_AUTH_SECRET || "explicit-e2e-identity-test-secret-32",AUTHING_APP_HOST:"https://identity.example.invalid",AUTHING_APP_ID:"test-client",AUTHING_APP_SECRET:"test-client-secret",HIKARI_APP_ORIGIN:origin},stdio:["pipe","pipe","pipe"]});
    const output:Buffer[]=[],errors:Buffer[]=[];const timeout=setTimeout(()=>{child.kill();reject(Error("Explicit advice bridge timed out"));},30000);
    child.stdout.on("data",chunk=>output.push(chunk));child.stderr.on("data",chunk=>errors.push(chunk));child.on("error",reject);child.on("close",code=>{clearTimeout(timeout);if(code)reject(Error(Buffer.concat(errors).toString("utf8")));else {try{resolve(JSON.parse(Buffer.concat(output).toString("utf8")));}catch{reject(Error("Invalid bridge result"));}}});child.stdin.end(JSON.stringify({token,...input}));
  });
}
test("same real advice service result in newspaper/manual/full reading, then fallback after removing the model Key",async({page,context},info)=>{
  test.setTimeout(90000);const base=homeBaseBriefing();let calls=0,advice:AdviceEnhancementResult|undefined;
  const seeded = await bridge(context, { action: "seed" }) as unknown as { data: { token: string } };
  await context.addCookies([{ name: "hikari_identity.session_token", value: seeded.data.token, url: origin, httpOnly: true, sameSite: "Lax" }]);
  try{
    expect((await bridge(context,{action:"configure"})).error).toBeUndefined();
    await page.clock.setFixedTime(new Date(base.generatedAt));
    await page.addInitScript(place=>localStorage.setItem("hikari-daily.preferences.v1",JSON.stringify({place,genre:"landscape"})),base.location.id);
    await page.route("**/api/briefing?*",route=>route.fulfill({json:{data:base,error:null}}));
    await page.route("**/api/workspace/advice",async route=>{calls++;const result=await bridge(context,{action:"advice",base});expect(result.error).toBeUndefined();advice=result.data;await route.fulfill({json:{data:result.data,error:null}});});
    await page.goto(`${origin}/`);await expect(page.getByRole("status").filter({hasText:"AI 摄影建议已更新"})).toBeVisible();
    expect(await page.locator(".site-header").evaluate(n=>n.scrollWidth <= innerWidth+1)).toBe(true);
    const topbarPath=process.env.HIKARI_HOME_CAPTURE_DIR && `${process.env.HIKARI_HOME_CAPTURE_DIR}/${info.project.name}-populated-topbar.png`;if(topbarPath && !existsSync(topbarPath))await page.locator(".site-header").screenshot({path:topbarPath});
    expect(calls).toBe(1);expect(advice!.enhancement.landscape.status).toBe("generated");
    for(const g of ["landscape","portrait","street"] as const)await expect(page.locator(`#newspaper .genre-summary .genre-${base.interpretation.genres[g].status}`).filter({hasText:advice!.enhancement[g].short!.newspaper})).toHaveCount(1);
    await page.locator('#newspaper [data-nav="book"]').click();
    for(const [i,g] of (["landscape","portrait","street"] as const).entries()){
      await page.locator(`#book-nav button[data-genre="${i}"]`).click();const spread=page.locator(`#spreads>.spread[data-genre="${i}"]`),n=advice!.enhancement[g].full!;
      await expect(spread.locator(".plan li").first().locator("p")).toHaveText(n.light.short);
      const bounds=await spread.locator(":scope>.book-page").evaluateAll(nodes=>nodes.map(node=>{const p=node as HTMLElement,f=p.querySelector<HTMLElement>(".page-number")!;return {clear:[...p.children].filter(c=>c!==f).every(c=>(c as HTMLElement).offsetTop+(c as HTMLElement).offsetHeight<=f.offsetTop+1),height:p.clientHeight,content:p.scrollHeight,overflow:getComputedStyle(p).overflowY};}));
      for(const p of bounds){expect(p.clear,`${g} footer`).toBe(true);expect(p.content).toBeLessThanOrEqual(p.height+1);expect(p.overflow).toBe("visible");}
      await spread.locator(`[data-detail="advice-${g}"]`).click();const full=page.locator("#detail-body");
      for(const facet of Object.values(n))await expect(full).toContainText(facet.text);
      await expect(full).toContainText(base.advice[g].film.type);await full.getByText("构图的依据",{exact:true}).click();await expect(full).toContainText("CC BY 4.0");await page.keyboard.press("Escape");
    }
    await page.keyboard.press("Escape");await expect(page.locator("#peer-reader")).not.toBeVisible();
    if(info.project.name!=="reduced-motion")await page.locator("#motion-toggle").click();
    await page.emulateMedia({media:"print"});
    await expect(page.locator(".full-advice-reading")).toBeVisible();await expect(page.locator('.full-advice-reading [data-advice-genre="landscape"]')).toContainText(advice!.enhancement.landscape.full!.composition.text);
    await page.emulateMedia({media:"screen"});expect(calls).toBe(1);
    await page.locator(".header-account").click();await page.getByRole("button",{name:"移除配置",exact:true}).click();await expect(page.getByText("当前为规则建议 · 尚未配置模型",{exact:true})).toBeVisible();await page.keyboard.press("Escape");
    await expect(page.locator(".advice-status")).toHaveCount(0);await expect(page.locator('.full-advice-reading [data-advice-origin="model"]')).toHaveCount(0);expect(calls).toBe(1);
  } finally {await bridge(context,{action:"cleanup"});}
});
