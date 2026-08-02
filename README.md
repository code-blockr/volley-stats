# VolleyStats

A personal volleyball stat tracker for logging and reviewing hitting, blocking, and defence numbers for film review. I wanted an easily accessible way to log stats and save them, specifically wanting something I could pull up on my phone during film review or at a match without having to manage through Excel (excel macros are annoying to use without an Office sub so).

Multi-user by design so other people (Kobe, Renée, whoever) can log their own sessions from the same app, and in the future compare stats of logged players. Each user's data is completely separate - switching users in the top-right pill swaps out everything.

Built on the same Cloudflare stack as my wordle-wall website - Pages for the frontend, a Pages Function for the API, and D1 as the database. No frameworks. The only dependency is Chart.js, loaded from a CDN. Everything else is plain HTML, CSS, and JavaScript since I'm not really familiar with React.

---

## Stack

| Layer | Tech |
|---|---|
| Hosting | Cloudflare Pages |
| API | Cloudflare Pages Functions |
| Database | Cloudflare D1 (SQLite) |
| Charts | Chart.js via CDN |
| Auth | Server-side password (Worker env secret) |

The app is simple enough that React or Vue would add more complexity than they remove from what I understand. There's no build pipeline to maintain and no `node_modules` to update. For a personal tool this size, it works fine as is.

---

## Authentication Method

The app has a password gate on first load. When you enter the password, it's sent to the API as an `X-App-Password` header. The `Worker` checks it against `APP_PASSWORD`, an environment secret stored in Cloudflare - it's never on the frontend source, so you won't find it by inspecting the page or reading the JS bundle (gotta fix that on `wordle-wall` lol). If the check passes, the password gets stored in `sessionStorage` (not `localStorage`) so it clears automatically when the tab closes. No persistent login, no cookies, no tokens. Every subsequent API call re-sends it as a header.

Wrong password gives a 401 error.

If you've already authenticated in the current tab session, refreshing the page skips the gate automatically - the saved password in `sessionStorage` is tried immediately on load, and if it still works, you go straight to the dashboard. If it fails for some reason (e.g. password changed), `sessionStorage` is cleared and the gate comes back up.

---

## Features

### Dashboard

All-time summary cards across the top row: Kill %, Error %, Efficiency %, and total attempts. These pull from every session for the current user, all time, regardless of mode.

Below that, four line charts laid out (two-per-row on desktop, stacked on mobile). All require at least two eligible sessions to render since a single point doesn't tell you anything about a trend.

The **attack chart** shows efficiency across all sessions in chronological order, Y-axis fixed 0-100%. Each point is colour-coded by efficiency value: green >= 30%, yellow >= 15%, red < 15%. Hovering shows a tooltip table with the full event name, date, efficiency, kill %, error %, cont plus %, cont minus %, and attempt count. Five toggles: Efficiency, Kill %, Error %, Cont Plus %, Cont Minus % - all on by default.

The **blocking chart** appears when you have at least two sessions with blocking data. Toggles for Block Kill %, Block Plus %, Block Error %.

The **defence chart** appears when you have at least two full_game sessions with dig data. Toggles for Dig Plus %, Dig %, Dig Error %.

The **passing chart** appears when you have at least two full_game sessions with passing data. Shows all five grade lines (4-Pass through 0-Pass %) with individual toggles.

Recent sessions list at the bottom shows your 5 most recent ones, with stat mode badges and efficiency values. Clicking any row navigates to the Session View.

### Log Session (`/entry`)

**Film Review mode** is the default. It gives you big tap buttons - one per stat - grouped into sections (Attack / Blocking / Defence / Passing depending on the stat mode). The idea is we are watching a play, something happens, you tap the button that corresponds to the stats that you're actively tracking. Each button's count is colour-coded across five tiers: full green for point-scored outcomes (kills, block kills, dig plus, 4-pass), light green for plays that continue in your favour (continue plus, block plus, 3-pass), grey for neutral (digs, 2-pass, the combined continue button in standard mode), yellow for plays that continue in the opponent's favour (continue minus, block minus, 1-pass), and red for errors and 0-passes. Tapping a button triggers a spring animation on the count and a brief border flash. The live preview bar at the bottom also animates on each tap.

The **undo** button steps back through your taps in reverse order. It tracks a full history so you can undo as many as you want, not just the last one. This is a little unintuative so I'm not sure if I'll change my approach going forward, but for now it works if you know where the button is. 

- Note: I might try to make it so that holding a button decreases the value but I'm not sure if that's encouraged from a UX perspective - probably causes accessiblity issues but that shouldn't be a problem for the few people I expect would use this. 

**Manual mode** is the fallback - standard +/− step buttons and number inputs. Best for entering stats after the fact from notes, a physical stat sheet or an excel book.

- Note: until I figure out importing excel books. Maybe I can use an AI to parse excelbooks?

Three stat modes to pick per session:
- **Offence** - kills, errors, continue plus, continue minus only. Gives you Kill %, Error %, and Efficiency.
- **Offence + Blocking** - adds blocking stats. Useful if you're tracking your blocking contribution separately.
- **Full Game** - adds defence (dig plus, dig, dig error) and passing (0-4 scale). The Passing chart stat is 4-Pass + 3-Pass % - the percentage of passes graded a 3 or 4 (both give the setter real options if they're not lazy).

A **Standard / Detail** toggle sits above the Film Review buttons and increases the granularity of the stats being recorded (thanks Kobe). It affects all three attack categories:

- **Attack**:
  - Standard: Kill / Continue / Error. Continue displays the combined count of both continue types, and always taps into Continue Plus
  - Detail: Kill / Continue Plus / Continue Minus / Error separately
- **Blocking**:
  -  Standard: Block / Block Error
  -  Detail: Block Kill / Block Plus / Block Minus / Block Error
- **Defence**:
- Standard: Dig / Dig Error
- Detail: Dig Plus / Dig / Dig Error

Standard is the default. It's faster to tap during a live game or when you're just trying to keep count without breaking down every nuance. Detail is for sessions where you want the full picture - film review from video where you can take your time. Flipping between them mid-session doesn't affect anything already entered; the data is all stored in the same underlying fields regardless.

Multi-set support: tabs along the top for each set, plus a Game Total tab that sums all sets and shows read-only totals. Add and remove sets with the + Set button and the x on each tab. The active set is what Film Review taps go into - if you're on the Game Total tab, taps go to Set 1 by default.

The live preview bar at the bottom of the form updates in real time as you enter stats. Kill %, Error %, Efficiency, and total attempts - always reflecting the full game total across all sets. Block kills bump efficiency (they end the rally) but they don't count as attack attempts, so they only show up in the numerator.

### History

Sortable, filterable table of all sessions. Click any column header to sort ascending/descending - an arrow indicator shows the current sort direction. Filter by an exact date using the date picker (useful for finding a specific match). Efficiency values are colour-coded green/yellow/red on the same ≥30%/≥15%/<15% scale as the dashboard. Mode badges on each row so you can see at a glance what was tracked. Click any row to open the full Session View.

### Session View

Per-set breakdown table showing all the stats that were tracked for the session's mode, with a running total row at the bottom. Column groups are labelled (Hitting, Blocking, Defence) and separated visually. Efficiency is highlighted in colour.

Inline notes editing - click "Edit Notes" to get a textarea in the same card, save or cancel without leaving the page. Edit Session navigates back to the entry form pre-populated with all the session data, sets included. Delete has a two-step confirmation (click Delete, then confirm Yes) so you don't accidentally wipe something.

  - Note: might be worth looking into backing up data entered progressively so all information isn't lost accidentally

---

## Database Structure

There are three tables: `users`, `sessions`, `sets`.

Sets get their own table rather than being stored as a JSON inside the sessions row. The reason: once sets are in their own rows, you can query them directly in SQL. Things like "average kills per set for full game sessions this month" or "find every set where my efficiency was above 40%" are straightforward queries against the `sets` table. If the set data was just in JSON, you'd have to pull every session into JavaScript first and do the filtering and aggregation there - which works fine now but limits what you can do later when you want charts or breakdowns.

The `sets` table has a foreign key back to `sessions` with `ON DELETE CASCADE`. That means deleting a session automatically deletes all its sets. No orphaned rows to clean up manually.

The `sessions` table has a foreign key back to `users` with `ON DELETE CASCADE` for the same reason.

```sql
users    (id, name)
sessions (id, user_id → users.id, event_name, event_date, notes, mode, created_at)
sets     (id, session_id → sessions.id, set_number,
          kills, errors, continued_plus, continued_minus,
          block_kills, block_plus, block_minus, block_errors,
          dig_plus, digs, dig_errors,
          pass_4, pass_3, pass_2, pass_1, pass_0)
```

The `mode` column on `sessions` tells the app which stat columns are relevant for that session. Offence-only sessions will have 0 in the blocking and defence columns - the UI just ignores those columns when rendering.

`block_kills` (stuff blocks - end the rally and score) feed into hitting efficiency as positive points, even though they're tracked separately from attack kills. `block_plus` is a good redirect that keeps the play alive in our favour, and doesn't change efficiency. `continued_plus` and `continued_minus` split what used to be a single "continued" column - you're tracking whether the rally continued in your favour or theirs.

---

## JavaScript Routing

There's no router library. The app keeps a `state` object with a `page` property (`'dashboard'`, `'entry'`, `'edit'`, `'history'`, `'session'`). Every time something navigates - a nav link click, a row click, a save completing - it calls `navigate(page, options)`, which updates `state.page` and calls `render()`.

`render()` clears `<main>`, calls the right page function based on `state.page`, and appends the result. Each page function returns a DOM element - `innerHTML = ''` and rebuild. For most pages this is fast enough to be imperceptible and I don't have to look into efficient coding practices (I'm lazy okay).

The entry form is an exception: it does targeted DOM updates for stat changes (Film Review taps, +/− buttons) rather than rebuilding the whole form. This is because rebuilding the form would destroy whatever's in the event name and date fields. So the stats card and live preview are updated in place while the text inputs stay untouched.

---

## File structure

```
/
├── public/
│   ├── index.html     # App shell + password gate
│   ├── style.css      # All styles - dark theme, CSS custom properties
│   ├── data.js        # API client - the only file that touches the network
│   └── app.js         # All page logic, routing, DOM rendering
├── functions/
│   └── api/
│       └── [[route]].js  # Pages Function - all API routes + auth middleware
├── schema.sql         # D1 (Database) schema
├── seed.sql           # Demo data - useful for testing right now but will wipe later
└── wrangler.toml      # Cloudflare config - Pages build output + D1 binding
```

**`data.js`** is intentionally isolated from everything else. It exports plain async functions (`getUsers`, `getSessions`, `createSession`, etc.) and all network traffic goes through two internal helpers: `headers()` attaches the password and content-type to every request, and `req()` wraps `fetch()`, handles 401s by throwing `'UNAUTHORIZED'`, and unwraps the JSON. If the app ever moves off Cloudflare to a different backend, `data.js` is the only file that needs to change - `app.js` has no idea what's on the other end of those function calls.

**`functions/api/[[route]].js`** is a Cloudflare Pages Function catch-all. The `[[route]]` filename tells Pages to match any path under `/api/` and pass the captured segments as `params.route`. The Worker checks the password header first, then routes to the right handler based on method and path segments.

---

## API routes

All routes require the `X-App-Password` header matching the `APP_PASSWORD` secret. Returns 401 if it doesn't match or is missing.

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/users` | All users, ordered by name |
| `POST` | `/api/users` | Create a user (name gets title-cased on write) |
| `GET` | `/api/sessions?userId=X` | All sessions for a user with sets attached |
| `GET` | `/api/sessions/:id` | Single session with its sets |
| `POST` | `/api/sessions` | Create session and all its sets in one batch |
| `PUT` | `/api/sessions/:id` | Update session metadata and replace all sets |
| `DELETE` | `/api/sessions/:id` | Delete session (cascades to sets via Foreign Key) |

**POST `/api/sessions` body:**
```json
{
  "userId": 1,
  "eventName": "Tuesday League vs. Rebels",
  "eventDate": "2026-03-04",
  "notes": "Gym was loud.",
  "mode": "full_game",
  "sets": [
    {
      "kills": 9, "errors": 2, "continuedPlus": 8, "continuedMinus": 6,
      "blockKills": 1, "blockPlus": 2, "blockMinus": 1, "blockErrors": 0,
      "digPlus": 3, "digs": 7, "digErrors": 1,
      "pass4": 5, "pass3": 4, "pass2": 2, "pass1": 1, "pass0": 0
    }
  ]
}
```

Valid modes: `"offence"`, `"offence_blocking"`, `"full_game"`.

`PUT /api/sessions/:id` accepts the same shape. It updates the session row and deletes/re-inserts all sets - simpler than diffing which sets changed.

---

## Notes

- No per-user auth - one shared password for everyone. It's a stat tracker, not your bank app so sorry if security is a little light. If someone gets in and logs a fake session, that's a bridge we'll cross when we get there. A per-user login system would mean a sign-up flow, password resets, and a bunch of session management complexity that isn't worth it for this and I really can't be bothered with any of that.
- The password is server-side only. It's stored as a Cloudflare environment secret, injected into the Worker at runtime, and checked on every request before anything else runs. It's not in the source code, not in the JS bundle, and inspecting the page won't surface it. 
  - Thanks Simon Borer for the lesson on frontend security vulnerabilities
- Film Review mode is named that because the most common use case is watching back game footage and tapping along. Works fine tracking live too - it's just big tap buttons either way. The name makes more sense for how it actually gets used though.
- Both entry modes have a Standard/Detail stat depth toggle. Standard collapses the +/− breakdowns into single buttons - Continue instead of Continue Plus and Continue Minus, Block instead of Block Kill/Plus/Minus - for when you're watching film at speed and don't want to think that hard. Detail gives you every field. The toggle (and Film vs Manual) is remembered per device in localStorage, so the form opens the way you left it.
- Standard's "Continue" is a single box but the database has two columns behind it. Typing a total adjusts `continued_plus` by the difference and leaves `continued_minus` alone; if the total you type is lower than `continued_minus`, plus goes to zero and minus absorbs the rest. So a split you entered in Detail survives a trip through Standard instead of getting flattened. The other detail-only fields (block +/−, dig+) aren't editable in Standard at all - if a set has values in them, a line under the grid tells you so rather than pretending they don't exist.
- Sessions store the date as a plain `YYYY-MM-DD` string with no timezone attached. Throughout the app, dates are parsed as `T12:00:00Z` (UTC noon) before being passed to `Date`. This prevents timezone offsets from shifting the date - if your system is UTC-5, parsing `2026-04-06` as midnight UTC would display as May 7th. Noon UTC is safe for any timezone plus/minus 12 hours.
- The efficiency formula is `(kills + block_kills - errors) / attempts`, where attempts = kills + errors + continued_plus + continued_minus. Block kills end the rally so they count toward efficiency, but they aren't attack attempts so they don't go in the denominator. It can go negative - if errors exceed kills + block kills, the number goes red.
  - **THE ABOVE MIGHT ALL BE SUBJECT TO CHANGE BASED ON RENEE'S EVALUATION**
- Every derived number has an ⓘ next to it that opens a plain-English explanation of how it's worked out - what goes in the numerator, what goes in the denominator, and roughly what counts as a good result. It's a tap, not a hover, because `title` attributes do nothing on a phone and the phone is where this gets used.
- Blocking, passing and digging live in accordions rather than always being on screen. Attack is the headline, so its chart stays put; the other three collapse down to a single row each with their headline number still visible in the header, so you can see how you're blocking without opening anything. Whether each one is open is remembered per device. On the dashboard they hold the all-time numbers plus the trend chart, on a session page just that session's numbers.
- Block efficiency and dig efficiency mirror attack efficiency - the good stuff minus the damage, over everything you touched, and they can go negative the same way. Blocking is `(block kills + block plus − block minus − block errors) / all block touches`; digging is `(dig plus + digs − dig errors) / all dig attempts`. **Same caveat as attack efficiency: these are mine, not Renée's, and are subject to her evaluation.**
- Passer rating is the standard 0-4 average - `(4×4-Pass + 3×3-Pass + 2×2-Pass + 1×1-Pass) / total passes`. It sits next to the good pass % rather than replacing it, because they answer different questions: the percentage tells you how often you gave the setter options, the rating gives partial credit for the scrappy ones too. Around 2.3 is serviceable, 2.5+ is good.
- Chart cards defer their first build so the canvas is laid out before Chart.js measures it. That used to be a plain `requestAnimationFrame`, which is fine on page load but not when a chart is created later - inside an accordion you just opened - since rAF doesn't fire in a background tab. It now races rAF against a 50ms timer and takes whichever lands first.
- Pass rating is (4-Pass + 3-Pass) % - straight percentage of passes graded a 3 or 4. Both grades give the setter real options, so lumping them together as "good passes" is more useful than tracking 4s alone because I'm only human and I can't be perfect and passing is hard man. 50%+ is a reasonable benchmark I guess?

---

## #TODO

- Serve stats (aces, service errors)
- Export to CSV and import from CSV
- Per-user stats comparison view
- Date range filter on History (right now it's exact-date only)
- Per-set efficiency chart (not just per-session)
- Update live preview at the bottom of log session window to be conscious of stat mode