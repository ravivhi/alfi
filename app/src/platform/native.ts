export interface NativeBackup {
  read(): string | null;
  write(raw: string): boolean;
}

interface AlfiNativeApi {
  readBackup?: () => string | null;
  writeBackup?: (raw: string) => boolean;
  exportFile?: (name: string, text: string) => boolean | void;
  exitApp?: () => void;
  appVersion?: () => string;
}

function bridge(): AlfiNativeApi | null {
  try {
    const n = (window as unknown as { AlfiNative?: AlfiNativeApi }).AlfiNative;
    return n ?? null;
  } catch {
    return null;
  }
}

export function isApp(): boolean {
  return bridge() !== null;
}

export function nativeBackup(): NativeBackup | null {
  const n = bridge();
  if (!n || !n.readBackup || !n.writeBackup) return null;
  return {
    read: () => {
      try {
        const r = n.readBackup!();
        return typeof r === 'string' && r !== '' ? r : null;
      } catch {
        return null;
      }
    },
    write: (raw) => {
      try {
        return n.writeBackup!(raw) !== false;
      } catch {
        return false;
      }
    },
  };
}

declare const __APP_VERSION__: string;

/** The build shown on screen: the APK's versionName through the bridge, else the version stamped at build time. */
export function buildVersion(): string {
  try {
    const v = bridge()?.appVersion?.();
    if (typeof v === 'string' && v.trim() !== '') return v.trim();
  } catch {
    /* use the build value */
  }
  return typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
}

export function exitApp(): void {
  const n = bridge();
  try {
    if (n?.exitApp) n.exitApp();
    else window.close();
  } catch {
    /* ignore */
  }
}

/** How an export started: true (the browser download began), false (it failed), or 'choosing' (the APK opened its
 *  save window; onDone reports later whether the file was written). */
export type ExportStart = boolean | 'choosing';

// APK: the native bridge opens a save window and calls window.__alfiExportDone(ok) once the file is written (true) or
// the write failed / the window was closed (false). Browser: a Blob download link.
export function exportFile(name: string, text: string, onDone?: (ok: boolean) => void): ExportStart {
  const n = bridge();
  try {
    if (n?.exportFile) {
      const w = window as unknown as { __alfiExportDone?: (ok: unknown) => void };
      w.__alfiExportDone = (ok) => { w.__alfiExportDone = undefined; onDone?.(ok === true); };
      if (n.exportFile(name, text) === false) { w.__alfiExportDone = undefined; return false; }
      return 'choosing';
    }
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch {
    return false;
  }
}
