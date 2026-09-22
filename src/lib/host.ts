/** The VS Code webview API, available when the board runs inside the JiraPlay extension. */
export interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare const acquireVsCodeApi: (() => VsCodeApi) | undefined;

// acquireVsCodeApi may only be called once per webview, so everything shares this instance.
export const vscodeApi: VsCodeApi | null = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;

// VS Code only restores a board tab after a restart if the webview has saved some state.
if (vscodeApi && vscodeApi.getState() === undefined) vscodeApi.setState({});

export function readHostState<T extends object>(): Partial<T> {
  return (vscodeApi?.getState() as Partial<T> | undefined) ?? {};
}

export function updateHostState(patch: object) {
  vscodeApi?.setState({ ...readHostState(), ...patch });
}

/** Reads a small per-user preference: webview state inside VS Code, localStorage in a browser. */
export function readPref(key: string): unknown {
  if (vscodeApi) return readHostState<Record<string, unknown>>()[key];
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? undefined : JSON.parse(raw);
  } catch {
    return undefined;
  }
}

export function writePref(key: string, value: unknown) {
  if (vscodeApi) {
    updateHostState({ [key]: value });
    return;
  }
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable; the preference just won't persist.
  }
}

/** Inside VS Code, asks the extension to open a link in the browser. Returns false when the page should handle it itself. */
export function openExternal(url: string): boolean {
  if (!vscodeApi) return false;
  vscodeApi.postMessage({ type: 'openExternal', url });
  return true;
}
