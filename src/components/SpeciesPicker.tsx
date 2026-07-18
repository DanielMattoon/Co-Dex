import { useEffect, useMemo, useRef, useState } from 'react';
import { getSpriteUrl } from '../services/pokeapi';
import { getSpeciesIdIndex, lookupSpeciesId } from '../services/speciesIndex';
import { useClickOutside } from '../hooks/useClickOutside';

interface SpeciesPickerProps {
  value: string;
  onChange: (name: string) => void;
  options: string[];
  placeholder?: string;
  allowEmpty?: boolean;
  instanceId: string;
}

/**
 * A sprite-and-name Pokémon picker replacing native <select> wherever a
 * dropdown lists species — <option> elements can't render an <img>, so a
 * native select is sprite-less no matter what. Closes on any outside click.
 */
export function SpeciesPicker({ value, onChange, options, placeholder = 'Choose a species…', allowEmpty = true, instanceId }: SpeciesPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [idIndex, setIdIndex] = useState<Map<string, number>>(new Map());
  const inputRef = useRef<HTMLInputElement>(null);
  const attr = `data-species-picker-${instanceId}`;

  useEffect(() => {
    getSpeciesIdIndex().then(setIdIndex);
  }, []);

  useClickOutside(open, attr, () => setOpen(false));

  useEffect(() => {
    if (open) {
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? options.filter((o) => o.toLowerCase().includes(q)) : options;
    return list.slice(0, 100);
  }, [options, query]);

  const valueId = value ? lookupSpeciesId(idIndex, value) : undefined;

  return (
    <div className="relative" {...{ [attr]: true }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-left text-slate-200 outline-none hover:border-slate-500 focus:border-cyan-400"
      >
        {valueId !== undefined && <img src={getSpriteUrl(valueId)} alt="" className="h-5 w-5 shrink-0" style={{ imageRendering: 'pixelated' }} />}
        <span className={value ? '' : 'text-slate-500'}>{value || placeholder}</span>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-64 rounded-lg border border-slate-700 bg-slate-900/98 shadow-2xl">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            className="w-full border-b border-slate-700 bg-transparent px-2 py-1.5 text-slate-200 outline-none"
          />
          <div className="max-h-64 overflow-y-auto">
            {allowEmpty && (
              <button
                type="button"
                onClick={() => {
                  onChange('');
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 px-2 py-1 text-left text-slate-500 hover:bg-slate-800/60"
              >
                (none)
              </button>
            )}
            {filtered.map((name) => {
              const id = lookupSpeciesId(idIndex, name);
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => {
                    onChange(name);
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-2 py-1 text-left text-slate-200 hover:bg-slate-800/60"
                >
                  {id !== undefined ? (
                    <img src={getSpriteUrl(id)} alt="" className="h-5 w-5 shrink-0" style={{ imageRendering: 'pixelated' }} />
                  ) : (
                    <span className="h-5 w-5 shrink-0" />
                  )}
                  <span className="truncate">{name}</span>
                </button>
              );
            })}
            {filtered.length === 0 && <p className="p-2 text-slate-600">No matches.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
