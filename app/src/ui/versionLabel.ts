// The build version as a tiny, low-contrast, untappable label (so a screenshot names the build that ran).
import { h } from '../util/dom.ts';
import { buildVersion } from '../platform/native.ts';

export function versionLabel(style: string): HTMLElement {
  return h('span', { 'data-version': '1', 'aria-hidden': 'true', style: `font:400 11px Rubik,sans-serif;color:#7D8AA6;pointer-events:none;user-select:none;direction:ltr;${style}` }, buildVersion());
}
