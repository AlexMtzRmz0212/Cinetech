import { LibraryView } from "@/components/LibraryView";
import { SetupError } from "@/components/SetupError";
import { listAllMovies } from "@/lib/notion/movies";
import { toPublic, type PublicMovie } from "@/lib/types";

// Public showcase: re-read Notion at most every 15 min (owner actions refresh it right away).
export const revalidate = 900;

export default async function Home() {
  let movies: PublicMovie[];
  try {
    movies = (await listAllMovies()).map(toPublic);
  } catch (error) {
    return <SetupError error={error} />;
  }
  return <LibraryView movies={movies} />;
}
