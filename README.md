# Common Ground

A warm, private roommate hub built with Next.js, React, TypeScript, and Supabase. Designed for Vercel. The home screen is a kitchen noticeboard with warm paper, soft sage, terracotta, and a taped fridge note.

## Home and display mode

The homepage and calendar fit the available viewport without page scrolling. Home cards adapt their item count to the space, with previous/next controls for additional items and notes. Complete chores or mark purchases directly, or use the To-do / Item / Plan shortcuts. Calendar rows resize to fit even six-week months; crowded days open a detail dialog. On phones, navigation stays at the bottom and the calendar becomes a paginated monthly agenda.

Choose **Display mode** in the top bar for a monitor/TV, or bookmark `/?display=1`. It fills the browser viewport with four cards, a clock, and no scrolling. The number of visible items adapts to screen height. Extra items and notes rotate every 20 seconds; the bottom controls let you pause, change pages, enter full screen, or exit. Long titles and notes are shown as concise previews; open the normal app for full details.

Display mode uses the same signed-in household session and refreshes shared records every 15 seconds. It does not create a public sharing link or grant extra access. The URL keeps the display preference across reloads. Set the TV/computer's sleep settings separately if you want an always-on display.

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
- Shared house notes. Create, edit, and delete entries through accessible dialogs.
- `.ics` calendar export and per-event Google Calendar links. These create snapshots/copies, not subscriptions or two-way synchronization.
- Email OTP authentication, household creation, and expiring household invite codes when Supabase is configured.
- Persistent shared records with database-enforced household isolation. Other housemates’ changes refresh every 15 seconds while the page is visible, and on window focus.
- Responsive desktop/mobile layouts and keyboard support.

## Connect a real household

1. Create a [Supabase project](https://supabase.com/dashboard). The [Free plan](https://supabase.com/pricing) is a starting option; check its current limits, inactivity behavior, and email allowances before relying on it.
2. Run `supabase/migrations/001_household.sql` once against the **fresh** project using the SQL editor. It creates the tables, constraints, grants, row-level security policies, and household RPCs in a transaction.
3. Copy `.env.example` to `.env.local` and fill in your Supabase URL and **publishable** key (the legacy anon key also works). Do not use a service-role or secret key. Restart the dev server after changing environment variables.
4. In Supabase Authentication → Email Templates, configure both **Magic Link** and **Confirm signup** to show the OTP: `<p>Your Common Ground sign-in code is {{ .Token }}</p>`. The app expects the emailed numeric code, not a magic-link redirect. Enable email signups.
5. Configure a production SMTP provider before inviting your roommates. Supabase’s built-in mail service is intended for development and restricts recipients/rate. See [SMTP setup](https://supabase.com/docs/guides/auth/auth-smtp). Configure Auth rate limits and OTP expiry for your deployment; email codes should be short-lived.
6. Sign in, create your household, then open **Our household** and generate an invite. Share that code privately. Each roommate signs in using their own email and pastes the code into **Join a home**.

One user belongs to one household in this first version. Invitations have 128 bits of random entropy, are stored only as SHA-256 hashes, and expire after seven days. Generating an invite invalidates the previous code. Invitations permit joining after email verification; they are not a shared login password.

All household members can read and edit the household’s entries. Only the owner can generate invitations. The browser gets a Supabase publishable key; RLS and restricted database privileges enforce access even when someone calls the API directly. Auth sessions are managed by the Supabase browser client; no household records are cached in browser storage. Member removal, owner transfer, and account deletion need an explicit follow-up workflow; until then these are administrative operations in Supabase.

## Deploy to Vercel

The Vercel CLI is included as a development dependency. Deploy directly from this folder; no extra repository clone is needed:

```sh
npx vercel login
npx vercel link
npx vercel env add NEXT_PUBLIC_SUPABASE_URL production
npx vercel env add NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY production
npx vercel --prod
```

Use the HTTPS Supabase project URL for `NEXT_PUBLIC_SUPABASE_URL`, never a PostgreSQL connection string. The local `.env` file does not configure Vercel's hosted environment. Configure the database and email authentication as described above before deploying for household use.

Alternatively, import the GitHub repository through Vercel's website:

1. Push this repository to your Git provider and import it into [Vercel](https://vercel.com/new), using the detected Next.js preset.
2. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` as [Vercel environment variables](https://vercel.com/docs/environment-variables) for the desired environments.
3. Deploy. These public variables are embedded during the build; changing them requires a new deployment.
4. Sign in with two household accounts and a separate outsider account to verify isolation using the checklist below before entering private data.

This repository does not create cloud accounts, remote Git repositories, or paid resources. No live Supabase project or Vercel deployment is provisioned by the local scaffold. Google Fonts are loaded from Google with local fallback fonts if unavailable.

## Verification

```sh
npm run typecheck
npm test
npm run build
```

With the development server running and Google Chrome installed, run `npm run test:browser` for desktop/mobile interaction tests. You can change the Chrome channel in `playwright.config.ts` to use another installed Playwright browser.

Calendar tests cover all-day date boundaries, escaping of user text, UTF-8 line folding, filtering of exported records, and safe external links. `supabase/tests/isolation.sql` verifies RLS and write restrictions inside a transaction that rolls back its fixtures; run it against a disposable database with the schema installed. The local test harness requires a local PostgreSQL server and Supabase-compatible `auth.users`, `auth.uid()`, `anon`, and `authenticated` definitions.

Before production, verify against your actual Supabase instance:

- Signed-out clients cannot select or mutate private tables or invoke household RPCs.
- Household A cannot read, insert, update, or delete household B’s records, even through direct API requests.
- Household A cannot assign an entry to a member of household B or alter its creator/household fields.
- A verified account without membership sees no records; invalid and expired invite codes fail.
- Invite rotation invalidates the old code, and ordinary members cannot rotate invites.
- Two members see saved changes across devices; reload retains records; signing out clears the displayed home.
- Email sending, OTP expiry, retries, and SMTP delivery work with real roommate addresses.

## Next widgets & integrations

Suggested order:

1. **Chore rotation:** recurring tasks, fair assignment, reminders, and snoozing.
2. **Shared expenses:** who paid, equal/custom splits, balances, settlement records. Rent is currently a reminder, not a payment processor.
3. **House handbook:** Wi-Fi, landlord contacts, trash collection, and appliance manuals. Sensitive documents need private object storage and signed download URLs.
4. **Meal planner + pantry:** dinner plans, staples running low, and one-click shopping requests.
5. **Quick polls:** vote on purchases, movie nights, or house rules.
6. **Guests / quiet hours:** overnight visitors, work-from-home blocks, and a heads-up board.
7. **Calendar connections:** Google/Microsoft OAuth, server-side encrypted tokens, webhook handling, and conflict resolution for two-way sync. Private calendar subscription URLs should be revocable secrets.
8. **Shopping enrichment:** optional product metadata from approved retailer APIs. Current store links are manual; no Amazon login, price scraping, checkout, or purchase automation.
9. **Notifications:** opt-in email/push reminders for due chores, rent, and shopping requests.
10. **Membership management:** owner-controlled removal, leaving a house, ownership transfer, and recovery flows.

Data amounts are USD, events are all-day, recurrence and timed reminders are not implemented yet. No background jobs run in this version. The Supabase Data API’s default row cap also means households should add pagination before growing beyond roughly 1,000 entries.
