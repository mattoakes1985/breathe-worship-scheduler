// Songs vault data hooks. One library query joins songs + usage stats +
// open review counts client-side (206 songs: cheap, and it keeps RLS simple).
import { useQuery, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/database.types";
import type { Song, SongFilters, SongWithStats, SortSpec } from "./songModel";

export const SONG_KEYS = {
  library: ["songs-vault", "library"] as const,
  tags: ["songs-vault", "tags"] as const,
  views: ["songs-vault", "views"] as const,
  reviews: ["songs-vault", "reviews"] as const,
  dismissals: ["songs-vault", "dismissals"] as const,
  history: (id: string) => ["songs-vault", "history", id] as const,
};

/** Invalidate everything song-related, including the older screens' caches. */
export function invalidateSongs(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ["songs-vault"] });
  qc.invalidateQueries({ queryKey: ["songs"] });
  qc.invalidateQueries({ queryKey: ["song-intel"] });
}

export function useSongLibrary() {
  return useQuery({
    queryKey: SONG_KEYS.library,
    queryFn: async (): Promise<SongWithStats[]> => {
      const [songs, stats, reviews] = await Promise.all([
        supabase.from("songs").select("*").order("title"),
        supabase.from("song_stats").select("*"),
        supabase.from("song_review_items").select("song_id").eq("status", "open"),
      ]);
      if (songs.error) throw songs.error;
      if (stats.error) throw stats.error;
      const statMap = new Map((stats.data ?? []).map((s) => [s.song_id, s]));
      const reviewCount = new Map<string, number>();
      for (const r of reviews.data ?? []) reviewCount.set(r.song_id, (reviewCount.get(r.song_id) ?? 0) + 1);
      return (songs.data as Song[]).map((s) => {
        const st = statMap.get(s.id);
        return {
          ...s,
          legacy_played_keys: s.legacy_played_keys ?? [],
          stats: {
            times_sung: st?.times_sung ?? 0,
            last_sung: st?.last_sung ?? null,
            next_planned: st?.next_planned ?? null,
            played_keys: st?.played_keys ?? [],
          },
          openReviews: reviewCount.get(s.id) ?? 0,
        };
      });
    },
  });
}

export type SongTag = Tables<"song_tags">;
export function useSongTags() {
  return useQuery({
    queryKey: SONG_KEYS.tags,
    queryFn: async (): Promise<SongTag[]> => {
      const { data, error } = await supabase.from("song_tags").select("*").order("sort_order").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export interface SavedView {
  id: string;
  name: string;
  owner_id: string;
  is_shared: boolean;
  filters: SongFilters;
  sort?: SortSpec;
}
export function useSavedViews() {
  return useQuery({
    queryKey: SONG_KEYS.views,
    queryFn: async (): Promise<SavedView[]> => {
      const { data, error } = await supabase.from("song_saved_views").select("*").order("sort_order").order("name");
      if (error) throw error;
      return (data ?? []).map((v) => {
        const blob = (v.filters ?? {}) as { filters?: SongFilters; sort?: SortSpec } & SongFilters;
        // stored as { filters, sort }; tolerate a bare filters object too
        const filters = blob.filters ?? (blob as SongFilters);
        return { id: v.id, name: v.name, owner_id: v.owner_id, is_shared: v.is_shared, filters, sort: blob.sort };
      });
    },
  });
}

/** Friendly message for a Postgres/PostgREST error on a song write. */
export function songErrorMessage(e: unknown): string {
  const msg = (e as { message?: string })?.message ?? String(e);
  if (msg.includes("songs_bpm_range")) return "BPM must be between 20 and 300.";
  if (msg.includes("songs_time_sig_format") || msg.includes("songs_click_sig_format"))
    return "Time signatures look like 4/4 or 6/8.";
  if (msg.includes("songs_links_http")) return "Links must start with http:// or https://";
  if (msg.includes("songs_title_not_blank")) return "Every song needs a title.";
  if (msg.includes("songs_key_length")) return "Keep keys short (40 characters max).";
  if (msg.includes("never deleted")) return "Songs are never deleted — archive or merge instead.";
  if (msg.includes("Team leads and admins only")) return "Only team leads and admins can do that.";
  return msg;
}
