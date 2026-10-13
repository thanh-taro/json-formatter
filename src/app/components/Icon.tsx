// Lucide icons (DEP-11, ISC), only the used SVGs, inlined at build (ADR-0011). Decorative:
// every icon sits next to text or inside a control that carries the accessible name.
import shieldCheck from 'lucide-static/icons/shield-check.svg?raw';
import x from 'lucide-static/icons/x.svg?raw';

const ICONS = { 'shield-check': shieldCheck, x } as const;

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
