import { useRef, useState } from 'react';
import { parseCsv } from '../services/csv';
import {
  buildPreview,
  commitImport,
  TARGET_FIELDS,
  type ColumnMapping,
  type ImportPreviewRow,
  type TargetField,
} from '../services/smartImport';
import { useActiveGameInstance } from '../hooks/useActiveGameInstance';

/**
 * Smart-Map Importer (PRD 15.1) — upload any third-party spreadsheet CSV
 * export and map its columns onto Co-Dex's schema, instead of years of
 * manual re-entry. XLSX isn't parsed here (no bundled parser, per the
 * $0/zero-asset rule against pulling in a heavy dependency) — most
 * trackers export CSV directly, and Sheets/Excel both do "Save As CSV"
 * for the rest.
 */
export function SmartMapImporter() {
  const { gameInstanceId } = useActiveGameInstance();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [preview, setPreview] = useState<ImportPreviewRow[] | null>(null);
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);

  async function handleFile(file: File) {
    const text = await file.text();
    const parsed = parseCsv(text);
    setHeaders(parsed.headers);
    setRows(parsed.rows);
    setMapping({});
    setPreview(null);
    setResult(null);
  }

  function setFieldMapping(field: TargetField, columnIndex: number | null) {
    setMapping((prev) => {
      const next = { ...prev };
      if (columnIndex === null) delete next[field];
      else next[field] = columnIndex;
      return next;
    });
    setPreview(null);
  }

  async function handlePreview() {
    setPreview(await buildPreview(rows, mapping));
  }

  async function handleImport() {
    if (!gameInstanceId || !preview) return;
    setResult(await commitImport(gameInstanceId, preview));
  }

  const includedCount = preview?.filter((r) => r.included && r.pokemonId !== null).length ?? 0;

  return (
    <div className="flex flex-col gap-2 text-xs">
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="self-start rounded-md border border-cyan-500/50 bg-cyan-500/20 px-3 py-1.5 text-cyan-300 hover:bg-cyan-500/30"
      >
        Upload spreadsheet (CSV)
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = '';
        }}
      />

      {headers.length > 0 && (
        <>
          <p className="text-slate-500">{rows.length} row(s) detected. Map each column below (unmapped fields are left blank):</p>
          <div className="grid grid-cols-2 gap-2">
            {TARGET_FIELDS.map((field) => (
              <label key={field.id} className="flex flex-col gap-0.5">
                <span className="text-slate-400">{field.label}</span>
                <select
                  value={mapping[field.id] ?? ''}
                  onChange={(e) => setFieldMapping(field.id, e.target.value === '' ? null : Number(e.target.value))}
                  className="rounded border border-slate-700 bg-slate-900 px-1.5 py-1 text-slate-200"
                >
                  <option value="">(none)</option>
                  {headers.map((h, i) => (
                    <option key={i} value={i}>
                      {h}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          <button
            type="button"
            onClick={() => void handlePreview()}
            disabled={mapping.species === undefined && mapping.dexNo === undefined}
            className="self-start rounded-md border border-emerald-500/50 bg-emerald-500/20 px-3 py-1.5 text-emerald-300 disabled:opacity-40"
          >
            Preview import
          </button>

          {preview && (
            <div className="rounded-lg border border-slate-700 bg-slate-800/40 p-2">
              <p className="mb-1 text-slate-300">
                {includedCount} of {preview.length} row(s) will import ({preview.length - includedCount} skipped — unresolved species or filtered out).
              </p>
              <ul className="max-h-32 overflow-y-auto text-slate-400">
                {preview.slice(0, 20).map((r, i) => (
                  <li key={i} className={r.included && r.pokemonId !== null ? 'text-slate-200' : 'text-slate-600 line-through'}>
                    {r.species ?? '(unresolved)'} {r.shiny ? '★' : ''} Lv.{r.level} {r.nickname && `"${r.nickname}"`}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => void handleImport()}
                disabled={!gameInstanceId || includedCount === 0}
                className="mt-2 rounded-md border border-amber-500/50 bg-amber-500/20 px-3 py-1.5 text-amber-300 disabled:opacity-40"
              >
                Import {includedCount} specimen(s)
              </button>
            </div>
          )}

          {result && (
            <p className="text-emerald-300">
              Imported {result.imported} specimen(s){result.skipped > 0 ? `, skipped ${result.skipped}` : ''}. Check the Box view.
            </p>
          )}
        </>
      )}
    </div>
  );
}
