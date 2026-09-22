import { useSyncExternalStore } from 'react';
import { onThemeChange } from '../api';
import { readPref, vscodeApi, writePref } from './host';
import { setSoundWave } from './sound';
import { DEFAULT_THEME, isThemeId, THEMES, type Theme, type ThemeId } from '../../shared/themes';

const THEME_PREF = 'jiraPlay.theme';
const listeners = new Set<() => void>();

/** Inside VS Code the theme is a setting the extension writes onto the page; in a browser it's saved locally. */
function initialTheme(): ThemeId {
  const saved = vscodeApi ? document.documentElement.dataset.theme : readPref(THEME_PREF);
  return isThemeId(saved) ? saved : DEFAULT_THEME;
}

function apply(id: ThemeId) {
  document.documentElement.dataset.theme = id;
  setSoundWave(THEMES[id].wave);
}

// Applied on import, before React renders, so the page never flashes the default theme.
let current = initialTheme();
apply(current);

/** Switches the theme. `save` is false when the change came from the VS Code setting, which is already saved. */
export function setTheme(id: ThemeId, save = true) {
  if (save) {
    if (vscodeApi) vscodeApi.postMessage({ type: 'setTheme', theme: id });
    else writePref(THEME_PREF, id);
  }
  if (id === current) return;
  current = id;
  apply(id);
  listeners.forEach((listener) => listener());
}

onThemeChange((id) => setTheme(id, false));

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useTheme(): Theme {
  return THEMES[useSyncExternalStore(subscribe, () => current)];
}
