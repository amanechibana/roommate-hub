"use client";
import { activityVerb, activityWhen, type HouseActivity } from "@/lib/activity";

import { AnimatePresence, m } from "motion/react";
import { PresenceRow } from "./ui/presence";
import { HouseCompanion } from "@/components/ui/house-companion";
import { Button } from "@/components/ui/button";
import { useHouseMotion } from "@/components/ui/motion-provider";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  ArrowRight,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Coffee,
  Heart,
  Maximize,
  Minimize,
  Pause,
  Play,
  Plus,
  ShoppingBasket,
  Sparkles,
  StickyNote,
  Wallet,
  X,
} from "lucide-react";
import {
  dateKey,
  parseDate,
  shiftDay,
  type Entry,
  type Household,
  type Kind,
  type Member,
} from "@/lib/model";
import {
  billPaid,
  billShare,
  collapseSeries,
  houseHeadline,
  isBill,
  shareMoney,
  titleGroup,
} from "@/lib/household-actions";
import { asPhrase } from "@/lib/household-config";
import { AmbientToggle } from "@/components/ui/display-button";
import CommuteStrip from "@/components/commute-strip";
import FlipClock from "@/components/ui/flip-clock";
import {
  expenseBalances,
  expenseMoney,
  suggestedRepayments,
} from "@/lib/expenses";
import type { ExpensesController } from "@/lib/use-expenses";

type Props = {
  household: Household;
  activity: HouseActivity[];
  entries: Entry[];
  members: Member[];
  memberId: string | null;
  expenses: ExpensesController;
  display?: boolean;
  readOnly?: boolean;
  demo: boolean;
  live?: boolean;
  error: string;
  onExit: () => void;
  onOpen: (kind: Kind, entry?: Entry) => void;
  onNavigate: (
    tab: "Calendar" | "To-dos" | "Shopping list" | "House notes" | "Expenses",
  ) => void;
  onToggle: (entry: Entry) => void;
  onPay: (entry: Entry) => void;
};
// How many of a grouped title's things a board row shows before it says how
// many are left. Enough for a real household list, few enough that one row
// cannot swallow the card.
const GROUP_ROOM = 6;
const dollars = (amount: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);

export default function HomeBoard({
  household,
  activity,
  entries,
  members,
  memberId,
  expenses,
  display = false,
  readOnly = false,
  demo,
  live = false,
  error,
  onExit,
  onOpen,
  onNavigate,
  onToggle,
  onPay,
}: Props) {
  const {
    reduced,
    active,
    hour,
    month: seasonMonth,
    weather,
    celebration,
  } = useHouseMotion();
  const tone =
    hour >= 22 || hour < 6
      ? "night"
      : hour >= 17
        ? "evening"
        : hour < 11
          ? "morning"
          : "day";
  const particles =
    weather?.icon === "snow"
      ? "snow"
      : weather && ["rain", "storm"].includes(weather.icon)
        ? "rain"
        : seasonMonth >= 8 && seasonMonth <= 10
          ? "leaves"
          : seasonMonth === 11 || seasonMonth <= 1
            ? "snow"
            : "none";
  const [now, setNow] = useState(new Date());
  const board = useRef<HTMLElement>(null);
  const [page, setPage] = useState(0);
  const [paused, setPaused] = useState(false);
  // Room for rows, per card: the plans card being able to show one long
  // entry must not decide how many chores the housework card shows.
  const [limits, setLimits] = useState<Record<string, number>>({});
  const roomFor = (kind: string) => limits[kind] ?? 3;
  const [full, setFull] = useState(false);
  const [fullscreenError, setFullscreenError] = useState("");
  const today = dateKey(now);
  const viewer = members.find(
    (member) => member.user_id === memberId && member.name !== "Housemates",
  );
  const person = (id: string | null) =>
    members.find((m) => m.user_id === id)?.name || "Everyone";
  // One person reads the overview, so their own name there is just "you". The
  // wall is read by the whole house and keeps names, like the balance line.
  const isViewer = (id: string | null) =>
    !display && !!id && id === viewer?.user_id;
  const relative = (date: string) => {
    const days = Math.round(
      (parseDate(date).getTime() - parseDate(today).getTime()) / 86400000,
    );
    return days < 0
      ? `${Math.abs(days)} ${days === -1 ? "day" : "days"} overdue`
      : days === 0
        ? "Today"
        : days === 1
          ? "Tomorrow"
          : `in ${days} days`;
  };
  const friendly = (date: string | null) =>
    !date
      ? "Whenever you can"
      : date === today
        ? "Today"
        : date < today
          ? // How long it has been waiting, the way the plans beside it read:
            // "3 days overdue" is a different feeling from "Overdue".
            relative(date)
          : date === shiftDay(today, 1)
            ? "Tomorrow"
            : parseDate(date).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                // A chore repeating into next year would otherwise read
                // "Jan 7", the same as the one that came and went.
                ...(date.slice(0, 4) === today.slice(0, 4)
                  ? {}
                  : { year: "numeric" }),
              });
  const byDate = (a: Entry, b: Entry) =>
    (a.date || "9999").localeCompare(b.date || "9999");
  // Same reason Up next collapses: a chore set to repeat weekly for the year
  // would otherwise fill the card with fifty copies of one title. Collapsing
  // wants date order, so yours-first is applied to what survives.
  const tasks = collapseSeries(
    entries.filter((e) => e.kind === "task" && !e.done).sort(byDate),
    today,
  ).sort(
    (a, b) =>
      (viewer
        ? Number(b.assignee === viewer.user_id) -
          Number(a.assignee === viewer.user_id)
        : 0) || byDate(a, b),
  );
  const repayments = suggestedRepayments(expenseBalances(expenses.expenses));
  const balanceSummary = repayments.length
    ? repayments
        .map(({ from, to, amount }) =>
          // The wall display is read by the whole home, so "you" means nothing.
          display
            ? `${person(from)} owes ${person(to)} ${expenseMoney(amount)}`
            : `${from === viewer?.user_id ? "You owe" : `${person(from)} owes`} ${to === viewer?.user_id ? "you" : person(to)} ${expenseMoney(amount)}`,
        )
        .join(". ")
    : expenses.expenses.length
      ? "You’re all settled up"
      : "No shared expenses yet";
  const events = collapseSeries(
    entries
      .filter(
        (e) =>
          e.kind === "event" &&
          !e.done &&
          e.date &&
          (e.date >= today || (isBill(e) && !billPaid(e))),
      )
      .sort((a, b) => a.date!.localeCompare(b.date!)),
    today,
  );
  const shopping = entries
    .filter((e) => e.kind === "request" && !e.done)
    .sort(
      (a, b) => Number(b.category === "Need") - Number(a.category === "Need"),
    );
  const notes = entries.filter((e) => e.kind === "note" && !e.done);
  const lately = activity.map((item) => ({
    member: person(item.actor),
    line: `${person(item.actor)} ${activityVerb(item.action)} ${item.title}`,
    at: Date.parse(item.created_at),
  }));
  // The other member's doings; your own check-offs already burst on screen.
  // The wall has no "you", so it shows everything.
  const lastActivity = lately.find(
    (event) =>
      Date.now() - event.at < 48 * 3600000 &&
      (display || !viewer || event.member !== viewer.name),
  );
  const pages = Math.max(
    1,
    Math.ceil(tasks.length / roomFor("task")),
    Math.ceil(events.length / roomFor("event")),
    Math.ceil(shopping.length / roomFor("request")),
    display ? Math.ceil(notes.length / roomFor("note")) : 1,
  );
  const activePage = page % pages;
  const visible = (items: Entry[], room: number) =>
    !display
      ? items.slice(0, room)
      : items.slice(
          (activePage % Math.max(1, Math.ceil(items.length / room))) * room,
          ((activePage % Math.max(1, Math.ceil(items.length / room))) + 1) *
            room,
        );

  const due = tasks.filter((e) => e.date && e.date <= today).length;

  useEffect(() => {
    if (display || !board.current) return;
    const rows = board.current.querySelector(".board-rows");
    if (!rows) return;
    const resize = () => {
      const room = Math.max(1, Math.min(3, Math.floor(rows.clientHeight / 64)));
      setLimits({ event: room, task: room, request: room, note: room });
    };
    const observer = new ResizeObserver(resize);
    observer.observe(rows);
    resize();
    return () => observer.disconnect();
  }, [display]);
  useEffect(() => {
    // Refresh due dates and plan labels at local midnight, including DST days.
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const current = new Date();
      setNow(current);
      const midnight = new Date(
        current.getFullYear(),
        current.getMonth(),
        current.getDate() + 1,
      );
      timer = setTimeout(tick, midnight.getTime() - current.getTime() + 30);
    };
    const resume = () => {
      if (document.visibilityState === "visible") {
        clearTimeout(timer);
        tick();
      }
    };
    tick();
    document.addEventListener("visibilitychange", resume);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", resume);
    };
  }, []);
  useEffect(() => {
    if (!display) return;
    const measure = document.createElement("canvas").getContext("2d");
    const resize = () => {
      const rows = board.current?.querySelectorAll<HTMLElement>(".board-rows");
      if (!rows) return;
      // Every row this card can page to is measured on its own, and the
      // tallest ones are packed first: any page has to fit, but one tall row
      // must not cost the short rows beneath it their place. Ten is a guard
      // against a degenerate measurement (fonts still loading report a
      // near-zero row), not a design ceiling — a taller screen shows more.
      // Observe the cards so weather, balances, and font loading resize them.
      const room: Record<string, number> = {};
      rows.forEach((list) => {
        const row = list.querySelector<HTMLElement>(
          ".board-plan, .board-task, .board-shopping",
        );
        const title = row?.querySelector("strong");
        const detail = row?.querySelector("small");
        if (!row || !title || !detail) return;
        const style = getComputedStyle(row);
        const titleStyle = getComputedStyle(title);
        const detailStyle = getComputedStyle(detail);
        const titleLine = parseFloat(titleStyle.lineHeight);
        const detailLine = parseFloat(detailStyle.lineHeight);
        const width = title.clientWidth;
        const kind = row.classList.contains("board-plan")
          ? "event"
          : row.classList.contains("board-task")
            ? "task"
            : "request";
        const dateHeight =
          row.querySelector(".board-date")?.getBoundingClientRect().height || 0;
        // Two lines is the most either the title or the things under it get,
        // matching what the wall's CSS will actually show.
        const lines = (text: string, font: string) => {
          if (!measure || !width) return 2;
          measure.font = font;
          return Math.min(
            2,
            Math.max(1, Math.ceil(measure.measureText(text).width / width)),
          );
        };
        const heights = entries
          .filter((entry) => entry.kind === kind && !entry.done)
          .map((entry) => {
            const group = titleGroup(entry.title);
            let content =
              titleLine * lines(group?.heading ?? entry.title, titleStyle.font);
            if (group)
              content +=
                detailLine *
                  // Each chip carries its own padding, near enough a line.
                  lines(
                    group.items
                      .slice(0, GROUP_ROOM)
                      .map((item) => `${item}\u2003`)
                      .join(""),
                    detailStyle.font,
                  ) +
                parseFloat(detailStyle.marginTop);
            content += detailLine + parseFloat(detailStyle.marginTop);
            return (
              Math.max(content, dateHeight) +
              parseFloat(style.paddingTop) +
              parseFloat(style.paddingBottom) +
              1
            );
          })
          .sort((a, b) => b - a);
        // An empty card has no rows to fit and must not hold the others back.
        if (!heights.length) return;
        let used = 0;
        let fits = 0;
        while (
          fits < heights.length &&
          used + heights[fits] <= list.clientHeight
        ) {
          used += heights[fits];
          fits += 1;
        }
        room[kind] = Math.max(1, Math.min(10, fits));
      });
      // The fridge has no rows to measure, so it follows the tightest card.
      const measured = Object.values(room);
      if (measured.length) room.note = Math.min(...measured);
      // Keep the old object when nothing moved: a fresh one every measurement
      // would re-render the board on each observer tick.
      setLimits((current) =>
        Object.keys(room).length === Object.keys(current).length &&
        Object.keys(room).every((kind) => current[kind] === room[kind])
          ? current
          : room,
      );
    };
    const observer = new ResizeObserver(resize);
    board.current
      ?.querySelectorAll(".board-rows")
      .forEach((rows) => observer.observe(rows));
    resize();
    window.addEventListener("resize", resize);
    const syncFull = () => setFull(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", syncFull);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", resize);
      document.removeEventListener("fullscreenchange", syncFull);
    };
  }, [display, entries]);
  useEffect(() => {
    if (!display || paused || !active || pages < 2) return;
    const timer = setInterval(() => setPage((p) => (p + 1) % pages), 20000);
    return () => clearInterval(timer);
  }, [display, paused, pages, active]);
  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.documentElement.requestFullscreen)
        await document.documentElement.requestFullscreen();
      else
        setFullscreenError(
          "Use your browser’s full-screen option on this device.",
        );
    } catch {
      setFullscreenError(
        "Full screen wasn’t available. Display mode still fits this window.",
      );
    }
  }
  const more = (
    count: number,
    tab: "Calendar" | "To-dos" | "Shopping list" | "House notes",
    room: number,
  ) =>
    !display && count > room ? (
      <Button className="board-more" onClick={() => onNavigate(tab)}>
        See all {count} <ArrowRight size={14} />
      </Button>
    ) : null;
  const title = (entry: Entry, label = entry.title) =>
    display || readOnly ? (
      <strong title={entry.title}>{label}</strong>
    ) : (
      <Button
        className="board-entry-title"
        onClick={() => onOpen(entry.kind, entry)}
      >
        {label}
      </Button>
    );

  return (
    <section
      ref={board}
      data-tone={tone}
      data-all-done={
        celebration > 0 &&
        !tasks.length &&
        entries.some((entry) => entry.kind === "task")
      }
      className={
        display ? "home-board wall-display" : "home-board everyday-board"
      }
      aria-label={display ? "Household display" : "Household noticeboard"}
    >
      {display && (
        <div className="wall-ambient" aria-hidden="true">
          <i />
          <i />
          <i />
          <div className="wall-particles" data-weather={particles}>
            {particles !== "none" &&
              Array.from({ length: 12 }, (_, i) => (
                <span
                  key={i}
                  style={
                    {
                      "--left": `${(i * 37) % 100}%`,
                      "--delay": `${-i * 2.7}s`,
                      "--duration": `${particles === "rain" ? 2 + (i % 3) : 14 + (i % 6)}s`,
                    } as CSSProperties
                  }
                />
              ))}
          </div>
        </div>
      )}
      <header className="board-welcome">
        <div>
          <p className="board-kicker">
            <Coffee size={16} />
            {display
              ? household.name
              : now.toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
          </p>
          {/* The house's own headline: what today is asking of it. */}
          <h1>
            {houseHeadline(entries, today, viewer?.user_id ?? null) ||
              (!tasks.length && entries.some((entry) => entry.kind === "task")
                ? "All done. The cat approves."
                : "All quiet at home.")}
          </h1>
          {display ? (
            <p className="wall-expenses" aria-label="Expense balance">
              <Wallet size={16} aria-hidden="true" />
              <span>
                {expenses.error
                  ? "Expense updates unavailable"
                  : !expenses.loaded
                    ? "Loading expenses…"
                    : balanceSummary}
              </span>
            </p>
          ) : (
            !expenses.error && (
              <div className="board-balance">
                <Wallet size={14} aria-hidden="true" />
                {expenses.loaded ? (
                  <span>{balanceSummary}</span>
                ) : (
                  <span aria-label="Loading expense balance">
                    <span className="skeleton skeleton-line" />
                  </span>
                )}
                {expenses.loaded && !!repayments.length && (
                  <Button
                    className="board-more"
                    onClick={() => onNavigate("Expenses")}
                  >
                    Settle up <ArrowRight size={13} />
                  </Button>
                )}
              </div>
            )
          )}
          {lastActivity && (
            <p className="board-lately">
              <Sparkles size={13} aria-hidden="true" />
              <span>
                {lastActivity.line}, {activityWhen(lastActivity.at, now)}
              </span>
            </p>
          )}
        </div>
        {display ? (
          <div className="wall-clock">
            <HouseCompanion variant="wall" />
            <span className="clock-breath" aria-hidden="true" />
            <FlipClock />
          </div>
        ) : readOnly ? null : (
          <div className="board-quick-actions">
            <Button onClick={() => onOpen("task")}>
              <Plus size={16} />
              To-do
            </Button>
            <Button onClick={() => onOpen("request")}>
              <ShoppingBasket size={16} />
              Item
            </Button>
            <Button onClick={() => onOpen("event")}>
              <CalendarDays size={16} />
              Plan
            </Button>
          </div>
        )}
      </header>
      {display && error && (
        <p className="wall-warning" role="alert">
          Updates unavailable. Showing the last loaded home.
        </p>
      )}
      <CommuteStrip display={display} />
      <div className="noticeboard-grid">
        <m.section
          initial={reduced ? false : { opacity: 0.65 }}
          animate={{ opacity: 1 }}
          transition={{ duration: reduced ? 0 : 0.3, delay: reduced ? 0 : 0.0 }}
          className="board-card plans-card paper-leaf"
        >
          <div className="board-card-heading">
            <h2>
              <CalendarDays size={19} />
              Up next
            </h2>
            <span>
              {events.length} {events.length === 1 ? "plan" : "plans"}
            </span>
          </div>
          <div className="board-rows">
            {/* Capacity changes are immediate; user removals still animate out. */}
            <AnimatePresence
              key={roomFor("event")}
              initial={false}
              mode="popLayout"
            >
              {visible(events, roomFor("event")).map((entry) => (
                <PresenceRow
                  initial={false}
                  className="board-plan"
                  key={entry.id}
                >
                  <span className="board-date">
                    <small>
                      {parseDate(entry.date!).toLocaleDateString("en-US", {
                        month: "short",
                      })}
                    </small>
                    <b>{parseDate(entry.date!).getDate()}</b>
                  </span>
                  <div className="board-entry-copy">
                    {title(entry)}
                    <small>
                      {relative(entry.date!)}
                      {isBill(entry) ? "" : `, ${entry.category.toLowerCase()}`}
                      {entry.series_id ? ", repeats" : ""}
                      {entry.amount != null ? `. ${dollars(entry.amount)}` : ""}
                      {(entry.payment_members?.length || 0) > 1 &&
                      billShare(entry) != null
                        ? `, ${shareMoney(billShare(entry)!)} each`
                        : ""}
                      {isBill(entry)
                        ? billPaid(entry)
                          ? ", paid"
                          : entry.paid_by?.length
                            ? `, ${entry.paid_by.length} of ${entry.payment_members?.length} paid`
                            : ", nobody has paid yet"
                        : ""}
                    </small>
                  </div>
                  {/* Your own unpaid share is one tap from here; the dialog
                      still has everyone's checks and the cover-it option. */}
                  {!display &&
                    !readOnly &&
                    viewer &&
                    isBill(entry) &&
                    entry.payment_members?.includes(viewer.user_id) &&
                    !entry.paid_by?.includes(viewer.user_id) && (
                      <Button
                        className="board-pay"
                        onClick={() => onPay(entry)}
                        aria-label={`I paid my share of ${entry.title}`}
                      >
                        <Check size={14} />
                        <span>I paid</span>
                      </Button>
                    )}
                </PresenceRow>
              ))}
            </AnimatePresence>
            {!events.length && (
              <div className="board-empty">
                <Coffee size={24} />
                <p>
                  A little breathing room.
                  <br />
                  No upcoming plans.
                </p>
              </div>
            )}
          </div>
          {more(events.length, "Calendar", roomFor("event"))}
        </m.section>
        <m.section
          initial={reduced ? false : { opacity: 0.65 }}
          animate={{ opacity: 1 }}
          transition={{
            duration: reduced ? 0 : 0.3,
            delay: reduced ? 0 : 0.04,
          }}
          className="board-card chores-card paper-index"
        >
          <div className="board-card-heading">
            <h2>
              <CheckCheck size={19} />A little housework
            </h2>
            <span>
              {tasks.length} open{viewer && !display ? ", yours first" : ""}
            </span>
          </div>
          <div className="board-rows">
            {/* Capacity changes are immediate; user removals still animate out. */}
            <AnimatePresence
              key={roomFor("task")}
              initial={false}
              mode="popLayout"
            >
              {visible(tasks, roomFor("task")).map((entry) => (
                <PresenceRow
                  initial={false}
                  className="board-task"
                  key={entry.id}
                >
                  {display || readOnly ? (
                    <span className="wall-task-dot" />
                  ) : (
                    <Button
                      className="board-check"
                      onClick={() => onToggle(entry)}
                      aria-label={`Complete ${entry.title}`}
                    >
                      <Check size={18} />
                    </Button>
                  )}
                  <div className="board-entry-copy">
                    {title(entry)}
                    <small
                      className={
                        entry.date && entry.date < today ? "board-overdue" : ""
                      }
                    >
                      {entry.assignee
                        ? `${isViewer(entry.assignee) ? "You" : person(entry.assignee)}, ${asPhrase(friendly(entry.date))}`
                        : friendly(entry.date)}
                      {entry.series_id ? ", repeats" : ""}
                    </small>
                  </div>
                </PresenceRow>
              ))}
            </AnimatePresence>
            {!tasks.length && (
              <div className="board-empty">
                <CheckCheck size={24} />
                <p>
                  All caught up.
                  <br />
                  Put your feet up.
                </p>
              </div>
            )}
          </div>
          {more(tasks.length, "To-dos", roomFor("task"))}
        </m.section>
        <m.section
          initial={reduced ? false : { opacity: 0.65 }}
          animate={{ opacity: 1 }}
          transition={{
            duration: reduced ? 0 : 0.3,
            delay: reduced ? 0 : 0.08,
          }}
          className="board-card groceries-card paper-receipt"
        >
          <div className="board-card-heading">
            <h2>
              <ShoppingBasket size={19} />
              While you’re out
            </h2>
            <span>
              {shopping.length} {shopping.length === 1 ? "item" : "items"}
            </span>
          </div>
          <div className="board-rows">
            {/* Capacity changes are immediate; user removals still animate out. */}
            <AnimatePresence
              key={roomFor("request")}
              initial={false}
              mode="popLayout"
            >
              {visible(shopping, roomFor("request")).map((entry) => {
                const group = titleGroup(entry.title);
                return (
                  <PresenceRow
                    initial={false}
                    className="board-shopping"
                    key={entry.id}
                  >
                    <span className="grocery-bullet" aria-hidden="true" />
                    <div className="board-entry-copy">
                      {title(entry, group?.heading)}
                      {group && (
                        <span className="board-group">
                          {group.items.slice(0, GROUP_ROOM).map((item, i) => (
                            <span key={`${item}-${i}`}>{item}</span>
                          ))}
                          {group.items.length > GROUP_ROOM && (
                            <span className="board-group-more">
                              +{group.items.length - GROUP_ROOM} more
                            </span>
                          )}
                        </span>
                      )}
                      <small>
                        {entry.category}
                        {entry.amount != null
                          ? `, about ${dollars(entry.amount)}`
                          : ""}
                        {entry.assignee
                          ? `. ${isViewer(entry.assignee) ? "You’re" : `${person(entry.assignee)} is`} getting it`
                          : ""}
                      </small>
                    </div>
                    {!display && !readOnly && (
                      <Button
                        className="board-buy"
                        aria-label={`Mark ${entry.title} as bought`}
                        onClick={() => onToggle(entry)}
                      >
                        <Check size={17} />
                      </Button>
                    )}
                  </PresenceRow>
                );
              })}
            </AnimatePresence>
            {!shopping.length && (
              <div className="board-empty">
                <ShoppingBasket size={24} />
                <p>
                  We’re stocked up.
                  <br />
                  Nothing on the list.
                </p>
              </div>
            )}
          </div>
          {more(shopping.length, "Shopping list", roomFor("request"))}
        </m.section>
        <m.section
          initial={reduced ? false : { opacity: 0.65 }}
          animate={{ opacity: 1 }}
          transition={{
            duration: reduced ? 0 : 0.3,
            delay: reduced ? 0 : 0.12,
          }}
          className="board-card fridge-card"
        >
          <span className="board-tape" aria-hidden="true" />
          <div className="board-card-heading">
            <h2>
              <StickyNote size={19} />
              On the fridge
            </h2>
            <Heart size={18} />
          </div>
          {notes.length ? (
            <div className="fridge-stack">
              {(display ? visible(notes, roomFor("note")) : notes).map(
                (note) => (
                  <div className="fridge-message" key={note.id}>
                    <h3>
                      {display || readOnly ? (
                        note.title
                      ) : (
                        <Button onClick={() => onOpen("note", note)}>
                          {note.title}
                        </Button>
                      )}
                    </h3>
                    <p title={note.description}>{note.description}</p>
                    <span>
                      With love, {person(note.assignee || note.created_by)},{" "}
                      {activityWhen(Date.parse(note.created_at), now)}
                    </span>
                  </div>
                ),
              )}
            </div>
          ) : (
            <div className="fridge-message">
              <h3>Glad you’re home.</h3>
              <p>
                A place for little reminders, big thank-yous, and “there’s cake
                in the fridge.”
              </p>
              {!display && !readOnly && (
                <Button className="board-more" onClick={() => onOpen("note")}>
                  <Plus size={15} />
                  Leave a note
                </Button>
              )}
            </div>
          )}
          {!display && notes.length > 1 && (
            <Button
              className="board-more"
              onClick={() => onNavigate("House notes")}
            >
              All {notes.length} notes <ArrowRight size={14} />
            </Button>
          )}
          {display && notes.length > roomFor("note") && (
            <small className="wall-page-hint">
              Page {activePage + 1} of {pages}
            </small>
          )}
        </m.section>
      </div>
      {display && (
        <footer className="wall-controls">
          <span className="wall-status">
            {demo
              ? "Sample home, changes reset on reload"
              : live
                ? "Private household, updates live"
                : "Private household, updates every 15 seconds"}
          </span>
          <div className="wall-pager">
            <Button
              aria-label="Previous display page"
              disabled={pages === 1}
              onClick={() => setPage((activePage + pages - 1) % pages)}
            >
              <ChevronLeft size={17} />
            </Button>
            <span aria-live="off">
              {activePage + 1} / {pages}
            </span>
            <Button
              aria-label="Next display page"
              disabled={pages === 1}
              onClick={() => setPage((activePage + 1) % pages)}
            >
              <ChevronRight size={17} />
            </Button>
            {pages > 1 && (
              <Button
                aria-label={paused ? "Resume rotation" : "Pause rotation"}
                onClick={() => setPaused((p) => !p)}
              >
                {paused ? <Play size={16} /> : <Pause size={16} />}
              </Button>
            )}
          </div>
          <div className="wall-actions">
            <AmbientToggle />
            <Button
              onClick={() => void fullscreen()}
              aria-label={full ? "Leave full screen" : "Enter full screen"}
            >
              {full ? <Minimize size={17} /> : <Maximize size={17} />}
              <span>Full screen</span>
            </Button>
            <Button
              onClick={() => {
                if (document.fullscreenElement)
                  void document.exitFullscreen().catch(() => {});
                onExit();
              }}
            >
              <X size={17} />
              <span>Exit display</span>
            </Button>
          </div>
          {fullscreenError && (
            <p className="fullscreen-hint" role="status">
              {fullscreenError}
              <Button
                className="icon-button"
                aria-label="Dismiss fullscreen message"
                onClick={() => setFullscreenError("")}
              >
                <X size={14} />
              </Button>
            </p>
          )}
        </footer>
      )}
    </section>
  );
}
