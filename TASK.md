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

Break 10:30 to 10:45. Away from the screen.

### Block 2: API and auth

- [x] Bearer token middleware, bind to `127.0.0.1`
- [x] `GET /now`: current window, task, minimum version
- [x] `POST /log`: window, status, optional note
- [x] `GET /today`: five windows with status
- [x] `GET /week`: template, theme, consistency
- [x] `GET /health`
      Done when: all endpoints work with curl or a REST client.

Lunch and 10 minute dumbbell, 12:30 to 1:30. No screen.

### Block 3: Notifications and auto-start

- [ ] node-cron at 09:00, 12:00, 15:00, 18:00, 21:00
- [ ] node-notifier toast with `wait: true`; click opens `http://localhost:PORT/now`
- [ ] Turn off Focus Assist or allow notifications, then test with a 1 minute cron
- [ ] On server start or wake, mark windows passed without a log as `no_data` and prompt only for the current window
- [ ] Task Scheduler entry: at log on, run `node server/index.js` hidden, run on battery
      Done when: a test toast appears and the click opens the page.

### Block 4: React UI

Keep it plain. Target under 15 seconds per check-in.

- [ ] Now page: task, minimum version, Done / Minimum / Skip, optional note
- [ ] Today page: five windows with status
- [ ] Week page: theme, muscle group for each day, weekly consistency
- [ ] Settings: edit check-in times (optional, cut if late)
- [ ] Express serves the built UI
      Done when: I can log all five windows from the UI.

### Block 5: LLM layer

- [ ] OpenAI-compatible client pointing at OmniRoute
- [ ] Route restricted to the desktop model only, no cloud fallback
- [ ] Add `/no_think` for qwen3 and request JSON; validate against a schema
- [ ] File-based queue for requests when the desktop is off
- [ ] `/review`: weekly summary note written to the vault
- [ ] Deterministic fallback text when the model is unavailable
      Done when: review generates with the desktop on and falls back cleanly with it off.

Dinner, dumbbell, rest 6:30 to 7:30.

### Block 6: Polish for resume

- [ ] README: what, why, setup on Windows, architecture diagram (Mermaid), tradeoffs
- [ ] Sample vault with fake notes; confirm no personal data in git
- [ ] Tests green, a short test section in the README
- [ ] Clean commits and push
- [ ] Screenshot of the UI and a toast for the README

### Block 7: Dry run

- [ ] Install auto-start, reboot, confirm the server comes up
- [ ] Set tomorrow's real template and load it
- [ ] Verify the 9am notification is scheduled for Monday
- [ ] Stop. Phone away by 10:30, lights out by 11:00.

## routine.yaml starting point (edit to taste)

```yaml
week_theme: "Read Tamil prose in the train"
check_ins: ["09:00", "12:00", "15:00", "18:00", "21:00"]
days:
  mon: { focus: legs }
  tue: { focus: push }
  wed: { focus: rest-walk }
  thu: { focus: pull }
  fri: { focus: core }
  sat: { focus: shoulders-arms }
  sun: { focus: rest }
windows:
  "09:00":
    full: "Morning stack done and read Tamil in the morning train"
    minimum: "Read 1 page"
  "12:00":
    full: "Midday reset: water, stretch 2 minutes"
    minimum: "Drink water"
  "15:00":
    full: "No reels since morning; notebook idea jotted"
    minimum: "One line in the notebook"
  "18:00":
    full: "Read Tamil on the train home"
    minimum: "Read 1 page"
  "21:00":
    full: "Dumbbell session for today's focus plus night stack"
    minimum: "2 dumbbell moves"
```

The 12:00 and 15:00 tasks are placeholders. Replace with what I actually want.

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
