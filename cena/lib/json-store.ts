import { applyLibraryAction, newLibrary, SavedLibrary } from "./local-library";
import type { Library } from "./types";
export interface JsonStore { read():Promise<{library:Library;etag:string}|null>; write(library:Library,etag:string|null):Promise<void>; }
export class StoreConflictError extends Error {}
export async function changeSharedLibrary(store:JsonStore,input:unknown,restore=false) {
  for(let attempt=0;attempt<4;attempt++) {
    try{
      const previous=await store.read();
      const result=restore?{library:SavedLibrary.parse(input),createdId:undefined}:applyLibraryAction(previous?.library||newLibrary(),input);
      if(new TextEncoder().encode(JSON.stringify(result.library)).length>3_500_000)throw new Error("As listas ultrapassaram 3,5 MB. Exporte um backup e reduza a coleção antes de salvar.");
      await store.write(result.library,previous?.etag||null);return result;
    }
    catch(error){if(!(error instanceof StoreConflictError)||attempt===3)throw error;}
  }
  throw new StoreConflictError("As listas mudaram em outro acesso. Atualize a página.");
}
