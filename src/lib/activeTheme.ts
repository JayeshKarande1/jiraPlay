import { useSyncExternalStore } from 'react';
import { onThemeChange } from '../api';
import { readPref, vscodeApi, writePref } from './host';
import { setSoundWave } from './sound';
import { DEFAULT_THEME, isThemePref, resolveThemePref, THEMES, type Theme, type ThemeId, type ThemePref } from '../../shared/themes';

const THEME_PREF = 'jiraPlay.theme';
const listeners = new Set<() => void>();

/**
 * Inside VS Code the theme is a setting the extension writes onto the page (`data-theme` already resolved, plus
 * `data-theme-pref` when it's `system`); in a browser it's saved locally.
 */
function initialPref(): ThemePref {
  const root = document.documentElement.dataset;
  const saved = vscodeApi ? (root.themePref ?? root.theme) : readPref(THEME_PREF);
  return isThemePref(saved) ? saved : DEFAULT_THEME;
}

/**
 * Whether the surroundings are dark: the editor's colour theme inside VS Code (which it marks on <body>), else
 * the operating system's setting.
 */
function surroundingsDark(): boolean {
  if (vscodeApi) {
    const kind = document.body.dataset.vscodeThemeKind;
    if (kind) return !kind.endsWith('light');
    const { classList } = document.body;
    if (classList.contains('vscode-light') || classList.contains('vscode-high-contrast-light')) return false;
    if (classList.contains('vscode-dark') || classList.contains('vscode-high-contrast')) return true;
  }
  return !window.matchMedia?.('(prefers-color-scheme: light)').matches;
}

const resolve = (value: ThemePref) => resolveThemePref(value, surroundingsDark());

function apply(id: ThemeId) {
  document.documentElement.dataset.theme = id;
  setSoundWave(THEMES[id].wave);
}

// Applied on import, before React renders, so the page never flashes the default theme.
let pref = initialPref();
let current = resolve(pref);
apply(current);

function show(id: ThemeId) {
  if (id === current) return;
  current = id;
  apply(id);
  listeners.forEach((listener) => listener());
}

/** Switches the theme. `save` is false when the change came from the VS Code setting, which is already saved. */
export function setTheme(value: ThemePref, save = true) {
  if (save) {
    if (vscodeApi) vscodeApi.postMessage({ type: 'setTheme', theme: value });
    else writePref(THEME_PREF, value);
  }
  if (pref !== value) {
    pref = value;
    listeners.forEach((listener) => listener());
  }
  show(resolve(value));
}

onThemeChange((value) => setTheme(value, false));

// With `system` chosen, the board follows the OS or the editor as they change.
const followSurroundings = () => {
  if (pref === 'system') show(resolve(pref));
};
window.matchMedia?.('(prefers-color-scheme: light)').addEventListener?.('change', followSurroundings);
if (vscodeApi) new MutationObserver(followSurroundings).observe(document.body, { attributes: true, attributeFilter: ['class', 'data-vscode-theme-kind'] });

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useTheme(): Theme {
  return THEMES[useSyncExternalStore(subscribe, () => current)];
}

/** What the user chose: a theme, or `system`. */
export function useThemePref(): ThemePref {
  return useSyncExternalStore(subscribe, () => pref);
}
