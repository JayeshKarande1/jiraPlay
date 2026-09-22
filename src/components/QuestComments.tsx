import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { COMMENT_MAX_LENGTH } from '../../shared/limits';
import { api } from '../api';
import type { CommentPage, QuestComment } from '../../shared/types';
import { HeroSprite } from './HeroSprite';
import { sfx } from '../lib/sound';
import { SkeletonRows } from './BoardSkeleton';

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

function timeAgo(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** An issue's latest comments, with a box to add one. */
export function QuestComments({ questKey, accent }: { questKey: string; accent: string }) {
  const [page, setPage] = useState<CommentPage | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const listRef = useRef<HTMLOListElement>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setPage(await api.comments(questKey));
    } catch (err) {
      setLoadError(errorText(err));
    }
  }, [questKey]);

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- Jira is the external system this effect syncs with.
    void load();
  }, [load]);

  // Newest comments are at the bottom, next to the box.
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [page]);

  async function post(e?: FormEvent) {
    e?.preventDefault();
    const body = draft.trim();
    if (!body || posting) return;
    setPosting(true);
    setPostError(null);
    try {
      const comment = await api.addComment(questKey, body);
      setPage((p) => ({ comments: [...(p?.comments ?? []), comment], total: (p?.total ?? 0) + 1 }));
      setDraft('');
      sfx.select();
    } catch (err) {
      setPostError(errorText(err));
      sfx.error();
    } finally {
      setPosting(false);
    }
  }

  return (
    <section className="mt-5" aria-labelledby={`comments-${questKey}`}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 id={`comments-${questKey}`} className="font-pixel text-pixel-xs text-slate-400">
          COMMENTS{page ? ` · ${page.total}` : ''}
        </h3>
        {page && page.total > page.comments.length && <span className="text-xs text-slate-400">Latest {page.comments.length}</span>}
      </div>

      {loadError ? (
        <p className="mt-2 text-sm text-rose-300">
          Couldn't load comments: {loadError}{' '}
          <button type="button" onClick={() => void load()} className="underline hover:text-rose-200">
            Try again
          </button>
        </p>
      ) : !page ? (
        <SkeletonRows count={2} label="Loading comments…" />
      ) : page.comments.length === 0 ? (
        <p className="mt-2 text-sm text-slate-400">No comments yet.</p>
      ) : (
        <ol ref={listRef} className="mt-2 max-h-64 space-y-3 overflow-y-auto pr-1">
          {page.comments.map((comment) => (
            <CommentRow key={comment.id} comment={comment} />
          ))}
        </ol>
      )}

      <form onSubmit={post} className="mt-3">
        <textarea
          value={draft}
          disabled={posting}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void post();
            }
          }}
          rows={2}
          maxLength={COMMENT_MAX_LENGTH}
          placeholder="Add a comment…"
          aria-label="Add a comment"
          className="w-full resize-y rounded-lg border-2 border-slate-700 bg-slate-900 px-3 py-2 text-sm placeholder:text-slate-500 focus:border-slate-500 disabled:opacity-60"
        />
        {postError && (
          <p role="alert" className="mt-1 text-xs text-rose-300">
            {postError}
          </p>
        )}
        <div className="mt-2 flex items-center justify-between gap-3">
          <span className="text-meta text-slate-400">⌘/Ctrl + Enter to post</span>
          <button
            type="submit"
            disabled={posting || !draft.trim()}
            className="rounded-lg px-3 py-1.5 font-pixel text-pixel-sm text-slate-950 transition-transform enabled:hover:scale-105 disabled:opacity-40"
            style={{ background: accent }}
          >
            {posting ? 'POSTING…' : 'POST'}
          </button>
        </div>
      </form>
    </section>
  );
}

function CommentRow({ comment }: { comment: QuestComment }) {
  const [photoFailed, setPhotoFailed] = useState(false);
  return (
    <li className="flex gap-2.5">
      {comment.authorAvatarUrl && !photoFailed ? (
        <img src={comment.authorAvatarUrl} alt="" className="size-7 shrink-0 rounded-full" onError={() => setPhotoFailed(true)} />
      ) : (
        // No photo, or it didn't load: a generated avatar, the same one every time for this author.
        <span className="grid size-7 shrink-0 place-items-center overflow-hidden rounded-full bg-slate-800" aria-hidden>
          <HeroSprite id={comment.authorName} color="#64748b" portrait className="size-full" />
        </span>
      )}
      <div className="min-w-0 flex-1 rounded-lg bg-slate-900 px-3 py-2">
        <p className="flex flex-wrap items-baseline gap-x-2 text-xs">
          <span className="font-medium text-slate-200">{comment.authorName}</span>
          <time dateTime={comment.created} title={new Date(comment.created).toLocaleString()} className="text-slate-400">
            {timeAgo(comment.created)}
          </time>
        </p>
        <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-300">
          {comment.body || <span className="italic text-slate-400">No text (it may only contain an attachment)</span>}
        </p>
      </div>
    </li>
  );
}
