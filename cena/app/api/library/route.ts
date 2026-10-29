import { createBlobStore } from "../../../lib/blob-store";
import { changeSharedLibrary,StoreConflictError } from "../../../lib/json-store";
import { newLibrary } from "../../../lib/local-library";
import { LibraryAction } from "../../../lib/validation";
import { ZodError } from "zod";
export const runtime="nodejs";export const dynamic="force-dynamic";
const headers={"Cache-Control":"no-store"};const enabled=()=>!!process.env.BLOB_READ_WRITE_TOKEN;
export async function GET(){
  if(!enabled())return Response.json({mode:"local"},{headers});
  try{const saved=await createBlobStore().read();return Response.json({mode:"shared",library:saved?.library||newLibrary()},{headers});}
  catch{return Response.json({error:"Não foi possível abrir o JSON das listas. Verifique o Blob privado conectado ao projeto na Vercel."},{status:503,headers});}
}
export async function POST(request:Request){
  const origin=request.headers.get("origin");if(origin&&origin!==new URL(request.url).origin)return Response.json({error:"Origem não permitida."},{status:403,headers});
  if(!request.headers.get("content-type")?.includes("application/json"))return Response.json({error:"Use JSON."},{status:415,headers});
  if(!enabled())return Response.json({error:"Conecte um Blob privado ao projeto para salvar as listas na Vercel."},{status:503,headers});
  try{
    if(Number(request.headers.get("content-length"))>3_500_000)return Response.json({error:"O backup deve ter até 3,5 MB."},{status:413,headers});
    const text=await request.text();if(new TextEncoder().encode(text).length>3_500_000)return Response.json({error:"O backup deve ter até 3,5 MB."},{status:413,headers});
    let input:unknown;try{input=JSON.parse(text);}catch{return Response.json({error:"JSON inválido."},{status:400,headers});}
    const restore=!!input&&typeof input==="object"&&"action" in input&&input.action==="restore";
    const result=restore?await changeSharedLibrary(createBlobStore(),(input as {library?:unknown}).library,true):await changeSharedLibrary(createBlobStore(),LibraryAction.parse(input));
    return Response.json({...result,mode:"shared"},{headers});
  }catch(error){
    if(error instanceof ZodError)return Response.json({error:error.issues[0]?.message||"Dados inválidos."},{status:400,headers});
    if(error instanceof StoreConflictError)return Response.json({error:"As listas mudaram em outro acesso. Tente novamente."},{status:409,headers});
    return Response.json({error:"Não foi possível salvar o JSON. A alteração não foi confirmada; tente novamente."},{status:503,headers});
  }
}
