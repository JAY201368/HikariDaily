/** Explicit child-process test transport. Never imported by production or exposed through HTTP. */
import { readFile } from "node:fs/promises";
import { importKnowledge } from "../../../src/server/workspace/knowledge";
import { register } from "./identity";
import { requireAccount } from "../../../src/server/workspace/auth";
import { getModelConfig, putModelConfig, storeCapabilities } from "../../../src/server/workspace/config";
import { closeDatabase, query } from "../../../src/server/workspace/db";
import type { ModelTransport } from "../../../src/server/workspace/transport";
import { enhanceBriefing } from "../../../src/server/workspace/advice";
import { goodNarrative } from "./advice";
import type { Genre } from "../../../src/domain/types";
import type { KnowledgeEvidence } from "../../../src/domain/workspace/knowledge";
const database=process.env.HIKARI_TEST_DATABASE_URL;
if(process.env.NODE_ENV === "production" || !database || process.env.HIKARI_DATABASE_URL !== database || !/test/i.test(new URL(database).pathname)) throw Error("Explicit isolated advice test database required");
const chunks:Buffer[]=[];for await(const chunk of process.stdin)chunks.push(Buffer.from(chunk));
const request=JSON.parse(Buffer.concat(chunks).toString());
try {
  if (request.action === "seed") {
    const seeded = await register({ username: `e2e_${crypto.randomUUID()}` }, true);
    process.stdout.write(JSON.stringify({ data: { token: seeded.token } }));
  } else {
  const owner=await requireAccount(new Request("http://localhost:3100",{headers:{cookie:`hikari_identity.session_token=${request.token}`}}));
  let result:unknown;
  if(request.action === "configure") { const c=await putModelConfig(owner.id,{baseVersion:(await getModelConfig(owner.id)).version,baseUrl:"https://8.8.8.8/v1",model:"explicit-injected-advice-test",apiKey:"synthetic-never-dispatched"}); await storeCapabilities(owner.id,c.version,{text:"available",image:"available",tools:"available"}); const corpus=JSON.parse(await readFile("src/content/knowledge/original-fieldcraft.v1.json","utf8")); corpus.source.id=`advice-e2e-${owner.id}`; if(!(await query("SELECT 1 FROM knowledge_sources WHERE id=$1",[corpus.source.id])).rowCount) await importKnowledge(corpus); result=c; }
  else if(request.action === "advice") {
    const transport:ModelTransport=async(_u,_k,raw,_signal,authorize)=>{
      await authorize?.(()=>{});
      const messages=(raw as {messages:{content:string}[]}).messages,context=JSON.parse(messages[1].content);
      const narrative=Object.fromEntries((["landscape","portrait","street"] as Genre[]).map(g=>{
        const evidence=context[g].knowledge.map((k:{chunkId:string;topics:string[];sourceId:string;version:number})=>({id:k.chunkId,topics:k.topics,source:{id:k.sourceId,version:k.version}})) as KnowledgeEvidence[];
        const n=goodNarrative(g,evidence);n.composition.text+="留意主体边缘与背景之间的空隙，再移动站位整理线条。";return [g,n];
      }));
      return {choices:[{message:{content:JSON.stringify(narrative)}}],usage:{total_tokens:100}};
    };
    result=await enhanceBriefing(owner.id,request.base,{transport,now:()=>Date.parse(request.base.generatedAt)});
  }
  else if(request.action === "cleanup") { await query("DELETE FROM knowledge_sources WHERE id=$1",[`advice-e2e-${owner.id}`]); await query('DELETE FROM identity_users WHERE id IN (SELECT "userId" FROM identity_accounts WHERE "accountId"=(SELECT identity_subject FROM accounts WHERE id=$1))', [owner.id]); await query("DELETE FROM accounts WHERE id=$1", [owner.id]); result={cleaned:true}; }
  else throw Error("Unsupported explicit test action");
  process.stdout.write(JSON.stringify({data:result}));
  }
} catch(error) { const e=error as {code?:string;message:string;status?:number;details?:unknown};process.stdout.write(JSON.stringify({error:{code:e.code || "TEST_ERROR",message:e.message,...(e.details || {})},status:e.status || 500})); }
finally {await closeDatabase();}
