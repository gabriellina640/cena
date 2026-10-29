import {readFile} from "node:fs/promises";
import {gunzipSync} from "node:zlib";
import {join} from "node:path";
import {fold} from "./snapshot";
import type {Movie} from "./types";
export type CatalogMeta={version:1;source:"tmdb";importedAt:string;exportDate:string;total:number;expectedTotal:number;completeIds:boolean;detailedTotal:number;translatedTotal:number;genresKnownTotal:number;genreIds:number[]};
type Row=[id:number,search:string,year:number,genreMask:number,score:number,popularity:number,bucket:number];
export type CatalogOptions={q?:string;genres?:number[];sort?:"popular"|"rating"|"recent";page?:number;status?:"all"|"watched"|"pending";watchedIds?:number[]};
export type FileCatalogResult={results:Movie[];total:number;page:number;nextPage:number|null;meta:CatalogMeta};
export function createFileCatalog(directory:string){
  let loaded:Promise<{meta:CatalogMeta;rows:Row[];byId:Map<number,Row>}>|undefined;
  const orders=new Map<string,Promise<number[]>>(),chunks=new Map<number,Promise<Record<string,Movie>>>();
  const json=async<T>(name:string):Promise<T>=>JSON.parse(gunzipSync(await readFile(join(directory,name))).toString("utf8"));
  function load(){
    if(!loaded){loaded=Promise.all([readFile(join(directory,"manifest.json"),"utf8"),json<Row[]>("indice.json.gz")]).then(([manifest,rows])=>{
      const byId=new Map<number,Row>();for(const row of rows)byId.set(row[0],row);return {meta:JSON.parse(manifest) as CatalogMeta,rows,byId};
    });loaded.catch(()=>{loaded=undefined;});}return loaded;
  }
  async function chunk(bucket:number){
    let value=chunks.get(bucket);if(!value){value=json<Record<string,Movie>>(`filmes/${String(bucket).padStart(3,"0")}.json.gz`);chunks.set(bucket,value);value.catch(()=>chunks.delete(bucket));if(chunks.size>6)chunks.delete(chunks.keys().next().value!);}return value;
  }
  async function query(options:CatalogOptions={}):Promise<FileCatalogResult>{
    const {meta,rows,byId}=await load();const q=fold((options.q||"").trim()),page=Math.max(1,options.page||1),size=24;
    const mask=(options.genres||[]).reduce((sum,id)=>{const bit=meta.genreIds.indexOf(id);return bit<0?sum:sum|(1<<bit);},0),watched=new Set(options.watchedIds||[]);
    const matches=(r:Row)=>(!q||r[1].includes(q))&&(!options.genres?.length||!!(r[3]&mask))&&(options.status==="watched"?watched.has(r[0]):options.status==="pending"?!watched.has(r[0]):true);
    let order:Iterable<Row>=rows;
    if(options.sort&&options.sort!=="popular"){
      if(!orders.has(options.sort)){const p=json<number[]>(`${options.sort}.json.gz`);orders.set(options.sort,p);p.catch(()=>orders.delete(options.sort!));}
      const ids=await orders.get(options.sort)!;order=(function*(){for(const id of ids){const row=byId.get(id);if(row)yield row;}})();
    }
    let total=0;const selected:Row[]=[],start=(page-1)*size;
    for(const row of order)if(matches(row)){if(total>=start&&selected.length<size)selected.push(row);total++;}
    const groups=new Map<number,Row[]>();for(const row of selected){const group=groups.get(row[6])||[];group.push(row);groups.set(row[6],group);}
    const found=new Map<number,Movie>();for(const [bucket,group] of groups){const data=await chunk(bucket);for(const row of group)if(data[row[0]])found.set(row[0],{...data[row[0]],popularity:row[5]});}
    return {results:selected.map(r=>found.get(r[0])).filter((m):m is Movie=>!!m),total,page,nextPage:page*size<total?page+1:null,meta};
  }
  return {query};
}
export const fileCatalog=createFileCatalog(join(process.cwd(),"data","catalogo"));
