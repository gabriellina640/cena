export type MediaType = "movie" | "tv";
export type Provider = { id: number; name: string; logo?: string | null };
export type Movie = {
  id: number; type: MediaType; title: string; originalTitle?: string; year: number;
  genres: number[]; overview: string; poster: string | null; backdrop: string | null;
  score: number; runtime?: number; popularity: number; providers: Provider[];
  availabilityKnown: boolean; watchLink?: string; source: "demo" | "tmdb";
};
export type MovieState = { movie: Movie; watched: boolean; watchedAt: string | null; updatedAt: string; lists: string[] };
export type FilmList = { id: string; name: string; color: string; createdAt: string };
export type Library = { lists: FilmList[]; movies: Record<string, MovieState> };
export type CatalogResult = { results: Movie[]; total: number | null; page: number; nextPage: number | null; mode: "demo" | "live"; searched?: boolean; note?: string };
export const movieKey = (m: Pick<Movie, "id" | "type">) => `${m.type}:${m.id}`;
