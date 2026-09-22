/** How many generated avatars the profile's picker offers. */
export const AVATAR_VARIANTS = 8;
/** Uploaded avatars are resized to 128px in the page; this is far more than one needs, and keeps settings small. */
export const AVATAR_IMAGE_MAX_CHARS = 200_000;

/** The signed-in user's avatar on this computer: a generated variant, or an uploaded image as a data URL. */
export type AvatarChoice = { heroId: string; variant: number } | { heroId: string; image: string };

/** Only base64 PNG, JPEG or WebP data URLs, never SVG (which can carry scripts) or remote URLs. */
const IMAGE_DATA_URL = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

/** Reads a saved or sent avatar choice, or null when it isn't a valid one. */
export function parseAvatarChoice(value: unknown): AvatarChoice | null {
  if (!value || typeof value !== 'object') return null;
  const fields = value as Record<string, unknown>;
  const { heroId, image, variant } = fields;
  if (typeof heroId !== 'string' || !heroId) return null;
  if (typeof image === 'string') return image.length <= AVATAR_IMAGE_MAX_CHARS && IMAGE_DATA_URL.test(image) ? { heroId, image } : null;
  if (typeof variant === 'number' && Number.isInteger(variant) && variant >= 0 && variant < AVATAR_VARIANTS) return { heroId, variant };
  return null;
}
