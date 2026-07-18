import { useEffect } from 'react';

/** Closes any open dropdown/panel when the user clicks anywhere outside its marked container. */
export function useClickOutside(active: boolean, attr: string, onOutside: () => void): void {
  useEffect(() => {
    if (!active) return;
    function onMouseDown(e: MouseEvent) {
      if (!(e.target as HTMLElement).closest(`[${attr}]`)) onOutside();
    }
    window.addEventListener('mousedown', onMouseDown);
    return () => window.removeEventListener('mousedown', onMouseDown);
  }, [active, attr, onOutside]);
}
