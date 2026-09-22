import { useSyncExternalStore } from 'react';
import type { AvatarChoice } from '../../shared/avatar';
import { loadAvatarChoice, saveAvatarChoice } from '../api';

/** Uploaded images are cropped to a square this many pixels wide. */
const AVATAR_SIZE = 128;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

let current: AvatarChoice | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Loaded once at startup. Inside VS Code this is a request to the extension, so the default shows for a moment.
void loadAvatarChoice().then(
  (choice) => {
    current = choice;
    notify();
  },
  () => undefined,
);

/** Picks an avatar, or null to go back to the Jira photo (or the default generated one without a photo). */
export async function setAvatarChoice(choice: AvatarChoice | null) {
  const previous = current;
  current = choice;
  notify();
  try {
    await saveAvatarChoice(choice);
  } catch (err) {
    current = previous;
    notify();
    throw err;
  }
}

/** The avatar this hero picked on this computer, or null for the default. */
export function useAvatarChoice(heroId: string): AvatarChoice | null {
  const choice = useSyncExternalStore(subscribe, () => current);
  return choice?.heroId === heroId ? choice : null;
}

/** The generated variant a choice uses; 0 (the hero's default look) for none or an uploaded image. */
export const variantOf = (choice: AvatarChoice | null) => (choice && 'variant' in choice ? choice.variant : 0);

/** The sprite seed for a variant. Variant 0 is the hero's default look, seeded by their id alone. */
export const avatarSeed = (heroId: string, variant: number) => (variant === 0 ? heroId : `${heroId}#${variant}`);

/** Crops an uploaded picture to its centre square and shrinks it to a small WebP (PNG where WebP isn't supported). */
export async function imageToAvatar(file: File): Promise<string> {
  if (!/^image\/(png|jpeg|webp|gif|avif|bmp)$/.test(file.type)) throw new Error('Choose a PNG, JPG, WebP or GIF image.');
  if (file.size > MAX_UPLOAD_BYTES) throw new Error('That image is over 10 MB. Choose a smaller one.');
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("That image couldn't be read. Try a different file.");
  }
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const context = canvas.getContext('2d');
  if (!context) throw new Error("Your browser couldn't resize the image.");
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
  bitmap.close();
  const webp = canvas.toDataURL('image/webp', 0.85);
  return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/png');
}
