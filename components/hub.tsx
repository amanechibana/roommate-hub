"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type CSSProperties,
} from "react";
import type { Session } from "@supabase/supabase-js";
import {
  ArrowDownToLine,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Copy,
  ExternalLink,
  Home,
  Leaf,
  LogOut,
  Monitor,
  Plus,
  Settings,
  ShieldCheck,
  ShoppingBasket,
  Sparkles,
  StickyNote,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import HomeBoard from "@/components/home-board";
import {
  calendarFile,
  dateKey,
  demoData,
  googleCalendarUrl,
  parseDate,
  safeUrl,
  type Entry,
  type Household,
  type Kind,
  type Member,
} from "@/lib/model";

type Tab =
  | "Overview"
  | "Calendar"
  | "To-dos"
  | "Shopping list"
  | "House notes"
  | "Our household";
const tabs = [
  { name: "Overview", icon: Home },
  { name: "Calendar", icon: CalendarDays },
  { name: "To-dos", icon: ClipboardList },
  { name: "Shopping list", icon: ShoppingBasket },
  { name: "House notes", icon: StickyNote },
] as const;
const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
const labels: Record<Kind, string> = {
  task: "to-do",
  event: "event",
  request: "item",
  note: "note",
};
const categories: Record<Kind, string[]> = {
  task: ["Chore", "To-do"],
  event: ["Together", "Rent", "Other"],
  request: ["Need", "Want"],
  note: ["Note"],
};

export default function Hub() {
  const [ready, setReady] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [demo, setDemo] = useState(false);
  const [household, setHousehold] = useState<Household | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [tab, setTab] = useState<Tab>("Overview");
  const [editing, setEditing] = useState<{
    kind: Kind;
    entry?: Entry;
    date?: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [invite, setInvite] = useState("");
  const [month, setMonth] = useState(new Date());
  const [agendaPage, setAgendaPage] = useState(0);
  const [agendaLimit, setAgendaLimit] = useState(3);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const agendaRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState("All");
  const [display, setDisplay] = useState(false);
  const uid = demo ? "you" : session?.user.id;
  const today = dateKey(new Date());
  const loadSequence = useRef(0);
  const weeks = Math.ceil(
    (new Date(month.getFullYear(), month.getMonth(), 1).getDay() +
      new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()) /
      7,
  );
  useEffect(() => {
    setAgendaPage(0);
  }, [month]);
  useEffect(() => {
    if (tab !== "Calendar" || !agendaRef.current) return;
    const el = agendaRef.current;
    const resize = () =>
      setAgendaLimit(Math.max(1, Math.floor(el.clientHeight / 70)));
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    resize();
    return () => observer.disconnect();
  }, [tab]);

  useEffect(() => {
    const sync = () =>
      setDisplay(
        new URLSearchParams(window.location.search).get("display") === "1",
      );
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  function changeDisplay(value: boolean) {
    const url = new URL(window.location.href);
    if (value) url.searchParams.set("display", "1");
    else url.searchParams.delete("display");
    window.history.replaceState(null, "", url);
    setDisplay(value);
    setTab("Overview");
    window.scrollTo(0, 0);
  }

  const refresh = useCallback(async () => {
    if (!supabase) return;
    const sequence = ++loadSequence.current;
    const { data: houses, error: houseError } = await supabase
      .from("households")
      .select("*")
      .limit(1);
    if (sequence !== loadSequence.current) return;
    if (houseError) {
      setError(houseError.message);
      setLoaded(true);
      return;
    }
    const house = houses?.[0] ?? null;
    setHousehold(house);
    if (!house) {
      setMembers([]);
      setEntries([]);
      setLoaded(true);
      return;
    }
    const [people, records] = await Promise.all([
      supabase
        .from("members")
        .select("*")
        .eq("household_id", house.id)
        .order("name"),
      supabase
        .from("entries")
        .select("*")
        .eq("household_id", house.id)
        .order("created_at", { ascending: false }),
    ]);
    if (sequence !== loadSequence.current) return;
    if (people.error || records.error) {
      setError(
        people.error?.message ||
          records.error?.message ||
          "Could not load your home.",
      );
      setLoaded(true);
      return;
    }
    setMembers(people.data ?? []);
    setEntries(records.data ?? []);
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!supabase) {
      const data = demoData();
      setHousehold(data.household);
      setMembers(data.members);
      setEntries(data.entries);
      setDemo(true);
      setReady(true);
      return;
    }
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) {
        ++loadSequence.current;
        setHousehold(null);
        setEntries([]);
        setMembers([]);
        setInvite("");
        setLoaded(false);
        setEditing(null);
        setError("");
      }
      setReady(true);
    });
    return () => {
      ++loadSequence.current;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session || demo) return;
    void refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 15000);
    const focus = () => void refresh();
    window.addEventListener("focus", focus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", focus);
      ++loadSequence.current;
    };
  }, [session, demo, refresh]);

  useEffect(() => {
    setFilter("All");
  }, [tab]);
  useEffect(() => {
    if (notice) {
      const timer = setTimeout(() => setNotice(""), 5000);
      return () => clearTimeout(timer);
    }
  }, [notice]);

  async function save(values: Partial<Entry>) {
    if (!household) return;
    setBusy(true);
    setError("");
    try {
      if (demo) {
        if (editing?.entry)
          setEntries((current) =>
            current.map((e) =>
              e.id === editing.entry!.id ? { ...e, ...values } : e,
            ),
          );
        else
          setEntries((current) => [
            {
              ...values,
              id: crypto.randomUUID(),
              household_id: household.id,
              created_by: uid!,
              created_at: new Date().toISOString(),
              done: false,
            } as Entry,
            ...current,
          ]);
      } else {
        const response = editing?.entry
          ? await supabase!
              .from("entries")
              .update(values)
              .eq("id", editing.entry.id)
          : await supabase!
              .from("entries")
              .insert({ ...values, household_id: household.id });
        if (response.error) throw response.error;
        await refresh();
      }
      setEditing(null);
      setNotice("All set. A little more organized.");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : (err as { message: string }).message,
      );
    } finally {
      setBusy(false);
    }
  }
  async function toggle(entry: Entry) {
    if (busy) return;
    setBusy(true);
    setError("");
    if (demo)
      setEntries((current) =>
        current.map((e) => (e.id === entry.id ? { ...e, done: !e.done } : e)),
      );
    else {
      const { error } = await supabase!
        .from("entries")
        .update({ done: !entry.done })
        .eq("id", entry.id);
      if (error) setError(error.message);
      else await refresh();
    }
    setBusy(false);
  }
  async function remove(entry: Entry) {
    if (!window.confirm(`Delete “${entry.title}” for everyone?`)) return;
    setBusy(true);
    setError("");
    if (demo) setEntries((current) => current.filter((e) => e.id !== entry.id));
    else {
      const { error } = await supabase!
        .from("entries")
        .delete()
        .eq("id", entry.id);
      if (error) {
        setError(error.message);
        setBusy(false);
        return;
      }
      await refresh();
    }
    setEditing(null);
    setBusy(false);
  }
  function exportCalendar() {
    const blob = new Blob([calendarFile(entries)], {
      type: "text/calendar;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "common-ground.ics";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice(
      "Calendar exported. Import it into Apple, Google, or Outlook Calendar.",
    );
  }
  async function makeInvite() {
    if (demo) {
      setNotice(
        "Invites become available when your shared database is connected.",
      );
      return;
    }
    setBusy(true);
    const { data, error } = await supabase!.rpc("rotate_invite");
    if (error) setError(error.message);
    else setInvite(data);
    setBusy(false);
  }
  const tasks = entries.filter((e) => e.kind === "task");
  const shopping = entries.filter((e) => e.kind === "request");
  const notes = entries.filter((e) => e.kind === "note");
  const monthEntries = entries
    .filter(
      (e) =>
        e.date?.startsWith(dateKey(month).slice(0, 7)) &&
        ["task", "event"].includes(e.kind),
    )
    .sort((a, b) => a.date!.localeCompare(b.date!));
  const person = (id: string | null) =>
    members.find((m) => m.user_id === id)?.name || "Everyone";
  const friendlyDate = (date: string | null) =>
    !date
      ? "Anytime"
      : date === today
        ? "Today"
        : parseDate(date).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          });
  const avatar = (member: Member, i: number) => (
    <span
      key={member.user_id}
      title={member.name}
      className={`avatar tone-${i % 3}`}
    >
      {member.name.slice(0, 1).toUpperCase()}
    </span>
  );
  const addButton = (kind: Kind, text = `Add ${labels[kind]}`) => (
    <button className="button small" onClick={() => setEditing({ kind })}>
      <Plus size={16} />
      {text}
    </button>
  );
  const taskRow = (entry: Entry) => (
    <div className={`task-row ${entry.done ? "completed" : ""}`} key={entry.id}>
      <button
        className="checkbox"
        disabled={busy}
        aria-label={`${entry.done ? "Reopen" : "Complete"} ${entry.title}`}
        aria-pressed={entry.done}
        onClick={() => void toggle(entry)}
      >
        {entry.done && <Check size={14} />}
      </button>
      <button
        className="entry-label"
        onClick={() => setEditing({ kind: entry.kind, entry })}
      >
        <span>{entry.title}</span>
        <small
          className={
            entry.date && entry.date < today && !entry.done ? "overdue" : ""
          }
        >
          {entry.date && entry.date < today && !entry.done ? "Overdue · " : ""}
          {friendlyDate(entry.date)} <span>·</span> {entry.category}
        </small>
      </button>
      <span className="person-tag">{person(entry.assignee)}</span>
    </div>
  );

  if (!ready)
    return (
      <main className="auth-wrap">
        <Leaf size={36} />
        <p>Making room for you…</p>
      </main>
    );
  if (!demo && !session) return <Auth />;
  if (!demo && !loaded)
    return (
      <main className="auth-wrap">
        <Leaf size={36} />
        <p>Opening your home…</p>
      </main>
    );
  if (!household) return <Onboarding error={error} refresh={refresh} />;

  const boardProps = {
    household,
    entries,
    members,
    demo,
    busy,
    error,
    onExit: () => changeDisplay(false),
    onOpen: (kind: Kind, entry?: Entry) => setEditing({ kind, entry }),
    onNavigate: setTab,
    onToggle: (entry: Entry) => void toggle(entry),
  };
  if (display)
    return (
      <main>
        <HomeBoard {...boardProps} display />
      </main>
    );

  return (
    <div
      className={`app-shell ${tab === "Overview" || tab === "Calendar" ? "fitted-app" : ""}`}
    >
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="Common Ground home">
          <span className="brand-icon">
            <Leaf size={24} />
          </span>
          <span>
            common
            <br />
            ground<span className="brand-dot">.</span>
          </span>
        </a>
        <div className="house-selector">
          <span className="house-icon">
            <Home size={17} />
          </span>
          <div>
            <strong>{household.name}</strong>
            <small>Our little corner of the world</small>
          </div>
        </div>
        <span className="nav-label">A LITTLE MORE TOGETHER</span>
        <nav aria-label="Main navigation">
          {tabs.map(({ name, icon: Icon }) => (
            <button
              key={name}
              className={tab === name ? "active" : ""}
              aria-current={tab === name ? "page" : undefined}
              onClick={() => setTab(name)}
            >
              <Icon size={19} />
              <span>{name}</span>
              {name === "Shopping list" && (
                <span className="nav-count">
                  {shopping.filter((e) => !e.done).length}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <Sparkles size={20} />
            <p>
              A happy home is
              <br />a team effort.
            </p>
            <span>You’ve got this, together.</span>
          </div>
          <button
            className={`settings-link ${tab === "Our household" ? "selected" : ""}`}
            onClick={() => setTab("Our household")}
          >
            <Settings size={18} /> Our household
          </button>
          <div className="sidebar-profile">
            <span className="avatar tone-0">
              {person(uid || null).slice(0, 1)}
            </span>
            <div>
              <strong>{person(uid || null)}</strong>
              <small>{demo ? "Exploring the demo" : "Right at home"}</small>
            </div>
            {!demo && (
              <button
                aria-label="Sign out"
                className="icon-button"
                onClick={async () => {
                  const result = await supabase!.auth.signOut();
                  if (result.error) setError(result.error.message);
                }}
              >
                <LogOut size={17} />
              </button>
            )}
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span>
            <Home size={15} /> Our home <span className="slash">/</span>{" "}
            <strong>{tab}</strong>
          </span>
          <div>
            <button
              className="display-toggle"
              aria-label="Display mode"
              onClick={() => changeDisplay(true)}
            >
              <Monitor size={17} />
              <span>Display mode</span>
            </button>
            <span className="private-label">
              <ShieldCheck size={14} />
              {demo ? "Demo home" : "Private household"}
            </span>
            <button
              className="icon-button avatar-stack"
              aria-label="Open household settings"
              onClick={() => setTab("Our household")}
            >
              {members.map(avatar)}
            </button>
            {!demo && (
              <button
                className="icon-button"
                aria-label="Sign out of household"
                onClick={async () => {
                  const result = await supabase!.auth.signOut();
                  if (result.error) setError(result.error.message);
                }}
              >
                <LogOut size={16} />
              </button>
            )}
          </div>
        </header>
        <main
          className={`content ${tab === "Overview" ? "home-content" : tab === "Calendar" ? "calendar-content" : ""}`}
        >
          {demo && (
            <div className="demo-banner">
              <span>
                <Sparkles size={15} /> Sample household · Try everything.
                Changes last until you reload.
              </span>
              <button onClick={() => setTab("Our household")}>
                Connect your home <ArrowRight size={14} />
              </button>
            </div>
          )}
          {error && (
            <div className="error" role="alert">
              {error}
              <button
                className="icon-button"
                aria-label="Dismiss error"
                onClick={() => setError("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {tab !== "Overview" && (
            <div className="page-heading">
              <div>
                <p className="eyebrow">
                  {new Date()
                    .toLocaleDateString("en-US", {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                    })
                    .toUpperCase()}
                </p>
                <h1>{tab}</h1>
                <p className="subtitle">
                  {
                    {
                      Overview:
                        "Less coordinating. More living. Here’s what’s happening at home.",
                      Calendar:
                        "Make room for the plans, the practical stuff, and each other.",
                      "To-dos": "Many hands. A lighter load.",
                      "Shopping list":
                        "The things we need. The things that make it home.",
                      "House notes":
                        "Little reminders for the people you live with.",
                      "Our household":
                        "Your people, your space, your shared rhythm.",
                    }[tab]
                  }
                </p>
              </div>
              {tab !== "Our household" &&
                addButton(
                  tab === "Calendar"
                    ? "event"
                    : tab === "Shopping list"
                      ? "request"
                      : tab === "House notes"
                        ? "note"
                        : "task",
                )}
            </div>
          )}

          {tab === "Overview" && <HomeBoard {...boardProps} />}

          {tab === "Calendar" && (
            <section className="panel calendar-panel">
              <div className="panel-heading">
                <div className="month-control">
                  <button
                    className="icon-button"
                    aria-label="Previous month"
                    onClick={() =>
                      setMonth(
                        new Date(month.getFullYear(), month.getMonth() - 1, 1),
                      )
                    }
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <h2>
                    {month.toLocaleDateString("en-US", {
                      month: "long",
                      year: "numeric",
                    })}
                  </h2>
                  <button
                    className="icon-button"
                    aria-label="Next month"
                    onClick={() =>
                      setMonth(
                        new Date(month.getFullYear(), month.getMonth() + 1, 1),
                      )
                    }
                  >
                    <ChevronRight size={20} />
                  </button>
                </div>
                <div className="actions">
                  <button
                    className="button secondary small"
                    onClick={() => setMonth(new Date())}
                  >
                    Today
                  </button>
                  <button
                    className="button secondary small"
                    onClick={exportCalendar}
                  >
                    <ArrowDownToLine size={16} /> Export .ics
                  </button>
                </div>
              </div>
              <p className="calendar-help desktop-calendar-help">
                All-day plans and dated chores. Select a day to add a plan, or
                an entry to edit it.
              </p>
              <div
                className="mobile-agenda"
                ref={agendaRef}
                aria-label="This month’s agenda"
              >
                {monthEntries
                  .slice(
                    (agendaPage %
                      Math.max(
                        1,
                        Math.ceil(monthEntries.length / agendaLimit),
                      )) *
                      agendaLimit,
                    ((agendaPage %
                      Math.max(
                        1,
                        Math.ceil(monthEntries.length / agendaLimit),
                      )) +
                      1) *
                      agendaLimit,
                  )
                  .map((entry) => (
                    <button
                      className="agenda-entry"
                      key={entry.id}
                      onClick={() => setEditing({ kind: entry.kind, entry })}
                    >
                      <span className="board-date">
                        <small>
                          {parseDate(entry.date!).toLocaleDateString("en-US", {
                            weekday: "short",
                          })}
                        </small>
                        <b>{parseDate(entry.date!).getDate()}</b>
                      </span>
                      <span>
                        <strong>
                          {entry.done ? "✓ " : ""}
                          {entry.title}
                        </strong>
                        <small>
                          {entry.category} · {person(entry.assignee)}
                        </small>
                      </span>
                      <ChevronRight size={17} />
                    </button>
                  ))}
                {!monthEntries.length && (
                  <Empty text="No plans this month. Add something to look forward to." />
                )}
              </div>
              <div className="agenda-pager">
                <button
                  aria-label="Previous agenda page"
                  disabled={agendaPage === 0}
                  onClick={() => setAgendaPage((p) => Math.max(0, p - 1))}
                >
                  <ChevronLeft size={18} />
                </button>
                <span>
                  {Math.min(
                    agendaPage + 1,
                    Math.max(1, Math.ceil(monthEntries.length / agendaLimit)),
                  )}{" "}
                  / {Math.max(1, Math.ceil(monthEntries.length / agendaLimit))}
                </span>
                <button
                  aria-label="Next agenda page"
                  disabled={
                    (agendaPage + 1) * agendaLimit >= monthEntries.length
                  }
                  onClick={() => setAgendaPage((p) => p + 1)}
                >
                  <ChevronRight size={18} />
                </button>
              </div>
              <div className="calendar-scroll">
                <div
                  className="calendar-grid"
                  style={{ "--weeks": weeks } as CSSProperties}
                >
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                    (day) => (
                      <div className="weekday" key={day}>
                        {day}
                      </div>
                    ),
                  )}
                  {Array.from(
                    {
                      length:
                        Math.ceil(
                          (new Date(
                            month.getFullYear(),
                            month.getMonth(),
                            1,
                          ).getDay() +
                            new Date(
                              month.getFullYear(),
                              month.getMonth() + 1,
                              0,
                            ).getDate()) /
                            7,
                        ) * 7,
                    },
                    (_, i) => {
                      const date = new Date(
                        month.getFullYear(),
                        month.getMonth(),
                        1 -
                          new Date(
                            month.getFullYear(),
                            month.getMonth(),
                            1,
                          ).getDay() +
                          i,
                      );
                      const key = dateKey(date);
                      const dayEntries = entries.filter(
                        (e) =>
                          e.date === key && ["task", "event"].includes(e.kind),
                      );
                      return (
                        <div
                          className={`calendar-cell ${date.getMonth() !== month.getMonth() ? "outside" : ""} ${key === today ? "is-today" : ""}`}
                          key={key}
                        >
                          <button
                            className="day-number"
                            aria-label={`Add event on ${key}`}
                            onClick={() =>
                              setEditing({ kind: "event", date: key })
                            }
                          >
                            {date.getDate()}
                          </button>
                          {dayEntries.length > 1 && (
                            <button
                              className="day-more"
                              aria-label={`Show all ${dayEntries.length} entries on ${key}`}
                              onClick={() => setSelectedDay(key)}
                            >
                              +{dayEntries.length - 1}
                            </button>
                          )}
                          {dayEntries.slice(0, 1).map((entry) => (
                            <button
                              key={entry.id}
                              className={`calendar-event ${entry.category === "Rent" ? "rent" : ""} ${entry.done ? "completed-event" : ""}`}
                              onClick={() =>
                                setEditing({ kind: entry.kind, entry })
                              }
                            >
                              {entry.done ? "✓ " : ""}
                              {entry.title}
                            </button>
                          ))}
                        </div>
                      );
                    },
                  )}
                </div>
              </div>
            </section>
          )}

          {tab === "To-dos" && (
            <section className="panel">
              <div className="panel-heading">
                <div className="filters">
                  {["All", "Mine", "Open", "Done"].map((value) => (
                    <button
                      key={value}
                      aria-pressed={filter === value}
                      className={filter === value ? "active" : ""}
                      onClick={() => setFilter(value)}
                    >
                      {value}
                    </button>
                  ))}
                </div>
                <span className="subtle">
                  {tasks.filter((e) => e.done).length} of {tasks.length} done
                </span>
              </div>
              {tasks
                .filter(
                  (e) =>
                    filter === "All" ||
                    (filter === "Mine" && e.assignee === uid) ||
                    (filter === "Open" && !e.done) ||
                    (filter === "Done" && e.done),
                )
                .map(taskRow)}
              {!tasks.filter(
                (e) =>
                  filter === "All" ||
                  (filter === "Mine" && e.assignee === uid) ||
                  (filter === "Open" && !e.done) ||
                  (filter === "Done" && e.done),
              ).length && (
                <Empty text="Nothing here. A little breathing room." />
              )}
              <button
                className="add-row"
                onClick={() => setEditing({ kind: "task" })}
              >
                <Plus size={16} /> Add a to-do
              </button>
            </section>
          )}

          {tab === "Shopping list" && (
            <>
              <div className="list-toolbar">
                <div className="filters">
                  {["All", "Need", "Want", "Bought"].map((value) => (
                    <button
                      key={value}
                      aria-pressed={filter === value}
                      className={filter === value ? "active" : ""}
                      onClick={() => setFilter(value)}
                    >
                      {value}
                    </button>
                  ))}
                </div>
                <span className="subtle">
                  Estimated total ·{" "}
                  <strong>
                    {money(
                      shopping
                        .filter((e) => !e.done)
                        .reduce((sum, e) => sum + Number(e.amount || 0), 0),
                    )}
                  </strong>
                </span>
              </div>
              <div className="shopping-grid">
                {shopping
                  .filter((e) =>
                    filter === "Bought"
                      ? e.done
                      : !e.done && (filter === "All" || e.category === filter),
                  )
                  .map((entry, i) => (
                    <article className="shopping-card" key={entry.id}>
                      <div className={`shopping-art item-art-${i % 3}`}>
                        <ShoppingBasket size={52} strokeWidth={1} />
                        <span className="pill">{entry.category}</span>
                      </div>
                      <div className="shopping-copy">
                        <button
                          className="entry-label"
                          onClick={() => setEditing({ kind: "request", entry })}
                        >
                          <h2>{entry.title}</h2>
                        </button>
                        <p>
                          {entry.description ||
                            "A little something for our shared space."}
                        </p>
                        <div className="shopping-price">
                          <strong>
                            {entry.amount != null
                              ? money(entry.amount)
                              : "Price not set"}
                          </strong>
                          {safeUrl(entry.url) && (
                            <a
                              href={safeUrl(entry.url)!}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              View item <ExternalLink size={14} />
                            </a>
                          )}
                        </div>
                        <button
                          className={`button ${entry.done ? "secondary" : ""}`}
                          disabled={busy}
                          onClick={() => void toggle(entry)}
                        >
                          <Check size={16} />
                          {entry.done ? "Bought · Undo" : "Mark as bought"}
                        </button>
                      </div>
                    </article>
                  ))}
              </div>
              {!shopping.filter((e) =>
                filter === "Bought"
                  ? e.done
                  : !e.done && (filter === "All" || e.category === filter),
              ).length && (
                <Empty text="Nothing on this list yet. Add something for your home." />
              )}
            </>
          )}

          {tab === "House notes" && (
            <div className="notes-grid">
              {notes.map((entry) => (
                <article className="notice-board" key={entry.id}>
                  <span className="tape" />
                  <button
                    className="note-preview"
                    onClick={() => setEditing({ kind: "note", entry })}
                  >
                    <h3>{entry.title}</h3>
                    <p>{entry.description}</p>
                    <span>— {person(entry.assignee || entry.created_by)}</span>
                  </button>
                </article>
              ))}
              {!notes.length && (
                <Empty text="Your fridge is a blank canvas. Leave a note." />
              )}
            </div>
          )}

          {tab === "Our household" && (
            <div className="settings-grid">
              <section className="panel settings-panel">
                <h2>
                  <Users size={20} /> {household.name}
                </h2>
                <p className="subtle">A home is better with good people.</p>
                {members.map((member, i) => (
                  <div className="member-row" key={member.user_id}>
                    {avatar(member, i)}
                    <strong>{member.name}</strong>
                    <span className="subtle">
                      {member.user_id === household.owner_id
                        ? "Owner"
                        : "Housemate"}
                    </span>
                  </div>
                ))}
                {uid === household.owner_id && (
                  <>
                    <h3>Invite a housemate</h3>
                    <p className="subtle">
                      Generate a private invite code valid for 7 days. A new
                      code replaces the previous one. Your housemate signs in
                      with their own email, then joins using this code.
                    </p>
                    <button
                      className="button secondary"
                      disabled={busy}
                      onClick={() => void makeInvite()}
                    >
                      <Plus size={16} /> Generate invite code
                    </button>
                    {invite && (
                      <div className="invite-box">
                        <code>{invite}</code>
                        <button
                          className="icon-button"
                          aria-label="Copy invite code"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(invite);
                              setNotice(
                                "Invite copied. Share it privately with your housemate.",
                              );
                            } catch {
                              setError(
                                "Could not copy. Select the code and copy it manually.",
                              );
                            }
                          }}
                        >
                          <Copy size={17} />
                        </button>
                      </div>
                    )}
                  </>
                )}
              </section>
              <section className="panel settings-panel">
                <h2>
                  <ShieldCheck size={20} />{" "}
                  {demo ? "Make yourself at home" : "Private by design"}
                </h2>
                <p>
                  {demo
                    ? "You’re exploring a sample home. Connect Supabase to enable email sign-in and save your household across devices."
                    : "Only signed-in members of your household can access your shared records. Changes from housemates refresh every 15 seconds while this page is visible."}
                </p>
                {demo && (
                  <p className="subtle">
                    Setup instructions are in this project’s README: create a
                    Supabase project, apply the included database migration, and
                    add your project URL and publishable key.
                  </p>
                )}
                <h3>Bring your calendar along</h3>
                <p className="subtle">
                  Download your dated chores and events for Apple Calendar,
                  Google Calendar, or Outlook.
                </p>
                <button className="button secondary" onClick={exportCalendar}>
                  <ArrowDownToLine size={16} /> Export calendar
                </button>
                <h3>Shopping, with fewer tabs</h3>
                <p className="subtle">
                  Paste an Amazon or other store’s product link when adding an
                  item. Prices are entered manually; account linking and live
                  prices aren’t connected.
                </p>
              </section>
              <section className="panel settings-panel ideas-panel">
                <h2>
                  <Sparkles size={20} /> Room to grow
                </h2>
                <div className="idea-grid">
                  {[
                    [
                      "Split the little things",
                      "Shared expenses, balances, and who paid for the groceries.",
                    ],
                    [
                      "A fair chore rotation",
                      "Recurring chores that automatically take turns.",
                    ],
                    [
                      "What’s for dinner?",
                      "A meal plan and shared pantry, linked to the shopping list.",
                    ],
                    [
                      "The house handbook",
                      "Wi-Fi details, bin days, landlord contacts, and appliance manuals.",
                    ],
                    [
                      "A quick house vote",
                      "Pick a movie, a new sofa, or the next house dinner.",
                    ],
                    [
                      "Give each other a heads-up",
                      "Guest visits, quiet hours, and work-from-home plans.",
                    ],
                  ].map(([title, text]) => (
                    <div key={title}>
                      <h3>{title}</h3>
                      <p>{text}</p>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}
          <footer>
            <span>Made for the place you share.</span>
            <Leaf size={15} />
            <span>A little more together.</span>
          </footer>
        </main>
      </div>
      {notice && (
        <div className="toast" role="status">
          <Check size={17} />
          {notice}
        </div>
      )}
      {selectedDay && (
        <DayDialog
          date={selectedDay}
          entries={entries.filter(
            (e) => e.date === selectedDay && ["task", "event"].includes(e.kind),
          )}
          onClose={() => setSelectedDay(null)}
          onOpen={(entry) => {
            setSelectedDay(null);
            setEditing({ kind: entry.kind, entry });
          }}
          onAdd={() => {
            setEditing({ kind: "event", date: selectedDay });
            setSelectedDay(null);
          }}
        />
      )}
      {editing && (
        <EntryDialog
          editing={editing}
          members={members}
          busy={busy}
          error={error}
          onClose={() => {
            if (!busy) {
              setEditing(null);
              setError("");
            }
          }}
          onSave={save}
          onDelete={remove}
        />
      )}
    </div>
  );
}

function DayDialog({
  date,
  entries,
  onClose,
  onOpen,
  onAdd,
}: {
  date: string;
  entries: Entry[];
  onClose: () => void;
  onOpen: (entry: Entry) => void;
  onAdd: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="entry-dialog"
      aria-labelledby="day-title"
      onCancel={onClose}
    >
      <div className="dialog-heading">
        <h2 id="day-title">
          {parseDate(date).toLocaleDateString("en-US", {
            month: "long",
            day: "numeric",
          })}
        </h2>
        <button
          className="icon-button"
          aria-label="Close day"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      {entries.map((entry) => (
        <button
          className="agenda-entry"
          key={entry.id}
          onClick={() => onOpen(entry)}
        >
          {entry.title}
          <ChevronRight size={16} />
        </button>
      ))}
      <button className="button" onClick={onAdd}>
        <Plus size={16} />
        Add event
      </button>
    </dialog>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="empty">
      <Leaf size={25} />
      <p>{text}</p>
    </div>
  );
}

function EntryDialog({
  editing,
  members,
  busy,
  error,
  onClose,
  onSave,
  onDelete,
}: {
  editing: { kind: Kind; entry?: Entry; date?: string };
  members: Member[];
  busy: boolean;
  error: string;
  onClose: () => void;
  onSave: (values: Partial<Entry>) => Promise<void>;
  onDelete: (entry: Entry) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [kind, setKind] = useState<Kind>(editing.kind);
  const [validation, setValidation] = useState("");
  const entry = editing.entry;
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const title = String(data.get("title") || "").trim();
    const url = String(data.get("url") || "").trim();
    if (!title) {
      setValidation("Give this a title first.");
      return;
    }
    if (url && !safeUrl(url)) {
      setValidation("Use a full http or https product link.");
      return;
    }
    setValidation("");
    await onSave({
      ...(entry ? {} : { kind }),
      title,
      description: String(data.get("description") || "").trim(),
      category: String(data.get("category") || categories[kind][0]),
      date: String(data.get("date") || "") || null,
      assignee: String(data.get("assignee") || "") || null,
      amount: data.get("amount") ? Number(data.get("amount")) : null,
      url,
    });
  }
  return (
    <dialog
      ref={dialog}
      className="entry-dialog"
      aria-labelledby="dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="dialog-heading">
        <div>
          <p className="eyebrow">A LITTLE MORE ORGANIZED</p>
          <h2 id="dialog-title">
            {entry ? "Edit" : "Add"} {labels[kind]}
          </h2>
        </div>
        <button
          className="icon-button"
          aria-label="Close dialog"
          disabled={busy}
          onClick={onClose}
        >
          <X size={21} />
        </button>
      </div>
      <form onSubmit={submit}>
        {!entry && (
          <div className="filters kind-picker">
            {(["task", "event", "request", "note"] as Kind[]).map((value) => (
              <button
                type="button"
                key={value}
                className={kind === value ? "active" : ""}
                onClick={() => setKind(value)}
              >
                {labels[value]}
              </button>
            ))}
          </div>
        )}
        <label>
          What’s on your mind?
          <input
            name="title"
            placeholder={
              kind === "request"
                ? "e.g. Coffee for the kitchen"
                : "Give it a little title"
            }
            defaultValue={entry?.title}
            maxLength={160}
            required
            autoFocus
          />
        </label>
        <label>
          A little more detail
          <textarea
            name="description"
            placeholder="Anything your housemates should know…"
            defaultValue={entry?.description}
            maxLength={2000}
            rows={3}
          />
        </label>
        <div className="form-grid">
          <label>
            Category
            <select
              name="category"
              key={kind}
              defaultValue={entry?.category || categories[kind][0]}
            >
              {categories[kind].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label>
            {kind === "note" ? "From" : "Who’s on it?"}
            <select name="assignee" defaultValue={entry?.assignee || ""}>
              <option value="">Everyone</option>
              {members.map((member) => (
                <option value={member.user_id} key={member.user_id}>
                  {member.name}
                </option>
              ))}
            </select>
          </label>
          {kind !== "note" && (
            <label>
              {kind === "event" ? "Date" : "Due date (optional)"}
              <input
                name="date"
                type="date"
                required={kind === "event"}
                defaultValue={entry?.date || editing.date || ""}
              />
            </label>
          )}
          {["event", "request"].includes(kind) && (
            <label>
              Amount in USD (optional)
              <input
                name="amount"
                type="number"
                min="0"
                max="99999999.99"
                step="0.01"
                placeholder="0.00"
                defaultValue={entry?.amount ?? ""}
              />
            </label>
          )}
        </div>
        {kind === "request" && (
          <label>
            Product link (optional)
            <input
              name="url"
              type="url"
              maxLength={2048}
              placeholder="https://www.amazon.com/…"
              defaultValue={entry?.url}
            />
          </label>
        )}
        {(error || validation) && (
          <p className="error" role="alert">
            {validation || error}
          </p>
        )}
        {entry?.date && ["event", "task"].includes(entry.kind) && (
          <a
            className="calendar-link"
            href={googleCalendarUrl(entry)}
            target="_blank"
            rel="noopener noreferrer"
          >
            <CalendarDays size={16} /> Add saved event to Google Calendar{" "}
            <ExternalLink size={13} />
          </a>
        )}
        <div className="dialog-actions">
          {entry && (
            <button
              type="button"
              className="icon-button danger"
              aria-label="Delete entry"
              disabled={busy}
              onClick={() => void onDelete(entry)}
            >
              <Trash2 size={18} />
            </button>
          )}
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="button" disabled={busy}>
            {busy ? "Saving…" : "Save to our home"}
            <ArrowRight size={16} />
          </button>
        </div>
      </form>
    </dialog>
  );
}

function Auth() {
  const [sent, setSent] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    const result = sent
      ? await supabase!.auth.verifyOtp({
          email,
          token: String(data.get("code")).trim(),
          type: "email",
        })
      : await supabase!.auth.signInWithOtp({ email });
    if (result.error) setError(result.error.message);
    else setSent(true);
    setBusy(false);
  }
  return (
    <main className="auth-wrap">
      <a href="/" className="auth-brand">
        <Leaf /> common ground.
      </a>
      <section className="auth-card">
        <span className="stat-icon sage">
          <Home size={26} />
        </span>
        <p className="eyebrow">YOUR SHARED LIFE, IN ONE PLACE</p>
        <h1>
          A good place
          <br />
          to come home to.
        </h1>
        <p className="subtitle">
          {sent
            ? "Check your email for a sign-in code."
            : "Your people, your plans, your little corner of the world."}
        </p>
        <form onSubmit={submit}>
          {!sent ? (
            <label>
              Your email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
              />
            </label>
          ) : (
            <label>
              Code sent to {email}
              <input
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6,10}"
                maxLength={10}
                required
                autoFocus
                placeholder="Your sign-in code"
              />
            </label>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="button" disabled={busy}>
            {busy
              ? "One moment…"
              : sent
                ? "Come on in"
                : "Email me a sign-in code"}
            <ArrowRight size={17} />
          </button>
          {sent && (
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() => {
                setSent(false);
                setError("");
              }}
            >
              Use another email or resend
            </button>
          )}
        </form>
        <p className="auth-footnote">
          <ShieldCheck size={15} /> Your household is invite-only. No password
          to remember.
        </p>
      </section>
    </main>
  );
}

function Onboarding({
  error: loadError,
  refresh,
}: {
  error: string;
  refresh: () => Promise<void>;
}) {
  const [joining, setJoining] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    const result = await supabase!.rpc(
      joining ? "join_household" : "create_household",
      {
        member_name: String(data.get("name")).trim(),
        ...(joining
          ? { invite_code: String(data.get("house")).trim() }
          : { house_name: String(data.get("house")).trim() }),
      },
    );
    if (result.error) setError(result.error.message);
    else await refresh();
    setBusy(false);
  }
  return (
    <main className="auth-wrap">
      <a href="/" className="auth-brand">
        <Leaf /> common ground.
      </a>
      <section className="auth-card">
        <h1>
          Make yourself
          <br />
          <em>at home.</em>
        </h1>
        <p className="subtitle">Start a household or join your people.</p>
        <div className="filters">
          <button
            className={!joining ? "active" : ""}
            onClick={() => setJoining(false)}
          >
            Create a home
          </button>
          <button
            className={joining ? "active" : ""}
            onClick={() => setJoining(true)}
          >
            Join a home
          </button>
        </div>
        <form onSubmit={submit}>
          <label>
            What should we call you?
            <input
              name="name"
              required
              maxLength={50}
              placeholder="Your name"
            />
          </label>
          <label>
            {joining ? "Household invite code" : "Give your home a name"}
            <input
              name="house"
              key={String(joining)}
              required
              maxLength={joining ? 32 : 80}
              minLength={joining ? 32 : 1}
              placeholder={
                joining
                  ? "Paste the code from your housemate"
                  : "e.g. The Maple House"
              }
            />
          </label>
          {(error || loadError) && (
            <p className="error" role="alert">
              {error || loadError}
            </p>
          )}
          <button className="button" disabled={busy}>
            {busy
              ? "Making room…"
              : joining
                ? "Join our home"
                : "Create our home"}
            <ArrowRight size={17} />
          </button>
        </form>
        <button
          className="text-button"
          onClick={async () => {
            const result = await supabase!.auth.signOut();
            if (result.error) setError(result.error.message);
          }}
        >
          Sign out
        </button>
      </section>
    </main>
  );
}
