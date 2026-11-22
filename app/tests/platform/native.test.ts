// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { buildVersion } from '../../src/platform/native.ts';
import pkg from '../../package.json';

const setBridge = (b: unknown) => { (window as unknown as { AlfiNative?: unknown }).AlfiNative = b; };

afterEach(() => { delete (window as unknown as { AlfiNative?: unknown }).AlfiNative; });

describe('buildVersion', () => {
  it('is the bridge value when the app provides one', () => {
    setBridge({ appVersion: () => '0.7-preview' });
    expect(buildVersion()).toBe('0.7-preview');
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
});
