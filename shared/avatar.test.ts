import { describe, expect, it } from 'vitest';
import { AVATAR_IMAGE_MAX_CHARS, parseAvatarChoice } from './avatar';

describe('parseAvatarChoice', () => {
  it('accepts a generated variant or a small PNG, JPEG or WebP image', () => {
    expect(parseAvatarChoice({ heroId: 'me', variant: 3 })).toEqual({ heroId: 'me', variant: 3 });
    expect(parseAvatarChoice({ heroId: 'me', image: 'data:image/webp;base64,UklGRg==' })).toEqual({ heroId: 'me', image: 'data:image/webp;base64,UklGRg==' });
  });

  it('refuses anything else', () => {
    expect(parseAvatarChoice(null)).toBeNull();
    expect(parseAvatarChoice({ variant: 1 })).toBeNull();
    expect(parseAvatarChoice({ heroId: 'me', variant: 99 })).toBeNull();
    expect(parseAvatarChoice({ heroId: 'me', variant: 1.5 })).toBeNull();
    expect(parseAvatarChoice({ heroId: 'me', image: 'data:image/svg+xml;base64,PHN2Zz4=' })).toBeNull();
    expect(parseAvatarChoice({ heroId: 'me', image: 'https://evil.example/a.png' })).toBeNull();
    expect(parseAvatarChoice({ heroId: 'me', image: `data:image/png;base64,${'A'.repeat(AVATAR_IMAGE_MAX_CHARS)}` })).toBeNull();
  });
});
