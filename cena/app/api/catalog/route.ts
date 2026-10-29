import {z} from "zod";
import {fileCatalog} from "../../../lib/file-catalog";
export const runtime="nodejs";export const dynamic="force-dynamic";
const Input=z.object({q:z.string().max(300).default(""),genres:z.array(z.number().int().positive()).max(30).default([]),sort:z.enum(["popular","rating","recent"]).default("popular"),page:z.number().int().min(1).max(1000000).default(1),status:z.enum(["all","watched","pending"]).default("all"),watchedIds:z.array(z.number().int().positive()).max(50000).default([])});
const headers={"Cache-Control":"no-store"};
export async function POST(request:Request){
 if(!request.headers.get("content-type")?.includes("application/json"))return Response.json({error:"Use JSON."},{status:415,headers});
 try{
  const body=await request.text();if(body.length>500000)return Response.json({error:"Pedido muito grande."},{status:413,headers});
  let input:unknown;try{input=JSON.parse(body);}catch{return Response.json({error:"JSON inválido."},{status:400,headers});}
  const parsed=Input.safeParse(input);if(!parsed.success)return Response.json({error:"Filtros inválidos."},{status:400,headers});
  return Response.json(await fileCatalog.query(parsed.data),{headers});
 }catch{return Response.json({error:"Não foi possível abrir os arquivos do catálogo. Tente novamente."},{status:503,headers});}
}
