"use client";

import { useEffect, useRef, useState } from "react";
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
  StickyNote,
  X,
} from "lucide-react";
import {
  dateKey,
  parseDate,
  type Entry,
  type Household,
  type Kind,
  type Member,
} from "@/lib/model";
import { billPaid, isBill } from "@/lib/household-actions";
import CommuteStrip from "@/components/commute-strip";

type Props = {
  household: Household;
  entries: Entry[];
  members: Member[];
  display?: boolean;
  demo: boolean;
  error: string;
  onExit: () => void;
  onOpen: (kind: Kind, entry?: Entry) => void;
  onNavigate: (
    tab: "Calendar" | "To-dos" | "Shopping list" | "House notes",
  ) => void;
  onToggle: (entry: Entry) => void;
};
const dollars = (amount: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);

export default function HomeBoard({
  household,
  entries,
  members,
  display = false,
  demo,
  error,
  onExit,
  onOpen,
  onNavigate,
  onToggle,
}: Props) {
  const [now, setNow] = useState(new Date());
  const board = useRef<HTMLElement>(null);
  const [page, setPage] = useState(0);
  const [paused, setPaused] = useState(false);
  const [limit, setLimit] = useState(3);
  const [full, setFull] = useState(false);
  const [fullscreenError, setFullscreenError] = useState("");
  const today = dateKey(now);
  const person = (id: string | null) =>
    members.find((m) => m.user_id === id)?.name || "Everyone";
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
          ? "Overdue"
          : parseDate(date).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            });
  const tasks = entries
    .filter((e) => e.kind === "task" && !e.done)
    .sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"));
  const events = entries
    .filter(
      (e) =>
        e.kind === "event" &&
        !e.done &&
        e.date &&
        (e.date >= today || (isBill(e) && !billPaid(e))),
    )
    .sort((a, b) => a.date!.localeCompare(b.date!));
  const shopping = entries
    .filter((e) => e.kind === "request" && !e.done)
    .sort(
      (a, b) => Number(b.category === "Need") - Number(a.category === "Need"),
    );
  const notes = entries.filter((e) => e.kind === "note");
  const pages = Math.max(
    1,
    Math.ceil(tasks.length / limit),
    Math.ceil(events.length / limit),
    Math.ceil(shopping.length / limit),
  );
  const activePage = page % pages;
  const visible = (items: Entry[]) =>
    items.slice(
      (activePage % Math.max(1, Math.ceil(items.length / limit))) * limit,
      ((activePage % Math.max(1, Math.ceil(items.length / limit))) + 1) * limit,
    );

  const due = tasks.filter((e) => e.date && e.date <= today).length;

  useEffect(() => {
    if (display || !board.current) return;
    const rows = board.current.querySelector(".board-rows");
    if (!rows) return;
    const resize = () =>
      setLimit(Math.max(1, Math.min(3, Math.floor(rows.clientHeight / 64))));
    const observer = new ResizeObserver(resize);
    observer.observe(rows);
    resize();
    return () => observer.disconnect();
  }, [display]);
  useEffect(() => {
    const clock = setInterval(() => setNow(new Date()), 1000 * 30);
    return () => clearInterval(clock);
  }, []);
  useEffect(() => {
    if (!display) return;
    const resize = () => {
      // The commute band sits above the grid and is hidden on small screens,
      // so measure it rather than assuming the cards own the whole viewport.
      const strip = board.current?.querySelector(".commute-strip");
      const usable =
        window.innerHeight - (strip?.getBoundingClientRect().height ?? 0);
      setLimit(usable >= 950 ? 4 : usable >= 700 ? 3 : 2);
    };
    resize();
    window.addEventListener("resize", resize);
    const syncFull = () => setFull(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", syncFull);
    return () => {
      window.removeEventListener("resize", resize);
      document.removeEventListener("fullscreenchange", syncFull);
    };
  }, [display]);
  useEffect(() => {
    if (!display || paused || pages < 2) return;
    const timer = setInterval(() => setPage((p) => (p + 1) % pages), 20000);
    return () => clearInterval(timer);
  }, [display, paused, pages]);
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
  ) =>
    !display && count > limit ? (
      <button className="board-more" onClick={() => onNavigate(tab)}>
        See all {count} <ArrowRight size={14} />
      </button>
    ) : null;
  const title = (entry: Entry) =>
    display ? (
      <strong title={entry.title}>{entry.title}</strong>
    ) : (
      <button
        className="board-entry-title"
        onClick={() => onOpen(entry.kind, entry)}
      >
        {entry.title}
      </button>
    );

  return (
    <section
      ref={board}
      className={display ? "home-board wall-display" : "home-board"}
      aria-label={display ? "Household display" : "Household noticeboard"}
    >
      <header className="board-welcome">
        <div>
          <p className="board-kicker">
            <Coffee size={16} />
            {household.name}
          </p>
          <h1>{display ? "Our home, today." : "Home sweet home."}</h1>
          <p className="board-summary">
            {due
              ? `${due} ${due === 1 ? "thing needs" : "things need"} a little love today.`
              : "Nothing urgent. Make yourself a cup of something."}
          </p>
        </div>
        {display ? (
          <div className="wall-clock">
            <time>
              {now.toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
              })}
            </time>
            <span>
              {now.toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </span>
          </div>
        ) : (
          <div className="board-quick-actions">
            <button onClick={() => onOpen("task")}>
              <Plus size={16} />
              To-do
            </button>
            <button onClick={() => onOpen("request")}>
              <ShoppingBasket size={16} />
              Item
            </button>
            <button onClick={() => onOpen("event")}>
              <CalendarDays size={16} />
              Plan
            </button>
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
        <section className="board-card plans-card">
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
            {(display ? visible(events) : events.slice(0, limit)).map(
              (entry) => (
                <div className="board-plan" key={entry.id}>
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
                      {relative(entry.date!)} · {entry.category}
                      {entry.series_id ? " · ↻" : ""}
                      {isBill(entry)
                        ? ` · ${billPaid(entry) ? "Paid" : `${entry.paid_by?.length || 0}/${entry.payment_members?.length || 0} paid`}`
                        : ""}
                      {entry.amount != null
                        ? ` · ${dollars(entry.amount)}`
                        : ""}
                    </small>
                  </div>
                </div>
              ),
            )}
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
          {more(events.length, "Calendar")}
        </section>
        <section className="board-card chores-card">
          <div className="board-card-heading">
            <h2>
              <CheckCheck size={19} />A little housework
            </h2>
            <span>{tasks.length} open</span>
          </div>
          <div className="board-rows">
            {visible(tasks).map((entry) => (
              <div className="board-task" key={entry.id}>
                {display ? (
                  <span className="wall-task-dot" />
                ) : (
                  <button
                    className="board-check"
                    onClick={() => onToggle(entry)}
                    aria-label={`Complete ${entry.title}`}
                  >
                    <Check size={18} />
                  </button>
                )}
                <div className="board-entry-copy">
                  {title(entry)}
                  <small
                    className={
                      entry.date && entry.date < today ? "board-overdue" : ""
                    }
                  >
                    {entry.assignee ? `${person(entry.assignee)} · ` : ""}
                    {friendly(entry.date)}
                    {entry.series_id ? " · ↻" : ""}
                  </small>
                </div>
              </div>
            ))}
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
          {more(tasks.length, "To-dos")}
        </section>
        <section className="board-card groceries-card">
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
            {visible(shopping).map((entry) => (
              <div className="board-shopping" key={entry.id}>
                <span className="grocery-bullet" aria-hidden="true" />
                <div className="board-entry-copy">
                  {title(entry)}
                  <small>
                    {entry.category}
                    {entry.amount != null
                      ? ` · about ${dollars(entry.amount)}`
                      : ""}
                  </small>
                </div>
                {!display && (
                  <button
                    className="board-buy"
                    aria-label={`Mark ${entry.title} as bought`}
                    onClick={() => onToggle(entry)}
                  >
                    <Check size={17} />
                  </button>
                )}
              </div>
            ))}
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
          {more(shopping.length, "Shopping list")}
        </section>
        <section className="board-card fridge-card">
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
              {notes.map((note) => (
                <div className="fridge-message" key={note.id}>
                  <h3>
                    {display ? (
                      note.title
                    ) : (
                      <button onClick={() => onOpen("note", note)}>
                        {note.title}
                      </button>
                    )}
                  </h3>
                  <p title={note.description}>{note.description}</p>
                  <span>
                    With love, {person(note.assignee || note.created_by)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="fridge-message">
              <h3>Glad you’re home.</h3>
              <p>
                A place for little reminders, big thank-yous, and “there’s cake
                in the fridge.”
              </p>
              {!display && (
                <button className="board-more" onClick={() => onOpen("note")}>
                  <Plus size={15} />
                  Leave a note
                </button>
              )}
            </div>
          )}
          {!display && notes.length > 1 && (
            <button
              className="board-more"
              onClick={() => onNavigate("House notes")}
            >
              All {notes.length} notes <ArrowRight size={14} />
            </button>
          )}
        </section>
      </div>
      {!display && (
        <div className="home-pager">
          <span>
            {pages > 1
              ? "A little more on the next page"
              : "Everything in one place"}
          </span>
          <div>
            <button
              aria-label="Previous home page"
              disabled={pages === 1}
              onClick={() => setPage((activePage + pages - 1) % pages)}
            >
              <ChevronLeft size={18} />
            </button>
            <span>
              {activePage + 1} / {pages}
            </span>
            <button
              aria-label="Next home page"
              disabled={pages === 1}
              onClick={() => setPage((activePage + 1) % pages)}
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      )}
      {display && (
        <footer className="wall-controls">
          <span className="wall-status">
            {demo
              ? "Sample home · changes reset on reload"
              : "Private household · updates every 15 seconds"}
          </span>
          <div className="wall-pager">
            <button
              aria-label="Previous display page"
              disabled={pages === 1}
              onClick={() => setPage((activePage + pages - 1) % pages)}
            >
              <ChevronLeft size={17} />
            </button>
            <span aria-live="off">
              {activePage + 1} / {pages}
            </span>
            <button
              aria-label="Next display page"
              disabled={pages === 1}
              onClick={() => setPage((activePage + 1) % pages)}
            >
              <ChevronRight size={17} />
            </button>
            {pages > 1 && (
              <button
                aria-label={paused ? "Resume rotation" : "Pause rotation"}
                onClick={() => setPaused((p) => !p)}
              >
                {paused ? <Play size={16} /> : <Pause size={16} />}
              </button>
            )}
          </div>
          <div className="wall-actions">
            <button
              onClick={() => void fullscreen()}
              aria-label={full ? "Leave fullscreen" : "Enter fullscreen"}
            >
              {full ? <Minimize size={17} /> : <Maximize size={17} />}
              <span>Full screen</span>
            </button>
            <button
              onClick={() => {
                if (document.fullscreenElement)
                  void document.exitFullscreen().catch(() => {});
                onExit();
              }}
            >
              <X size={17} />
              <span>Exit display</span>
            </button>
          </div>
          {fullscreenError && (
            <p className="fullscreen-hint" role="status">
              {fullscreenError}
            </p>
          )}
        </footer>
      )}
    </section>
  );
}
