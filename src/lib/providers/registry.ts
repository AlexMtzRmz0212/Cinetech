import { imdbProvider } from "./imdb";
import { letterboxdProvider } from "./letterboxd";
import { omdbProvider } from "./omdb";
import { tmdbProvider } from "./tmdb";
import { traktProvider } from "./trakt";
import type { MovieProvider } from "./types";

/** Adding a source = write a MovieProvider, add it here. */
export const providers: MovieProvider[] = [tmdbProvider, omdbProvider, letterboxdProvider, imdbProvider, traktProvider];

export const getProvider = (id: string) => providers.find((p) => p.id === id);

/** Providers that fill in movie metadata, in priority order (later ones don't override earlier ones). */
export const enrichers = () => providers.filter((p) => p.enrich && p.configured());
