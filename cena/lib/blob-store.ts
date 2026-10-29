import { get,head,put,BlobPreconditionFailedError } from "@vercel/blob";
import { SavedLibrary } from "./local-library";
import { StoreConflictError,type JsonStore } from "./json-store";
const pathname="cena/listas.json";
type BlobOperations={get:typeof get;head:typeof head;put:typeof put};
export function createBlobStore(ops:BlobOperations={get,head,put}):JsonStore {
  return {
    async read(){
      const initial=await ops.get(pathname,{access:"private",useCache:false});if(!initial)return null;
      await initial.stream?.cancel();
      // Read between two storage metadata checks, so the ETag used for the
      // write identifies the same version as the contents even if a GET's
      // HTTP ETag is missing or differs from the storage API's ETag.
      const before=await ops.head(pathname);
      const result=await ops.get(pathname,{access:"private",useCache:false});
      if(!result?.stream)throw new StoreConflictError();
      const library=SavedLibrary.parse(JSON.parse(await new Response(result.stream).text()));
      const after=await ops.head(pathname);
      if(!before.etag || !after.etag)throw new Error("Não foi possível verificar a versão das listas no Blob.");
      if(before.etag!==after.etag)throw new StoreConflictError();
      return {library,etag:after.etag};
    },
    async write(library,etag){
      try{await ops.put(pathname,JSON.stringify(library),{access:"private",contentType:"application/json",addRandomSuffix:false,allowOverwrite:!!etag,...(etag?{ifMatch:etag}:{})});}
      catch(error){
        if(error instanceof BlobPreconditionFailedError)throw new StoreConflictError();
        if(!etag&&await ops.get(pathname,{access:"private",useCache:false}))throw new StoreConflictError();
        throw error;
      }
    },
  };
}
