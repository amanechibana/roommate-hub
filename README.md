# Common Ground

A warm, private roommate hub built with Next.js, React, TypeScript, and Supabase. Designed for Vercel. The home screen is a kitchen noticeboard with warm paper, soft sage, terracotta, and a taped fridge note.

## Home and display mode

The overview opens with the date and one sentence about what the house needs today: chores that have come due, the nearest unpaid bill within the week, and what is on the shopping list ("One thing to do, rent in 5 days, and olive oil to grab."). Each card is a different piece of paper: a calendar leaf for plans, an index card for chores, receipt paper for shopping, and the taped fridge note; the To-dos, Shopping, and Expenses pages carry the same papers. The homepage and calendar fit the available viewport without page scrolling. Home cards adapt their item count to the space; a "See all" link on each card opens the full tab when more items exist. A repeating chore or plan takes one row on the overview — its next turn, plus anything overdue — while the full tab still lists every occurrence. Complete chores or mark purchases directly, or use the To-do / Item / Plan shortcuts. Calendar rows resize to fit even six-week months; crowded days open a detail dialog. On phones, navigation stays at the bottom and the calendar becomes a paginated monthly agenda.

Choose **Display mode** in the top bar for a monitor/TV, or bookmark `/?display=1`. It fills the browser viewport with four cards, a clock, and no scrolling. Each card fits as many rows as its own space allows, measured per row, so a tall entry in one card no longer decides how many the others show and a bigger screen genuinely shows more. Extra items and notes rotate every 20 seconds; the bottom controls let you pause, change pages, enter full screen, or exit. Long titles and notes are shown as concise previews; open the normal app for full details.

Display mode uses the same signed-in household session and refreshes shared records every 15 seconds. It does not create a public sharing link or grant extra access. The URL keeps the display preference across reloads. Set the TV/computer's sleep settings separately if you want an always-on display.

Controls use Radix UI primitives and Motion, styled to match the house: sliding filter highlights, tactile buttons, drawn checkmarks, and gentle entrances. A living windowsill illustration appears across the app: tap the cat to make it stretch, or complete a to-do to get a small reaction. The cat breathes and flicks its tail, the plant sways, and clouds drift past. On phones the cat sits in the top bar; on a TV the scene sits beside the clock. The TV button has a soft idle shimmer, and display mode has slowly drifting background color. Use **Motion on/off** in display mode or household settings to pause ambient effects; the choice stays on this device. Idle effects stop in hidden tabs, and system reduced-motion preferences are respected.

## Tactile motion

Lists and undo notices animate out while writes continue in the background. Surviving rows move into place; dialog closes preserve focus and keyboard dismissal. Notes and expense editors share a transition with their source card or row. Reduced motion removes these transitions.

The To-dos and Shopping lists open with whatever is waiting on you — your own unfinished chores and the items you said you'd grab — the way the overview already puts your chores first. Anything done, or belonging to your housemate, keeps the order it had, and a shared screen with nobody signed in reorders nothing. To-dos and shopping rows have drag handles: use a pointer or focus the handle and press Up/Down (Home/End also work). Arranging a list by hand replaces that opening order for good on this device. Order is remembered **on this device, per household**, including across reloads. It does not change the household's due dates or synchronize a new order to other devices. Row menus offer edit and delete; the usual undo still works. House notes have a quick composer, member-colored paper, individual tilts, and crumpling exits. In household settings, hover or focus a member magnet for their open chore count and balance; a repeating chore counts once there, as it does on the overview.

The home greeting highlights a recent action by another housemate. “Lately at
home” in household settings shows the latest 20 completed chores, purchases,
bill payments, reopened items, and notes. Actions are saved with the person who
performed them and the actual time, and appear across devices. Activity starts
after migration 012; older entries are not given invented completion times.

Completing items releases paper scraps; finishing the last chore gets an all-done message. Paid bills receive a stamp, repayments get a short transfer illustration, and expense totals count to their new values. Activity is grouped by month, with older months collapsed. Repayment feedback indicates a ledger entry, not a money transfer.

The cat window follows local device time and the commute strip's weather reading. Wall display changes its palette in the morning/evening and dims from 22:00–06:00. Weather particles, seasonal leaves/snow, a subtle card spotlight, and a one-pixel drift all follow the existing ambient gate. Ambient pause also stops automatic board paging and flip animation; actual time and household data stay current. Decorative loops pause in hidden tabs. Seasonal decoration follows the device's calendar month; it is not a forecast.

## Expenses

The Expenses tab records shared purchases, who paid, and even splits among selected housemates. Amounts are calculated in whole cents; any remainder is assigned consistently so shares always add up to the total. **Adjust shares** in the split box turns the even amounts into inputs, for the night one person had the wine: type each share (0 is allowed), the hint says what is left to assign, and the save is refused until they add up. An expense saved that way reopens with its shares as typed (unless they happen to be the even split, which reopens as one). Balances show who owes whom, and repayments reduce the balance without increasing monthly spending. Purchases and repayments can be edited or deleted from Activity. Entries save optimistically and refresh across devices.

Expenses use migration `006_expenses.sql` and a separate household-scoped gateway. Calendar rent/bill checks remain reminders when each person pays their own share; those payments are not posted as expenses. When nobody has paid yet, a bill with an amount offers **I covered the whole bill** — one tap checks off every payer and logs the full amount to Expenses as an even split paid by you, so housemates owe you their shares. The home board greeting shows who owes whom from the ledger, with a shortcut to settle up. Recording a repayment does not send money.

House notes can be turned into a to-do, plan, or shopping item: open the note and pick a new type in the edit dialog. The entry keeps its title, details, and author; turning one into a rent or bill event adds payment checks for everyone.

## The shared screen

A device can sign in as the **household** instead of as a person: pick *This is
a shared screen* on the "Who's this?" step. It is meant for the kitchen tablet
or the wall display, which is nobody in particular.

Such a device is **read-only**. It shows the house by name with no "you"
anywhere, no yours-first ordering, and none of the controls that would author a
change — no quick add, no checkboxes, no row menus, no note composer, no
expense editor, no add-housemate form. This is not only a UI choice: every
gateway function in the migrations requires an actor that is a real housemate
(`name <> 'Housemates'`) and refuses the shared identity, so the house's own
records always say which person did a thing. Pick a person from **Change person
on this device** to check things off again.

## Live updates

Signed-in devices join a Supabase Realtime broadcast channel and ping each
other after every successful save, so a change made on one phone appears on
the other phone and the wall display within a moment. The pings carry no
household data — just "something changed" and which board — and the channel
name is a secret derived server-side, handed only to signed-in sessions. The
15-second poll stays on as the safety net, so nothing is lost if the channel
drops; the wall footer says "updates live" while the channel is connected. A
device ignores its own pings, since a successful write already updated its
screen.

## Reminders and the installable app

The site is an installable web app: `manifest.webmanifest` plus home-screen
icons rendered from the house cat. On iPhone or iPad use Share → Add to Home
Screen; Android and desktop Chrome offer their own install prompts.

**Morning reminders** send one push notification per subscribed device around
7–8am New York time: the day's chores for whoever the device belongs to
(unassigned chores go to both people), any bill whose check that person hasn't
ticked within three days of its date, and a count of needed shopping items. When a digest is going out anyway, it ends with what the ledger says
about you ("You owe Alex $12", "Sam owes you $5", at most two lines); a
balance on its own doesn't wake anyone.
Nothing due means no notification. Each device opts in from **Our household →
Morning reminders**, which also has a "send today's digest now" button for
checking the pipeline end to end. On iOS the app must be installed to the Home
Screen first; the settings section says so when it detects that state.

Setup needs four server-side pieces:

1. Apply migration `008_push_subscriptions.sql` (verify with
   `supabase/tests/push-subscriptions.sql` in a disposable database).
2. Generate VAPID keys with `npx web-push generate-vapid-keys` and set
   `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` (plus an optional
   `VAPID_SUBJECT`, a `mailto:` address) in Vercel and `.env.local`.
3. Set `CRON_SECRET` to a random value; Vercel sends it as a bearer token when
   invoking the cron route.
4. Deploy with `vercel.json`'s cron entry (daily at 12:00 UTC — Vercel's Hobby
   plan runs crons at most once a day, which suits a morning digest).

Subscriptions live in the `push_subscriptions` table behind the same
token-gated gateway pattern as everything else, tied to the person the device
had selected when it opted in. Dead endpoints are pruned automatically when a
push bounces.

## Weather and train times

A band above the noticeboard shows the current weather beside the next few
departures, on both the home screen and the wall display. PATH and subway
arrivals are interleaved so one busy station cannot crowd out the other, and
each departure names the station it leaves from so the two are never confused.

Departures carry an absolute arrival time, so the minutes count down on their
own between the 30-second polls instead of freezing on whatever the last
response said, and a train that has gone drops off without waiting for a
refresh. Anything a minute out is highlighted, since that is the one you might
still catch. How many departures appear is measured from the space available,
and never falls below one per station you added. On a phone the departures
stack under the weather instead, three deep (two on shorter phones), and
the band is dropped on screens under 700px tall.

When an agency feed cannot be reached the board keeps its last known times but
marks itself **Not live** rather than passing them off as current; the same
marker appears when one station of several fails. The refresh button reloads
the weather and departures immediately; hover it to see when the board last
updated. It appears in display mode too, which otherwise refreshes departures
every 30 seconds on its own.

Subway service alerts that are in effect right now — delays, reroutes, active
planned work — appear as a quiet line under the departures, limited to the
routes serving your saved stations (and to your chosen route filters). Live
disruptions sort before planned work. The alerts come from the MTA's public
alerts feed, cached for five minutes; if it can't be reached the line simply
disappears rather than flagging the board. PATH has no comparable feed, so
its free-text delay notes on individual trains remain the only PATH signal.

Each station can also carry a walk time, set in the gear panel. Departures
from that station then show "leave in 4 min" next to the destination, counting
down locally like the arrival times do, and the highlighted train becomes the
one you must leave for now rather than the one arriving next — an arriving
train you can no longer reach is not worth running for.

The gear button opens a managed list of stations. One search box covers both
systems, so "14 st" finds PATH's 14th Street and the MTA's 14 St platforms
together. Add up to six stops, reorder them, or remove them; the weather
follows whichever station sits first in the list.

Expand a station to choose which of its trains you actually care about. A
subway stop offers its routes and its two platform directions, so W 4 St can
show only the A downtown. PATH has one line, so it offers destinations
instead, letting Journal Square show World Trade Center trains and skip the
33rd Street ones.

Each row starts on **All**. Clicking a named option selects just that option,
and further clicks add to the selection; clicking All, deselecting the last
option, or selecting every option all return to showing everything. A stop can
never end up blank.

The subway's options come from the station list; PATH's come from its live
board, since only the feed knows which destinations are running. Anything
already saved is folded into the options, so a filter set for a train that is
not running right now stays visible and undoable. Filtering happens in the
browser, so every household shares one cached upstream response no matter how
differently they have each set things up.

The list is saved in `localStorage`, per device, so the TV and each phone can
show different stops. The wall display is read only apart from refresh, so set
its stations before switching into display mode.

Three upstream sources are used, none of which needs an API key:

| Data       | Source                                       | Notes                                                                                                |
| ---------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Weather    | [Open-Meteo](https://open-meteo.com)         | Current conditions plus the day's high, low, and chance of rain.                                     |
| PATH       | `panynj.gov/bin/portauthority/ridepath.json` | The endpoint behind the RidePATH app. **Unofficial** and undocumented; it can change without notice. |
| NYC Subway | [MTA GTFS-realtime](https://api.mta.info/)   | Protocol buffer feeds, split by line group. No key required.                                         |

Requests go through route handlers in `app/api/` rather than the browser: the
subway feeds are protobuf and are not reachable directly from a page. Responses
are cached in memory for 20 seconds (10 minutes for weather) and concurrent
requests are coalesced, so a TV polling all day makes about three upstream
requests a minute regardless of how many housemates have the page open. When an
upstream fails, the last good board keeps showing instead of going blank.

These are third-party requests. The servers involved see your deployment's IP
address and the station and coordinates being asked about; no household data is
sent. The PATH widget is the most likely to break, so treat it as a nicety
rather than something to catch a train by, and check the platform clock.

`lib/subway-stations.json` holds the 496 subway stations and is committed so
the app never depends on `data.ny.gov` at request time. It is read only by
`lib/subway-data.ts`, which the route handlers import; keeping it out of
`lib/transit.ts` is deliberate, since that module reaches the browser and the
station file would otherwise be bundled with it. Regenerate it when the MTA
opens or re-routes a station:

```sh
node scripts/build-subway-stations.mjs
```

Departure predictions come from the agencies and are only as good as their
feeds. Service changes, skipped stops, and planned diversions are not shown.

## Run locally

Requires Node.js 22+ and npm.

```sh
npm install
npm run dev
```

Open the localhost address printed by Next.js. Without Supabase environment variables, the app opens an interactive **sample household**. Demo changes stay in memory and reset when you reload; no private information should be stored in the demo.

## What works

- Overview with upcoming plans, chores, rent amounts, shopping requests, and a fridge note.
- Monthly calendar for all-day events and dated chores, including rent reminders.
- Assigned to-dos with completion, overdue indicators, and All / Mine / Open / Done filters.
- Shopping requests separated into needs and wants, estimated USD prices, store links, and bought status. An item titled as its own little list — `Household supplies: toilet paper, soap, paper towels` — is shown as that heading with the things under it laid out beside each other, on the list, the overview, the wall display, and the shared list; the overview's opening sentence names it by its heading alone, so one entry cannot swallow the line; it stays one entry that is ticked off as a unit. A title needs a colon and at least two comma-separated things, so `Costco: olive oil` and `Dinner at 7:30` stay ordinary titles. Tap the hand on a row to say **I’ll grab it**; the row, the overview, and the wall display then say who is getting it, and tapping again lets it go. Your own claims and chores read as “you” on your screens; the wall display keeps names, since the whole house reads it. **Share list** in the tab heading hands the open items, with prices and who is getting what, to your phone's share sheet (or copies them on a laptop) for whoever is already at the store; a title written as its own list sends its things one per line under the heading, so they can be bought one at a time. A bought item's menu offers **Need again**, which puts a fresh copy back on the list and leaves the old purchase logged. The add box is a notepad: type or paste one thing per line, and Enter adds every line as its own item, exactly as written, while the cursor stays put (Shift+Enter for a new line).
- Weather and live train departures for PATH and the NYC subway, shown above the
  noticeboard on both the home screen and the wall display, with subway service
  alerts and per-station "leave in …" hints.
- Live cross-device updates over a data-free broadcast channel, with the
  15-second poll as fallback.
- An installable app with an opt-in morning reminder push per device.
- Shared house notes. Create, edit, and delete entries through accessible dialogs.
- `.ics` calendar export and per-event Google Calendar links, which create snapshots/copies. **Subscribe on your phone** in household settings gives a private feed URL instead: Apple, Google, or Outlook Calendar polls it on its own schedule, so plans and dated chores stay current without re-exporting. The link is a secret derived from the household code and session secret, so it is never stored, and changing the household code revokes every subscription at once. It reads the calendar only; nothing writes back.
- Shared household-code authentication and a remembered person picker.
- Persistent shared records with database-enforced household isolation. Other housemates’ changes arrive live over the broadcast channel, with a 15-second poll and window-focus refresh as fallback.
- Responsive desktop/mobile layouts and keyboard support.

## Connect a real household

The household code is the only authentication. After entering it, choose Amane
or Barnatt. The choice is stored in an HTTP-only cookie for 30 days and can be
changed from the sidebar footer or, on a phone, from **Our household →
Switch person**. It controls attribution and the Mine filter;
it does not grant different access rights. Existing entries keep their original
creator, including the legacy shared Housemates identity. That identity is a
`members` row created by migration 002, not a person: it is never offered as an
assignee, payer, or person to switch to, and it is not listed or counted as a
housemate.

For a fresh database, apply migrations in order: `001_household.sql`,
`002_shared_code.sql` (using psql with `-v gateway_hash=<SHA-256 of your gateway token>`),
`003_recurring_entries.sql`, `004_device_identity.sql`, `005_chores_bills_undo.sql`,
`006_expenses.sql`, `007_covered_bills_note_conversion.sql`,
`008_push_subscriptions.sql`, `009_cover_expense_and_attempt_clear.sql`,
`010_push_subscribe_hardening.sql`, `011_revoke_legacy_multi_user.sql`, and
`012_house_activity.sql`.
For an existing installation, apply only the migrations newer than the last installed migration.
Migration 012 adds the private “Lately at home” feed and records the actual actor
and completion time from successful changes. Apply it before deploying this
frontend. Existing entries are untouched; activity starts with new actions.
Migration 004 adds Amane and Barnatt if absent, validates the selected household
member on writes, and returns saved entry IDs with create responses. **Apply it
before deploying this frontend.** It preserves existing entries and members.

Configure the variables listed in `.env.example`: the Supabase URL and
publishable key, `HOUSEHOLD_ACCESS_CODE`, `HOUSEHOLD_SESSION_SECRET`, and
`HOUSEHOLD_DATA_TOKEN`. Keep the last three server-only. The data token must
match the hash supplied to migration 002. Code rotation invalidates existing
sessions; sign-out clears both authentication and person cookies.

Entry creation, edits, check-offs, and deletion appear immediately. Background
writes run in order so rapid clicks cannot arrive out of order, and polling
waits for them to finish. Successful changes need no follow-up GET. A failed
write shows a brief notice and quietly reloads after the queue drains. Normal
cross-device updates arrive live, every 15 seconds, and on focus. Task and
shopping pages also support typing a title and pressing Enter to add it.

## Chores, bills, and Undo

- **Alternating chores:** add a to-do, choose the first assignee, set a repeat
  schedule and end date, check **Alternate each occurrence**, then choose the
  other person. Each occurrence gets its own assignee. Shared series edits
  preserve those turns; a single occurrence can be reassigned independently.
- **Quick moves:** a to-do row's menu offers **Push to tomorrow** (or **Push
  back a day** for something already scheduled ahead) and **Hand to …** for
  each housemate. Both change that one occurrence only, save in the
  background like a check-off, and show up on the other phone live.
- **Nudge:** the same menu offers **Nudge <name>** on a to-do assigned to
  someone else. It sends one push notification to that person's subscribed
  devices ("Alex gave you a nudge — “Dishes” was due yesterday"), and says
  so if they haven't turned reminders on anywhere. A to-do can be nudged once
  every fifteen minutes. Needs the push setup below. Open a rent or bill
  event and each unpaid housemate's check gets a **Nudge <name>** link that
  does the same for their share ("“Rent” ($2,400) is due today — your share
  isn't checked off"). Between 10pm and 8am household time nudges don't go
  out at all; the app says so, and the morning digest at 8 covers what's
  due.
- **Rent and bills:** use an event with category **Rent** or **Bill**. Choose
  **Monthly** for a recurring bill. Open the saved event to see each person’s
  paid check; the current device identity can change only its own check. Each
  occurrence starts unpaid. Each check shows that person's share of the
  amount (the total divided evenly among the payers), the overview says
  "$1,200 each", and reminders and nudges name your share rather than the
  whole bill. Existing Rent events gain checks for Amane and
  Barnatt when migration 005 runs. Overdue unpaid bills stay on the home board.
  Payment check-offs record status only; the amount remains the bill amount.
- **Undo:** deleting an entry or series shows an **Undo** notice for eight
  seconds. Multiple deletions have separate notices. Undo restores original
  IDs, dates, turns, and payments. The server retains the deleted snapshot for
  up to 30 seconds to allow for network latency and removes expired snapshots
  on the next household request. Reloading, signing out, or switching people
  dismisses the notice.

Apply migration 005 before deploying this batch. It adds payment and rotation
fields, backfills existing rent participants without marking anyone paid, and
adds a private table for short-lived deletion snapshots. Verify it with
`supabase/tests/chores-bills-undo.sql` in the disposable database described below.

Apply migration 007 before deploying covered bills and note conversion. It
lets the payment operation check off every payer at once and lets updates
change an entry's kind, managing payment checks when an entry enters or leaves
bill status. Verify it with `supabase/tests/covered-bills-note-conversion.sql`
in the disposable database described below.

## Deploy to Vercel

The Vercel CLI is included as a development dependency. Deploy directly from this folder; no extra repository clone is needed:

```sh
npx vercel login
npx vercel link
npx vercel env add NEXT_PUBLIC_SUPABASE_URL production
npx vercel env add NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY production
npx vercel --prod
```

Use the HTTPS Supabase project URL for `NEXT_PUBLIC_SUPABASE_URL`, never a PostgreSQL connection string. The local `.env` file does not configure Vercel's hosted environment. Configure all server-only household variables and apply the migrations described above before deploying for household use.

Alternatively, import the GitHub repository through Vercel's website:

1. Push this repository to your Git provider and import it into [Vercel](https://vercel.com/new), using the detected Next.js preset.
2. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` as [Vercel environment variables](https://vercel.com/docs/environment-variables) for the desired environments.
3. Deploy. These public variables are embedded during the build; changing them requires a new deployment.
4. Verify shared-code sign-in and select a different person on each device.

This repository does not create cloud accounts, remote Git repositories, or paid resources. No live Supabase project or Vercel deployment is provisioned by the local scaffold. Google Fonts are loaded from Google with local fallback fonts if unavailable.

## Verification

```sh
npm run typecheck
npm test
npm run build
```

With the development server running and Google Chrome installed, run `npm run test:browser` for desktop/mobile interaction tests. You can change the Chrome channel in `playwright.config.ts` to use another installed Playwright browser.

Calendar tests cover all-day date boundaries, escaping of user text, UTF-8 line folding, filtering of exported records, and safe external links. `supabase/tests/isolation.sql` verifies RLS and write restrictions inside a transaction that rolls back its fixtures; run it against a disposable database with the schema installed. The local test harness requires a local PostgreSQL server and Supabase-compatible `auth.users`, `auth.uid()`, `anon`, and `authenticated` definitions.

Push subscription storage has its own check, `supabase/tests/push-subscriptions.sql`,
run the same way with migrations 001–008 installed.

The new database regression check is `supabase/tests/device-identity.sql`.
Run it only in a disposable database with migrations 001–004 and the gateway
hash set to SHA-256 of `test-gateway`. It checks creator attribution, returned
series IDs, valid member edits, invalid member rejection, and gateway access.

For the mocked shared-code browser checks, start the app with its public
Supabase variables set, then run:

```sh
PW_SHARED_API=1 npx playwright test tests/browser/optimistic.spec.ts
```

These tests intercept session and household requests; they never modify the
live household. The other browser tests use the demo app (start with both
public Supabase variables empty).

## Next widgets & integrations

Suggested order:

1. **House handbook:** Wi-Fi, landlord contacts, trash collection, and appliance manuals. Sensitive documents need private object storage and signed download URLs.
2. **Meal planner + pantry:** dinner plans, staples running low, and one-click shopping requests.
3. **Quick polls:** vote on purchases, movie nights, or house rules.
4. **Guests / quiet hours:** overnight visitors, work-from-home blocks, and a heads-up board.
5. **Calendar connections:** Google/Microsoft OAuth, server-side encrypted tokens, webhook handling, and conflict resolution for two-way sync. (The read-only subscription feed shipped; its URL is a derived secret revoked by changing the household code.)
6. **Shopping enrichment:** optional product metadata from approved retailer APIs. Current store links are manual; no Amazon login, price scraping, checkout, or purchase automation.
7. **Membership management:** owner-controlled removal, leaving a house, ownership transfer, and recovery flows.

Chore reminders and push notifications shipped as the daily morning digest;
shared expenses shipped as the Expenses tab. Data amounts are USD, events are
all-day, and weekly, biweekly, and monthly recurring entries are supported.
Reminders at arbitrary times are not implemented — the only scheduled job is
the daily digest cron. The Supabase Data API’s default row cap also means
households should add pagination before growing beyond roughly 1,000 entries.
