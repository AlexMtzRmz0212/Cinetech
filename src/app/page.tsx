import { LibraryView } from "@/components/LibraryView";
import { SetupError } from "@/components/SetupError";
import { listAllMovies } from "@/lib/notion/movies";
import type { Movie } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Home() {
  let movies: Movie[];
  try {
    movies = await listAllMovies({ fresh: true });
  } catch (error) {
    return <SetupError error={error} />;
  }
  return <LibraryView movies={movies} />;
}
