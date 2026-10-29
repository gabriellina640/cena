import { z } from "zod";
import { LibraryAction, MovieInput } from "./validation";
import { movieKey, type Library } from "./types";

export const STORAGE_KEY = "cena.library.v1";
export interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void; }
export const SavedLibrary = z.object({
  lists: z.array(z.object({ id: z.string().min(1).max(100), name: z.string().trim().min(1).max(60), color: z.enum(["pink", "violet", "blue", "green", "amber"]), createdAt: z.string().max(100) })).max(1000),
  movies: z.record(z.object({ movie: MovieInput, watched: z.boolean(), watchedAt: z.string().max(100).nullable(), updatedAt: z.string().max(100), lists: z.array(z.string().min(1).max(100)).max(1000) })),
}).superRefine((value, ctx) => {
  const ids = new Set(value.lists.map(l => l.id));
  if (ids.size !== value.lists.length || !ids.has("watchlist")) ctx.addIssue({ code: "custom", message: "Listas inválidas." });
  for (const [key, entry] of Object.entries(value.movies)) {
    if (key !== movieKey(entry.movie) || entry.movie.type !== "movie" || entry.lists.some(id => !ids.has(id))) ctx.addIssue({ code: "custom", message: "Filme ou lista inválidos." });
  }
});

export function newLibrary(): Library {
  return { lists: [{ id: "watchlist", name: "Quero assistir", color: "pink", createdAt: new Date().toISOString() }], movies: {} };
}

export function parseBackup(text: string): Library {
  let json: unknown;
  try { json = JSON.parse(text); } catch { throw new Error("O arquivo de backup não é um JSON válido."); }
  const envelope = z.object({ app: z.enum(["cena", "cena-terror"]), version: z.literal(1), library: SavedLibrary }).safeParse(json);
  if (!envelope.success) throw new Error("Este arquivo não é um backup válido do Cena.");
  return envelope.data.library;
}

export function exportBackup(library: Library): string {
  return JSON.stringify({ app: "cena", version: 1, exportedAt: new Date().toISOString(), library }, null, 2);
}

export function readLocalLibrary(storage: StorageLike): Library {
  let raw: string | null;
  try { raw = storage.getItem(STORAGE_KEY) || storage.getItem("cena.terror.library.v1"); } catch { throw new Error("O navegador bloqueou o armazenamento. Permita os dados deste site para salvar suas listas."); }
  if (!raw) {
    const library = newLibrary();
    persistLibrary(storage, library);
    return library;
  }
  try { return SavedLibrary.parse(JSON.parse(raw)); }
  catch { throw new Error("Não foi possível ler suas listas. Os dados existentes foram preservados. Importe um backup para recuperá-las."); }
}

export function persistLibrary(storage: StorageLike, library: Library): void {
  try { storage.setItem(STORAGE_KEY, JSON.stringify(library)); }
  catch { throw new Error("Não foi possível salvar no navegador. Verifique o espaço disponível e a permissão de armazenamento deste site."); }
}

export function applyLibraryAction(current: Library, input: unknown): { library: Library; createdId?: string } {
  const parsed = LibraryAction.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || "Alteração inválida.");
  const action = parsed.data;
  const library = structuredClone(current);
  const now = new Date().toISOString();
  let createdId: string | undefined;
  if (action.action === "createList") {
    createdId = typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Array.from(crypto.getRandomValues(new Uint32Array(4)), n => n.toString(16).padStart(8, "0")).join("");
    library.lists.push({ id: createdId, name: action.name, color: action.color, createdAt: now });
  } else if (action.action === "renameList") {
    const list = library.lists.find(l => l.id === action.id);
    if (!list) throw new Error("Essa lista não existe mais.");
    list.name = action.name; list.color = action.color;
  } else if (action.action === "deleteList") {
    if (action.id === "watchlist") throw new Error("A lista principal deve ser mantida.");
    library.lists = library.lists.filter(l => l.id !== action.id);
    for (const entry of Object.values(library.movies)) entry.lists = entry.lists.filter(id => id !== action.id);
  } else if (action.action === "addMovie" || action.action === "setWatched") {
    if (action.movie.type !== "movie") throw new Error("Este catálogo aceita apenas filmes.");
    if (action.action === "addMovie" && !library.lists.some(l => l.id === action.listId)) throw new Error("Essa lista não existe mais.");
    const key = movieKey(action.movie);
    const entry = library.movies[key] || { movie: action.movie, watched: false, watchedAt: null, updatedAt: now, lists: [] };
    entry.movie = action.movie; entry.updatedAt = now;
    if (action.action === "addMovie" && !entry.lists.includes(action.listId)) entry.lists.push(action.listId);
    if (action.action === "setWatched") { entry.watched = action.watched; entry.watchedAt = action.watched ? now : null; }
    library.movies[key] = entry;
  } else if (action.action === "removeMovie") {
    const entry = library.movies[action.key];
    if (entry) { entry.lists = entry.lists.filter(id => id !== action.listId); entry.updatedAt = now; }
  }
  return { library, createdId };
}

export function changeLocalLibrary(storage: StorageLike, input: unknown) { const result=applyLibraryAction(readLocalLibrary(storage),input); persistLibrary(storage,result.library); return result; }
