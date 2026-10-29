import type { Movie } from "./types";
export interface Snapshot {
  version: 1;
  importedAt: string | null;
  source: "tmdb" | "sample";
  complete: boolean;
  expectedTotal: number;
  movies: Movie[];
}
export const fold = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
export function filterMovies(movies: Movie[], { query = "", genres = [], sort = "popular" }: { query?: string; genres?: number[]; sort?: string } = {}): Movie[] {
  const q = fold(query.trim());
  return movies.filter(m => m.type === "movie" && (!q || fold(`${m.title} ${m.originalTitle || ""}`).includes(q)) && (!genres.length || genres.some(g => m.genres.includes(g))))
    .sort((a, b) => sort === "rating" ? b.score - a.score || b.popularity - a.popularity : sort === "recent" ? b.year - a.year || b.popularity - a.popularity : b.popularity - a.popularity || b.year - a.year);
}
