# Common Ground

A warm, private roommate hub built with Next.js, React, TypeScript, and Supabase. Designed for Vercel. The home screen is a kitchen noticeboard with warm paper, soft sage, terracotta, and a taped fridge note.

## Home and display mode

The homepage and calendar fit the available viewport without page scrolling. Home cards adapt their item count to the space, with previous/next controls for additional items and notes. Complete chores or mark purchases directly, or use the To-do / Item / Plan shortcuts. Calendar rows resize to fit even six-week months; crowded days open a detail dialog. On phones, navigation stays at the bottom and the calendar becomes a paginated monthly agenda.

Choose **Display mode** in the top bar for a monitor/TV, or bookmark `/?display=1`. It fills the browser viewport with four cards, a clock, and no scrolling. The number of visible items adapts to screen height. Extra items and notes rotate every 20 seconds; the bottom controls let you pause, change pages, enter full screen, or exit. Long titles and notes are shown as concise previews; open the normal app for full details.

Display mode uses the same signed-in household session and refreshes shared records every 15 seconds. It does not create a public sharing link or grant extra access. The URL keeps the display preference across reloads. Set the TV/computer's sleep settings separately if you want an always-on display.

Controls use Radix UI primitives and Motion, styled to match the house: sliding filter highlights, tactile buttons, drawn checkmarks, and gentle entrances. The TV button has a soft idle shimmer, and display mode has slowly drifting background color. Use **Motion on/off** in display mode or household settings to pause ambient effects; the choice stays on this device. Idle effects stop in hidden tabs, and system reduced-motion preferences are respected.

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
and never falls below one per station you added.

When an agency feed cannot be reached the board keeps its last known times but
marks itself **Not live** rather than passing them off as current; the same
marker appears when one station of several fails. The refresh button reloads
the weather and departures immediately; hover it to see when the board last
updated. It appears in display mode too, which otherwise refreshes departures
every 30 seconds on its own.

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
- Shopping requests separated into needs and wants, estimated USD prices, store links, and bought status.
- Weather and live train departures for PATH and the NYC subway, shown above the
  noticeboard on both the home screen and the wall display.
- Shared house notes. Create, edit, and delete entries through accessible dialogs.
- `.ics` calendar export and per-event Google Calendar links. These create snapshots/copies, not subscriptions or two-way synchronization.
- Shared household-code authentication and a remembered person picker.
- Persistent shared records with database-enforced household isolation. Other housemates’ changes refresh every 15 seconds while the page is visible, and on window focus.
- Responsive desktop/mobile layouts and keyboard support.

## Connect a real household

The household code is the only authentication. After entering it, choose Amane
or Barnatt. The choice is stored in an HTTP-only cookie for 30 days and can be
changed from the sidebar footer. It controls attribution and the Mine filter;
it does not grant different access rights. Existing entries keep their original
creator, including the legacy shared Housemates identity.

For a fresh database, apply migrations in order: `001_household.sql`,
`002_shared_code.sql` (using psql with `-v gateway_hash=<SHA-256 of your gateway token>`),
`003_recurring_entries.sql`, `004_device_identity.sql`, then `005_chores_bills_undo.sql`.
For an existing installation, apply only the migrations newer than the last installed migration.
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
cross-device updates still arrive every 15 seconds and on focus. Task and
shopping pages also support typing a title and pressing Enter to add it.

## Chores, bills, and Undo

- **Alternating chores:** add a to-do, choose the first assignee, set a repeat
  schedule and end date, check **Alternate each occurrence**, then choose the
  other person. Each occurrence gets its own assignee. Shared series edits
  preserve those turns; a single occurrence can be reassigned independently.
- **Rent and bills:** use an event with category **Rent** or **Bill**. Choose
  **Monthly** for a recurring bill. Open the saved event to see each person’s
  paid check; the current device identity can change only its own check. Each
  occurrence starts unpaid. Existing Rent events gain checks for Amane and
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

1. **Chore reminders:** reminders and snoozing for the existing alternating schedules.
2. **Shared expenses:** who paid, equal/custom splits, balances, settlement records. Rent is currently a reminder, not a payment processor.
3. **House handbook:** Wi-Fi, landlord contacts, trash collection, and appliance manuals. Sensitive documents need private object storage and signed download URLs.
4. **Meal planner + pantry:** dinner plans, staples running low, and one-click shopping requests.
5. **Quick polls:** vote on purchases, movie nights, or house rules.
6. **Guests / quiet hours:** overnight visitors, work-from-home blocks, and a heads-up board.
7. **Calendar connections:** Google/Microsoft OAuth, server-side encrypted tokens, webhook handling, and conflict resolution for two-way sync. Private calendar subscription URLs should be revocable secrets.
8. **Shopping enrichment:** optional product metadata from approved retailer APIs. Current store links are manual; no Amazon login, price scraping, checkout, or purchase automation.
9. **Notifications:** opt-in email/push reminders for due chores, rent, and shopping requests.
10. **Membership management:** owner-controlled removal, leaving a house, ownership transfer, and recovery flows.

Data amounts are USD, events are all-day, and weekly, biweekly, and monthly recurring entries are supported. Timed reminders are not implemented. No background jobs run in this version. The Supabase Data API’s default row cap also means households should add pagination before growing beyond roughly 1,000 entries.
