// Lucide icons (DEP-11, ISC), inlined at build — only the used ones (ADR-0011).
import braces from 'lucide-static/icons/braces.svg?raw';
import circleAlert from 'lucide-static/icons/circle-alert.svg?raw';
import download from 'lucide-static/icons/download.svg?raw';
import folderOpen from 'lucide-static/icons/folder-open.svg?raw';
import trash from 'lucide-static/icons/trash-2.svg?raw';
import x from 'lucide-static/icons/x.svg?raw';

const strip = (svg: string) => svg.replace(/<!--[\s\S]*?-->/g, '').trim();

const ICONS = {
  braces: strip(braces),
  alert: strip(circleAlert),
  download: strip(download),
  open: strip(folderOpen),
  trash: strip(trash),
  close: strip(x),
} as const;

export type IconName = keyof typeof ICONS;

/** A decorative icon (always `aria-hidden`; the control carries the accessible name). */
export function Icon({ name, class: cls }: { name: IconName; class?: string }) {
  return (
    <span
      class={cls ? `tk-icon ${cls}` : 'tk-icon'}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: ICONS[name] }}
    />
  );
}
