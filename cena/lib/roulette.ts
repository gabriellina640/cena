import type { Library, Movie } from "./types";

export function rouletteCandidates(library: Library, listId: string): Movie[] {
  return Object.values(library.movies)
    .filter(entry => entry.lists.includes(listId) && !entry.watched)
    .map(entry => entry.movie);
}
