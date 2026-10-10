import { describe, expect, it } from "vitest";
import { isPublicPath } from "@/lib/auth";
import { emptyMovie, toPublic } from "@/lib/types";

describe("public showcase", () => {
  it("only the read-only pages are open to visitors", () => {
    for (const p of ["/", "/stats", "/login", "/api/me"]) expect(isPublicPath(p)).toBe(true);
    for (const p of ["/add", "/sync", "/api/movies", "/api/sync", "/api/search", "/api/import/apply", "/api/import/trakt"]) {
      expect(isPublicPath(p)).toBe(false);
    }
  });

  it("strips Notion ids and sync internals from what visitors get", () => {
    const pub = toPublic({ ...emptyMovie("Heat"), pageId: "abc", source: "Letterboxd", lastSynced: "2025-01-01", year: 1995 });
    expect(pub).toEqual({ ...emptyMovie("Heat"), year: 1995 });
    expect("pageId" in pub).toBe(false);
  });
});
