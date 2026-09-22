import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, useAnimate, useReducedMotion } from 'motion/react';
import { ACHIEVEMENT_BY_ID } from '../shared/achievements';
import type { BossHit } from './components/BossFight';
import { LevelUpScreen, type LevelUpCelebration } from './components/LevelUpScreen';
import { Standings } from './components/Standings';
import { api, onOpenQuestRequest, onRefreshRequest, onSetupRequest } from './api';
import type { Board, Hero, Quest, QuestTransition, SetupResult, XpEntry } from '../shared/types';
import { CharacterCard } from './components/CharacterCard';
import { HeroFocus } from './components/HeroFocus';
import { HeroAvatar } from './components/HeroBits';
import { Roster } from './components/Roster';
import { SprintBanner } from './components/SprintBanner';
import { keepEqualValues, keepIdentity, keepSame } from '../shared/identity';
import { useStableCallback } from './lib/useStableCallback';
import type { Burst } from './components/LevelUpBurst';
import { ThemePicker } from './components/ThemePicker';
import { ViewPicker } from './components/ViewPicker';
import { BoardSkeleton } from './components/BoardSkeleton';
import { BoardToolbar, type BoardDensity, type BoardGrouping } from './components/BoardToolbar';
import { CommandPalette, type PaletteCommand, type PalettePage } from './components/CommandPalette';
import { BossOutcome, type BossOutcomeState } from './components/BossOutcome';
import { bossState, lastBlow, sprintOver } from '../shared/boss';
import { MEMBER_SORTS } from '../shared/boardFilter';
import { THEME_LIST } from '../shared/themes';
import { setTheme } from './lib/activeTheme';
import { ColumnBoard } from './components/ColumnBoard';
import { EMPTY_FILTER, filterQuests, isEmptyFilter, sortMembers, type MemberSort, type QuestFilter } from '../shared/boardFilter';
import { Toasts, type Toast } from './components/Toasts';
import { useTheme } from './lib/activeTheme';
import { assignClasses, type Member } from '../shared/heroes';
import { applyEdits, applyEditsTo, pruneCreated, pruneEdits, type PendingCreate, type PendingEdit } from '../shared/overlay';
import { DEFAULT_COLUMNS } from '../shared/stages';
import { doneXp, levelStats, questXp } from '../shared/xp';
import { readPref, writePref } from './lib/host';
import { isMuted, setMuted, sfx } from './lib/sound';

const POLL_MS = 30_000;
/** Jira's search index lags behind writes, so wait a moment before re-reading. */
const REFRESH_AFTER_WRITE_MS = 1500;
/** While a confirmed change isn't on the board yet, check again this often. */
const RECHECK_MS = 3000;
/** After this long, the board from Jira wins over a change it still doesn't show. */
const MAX_INDEX_LAG_MS = 12_000;
/** Marking an issue done can't be taken back in Jira, so it waits this long for an Undo before it's sent. */
const UNDO_MS = 5000;
const FRESH_GLOW_MS = 8000;
/** Set when the user closes the setup guide to look at demo data, so it doesn't reopen on every load. */
const SETUP_DISMISSED_PREF = 'jiraPlay.setupDismissed';
/** Set once the game-to-Jira guide has been shown for a real board. */
const GUIDE_SEEN_PREF = 'jiraPlay.guideSeen';
/** How the board is laid out, kept between visits. */
const DENSITY_PREF = 'jiraPlay.density';
const GROUPING_PREF = 'jiraPlay.grouping';
const SORT_PREF = 'jiraPlay.sort';
/** The boss outcome already shown, per sprint, so victory and defeat screens appear once. */
const BOSS_OUTCOME_PREF = 'jiraPlay.bossOutcome';
/** The boss screen waits for the XP burst and any level-up to land first. */
const BOSS_OUTCOME_DELAY_MS = 1600;

const readChoice = <T extends string>(key: string, options: readonly T[], fallback: T): T => {
  const saved = readPref(key);
  return options.includes(saved as T) ? (saved as T) : fallback;
};

// Dialogs load on first use, so the board itself starts faster.
const ProfilePanel = lazy(() => import('./components/ProfilePanel').then((m) => ({ default: m.ProfilePanel })));
const QuestDetail = lazy(() => import('./components/QuestDetail').then((m) => ({ default: m.QuestDetail })));
const SetupGuide = lazy(() => import('./components/SetupGuide').then((m) => ({ default: m.SetupGuide })));
const SprintRecap = lazy(() => import('./components/SprintRecap').then((m) => ({ default: m.SprintRecap })));
const GameGuide = lazy(() => import('./components/GameGuide').then((m) => ({ default: m.GameGuide })));

const TAVERN: Hero = { id: '__tavern__', name: 'Unassigned', avatarUrl: null };

const assigneeFor = (memberId: string) => (memberId === TAVERN.id ? null : memberId);
const memberFor = (assigneeId: string | null) => assigneeId ?? TAVERN.id;
const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

export default function App() {
  /** The board as the server last sent it. What's shown is this plus `edits` and `created`. */
  const [serverBoard, setServerBoard] = useState<Board | null>(null);
  /** Changes shown ahead of Jira. Dropping one rolls it back. */
  const [edits, setEdits] = useState<PendingEdit[]>([]);
  const [created, setCreated] = useState<PendingCreate[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [setupOpen, setSetupOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [recapOpen, setRecapOpen] = useState(false);
  const [recapHistory, setRecapHistory] = useState<XpEntry[] | null>(null);
  /** Board view state: what's shown, how it's grouped and ordered. None of it reaches Jira. */
  const [filter, setFilter] = useState<QuestFilter>(EMPTY_FILTER);
  const [sort, setSortState] = useState<MemberSort>(() => readChoice(SORT_PREF, MEMBER_SORTS.map((o) => o.id), 'board'));
  const [grouping, setGroupingState] = useState<BoardGrouping>(() => readChoice(GROUPING_PREF, ['party', 'status'], 'party'));
  const [density, setDensityState] = useState<BoardDensity>(() => readChoice(DENSITY_PREF, ['comfortable', 'compact'], 'comfortable'));
  /** The game-to-Jira guide; `justConnected` when it opened because demo data became a real board. */
  const [guide, setGuide] = useState<{ justConnected: boolean } | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [bossOutcome, setBossOutcome] = useState<BossOutcomeState | null>(null);
  /** An issue opened from the profile's Jira-wide list that isn't on the board. */
  const [outsideQuest, setOutsideQuest] = useState<Quest | null>(null);
  /** Bumped after changes so the profile's Jira-wide list reloads. */
  const [profileVersion, setProfileVersion] = useState(0);
  const [selected, setSelected] = useState(0);
  /** Member id whose page is open, or null for the whole party. */
  const [view, setView] = useState<string | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [bursts, setBursts] = useState<Record<string, Burst>>({});
  const [bossHit, setBossHit] = useState<BossHit | undefined>(undefined);
  const [levelUp, setLevelUp] = useState<LevelUpCelebration | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [muted, setMutedState] = useState(isMuted);
  const nextEditId = useRef(1);
  /** Numbers board fetches, so a slow response never replaces a newer one. */
  const fetchSeq = useRef(0);
  const lastFetchAt = useRef(0);
  const knownKeys = useRef<Map<string, Set<string>> | null>(null);
  const setupChecked = useRef(false);

  const board = useMemo<Board | null>(() => {
    if (!serverBoard) return null;
    if (edits.length === 0 && created.length === 0) return serverBoard;
    const onBoard = new Set(serverBoard.quests.map((q) => q.key));
    const extra = created.filter((c) => !onBoard.has(c.quest.key)).map((c) => applyEditsTo(c.quest, edits));
    return { ...serverBoard, quests: [...applyEdits(serverBoard.quests, edits), ...extra] };
  }, [serverBoard, edits, created]);
  const outsideView = useMemo(() => outsideQuest && applyEditsTo(outsideQuest, edits), [outsideQuest, edits]);

  const setSort = useCallback((next: MemberSort) => {
    setSortState(next);
    writePref(SORT_PREF, next);
  }, []);
  const setGrouping = useCallback((next: BoardGrouping) => {
    setGroupingState(next);
    writePref(GROUPING_PREF, next);
  }, []);
  const setDensity = useCallback((next: BoardDensity) => {
    setDensityState(next);
    writePref(DENSITY_PREF, next);
  }, []);

  const nextToastId = useRef(1);
  const notify = useCallback((toast: Omit<Toast, 'id' | 'durationMs'> & { durationMs?: number }) => {
    const id = nextToastId.current++;
    const durationMs = toast.durationMs ?? (toast.tone === 'error' ? 9000 : 6000);
    // At most four at once; the oldest makes room.
    setToasts((list) => [...list.slice(-3), { ...toast, id, durationMs }]);
    return id;
  }, []);
  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  /** Changes waiting out their Undo window, by edit id. `send` sends one right away. */
  const delayed = useRef(new Map<number, { timer: ReturnType<typeof setTimeout>; send: () => void }>());
  /** Undoes the most recent change that can still be undone, for ⌘/Ctrl+Z. */
  const undoLast = useRef<(() => void) | null>(null);

  // Undo windows end early when the board is hidden or closed, so a change is never lost.
  useEffect(() => {
    const flush = () => [...delayed.current.values()].forEach((pending) => pending.send());
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const theme = useTheme();
  const { words } = theme;

  const [shakeScope, animateShake] = useAnimate<HTMLDivElement>();
  const reducedMotion = useReducedMotion();

  /** Class slots heroes have earned from their finished work. */
  const earnedSlots = useMemo(
    () => new Map(Object.values(board?.progress ?? {}).flatMap((p) => (p.classSlot === null ? [] : [[p.heroId, p.classSlot] as const]))),
    [board?.progress],
  );
  const classes = useMemo(
    () => assignClasses(board?.heroes.map((h) => h.id) ?? [], theme.classes, earnedSlots),
    [board?.heroes, theme.classes, earnedSlots],
  );
  const members = useMemo<Member[]>(() => {
    if (!board || !serverBoard) return [];
    return [...board.heroes, TAVERN].map((hero) => {
      const isTavern = hero.id === TAVERN.id;
      const quests = board.quests.filter((q) => memberFor(q.assigneeId) === hero.id);
      const progress = isTavern ? null : (board.progress[hero.id] ?? null);
      // The ledger counts what the server saw; changes shown ahead of Jira are added on top.
      const serverQuests = serverBoard.quests.filter((q) => memberFor(q.assigneeId) === hero.id);
      const xp = (progress?.xp ?? doneXp(serverQuests)) + doneXp(quests) - doneXp(serverQuests);
      return { hero, isTavern, cls: classes.get(hero.id) ?? theme.tavern, quests, xp, progress, earnedClass: earnedSlots.has(hero.id) };
    });
  }, [board, serverBoard, classes, earnedSlots, theme.tavern]);
  const current = Math.min(selected, Math.max(0, members.length - 1));
  const focusedIndex = members.findIndex((m) => m.hero.id === view);
  const focused = focusedIndex >= 0 ? members[focusedIndex] : undefined;

  /** The signed-in user as a party member, even when none of the board's issues are theirs. */
  const myMember = useMemo<Member | null>(() => {
    const me = board?.me;
    if (!me) return null;
    const progress = board?.progress[me.id] ?? null;
    return (
      members.find((m) => m.hero.id === me.id) ?? {
        hero: me,
        cls: theme.classes[progress?.classSlot ?? 0],
        isTavern: false,
        quests: [],
        xp: progress?.xp ?? 0,
        progress,
        earnedClass: progress?.classSlot !== null && progress?.classSlot !== undefined,
      }
    );
  }, [board?.me, board?.progress, members, theme.classes]);

  const heroes = board?.heroes;
  const me = board?.me;
  const nameOf = useCallback(
    (assigneeId: string | null) => (assigneeId === null ? TAVERN.name : (heroes?.find((h) => h.id === assigneeId)?.name ?? (me?.id === assigneeId ? me.name : undefined))),
    [heroes, me],
  );

  /**
   * The end of the boss fight, shown once per sprint: a victory as soon as the last issue lands, a defeat when the
   * sprint's end date passes with HP left. The preference remembers which, so a reload doesn't replay it.
   */
  useEffect(() => {
    if (!board || board.quests.length === 0) return;
    const sprint = board.sprints[0] ?? null;
    const boss = bossState(board.quests, sprint);
    const kind = boss.defeated ? 'victory' : sprintOver(sprint) && boss.maxHp > 0 ? 'defeat' : null;
    if (!kind) return;
    const scope = `${board.source}:${sprint?.id ?? 'board'}`;
    const seen = readPref(BOSS_OUTCOME_PREF) as Record<string, string> | undefined;
    if (seen?.[scope] === kind) return;
    const blow = lastBlow(board.quests);
    const timer = setTimeout(() => {
      writePref(BOSS_OUTCOME_PREF, { ...(seen ?? {}), [scope]: kind });
      setBossOutcome({
        kind,
        sprintName: sprint?.name ?? null,
        finalBlow: blow ? { name: nameOf(blow.assigneeId) ?? 'Someone', xp: blow.xp, key: blow.key } : null,
        hpLeft: boss.hp,
        maxHp: boss.maxHp,
        nonce: Date.now(),
      });
      if (kind === 'victory') sfx.levelUp();
    }, BOSS_OUTCOME_DELAY_MS);
    return () => clearTimeout(timer);
  }, [board, nameOf]);

  const openRecap = useCallback(() => {
    setRecapOpen(true);
    // The history is only worth fetching once someone asks to see it.
    if (!recapHistory) api.history().then(setRecapHistory, () => setRecapHistory([]));
  }, [recapHistory]);

  /** Marks members who picked up active quests since the last poll. */
  const trackFresh = useCallback((next: Board) => {
    const byMember = new Map<string, Set<string>>();
    for (const q of next.quests) {
      if (q.done) continue;
      const id = memberFor(q.assigneeId);
      byMember.set(id, (byMember.get(id) ?? new Set()).add(q.key));
    }
    const prev = knownKeys.current;
    knownKeys.current = byMember;
    if (!prev) return;

    const newly = [...byMember].filter(([id, keys]) => [...keys].some((k) => !prev.get(id)?.has(k))).map(([id]) => id);
    if (newly.length === 0) return;
    setFresh((s) => new Set([...s, ...newly]));
    setTimeout(() => {
      setFresh((s) => new Set([...s].filter((id) => !newly.includes(id))));
    }, FRESH_GLOW_MS);
  }, []);

  const refresh = useCallback(async () => {
    const seq = ++fetchSeq.current;
    const startedAt = Date.now();
    lastFetchAt.current = startedAt;
    try {
      const next = await api.board();
      if (seq !== fetchSeq.current) return;
      const keys = new Set(next.quests.map((q) => q.key));
      setEdits((list) => pruneEdits(list, next.quests, startedAt, MAX_INDEX_LAG_MS));
      setCreated((list) => pruneCreated(list, keys, startedAt, MAX_INDEX_LAG_MS));
      trackFresh(next);
      // Unchanged issues and heroes keep their objects, so memoised cards skip re-rendering.
      setServerBoard((prev) =>
        prev
          ? {
              ...next,
              quests: keepIdentity(prev.quests, next.quests, (q) => q.key),
              heroes: keepIdentity(prev.heroes, next.heroes, (h) => h.id),
              me: keepSame(prev.me, next.me),
              progress: keepEqualValues(prev.progress, next.progress),
            }
          : next,
      );
      setLoadError(null);
    } catch (err) {
      if (seq === fetchSeq.current) setLoadError(errorText(err));
    }
  }, [trackFresh]);

  // Polls only while the board is visible, and catches up as soon as it's shown again.
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- refresh() is the poll; the server is the external system.
    void refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, POLL_MS);
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastFetchAt.current > POLL_MS) void refresh();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refresh]);

  // A confirmed change the board doesn't show yet: check again soon rather than waiting for the next poll.
  const waitingOnIndex = edits.some((e) => e.settledAt !== null) || created.length > 0;
  useEffect(() => {
    if (!waitingOnIndex) return;
    const timer = setTimeout(() => void refresh(), RECHECK_MS);
    return () => clearTimeout(timer);
  }, [waitingOnIndex, serverBoard, refresh]);

  useEffect(() => onRefreshRequest(() => void refresh()), [refresh]);

  useEffect(() => onOpenQuestRequest((key) => setOpenKey(key)), []);

  useEffect(() => onSetupRequest(() => setSetupOpen(true)), []);

  /** Achievements you've already been told about. Filled silently on the first load, so only new ones get a toast. */
  const seenAchievements = useRef<Set<string> | null>(null);
  useEffect(() => {
    const mine = board?.me ? board.progress[board.me.id]?.achievements : undefined;
    if (!mine) return;
    if (!seenAchievements.current) {
      seenAchievements.current = new Set(mine);
      return;
    }
    for (const id of mine) {
      if (seenAchievements.current.has(id)) continue;
      seenAchievements.current.add(id);
      const achievement = ACHIEVEMENT_BY_ID.get(id);
      if (achievement) {
        notify({ tone: 'success', text: `${achievement.icon} Achievement unlocked: ${achievement.name}. ${achievement.description}.` });
        sfx.levelUp();
      }
    }
  }, [board, notify]);

  /** Opens the setup guide on the first load of demo data, unless the user already chose to look around first. */
  useEffect(() => {
    if (!board || setupChecked.current) return;
    setupChecked.current = true;
    // oxlint-disable-next-line react/set-state-in-effect -- a one-shot decision made when the first board arrives.
    if (board.source === 'mock' && !readPref(SETUP_DISMISSED_PREF)) setSetupOpen(true);
  }, [board]);

  /** The guide opens once, the first time a real board shows: after connecting, or on a board set up before this was added. */
  useEffect(() => {
    if (board?.source !== 'jira' || readPref(GUIDE_SEEN_PREF)) return;
    writePref(GUIDE_SEEN_PREF, true);
    // oxlint-disable-next-line react/set-state-in-effect -- a one-shot decision made when the first real board arrives.
    setGuide({ justConnected: true });
  }, [board?.source]);

  const closeSetup = useCallback(() => {
    setSetupOpen(false);
    if (board?.source === 'mock') writePref(SETUP_DISMISSED_PREF, true);
  }, [board?.source]);

  const onConnected = useCallback(
    (result: SetupResult) => {
      setSetupOpen(false);
      setView(null);
      setSelected(0);
      // A different board isn't "new work", so don't make every hero glow.
      knownKeys.current = null;
      notify({
        tone: 'success',
        text: result.matchedIssues
          ? `Connected to Jira as ${result.name}.`
          : `Connected as ${result.name}, but your JQL matches no issues yet, so the board is empty.`,
      });
      void refresh();
    },
    [refresh, notify],
  );

  const openHero = useCallback(
    (id: string | null) => {
      setView(id);
      if (id !== null) {
        const index = members.findIndex((m) => m.hero.id === id);
        if (index >= 0) setSelected(index);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      sfx.select();
    },
    [members],
  );

  /** Heroes to step through one by one; the Tavern only counts when it has quests. */
  const browsable = useMemo(() => members.filter((m) => !m.isTavern || m.quests.length > 0), [members]);
  const browseIndex = focused ? browsable.indexOf(focused) : -1;

  const stepHero = useCallback(
    (step: number) => {
      if (focused && browsable.length > 0) {
        const next = (Math.max(browseIndex, 0) + step + browsable.length) % browsable.length;
        openHero(browsable[next].hero.id);
      } else if (!focused && members.length > 0) {
        setSelected((current + step + members.length) % members.length);
        sfx.select();
      }
    },
    [members, browsable, browseIndex, focused, current, openHero],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (setupOpen) {
        if (e.key === 'Escape') closeSetup();
        return;
      }
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setPaletteOpen((open) => !open);
        return;
      }
      if (paletteOpen || bossOutcome) return;
      if (guide) {
        if (e.key === 'Escape') setGuide(null);
        return;
      }
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (target?.closest('input, textarea')) return;
      if (e.key.toLowerCase() === 'z' && (e.metaKey || e.ctrlKey) && !e.shiftKey && undoLast.current) {
        e.preventDefault();
        undoLast.current();
        return;
      }
      if (e.key === 'Escape') {
        if (openKey) setOpenKey(null);
        else if (profileOpen) setProfileOpen(false);
        else if (view !== null) openHero(null);
        return;
      }
      if (openKey || profileOpen || members.length === 0) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        stepHero(e.key === 'ArrowRight' ? 1 : -1);
      } else if (e.key === 'Enter' && !focused && !target?.closest('button, a')) {
        openHero(members[current].hero.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [members, openKey, view, focused, current, openHero, stepHero, setupOpen, closeSetup, profileOpen, paletteOpen, guide, bossOutcome]);

  /**
   * Shows a change to one issue right away as a pending edit, then sends it. On failure the edit is dropped, which
   * puts the issue back as it was. The issue can be on the board or only in the profile's Jira-wide list.
   * With `undoText`, the change waits UNDO_MS behind a toast with an Undo button before it's sent.
   */
  const runMutation = useCallback(
    (key: string, patch: Partial<Quest>, request: () => Promise<unknown>, undoText?: string) => {
      const id = nextEditId.current++;
      setEdits((list) => [...list, { id, key, patch, settledAt: null }]);

      const send = async () => {
        try {
          await request();
        } catch (err) {
          setEdits((list) => list.filter((e) => e.id !== id));
          notify({ text: errorText(err), tone: 'error' });
          sfx.error();
          void refresh();
          return;
        }
        setEdits((list) => list.map((e) => (e.id === id ? { ...e, settledAt: Date.now() } : e)));
        // The profile's issue isn't re-fetched with the board, so it takes the change for good.
        setOutsideQuest((q) => (q?.key === key ? { ...q, ...patch } : q));
        setTimeout(() => {
          void refresh();
          setProfileVersion((v) => v + 1);
        }, REFRESH_AFTER_WRITE_MS);
      };

      if (!undoText) {
        void send();
        return;
      }

      let toastId = 0;
      /** Ends the Undo window; returns false when it had already ended. */
      const settle = () => {
        const pending = delayed.current.get(id);
        if (!pending) return false;
        clearTimeout(pending.timer);
        delayed.current.delete(id);
        dismiss(toastId);
        if (undoLast.current === undo) undoLast.current = null;
        return true;
      };
      const sendNow = () => {
        if (settle()) void send();
      };
      const undo = () => {
        if (!settle()) return;
        setEdits((list) => list.filter((e) => e.id !== id));
        sfx.select();
      };
      delayed.current.set(id, { timer: setTimeout(sendNow, UNDO_MS), send: sendNow });
      undoLast.current = undo;
      toastId = notify({ text: undoText, tone: 'info', durationMs: UNDO_MS, action: { label: 'Undo', onAction: undo } });
    },
    [refresh, notify, dismiss],
  );

  /** An issue by key: from the board, else the one opened from the profile, else the given fallback. */
  const findQuest = useCallback(
    (key: string, fallback?: Quest) => board?.quests.find((q) => q.key === key) ?? (outsideView?.key === key ? outsideView : fallback),
    [board, outsideView],
  );

  const showBurst = useCallback((memberId: string, burst: Omit<Burst, 'nonce'>) => {
    const nonce = Date.now() + Math.random();
    setBursts((b) => ({ ...b, [memberId]: { ...burst, nonce } }));
    setTimeout(() => {
      setBursts((b) => {
        if (b[memberId]?.nonce !== nonce) return b;
        const { [memberId]: _done, ...rest } = b;
        return rest;
      });
    }, 2200);
  }, []);

  /**
   * For an issue that's about to be done: the XP burst, a hit on the sprint boss, and for a level-up a full-screen
   * celebration that shakes the board.
   */
  const celebrate = useCallback(
    (quest: Quest) => {
      const xp = questXp(quest);
      const member =
        members.find((m) => m.hero.id === memberFor(quest.assigneeId)) ?? (quest.assigneeId === myMember?.hero.id ? myMember : undefined);
      const before = levelStats(member?.xp ?? 0).level;
      const after = levelStats((member?.xp ?? 0) + xp).level;
      const newLevel = quest.assigneeId && member && after > before ? after : null;
      const nonce = Date.now() + Math.random();

      showBurst(memberFor(quest.assigneeId), { xp, levelUp: newLevel });
      if (board?.quests.some((q) => q.key === quest.key)) setBossHit({ nonce, damage: xp, by: member?.hero.name });
      if (!newLevel || !member) {
        sfx.complete();
        return;
      }

      sfx.levelUp();
      setLevelUp({ nonce, name: member.hero.name, level: newLevel, color: member.cls.color });
      setTimeout(() => setLevelUp((current) => (current?.nonce === nonce ? null : current)), 2400);
      const root = shakeScope.current;
      if (root && !reducedMotion) {
        void animateShake(root, { x: [0, -14, 12, -9, 7, -4, 0], y: [0, 6, -5, 4, -2, 0] }, { duration: 0.6 }).then(() => {
          // A leftover transform would pin the sticky roster and fixed dialogs to the board instead of the screen.
          root.style.transform = '';
        });
      }
    },
    [members, myMember, board, showBurst, shakeScope, animateShake, reducedMotion],
  );

  /** `fallback` is the issue itself, for ones from the profile's Jira-wide list that aren't on the board. */
  const completeQuest = useCallback(
    (key: string, fallback?: Quest) => {
      const quest = findQuest(key, fallback);
      if (!quest || quest.done) return;
      celebrate(quest);
      // Jira picks which Done status; until the board reloads, the issue sits in the first done column.
      runMutation(key, { done: true, stage: 'done', status: 'Done', statusId: '' }, () => api.complete(key), `${key} marked done.`);
    },
    [findQuest, celebrate, runMutation],
  );

  const changeStatus = useCallback(
    (key: string, transition: QuestTransition) => {
      const quest = findQuest(key);
      if (!quest) return;
      const done = transition.toStage === 'done';
      if (done && !quest.done) celebrate(quest);
      else sfx.select();
      runMutation(
        key,
        { status: transition.toStatus, statusId: transition.toStatusId, stage: transition.toStage, done },
        () => api.transition(key, transition.id),
        done && !quest.done ? `${key} moved to ${transition.toStatus}.` : undefined,
      );
    },
    [findQuest, celebrate, runMutation],
  );

  const assignQuest = useCallback(
    (key: string, memberId: string) => {
      const assigneeId = assigneeFor(memberId);
      const quest = findQuest(key);
      if (!quest || quest.assigneeId === assigneeId) return;
      sfx.select();
      runMutation(key, { assigneeId }, () => api.assign(key, assigneeId));
    },
    [findQuest, runMutation],
  );

  const openFromProfile = useCallback(
    (quest: Quest) => {
      if (!board?.quests.some((q) => q.key === quest.key)) setOutsideQuest(quest);
      setOpenKey(quest.key);
    },
    [board],
  );

  const createQuest = useCallback(async (memberId: string, summary: string) => {
    try {
      const quest = await api.create(summary, assigneeFor(memberId));
      setCreated((list) => [...list, { quest, settledAt: Date.now() }]);
      sfx.select();
      return true;
    } catch (err) {
      notify({ text: errorText(err), tone: 'error' });
      sfx.error();
      return false;
    }
  }, [notify]);

  // Stable handlers for the memoised cards and rows, which would otherwise re-render whenever the board changes.
  const onOpenHero = useStableCallback(openHero);
  const onOpenQuest = useCallback((quest: Quest) => setOpenKey(quest.key), []);
  const onCompleteQuest = useStableCallback((quest: Quest) => completeQuest(quest.key, quest));
  const onAssignQuest = useStableCallback(assignQuest);
  const onCreateQuest = useStableCallback(createQuest);
  const onOpenFromProfile = useStableCallback(openFromProfile);

  function toggleMute() {
    setMuted(!muted);
    setMutedState(!muted);
  }

  // Suspense goes outside AnimatePresence: with it in between, closed dialogs never finish their exit and stay mounted.
  const setupGuide = (
    <Suspense fallback={null}>
      <AnimatePresence>{setupOpen && <SetupGuide key="setup" onClose={closeSetup} onConnected={onConnected} />}</AnimatePresence>
    </Suspense>
  );

  const toastView = <Toasts toasts={toasts} onDismiss={dismiss} />;

  if (!board && !loadError) {
    // The first load can take several seconds against a real Jira board, so it gets the board's shape, not a word.
    return (
      <>
        <BoardSkeleton />
        {setupGuide}
        {toastView}
      </>
    );
  }

  if (!board) {
    return (
      <div className="bg-arena grid min-h-screen place-items-center p-6 text-center">
        <div>
          <p className="font-pixel text-lg text-rose-400">{words.gameOver}</p>
          <p className="mt-4 max-w-md text-slate-400">{loadError}</p>
          <button type="button" onClick={() => void refresh()} className="mt-6 animate-pulse font-pixel text-xs text-amber-300 hover:text-amber-200">
            {words.retry}
          </button>
          <button
            type="button"
            onClick={() => setSetupOpen(true)}
            className="mx-auto mt-4 block text-sm text-slate-400 underline hover:text-slate-200"
          >
            Check your Jira connection
          </button>
        </div>
        {setupGuide}
        {toastView}
      </div>
    );
  }

  const columns = board.columns.length > 0 ? board.columns : DEFAULT_COLUMNS;
  const openQuest = openKey ? findQuest(openKey) : undefined;
  const openMember =
    openQuest &&
    (members.find((m) => m.hero.id === memberFor(openQuest.assigneeId)) ??
      (openQuest.assigneeId === myMember?.hero.id ? myMember : undefined));
  const partyXp = board.quests.filter((q) => q.done && q.assigneeId).reduce((sum, q) => sum + questXp(q), 0);
  /* The filter is a view: hearts, levels and XP still come from the whole board, only the lists narrow. */
  const visibleQuests = filterQuests(board.quests, filter);
  const sortedMembers = sortMembers(members, sort);
  /* With a filter on, a card with nothing left to show is noise, so it drops out. */
  const shownMembers = isEmptyFilter(filter) ? sortedMembers : sortedMembers.filter((m) => m.quests.some((q) => visibleQuests.includes(q)));
  /* Keyboard selection follows the member, not the index, so sorting doesn't move the highlight. */
  const selectedId = members[current]?.hero.id ?? null;
  /** Everyone an issue can go to: the party, Unassigned, and you even with no issues on the board. */
  const assignable = myMember && !members.includes(myMember) ? [...members, myMember] : members;

  /** The command palette's pages. Built on open only, so the board doesn't pay for it on every render. */
  const palette: PalettePage = paletteOpen ? buildPalette() : { title: '', placeholder: '', commands: [] };

  function buildPalette(): PalettePage {
    const issueEntries = (action: (quest: Quest) => PalettePage | void, only?: (quest: Quest) => boolean): PaletteCommand[] =>
      board!.quests
        .filter((q) => !only || only(q))
        .map((q) => ({
          id: `issue:${q.key}`,
          label: q.summary,
          hint: q.key,
          group: 'Issues',
          icon: theme.kindIcons[q.kind],
          meta: `${nameOf(q.assigneeId) ?? ''} · ${q.status}`,
          run: () => action(q),
        }));
    const pickIssue = (title: string, action: (quest: Quest) => PalettePage | void, only?: (quest: Quest) => boolean): PalettePage => ({
      title,
      placeholder: 'Which issue?',
      commands: issueEntries(action, only),
    });
    const pickMember = (quest: Quest): PalettePage => ({
      title: `Assign ${quest.key}`,
      placeholder: 'To whom?',
      commands: assignable.map((m) => ({
        id: `member:${m.hero.id}`,
        label: m.hero.name,
        hint: m.isTavern ? undefined : m.cls.name,
        group: 'People',
        icon: m.isTavern ? theme.tavern.icon : m.cls.icon,
        run: () => assignQuest(quest.key, m.hero.id),
      })),
    });

    const actions: PaletteCommand[] = [
      { id: 'done', label: 'Mark an issue as done…', group: 'Actions', icon: '✓', run: () => pickIssue('Mark done', (q) => completeQuest(q.key), (q) => !q.done) },
      { id: 'assign', label: 'Assign an issue…', group: 'Actions', icon: '👤', run: () => pickIssue('Assign', pickMember, (q) => !q.done) },
      { id: 'profile', label: 'Your profile', group: 'Actions', icon: '🪪', run: () => setProfileOpen(true) },
      { id: 'recap', label: 'Sprint recap', group: 'Actions', icon: '▤', run: openRecap },
      { id: 'refresh', label: 'Refresh the board', group: 'Actions', icon: '⟳', run: () => void refresh() },
      { id: 'guide', label: 'How to read the board', group: 'Actions', icon: '?', run: () => setGuide({ justConnected: false }) },
      { id: 'setup', label: board!.source === 'jira' ? 'Jira connection' : 'Connect Jira', group: 'Actions', icon: '🗝️', run: () => setSetupOpen(true) },
      { id: 'mute', label: muted ? 'Unmute sounds' : 'Mute sounds', group: 'Actions', icon: muted ? '♪' : '⊘', run: toggleMute },
    ];
    const views: PaletteCommand[] = [
      { id: 'view:party', label: `Whole ${words.party}`, group: 'View', icon: theme.partyIcon, run: () => openHero(null) },
      { id: 'group:party', label: `Group by ${words.hero}`, group: 'View', icon: '▦', meta: grouping === 'party' ? 'current' : undefined, run: () => setGrouping('party') },
      { id: 'group:status', label: 'Group by status', group: 'View', icon: '▥', meta: grouping === 'status' ? 'current' : undefined, run: () => setGrouping('status') },
      { id: 'density', label: density === 'compact' ? 'Comfortable cards' : 'Compact cards', group: 'View', icon: density === 'compact' ? '▢' : '▤', run: () => setDensity(density === 'compact' ? 'comfortable' : 'compact') },
      ...MEMBER_SORTS.map((option) => ({
        id: `sort:${option.id}`,
        label: `Sort ${words.heroes}: ${option.label}`,
        group: 'View',
        icon: '⇅',
        meta: sort === option.id ? 'current' : undefined,
        run: () => setSort(option.id),
      })),
      ...(['all', 'todo', 'doing', 'done', 'overdue'] as const).map((stage) => ({
        id: `stage:${stage}`,
        label: `Show ${stage === 'all' ? 'every issue' : `${stage} issues`}`,
        group: 'View',
        icon: '⊙',
        meta: filter.stage === stage ? 'current' : undefined,
        run: () => setFilter({ ...filter, stage }),
      })),
    ];
    const people: PaletteCommand[] = members.map((m) => ({
      id: `hero:${m.hero.id}`,
      label: m.hero.name,
      hint: m.isTavern ? 'unassigned' : m.cls.name,
      group: words.heroes.charAt(0).toUpperCase() + words.heroes.slice(1),
      icon: m.isTavern ? theme.tavern.icon : m.cls.icon,
      meta: `${m.quests.filter((q) => !q.done).length} open`,
      run: () => openHero(m.hero.id),
    }));
    const themes: PaletteCommand[] = [
      { id: 'theme:system', label: 'Theme: follow the system', group: 'Themes', icon: '🌗', run: () => setTheme('system') },
      ...THEME_LIST.map((t) => ({ id: `theme:${t.id}`, label: `Theme: ${t.name}`, hint: t.tagline, group: 'Themes', icon: t.icon, meta: t.id === theme.id ? 'current' : undefined, run: () => setTheme(t.id) })),
    ];
    return {
      title: 'JiraPlay',
      placeholder: 'Jump to an issue, a teammate or a command…',
      commands: [...actions, ...issueEntries((q) => setOpenKey(q.key)), ...people, ...views, ...themes],
    };
  }

  return (
    <div ref={shakeScope} className="bg-arena min-h-screen lg:flex">
      {/* The roster is a long nav and comes first in the DOM at every width. */}
      <a
        href="#board"
        className="sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:left-4 focus-visible:top-4 focus-visible:z-50 focus-visible:rounded-lg focus-visible:bg-slate-950 focus-visible:px-4 focus-visible:py-2 focus-visible:font-pixel focus-visible:text-pixel-sm focus-visible:text-amber-300"
      >
        Skip to the board
      </a>
      <Roster
        members={members}
        activeId={focused ? focused.hero.id : null}
        highlightedId={focused ? null : (members[current]?.hero.id ?? null)}
        meId={board.me?.id ?? null}
        totalQuests={board.quests.length}
        onView={onOpenHero}
        onDropQuest={onAssignQuest}
      />

      <div className="min-w-0 flex-1">
        {/*
         * The controls stay reachable on a long board, so this is its own sticky row rather than part of the
         * banner: a sticky child of the banner would only stick for the banner's own height.
         */}
        <header className="sticky top-0 z-30 flex flex-wrap items-center justify-end gap-2 border-b border-slate-800 bg-slate-950/80 px-3 py-2 backdrop-blur sm:gap-3 sm:px-6 lg:px-10">
          {board.source === 'jira' ? (
            <button
              type="button"
              onClick={() => setSetupOpen(true)}
              title="Jira connection"
              className="rounded-full border border-emerald-500/60 px-3 py-1 font-pixel text-pixel-sm text-emerald-300 hover:border-emerald-400"
            >
              ● LIVE<span className="hidden sm:inline"> · JIRA</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setSetupOpen(true)}
              className="rounded-full border border-amber-400/70 bg-amber-400/10 px-3 py-1 font-pixel text-pixel-sm text-amber-300 hover:bg-amber-400/20"
            >
              DEMO<span className="hidden sm:inline"> DATA</span> · CONNECT<span className="hidden sm:inline"> JIRA</span> ▶
            </button>
          )}
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            title="Command palette (⌘K / Ctrl+K)"
            aria-label="Command palette"
            className="hidden size-9 place-items-center rounded-lg border border-slate-700 font-mono text-xs text-slate-300 hover:border-slate-500 sm:grid"
          >
            <span aria-hidden>⌘K</span>
          </button>
          <button
            type="button"
            onClick={openRecap}
            title="Sprint recap"
            aria-label="Sprint recap"
            className="grid size-9 place-items-center rounded-lg border border-slate-700 text-slate-300 hover:border-slate-500"
          >
            <span aria-hidden>▤</span>
          </button>
          {board.source === 'jira' && (
            <ViewPicker
              onSwitched={() => {
                setFilter(EMPTY_FILTER);
                void refresh();
              }}
              onError={(message) => notify({ tone: 'error', text: message })}
            />
          )}
          <ThemePicker />
          <button
            type="button"
            onClick={() => void refresh()}
            title="Refresh"
            aria-label="Refresh"
            className="grid size-9 place-items-center rounded-lg border border-slate-700 text-slate-300 hover:border-slate-500"
          >
            ⟳
          </button>
          <button
            type="button"
            onClick={() => setGuide({ justConnected: false })}
            title="How to read the board"
            aria-label="How to read the board"
            className="grid size-9 place-items-center rounded-lg border border-slate-700 text-slate-300 hover:border-slate-500"
          >
            <span aria-hidden>?</span>
          </button>
          <button
            type="button"
            onClick={toggleMute}
            title={muted ? 'Unmute' : 'Mute'}
            aria-label={muted ? 'Unmute' : 'Mute'}
            className="grid size-9 place-items-center rounded-lg border border-slate-700 hover:border-slate-500"
          >
            <span aria-hidden>{muted ? '⊘' : '♪'}</span>
          </button>
          {myMember && (
            <button
              type="button"
              onClick={() => setProfileOpen(true)}
              title={`Your profile · ${myMember.hero.name}`}
              aria-label="Your profile"
              className="ml-1 transition-transform hover:scale-105"
            >
              <HeroAvatar member={myMember} size="sm" />
            </button>
          )}
        </header>

        <div className="px-4 pt-5 sm:px-6 sm:pt-6 lg:px-10">
          <SprintBanner sprints={board.sprints} quests={board.quests} partyXp={partyXp} hit={bossHit} nameOf={nameOf} />
        </div>

        {loadError && (
          <div className="px-6 pt-4 lg:px-10">
            <p className="rounded-lg border border-rose-500/40 bg-rose-950/40 px-4 py-2 text-sm text-rose-200">
              Can't reach the JiraPlay server: {loadError}
            </p>
          </div>
        )}

        {board.truncatedAt !== null && (
          <div className="px-6 pt-4 lg:px-10">
            <p role="status" className="rounded-lg border border-amber-400/40 bg-amber-950/40 px-4 py-2 text-sm text-amber-100">
              Your board query matches more than {board.truncatedAt.toLocaleString()} issues, so only the first{' '}
              {board.truncatedAt.toLocaleString()} are shown. Narrow the JQL to see everything that matters.
            </p>
          </div>
        )}

        <main id="board" className="px-3 pb-16 pt-6 sm:px-4 sm:pt-8 lg:px-10">
          {focused ? (
            <HeroFocus
              member={focused}
              columns={columns}
              boardName={board.boardName}
              index={Math.max(browseIndex, 0)}
              total={browsable.length}
              burst={bursts[focused.hero.id]}
              onStep={stepHero}
              onBack={() => openHero(null)}
              onOpenQuest={onOpenQuest}
              onCompleteQuest={onCompleteQuest}
              onCreateQuest={(summary) => createQuest(focused.hero.id, summary)}
            />
          ) : (
            <>
            <Standings progress={board.progress} members={members} meId={board.me?.id ?? null} />

            <div className="mt-6">
              <BoardToolbar
                filter={filter}
                onFilter={setFilter}
                sort={sort}
                onSort={setSort}
                grouping={grouping}
                onGrouping={setGrouping}
                density={density}
                onDensity={setDensity}
                showing={visibleQuests.length}
                total={board.quests.length}
              />
            </div>

            {grouping === 'status' ? (
              <div className="pt-6">
                <ColumnBoard
                  members={members}
                  quests={visibleQuests}
                  columns={columns}
                  boardName={board.boardName}
                  onOpenQuest={onOpenQuest}
                  onCompleteQuest={onCompleteQuest}
                />
              </div>
            ) : (
              <div className={`flex flex-wrap items-start justify-center pt-6 ${density === 'compact' ? 'gap-x-3 gap-y-8' : 'gap-x-6 gap-y-12'}`}>
                {shownMembers.map((m) => (
                  <CharacterCard
                    key={m.hero.id}
                    member={m}
                    filter={filter}
                    selected={m.hero.id === selectedId}
                    fresh={fresh.has(m.hero.id)}
                    compact={density === 'compact'}
                    burst={bursts[m.hero.id]}
                    onOpenHero={onOpenHero}
                    onOpenQuest={onOpenQuest}
                    onCompleteQuest={onCompleteQuest}
                    onDropQuest={onAssignQuest}
                    onCreateQuest={onCreateQuest}
                  />
                ))}
                {shownMembers.length === 0 && (
                  <p className="py-12 text-center text-sm text-slate-400">No issues match. Try clearing the filter.</p>
                )}
              </div>
            )}
            </>
          )}
        </main>

        <footer className="px-4 pb-8 text-center font-pixel text-pixel-xs uppercase leading-loose text-slate-400 sm:px-6">
          {`⌘K commands · ← → switch ${words.hero} · enter open · esc whole ${words.party} · drag an issue onto a ${words.hero} to reassign`}
        </footer>
      </div>

      <Suspense fallback={null}>
        <AnimatePresence>
          {profileOpen && myMember && (
            <ProfilePanel
              key="profile"
              member={myMember}
              columns={columns}
              version={profileVersion}
              onClose={() => setProfileOpen(false)}
              onOpenQuest={onOpenFromProfile}
              onCompleteQuest={onCompleteQuest}
            />
          )}
        </AnimatePresence>
      </Suspense>

      <Suspense fallback={null}>
      <AnimatePresence>
        {openQuest && (
          <QuestDetail
            key={openQuest.key}
            quest={openQuest}
            members={assignable}
            ownerId={memberFor(openQuest.assigneeId)}
            accent={openMember?.cls.color ?? theme.tavern.color}
            onClose={() => setOpenKey(null)}
            onComplete={() => completeQuest(openQuest.key)}
            onChangeStatus={(transition) => changeStatus(openQuest.key, transition)}
            onAssign={(memberId) => assignQuest(openQuest.key, memberId)}
          />
        )}
      </AnimatePresence>
      </Suspense>

      <Suspense fallback={null}>
        <AnimatePresence>
          {recapOpen && recapHistory && <SprintRecap key="recap" board={board} history={recapHistory} onClose={() => setRecapOpen(false)} />}
        </AnimatePresence>
      </Suspense>

      <Suspense fallback={null}>
        <AnimatePresence>
          {guide && <GameGuide key="guide" justConnected={guide.justConnected} onClose={() => setGuide(null)} />}
        </AnimatePresence>
      </Suspense>

      <AnimatePresence>
        {bossOutcome && (
          <BossOutcome
            key={bossOutcome.nonce}
            outcome={bossOutcome}
            onRecap={() => {
              setBossOutcome(null);
              openRecap();
            }}
            onClose={() => setBossOutcome(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {paletteOpen && <CommandPalette key="palette" root={palette} onClose={() => setPaletteOpen(false)} />}
      </AnimatePresence>

      {setupGuide}
      {toastView}
      <LevelUpScreen celebration={levelUp} />
    </div>
  );
}
