export const GENRES = [
  { id: 28, name: "Ação" }, { id: 12, name: "Aventura" }, { id: 16, name: "Animação" },
  { id: 35, name: "Comédia" }, { id: 80, name: "Crime" }, { id: 99, name: "Documentário" },
  { id: 18, name: "Drama" }, { id: 10751, name: "Família" }, { id: 14, name: "Fantasia" },
  { id: 36, name: "História" }, { id: 27, name: "Terror" }, { id: 10402, name: "Música" },
  { id: 9648, name: "Mistério" }, { id: 10749, name: "Romance" }, { id: 878, name: "Ficção científica" },
  { id: 10770, name: "Filme para TV" }, { id: 53, name: "Suspense" }, { id: 10752, name: "Guerra" }, { id: 37, name: "Faroeste" },
];
export const COLORS = ["amber", "violet", "blue", "green", "pink"] as const;
export const IMAGE_BASE = "https://image.tmdb.org/t/p/";
export const imageUrl = (path: string | null | undefined, size = "w500") => path ? `${IMAGE_BASE}${size}${path}` : undefined;
