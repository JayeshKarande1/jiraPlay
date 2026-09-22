import type { QuestKind, QuestStage } from './types';
import type { HeroClass } from './heroes';

// Colors, fonts and backgrounds live in index.css under [data-theme]; this file holds everything the components render.

export const THEME_IDS = ['arcade', 'space', 'heist', 'wizard', 'cyber', 'blocky', 'racing', 'daylight'] as const;
export type ThemeId = (typeof THEME_IDS)[number];
export const DEFAULT_THEME: ThemeId = 'arcade';

export const isThemeId = (value: unknown): value is ThemeId => THEME_IDS.includes(value as ThemeId);

/** The oscillator wave for a theme's sound effects; the same values as the Web Audio OscillatorType. */
export type SoundWave = 'sine' | 'square' | 'sawtooth' | 'triangle';

/** How the intro sprite crosses the screen when switching themes. */
export type IntroPath = 'ltr' | 'rtl' | 'hop' | 'diagonal' | 'arc';
export type IntroBackdrop = 'glow' | 'warp' | 'sirens' | 'sparkles' | 'glitch' | 'blocks' | 'chequered';

export interface ThemeIntro {
  sprite: string;
  path: IntroPath;
  /** Left behind along the path, or null for none. */
  trail: string | null;
  backdrop: IntroBackdrop;
  /** Spins the sprite as it travels. */
  spin?: boolean;
}

export interface ThemeWords {
  /** What the team is called, lowercase: "party". Components uppercase it where the design needs. */
  party: string;
  hero: string;
  heroes: string;
  /** Label before a level number: "LVL 3". */
  level: string;
  xp: string;
  levelUp: string;
  loading: string;
  gameOver: string;
  retry: string;
  newIssue: string;
  allDone: string;
}

export interface Theme {
  id: ThemeId;
  name: string;
  icon: string;
  tagline: string;
  /** CSS font-family used for the theme's name in the picker. */
  font: string;
  /** Background, accent and second accent, previewed in the picker. */
  swatch: [string, string, string];
  words: ThemeWords;
  partyIcon: string;
  /** Hero classes, handed out by a hash of each hero's id. */
  classes: HeroClass[];
  /** The Unassigned column. */
  tavern: HeroClass;
  kindIcons: Record<QuestKind, string>;
  stageIcons: Record<QuestStage, string>;
  /** Symbol for one of the hearts lost to overdue issues. */
  heart: string;
  /** Glyphs for game state the board shows outside a card's icons: a run of active days, and a due date. */
  uiIcons: { streak: string; due: string };
  confetti: string[];
  wave: SoundWave;
  /** The 2-second animation shown when switching to this theme. */
  intro: ThemeIntro;
  /** The sprint boss, whose HP is the sprint's open work. */
  boss: { name: string; icon: string };
}

export const THEMES: Record<ThemeId, Theme> = {
  arcade: {
    id: 'arcade',
    name: 'Arcade',
    icon: '🕹️',
    tagline: 'The original pixel party',
    font: '"Press Start 2P", monospace',
    swatch: ['#070b16', '#fbbf24', '#6366f1'],
    words: {
      party: 'party',
      hero: 'hero',
      heroes: 'heroes',
      level: 'LVL',
      xp: 'XP',
      levelUp: 'LEVEL UP!',
      loading: 'LOADING PARTY…',
      gameOver: 'GAME OVER',
      retry: 'CONTINUE?',
      newIssue: 'NEW ISSUE!',
      allDone: 'All issues done! 🏆',
    },
    partyIcon: '🏰',
    classes: [
      { name: 'Mage', icon: '🧙', color: '#a78bfa' },
      { name: 'Guardian', icon: '🛡️', color: '#38bdf8' },
      { name: 'Ranger', icon: '🏹', color: '#4ade80' },
      { name: 'Rogue', icon: '🗡️', color: '#f87171' },
      { name: 'Oracle', icon: '🔮', color: '#f472b6' },
    ],
    tavern: { name: 'No assignee', icon: '📥', color: '#fbbf24' },
    kindIcons: { story: '📜', task: '🛠️', bug: '🐛', epic: '🐉', subtask: '🧩' },
    stageIcons: { todo: '📋', doing: '⚔️', done: '🏆' },
    heart: '♥',
    uiIcons: { streak: '🔥', due: '⏰' },
    confetti: ['#facc15', '#f472b6', '#38bdf8', '#4ade80', '#a78bfa', '#fb923c'],
    wave: 'square',
    intro: { sprite: '👾', path: 'hop', trail: '•', backdrop: 'glow' },
    boss: { name: 'The Backlog Behemoth', icon: '👹' },
  },

  space: {
    id: 'space',
    name: 'Space Fleet',
    icon: '🚀',
    tagline: 'Starships, ranks and warp drives',
    font: '"Orbitron", sans-serif',
    swatch: ['#050816', '#22d3ee', '#8b5cf6'],
    words: {
      party: 'fleet',
      hero: 'pilot',
      heroes: 'pilots',
      level: 'RANK',
      xp: 'XP',
      levelUp: 'PROMOTED!',
      loading: 'WARPING IN…',
      gameOver: 'SIGNAL LOST',
      retry: 'RETRY LAUNCH?',
      newIssue: 'NEW MISSION!',
      allDone: 'All missions complete! 🌟',
    },
    partyIcon: '🛸',
    classes: [
      { name: 'Captain', icon: '🧑‍🚀', color: '#38bdf8' },
      { name: 'Engineer', icon: '🔧', color: '#fb923c' },
      { name: 'Navigator', icon: '🧭', color: '#a78bfa' },
      { name: 'Scientist', icon: '🔭', color: '#4ade80' },
      { name: 'Gunner', icon: '☄️', color: '#f472b6' },
    ],
    tavern: { name: 'Unassigned', icon: '🛰️', color: '#67e8f9' },
    kindIcons: { story: '🛰️', task: '🔩', bug: '👾', epic: '🪐', subtask: '☄️' },
    stageIcons: { todo: '📡', doing: '🚀', done: '🌟' },
    heart: '⬢',
    uiIcons: { streak: '☄️', due: '⏳' },
    confetti: ['#e0f2fe', '#7dd3fc', '#c4b5fd', '#f0abfc', '#fef08a'],
    wave: 'sine',
    intro: { sprite: '🚀', path: 'diagonal', trail: '✦', backdrop: 'warp' },
    boss: { name: 'The Deadline Armada', icon: '👽' },
  },

  heist: {
    id: 'heist',
    name: 'Heist City',
    icon: '🚓',
    tagline: 'Crews, cash and sunset streets',
    font: '"Anton", sans-serif',
    swatch: ['#0a0d0a', '#5fbf3f', '#ff7a3c'],
    words: {
      party: 'crew',
      hero: 'member',
      heroes: 'members',
      level: 'RANK',
      xp: 'REP',
      levelUp: 'RESPECT UP!',
      loading: 'CASING THE JOINT…',
      gameOver: 'BUSTED',
      retry: 'TRY AGAIN?',
      newIssue: 'NEW JOB!',
      allDone: 'All jobs done! 💰',
    },
    partyIcon: '🏙️',
    classes: [
      { name: 'Driver', icon: '🏎️', color: '#fb923c' },
      { name: 'Hacker', icon: '💻', color: '#22d3ee' },
      { name: 'Muscle', icon: '💪', color: '#f87171' },
      { name: 'Pilot', icon: '🚁', color: '#a3e635' },
      { name: 'Mastermind', icon: '🧠', color: '#e879f9' },
    ],
    tavern: { name: 'No crew', icon: '🧳', color: '#8ee06f' },
    kindIcons: { story: '🎬', task: '🔧', bug: '🚨', epic: '💰', subtask: '📦' },
    stageIcons: { todo: '🗺️', doing: '🚗', done: '💵' },
    heart: '♥',
    uiIcons: { streak: '💸', due: '⏱️' },
    confetti: ['#4ade80', '#facc15', '#86efac', '#fde047', '#ffffff'],
    wave: 'sawtooth',
    intro: { sprite: '🚓', path: 'rtl', trail: null, backdrop: 'sirens' },
    boss: { name: 'Inspector Scope Creep', icon: '🕵️' },
  },

  wizard: {
    id: 'wizard',
    name: 'Wizard School',
    icon: '🪄',
    tagline: 'Spells, houses and candlelit halls',
    font: '"Cinzel", serif',
    swatch: ['#0d0b14', '#e3b341', '#7c3aed'],
    words: {
      party: 'house',
      hero: 'wizard',
      heroes: 'wizards',
      level: 'RANK',
      xp: 'POINTS',
      levelUp: 'SPELL MASTERED!',
      loading: 'SUMMONING THE HOUSE…',
      gameOver: 'THE SPELL FIZZLED',
      retry: 'CAST AGAIN?',
      newIssue: 'NEW SCROLL!',
      allDone: 'All spells cast! ✨',
    },
    partyIcon: '🏰',
    classes: [
      { name: 'Charms', icon: '🪄', color: '#fb7185' },
      { name: 'Potions', icon: '🧪', color: '#2dd4bf' },
      { name: 'Divination', icon: '🔮', color: '#a78bfa' },
      { name: 'Beasts', icon: '🐉', color: '#fbbf24' },
      { name: 'Herbology', icon: '🌿', color: '#86efac' },
    ],
    tavern: { name: 'Unsorted', icon: '🎩', color: '#f5cf66' },
    kindIcons: { story: '📖', task: '🧹', bug: '🕷️', epic: '🐉', subtask: '🧪' },
    stageIcons: { todo: '📜', doing: '🪄', done: '🏆' },
    heart: '✦',
    uiIcons: { streak: '✨', due: '⌛' },
    confetti: ['#f5cf66', '#fde9a9', '#fb7185', '#2dd4bf', '#c4b5fd'],
    wave: 'triangle',
    intro: { sprite: '🧹', path: 'arc', trail: '✨', backdrop: 'sparkles' },
    boss: { name: 'The Backlog Basilisk', icon: '🐍' },
  },

  cyber: {
    id: 'cyber',
    name: 'Neon Cyber',
    icon: '🌃',
    tagline: 'Neon, chrome and hacking',
    font: '"Chakra Petch", sans-serif',
    swatch: ['#05060a', '#fcee0a', '#ff2a6d'],
    words: {
      party: 'squad',
      hero: 'runner',
      heroes: 'runners',
      level: 'LV',
      xp: 'CRED',
      levelUp: 'UPGRADE INSTALLED',
      loading: 'JACKING IN…',
      gameOver: 'CONNECTION LOST',
      retry: 'RECONNECT?',
      newIssue: 'NEW GIG!',
      allDone: 'All gigs done! ⚡',
    },
    partyIcon: '🌃',
    classes: [
      { name: 'Hacker', icon: '💾', color: '#22d3ee' },
      { name: 'Samurai', icon: '🗡️', color: '#ff2a6d' },
      { name: 'Engineer', icon: '🦾', color: '#fcee0a' },
      { name: 'Fixer', icon: '🕶️', color: '#e879f9' },
      { name: 'Medic', icon: '💉', color: '#4ade80' },
    ],
    tavern: { name: 'Unclaimed', icon: '📟', color: '#fcee0a' },
    kindIcons: { story: '📀', task: '⚙️', bug: '🦠', epic: '🤖', subtask: '🔌' },
    stageIcons: { todo: '📥', doing: '⚡', done: '🏁' },
    heart: '▮',
    uiIcons: { streak: '⚡', due: '⏱️' },
    confetti: ['#fcee0a', '#00f0ff', '#ff2a6d', '#e879f9', '#ffffff'],
    wave: 'sawtooth',
    intro: { sprite: '🏍️', path: 'rtl', trail: null, backdrop: 'glitch' },
    boss: { name: 'Overmind DEADL1NE', icon: '👁️' },
  },

  blocky: {
    id: 'blocky',
    name: 'Block World',
    icon: '⛏️',
    tagline: 'Dig, build and survive',
    font: '"Silkscreen", monospace',
    swatch: ['#2a211b', '#8fd631', '#5d9c3a'],
    words: {
      party: 'village',
      hero: 'crafter',
      heroes: 'crafters',
      level: 'LVL',
      xp: 'XP',
      levelUp: 'LEVEL UP!',
      loading: 'GENERATING WORLD…',
      gameOver: 'YOU DIED!',
      retry: 'RESPAWN',
      newIssue: 'NEW BLOCK!',
      allDone: 'All built! 🏠',
    },
    partyIcon: '🏠',
    classes: [
      { name: 'Miner', icon: '⛏️', color: '#60a5fa' },
      { name: 'Builder', icon: '🧱', color: '#f87171' },
      { name: 'Farmer', icon: '🌾', color: '#facc15' },
      { name: 'Explorer', icon: '🧭', color: '#4ade80' },
      { name: 'Enchanter', icon: '✨', color: '#c084fc' },
    ],
    tavern: { name: 'Unclaimed', icon: '📦', color: '#b6f55a' },
    kindIcons: { story: '📕', task: '🪓', bug: '🕷️', epic: '🐲', subtask: '🧱' },
    stageIcons: { todo: '📦', doing: '⛏️', done: '💎' },
    heart: '♥',
    uiIcons: { streak: '🔥', due: '⏳' },
    confetti: ['#8fd631', '#5d9c3a', '#60a5fa', '#8b5a2b', '#facc15'],
    wave: 'square',
    intro: { sprite: '⛏️', path: 'ltr', trail: null, backdrop: 'blocks', spin: true },
    boss: { name: 'The Backlog Golem', icon: '🗿' },
  },

  racing: {
    id: 'racing',
    name: 'Grand Prix',
    icon: '🏁',
    tagline: 'Pit stops, podiums and top gear',
    font: '"Racing Sans One", sans-serif',
    swatch: ['#111214', '#ff5a1f', '#ffffff'],
    words: {
      party: 'team',
      hero: 'driver',
      heroes: 'drivers',
      level: 'GEAR',
      xp: 'PTS',
      levelUp: 'SHIFT UP!',
      loading: 'WARMING UP TYRES…',
      gameOver: 'DNF',
      retry: 'BACK TO THE GRID?',
      newIssue: 'NEW LAP!',
      allDone: 'Chequered flag! 🏁',
    },
    partyIcon: '🏎️',
    classes: [
      { name: 'Racer', icon: '🏎️', color: '#f87171' },
      { name: 'Mechanic', icon: '🔧', color: '#fbbf24' },
      { name: 'Strategist', icon: '📊', color: '#60a5fa' },
      { name: 'Engineer', icon: '⚙️', color: '#4ade80' },
      { name: 'Rally Ace', icon: '🚙', color: '#c084fc' },
    ],
    tavern: { name: 'Pit lane', icon: '🅿️', color: '#ff8a4c' },
    kindIcons: { story: '🗺️', task: '🔧', bug: '💥', epic: '🏆', subtask: '🔩' },
    stageIcons: { todo: '🚦', doing: '🏎️', done: '🏁' },
    heart: '◉',
    uiIcons: { streak: '🏁', due: '⏱️' },
    confetti: ['#ffffff', '#111111', '#ff5a1f', '#facc15', '#e5e7eb'],
    wave: 'sawtooth',
    intro: { sprite: '🏎️', path: 'rtl', trail: '💨', backdrop: 'chequered' },
    boss: { name: 'The Rival Champion', icon: '😈' },
  },

  daylight: {
    id: 'daylight',
    name: 'Daylight',
    icon: '☀️',
    tagline: 'Light mode for bright rooms',
    font: '"Press Start 2P", monospace',
    swatch: ['#f8fafc', '#d97706', '#0284c7'],
    words: {
      party: 'team',
      hero: 'teammate',
      heroes: 'teammates',
      level: 'LVL',
      xp: 'XP',
      levelUp: 'LEVEL UP!',
      loading: 'OPENING THE BLINDS…',
      gameOver: 'CLOUDED OVER',
      retry: 'TRY AGAIN?',
      newIssue: 'NEW ISSUE!',
      allDone: 'All done! ☀️',
    },
    partyIcon: '🏡',
    // Darker than the other themes' classes, so names and borders stay readable on white.
    classes: [
      { name: 'Gardener', icon: '🌻', color: '#b45309' },
      { name: 'Lifeguard', icon: '🛟', color: '#0369a1' },
      { name: 'Hiker', icon: '🥾', color: '#15803d' },
      { name: 'Sailor', icon: '⛵', color: '#be123c' },
      { name: 'Astronomer', icon: '🔭', color: '#7e22ce' },
    ],
    tavern: { name: 'Unassigned', icon: '📬', color: '#b45309' },
    kindIcons: { story: '📖', task: '🧰', bug: '🐜', epic: '🏔️', subtask: '🧩' },
    stageIcons: { todo: '🌱', doing: '🌤️', done: '🌻' },
    heart: '♥',
    uiIcons: { streak: '🔥', due: '⏰' },
    confetti: ['#f59e0b', '#0ea5e9', '#22c55e', '#ec4899', '#8b5cf6'],
    wave: 'triangle',
    intro: { sprite: '☀️', path: 'arc', trail: '✨', backdrop: 'glow' },
    boss: { name: 'The Overcast Ogre', icon: '⛈️' },
  },
};

export const THEME_LIST = THEME_IDS.map((id) => THEMES[id]);
