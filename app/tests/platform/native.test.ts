// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { buildVersion } from '../../src/platform/native.ts';
import pkg from '../../package.json';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// the Android wrapper's build file, next to app/ (outside the test server's root, so read from disk)
const REPO_DIR = fileURLToPath(import.meta.url).replace(/[\\/]app[\\/]tests[\\/]platform[\\/][^\\/]+$/, '');
const gradle = readFileSync(`${REPO_DIR}/android-local/app/build.gradle`, 'utf8');

const setBridge = (b: unknown) => { (window as unknown as { AlfiNative?: unknown }).AlfiNative = b; };

afterEach(() => { delete (window as unknown as { AlfiNative?: unknown }).AlfiNative; });

describe('buildVersion', () => {
  it('is the bridge value when the app provides one', () => {
    setBridge({ appVersion: () => '0.8-preview' });
    expect(buildVersion()).toBe('0.8-preview');
  });
  it('is the build value (package version) without a bridge', () => {
    expect(buildVersion()).toBe(pkg.version);
  });
  it('falls back to the build value when the bridge has no version, an empty one, or throws', () => {
    setBridge({});
    expect(buildVersion()).toBe(pkg.version);
    setBridge({ appVersion: () => '' });
    expect(buildVersion()).toBe(pkg.version);
    setBridge({ appVersion: () => { throw new Error('gone'); } });
    expect(buildVersion()).toBe(pkg.version);
  });
  it('preview 0.8: the web build is 0.8.0 and the APK is versionName 0.8-preview, versionCode 8', () => {
    expect(pkg.version).toBe('0.8.0');
    expect(gradle).toMatch(/versionName '0\.8-preview'/);
    expect(gradle).toMatch(/versionCode 8\s/);
  });
});
