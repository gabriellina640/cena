"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownWideNarrow, ArrowRight, Bookmark, BookmarkCheck, Check, CheckCheck, ChevronDown, ChevronRight, Compass, Film, FolderHeart, Globe2, Grid2X2, Info, List, ListPlus, Loader2, Menu, PawPrint, Pencil, Plus, Search, SlidersHorizontal, Star, Trash2, X } from "lucide-react";
import { COLORS, GENRES, imageUrl } from "../lib/constants";
import { movieKey, type FilmList, type Library, type Movie } from "../lib/types";

import { changeLocalLibrary, exportBackup, parseBackup, persistLibrary, readLocalLibrary, STORAGE_KEY } from "../lib/local-library";
import { filterMovies, fold } from "../lib/snapshot";
import type { CatalogMeta, FileCatalogResult } from "../lib/file-catalog";

type View="explore"|"lists"|"list"|"watched";
type ListEditor={list?:FilmList;name:string;color:string};
const emptyLibrary:Library={lists:[],movies:{}};
const number=(n:number)=>n.toLocaleString("pt-BR");
const duration=(n?:number)=>n?`${Math.floor(n/60)?`${Math.floor(n/60)}h `:""}${n%60?`${n%60}min`:""}`.trim():"";

async function api<T>(path:string,body?:unknown,signal?:AbortSignal):Promise<T> {
 const response=await fetch(path,{...(body?{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}:{}),cache:"no-store",signal});
 const data=await response.json();if(!response.ok)throw new Error(data.error||"Não foi possível concluir. Tente novamente.");return data as T;
}
let modalCount=0,overflowBeforeModals="";
function Modal({children,onClose,label,className=""}:{children:React.ReactNode;onClose:()=>void;label:string;className?:string}) {
  const ref=useRef<HTMLDialogElement>(null);
  const closeRef=useRef(onClose);closeRef.current=onClose;
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null;
    if(modalCount===0)overflowBeforeModals=document.body.style.overflow;modalCount++;document.body.style.overflow="hidden";
    ref.current?.showModal();
    return ()=>{modalCount--;if(modalCount===0)document.body.style.overflow=overflowBeforeModals;previous?.focus();};
  },[]);
  return <dialog ref={ref} aria-label={label} className={`modal ${className}`} onCancel={e=>{e.preventDefault();closeRef.current();}} onClick={e=>{if(e.target===ref.current)closeRef.current();}}><div className="modal-inner">{children}</div></dialog>;
}

function DogSticker({className=""}:{className?:string}) {
  return <img className={`dog-sticker ${className}`} src="/assets/dogs.png" alt="" aria-hidden="true" loading="lazy"/>;
}

function Poster({movie,className=""}:{movie:Movie;className?:string}) {
  const [broken,setBroken]=useState(false);
  useEffect(()=>setBroken(false),[movie.poster]);
  return <div className={`poster-image ${className}`}>{movie.poster&&!broken?<img src={imageUrl(movie.poster)} alt={`Pôster de ${movie.title}`} loading="lazy" onError={()=>setBroken(true)}/>:<div className="poster-placeholder"><Film size={34}/><span>{movie.title}</span></div>}</div>;
}

export default function Cinema() {
  const [view,setView]=useState<View>("explore"),[activeList,setActiveList]=useState("watchlist");
  const [library,setLibrary]=useState<Library>(emptyLibrary),[libraryReady,setLibraryReady]=useState(false),[libraryError,setLibraryError]=useState("");
  const [query,setQuery]=useState(""),[debouncedQuery,setDebouncedQuery]=useState(""),[genres,setGenres]=useState<number[]>([]);
  const [expandedGenres,setExpandedGenres]=useState(false);
  const [sort,setSort]=useState("popular"),[watchFilter,setWatchFilter]=useState("all"),[layout,setLayout]=useState("grid");
  const [snapshot,setSnapshot]=useState<CatalogMeta|null>(null),[loading,setLoading]=useState(true),[catalogError,setCatalogError]=useState("");
  const [remoteCatalog,setRemoteCatalog]=useState<FileCatalogResult|null>(null),[loadingMore,setLoadingMore]=useState(false);
  const [storageMode,setStorageMode]=useState<"loading"|"local"|"shared">("loading");
  const catalogSequence=useRef(0);
  const [visibleCount,setVisibleCount]=useState(24),[restore,setRestore]=useState<Library|null>(null);
  const backupRef=useRef<HTMLInputElement>(null);
  const [retry,setRetry]=useState(0),[busy,setBusy]=useState(false),[toast,setToast]=useState("");
  const [selected,setSelected]=useState<Movie|null>(null);
  const [editor,setEditor]=useState<ListEditor|null>(null),[deleteList,setDeleteList]=useState<FilmList|null>(null),[editorError,setEditorError]=useState("");
  const [sidebar,setSidebar]=useState(false),[showAbout,setShowAbout]=useState(false);
  const searchRef=useRef<HTMLInputElement>(null);
  const currentGenres=GENRES;
  
    const watchedCount=Object.values(library.movies).filter(m=>m.watched).length;
  const savedCount=Object.values(library.movies).filter(m=>m.lists.length).length;
  const pendingCount=Object.values(library.movies).filter(m=>m.lists.length&&!m.watched).length;
  const list=library.lists.find(l=>l.id===activeList);
  const listCount=(id:string)=>Object.values(library.movies).filter(m=>m.lists.includes(id)).length;
  const currentListCount=listCount(activeList),currentListWatched=Object.values(library.movies).filter(m=>m.lists.includes(activeList)&&m.watched).length;

  const refreshLibrary=useCallback(async()=>{
    const response=await api<{mode:"local"|"shared";library?:Library}>("/api/library");
    const data=response.mode==="shared"&&response.library?response.library:readLocalLibrary(window.localStorage);
    setStorageMode(response.mode);setLibrary(data);setLibraryError("");setLibraryReady(true);
  },[]);
  const initialize=useCallback(async()=>{try{await refreshLibrary();}catch(e){setLibraryError((e as Error).message);setLibraryReady(false);}},[refreshLibrary]);
  useEffect(()=>{initialize();},[initialize]);
  useEffect(()=>{
    const onStorage=(e:StorageEvent)=>{if(e.key===STORAGE_KEY||e.key===null)initialize();};
    const onFocus=()=>initialize();
    window.addEventListener("storage",onStorage);window.addEventListener("focus",onFocus);
    return()=>{window.removeEventListener("storage",onStorage);window.removeEventListener("focus",onFocus);};
  },[initialize]);
  useEffect(()=>{const t=setTimeout(()=>setDebouncedQuery(query.trim()),300);return()=>clearTimeout(t);},[query]);
  useEffect(()=>{
    const handle=(e:KeyboardEvent)=>{if((e.ctrlKey||e.metaKey)&&e.key==="k"){e.preventDefault();searchRef.current?.focus();}};
    window.addEventListener("keydown",handle);return()=>window.removeEventListener("keydown",handle);
  },[]);
  useEffect(()=>{if(toast){const t=setTimeout(()=>setToast(""),3500);return()=>clearTimeout(t);}},[toast]);


  const watchedIds=useMemo(()=>Object.values(library.movies).filter(m=>m.watched).map(m=>m.movie.id).sort((a,b)=>a-b),[library]);
  const filterKey=JSON.stringify({q:debouncedQuery,genres,sort,status:watchFilter,watchedIds:watchFilter==="all"?[]:watchedIds});
  useEffect(()=>{
    if(view!=="explore")return;
    const controller=new AbortController(),sequence=++catalogSequence.current;setLoading(true);setLoadingMore(false);setCatalogError("");
    api<FileCatalogResult>("/api/catalog",{...JSON.parse(filterKey),page:1},controller.signal).then(data=>{if(sequence===catalogSequence.current){setSnapshot(data.meta);setRemoteCatalog(data);}}).catch(e=>{if(e.name!=="AbortError"&&sequence===catalogSequence.current)setCatalogError(e.message);}).finally(()=>{if(sequence===catalogSequence.current)setLoading(false);});
    return()=>controller.abort();
  },[filterKey,retry,view]);
  useEffect(()=>{setVisibleCount(24);},[debouncedQuery,genres,sort,watchFilter,view,activeList]);
  async function save(body:unknown):Promise<{library:Library;createdId?:string}> {return storageMode==="shared"?api("/api/library",body):changeLocalLibrary(window.localStorage,body);}
  async function mutate(body:unknown,success?:string) {
    if(busy)return false;
    setBusy(true);
    try{const result=await save(body);setLibrary(result.library);setLibraryError("");if(success)setToast(success);return true;}
    catch(e){setToast((e as Error).message);return false;}
    finally{setBusy(false);}
  }
  function navigate(next:View,id?:string) {
    setView(next);if(id)setActiveList(id);setQuery("");setDebouncedQuery("");setGenres([]);setWatchFilter("all");setSidebar(false);setCatalogError("");
    window.scrollTo({top:0,behavior:"smooth"});
  }
  function toggleFilter(value:number,setter:React.Dispatch<React.SetStateAction<number[]>>){setter(old=>old.includes(value)?old.filter(x=>x!==value):[...old,value]);}
  function resetFilters(){setQuery("");setDebouncedQuery("");setGenres([]);setWatchFilter("all");}
  async function loadMore(){
    if(view!=="explore"){setVisibleCount(n=>n+48);return;}
    if(!remoteCatalog?.nextPage||loadingMore)return;
    const sequence=catalogSequence.current;setLoadingMore(true);setCatalogError("");
    try{const data=await api<FileCatalogResult>("/api/catalog",{...JSON.parse(filterKey),page:remoteCatalog.nextPage});if(sequence===catalogSequence.current)setRemoteCatalog(old=>old?{...data,results:[...new Map([...old.results,...data.results].map(m=>[m.id,m])).values()]}:data);}
    catch(e){if(sequence===catalogSequence.current)setCatalogError((e as Error).message);}finally{if(sequence===catalogSequence.current)setLoadingMore(false);}
  }
  function openMovie(movie:Movie){setSelected(movie);}
  function closeMovie(){setSelected(null);}
  function downloadBackup(){
    const data=library;
    const url=URL.createObjectURL(new Blob([exportBackup(data)],{type:"application/json"}));
    const link=document.createElement("a");link.href=url;link.download=`cena-listas-${new Date().toISOString().slice(0,10)}.json`;link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  async function chooseBackup(event:React.ChangeEvent<HTMLInputElement>){
    const file=event.target.files?.[0];event.target.value="";if(!file)return;
    try{if(file.size>25_000_000)throw new Error("O backup deve ter até 25 MB.");setRestore(parseBackup(await file.text()));}
    catch(e){setToast((e as Error).message);}
  }
  async function saveEditor(e:React.FormEvent){
    e.preventDefault();if(!editor||busy)return;
    const name=editor.name.trim();if(!name){setEditorError("Dê um nome à sua lista.");return;}
    setBusy(true);setEditorError("");
    try{
      const d=await save({action:editor.list?"renameList":"createList",...(editor.list?{id:editor.list.id}:{}),name,color:editor.color});
      setLibrary(d.library);setEditor(null);setToast(editor.list?"Lista atualizada.":"Lista criada.");
      if(d.createdId){navigate("list",d.createdId);}
    }catch(e){setEditorError((e as Error).message);}finally{setBusy(false);}
  }

  const allLocal=Object.values(library.movies);
  const filteredMovies=useMemo(()=>{
    const base=view==="explore"?(remoteCatalog?.results||[]):Object.values(library.movies).filter(m=>view==="watched"?m.watched:view==="list"?m.lists.includes(activeList):m.lists.length>0).map(m=>m.movie);
    if(view==="explore")return base;
    const movies=filterMovies(base,{query:debouncedQuery,genres,sort}).filter(m=>watchFilter==="watched"?library.movies[movieKey(m)]?.watched:watchFilter==="pending"?!library.movies[movieKey(m)]?.watched:true);
    if(sort==="popular")movies.sort((a,b)=>(library.movies[movieKey(b)]?.updatedAt||"").localeCompare(library.movies[movieKey(a)]?.updatedAt||""));
    return movies;
  },[view,remoteCatalog,library,activeList,debouncedQuery,genres,watchFilter,sort]);
  const visibleMovies=view==="explore"?filteredMovies:filteredMovies.slice(0,visibleCount);
  const catalog=view==="explore"?{total:remoteCatalog?.total||0,results:visibleMovies,nextPage:remoteCatalog?.nextPage||null}:{total:filteredMovies.length,results:visibleMovies,nextPage:visibleCount<filteredMovies.length?1:null};
  const hasFilters=genres.length>0||!!query||watchFilter!=="all";
  const title=view==="explore"?(debouncedQuery?`Busca: ${debouncedQuery}`:"Catálogo"):view==="lists"?"Minhas listas":view==="watched"?"Já assistidos":list?.name||"Lista";
  const subtitle=view==="explore"?"Filmes":view==="lists"?`${library.lists.length} listas`:view==="watched"?`${watchedCount} títulos assistidos`:`${currentListCount} ${currentListCount===1?"título":"títulos"} · ${currentListWatched} ${currentListWatched===1?"assistido":"assistidos"}`;

  function movieCard(movie:Movie){
    const state=library.movies[movieKey(movie)],saved=!!state?.lists.length,watched=!!state?.watched;
    return <article className={`movie-card ${watched?"is-watched":""}`} key={movieKey(movie)}>
      <div className="poster-wrap">
        <button className="poster-button" onClick={()=>void openMovie(movie)} aria-label={`Ver detalhes de ${movie.title}`}><Poster movie={movie}/><span className="poster-gradient"/><span className="poster-details">Ver detalhes <ArrowRight size={16}/></span></button>
        <button className={`quick-add ${saved?"saved":""}`} disabled={busy||!libraryReady} onClick={()=>saved?void openMovie(movie):void mutate({action:"addMovie",listId:"watchlist",movie},`“${movie.title}” está na sua lista.`)} aria-label={saved?`Gerenciar listas de ${movie.title}`:`Adicionar ${movie.title} à lista`} title={saved?"Já está nas suas listas":"Adicionar à lista"}>{saved?<Check size={17}/>:<Plus size={18}/>}</button>
        {watched&&<span className="watched-badge"><Check size={12}/> Já assistido</span>}
        {!watched&&movie.score>0&&<span className="rating-badge"><Star size={11} fill="currentColor"/>{movie.score.toFixed(1).replace(".",",")}</span>}
      </div>
      <div className="movie-info"><button className="movie-title" onClick={()=>void openMovie(movie)} title={movie.title}>{movie.title}</button><div className="movie-meta"><span>{movie.year||"Ano a confirmar"}</span><span className="meta-dot">·</span><span>{GENRES.find(g=>g.id===movie.genres[0])?.name||"Cinema"}</span></div>
        <div className="movie-bottom"><span className="card-list-status">{saved&&<><BookmarkCheck size={12}/> Na lista</>}</span><button className={`watched-toggle ${watched?"active":""}`} disabled={busy||!libraryReady} onClick={()=>void mutate({action:"setWatched",movie,watched:!watched},watched?"Marcado como não assistido.":"Marcado como assistido.")} aria-label={`${watched?"Desmarcar":"Marcar"} ${movie.title} como assistido`} title={watched?"Já assistido":"Marcar como assistido"}><CheckCheck size={16}/></button></div>
      </div>
    </article>;
  }

  return <div className="app-shell">
    {sidebar&&<button className="sidebar-backdrop" aria-label="Fechar filtros" onClick={()=>setSidebar(false)}/>}
    <aside className={`sidebar ${sidebar?"open":""}`} aria-label="Navegação e filtros">
      <button className="brand" onClick={()=>navigate("explore")} aria-label="Cena, página inicial"><span className="brand-symbol"><PawPrint size={24} strokeWidth={1.8}/></span><span>cena<span className="brand-period">.</span></span></button>
      <div className="sidebar-scroll">
        <span className="side-label">NAVEGAÇÃO</span>
        <nav className="main-nav"><button className={view==="explore"?"active":""} onClick={()=>navigate("explore")}><Compass size={18}/> Catálogo <span className="nav-spark"><PawPrint size={13}/></span></button><button className={view==="lists"||view==="list"?"active":""} onClick={()=>navigate("lists")}><FolderHeart size={18}/> Minhas listas <span className="nav-count">{library.lists.length}</span></button><button className={view==="watched"?"active":""} onClick={()=>navigate("watched")}><CheckCheck size={18}/> Já assistidos <span className="nav-count">{watchedCount}</span></button></nav>
        <div className="side-section"><div className="side-section-heading"><span className="side-label">MINHAS LISTAS</span><button className="side-icon" aria-label="Criar lista" disabled={!libraryReady} onClick={()=>{setEditorError("");setEditor({name:"",color:"pink"});}}><Plus size={16}/></button></div><div className="side-lists">{library.lists.map(l=><button key={l.id} className={view==="list"&&activeList===l.id?"selected-list":""} onClick={()=>navigate("list",l.id)}><span className={`color-dot ${l.color}`}/><span className="side-list-name">{l.name}</span><span className="side-list-count">{listCount(l.id)}</span></button>)}<button className="new-list" disabled={!libraryReady} onClick={()=>{setEditorError("");setEditor({name:"",color:"violet"});}}><Plus size={14}/> Criar nova lista</button></div></div>
        <div className="side-divider"/>

        <div className="side-section genre-section"><div className="side-section-heading"><span className="side-label">GÊNEROS</span><SlidersHorizontal size={13}/></div><div className="genre-filters">{currentGenres.slice(0,expandedGenres?currentGenres.length:9).map(g=><button key={g.id} className={genres.includes(g.id)?"selected":""} aria-pressed={genres.includes(g.id)} onClick={()=>toggleFilter(g.id,setGenres)}><span className="filter-check">{genres.includes(g.id)&&<Check size={10}/>}</span>{g.name}</button>)}</div><button className="show-more" onClick={()=>setExpandedGenres(!expandedGenres)}>{expandedGenres?"Mostrar menos":"Todos os gêneros"}<ChevronDown size={12} className={expandedGenres?"rotate":""}/></button></div>
      </div>
      <div className="sidebar-dogs"><DogSticker/></div><button className="sidebar-footer" onClick={()=>setShowAbout(true)}><Info size={14}/><span>Dados e catálogo</span></button>
    </aside>

    <div className="main-shell"><header className="topbar"><div className="topbar-left"><button className="icon-button mobile-menu" onClick={()=>setSidebar(true)} aria-label="Abrir menu e filtros"><Menu size={21}/></button><div className="breadcrumb"><span>Minha coleção</span><ChevronRight size={13}/><strong>{view==="explore"?"Catálogo":view==="watched"?"Já assistidos":"Minhas listas"}</strong></div></div><div className="topbar-right"><span className="region"><Bookmark size={14}/>{storageMode==="shared"?"Salvo na Vercel":storageMode==="local"?"Neste navegador":"Carregando listas"}</span><span className="topbar-divider"/><button className="profile" onClick={()=>navigate("lists")} aria-label="Abrir minhas listas"><span>G</span><span className="profile-text">Minhas listas</span></button></div></header>
    <main>
      <div className="intro-row"><div><h1>{title}</h1><p>{subtitle}</p></div><div className="search-box"><Search size={18}/><input ref={searchRef} aria-label="Pesquisar filmes" placeholder={view==="explore"?"Buscar filmes...":"Buscar nas suas listas..."} value={query} onChange={e=>setQuery(e.target.value)}/>{query?<button aria-label="Limpar busca" onClick={()=>setQuery("")}><X size={15}/></button>:<kbd>⌘ K</kbd>}</div></div>
      {libraryError&&<div className="error-banner" role="alert"><Info size={16}/><span>{libraryError}</span><button onClick={()=>void initialize()}>Tentar novamente</button></div>}

      {view==="explore"&&!debouncedQuery&&!hasFilters&&<section className="library-summary" aria-label="Resumo das listas"><div className="summary-content"><div className="summary-heading"><span><Bookmark size={18}/></span><h2>Resumo</h2></div><div className="summary-stats"><button onClick={()=>{navigate("lists");}}><strong>{pendingCount}</strong><span>Para assistir</span></button><button onClick={()=>navigate("watched")}><strong>{watchedCount}</strong><span>Assistidos</span></button><button onClick={()=>navigate("lists")}><strong>{library.lists.length}</strong><span>Listas</span></button></div></div><DogSticker className="summary-dogs"/></section>}

      {view==="lists"?<>
        <div className="collection-toolbar"><div className="collection-stats"><span><strong>{savedCount}</strong> títulos salvos</span><span><strong>{pendingCount}</strong> para assistir</span><span><strong>{watchedCount}</strong> já assistidos</span></div><button className="primary-button" disabled={!libraryReady} onClick={()=>{setEditorError("");setEditor({name:"",color:"pink"});}}><Plus size={16}/> Nova lista</button></div>
        <div className="lists-grid">{library.lists.filter(l=>!debouncedQuery||fold(l.name).includes(fold(debouncedQuery))).map(l=>{
          const entries=allLocal.filter(m=>m.lists.includes(l.id)),watched=entries.filter(m=>m.watched).length;
          return <button key={l.id} className={`collection-card theme-${l.color}`} onClick={()=>navigate("list",l.id)}><div className="collection-art">{entries.length?<div className="collection-posters">{entries.slice(0,3).map(m=><Poster key={movieKey(m.movie)} movie={m.movie}/>)}</div>:<><DogSticker className="collection-dogs"/><span>Lista vazia</span></>}</div><div className="collection-info"><div><h2><span className={`color-dot ${l.color}`}/>{l.name}</h2><p>{entries.length} títulos <span>·</span> {watched} assistidos</p></div><ArrowRight size={19}/></div><div className="progress-track"><span style={{width:`${entries.length?watched/entries.length*100:0}%`}}/></div></button>;
        })}<button className="create-collection" disabled={!libraryReady} onClick={()=>{setEditorError("");setEditor({name:"",color:"violet"});}}><span><Plus size={23}/></span><h2>Criar nova lista</h2></button></div>
      </>:<>
        <div className="catalog-heading"><div className="media-tabs"><span className="catalog-tab"><Film size={17}/> Filmes</span></div><div className="heading-tools">{view==="list"&&list&&<><button className="text-button" disabled={busy} onClick={()=>{setEditorError("");setEditor({list,name:list.name,color:list.color});}}><Pencil size={14}/>Editar lista</button>{list.id!=="watchlist"&&<button className="icon-button" disabled={busy} aria-label="Excluir lista" onClick={()=>setDeleteList(list)}><Trash2 size={15}/></button>}</>}<span className="catalog-region">{snapshot?.importedAt?`Catálogo · ${new Date(snapshot.importedAt).toLocaleDateString("pt-BR")}`:"Arquivo local"}</span></div></div>
        <section className="catalog-section" aria-label="Catálogo de filmes"><div className="section-title-row"><div><h2>{view==="watched"?"Títulos assistidos":view==="list"?"Títulos da lista":debouncedQuery?"Resultados":hasFilters?"Resultados filtrados":"Filmes"}<span className="results-count">{number(catalog.total)}</span></h2></div><div className="sort-layout"><label className="sort-select"><ArrowDownWideNarrow size={15}/><select aria-label="Ordenar filmes" value={sort} onChange={e=>setSort(e.target.value)} ><option value="popular">{view!=="explore"?"Adicionados recentemente":"Popularidade"}</option><option value="rating">Melhor avaliação</option><option value="recent">Mais recentes</option></select><ChevronDown size={13}/></label><div className="layout-switch" aria-label="Visualização"><button aria-label="Visualização em grade" aria-pressed={layout==="grid"} className={layout==="grid"?"active":""} onClick={()=>setLayout("grid")}><Grid2X2 size={15}/></button><button aria-label="Visualização em lista" aria-pressed={layout==="rows"} className={layout==="rows"?"active":""} onClick={()=>setLayout("rows")}><List size={16}/></button></div></div></div>
        <div className="filter-row"><div className="status-tabs"><button className={watchFilter==="all"?"active":""} onClick={()=>setWatchFilter("all")}>Todos</button><button className={watchFilter==="pending"?"active":""} onClick={()=>setWatchFilter("pending")}><Bookmark size={12}/> Não assistidos</button><button className={watchFilter==="watched"?"active":""} onClick={()=>setWatchFilter("watched")}><CheckCheck size={13}/> Já assistidos</button></div><button className="mobile-filter" onClick={()=>setSidebar(true)}><SlidersHorizontal size={14}/>Filtros{genres.length>0&&` (${genres.length})`}</button>{hasFilters&&<button className="clear-filters" onClick={resetFilters}>Limpar filtros <X size={12}/></button>}</div>
        {genres.length>0&&<div className="active-filters">{genres.map(id=><button key={id} onClick={()=>toggleFilter(id,setGenres)}>{currentGenres.find(g=>g.id===id)?.name}<X size={12}/></button>)}</div>}
        {catalogError&&view==="explore"&&<div className="error-banner" role="alert"><Info size={16}/><span>{catalogError}</span><button onClick={()=>remoteCatalog?.results.length?void loadMore():setRetry(r=>r+1)}>Tentar novamente</button></div>}
        {loading&&view==="explore"?<div className="movies-grid skeletons" aria-label="Carregando catálogo" aria-busy="true">{Array.from({length:6},(_,i)=><div className="skeleton-card" key={i}><div/><span/><small/></div>)}</div>:!visibleMovies.length?<div className="empty-state"><DogSticker className="empty-dogs"/><h3>{view==="watched"?"Nenhum título assistido":view==="list"&&!hasFilters?"Lista vazia":"Nenhum título encontrado"}</h3><p>{view==="watched"?"Marque um título como assistido e ele vai aparecer aqui.":view==="list"&&!hasFilters?"Explore o catálogo e adicione os filmes que você quer ver.":catalog?.nextPage?"Carregue mais títulos ou ajuste os filtros.":"Experimente outro nome ou ajuste os filtros da sua busca."}</p>{view!=="explore"?<button className="primary-button" onClick={()=>navigate("explore")}>Ver catálogo <ArrowRight size={15}/></button>:hasFilters&&<button className="secondary-button" onClick={resetFilters}>Limpar filtros</button>}</div>:<div className={`movies-grid ${layout==="rows"?"rows":""}`}>{visibleMovies.map(movieCard)}</div>}
        {!loading&&catalog.nextPage&&<div className="load-more"><button className="secondary-button" disabled={loadingMore} onClick={()=>void loadMore()}>{loadingMore?<Loader2 size={15} className="spin"/>:<Plus size={15}/>} {loadingMore?"Carregando...":"Carregar mais títulos"}</button>{catalog.total!==null&&<span>{number(catalog.results.length)} de {number(catalog.total)} títulos</span>}</div>}
        </section>
      </>}
      <footer className="main-footer"><span><PawPrint size={14}/> Catálogo</span><button onClick={()=>setShowAbout(true)}>Dados e catálogo <Info size={13}/></button></footer>
    </main></div>

    {selected&&<Modal label={`Detalhes de ${selected.title}`} onClose={closeMovie} className="movie-modal"><button className="modal-close" aria-label="Fechar detalhes" onClick={closeMovie}><X size={20}/></button><div className="detail-art">{selected.backdrop?<img src={imageUrl(selected.backdrop,"w1280")} alt=""/>:selected.poster?<img className="blur-art" src={imageUrl(selected.poster)} alt=""/>:null}<div className="detail-shade"/></div><div className="detail-body"><div className="detail-top"><Poster movie={selected}/><div className="detail-heading"><div className="eyebrow">FILME</div><h2>{selected.title}</h2><div className="detail-meta"><span>{selected.year||"Ano a confirmar"}</span>{selected.runtime&&<><span>·</span><span>{duration(selected.runtime)}</span></>}{selected.score>0&&<><span>·</span><span className="detail-rating"><Star size={13} fill="currentColor"/>{selected.score.toFixed(1).replace(".",",")} <small>TMDB</small></span></>}</div><div className="detail-genres">{selected.genres.map(id=><span key={id}>{GENRES.find(g=>g.id===id)?.name}</span>)}</div></div></div><p className="synopsis">{selected.overview}</p>
      <div className="save-section"><h3><ListPlus size={16}/> Adicionar às suas listas</h3><div className="save-list-options">{library.lists.map(l=>{const added=library.movies[movieKey(selected)]?.lists.includes(l.id);return <button key={l.id} disabled={busy||!libraryReady} aria-pressed={!!added} className={added?"added":""} onClick={()=>void mutate(added?{action:"removeMovie",listId:l.id,key:movieKey(selected)}:{action:"addMovie",listId:l.id,movie:selected},added?`Removido de “${l.name}”.`:`Salvo em “${l.name}”.`)}><span className={`color-dot ${l.color}`}/>{l.name}<span>{added?<Check size={15}/>:<Plus size={15}/>}</span></button>;})}</div></div><button className={`watched-full ${library.movies[movieKey(selected)]?.watched?"checked":""}`} disabled={busy||!libraryReady} onClick={()=>void mutate({action:"setWatched",movie:selected,watched:!library.movies[movieKey(selected)]?.watched},library.movies[movieKey(selected)]?.watched?"Marcado como não assistido.":"Marcado como já assistido.")}><CheckCheck size={19}/><span>{library.movies[movieKey(selected)]?.watched?"Já assistido":"Marcar como assistido"}<small>{library.movies[movieKey(selected)]?.watched?"Clique para marcar como não assistido":"Salvar no histórico de assistidos"}</small></span>{busy?<Loader2 size={17} className="spin"/>:library.movies[movieKey(selected)]?.watched?<Check size={17}/>:<Plus size={17}/>}</button>{toast&&<p className="modal-notice" role="status">{toast}</p>}</div></Modal>}

    {editor&&<Modal label={editor.list?"Editar lista":"Criar nova lista"} onClose={()=>{if(!busy)setEditor(null);}} className="editor-modal"><button className="modal-close" aria-label="Fechar" disabled={busy} onClick={()=>setEditor(null)}><X size={19}/></button><DogSticker className="editor-dogs"/><h2>{editor.list?"Editar lista":"Nova lista"}</h2><form onSubmit={e=>void saveEditor(e)}><label htmlFor="list-name">Nome da lista</label><input id="list-name" autoFocus maxLength={60} placeholder="Ex.: Para o fim de semana" value={editor.name} onChange={e=>setEditor({...editor,name:e.target.value})}/><label>Escolha uma cor</label><div className="color-options">{COLORS.map(color=><button key={color} className={`color-option ${color} ${editor.color===color?"selected":""}`} type="button" aria-label={`Cor ${({amber:"âmbar",violet:"violeta",blue:"azul",green:"verde",pink:"rosa"})[color]}`} aria-pressed={editor.color===color} onClick={()=>setEditor({...editor,color})}>{editor.color===color&&<Check size={17}/>}</button>)}</div>{editorError&&<p role="alert" className="inline-error">{editorError}</p>}<button className="primary-button" disabled={busy} type="submit">{busy?<Loader2 size={16} className="spin"/>:<Plus size={16}/>} {editor.list?"Salvar alterações":"Criar lista"}</button></form></Modal>}
    {deleteList&&<Modal label="Excluir lista" onClose={()=>{if(!busy)setDeleteList(null);}} className="editor-modal"><div className="editor-icon"><Trash2 size={25}/></div><h2>Excluir “{deleteList.name}”?</h2><p>Os títulos serão removidos desta lista. Seus filmes assistidos e as outras listas serão mantidos.</p><div className="confirm-actions"><button className="secondary-button" disabled={busy} onClick={()=>setDeleteList(null)}>Manter lista</button><button className="danger-button" disabled={busy} onClick={async()=>{if(await mutate({action:"deleteList",id:deleteList.id},"Lista excluída.")){setDeleteList(null);navigate("lists");}}}>Excluir lista</button></div></Modal>}
    {showAbout&&<Modal label="Dados e catálogo" onClose={()=>setShowAbout(false)} className="editor-modal about-modal"><button className="modal-close" aria-label="Fechar" onClick={()=>setShowAbout(false)}><X size={19}/></button><div className="editor-icon"><Info size={26}/></div><h2>Dados e catálogo</h2><h3>Suas listas</h3><p>{storageMode==="shared"?"Salvas em um arquivo JSON na Vercel. Quem acessar este endereço vê e pode editar a mesma coleção. As listas continuam salvas ao trocar de aparelho.":"Salvas neste navegador. Para manter a mesma coleção em todos os aparelhos, conecte um Blob privado ao projeto na Vercel e faça um novo deploy. Você também pode exportar e importar um backup."}</p><div className="backup-actions"><button className="secondary-button" disabled={!libraryReady} onClick={()=>{try{downloadBackup();}catch(e){setToast((e as Error).message);}}}>Exportar listas</button><button className="secondary-button" onClick={()=>backupRef.current?.click()}>Importar listas</button></div><input type="file" ref={backupRef} accept=".json,application/json" className="visually-hidden" aria-label="Arquivo de backup das listas" onChange={e=>void chooseBackup(e)}/><h3>Filmes</h3><p>{number(snapshot?.total||0)} títulos do arquivo oficial do TMDB de {snapshot?.exportDate||"data não informada"}. {number(snapshot?.detailedTotal||0)} com metadados importados; {number(snapshot?.translatedTotal||0)} consultados em português.</p><p>Alguns títulos e sinopses estão em inglês ou no idioma original. O filtro de gênero usa os gêneros cadastrados. Novos lançamentos exigem atualizar os arquivos do catálogo.</p><p>Os títulos e as sinopses estão no arquivo do site. Os pôsteres carregam do TMDB. As notas e os indicadores vêm das fontes importadas; não são contagens de visualizações dos streamings.</p><div className="data-credits"><a href="https://www.themoviedb.org" target="_blank" rel="noreferrer"><img className="official-tmdb-logo" src="https://www.themoviedb.org/assets/2/v4/logos/v2/blue_short-8e7b30f73a4020692ccca9c88bafe5dcb6f8a62a4c6bc55cd9ba82bb2cd95f6c.svg" alt="TMDB" width={95} height={14}/></a><a href="https://www.kaggle.com/datasets/asaniczka/tmdb-movies-dataset-2023-930k-movies" target="_blank" rel="noreferrer">Metadados: Asaniczka (ODC-By)</a></div><small>This product uses the TMDB API but is not endorsed or certified by TMDB.</small></Modal>}
    {restore&&<Modal label="Importar backup" onClose={()=>setRestore(null)} className="editor-modal"><h2>Importar listas?</h2><p>O backup tem {restore.lists.length} listas e {Object.keys(restore.movies).length} filmes. Ele vai substituir {storageMode==="shared"?"as listas e o histórico compartilhados na Vercel":"as listas e o histórico deste navegador"}.</p><div className="confirm-actions"><button className="secondary-button" onClick={()=>setRestore(null)}>Cancelar</button><button className="primary-button" disabled={busy} onClick={async()=>{setBusy(true);try{if(storageMode==="shared"){const data=await api<{library:Library}>("/api/library",{action:"restore",library:restore});setLibrary(data.library);}else{persistLibrary(window.localStorage,restore);setLibrary(restore);}setLibraryReady(true);setLibraryError("");setRestore(null);setShowAbout(false);navigate("lists");setToast("Backup importado.");}catch(e){setToast((e as Error).message);}finally{setBusy(false);}}}>Importar backup</button></div></Modal>}
    {toast&&<div className="toast" role="status"><Check size={17}/><span>{toast}</span><button aria-label="Fechar aviso" onClick={()=>setToast("")}><X size={14}/></button></div>}
  </div>;
}
