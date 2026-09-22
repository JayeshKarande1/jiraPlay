import { useRef, useState } from 'react';
import { AVATAR_VARIANTS } from '../../shared/avatar';
import type { Member } from '../../shared/heroes';
import { avatarSeed, imageToAvatar, setAvatarChoice, useAvatarChoice } from '../lib/avatarChoice';
import { HeroSprite } from './HeroSprite';

type Option = 'photo' | 'upload' | number;

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Lets you pick your avatar: your Jira photo, a picture of your own, or one of several generated pixel characters. */
export function AvatarPicker({ member }: { member: Member }) {
  const { hero, cls } = member;
  const choice = useAvatarChoice(hero.id);
  const [photoFailed, setPhotoFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const hasPhoto = Boolean(hero.avatarUrl) && !photoFailed;
  const uploaded = choice && 'image' in choice ? choice.image : null;
  const selected: Option = uploaded ? 'upload' : choice && 'variant' in choice ? choice.variant : hasPhoto ? 'photo' : 0;
  const options: Option[] = [...(hero.avatarUrl ? (['photo'] as const) : []), 'upload', ...Array.from({ length: AVATAR_VARIANTS }, (_, i) => i)];

  function choose(next: Parameters<typeof setAvatarChoice>[0]) {
    setError(null);
    setAvatarChoice(next).catch((err: unknown) => setError(errorText(err)));
  }

  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await setAvatarChoice({ heroId: hero.id, image: await imageToAvatar(file) });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const tile = (active: boolean) =>
    `grid size-11 place-items-center overflow-hidden rounded-lg border-2 transition-transform enabled:hover:scale-105 disabled:opacity-60 ${active ? '' : 'border-slate-700'}`;
  const tileStyle = (active: boolean) => ({
    borderColor: active ? cls.color : undefined,
    background: `color-mix(in srgb, ${cls.color} 13%, transparent)`,
  });

  return (
    <fieldset className="mt-4">
      <legend className="font-pixel text-pixel-xs text-slate-400">CHOOSE YOUR AVATAR</legend>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => void upload(e.target.files?.[0])}
      />
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((option) => {
          const active = option === selected;
          if (option === 'upload') {
            return (
              <button
                key="upload"
                type="button"
                disabled={busy}
                aria-pressed={active}
                aria-label={uploaded ? 'Your uploaded picture. Choose another picture' : 'Upload a picture'}
                title={uploaded ? 'Your picture (click to upload another)' : 'Upload a picture'}
                onClick={() => fileRef.current?.click()}
                className={tile(active)}
                style={tileStyle(active)}
              >
                {uploaded ? (
                  <img src={uploaded} alt="" className="size-full object-cover" />
                ) : (
                  <span aria-hidden className="text-lg text-slate-300">
                    {busy ? '…' : '⬆'}
                  </span>
                )}
              </button>
            );
          }
          return (
            <button
              key={option}
              type="button"
              disabled={busy}
              aria-pressed={active}
              aria-label={option === 'photo' ? 'Your Jira profile photo' : `Generated avatar ${option + 1}`}
              onClick={() => choose(option === 'photo' ? null : { heroId: hero.id, variant: option })}
              className={tile(active)}
              style={tileStyle(active)}
            >
              {option === 'photo' && hasPhoto ? (
                <img src={hero.avatarUrl ?? ''} alt="" className="size-full object-cover" onError={() => setPhotoFailed(true)} />
              ) : (
                <HeroSprite id={avatarSeed(hero.id, option === 'photo' ? 0 : option)} color={cls.color} portrait className="size-full" />
              )}
            </button>
          );
        })}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs text-rose-300">
          {error}
        </p>
      )}
      <p className="mt-2 text-xs text-slate-400">
        {uploaded
          ? 'Your picture is cropped to a square and saved on this computer only. Pick another tile to stop using it.'
          : hero.avatarUrl && !photoFailed
            ? 'Upload a picture or pick a character. Saved on this computer only; Jira keeps your profile photo.'
            : "Jira didn't send a photo that loads here, so you get a generated one. Upload a picture or pick a character."}
      </p>
    </fieldset>
  );
}
