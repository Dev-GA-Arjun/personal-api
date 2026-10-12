# Decisions

Draft written 2026-10-11. Every entry is marked "proposed" until I have read it, understood it, and rewritten the "Why" in my own words. Delete anything I cannot defend.

## Constraints (fixed inputs, not decisions)

These came from my situation. Decisions below must respect them.

- **Privacy first:** my notes and logs are personal. Nothing leaves my machines.
- **Local endpoints only:** the API is reachable only from my laptop. No public URL, no cloud hosting.
- **Hardware:** the laptop is Windows and too weak for a local model. The desktop runs qwen3:8b but is on only 2 to 3 days a week.
- **No phone:** check-ins happen on the laptop through notifications and a browser UI, not on a phone or in a terminal.
- **Purpose:** follow a fixed weekly routine, reduce daily decisions, and survive missed tasks without the whole routine collapsing.
- **Check-in windows:** 9am, 12pm, 3pm, 6pm, 9pm.
- **Scope:** one day to build, resume-ready, so every feature must justify its cost.
- **Process:** built with an AI coding agent, reviewed and understood by me.

## D1: Server binds to 127.0.0.1 with a bearer token

Status: proposed
Context: The app holds personal logs and notes.
Options: default binding; localhost only; localhost plus token
Decision: localhost only, plus a token on every route except health
Why / tradeoff: Nothing on the network can reach it, and a token protects against other local processes. Cost: no remote access, which fits my no-phone constraint.
Revisit if: I ever want access from another device.

## D2: Obsidian vault as storage, no database

Status: proposed
Context: I already want my notes in Obsidian, and the data is small.
Options: MongoDB; JSON files; markdown files in the vault
Decision: markdown files in the vault
Why / tradeoff: Human readable and editable, no database to run, and my notes and logs live in one place. Cost: weaker querying and no transactions, acceptable at this scale.

## D3: Rules live in code, the LLM only writes text

Status: proposed
Context: Small local models are unreliable at scheduling and rule following.
Options: LLM plans the day; deterministic engine only; engine decides, LLM writes wording and reviews
Decision: the engine decides windows, misses, and consistency. The LLM writes check-in messages and the weekly review.
Why / tradeoff: Predictable, testable behavior that works when the model is off. Cost: the model cannot freely replan.

## D4: LLM route uses one private desktop-only combo

Status: proposed
Context: OmniRoute may offer multiple providers, but private text may only reach my desktop model.
Options: allow a cloud fallback; use one configured private combo and one OmniRoute URL
Decision: Every model request uses only `OMNIROUTE_URL` and `OMNIROUTE_PRIVATE_COMBO`. That combo must contain only my desktop model; the app has no alternate URL, model, provider, or cloud fallback.
Why / tradeoff:

## D5: Offline fallback with a file-based queue

Status: proposed
Context: The desktop is on only 2 to 3 days a week.
Options: fail the request; deterministic output only; deterministic output plus a queue for later
Decision: serve deterministic output now, queue model requests, process them when the desktop returns
Why / tradeoff: The app is always useful and no note is lost. Cost: a little extra code and delayed reviews.

## D6: Weekly template, not daily planning

Status: proposed
Context: I follow a routine for a week and lose interest if it changes constantly.
Options: new plan every day; fixed weekly template with a theme habit
Decision: one weekly template (theme habit, muscle group per day, task per window)
Why / tradeoff: Fewer daily decisions, which is the main goal. Cost: less flexibility inside the week.

## D7: Two sizes per task, and the minimum counts as done

Status: proposed
Context: Past routines collapsed after one missed task.
Options: all or nothing; full and minimum versions
Decision: every task has a full and a minimum version, and the minimum counts
Why / tradeoff: A bad day still keeps the routine alive. Cost: some tasks will be done at the minimum for a while.

## D8: Windows are independent, with never miss twice

Status: proposed
Context: One miss should not shift or cancel everything after it.
Decision: a missed window never changes other windows. After a skip, the next day shows only the minimum version for that task.
Why / tradeoff: Prevents the cascade where one miss ends the routine. Cost: no catching up on missed work.

## D9: Unlogged windows are "no data", not "skipped"

Status: proposed
Context: A sleeping laptop or a busy day should not count as failure.
Decision: windows with no log show as no_data and never count against the week
Why / tradeoff: Removes guilt, which was how past routines died. Cost: less strict tracking.

## D10: Weekly consistency instead of streaks

Status: proposed
Context: Streaks make one miss feel like losing everything.
Decision: measure days with at least the minimum done, out of 7, per week
Why / tradeoff: One bad day cannot reset progress. Cost: less game-like motivation.

## D11: Windows toast notifications and a local web UI

Status: proposed
Context: I do not use a phone for this and do not want a terminal.
Options: phone notifications; browser notifications only; OS notifications with a local UI
Decision: node-cron triggers Windows toasts that open the local UI
Why / tradeoff: Works without a browser tab and without a phone. Cost: depends on the laptop being awake and on Focus Assist settings.

## D12: Check-ins must take under 15 seconds

Status: proposed
Context: The goal is less screen time, not another screen habit.
Decision: the Now page shows only the current task and three buttons, plus an optional note
Why / tradeoff: Keeps the tool from becoming a time sink. Cost: no dashboards or analytics views.

## D13: Scope cuts for the one-day build

Status: proposed
Decision: voice, RAG over notes, an MCP server, MongoDB, streaks, and cloud providers are out for now
Why / tradeoff: A finished, tested MVP is worth more than a half-built larger one. Cost: those features wait for later iterations.

## D14: Event log for measuring real numbers

Status: proposed
Decision: the server appends one line per event (notification fired or clicked, log submitted, LLM call and duration, fallback used, queue processed) to events.jsonl
Why / tradeoff: Gives real values for METRICS.md and my resume, and helps debugging. Cost: a small amount of extra code. The file stays out of git because it is personal.

## D15: Routine.yaml loader and window lookup logic

Status: superseded by D19
Context: Block 1 of TASK.md requires loading the routine.yaml from the vault and implementing window logic to determine the current check-in based on time.
Options: 
- Implement parsing and logic in the main server file
- Create a separate utility module for routine handling
- Use a third-party cron library for time-based lookups
Decision: Created a dedicated module at server/engine/routine.js that handles loading and validating routine.yaml and provides a getCurrentWindow function.
Why / tradeoff: Separating concerns makes the code more testable and maintainable. The loader validates the YAML structure ensuring data integrity, and the window logic correctly identifies the active check-in window based on system time. Cost: Additional file to maintain, but this is justified by improved code organization.
Revisit if: Requirements change for per-day window variations or if the validation logic needs to be extended.

## D16: Notification cadence follows the five routine windows

Status: accepted
Context: Block 3 requires reminders at the same check-in times every day so the app can prompt me without needing a browser tab open.
Options:
- Use a single long-running timer for all tasks
- Use one cron job per check-in window
- Use a poller that checks the clock in a loop
Decision: Each routine window gets its own node-cron job. The routine template supplies default times; local check-in settings may change reminder times without changing window identities.
Why / tradeoff: This keeps the schedule aligned with the weekly template and makes it easy to test and reason about. Cost: one scheduler per window, but the reliability and clarity are worth it.
Revisit if: I later need different schedules for different days.

## D17: Startup recovery marks passed windows as no_data automatically

Status: accepted
Context: The laptop may be asleep, closed, or offline when a window passes, and the app should not permanently mislabel those windows as missed.
Options:
- Ignore old windows and wait for next check-in
- Treat all missed windows as skipped
- Mark already-passed windows with no log as no_data at startup
Decision: On server startup, any window from today that has already passed and has no log is created as no_data instead of being treated as a failure.
Why / tradeoff: This matches the project rule that unlogged windows are not counted as failures, and it keeps the current window prompt clean. Cost: startup gets a little more logic, but it prevents false guilt and stale red flags.
Revisit if: I later want a stricter missed-task policy for a different routine type.

## D18: Browser UI stays simple and local instead of a full React app

Status: superseded by D19
Context: Block 4 is about fast check-ins and a local browser experience, not about building a large frontend framework.
Options:
- Full React/Vite app with routing and builds
- A single-page HTML app served by Express
- A plain multi-page HTML UI with lightweight JS
Decision: Keep the interface as plain static HTML pages served by Express, with the same JSON API behind bearer auth.
Why / tradeoff: The workflow is small and local, so a lightweight browser UI is faster to build, easier to debug, and much more likely to stay under the 15-second check-in target. Cost: less frontend sophistication, but much lower complexity and less risk of dragging the MVP off track.
Revisit if: I later want a richer UI, more pages, or a more polished app experience.

## D19: Vite + React UI uses native hash navigation and a tab-scoped API token

Status: accepted
Context: The UI now needs Now, Today, and Week views with an explicit token prompt while preserving local-only operation and the sub-15-second check-in goal.
Options:
- Add a router and persistent token storage
- Use browser-native hash routes and keep the token in session storage
Decision: Build a Vite + React single-page UI in `ui/`, use native hash routes without a router library, and keep the entered bearer token in `sessionStorage` for the current tab only. Express serves the built assets; the token is never injected into HTML. `npm start` builds the UI before Express starts.
Why / tradeoff: React supports the three interactive views while native routing and tab-scoped storage avoid extra routing/state dependencies and avoid persisting the token across browser sessions. Building at startup keeps the ignored `ui/dist` output fresh for the local app and its scheduled launch. The Now view keeps the three status actions immediately available. Cost: each new tab or browser session asks for the token again, and startup includes a short build step.
Security and privacy: All data requests use the existing authenticated `/api/*` routes. The UI remains served locally and loads no external fonts, scripts, or services.
Revisit if: The UI grows beyond these three views or a different token-persistence model is explicitly needed.

## D20: Pre-generate and cache a week of nudges

Status: proposed
Context: The desktop model is unavailable for much of the time I use the app.
Options: generate each nudge on demand; pre-generate the next week and serve cached or template text
Decision: Queue a week of nudges for generation and cache them by date and window. The model input contains task names and status counts only; a deterministic template is returned on a cache miss.
Why / tradeoff:

## D21: The model only suggests template changes

Status: proposed
Context: A small model must not change the deterministic routine or its rules.
Options: apply model-generated changes automatically; store suggestions for explicit review
Decision: Store template suggestions as pending. Never apply a suggestion automatically.
Why / tradeoff:

## D22: Persist model work in a file-based queue

Status: proposed
Context: The desktop model is often offline, and queued work must survive a server restart.
Options: keep requests in memory; use a database; persist each job as an ignored JSON file
Decision: Store idempotent jobs as JSON files under the gitignored `queue/` directory. Process only when the model is available and cap each job at three attempts.
Why / tradeoff:

## D23: Keep editable reminder times separate from routine window identities

Status: proposed
Context: Block 4 adds editable reminder times, while daily-note logs and routine tasks are keyed to the original check-in windows.
Options: rename routine windows and historical log keys; store the reminder schedule separately and keep stable window identities
Decision: Persist the five reminder times separately in `Routine/check-in-times.json`. Keep each task bound to its original chronological window identity so existing notes and status calculations are not rewritten when reminder times change.
Why / tradeoff: