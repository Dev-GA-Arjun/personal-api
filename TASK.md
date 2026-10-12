# Personal Routine Assistant: Sunday Build Plan

Goal: finish a working, resume-ready MVP.
Rule for the day: ship the MVP line first, then polish. If a block runs over, use the cut list at the bottom.

## What it is

A private weekly-routine assistant on my Windows laptop.

- Fixed weekly template (theme habit + muscle group per day)
- Check-ins at 9am, 12pm, 3pm, 6pm, 9pm via Windows toast notifications
- React UI to log Done / Minimum / Skip
- Obsidian vault as storage
- Local LLM (qwen3:8b on desktop) through OmniRoute for notes and weekly review, with offline fallback

## Done

- [x] Node 20 or 22 LTS installed (`node -v`, not 24+)
- [x] OmniRoute runs on the laptop, gateway API key created
- [x] Desktop: Ollama running qwen3:8b, Tailscale installed on both machines
- [x] OmniRoute has the desktop Ollama as a provider (test one request)
- [x] Obsidian vault folder exists with `Routine/`, `Daily/`, `Plans/`
- [x] Empty GitHub repo created
- [x] Phone-free reading book packed for the week

## schedule

### Block 0: Setup (8:00 to 8:30)

- [x] `npm init`, Express, node-cron, node-notifier, a YAML parser, a test runner (Vitest or Jest)
- [x] Folders: `server/`, `server/engine/`, `server/routes/`, `ui/`, `sample-vault/`, `tests/`
- [x] `.env`: `PORT`, `API_TOKEN`, `VAULT_PATH`, `OMNIROUTE_URL`, `OMNIROUTE_KEY`
- [x] `.gitignore`: `.env`, real vault, queue files
      Done when: `GET /health` returns ok on `127.0.0.1`.

### Block 1: Core engine, no UI, no LLM ✅ COMPLETE

- [x] `routine.yaml` format (see below) and a loader with validation
- [x] Window logic: given a time, return the current window and its task
- [x] Log model: status is `done`, `minimum`, or `skip`; `no_data` if never logged
- [x] Storage: append logs to the daily note in the vault (markdown with frontmatter or a simple table)
- [x] Rules in code:
  - minimum counts as done
  - windows are independent, a miss never shifts another window
  - never miss twice: a skip makes the next day's task show the minimum version only
  - weekly consistency, for example days with at least minimum out of 7
  - reset mode after 2 or more fully missed days, which suggests a lighter week
- [x] Unit tests for window lookup, never-miss-twice, and consistency
      Done when: tests pass and a script can simulate a full day.

Take a short break away from the screen.

### Block 2: API and auth

- [x] Bearer token middleware, bind to `127.0.0.1`
- [x] `GET /now`: current window, task, minimum version
- [x] `POST /log`: window, status, optional note
- [x] `GET /today`: five windows with status
- [x] `GET /week`: template, theme, consistency
- [x] `GET /health`
      Done when: all endpoints work with curl or a REST client.

Take a lunch break and step away from the screen.

### Block 3: Notifications and auto-start

- [x] node-cron uses the five configured check-in times (defaults: 09:00, 12:00, 15:00, 18:00, 21:00)
- [x] node-notifier toast with `wait: true`; click opens `http://127.0.0.1:PORT/#/now`
- [x] Turn off Focus Assist or allow notifications, then test with a 1 minute cron
- [x] On server start or wake, mark windows passed without a log as `no_data` and prompt only for the current window
- [x] Task Scheduler entry: `Personal API` runs `npm start` from the project root at logon, hidden, and on battery
      Done when: a test toast appears and the click opens the page.

### Block 4: React UI

Keep it plain. Target under 15 seconds per check-in.

- [x] Vite + React UI served from the Express production build
- [x] `npm start` builds the UI before Express starts
- [x] Native hash routes for Now, Today, and Week; token prompt for local API access
- [x] Now page: task, minimum version, Done / Minimum / Skip, optional note
- [x] Today page: five windows with status
- [x] Week page: theme, muscle group for each day, weekly consistency
- [x] Settings: edit and save all five notification times; task order and historical logs stay unchanged
      Done when: I can log all five windows, see each status in Today, and change notification times in Settings.

### Block 5: LLM layer

- [x] OpenAI-compatible client calls only the configured `OMNIROUTE_URL` and `OMNIROUTE_PRIVATE_COMBO`
- [x] Use no alternate model, URL, or cloud fallback in the app
- [x] Add `/no_think` for Qwen3, request JSON, and validate output against feature schemas
- [x] File-based queue persists idempotent jobs across restart and caps retries at three
- [x] `GET /api/review/week` writes a deterministic weekly summary to `Routine/Reviews/`; queued commentary is added later
- [x] Return template nudges and deterministic review data while the model is unavailable; save notes before queueing reflection
- [ ] Verify the configured OmniRoute combo contains only the desktop model and run a real desktop-on request (not run; tests use a fake client)
      Done when: fake-client tests pass for queueing and offline behavior, and a real desktop-on request has been verified.

Dinner, dumbbell, rest 6:30 to 7:30.

### Block 6: Polish for resume

- [x] README: what, why, setup on Windows, architecture diagram (Mermaid), tradeoffs
- [x] Sample vault contains unmistakably synthetic routine and log examples; tracked-file privacy check completed
- [x] Tests green, a short test section in the README
- [x] Clean commits and push
- [x] UI screenshots captured from the synthetic demo for the README
- [ ] Windows toast screenshot captured for the README (capture did not show a toast)

### Block 7: Dry run

- [ ] Install auto-start, reboot, confirm the server comes up
- [ ] Set tomorrow's real template and load it
- [ ] Verify the 9am notification is scheduled for Monday
- [ ] Stop screen use and prepare for sleep.

## synthetic routine.yaml example

```yaml
week_theme: "Example week: move a little and read"
check_ins: ["09:00", "12:00", "15:00", "18:00", "21:00"]
days:
  mon: { focus: example A }
  tue: { focus: example B }
  wed: { focus: rest }
  thu: { focus: example C }
  fri: { focus: example D }
  sat: { focus: example E }
  sun: { focus: rest }
windows:
  "09:00":
    full: "Example: take a short morning walk and read"
    minimum: "Example minimum: step outside"
  "12:00":
    full: "Example: pause and stretch for two minutes"
    minimum: "Example minimum: stretch once"
  "15:00":
    full: "Example: write one idea in a notebook"
    minimum: "Example minimum: write one word"
  "18:00":
    full: "Example: read a few pages"
    minimum: "Example minimum: read one page"
  "21:00":
    full: "Example: do a short strength routine"
    minimum: "Example minimum: do one movement"
```

Replace the synthetic example with your own routine in your vault; do not commit private routine details.

## MVP line

Engine, API, notifications, Now and Today pages, offline fallback. Without these it is not usable tomorrow.

## Cut list, in this order, if behind

1. Settings page and editable check-in times
2. Week page visuals (show plain text)
3. `/review` model call (keep the deterministic summary)
4. Architecture diagram (write a text description instead)

## Not today

Voice, RAG over notes, MCP server, MongoDB, streaks, cloud providers.

## Resume bullet (edit with real facts after a week of use)

Built a private weekly routine assistant (Node/Express, React) that schedules Windows notifications for timed check-ins, applies miss-recovery rules, and uses a self-hosted LLM via a local gateway with offline queueing and deterministic fallback; data stored in an Obsidian vault.
