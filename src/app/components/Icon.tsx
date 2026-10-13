// Lucide icons (DEP-11, ISC), only the used SVGs, inlined at build (ADR-0011). Decorative:
// every icon sits next to text or inside a control that carries the accessible name.
import braces from 'lucide-static/icons/braces.svg?raw';
import caseSensitive from 'lucide-static/icons/case-sensitive.svg?raw';
import check from 'lucide-static/icons/check.svg?raw';
import chevronDown from 'lucide-static/icons/chevron-down.svg?raw';
import chevronUp from 'lucide-static/icons/chevron-up.svg?raw';
import circleAlert from 'lucide-static/icons/circle-alert.svg?raw';
import copy from 'lucide-static/icons/copy.svg?raw';
import download from 'lucide-static/icons/download.svg?raw';
import folderOpen from 'lucide-static/icons/folder-open.svg?raw';
import search from 'lucide-static/icons/search.svg?raw';
import shieldCheck from 'lucide-static/icons/shield-check.svg?raw';
import trash from 'lucide-static/icons/trash-2.svg?raw';
import x from 'lucide-static/icons/x.svg?raw';

const strip = (svg: string) => svg.replace(/<!--[\s\S]*?-->/g, '').trim();

const ICONS = {
  braces: strip(braces),
  'case-sensitive': strip(caseSensitive),
  check: strip(check),
  'chevron-down': strip(chevronDown),
  'chevron-up': strip(chevronUp),
  alert: strip(circleAlert),
  copy: strip(copy),
  download: strip(download),
  open: strip(folderOpen),
  search: strip(search),
  'shield-check': strip(shieldCheck),
  trash: strip(trash),
  x: strip(x),
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, class: className }: { name: IconName; class?: string }) {
  return (
    <span
      class={className ? `tk-icon ${className}` : 'tk-icon'}
      aria-hidden="true"
      // Build-time constant from the package, never user content.
      dangerouslySetInnerHTML={{ __html: ICONS[name] }}
    />
  );
}
