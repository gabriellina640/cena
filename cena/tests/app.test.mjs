import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {gzipSync} from 'node:zlib';
import {changeLocalLibrary,readLocalLibrary,newLibrary,exportBackup,parseBackup,persistLibrary,STORAGE_KEY} from '../lib/local-library.ts';
import {changeSharedLibrary,StoreConflictError} from '../lib/json-store.ts';
import {createFileCatalog} from '../lib/file-catalog.ts';
import {filterMovies,fold} from '../lib/snapshot.ts';
import {GET,POST} from '../app/api/library/route.ts';
import {createBlobStore} from '../lib/blob-store.ts';
import {rouletteCandidates} from '../lib/roulette.ts';
const movie={id:27205,type:'movie',title:'A Origem',originalTitle:'Inception',year:2010,genres:[28,878],overview:'Sinopse de teste.',poster:'/test.jpg',backdrop:null,score:8.4,popularity:50,providers:[],availabilityKnown:false,source:'tmdb'};
const memory=()=>{const data=new Map();return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};};

test('roleta considera apenas filmes não assistidos da lista escolhida',()=>{
 const library=newLibrary();library.lists.push({id:'outra',name:'Outra',color:'pink',createdAt:''});
 const entry=(m,watched,lists)=>({movie:m,watched,watchedAt:null,updatedAt:'',lists});
 library.movies={a:entry(movie,false,['watchlist']),b:entry({...movie,id:2},true,['watchlist']),c:entry({...movie,id:3},false,['outra'])};
 assert.deepEqual(rouletteCandidates(library,'watchlist').map(m=>m.id),[movie.id]);
 assert.deepEqual(rouletteCandidates(library,'outra').map(m=>m.id),[3]);
 assert.deepEqual(rouletteCandidates(library,'inexistente'),[]);
});

test('Blob usa versão dos metadados mesmo sem ETag HTTP e preserva alterações',async()=>{
 let data=newLibrary(),version=1,writes=0;
 const ops={
  async get(_path,options){assert.equal(options.useCache,false);return {stream:new Response(JSON.stringify(data)).body,blob:{etag:''}};},
  async head(){return {etag:`version-${version}`};},
  async put(_path,body,options){assert.equal(options.ifMatch,`version-${version}`);data=JSON.parse(body);version++;writes++;},
 };
 const store=createBlobStore(ops);
 await changeSharedLibrary(store,{action:'addMovie',listId:'watchlist',movie});
 await changeSharedLibrary(store,{action:'setWatched',movie,watched:true});
 assert.equal(writes,2);assert.equal(data.movies['movie:27205'].watched,true);assert.deepEqual(data.movies['movie:27205'].lists,['watchlist']);
});
test('leitura concorrente do Blob é repetida antes da gravação',async()=>{
 let data=newLibrary(),version=1,heads=0;
 const ops={
  async get(){return {stream:new Response(JSON.stringify(data)).body,blob:{etag:'outro-formato'}};},
  async head(){heads++;if(heads===2)version++;return {etag:`version-${version}`};},
  async put(_path,body,options){assert.equal(options.ifMatch,`version-${version}`);data=JSON.parse(body);version++;},
 };
 await changeSharedLibrary(createBlobStore(ops),{action:'setWatched',movie,watched:true});
 assert.equal(heads,4);assert.equal(data.movies['movie:27205'].watched,true);
});

test('listas persistem, não duplicam filmes e preservam histórico ao excluir uma lista',()=>{
 const s=memory(),{createdId}=changeLocalLibrary(s,{action:'createList',name:"Filmes d'água",color:'pink'});
 changeLocalLibrary(s,{action:'setWatched',movie,watched:true});
 for(const listId of ['watchlist',createdId,createdId])changeLocalLibrary(s,{action:'addMovie',listId,movie});
 assert.equal(readLocalLibrary(s).movies['movie:27205'].lists.length,2);
 changeLocalLibrary(s,{action:'deleteList',id:createdId});
 const state=readLocalLibrary(s).movies['movie:27205'];assert.equal(state.watched,true);assert.deepEqual(state.lists,['watchlist']);
 assert.throws(()=>changeLocalLibrary(s,{action:'deleteList',id:'watchlist'}));
});
test('backup restaura outro navegador e rejeita arquivos ou imagens arbitrários',()=>{
 const a=memory(),b=memory();changeLocalLibrary(a,{action:'addMovie',listId:'watchlist',movie});
 assert.equal(Object.keys(readLocalLibrary(b).movies).length,0);persistLibrary(b,parseBackup(exportBackup(readLocalLibrary(a))));assert.deepEqual(readLocalLibrary(a),readLocalLibrary(b));
 const invalid=JSON.parse(exportBackup(readLocalLibrary(a)));invalid.library.movies['movie:27205'].movie.poster='https://outro.example/test.jpg';assert.throws(()=>parseBackup(JSON.stringify(invalid)));
 assert.throws(()=>parseBackup('{"app":"outro"}'));
});
test('falha de armazenamento não confirma sucesso nem apaga conteúdo corrompido',()=>{
 const s=memory();readLocalLibrary(s);const before=s.getItem(STORAGE_KEY);
 assert.throws(()=>changeLocalLibrary({...s,setItem(){throw Error('quota');}},{action:'setWatched',movie,watched:true}),/salvar/);assert.equal(s.getItem(STORAGE_KEY),before);
 s.setItem(STORAGE_KEY,'{inválido');assert.throws(()=>readLocalLibrary(s),/preservados/);assert.equal(s.getItem(STORAGE_KEY),'{inválido');
});
test('JSON compartilhado preserva alterações concorrentes e suporta restauração',async()=>{
 let data=null,version=0;const store={async read(){return data?{library:structuredClone(data),etag:String(version)}:null;},async write(library,etag){if(etag!==(data?String(version):null))throw new StoreConflictError();data=structuredClone(library);version++;}};
 await Promise.all([changeSharedLibrary(store,{action:'addMovie',listId:'watchlist',movie}),changeSharedLibrary(store,{action:'setWatched',movie,watched:true})]);
 assert.equal(data.movies['movie:27205'].watched,true);assert.deepEqual(data.movies['movie:27205'].lists,['watchlist']);
 const reset=newLibrary();await changeSharedLibrary(store,reset,true);assert.deepEqual(data,reset);
});
test('falha no JSON remoto preserva os dados anteriores',async()=>{
 const before=newLibrary(),store={async read(){return {library:before,etag:'1'};},async write(){throw Error('indisponível');}};
 await assert.rejects(changeSharedLibrary(store,{action:'addMovie',listId:'watchlist',movie}),/indisponível/);assert.equal(Object.keys(before.movies).length,0);
});
test('busca aceita todos os gêneros, títulos originais e nomes sem acentos',()=>{
 const movies=[movie,{...movie,id:2,title:'Invocação',originalTitle:'The Conjuring',genres:[27]}];
 assert.equal(filterMovies(movies).length,2);assert.equal(filterMovies(movies,{query:'invocacao'})[0].id,2);assert.equal(filterMovies(movies,{query:'inception'})[0].id,27205);assert.equal(filterMovies(movies,{genres:[27]}).length,1);
});
test('catálogo JSON pagina sem perda e aplica status antes da paginação',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'cena-catalog-'));
 try{
  await mkdir(join(folder,'filmes'));
  const movies=Array.from({length:61},(_,i)=>({...movie,id:i+1,title:`Título ${i+1}`,originalTitle:`Original ${i+1}`,year:1960+i,popularity:61-i,genres:i%2?[27]:[28]}));
  const rows=movies.map(m=>[m.id,fold(`${m.title} ${m.originalTitle}`),m.year,m.genres.includes(27)?2:1,m.score,m.popularity,m.id%2]);
  await writeFile(join(folder,'manifest.json'),JSON.stringify({total:61,genreIds:[28,27]}));await writeFile(join(folder,'indice.json.gz'),gzipSync(JSON.stringify(rows)));
  for(const name of ['recent','rating'])await writeFile(join(folder,`${name}.json.gz`),gzipSync(JSON.stringify([...movies].reverse().map(m=>m.id))));
  for(let i=0;i<2;i++)await writeFile(join(folder,'filmes',`${String(i).padStart(3,'0')}.json.gz`),gzipSync(JSON.stringify(Object.fromEntries(movies.filter(m=>m.id%2===i).map(m=>[m.id,m])))));
  const catalog=createFileCatalog(folder),ids=[];for(let page=1;page<=3;page++)ids.push(...(await catalog.query({page})).results.map(m=>m.id));assert.equal(ids.length,61);assert.equal(new Set(ids).size,61);
  const watched=await catalog.query({status:'watched',watchedIds:[60,61]});assert.equal(watched.total,2);assert.deepEqual(watched.results.map(m=>m.id),[60,61]);
  assert.equal((await catalog.query({genres:[27]})).total,30);assert.equal((await catalog.query({q:'original 61'})).results[0].id,61);assert.equal((await catalog.query({sort:'recent'})).results[0].id,61);assert.equal((await catalog.query({genres:[999]})).total,0);
 }finally{await rm(folder,{recursive:true,force:true});}
});
test('sem Blob a API informa modo local e não finge gravar na Vercel',async()=>{
 const before=process.env.BLOB_READ_WRITE_TOKEN;delete process.env.BLOB_READ_WRITE_TOKEN;
 try{assert.deepEqual(await(await GET()).json(),{mode:'local'});const r=await POST(new Request('https://cena.example/api/library',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"action":"bootstrap"}'}));assert.equal(r.status,503);}
 finally{if(before===undefined)delete process.env.BLOB_READ_WRITE_TOKEN;else process.env.BLOB_READ_WRITE_TOKEN=before;}
});
test('API bloqueia escrita de outra origem',async()=>{
 const r=await POST(new Request('https://cena.example/api/library',{method:'POST',headers:{Origin:'https://outro.example','Content-Type':'application/json'},body:'{}'}));assert.equal(r.status,403);
});
