# Cinetech

A personal movie library that uses **Notion as its database** and keeps it enriched and in sync with TMDb, OMDb and Letterboxd.
It replaces the old `NotionIMDb.py`, `NotionTMDb` and `LetterboxdNotion` scripts.

- **Library**: poster grid with filters (genre, director, status, rating) and search
- **Add**: search TMDb, add to Notion as Watched or Watchlist with full metadata
- **Sync**: fill missing metadata (or refresh all), import from Letterboxd (RSS or export ZIP), IMDb (CSV) and Trakt, with progress and a stop button
- **Stats**: watched per year, ratings, decades, genres, directors, actors

## Setup

1. **Notion**: create an internal integration at <https://www.notion.so/profile/integrations>, then open your movie database -> `...` -> *Connections* and add it. Copy the database id from its URL.
2. **TMDb**: create a free account, then copy the *API Read Access Token* (<https://www.themoviedb.org/settings/api>).
3. **OMDb** (optional, gives the IMDb rating): <https://www.omdbapi.com/apikey.aspx>.
4. Copy `.env.example` to `.env.local` and fill it in. Pick any `APP_PASSWORD`; make `SESSION_SECRET` a long random string (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).
5. `npm install`, then `npm run dev`, and open <http://localhost:3000>.

On first load the app adds any missing columns to your Notion database (it never removes or renames anything).

## Notion columns

Existing columns used by the old scripts are reused as is: **Year, IMDb ID, IMDb Rating, Directors, Genres, Languages, Cast, Release Date**.
The title column can have any name. Added automatically: **TMDb ID, TMDb Rating, Letterboxd Rating, Runtime, Overview, Poster (URL), Status (Watched/Watchlist), Watched Date, Source, Last Synced**.

*Fill missing* mode only writes empty fields. *Refresh everything* overwrites provider fields (never Status, Watched Date, Letterboxd Rating or Source).

## Letterboxd

Letterboxd has no public OAuth, so there are two ways in, neither stores your password:

- **Quick sync**: your public username -> RSS feed (recent diary entries, with rating and watched date).
- **Full history**: upload the ZIP from Letterboxd *Settings -> Data -> Export*. Uses `diary.csv`, `ratings.csv`, `watched.csv`, `watchlist.csv`.

Imports are idempotent: films are matched by TMDb id, IMDb id, or title + year, existing rows are updated instead of duplicated, and Watched is never downgraded to Watchlist.

## Adding another source

Implement `MovieProvider` (`src/lib/providers/types.ts`) and add it to `src/lib/providers/registry.ts`. A provider can `search`, `enrich` (return metadata) and/or `import` (return `ImportEntry[]` of watched/rated/watchlist films).
Built in: **TMDb, OMDb, Letterboxd, IMDb** (upload ratings/watchlist CSV exports) and **Trakt** (public profile + `TRAKT_CLIENT_ID`). Ratings from Letterboxd go to *Letterboxd Rating*; IMDb/Trakt ratings go to *My Rating* (0.5-5 scale).

## Deploy to Vercel

Import the repo, set the environment variables from `.env.example`, deploy. Long jobs (enrich, import) run as small batches driven by the browser, so they stay within serverless time limits. The whole app sits behind the password gate (`src/proxy.ts`).

## Develop

```bash
npm run dev     # dev server
npm test        # vitest
npm run lint    # type check
npm run build
```
