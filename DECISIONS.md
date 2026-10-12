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

## D4: LLM route is desktop-only, no cloud fallback

Status: proposed
Context: OmniRoute can route to cloud providers, but my notes are private.
Options: allow cloud fallback; desktop model only
Decision: desktop model only
Why / tradeoff: Private notes never leave my machines. Cost: no model when the desktop is off, so I need a queue and a fallback.

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

Status: accepted
Context: Block 1 of TASK.md requires loading the routine.yaml from the vault and implementing window logic to determine the current check-in based on time.
Options: 
- Implement parsing and logic in the main server file
- Create a separate utility module for routine handling
- Use a third-party cron library for time-based lookups
Decision: Created a dedicated module at server/engine/routine.js that handles loading and validating routine.yaml and provides a getCurrentWindow function.
Why / tradeoff: Separating concerns makes the code more testable and maintainable. The loader validates the YAML structure ensuring data integrity, and the window logic correctly identifies the active check-in window based on system time. Cost: Additional file to maintain, but this is justified by improved code organization.
Revisit if: Requirements change for per-day window variations or if the validation logic needs to be extended.