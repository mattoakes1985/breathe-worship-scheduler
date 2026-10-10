import { toLocalISODate } from "@/lib/format";
// Admin full export (CSV + JSON) and dry-run import. Import never deletes:
// it shows a field-by-field diff first; "Apply" updates changed songs (with
// the same version check as the editor) and adds new ones.
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Download, FileUp, ShieldAlert } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Card, EmptyState, ErrorState, Spinner } from "@/components/ui";
import type { TablesInsert, TablesUpdate } from "@/lib/supabase/database.types";
import { invalidateSongs, songErrorMessage, useSongLibrary } from "./data";
import { diffImport, FIELD_LABEL, formatValue, parseImport, songsToCsv, songsToJson, type ImportDiff, type ImportRow } from "./songModel";

function download(name: string, mime: string, body: string) {
  const blob = new Blob([mime.includes("csv") ? "﻿" + body : body], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function ImportExport() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const { data: songs, isLoading, error, refetch } = useSongLibrary();
  const [file, setFile] = useState<{ name: string; rows: ImportRow[] } | null>(null);
  const [diff, setDiff] = useState<ImportDiff | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [report, setReport] = useState<string | null>(null);

  const apply = useMutation({
    mutationFn: async (d: ImportDiff) => {
      let updated = 0, added = 0;
      const failed: string[] = [];
      for (const c of d.changed) {
        const patch = Object.fromEntries(c.changes.map((x) => [x.field, x.to])) as TablesUpdate<"songs">;
        const { data, error } = await supabase.from("songs").update(patch).eq("id", c.song.id).eq("version", c.song.version).select("id");
        if (error) failed.push(`${c.song.title}: ${songErrorMessage(error)}`);
        else if (!data?.length) failed.push(`${c.song.title}: changed by someone else since the dry run — skipped`);
        else updated++;
      }
      for (const r of d.added) {
        const { error } = await supabase.from("songs").insert({ ...(r.values as Partial<TablesInsert<"songs">>), title: String(r.values.title) });
        if (error) failed.push(`${r.values.title}: ${songErrorMessage(error)}`);
        else added++;
      }
      return { updated, added, failed };
    },
    onSuccess: (r) => {
      setReport(
        `Updated ${r.updated}, added ${r.added}.` + (r.failed.length ? ` ${r.failed.length} not applied:\n• ${r.failed.join("\n• ")}` : " Everything applied.")
      );
      setDiff(null);
      setFile(null);
      invalidateSongs(qc);
    },
  });

  if (!isAdmin)
    return <EmptyState icon={<ShieldAlert />} title="Admins only" body="Full export and import are limited to admins, because the export contains the whole library." />;
  if (isLoading) return <Spinner />;
  if (error) return <ErrorState message={songErrorMessage(error)} retry={() => refetch()} />;
  const all = songs ?? [];
  const stamp = toLocalISODate(new Date());

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <h2 className="font-display font-bold">Export the whole library</h2>
        <p className="text-sm text-soft">
          All {all.length} songs, archived ones included, with usage stats. Keep a copy before big changes. Re-importing an untouched export shows zero differences.
        </p>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" onClick={() => download(`breathe-songs-${stamp}.csv`, "text/csv;charset=utf-8", songsToCsv(all))}>
            <Download size={16} /> CSV (opens in Excel)
          </button>
          <button className="btn-secondary" onClick={() => download(`breathe-songs-${stamp}.json`, "application/json", songsToJson(all))}>
            <Download size={16} /> JSON (full backup)
          </button>
        </div>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-display font-bold">Import changes (dry run first)</h2>
        <p className="text-sm text-soft">
          Upload a CSV or JSON in the export format. You'll see every difference before anything changes. Songs are matched by id, or by title if there's no id. Nothing is ever deleted.
        </p>
        <label className="btn-secondary cursor-pointer w-fit">
          <FileUp size={16} /> Choose file…
          <input
            type="file"
            accept=".csv,.json,text/csv,application/json"
            className="sr-only"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              setReport(null);
              setParseError(null);
              setDiff(null);
              if (!f) return;
              const { rows, error } = parseImport(await f.text(), f.name);
              if (error) return setParseError(error);
              setFile({ name: f.name, rows });
              setDiff(diffImport(rows, all));
            }}
          />
        </label>
        {parseError && <p className="text-sm text-danger" role="alert">{parseError}</p>}
        {report && <p className="text-sm whitespace-pre-line bg-raised rounded-md px-3 py-2" role="status">{report}</p>}
      </Card>

      {diff && file && (
        <Card className="space-y-3">
          <h2 className="font-display font-bold">Dry run: {file.name}</h2>
          <p className="text-sm">
            <strong>{diff.changed.length}</strong> songs would change · <strong>{diff.added.length}</strong> new · <strong>{diff.unchanged}</strong> identical
            {diff.problems.length > 0 && <> · <strong className="text-warning">{diff.problems.length}</strong> rows skipped</>}
          </p>
          {diff.changed.length === 0 && diff.added.length === 0 && (
            <p className="text-positive text-sm font-semibold">Zero differences: this file matches the library exactly.</p>
          )}
          {diff.problems.length > 0 && (
            <ul className="text-sm text-warning list-disc pl-5">{diff.problems.map((p) => <li key={p}>{p}</li>)}</ul>
          )}
          {diff.changed.length > 0 && (
            <div className="space-y-2 max-h-[50vh] overflow-y-auto">
              {diff.changed.map((c) => (
                <div key={c.song.id} className="rounded-md border border-line px-3 py-2">
                  <p className="font-semibold text-sm">{c.song.title}</p>
                  <ul className="text-xs text-soft space-y-0.5 mt-1">
                    {c.changes.map((x) => (
                      <li key={x.field}>
                        <span className="text-faint">{FIELD_LABEL[x.field]}:</span> {formatValue(x.from)} → <strong className="text-ink">{formatValue(x.to)}</strong>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
          {diff.added.length > 0 && (
            <p className="text-sm">
              New songs: {diff.added.map((r) => String(r.values.title)).join(", ")}
            </p>
          )}
          {(diff.changed.length > 0 || diff.added.length > 0) && (
            <div className="flex gap-2">
              <button className="btn-primary" disabled={apply.isPending} onClick={() => apply.mutate(diff)}>
                {apply.isPending ? "Applying…" : `Apply ${diff.changed.length + diff.added.length} changes`}
              </button>
              <button className="btn-ghost" onClick={() => { setDiff(null); setFile(null); }}>
                Cancel
              </button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
