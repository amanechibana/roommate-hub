import type { Member } from "./model";
import {
  BUNDLE_A,
  BUNDLE_B,
  type GymTerms,
  type HouseTerms,
} from "./agreements";

export type DocSection = {
  heading: string;
  paragraphs: string[];
  checklist?: string[];
};

const house: DocSection[] = [
  {
    heading: "THE CLEAN SPLIT — House Living and Chore Rotation Agreement",
    paragraphs: [
      'Premises: the apartment shared by the Parties (the "Premises"). System of Record: the Roommate Hub app (the "App").',
      'This House Living and Chore Rotation Agreement (this "Agreement") is entered into by {{party_a}} (Party A) and {{party_b}} (Party B), each a "Party," together the "Parties," effective on the date the second of them agrees in the App (the "Effective Date").',
    ],
  },
  {
    heading: "RECITALS",
    paragraphs: [
      "A. WHEREAS, the Parties share the Premises and intend to keep sharing it without either of them developing strong opinions about the other's relationship with the sink;",
      "B. WHEREAS, the Parties agree that fairness should come from the structure of the system and not from anyone's memory of who did what in March;",
      'C. WHEREAS, the Parties agree that "clean" is a checklist, not a vibe, and wish to write the checklist down before it is needed in an argument;',
      "NOW, THEREFORE, in consideration of the mutual promises below and the continued pleasantness of coming home, the Parties agree as follows:",
    ],
  },
  {
    heading: "ARTICLE 1 — DEFINITIONS AND INTERPRETATION",
    paragraphs: [
      "1.1 Definitions.",
      '"Bundle" means one of the two groups of weekly chores defined in Schedules A and B.',
      '"Rotation Week" means a week beginning Monday 12:00 AM and ending Sunday 11:59 PM local time.',
      '"Checklist" means the itemized completion standard for a Bundle set out in Schedules A and B.',
      '"Complete" means every item on the relevant Checklist is checked off in the App before the Rotation Week ends.',
      '"Swap" has the meaning given in Article 5. "Skip" has the meaning given in Article 6.',
      '"Cover Debt" means an obligation recorded in the App under Section 6.3.',
      '"Failure Clause" means the consequences elected by the Parties in Schedule C.',
      '1.2 Interpretation. Headings are for convenience. "Including" means "including without limitation." The App\'s record controls over anyone\'s recollection, however vivid.',
    ],
  },
  {
    heading: "ARTICLE 2 — THE ROTATION",
    paragraphs: [
      "2.1 Alternation. The weekly chores are divided into Bundle A (Kitchen & Trash, Schedule A) and Bundle B (Bathroom & Common Areas, Schedule B). The Bundles alternate between the Parties each Rotation Week. The App's parity calculation is authoritative; neither Party shall relitigate whose week it is.",
      "2.2 First Assignment. For the first Rotation Week following the Effective Date, Bundle A is held by {{first_bundle_a}} and the other Party holds Bundle B.",
      "2.3 Completion. A Party completes their Bundle by checking off every Checklist item in the App before the Rotation Week ends. Items checked off without being performed are a breach of this Agreement and, more importantly, weird.",
      "2.4 No Early Credit. Doing a chore especially well does not bank credit against future weeks. Excellence is its own reward.",
    ],
  },
  {
    heading: "ARTICLE 3 — STANDARDS",
    paragraphs: [
      "3.1 The Checklist Standard. A chore is done when its Checklist items are true, as a reasonable roommate would judge them. Neither Party shall impose standards not written in a Schedule; a Party who wants a higher standard shall propose it as an amendment (Article 8), not as commentary.",
      "3.2 Supplies. Cleaning supplies are a shared household expense. The Party who uses the last of a supply adds it to the shopping list in the App.",
    ],
  },
  {
    heading: "ARTICLE 4 — AS-YOU-GO RULES (UNTRACKED)",
    paragraphs: [
      "The following standards apply to both Parties at all times. They are not tracked per-instance in the App, and no scorekeeping shall be maintained; they are simply the law of the land.",
      '4.1 Dishes. Dishes a Party uses are washed (or loaded) by the end of that night. "Soaking" is a technique, not a destination, and expires after one night.',
      "4.2 Counters. The Party who cooks wipes the counters and stove after cooking.",
      "4.3 Overflow. If a bin is full, the Party who topped it off takes it out, regardless of whose Bundle contains Trash that week.",
      "4.4 Shared Surfaces. Personal items left in common areas migrate back to their owner's room within 24 hours of a request.",
      "4.5 Guests. A guest's mess is the hosting Party's mess.",
    ],
  },
  {
    heading: "ARTICLE 5 — SWAPS",
    paragraphs: [
      "5.1 Grant. Either Party may request to Swap with the other: (a) a single chore, or (b) an entire Bundle for one Rotation Week. A Swap takes effect only when the other Party accepts it in the App.",
      "5.2 Conditions. A Swap request must be made no later than {{swap_deadline}} of the Rotation Week it affects (suggested: Wednesday 11:59 PM). Each Party is limited to {{max_swaps_month}} accepted Swaps per calendar month (suggested: 2).",
      "5.3 Effect. An accepted Swap transfers the obligation for that week only. The underlying rotation parity is unaffected in later weeks. Responsibility for the swapped chore transfers fully — the requesting Party gets no opinion on how it is subsequently performed.",
    ],
  },
  {
    heading: "ARTICLE 6 — SKIPS",
    paragraphs: [
      "6.1 Grant. A Party who cannot complete a chore in a Rotation Week may Skip it in one of two modes.",
      "6.2 Rollover Skip. The chore rolls into the same Party's next Rotation Week, in addition to that week's Bundle. A Rollover Skip is unilateral — no acceptance required — but a chore may not roll over twice in a row.",
      "6.3 Cover Skip. The other Party performs the chore, and a Cover Debt is recorded in the App. A Cover Skip requires the other Party's acceptance. A Cover Debt is repaid by performing a chore of comparable effort for the other Party within two (2) Rotation Weeks, and is extinguished only when marked repaid in the App.",
      "6.4 Conditions. Skips must be requested before the Rotation Week ends — a Skip requested after the deadline is a miss with paperwork. Each Party is limited to {{max_skips_month}} Skips per calendar month (suggested: 2). Legitimate grounds include illness, travel, and genuinely bad weeks; the Parties agree not to audit each other's reasons unless a pattern emerges.",
    ],
  },
  {
    heading: "ARTICLE 7 — MISSES AND THE FAILURE CLAUSE",
    paragraphs: [
      '7.1 Unexcused Miss. A chore that is neither Complete, validly Swapped, nor validly Skipped when the Rotation Week ends is an "Unexcused Miss." The App counts Unexcused Misses; the Parties do not.',
      "7.2 Trigger. Upon {{miss_trigger}} Unexcused Misses by a Party within a calendar month (suggested: 2), the Failure Clause in Schedule C applies to that Party.",
      "7.3 Proportionality. The Failure Clause is a nudge, not a punishment. If it starts functioning as a punishment, the Parties shall amend it.",
    ],
  },
  {
    heading: "ARTICLE 8 — AMENDMENTS AND THE APP",
    paragraphs: [
      "8.1 Proposals. Either Party may propose an amendment in the App — to a Checklist, a condition, a cap, the Failure Clause, or any other term. The other Party is notified and may approve or decline it, with reasons.",
      "8.2 Effect. An approved amendment becomes part of this Agreement immediately and is recorded in the App with its history. A declined amendment may be revised and re-proposed; it may not be implemented unilaterally.",
      "8.3 The Record. The App's version of this Agreement, its amendments, and its completion history are the authoritative record.",
    ],
  },
  {
    heading: "ARTICLE 9 — GENERAL",
    paragraphs: [
      "9.1 Spirit. This is a social agreement between roommates. It is binding as a matter of honor. If this Agreement ever comes into conflict with the Parties actually liking living together, the living-together prevails and the Agreement gets amended.",
      "9.2 Severability. If any provision proves unworkable or simply too much, the rest survives, and the Parties shall replace the offending provision with something saner.",
      "9.3 Effective Date. This Agreement takes effect when the second Party agrees in the App, and remains in effect until replaced or dissolved by mutual agreement.",
    ],
  },
  {
    heading: "SCHEDULE A — BUNDLE A: KITCHEN & TRASH (weekly)",
    paragraphs: [],
    checklist: [...BUNDLE_A.items],
  },
  {
    heading: "SCHEDULE B — BUNDLE B: BATHROOM & COMMON AREAS (weekly)",
    paragraphs: [],
    checklist: [...BUNDLE_B.items],
  },
  {
    heading: "SCHEDULE C — ELECTED PARAMETERS AND FAILURE CLAUSE",
    paragraphs: [
      "Swap request deadline (Section 5.2): {{swap_deadline}}",
      "Max Swaps / month / Party (Section 5.2): {{max_swaps_month}}",
      "Max Skips / month / Party (Section 6.4): {{max_skips_month}}",
      "Unexcused Misses to trigger Failure Clause (Section 7.2): {{miss_trigger}}",
      "Failure Clause. Upon trigger under Section 7.2, the triggering Party shall: {{failure_clause}}",
      "(Ideas, non-binding: take both Bundles the following week; restock all household supplies out of pocket; fund the next takeout night.)",
    ],
  },
  {
    heading: "SIGNATURES",
    paragraphs: [
      "Each Party's agreement recorded in the App constitutes their signature.",
    ],
  },
];

const gym: DocSection[] = [
  {
    heading:
      "THE IRON PACT — Gym Attendance, Ramp-Up, and Personal Time Off Agreement",
    paragraphs: [
      'Facility: ________________ (the "Gym"). System of Record: the Roommate Hub app (the "App").',
      'This Gym Attendance, Ramp-Up, and Personal Time Off Agreement (this "Agreement") is entered into by {{party_a}} (Party A) and {{party_b}} (Party B), each a "Party," together the "Parties," effective on the date the second of them agrees in the App (the "Effective Date").',
    ],
  },
  {
    heading: "RECITALS",
    paragraphs: [
      'A. WHEREAS, the Parties intend to train together five (5) to seven (7) days per week, and know from experience that "we should go to the gym more" is not a system;',
      "B. WHEREAS, the Parties believe a hard one-hour cap makes training sustainable, and that a session that cannot be finished in an hour was planned wrong, not capped wrong;",
      "C. WHEREAS, the Parties wish every session to be recorded, so that progress is measured in logs rather than remembered generously;",
      "D. WHEREAS, the Parties recognize that life happens, and prefer to budget for it in advance rather than negotiate it at 6:00 AM;",
      "NOW, THEREFORE, in consideration of the mutual promises below and gains both actual and prospective, the Parties agree as follows:",
    ],
  },
  {
    heading: "ARTICLE 1 — DEFINITIONS AND INTERPRETATION",
    paragraphs: [
      "1.1 Definitions.",
      '"Session" means one scheduled joint visit to the Gym under the Schedule.',
      '"Schedule" means the weekly template in Schedule A, as shifted by the Ramp-Up Plan (if elected) and as amended.',
      '"Session Cap" means sixty (60) minutes, measured from entering to leaving the Gym floor.',
      '"Split Target" means 45–50 minutes of weights and 10–15 minutes of cardio within a Session.',
      '"Day Type" means the classification of a Session under Schedule B: Push, Pull, or Legs, in each case including abs and cardio.',
      '"Log" means the structured record of a Session required by Article 5.',
      '"PTO" means the excused-absence budget under Article 7. "Reschedule" has the meaning given in Article 6.',
      '"Ramp-Up Plan" means the progressive start-time schedule in Schedule C, if elected.',
      '"Failure Clause" means the consequences elected by the Parties in Schedule D.',
      "1.2 Interpretation. Headings are for convenience. All times are local. The App's record controls over anyone's recollection, especially recollections of cardio.",
    ],
  },
  {
    heading: "ARTICLE 2 — THE SCHEDULE",
    paragraphs: [
      "2.1 Commitment. The Parties shall attend {{days_per_week}} Sessions per week (elect 5, 6, or 7) at the days and times set out in Schedule A.",
      "2.2 Calendar. The App generates a calendar event for each Session from the Schedule, carrying its Day Type. The calendar is the single source of truth for when the Parties are going and what kind of day it is.",
      "2.3 Together. Sessions are joint. A Party attending alone because the other validly spent PTO still attends; the Schedule does not pause for company.",
    ],
  },
  {
    heading: "ARTICLE 3 — CONDUCT OF A SESSION",
    paragraphs: [
      "3.1 The Cap. No Session shall exceed the Session Cap. The Cap is a feature. Exceeding it is not dedication; it is bad planning, and it is a breach.",
      "3.2 The Split. Each Session targets the Split Target: 45–50 minutes weights, 10–15 minutes cardio. Cardio shall not be silently deleted to make room for one more set.",
      '3.3 The Two-Set Doctrine. Working sets are approximately two (2) per exercise, taken at full effort. Because the sets are few, none of them are junk. "I\'ll try harder on the next one" is inconsistent with this Section.',
      "3.4 Phones. Phones are for the Log, the timer, and music. The Parties agree not to make each other wait through content.",
    ],
  },
  {
    heading: "ARTICLE 4 — RAMP-UP (OPTIONAL)",
    paragraphs: [
      "4.1 Election. The Parties elect (check one in Schedule C): {{ramp_election}}",
      "Ramp-Up. Sessions begin at the Start Time and shift earlier each week by the Weekly Shift until reaching the Target Time no later than the Target Date, per Schedule C. The App moves the scheduled calendar times accordingly.",
      "Cold Open. No ramp. Sessions begin at the Target Time from the first week. The Parties acknowledge they chose this freely.",
      "4.2 No Backsliding. Once a week's start time takes effect under a Ramp-Up Plan, later weeks shall not be scheduled later than it, except by amendment.",
    ],
  },
  {
    heading: "ARTICLE 5 — THE LOG",
    paragraphs: [
      "5.1 Obligation. Each Party records a Log for every Session attended, in the App, no later than the end of that day.",
      "5.2 Contents. A Log records, at minimum: (a) the Day Type; (b) minutes of weights and minutes of cardio; and (c) each exercise performed, with sets, reps, and load. Free-text notes are welcome; they supplement the structured fields and do not replace them.",
      "5.3 Honesty. Logs record what happened, not what was intended. A logged load no one lifted is a breach of this Section and a strange thing to lie about.",
      "5.4 Unlogged Sessions. A Session with no Log by the end of the following day is treated as not attended until logged. The App will nag; the nagging is contractual.",
    ],
  },
  {
    heading: "ARTICLE 6 — RESCHEDULES",
    paragraphs: [
      "6.1 Grant. Either Party may request to move a Session to a different time on the same day, or to another day in the same week. A Reschedule takes effect when the other Party accepts it in the App, and consumes no PTO.",
      "6.2 Conditions. A Reschedule must be requested at least ____ hours before the Session (suggested: 12), and each Party is limited to ____ Reschedules per week (suggested: 2). A request outside these conditions may still be accepted, but acceptance is a favor, not an entitlement.",
    ],
  },
  {
    heading: "ARTICLE 7 — PERSONAL TIME OFF",
    paragraphs: [
      "7.1 The Pool. Each Party has their own PTO pool as elected in Schedule D. Missing a Session does not touch the other Party's pool.",
      "7.2 Spending. Spending PTO is unilateral — no approval required — but is recorded in the App at or before the missed Session, and is visible to both Parties. PTO is spent in increments of 0.25 hours.",
      "7.3 Rates. A fully missed Session costs 1.0 hour. A shortened Session costs the shortfall against the Session Cap, rounded up to the nearest 0.25 hours.",
      "7.4 Exhaustion. When a Party's pool is exhausted, further absences are Unexcused Misses under Article 8. PTO cannot go negative, be borrowed from the future, or be transferred between the Parties, however moving the offer.",
      "7.5 Illness and Injury. Genuine illness or injury does not spend PTO and does not count as a miss; the affected Sessions are marked as sick days in the App. The Parties operate this on the honor system and agree not to discover a chronic condition that occurs only on Leg Day.",
    ],
  },
  {
    heading: "ARTICLE 8 — MISSES AND THE FAILURE CLAUSE",
    paragraphs: [
      '8.1 Unexcused Miss. A scheduled Session that a Party neither attends, covers with PTO, validly Reschedules, nor marks as a sick day is an "Unexcused Miss."',
      "8.2 Trigger. Upon {{miss_trigger}} Unexcused Misses by a Party within a calendar month (suggested: 2), the Failure Clause in Schedule D applies to that Party.",
      "8.3 Fresh Starts. Miss counts reset each calendar month. The Failure Clause looks forward, not backward; a bad month is settled and closed.",
    ],
  },
  {
    heading: "ARTICLE 9 — AMENDMENTS AND THE APP",
    paragraphs: [
      "9.1 Proposals. Either Party may propose an amendment in the App — to the Schedule, the PTO pool, the Ramp-Up Plan, the Failure Clause, or any other term. The other Party is notified and may approve or decline it, with reasons.",
      "9.2 Effect. An approved amendment takes effect immediately and is recorded with its history. A declined amendment may be revised and re-proposed; it may not be implemented unilaterally, including by simply not showing up.",
      "9.3 The Record. The App's version of this Agreement, its amendments, the Schedule, the Logs, and the PTO ledger are the authoritative record.",
    ],
  },
  {
    heading: "ARTICLE 10 — GENERAL",
    paragraphs: [
      "10.1 Spirit. This is a social agreement between training partners. Its purpose is that the Parties actually go. Health outranks streaks: neither Party shall train through an injury to avoid a paper consequence, and the other Party shall not let them.",
      "10.2 Severability. If any provision proves unworkable, the rest survives, and the Parties shall amend rather than abandon.",
      "10.3 Effective Date. This Agreement takes effect when the second Party agrees in the App, and remains in effect until replaced or dissolved by mutual agreement.",
    ],
  },
  {
    heading: "SCHEDULE A — WEEKLY TEMPLATE",
    paragraphs: [
      "(Times shown are the Target Times; if a Ramp-Up Plan is elected, the App applies Schedule C until the Target Date.)",
      "{{template}}",
      "Default Day Type rotation when unspecified: Push → Pull → Legs, repeating, abs and cardio every Session.",
    ],
  },
  {
    heading: "SCHEDULE B — DAY TYPES",
    paragraphs: [
      "Push — Chest, shoulders, triceps. Always includes Abs + 10–15 min cardio.",
      "Pull — Back, biceps, rear delts. Always includes Abs + 10–15 min cardio.",
      "Legs — Quads, hamstrings, glutes, calves. Always includes Abs + 10–15 min cardio.",
      "Approximately two (2) working sets per exercise, full effort (Section 3.3).",
    ],
  },
  {
    heading: "SCHEDULE C — RAMP-UP PLAN (if elected under Section 4.1)",
    paragraphs: [
      "Start Time (week 1): {{ramp_start_time}}",
      "Weekly Shift (earlier by): {{ramp_weekly_shift}} min",
      "Target Time: {{ramp_target_time}}",
      "Target Date (reached no later than): {{ramp_target_date}}",
    ],
  },
  {
    heading: "SCHEDULE D — PTO ELECTION AND FAILURE CLAUSE",
    paragraphs: [
      "PTO pool (elected): {{pto_election}}",
      "Options: 3.0 hours per calendar month, no rollover (suggested while building the habit); or 7.0 hours per year, no rollover (hard mode).",
      "Unexcused Misses to trigger the Failure Clause (Section 8.2): {{miss_trigger}} per calendar month.",
      "Failure Clause. Upon trigger under Section 8.2, the triggering Party shall: {{failure_clause}}",
      "(Ideas, non-binding: fund the other Party's next supplement order; take both chore Bundles for a week under the Clean Split; a month of pre-workout at the triggering Party's expense.)",
    ],
  },
  {
    heading: "SIGNATURES",
    paragraphs: [
      "Each Party's agreement recorded in the App constitutes their signature.",
    ],
  },
];

export const agreementDocuments: { house: DocSection[]; gym: DocSection[] } = {
  house,
  gym,
};

const BLANK = "____";
const DAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

export function renderTokens(
  text: string,
  terms: HouseTerms | GymTerms,
  members: Member[],
): string {
  const people = members.filter((m) => m.name !== "Housemates");
  const gymTerms = terms as GymTerms;
  const resolve = (token: string): string => {
    switch (token) {
      case "party_a":
        return people[0]?.name ?? BLANK;
      case "party_b":
        return people[1]?.name ?? BLANK;
      case "first_bundle_a": {
        const id = (terms as HouseTerms).first_bundle_a;
        return people.find((m) => m.user_id === id)?.name ?? BLANK;
      }
      case "pto_election": {
        const pto = gymTerms.pto;
        if (!pto) return BLANK;
        return pto.period === "month"
          ? `${pto.hours.toFixed(1)} hours per calendar month, no rollover`
          : `${pto.hours.toFixed(1)} hours per year, no rollover`;
      }
      case "ramp_election":
        if (gymTerms.ramp === undefined) return BLANK;
        return gymTerms.ramp === null ? "Cold Open" : "Ramp-Up";
      case "ramp_start_time":
        return gymTerms.ramp?.start_time || BLANK;
      case "ramp_weekly_shift":
        return gymTerms.ramp ? String(gymTerms.ramp.weekly_shift_min) : BLANK;
      case "ramp_target_time":
        return gymTerms.ramp?.target_time || BLANK;
      case "ramp_target_date":
        return gymTerms.ramp?.target_date || BLANK;
      case "template": {
        const template = gymTerms.template;
        if (!Array.isArray(template)) return BLANK;
        return template
          .map((day, index) =>
            day.on
              ? `${DAY_NAMES[index]} ${day.time} (${day.day_type})`
              : `${DAY_NAMES[index]} off`,
          )
          .join(" · ");
      }
      default: {
        const value = (terms as unknown as Record<string, unknown>)[token];
        return value === undefined || value === null || value === ""
          ? BLANK
          : String(value);
      }
    }
  };
  return text.replace(/\{\{(\w+)\}\}/g, (_, token: string) => resolve(token));
}
