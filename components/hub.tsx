"use client";

import styles from "./hub.module.css";

import { m } from "motion/react";
import { Button } from "@/components/ui/button";
import { AnimatedCheck } from "@/components/ui/animated-check";
import { useHouseMotion } from "@/components/ui/motion-provider";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type CSSProperties,
} from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  ExternalLink,
  Home,
  Leaf,
  LogOut,
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
import { hasDatabase, homeRequest } from "@/lib/home-client";
import { DisplayButton, AmbientToggle } from "@/components/ui/display-button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import BillChecks from "@/components/bill-checks";
import {
  UNDO_DURATION,
  billPaid,
  isBill,
  markPaid,
  occurrenceAssignee,
  editEntries,
} from "@/lib/household-actions";
import HomeBoard from "@/components/home-board";
import {
  calendarFile,
  dateKey,
  demoData,
  googleCalendarUrl,
  parseDate,
  safeUrl,
  seriesDates,
  type Entry,
  type Household,
  type Kind,
  type Member,
  type Repeat,
} from "@/lib/model";

type SaveValues = Partial<Entry> & {
  repeat?: Repeat;
  repeat_until?: string;
  rotation_partner?: string;
  paid?: boolean;
  undo_token?: string;
  scope?: "series";
};

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
  event: ["Together", "Rent", "Bill", "Other"],
  request: ["Need", "Want"],
  note: ["Note"],
};

export default function Hub() {
  const { reduced } = useHouseMotion();
  const [ready, setReady] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [session, setSession] = useState(false);
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
  const [undoDeletes, setUndoDeletes] = useState<
    { token: string; entries: Entry[]; expires: number }[]
  >([]);
  const [month, setMonth] = useState(new Date());
  const [agendaPage, setAgendaPage] = useState(0);
  const [agendaLimit, setAgendaLimit] = useState(3);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const agendaRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState("All");
  const [display, setDisplay] = useState(false);
  const [identity, setIdentity] = useState<string | null>(null);
  const [choosingPerson, setChoosingPerson] = useState(false);
  const uid = demo ? identity || "you" : identity;
  const pending = useRef(0);
  const writes = useRef(Promise.resolve());
  const needsRecovery = useRef(false);
  const sessionGeneration = useRef(0);
  const savedIds = useRef(new Map<string, string>());
  const savedSeriesIds = useRef(new Map<string, string>());
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

  const clearSession = useCallback(() => {
    ++loadSequence.current;
    ++sessionGeneration.current;
    setIdentity(null);
    setNotice("");
    setUndoDeletes([]);
    needsRecovery.current = false;
    setSession(false);
    setHousehold(null);
    setEntries([]);
    setMembers([]);
    setLoaded(false);
    setEditing(null);
    setSelectedDay(null);
    setError("");
    setReady(true);
  }, []);
  const refresh = useCallback(async (quiet = false) => {
    if (pending.current) return;
    const sequence = ++loadSequence.current;
    try {
      const data = await homeRequest("/api/home");
      if (sequence !== loadSequence.current) return;
      setHousehold(data.household);
      setMembers(data.members);
      setEntries(data.entries);
      setIdentity(data.member_id ?? null);
      setError("");
    } catch (err) {
      if (!quiet && sequence === loadSequence.current)
        setError((err as Error).message);
    } finally {
      if (sequence === loadSequence.current) setLoaded(true);
    }
  }, []);
  useEffect(() => {
    if (!hasDatabase) {
      const data = demoData();
      setHousehold(data.household);
      setMembers(data.members);
      setEntries(data.entries);
      setDemo(true);
      setReady(true);
      return;
    }
    let active = true;
    homeRequest("/api/session")
      .then((data) => {
        if (active) {
          setSession(data.authenticated);
          setReady(true);
        }
      })
      .catch(() => {
        if (active) setReady(true);
      });
    window.addEventListener("household-signed-out", clearSession);
    return () => {
      active = false;
      ++loadSequence.current;
      window.removeEventListener("household-signed-out", clearSession);
    };
  }, [clearSession]);
  async function signOut() {
    try {
      await homeRequest("/api/session", "DELETE");
      clearSession();
    } catch (err) {
      setError((err as Error).message);
    }
  }

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

  useEffect(() => {
    if (!undoDeletes.length) return;
    const next = Math.min(...undoDeletes.map((item) => item.expires));
    const timer = setTimeout(
      () =>
        setUndoDeletes((current) =>
          current.filter((item) => item.expires > Date.now()),
        ),
      Math.max(0, next - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [undoDeletes]);

  // Serialize writes, but never block interaction. Polls cannot overwrite a
  // pending optimistic change, including a poll started before the click.
  function persist(
    operation: string,
    payload: SaveValues,
    copies: Entry[] = [],
  ) {
    if (demo) return;
    ++loadSequence.current;
    ++pending.current;
    const generation = sessionGeneration.current;
    writes.current = writes.current
      .then(async () => {
        if (generation !== sessionGeneration.current) return;
        try {
          const result = await homeRequest("/api/home", "POST", {
            operation,
            payload: {
              ...payload,
              ...(payload.id
                ? { id: savedIds.current.get(payload.id) || payload.id }
                : {}),
            },
          });
          if (generation !== sessionGeneration.current) return;
          if (copies.length) {
            const saved: Entry[] = result.entries;
            if (!Array.isArray(saved) || saved.length !== copies.length)
              throw new Error("Missing saved entries");
            copies.forEach((copy, i) => {
              savedIds.current.set(copy.id, saved[i].id);
              if (copy.series_id && saved[i].series_id)
                savedSeriesIds.current.set(copy.series_id, saved[i].series_id!);
            });
            setEntries((current) =>
              current.map((entry) => {
                const i = copies.findIndex((copy) => copy.id === entry.id);
                return i < 0
                  ? entry
                  : {
                      ...entry,
                      id: saved[i].id,
                      series_id: saved[i].series_id,
                    };
              }),
            );
          }
          if (operation === "restore" && Array.isArray(result.entries)) {
            setEntries((current) =>
              current.map((entry) => {
                const saved = (result.entries as Entry[]).find(
                  (e) => e.id === (savedIds.current.get(entry.id) || entry.id),
                );
                return saved
                  ? { ...entry, id: saved.id, series_id: saved.series_id }
                  : entry;
              }),
            );
          }
        } catch {
          if (operation === "delete")
            setUndoDeletes((current) =>
              current.filter((item) => item.token !== payload.undo_token),
            );
          if (generation !== sessionGeneration.current) return;
          needsRecovery.current = true;
          setNotice("Couldn’t save. Refreshing your home…");
        }
      })
      .finally(() => {
        --pending.current;
        if (!pending.current && needsRecovery.current) {
          needsRecovery.current = false;
          if (generation === sessionGeneration.current) void refresh(true);
        }
      });
  }
  async function save(values: SaveValues) {
    if (!household) return;
    const entry = editing?.entry
      ? entries.find(
          (e) =>
            e.id ===
            (savedIds.current.get(editing.entry!.id) || editing.entry!.id),
        ) || editing.entry
      : undefined;
    setError("");
    if (entry) {
      const { scope, ...rest } = values;
      setEntries((current) => {
        const updated = editEntries(current, entry, rest, scope === "series");
        return updated.map((e) => {
          const before = current.find((old) => old.id === e.id)!;
          if (!isBill(before) && isBill(e))
            return {
              ...e,
              payment_members: members
                .filter((m) => m.name !== "Housemates")
                .map((m) => m.user_id),
              paid_by: [],
            };
          if (isBill(before) && !isBill(e))
            return { ...e, payment_members: [], paid_by: [] };
          return e;
        });
      });
      persist("update", { ...values, id: entry.id });
    } else {
      const {
        repeat,
        repeat_until,
        rotation_partner,
        scope: _scope,
        ...rest
      } = values;
      const sid = crypto.randomUUID();
      const dates =
        repeat && repeat_until && rest.date
          ? seriesDates(rest.date, repeat, repeat_until)
          : [rest.date || null];
      const copies = dates.map(
        (date, index) =>
          ({
            description: "",
            amount: null,
            url: "",
            ...rest,
            household_id: household.id,
            created_by: uid!,
            created_at: new Date().toISOString(),
            done: false,
            date,
            id: crypto.randomUUID(),
            series_id: repeat ? sid : null,
            rotation_members:
              rotation_partner && rest.assignee
                ? [rest.assignee, rotation_partner]
                : [],
            assignee: occurrenceAssignee(
              rest.assignee || null,
              rotation_partner,
              index,
            ),
            payment_members:
              rest.kind === "event" &&
              ["Rent", "Bill"].includes(rest.category || "")
                ? members
                    .filter((m) => m.name !== "Housemates")
                    .map((m) => m.user_id)
                : [],
            paid_by: [],
          }) as Entry,
      );
      setEntries((current) => [...copies, ...current]);
      persist("create", values, copies);
    }
    setEditing(null);
  }
  async function toggle(entry: Entry) {
    setEntries((current) =>
      current.map((e) => (e.id === entry.id ? { ...e, done: !entry.done } : e)),
    );
    persist("update", { id: entry.id, done: !entry.done });
  }
  function togglePayment(entry: Entry) {
    if (!uid) return;
    const paid = !entry.paid_by?.includes(uid);
    setEntries((current) =>
      current.map((e) => (e.id === entry.id ? markPaid(e, uid, paid) : e)),
    );
    persist("payment", { id: entry.id, paid });
  }
  async function remove(entry: Entry, scope?: "series") {
    const wholeSeries = scope === "series" && entry.series_id;
    const removed = entries.filter((e) =>
      wholeSeries ? e.series_id === entry.series_id : e.id === entry.id,
    );
    const token = crypto.randomUUID();
    setEntries((current) =>
      current.filter((e) => !removed.some((item) => item.id === e.id)),
    );
    setEditing(null);
    setUndoDeletes((current) => [
      ...current,
      { token, entries: removed, expires: Date.now() + UNDO_DURATION },
    ]);
    persist("delete", {
      id: entry.id,
      undo_token: token,
      ...(wholeSeries ? { scope: "series" } : {}),
    });
  }
  function undoDelete(token: string) {
    const deleted = undoDeletes.find(
      (item) => item.token === token && item.expires > Date.now(),
    );
    if (!deleted) return;
    setUndoDeletes((current) => current.filter((item) => item.token !== token));
    const restored = deleted.entries.map((entry) => ({
      ...entry,
      id: savedIds.current.get(entry.id) || entry.id,
      series_id: entry.series_id
        ? savedSeriesIds.current.get(entry.series_id) || entry.series_id
        : null,
    }));
    setEntries((current) => [
      ...restored.filter((e) => !current.some((item) => item.id === e.id)),
      ...current,
    ]);
    persist("restore", { undo_token: token });
  }
  async function choosePerson(member: Member) {
    ++loadSequence.current;
    setBusy(true);
    setError("");
    try {
      await writes.current;
      if (!demo)
        await homeRequest("/api/session", "PATCH", {
          member_id: member.user_id,
        });
      ++loadSequence.current;
      setIdentity(member.user_id);
      setUndoDeletes([]);
      setChoosingPerson(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
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
  async function addMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const name = String(new FormData(form).get("name") || "").trim();
    if (!name) return;
    setBusy(true);
    setError("");
    try {
      if (demo)
        setMembers((current) => [
          ...current,
          { user_id: crypto.randomUUID(), household_id: household!.id, name },
        ]);
      else {
        await homeRequest("/api/home", "POST", {
          operation: "member",
          payload: { name },
        });
        await refresh();
      }
      form.reset();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
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
  const quickAdd = (kind: "task" | "request") => (
    <form
      className="quick-add"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const title = String(new FormData(form).get("title") || "").trim();
        if (!title) return;
        void save({
          kind,
          title,
          category: categories[kind][0],
          description: "",
          date: null,
          assignee: kind === "task" && filter === "Mine" ? uid : null,
          amount: null,
          url: "",
        });
        form.reset();
      }}
    >
      <input
        name="title"
        aria-label={`Quick add ${labels[kind]}`}
        placeholder={
          kind === "task"
            ? "Add a to-do and press Enter…"
            : "Add an item and press Enter…"
        }
        required
        maxLength={160}
      />
      <Button className="button small" aria-label={`Quick add ${labels[kind]}`}>
        <Plus size={16} />
        Add
      </Button>
    </form>
  );
  const addButton = (kind: Kind, text = `Add ${labels[kind]}`) => (
    <Button className="button small" onClick={() => setEditing({ kind })}>
      <Plus size={16} />
      {text}
    </Button>
  );
  const taskRow = (entry: Entry) => (
    <m.div
      layout={reduced ? false : "position"}
      initial={false}
      className={`task-row ${entry.done ? "completed" : ""}`}
      key={entry.id}
    >
      <Button
        className="checkbox"
        aria-label={`${entry.done ? "Reopen" : "Complete"} ${entry.title}`}
        aria-pressed={entry.done}
        onClick={() => void toggle(entry)}
      >
        {entry.done && <AnimatedCheck size={14} />}
      </Button>
      <Button
        className="entry-label"
        onClick={() => setEditing({ kind: entry.kind, entry })}
      >
        <span>
          {entry.title}
          {entry.series_id ? " ↻" : ""}
          {entry.rotation_members?.length ? " · Taking turns" : ""}
        </span>
        <small
          className={
            entry.date && entry.date < today && !entry.done ? "overdue" : ""
          }
        >
          {entry.date && entry.date < today && !entry.done ? "Overdue · " : ""}
          {friendlyDate(entry.date)} <span>·</span> {entry.category}
          {members.some(
            (m) => m.user_id === entry.created_by && m.name !== "Housemates",
          )
            ? ` · Added by ${person(entry.created_by)}`
            : ""}
        </small>
      </Button>
      {members.some(
        (m) => m.user_id === entry.assignee && m.name !== "Housemates",
      ) && (
        <span className="person-tag">
          <span
            className={`person-dot tone-${
              Math.max(
                0,
                members.findIndex((m) => m.user_id === entry.assignee),
              ) % 3
            }`}
          />
          {person(entry.assignee)}
        </span>
      )}
    </m.div>
  );

  if (!ready)
    return (
      <main className="auth-wrap">
        <Leaf size={36} />
        <p>Making room for you…</p>
      </main>
    );
  if (!demo && !session) return <Auth onSuccess={() => setSession(true)} />;
  if (!demo && !loaded)
    return (
      <main className="auth-wrap">
        <Leaf size={36} />
        <p>Opening your home…</p>
      </main>
    );
  if (!household)
    return (
      <main className="auth-wrap">
        <section className="auth-card">
          <h1>Your home is taking a moment.</h1>
          <p role="alert">{error || "Could not load your household."}</p>
          <Button className="button" onClick={() => void refresh()}>
            Try again
          </Button>
          <Button className="text-button" onClick={() => void signOut()}>
            Sign out
          </Button>
        </section>
      </main>
    );

  if ((!demo && !identity) || choosingPerson)
    return (
      <main className="auth-wrap">
        <section className="auth-card">
          <p className="eyebrow">MAKE YOURSELF AT HOME</p>
          <h1>Who’s this?</h1>
          <p className="subtitle">Pick who’s using this device.</p>
          <div className="person-picker">
            {members
              .filter((m) => m.name !== "Housemates")
              .map((member, i) => (
                <Button
                  className="button secondary"
                  key={member.user_id}
                  aria-label={member.name}
                  disabled={busy}
                  onClick={() => void choosePerson(member)}
                >
                  {avatar(member, i)}
                  {member.name}
                </Button>
              ))}
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {!demo && (
            <Button className="text-button" onClick={() => void signOut()}>
              Sign out
            </Button>
          )}
        </section>
      </main>
    );

  const toasts = (
    <div className="toast-stack">
      {notice && (
        <m.div
          initial={reduced ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="toast"
          role="status"
        >
          {notice}
        </m.div>
      )}
      {undoDeletes.map((item) => (
        <m.div
          layout={reduced ? false : "position"}
          initial={reduced ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="toast"
          role="status"
          key={item.token}
        >
          <span>
            {item.entries.length > 1
              ? `${item.entries.length} occurrences deleted`
              : `Deleted “${item.entries[0]?.title}”`}
          </span>
          <Button
            className="undo-button"
            onClick={() => undoDelete(item.token)}
          >
            Undo
          </Button>
        </m.div>
      ))}
    </div>
  );

  const PageIcon = tabs.find((item) => item.name === tab)?.icon || Settings;
  const openTasks = tasks.filter((entry) => !entry.done);
  const doneCount = tasks.length - openTasks.length;
  const neededItems = shopping.filter((entry) => !entry.done);

  const boardProps = {
    household,
    entries,
    members,
    demo,
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
        {toasts}
      </main>
    );

  return (
    <div
      className={`${styles.shell} app-shell ${tab === "Overview" || tab === "Calendar" ? "fitted-app" : ""}`}
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
        <span className="nav-label">{household.name}</span>
        <nav aria-label="Main navigation">
          {tabs.map(({ name, icon: Icon }) => (
            <Button
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
            </Button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <Button
            className={`settings-link ${tab === "Our household" ? "selected" : ""}`}
            onClick={() => setTab("Our household")}
          >
            <Settings size={18} /> Our household
          </Button>
          <div className="sidebar-profile">
            <span
              className={`avatar tone-${
                Math.max(
                  0,
                  members.findIndex((m) => m.user_id === uid),
                ) % 3
              }`}
            >
              {person(uid || null).slice(0, 1)}
            </span>
            <div>
              <Button
                className="text-button"
                onClick={() => setChoosingPerson(true)}
                aria-label="Switch person"
              >
                {person(uid || null)}
              </Button>
              <small>{demo ? "Exploring the demo" : "Right at home"}</small>
            </div>
            {!demo && (
              <Button
                aria-label="Sign out"
                className="icon-button"
                onClick={() => void signOut()}
              >
                <LogOut size={17} />
              </Button>
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
            <DisplayButton onClick={() => changeDisplay(true)} />
            <span className="private-label">
              <ShieldCheck size={14} />
              {demo ? "Demo home" : "Private household"}
            </span>
            <Button
              className="icon-button avatar-stack"
              aria-label="Open household settings"
              onClick={() => setTab("Our household")}
            >
              {members.map(avatar)}
            </Button>
            {!demo && (
              <Button
                className="icon-button"
                aria-label="Sign out of household"
                onClick={() => void signOut()}
              >
                <LogOut size={16} />
              </Button>
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
              <Button onClick={() => setTab("Our household")}>
                Connect your home <ArrowRight size={14} />
              </Button>
            </div>
          )}
          {error && (
            <div className="error" role="alert">
              {error}
              <Button
                className="icon-button"
                aria-label="Dismiss error"
                onClick={() => setError("")}
              >
                <X size={16} />
              </Button>
            </div>
          )}
          {tab !== "Overview" && (
            <m.div
              key={tab}
              initial={reduced ? false : { opacity: 0.5 }}
              animate={{ opacity: 1 }}
              className="page-heading"
            >
              <div className="heading-copy">
                {tab !== "Calendar" && (
                  <span className="page-symbol" aria-hidden="true">
                    <PageIcon size={23} />
                  </span>
                )}
                <div>
                  <h1>{tab}</h1>
                  <p className="subtitle">
                    {
                      {
                        Calendar: "Plans and dated to-dos for your home.",
                        "To-dos": `${openTasks.length} open · ${openTasks.filter((entry) => entry.assignee === uid).length} assigned to you`,
                        "Shopping list": `${neededItems.length} ${neededItems.length === 1 ? "item" : "items"} to pick up`,
                        "House notes": `${notes.length} ${notes.length === 1 ? "note" : "notes"} shared with your home`,
                        "Our household": `${household.name} · ${members.length} ${members.length === 1 ? "housemate" : "housemates"}`,
                        Overview: "",
                      }[tab]
                    }
                  </p>
                </div>
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
            </m.div>
          )}

          {tab === "Overview" && <HomeBoard {...boardProps} />}

          {tab === "Calendar" && (
            <section className="panel calendar-panel">
              <div className="panel-heading">
                <div className="month-control">
                  <Button
                    className="icon-button"
                    aria-label="Previous month"
                    onClick={() =>
                      setMonth(
                        new Date(month.getFullYear(), month.getMonth() - 1, 1),
                      )
                    }
                  >
                    <ChevronLeft size={20} />
                  </Button>
                  <h2>
                    {month.toLocaleDateString("en-US", {
                      month: "long",
                      year: "numeric",
                    })}
                  </h2>
                  <Button
                    className="icon-button"
                    aria-label="Next month"
                    onClick={() =>
                      setMonth(
                        new Date(month.getFullYear(), month.getMonth() + 1, 1),
                      )
                    }
                  >
                    <ChevronRight size={20} />
                  </Button>
                </div>
                <div className="actions">
                  <Button
                    className="button secondary small"
                    onClick={() => setMonth(new Date())}
                  >
                    Today
                  </Button>
                  <Button
                    className="button secondary small"
                    onClick={exportCalendar}
                  >
                    <ArrowDownToLine size={16} /> Export .ics
                  </Button>
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
                    <Button
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
                          {entry.series_id ? "↻ " : ""}
                          {entry.done ? "✓ " : ""}
                          {entry.title}
                        </strong>
                        <small>
                          {entry.category} · {person(entry.assignee)}
                        </small>
                      </span>
                      <ChevronRight size={17} />
                    </Button>
                  ))}
                {!monthEntries.length && (
                  <Empty text="No plans this month. Add something to look forward to." />
                )}
              </div>
              <div className="agenda-pager">
                <Button
                  aria-label="Previous agenda page"
                  disabled={agendaPage === 0}
                  onClick={() => setAgendaPage((p) => Math.max(0, p - 1))}
                >
                  <ChevronLeft size={18} />
                </Button>
                <span>
                  {Math.min(
                    agendaPage + 1,
                    Math.max(1, Math.ceil(monthEntries.length / agendaLimit)),
                  )}{" "}
                  / {Math.max(1, Math.ceil(monthEntries.length / agendaLimit))}
                </span>
                <Button
                  aria-label="Next agenda page"
                  disabled={
                    (agendaPage + 1) * agendaLimit >= monthEntries.length
                  }
                  onClick={() => setAgendaPage((p) => p + 1)}
                >
                  <ChevronRight size={18} />
                </Button>
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
                          <Button
                            className="day-number"
                            aria-label={`Add event on ${key}`}
                            onClick={() =>
                              setEditing({ kind: "event", date: key })
                            }
                          >
                            {date.getDate()}
                          </Button>
                          {dayEntries.length > 1 && (
                            <Button
                              className="day-more"
                              aria-label={`Show all ${dayEntries.length} entries on ${key}`}
                              onClick={() => setSelectedDay(key)}
                            >
                              +{dayEntries.length - 1}
                            </Button>
                          )}
                          {dayEntries.slice(0, 1).map((entry) => (
                            <Button
                              key={entry.id}
                              className={`calendar-event person-color-${
                                Math.max(
                                  0,
                                  members.findIndex(
                                    (m) =>
                                      m.user_id ===
                                      (entry.assignee || entry.created_by),
                                  ),
                                ) % 3
                              } ${entry.category === "Rent" ? "rent" : ""} ${entry.done ? "completed-event" : ""}`}
                              onClick={() =>
                                setEditing({ kind: entry.kind, entry })
                              }
                            >
                              {entry.series_id ? "↻ " : ""}
                              {entry.done ? "✓ " : ""}
                              {entry.title}
                              {isBill(entry)
                                ? billPaid(entry)
                                  ? " · Paid"
                                  : " · Payment due"
                                : ""}
                            </Button>
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
            <section className="panel entry-panel">
              <div className="panel-heading">
                <SegmentedControl
                  label="To-do filters"
                  values={["All", "Mine", "Open", "Done"]}
                  value={filter}
                  onChange={setFilter}
                />
                <div className="list-progress">
                  <span>
                    {doneCount} of {tasks.length} done
                  </span>
                  <progress
                    aria-label="To-do completion"
                    value={doneCount}
                    max={Math.max(1, tasks.length)}
                  />
                </div>
              </div>
              {quickAdd("task")}
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
            </section>
          )}

          {tab === "Shopping list" && (
            <section className="panel entry-panel">
              <div className="panel-heading">
                <SegmentedControl
                  label="Shopping filters"
                  values={["All", "Need", "Want", "Bought"]}
                  value={filter}
                  onChange={setFilter}
                />
                {shopping.some((e) => !e.done && e.amount != null) && (
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
                )}
              </div>
              {quickAdd("request")}
              <div className="shopping-list">
                {shopping
                  .filter((e) =>
                    filter === "Bought"
                      ? e.done
                      : !e.done && (filter === "All" || e.category === filter),
                  )
                  .map((entry) => (
                    <m.article
                      layout={reduced ? false : "position"}
                      initial={false}
                      className={`task-row shopping-row ${entry.done ? "completed" : ""}`}
                      key={entry.id}
                    >
                      <Button
                        className="checkbox"
                        aria-label={`${entry.done ? "Reopen" : "Mark as bought"}: ${entry.title}`}
                        aria-pressed={entry.done}
                        onClick={() => void toggle(entry)}
                      >
                        {entry.done && <AnimatedCheck size={14} />}
                      </Button>
                      <Button
                        className="entry-label"
                        onClick={() => setEditing({ kind: "request", entry })}
                      >
                        <h2>{entry.title}</h2>
                        <small>
                          {entry.category}
                          {entry.description ? ` · ${entry.description}` : ""}
                        </small>
                        {members.some(
                          (m) =>
                            m.user_id === entry.created_by &&
                            m.name !== "Housemates",
                        ) && <small>Added by {person(entry.created_by)}</small>}
                      </Button>
                      {entry.amount != null && (
                        <strong className="row-price">
                          {money(entry.amount)}
                        </strong>
                      )}
                      {safeUrl(entry.url) && (
                        <a
                          className="icon-button"
                          aria-label={`View ${entry.title} in store`}
                          href={safeUrl(entry.url)!}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink size={16} />
                        </a>
                      )}
                    </m.article>
                  ))}
              </div>
              {!shopping.filter((e) =>
                filter === "Bought"
                  ? e.done
                  : !e.done && (filter === "All" || e.category === filter),
              ).length && (
                <Empty text="Nothing on this list yet. Add something for your home." />
              )}
            </section>
          )}

          {tab === "House notes" && (
            <div className="notes-grid">
              {notes.map((entry) => (
                <article className="notice-board" key={entry.id}>
                  <span className="tape" />
                  <Button
                    className="note-preview"
                    onClick={() => setEditing({ kind: "note", entry })}
                  >
                    <h3>{entry.title}</h3>
                    <p>{entry.description}</p>
                    <span>— {person(entry.assignee || entry.created_by)}</span>
                  </Button>
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
                <p className="subtle">People who share this home.</p>
                {members.map((member, i) => (
                  <div className="member-row" key={member.user_id}>
                    {avatar(member, i)}
                    <strong>{member.name}</strong>
                    <span className="subtle">
                      {member.user_id === household.owner_id
                        ? "Shared home"
                        : "Housemate"}
                    </span>
                  </div>
                ))}
                <h3>Add your housemates</h3>
                <p className="subtle">
                  Everyone uses the same household code. Add names here to
                  assign chores and leave notes for each other.
                </p>
                <form onSubmit={addMember}>
                  <label>
                    Housemate’s name
                    <input
                      name="name"
                      required
                      maxLength={50}
                      placeholder="Their name"
                    />
                  </label>
                  <Button className="button secondary" disabled={busy}>
                    <Plus size={16} />
                    Add housemate
                  </Button>
                </form>
              </section>
              <section className="panel settings-panel">
                <h2>
                  <ShieldCheck size={20} />{" "}
                  {demo ? "Make yourself at home" : "Private by design"}
                </h2>
                <p>
                  {demo
                    ? "You’re exploring a sample home. Connect Supabase and configure your household code to save across devices."
                    : "Anyone with your household code can use this home. Keep it between housemates. Changes refresh every 15 seconds while this page is visible."}
                </p>
                {demo && (
                  <p className="subtle">
                    Setup instructions are in this project’s README: create a
                    Supabase project, apply the included database migration, and
                    add your project URL and publishable key.
                  </p>
                )}
                <h3>Display motion</h3>
                <p className="subtle">
                  Gentle details for this device. Your system’s reduced-motion
                  preference is always respected.
                </p>
                <AmbientToggle />
                <h3>Calendar export</h3>
                <p className="subtle">
                  Download your dated chores and events for Apple Calendar,
                  Google Calendar, or Outlook.
                </p>
                <Button className="button secondary" onClick={exportCalendar}>
                  <ArrowDownToLine size={16} /> Export calendar
                </Button>
                <h3>Shopping, with fewer tabs</h3>
                <p className="subtle">
                  Paste an Amazon or other store’s product link when adding an
                  item. Prices are entered manually; account linking and live
                  prices aren’t connected.
                </p>
              </section>
            </div>
          )}
        </main>
      </div>
      {toasts}
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
          editing={{
            ...editing,
            entry: editing.entry
              ? entries.find(
                  (e) =>
                    e.id ===
                    (savedIds.current.get(editing.entry!.id) ||
                      editing.entry!.id),
                ) || editing.entry
              : undefined,
          }}
          uid={uid}
          onPayment={togglePayment}
          members={members.filter((m) => m.name !== "Housemates")}
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
    <m.dialog
      initial={false}
      animate={{ opacity: 1 }}
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
        <Button
          className="icon-button"
          aria-label="Close day"
          onClick={onClose}
        >
          <X size={20} />
        </Button>
      </div>
      {entries.map((entry) => (
        <Button
          className="agenda-entry"
          key={entry.id}
          onClick={() => onOpen(entry)}
        >
          {entry.title}
          <ChevronRight size={16} />
        </Button>
      ))}
      <Button className="button" onClick={onAdd}>
        <Plus size={16} />
        Add event
      </Button>
    </m.dialog>
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
  uid,
  onPayment,
}: {
  uid: string | null;
  onPayment: (entry: Entry) => void;
  editing: { kind: Kind; entry?: Entry; date?: string };
  members: Member[];
  busy: boolean;
  error: string;
  onClose: () => void;
  onSave: (values: SaveValues) => Promise<void>;
  onDelete: (entry: Entry, scope?: "series") => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [kind, setKind] = useState<Kind>(editing.kind);
  const [validation, setValidation] = useState("");
  const [repeat, setRepeat] = useState<Repeat | "">("");
  const [wholeSeries, setWholeSeries] = useState(false);
  const [alternating, setAlternating] = useState(false);
  const [assignee, setAssignee] = useState(editing.entry?.assignee || "");
  const [category, setCategory] = useState(
    editing.entry?.category || categories[editing.kind][0],
  );
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
    const date = String(data.get("date") || "") || null;
    const until = String(data.get("repeat_until") || "");
    const repeating =
      !entry && repeat && ["task", "event"].includes(kind) ? repeat : null;
    if (repeating && !date) {
      setValidation("Pick a start date for a repeating plan.");
      return;
    }
    if (repeating && until < date!) {
      setValidation("The repeat end date should be after the start.");
      return;
    }
    const partner = String(data.get("rotation_partner") || "");
    const rotating = kind === "task" && repeating && alternating;
    if (rotating && (!assignee || !partner || assignee === partner)) {
      setValidation("Choose two different people to take turns.");
      return;
    }
    setValidation("");
    await onSave({
      ...(entry ? {} : { kind }),
      title,
      description: String(data.get("description") || "").trim(),
      category: String(data.get("category") || categories[kind][0]),
      date,
      assignee: assignee || null,
      amount: data.get("amount") ? Number(data.get("amount")) : null,
      url,
      ...(repeating ? { repeat: repeating, repeat_until: until } : {}),
      ...(rotating ? { rotation_partner: partner } : {}),
      ...(entry?.series_id && wholeSeries ? { scope: "series" as const } : {}),
    });
  }
  return (
    <m.dialog
      initial={false}
      animate={{ opacity: 1 }}
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
        <Button
          className="icon-button"
          aria-label="Close dialog"
          disabled={busy}
          onClick={onClose}
        >
          <X size={21} />
        </Button>
      </div>
      {entry && (
        <BillChecks
          entry={entry}
          members={members}
          uid={uid}
          onPayment={onPayment}
        />
      )}
      <form onSubmit={submit}>
        {!entry && (
          <div className="filters kind-picker">
            {(["task", "event", "request", "note"] as Kind[]).map((value) => (
              <Button
                type="button"
                key={value}
                className={kind === value ? "active" : ""}
                onClick={() => {
                  setKind(value);
                  setCategory(categories[value][0]);
                }}
              >
                {labels[value]}
              </Button>
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
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              {categories[kind].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label>
            {kind === "note" ? "From" : "Who’s on it?"}
            <select
              name="assignee"
              value={assignee}
              onChange={(event) => setAssignee(event.target.value)}
              disabled={wholeSeries && !!entry?.rotation_members?.length}
            >
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
          {!entry && ["task", "event"].includes(kind) && (
            <label>
              Repeats
              <select
                name="repeat"
                value={repeat}
                onChange={(event) =>
                  setRepeat(event.target.value as Repeat | "")
                }
              >
                <option value="">Never</option>
                <option value="weekly">Weekly</option>
                <option value="biweekly">Every 2 weeks</option>
                <option value="monthly">Monthly</option>
              </select>
            </label>
          )}
          {!entry && kind === "task" && repeat && (
            <>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={alternating}
                  onChange={(event) => setAlternating(event.target.checked)}
                />
                Alternate each occurrence
              </label>
              {alternating && (
                <label>
                  Take turns with
                  <select name="rotation_partner" required defaultValue="">
                    <option value="">Choose a housemate</option>
                    {members
                      .filter((m) => m.user_id !== assignee)
                      .map((m) => (
                        <option key={m.user_id} value={m.user_id}>
                          {m.name}
                        </option>
                      ))}
                  </select>
                </label>
              )}
            </>
          )}
          {!entry && ["task", "event"].includes(kind) && repeat && (
            <label>
              Repeat until
              <input name="repeat_until" type="date" required />
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
        {!entry && kind === "event" && ["Rent", "Bill"].includes(category) && (
          <p className="subtle">
            Each housemate gets their own paid check. Choose Monthly to repeat
            this bill.
          </p>
        )}
        {entry?.rotation_members?.length ? (
          <p className="subtle">
            This chore takes turns. Editing the whole series keeps each person’s
            turn; edit one occurrence to reassign it.
          </p>
        ) : null}
        {entry?.series_id && (
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={wholeSeries}
              onChange={(event) => setWholeSeries(event.target.checked)}
            />
            Apply to every occurrence of this plan
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
        {entry && members.some((m) => m.user_id === entry.created_by) && (
          <p className="subtle">
            Added by {members.find((m) => m.user_id === entry.created_by)?.name}
          </p>
        )}
        <div className="dialog-actions">
          {entry && (
            <Button
              type="button"
              className="icon-button danger"
              aria-label="Delete entry"
              disabled={busy}
              onClick={() =>
                void onDelete(entry, wholeSeries ? "series" : undefined)
              }
            >
              <Trash2 size={18} />
            </Button>
          )}
          <Button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button className="button" disabled={busy}>
            {busy ? "Saving…" : "Save to our home"}
            <ArrowRight size={16} />
          </Button>
        </div>
      </form>
    </m.dialog>
  );
}

function Auth({ onSuccess }: { onSuccess: () => void }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const code = String(new FormData(event.currentTarget).get("code") || "");
    try {
      await homeRequest("/api/session", "POST", { code });
      onSuccess();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
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
        <p className="eyebrow">YOUR LITTLE CORNER OF THE WORLD</p>
        <h1>Welcome home.</h1>
        <p className="subtitle">
          A shared space for your people. Enter your household code to come on
          in.
        </p>
        <form onSubmit={submit}>
          <label>
            Household code
            <input
              name="code"
              type="password"
              required
              maxLength={128}
              autoComplete="current-password"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="Your household code"
              autoFocus
            />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <Button className="button" disabled={busy}>
            {busy ? "Opening the door…" : "Come on in"}
            <ArrowRight size={17} />
          </Button>
        </form>
        <p className="auth-footnote">
          <ShieldCheck size={15} />
          We’ll remember this device for 30 days. No email needed.
        </p>
      </section>
    </main>
  );
}
