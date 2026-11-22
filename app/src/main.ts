import { applyTokens } from './styles/tokens.ts';
import './styles/base.css';
import { localKV, requestPersistence } from './store/kv.ts';
import { nativeBackup, isApp } from './platform/native.ts';
import { bootApp } from './ui/boot.ts';
import { blockZoom } from './ui/noZoom.ts';

applyTokens(document.documentElement);
blockZoom(document, window); // owner 2026-11-22: kids zoomed in by accident
const root = document.getElementById('app');
if (root) {
  requestPersistence();
  const { router } = bootApp({ root, kv: localKV(), native: nativeBackup(), now: Date.now() });
  (window as unknown as { alfiBack: () => 'handled' | 'exit' }).alfiBack = () => router.back();
  if (!isApp()) {
    document.addEventListener('keydown', e => { if (e.key === 'Escape') router.back(); });
  }
}
