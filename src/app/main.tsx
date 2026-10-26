// MOD-App entry: mounts SCR-Formatter and starts MOD-Host.
import { render } from 'preact';
import './styles/index.css';
import { startHost } from '../host';
import { startOffline } from '../host/offline';
import { Formatter } from './Formatter';

/** The tool's own typefaces (fonts.css): UI and mono, each with a Latin and a Vietnamese subset. */
const FAMILIES = ['Manrope', 'JetBrains Mono'];
/** Text that needs the Vietnamese subset of a face (its unicode-range). */
const VIETNAMESE_SAMPLE = 'ễộưđ';

/**
 * Implements: F-012.R7 / F-012.AC13, NFR-01 (ADR-0014 §7) — both subsets of both faces are
 * requested during the initial load, in every language, so the offline seed holds them and no
 * font request ever follows the load, depends on what the user types or on a live switch.
 * `document.fonts.load` asks for each family's Vietnamese text; each face is also loaded directly,
 * because WebKit may not have registered the stylesheet's faces yet when this script runs (the
 * sibling tool's v1.3.2 fix), so that is repeated on the next frame and at page load.
 * The returned promise settles once all of these have settled.
 */
function loadFonts(): Promise<unknown> {
  const fonts = (() => {
    try {
      return document.fonts ?? null;
    } catch {
      return null; // Font loading API unavailable: the system fallback faces are used.
    }
  })();
  if (!fonts) return Promise.resolve();
  const loadFaces = (): Promise<unknown> => {
    const loads: Promise<unknown>[] = [];
    try {
      fonts.forEach((face) => {
        if (FAMILIES.includes(face.family.replace(/["']/g, '')) && face.status === 'unloaded') loads.push(face.load());
      });
      for (const family of FAMILIES) loads.push(fonts.load(`400 1em "${family}"`, VIETNAMESE_SAMPLE));
    } catch {
      // ignored: a face that cannot load falls back to the system face
    }
    return Promise.allSettled(loads);
  };
  const first = loadFaces();
  const nextFrame = new Promise<unknown>((resolve) => requestAnimationFrame(() => resolve(loadFaces())));
  const pageLoaded = new Promise<unknown>((resolve) => {
    if (document.readyState === 'complete') resolve(loadFaces());
    else addEventListener('load', () => resolve(loadFaces()), { once: true });
  });
  return Promise.allSettled([first, nextFrame, pageLoaded]);
}

const fontsReady = loadFonts();

const root = document.getElementById('app');
if (root) render(<Formatter />, root);
// Implements: F-008.R1, F-008.R5 — after the first render, so the ready signal follows it.
startHost();
// Implements: F-011.R1 — offline support registers after the first render (ADR-0012); the seed
// list waits for the startup font loads (F-012.AC13).
startOffline({ fontsReady });
