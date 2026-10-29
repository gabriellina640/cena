import { get,put,BlobPreconditionFailedError } from "@vercel/blob";
import { SavedLibrary } from "./local-library";
import { StoreConflictError,type JsonStore } from "./json-store";
const pathname="cena/listas.json";
export function createBlobStore():JsonStore {
  return {
    async read(){
      const result=await get(pathname,{access:"private",useCache:false});if(!result)return null;
      if(!result.stream)throw new Error("Resposta inesperada ao abrir as listas.");
      return {library:SavedLibrary.parse(JSON.parse(await new Response(result.stream).text())),etag:result.blob.etag};
    },
    async write(library,etag){
      try{await put(pathname,JSON.stringify(library),{access:"private",contentType:"application/json",addRandomSuffix:false,allowOverwrite:!!etag,...(etag?{ifMatch:etag}:{})});}
      catch(error){
        if(error instanceof BlobPreconditionFailedError)throw new StoreConflictError();
        if(!etag&&await get(pathname,{access:"private",useCache:false}))throw new StoreConflictError();
        throw error;
      }
    },
  };
}
