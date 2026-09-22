# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

JiraPlay shows a team's Jira issues as a game: each assignee is a hero with XP, a level, a streak, hearts for overdue work and their issues ("quests"); the sprint is a boss fight. The same React UI runs in two hosts:

- **Local web app**: Vite frontend + Express API server.
- **VS Code extension**: the Vite build is loaded into a webview, and the extension host acts as the backend. Each user signs in with their own Jira token.

## Commands

```bash
npm install
npm run dev        # Express API (tsx watch, :8787) + Vite (:5173) together; Vite proxies /api to :$PORT (default 8787)
npm run check      # typecheck + lint + test: run this before calling work done
npm run typecheck  # tsc on three projects: tsconfig.app.json (src, shared), tsconfig.node.json (server), tsconfig.extension.json
npm run lint       # oxlint (.oxlintrc.json), including import-boundary rules
npm run test       # vitest run; tests live next to the code as *.test.ts(x)
npm run test:coverage    # the same run with v8 coverage
npm run build      # typecheck, then vite build into dist/ (also what the extension webview loads)
npm run build:extension  # esbuild bundles extension/extension.ts into dist-extension/extension.cjs (CJS, vscode external)
npm run package    # build + build:extension + scripts/package-extension.mjs (vsce), which writes jiraplay-<version>.vsix to the repo root
```

To run a second copy next to your own dev server (e.g. on demo data), set `PORT` for both: `JIRA_BASE_URL= PORT=8798 npx tsx server/index.ts` and `PORT=8798 npx vite --port 5199`.

Without a `.env` (or, in VS Code, without signing in) everything runs on demo data from `server/mock.ts`. To use real Jira, copy `.env.example` to `.env` and set `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN` and `JIRA_JQL`. Optional: `JIRA_PROJECT_KEY` (needed to create issues), `JIRA_ISSUE_TYPE`, `JIRA_BOARD_ID`, `JIRA_POINTS_FIELD`, `JIRA_SPRINT_FIELD` (found on the site when unset) and `JIRA_ALLOWED_HOSTS`.

The extension manifest (commands, menus, `JiraPlay.*` settings, the walkthrough, `main`, `"license": "MIT"`) lives in `package.json`. Open VSX and the Marketplace require the license, so `LICENSE` is whitelisted in `.vscodeignore` and packaging no longer passes `--skip-license`. The extension is bundled to `.cjs` because the package is `"type": "module"`. `vsce` runs with `--no-dependencies`, so everything it needs must be in `dist/`, `dist-extension/` or `media/`, the only paths `.vscodeignore` lets through. If you add a command or setting in `extension/extension.ts`, add it to `contributes` too.

The store page (Open VSX) is `docs/marketplace.md`, not `README.md`: it is user-facing only, with no build, dev-server or repo instructions. `scripts/package-extension.mjs` swaps it in as `README.md` for the duration of `vsce package` and always restores the repo README afterwards. Its screenshots live in `media/screenshots/*.webp` and are referenced relatively, which works because the files ship inside the .vsix and `--no-rewrite-relative-links` leaves the paths alone; `docs/screenshots/*.png` (used by `README.md`) is not packaged. Keep both READMEs in step when user-facing behaviour changes.

## Code layout and boundaries

- `src/`: the React UI (browser or webview). No Node, VS Code or server imports.
- `shared/`: plain logic and types used by all three (`types.ts`, `xp.ts`, `ledger.ts`, `themes.ts`...). No React, DOM-only or Node APIs.
- `server/`: the stores and the Express app. Imports `shared/` only. `server/jira.ts` is the one entry point: it holds the HTTP transport, the setup/verify flow and the store, and re-exports `server/jira/{types,hosts,adf,mapping}.ts` so import sites and `server/jira.test.ts` only ever name `server/jira`.
- `extension/`: the VS Code host. Imports `server/` and `shared/`. `extension/boardHtml.ts` holds the pure `boardPage()` that builds the webview document and its CSP, so the policy is tested without a webview.

Tests run as two vitest projects (`vitest.config.ts`): `logic` runs `shared/`, `server/` and `extension/` in node, `ui` runs `src/**/*.test.tsx` in jsdom with `src/setupTests.ts`. That setup file stubs `getClientRects`, because jsdom does no layout and anything filtering on visibility (`useDialog`'s focus trap) would otherwise see an empty page.

`.oxlintrc.json` enforces these with `no-restricted-imports`, and the tsconfigs give each area only its own globals. Pure logic belongs in `shared/` (or a non-React module) with a test; `shared/testing.ts` has `makeQuest`.

## Architecture

### One data layer, two transports

- `server/store.ts` defines the `QuestStore` interface and `StoreError`, which carries an HTTP-style status. `withBoardCache` wraps a store so one board load is shared for `BOARD_CACHE_MS` and any write clears it.
- It has two implementations: `server/jira.ts` (`createJiraStore`, Jira Cloud REST v3, wrapped in the board cache) and `server/mock.ts` (in-memory demo data).
- **Web**: `server/index.ts` exposes the store over Express at `/api/...`. Every `/api` route goes through `refuseNonLocal` (`server/localGuard.ts`): Host must be local (DNS rebinding), Origin and `Sec-Fetch-Site` must not be another site. The server binds to 127.0.0.1.
- **VS Code**: `extension/extension.ts` imports the same stores directly. The webview sends `{type:'request', id, method, params}` via `postMessage`, and `JiraPlay.dispatch` answers with `{type:'response', id, result|error}`. The extension can also push `{type:'refresh'}`, `{type:'theme'}`, `{type:'showSetup'}` and `{type:'openQuest', key}`; the webview can send `{type:'ready'}`, `{type:'setTheme'}` and `{type:'openExternal', url}`.
- `src/api.ts` picks the transport at load time: `hostApi` (postMessage RPC) if `acquireVsCodeApi` exists (`src/lib/host.ts`), otherwise `httpApi` (fetch). Both have deadlines (30s, or 90s for the board, "my issues" and connect), so a lost request fails instead of hanging.

Host-level data that isn't a Jira call — the XP ledger (`/api/history`, `getHistory`) and saved views
(`/api/views`, `getViews`/`saveViews`) — sits beside setup rather than in `QuestStore`, so it only touches the
Express route, the extension's `dispatch` and `BoardApi`, not the two stores.

**Adding a store operation means updating all of these:** the `QuestStore` interface, both store implementations, `withBoardCache` if it writes, the Express route, the extension's `dispatch` switch, and both `BoardApi` implementations in `src/api.ts`.

`createQuest(summary, assigneeId, description?)` takes plain text; the Jira store converts it with `textToAdf`.

### XP ledger and progress

- Stores return `Board.progress: {}`. Each host merges the board into its saved **XP ledger** with `withProgress` (`shared/ledger.ts`) and sends the board with every hero's `HeroProgress` (all-time and sprint XP, streaks, achievements, earned class slot).
- Ledger rules (`mergeLedger`): every done, assigned issue gets an `XpEntry` credited at Jira's `resolutiondate` (`Quest.resolvedAt`); entries stay after issues leave the board; a reopened issue loses its entry. It returns the same array when nothing changed, so hosts only save real changes.
- **Web** saves ledgers per Jira site in `.jiraplay-ledger.json` (`server/ledgerFile.ts`, never overwrites a damaged file). **VS Code** saves them in `globalState` under `jiraPlay.ledger:<site>`. Demo ledgers live in memory.
- Pure game rules: `shared/days.ts` (streaks; weekends without work don't break them), `shared/achievements.ts`, `shared/boss.ts` (boss HP = open XP), `earnedClassSlot` in `shared/heroes.ts` (the issue kind that earned the most recent XP picks the class slot; themes list classes in `CLASS_BEHAVIOURS` order).

### Jira setup guide

`src/components/SetupGuide.tsx` is the shared "Connect Jira" form. It asks for the site, email, API token (with steps for creating one) and project key or JQL.

- **When it opens:** automatically on the first load of demo data, unless the user dismissed it (`jiraPlay.setupDismissed` pref). It can also be opened from the header badge.
- **Validation:** `parseSetupInput` and `verifyJiraSetup` in `server/jira.ts` are shared by both hosts. `parseSetupInput` refuses sites outside `isAllowedJiraHost` (https `*.atlassian.net`, `*.jira.com`, `*.jira-dev.com`, plus allowed hosts). `verifyJiraSetup` checks both the login and the JQL with Jira before anything is saved.
- **Web:** `GET/POST /api/setup`. Saving writes `.env` via `server/envFile.ts` (atomic, mode 0600, through `server/privateFile.ts`) and swaps the running store without a restart.
- **VS Code:** the `getSetup` and `connect` RPC methods save the token to `context.secrets` and everything else through `updateSetting`, which writes to the workspace only when the workspace already overrides the key. `jiraBaseUrl`, `email` and `allowedHosts` are `"scope": "application"`, so a workspace can't redirect the token.
- **Opening it from the extension:** the `jiraPlay.signIn` command and the first activation after install (`jiraPlay.welcomed` in globalState) open the board with the guide. A new webview sends `{type:'ready'}` when it subscribes, and the extension answers `{type:'showSetup'}` (and `openQuest`) if requested.
- **Token:** it is never sent back to the UI (`hasToken` only). An empty token field keeps the saved one.

### VS Code extras

- **Sidebar** (`jiraPlay.home`): a real tree built by the pure `sidebarModel` (`extension/sidebarModel.ts`, tested) from the last loaded board: level, streak, my open issues (click runs `jiraPlay.openIssue`), boss, standings. It's empty on demo data or before connecting, so the `viewsWelcome` buttons (switched by the `jiraPlay.connected` context key) show instead.
- **Code → issue:** `jiraPlay.createIssueFromCode` (editor right-click with a selection, or a CodeLens on a TODO) creates an issue from the selection, with the code and its `file:line` in the description. `shared/codeIssues.ts` does the pure work: `findTodos`, `findIssueKey`, `codeIssue`.
- **TODO CodeLens:** `extension/codeLens.ts` is the VS Code provider; `extension/todoLens.ts` is the pure model (`lensTitle`, `boardLookup`) so it can be tested without `vscode`, the same split as `sidebarModel.ts`. It reads the last loaded board — no extra Jira calls — and `onBoard` refreshes it. Off with `jiraPlay.todoCodeLens`.
- **Issue keys in text:** always pass the board's project prefixes (`projectsOf`) to `findIssueKey`. Without them the match is structural, and `UTF-8`, `SHA-1` and `ISO-8601` are all valid-looking keys.
- **Walkthrough:** `contributes.walkthroughs` with markdown in `media/walkthrough/`.
- **Restore:** `registerWebviewPanelSerializer` + `onWebviewPanel:jiraPlay.board`; `src/lib/host.ts` sets initial webview state so VS Code restores the tab.
- **Connections:** `connect()` doesn't cache a failed setup, so the next request retries.
- **Fire-and-forget:** use `fireAndForget(promise, what)`, never a bare `void`. `void` leaves a rejection unhandled, and `postMessage` rejects once a webview is disposed — including on the RPC reply path, where a silent failure leaves the board waiting out its request deadline.

### Themes and design system

- **Data:** `shared/themes.ts` is the one list of themes. For each theme it sets the wording, hero classes, issue-type and status icons, heart, confetti, sound wave, sprint boss, and the 2-second intro (`src/components/ThemeIntro.tsx`). `KINDS` and `STAGES` hold only Jira labels and CSS colour variables; icons come from the theme.
- **Styling:** components use Tailwind's `slate` (surfaces, text) and `amber` (accent) colours. Each `[data-theme]` block in `src/index.css` redefines those `--color-*` variables plus `--kind-*`, `--stage-*`, `--done-mark`, `--font-*`, `--radius-*`, `.bg-arena` and `.theme-title`. Kind and stage colours are CSS variables, so mix them with `color-mix()`, never by appending hex alpha. Theme class colours are hex.
- **Daylight** is the light theme: it inverts the slate scale (slate-950 becomes white, `--color-white` becomes near-black) and darkens the accent and status colours. New UI must read correctly in it.
- **Corners:** `--radius-sm` through `--radius-2xl`. A theme that redefines the scale (`cyber`, `blocky`) must set *every* step; a missing one falls through to Tailwind's default and comes out larger than the step below it.
- **Focus:** one rule in `index.css` gives every interactive element a `--focus-ring` outline on `:focus-visible`, and the token follows each theme's accent. Don't set `outline-none` without replacing it.
- **Type scale:** use `text-pixel-xs` (8px), `text-pixel-sm` (9px), `text-pixel-md` (10px) and `text-meta` (11px), defined in `@theme`, instead of arbitrary sizes. `.font-pixel` uses `font-size-adjust`, so each display font looks about as big as Press Start 2P.
- **Contrast:** body text on dark surfaces is `text-slate-400` or lighter; `slate-600` is only for decorative glyphs with an aria label (empty stars, lost hearts).
- **Current theme:** `src/lib/activeTheme.ts` is a small external store (`useTheme()`, `setTheme()`), applied on import so the page doesn't flash the default. Web: localStorage. VS Code: the `jiraPlay.theme` setting, written onto `<html data-theme>` by `boardHtml`.
- **Adding a theme** means updating `THEME_IDS` and `THEMES` (including `boss` and `uiIcons`), a `[data-theme]` block in `index.css` (including `--kind-*` and `--stage-*`), a woff2 `@font-face` in `src/fonts.css` if it needs a new font, and the `jiraPlay.theme` enum in `package.json`.

`shared/types.ts` (`Board`, `Quest`, `Hero`, `Sprint`, `XpEntry`, `HeroProgress`, `Setup*`) is shared by frontend, server and extension.

### Jira mapping (`server/jira.ts`)

- **Requests** go through one `call()`: 20s timeout, `redirect: 'error'`, 429s retried up to 3 times honouring `Retry-After` (`retryDelayMs`), dropped connections and 503s retried for reads only (GET and `/search/` POSTs), 401s explained as an expired or revoked token. Every call first checks `isAllowedJiraHost`, since settings can be edited by hand.
- **Fields:** story points and sprint field ids come from config, else `discoverFields` over `GET /rest/api/3/field` (cached; falls back to the usual ids if that fails). Points are read from the first discovered field holding a number.
- `stage` (`todo`, `doing` or `done`) comes from the Jira status *category*, not the status name. Game logic (done, XP, overdue) only uses `stage`.
- **Display columns** are the Jira board's columns (`Board.columns`), from the Agile API: `JIRA_BOARD_ID` / `jiraPlay.boardId`, else the project's boards, preferring scrum when the JQL mentions sprints. Cached for 10 minutes; a failure is only remembered for a minute. Fallback: `columnsFromIssues`. `columnIndexFor` in `shared/stages.ts` places issues by `statusId`, falling back to the first column of the same stage.
- **Completing** uses `pickDoneTransition`: Done-category targets, preferring no required screen fields, then the board's last column, then a status named like Done.
- Issues are fetched with `POST /rest/api/3/search/jql` using `nextPageToken` paging, capped at `MAX_BOARD_ISSUES` (1000); `Board.truncatedAt` says when there were more, and the UI shows a notice.
- `/myself` failing doesn't fail the board: `me` is null.
- Heroes are built only from assignees in the results. The sprint banner uses active sprints from the sprint field, sorted by issue count.
- Descriptions and comments are converted from ADF by `adfToText`; new comments are sent as ADF (`textToAdf`). `parseCommentBody` in `server/store.ts` validates comment text for both hosts.
- Status changes use the workflow transitions (`getTransitions`/`transitionQuest`); `StatusPicker` re-fetches them after each change.
- The profile's **All my issues** tab starts every query from `assignee = currentUser()`: counts via `POST /search/approximate-count`, lists via `search/jql` pages. A typed issue key is ORed into the title search and retried on titles only if Jira rejects it.
- Comments load the latest 50 (`orderBy=-created`), reversed so the oldest comes first.

### Frontend (`src/App.tsx`)

- **State:** `App.tsx` holds all state. `serverBoard` is the last board from the server; the board shown is that plus **pending edits** and **created issues** (`shared/overlay.ts`). Polling runs every 30s only while the page is visible, and catches up when it's shown again; fetches are numbered so a slow response never replaces a newer one.
- **Mutations:** `runMutation` adds a `PendingEdit` and sends the request. On failure the edit is dropped (that's the rollback) with an error toast. On success it's marked settled and kept until the board shows it (`pruneEdits`/`showsPatch`) or `MAX_INDEX_LAG_MS` passes, because Jira's search index lags; a recheck runs every 3s meanwhile. Issues opened from the profile (`outsideQuest`) take the patch permanently when it settles.
- **Undo:** "mark done" and moves into a Done status wait `UNDO_MS` behind a toast with Undo (and ⌘/Ctrl+Z via `undoLast`). The wait ends early (the change is sent) when the page is hidden or closed.
- **Toasts:** `notify`/`dismiss` feed `src/components/Toasts.tsx`, a stacked queue with optional actions that pauses on hover or focus.
- **Rendering cost:** unchanged quests, heroes and progress keep their object identity across polls (`shared/identity.ts`), cards and roster rows are `memo`'d with `sameMember`, and handlers passed to them come from `useStableCallback`. Keep new props to memoised components stable.
- **Dialogs** (`QuestDetail`, `ProfilePanel`, `SetupGuide`) are `lazy`-loaded. Put `Suspense` *outside* `AnimatePresence`, with the dialog as the direct child. Dialogs use `useDialog` (`src/lib/useDialog.ts`) for focus in, Tab trapping and focus return.
- **Party:** members are the heroes plus a synthetic `__tavern__` member for unassigned issues; `assigneeFor` and `memberFor` convert ids. `Member.xp` is the ledger total plus local changes the server hasn't counted; use `memberStats(member)` for level and XP bars.
- **Avatars:** `HeroAvatar` shows, in order: the avatar you chose on this computer, the Jira photo, or (no photo, or it failed to load, which is common for site-hosted photos that need a login) a generated `HeroSprite` portrait. You choose in the profile's `AvatarPicker`: the Jira photo, one of `AVATAR_VARIANTS` generated characters, or an uploaded picture cropped to a 128px WebP data URL in the page (`imageToAvatar`). The choice is validated by `parseAvatarChoice` (`shared/avatar.ts`: PNG/JPEG/WebP data URLs only, size-capped) and saved by `loadAvatarChoice`/`saveAvatarChoice` in `src/api.ts`: localStorage in a browser, the `getAvatar`/`setAvatar` RPC (globalState) in VS Code, since webview state is lost when the board closes. It's only shown on your own board; Jira's photo is never changed.
- **Game UI:** `BossFight` (in `SprintBanner`), `Standings`, `AchievementBadges`, `HeroSprite` (procedural pixel characters seeded by id; `portrait` crops to head and shoulders for avatars) and `LevelUpScreen`. `celebrate` shows the XP burst, hits the boss and, on a level-up, the full-screen celebration plus a board shake (skipped with reduced motion; the transform is cleared afterwards so fixed and sticky elements keep working).
- **Board views:** `shared/boardFilter.ts` (`filterQuests`, `sortMembers`) narrows and orders what's shown; `BoardToolbar` drives it. The filter is a *view only* — level, XP bars and hearts still come from the whole board, so a filtered card never lies about someone's progress. `filterQuests` returns the same array when nothing is hidden, and `CharacterCard`'s comparator checks `prev.filter === next.filter`, so keep the filter object stable.
- **Group by status:** `ColumnBoard` puts the whole party in the Jira board's columns, reusing `columnIndexFor` and the `.stage-column` CSS. Rows carry the owner's avatar through `QuestItem`'s `owner` prop.
- **Recap and trends:** `shared/recap.ts` (`sprintRecap`, `daySeries`, `weekSeries`, `kindMix`) works off the saved XP ledger, which the UI fetches with `api.history()` — no extra Jira calls. `src/components/Charts.tsx` draws both; every colour comes from the theme's own CSS variables, both are a single series (so no legend), and each ships a hover layer and an `sr-only` table.
- **Saved views:** `shared/views.ts` parses and edits the list; `parseViews` drops malformed entries rather than throwing, since the list is hand-editable in settings. Switching rewrites `JIRA_JQL` / `jiraPlay.jql` and swaps the store in place. A view holds only JQL, never a token.
- **Game rules** live in `shared/xp.ts`: XP is `10 × points` per done issue, or 10 without points; level is `floor(sqrt(xp/10)) + 1`; difficulty stars come from story points, or from priority when there are none.
- **Accessibility:** interactive things are real buttons (rows have a summary button besides the mouse-only row click), menus (`AssignPicker`, `StatusPicker`) handle arrows and Escape without closing the dialog behind them, `MotionConfig reducedMotion="user"` wraps the app, and icon-only glyphs carry `role="img"` labels. A skip link jumps past the roster to `#board`. The `prefers-reduced-motion` block in `index.css` also stops Tailwind's `animate-pulse`/`animate-bounce`, which `MotionConfig` doesn't reach.
- **Drag to reassign** uses the custom MIME type in `src/lib/useQuestDrop.ts`; the Assign menu is the keyboard equivalent.

### Webview constraints

- `vite.config.ts` uses `base: './'` and writes `dist/manifest.json`. The extension's `boardHtml` reads that manifest to inject the built JS/CSS, so don't break relative asset paths or the manifest output. Lazy chunks load from the same folder.
- **CSP** (`boardHtml`): scripts by nonce or from the webview source; style elements only from the bundle (`style-src-attr 'unsafe-inline'` allows React and motion style attributes); fonts from the bundle; images from the bundle, `data:`, Atlassian, Atlassian's avatar CDN and Gravatar (plus allowed hosts); `base-uri`, `form-action` and `frame-ancestors` none. Don't inject `<style>` elements at runtime.
- **Fonts:** `src/fonts.css` declares Latin-only woff2 `@font-face` rules pointing into `node_modules/@fontsource/*/files`. Don't import `@fontsource` CSS directly: it ships every subset plus legacy `.woff` files (about 600 KB).
- **Images:** logos in `src/assets/*.webp` are imported in code and sized for 2× their display size. `media/icon.png` (128px) is the Extensions list icon; the Activity Bar icon has to stay the single-colour `media/sidebar.svg`.
- Per-user UI state goes through `updateHostState` (webview state) in VS Code, with `localStorage` as the browser fallback. `src/lib/sound.ts` is the example.
- Links must go through `openExternal` from `src/lib/host.ts`. Inside VS Code the extension only opens Atlassian and allowed-host https URLs.

### Naming

Code says "quest", "hero" and "party". User-facing text says "issue", "teammate" and "Unassigned".
