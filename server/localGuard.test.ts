import { describe, expect, it } from 'vitest';
import { refuseNonLocal } from './localGuard';

describe('refuseNonLocal', () => {
  it('allows the local app, with or without an Origin', () => {
    expect(refuseNonLocal('localhost', 'http://localhost:5173', 'same-origin')).toBeNull();
    expect(refuseNonLocal('127.0.0.1', undefined, undefined)).toBeNull();
    expect(refuseNonLocal('[::1]', 'http://[::1]:5173', 'same-origin')).toBeNull();
  });

  it('refuses a rebound DNS name pointing at this computer', () => {
    expect(refuseNonLocal('evil.example', undefined, undefined)).toMatch(/this computer/);
  });

  it('refuses pages from other sites', () => {
    expect(refuseNonLocal('127.0.0.1', 'https://evil.example', 'cross-site')).toMatch(/other websites/);
    expect(refuseNonLocal('127.0.0.1', 'null', undefined)).toMatch(/other websites/);
    expect(refuseNonLocal('127.0.0.1', undefined, 'cross-site')).toMatch(/other websites/);
  });
});
