"use client";
import type { HouseActivity } from "./activity";
import { useListOrder } from "@/components/ui/list-order";

import { estimateCents } from "@/components/expenses-tab";
import { expenseMoney, splitEvenly, type ExpenseValues } from "@/lib/expenses";
import { useExpenses } from "@/lib/use-expenses";

import { useHouseMotion } from "@/components/ui/motion-provider";

import { hasDatabase, homeRequest } from "@/lib/home-client";
import {
  UNDO_DURATION,
  editEntries,
  isBill,
  markAllPaid,
  markPaid,
  occurrenceAssignee,
} from "@/lib/household-actions";
import {
  calendarFile,
  dateKey,
  demoData,
  parseDate,
  seriesDates,
  shiftDay,
  type Entry,
  type Household,
  type Kind,
  type Member,
} from "@/lib/model";
import { TAB_ID, useRealtime } from "@/lib/realtime";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";

import {
  SaveValues,
  Tab,
  kindTabs,
  labels,
  tabs,
} from "@/lib/household-config";
export function useHousehold() {
  const { reduced, celebrate } = useHouseMotion();
  const [ready, setReady] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [session, setSession] = useState(false);
  const [demo, setDemo] = useState(false);
  const [household, setHousehold] = useState<Household | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [activity, setActivity] = useState<HouseActivity[]>([]);
  const [tab, setTab] = useState<Tab>("Overview");
  const [editing, setEditing] = useState<{
    kind: Kind;
    entry?: Entry;
    date?: string;
  } | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [noticeAction, setNoticeAction] = useState<{
    text: string;
    label: string;
    run: () => void;
  } | null>(null);
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
  const [channel, setChannel] = useState<string | null>(null);
  const [choosingPerson, setChoosingPerson] = useState(false);
  const uid = demo ? identity || "you" : identity;
  const pending = useRef(0);
  const writes = useRef(Promise.resolve());
  const needsRecovery = useRef(false);
  const sessionGeneration = useRef(0);
  const savedIds = useRef(new Map<string, string>());
  const savedSeriesIds = useRef(new Map<string, string>());
  const expenseController = useExpenses(
    household?.id,
    uid,
    demo,
    tab === "Expenses" || tab === "Overview" || display,
    // Purchase expenses reuse entry ids; draining the home queue and mirroring
    // its optimistic-id remaps keeps them matched to the saved entry. Home
    // writes must never await the expenses queue, or drain() deadlocks.
    {
      drain: () => writes.current,
      resolveId: (id) => savedIds.current.get(id) || id,
    },
  );
  const taskOrder = useListOrder(`common-ground-order:${household?.id}:tasks`);
  const shoppingOrder = useListOrder(
    `common-ground-order:${household?.id}:shopping`,
  );
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
    setChannel(null);
    setNotice("");
    setNoticeAction(null);
    setUndoDeletes([]);
    needsRecovery.current = false;
    setSession(false);
    setHousehold(null);
    setEntries([]);
    setActivity([]);
    setMembers([]);
    setLoaded(false);
    setEditing(null);
    setShowShortcuts(false);
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
      setActivity(data.activity || []);
      setIdentity(data.member_id ?? null);
      setChannel(typeof data.channel === "string" ? data.channel : null);
      setError("");
    } catch (err) {
      if (!quiet && sequence === loadSequence.current)
        setError((err as Error).message);
    } finally {
      if (sequence === loadSequence.current) setLoaded(true);
    }
  }, []);
  // Change pings from other devices; a ping during a local write defers to
  // after the queue drains, like failure recovery. The 15-second poll stays
  // as the safety net, so a missed or broken ping path costs nothing.
  const live = useRealtime(session && !demo ? channel : null, (scope) => {
    if (document.visibilityState !== "visible") return;
    if (scope !== "expenses") {
      if (pending.current) needsRecovery.current = true;
      else void refresh(true);
    }
    if (scope !== "home") expenseController.ping();
  });
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
      await writes.current;
      await expenseController.flush();
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
  const shortcutsGated =
    !household || (!demo && !identity) || choosingPerson || display;
  useEffect(() => {
    if (shortcutsGated) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target?.closest(
          'input, textarea, select, dialog, [role="dialog"], [role="menu"], [contenteditable]',
        )
      )
        return;
      if (event.key === "?") {
        event.preventDefault();
        setShowShortcuts(true);
      } else if (event.key >= "1" && event.key <= "6") {
        event.preventDefault();
        setTab(tabs[Number(event.key) - 1].name);
      } else if (event.key.toLowerCase() === "n") {
        const kind = {
          Calendar: "event",
          "To-dos": "task",
          "Shopping list": "request",
          "House notes": "note",
        }[tab as string] as Kind | undefined;
        if (kind) {
          event.preventDefault();
          setEditing({ kind });
        }
      } else if (event.key === "/") {
        const input = document.querySelector<HTMLElement>(
          ".quick-add input, .quick-add textarea",
        );
        if (input) {
          event.preventDefault();
          input.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shortcutsGated, tab]);
  useEffect(() => {
    if (notice) {
      const timer = setTimeout(() => setNotice(""), 5000);
      return () => clearTimeout(timer);
    }
  }, [notice]);
  useEffect(() => {
    if (noticeAction) {
      const timer = setTimeout(() => setNoticeAction(null), 10000);
      return () => clearTimeout(timer);
    }
  }, [noticeAction]);

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
    onError?: () => void,
    skipIf?: () => boolean,
  ) {
    if (demo) {
      if (operation === "create" && payload.kind === "note" && uid)
        setActivity((current) =>
          [
            {
              id: crypto.randomUUID(),
              actor: uid,
              action: "noted",
              title: payload.title || "House note",
              created_at: new Date().toISOString(),
            } satisfies HouseActivity,
            ...current,
          ].slice(0, 20),
        );
      return;
    }
    ++loadSequence.current;
    ++pending.current;
    const generation = sessionGeneration.current;
    writes.current = writes.current
      .then(async () => {
        if (generation !== sessionGeneration.current) return;
        if (skipIf?.()) return;
        try {
          const result = await homeRequest("/api/home", "POST", {
            operation,
            payload: {
              ...payload,
              ...(payload.id
                ? { id: savedIds.current.get(payload.id) || payload.id }
                : {}),
              ...(payload.expense
                ? {
                    expense: {
                      ...payload.expense,
                      id:
                        savedIds.current.get(payload.expense.id) ||
                        payload.expense.id,
                    },
                  }
                : {}),
            },
            sender: TAB_ID,
          });
          if (generation !== sessionGeneration.current) return;
          if (Array.isArray(result.activity)) setActivity(result.activity);
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
        } catch (err) {
          if (operation === "delete")
            setUndoDeletes((current) =>
              current.filter((item) => item.token !== payload.undo_token),
            );
          if (generation !== sessionGeneration.current) return;
          needsRecovery.current = true;
          onError?.();
          setNotice(
            (err as Error & { rejected?: boolean }).rejected
              ? (err as Error).message
              : "Couldn’t save. Refreshing your home…",
          );
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
    // Turning a single entry into a series is a client-side delete + create;
    // the sequential write queue keeps the order.
    const converting = Boolean(
      entry && !entry.series_id && values.repeat && values.repeat_until,
    );
    // Conversion recreates the entry with fresh checks, so it would silently
    // destroy paid records the update guard protects.
    if (converting && isBill(entry!) && entry!.paid_by?.length) {
      setNotice("Clear paid checks before making this bill repeat.");
      return;
    }
    if (entry && !converting) {
      const { scope, ...rest } = values;
      if (
        isBill(entry) &&
        !isBill({
          kind: rest.kind ?? entry.kind,
          category: rest.category ?? entry.category,
        }) &&
        entries.some(
          (e) =>
            (scope === "series" && entry.series_id
              ? e.series_id === entry.series_id
              : e.id === entry.id) && e.paid_by?.length,
        )
      ) {
        setNotice(
          "Clear paid checks before changing this bill to another category.",
        );
        return;
      }
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
      if (values.kind && values.kind !== entry.kind)
        setNotice(
          `Turned “${values.title || entry.title}” into a ${labels[values.kind]}. It now lives under ${kindTabs[values.kind]}.`,
        );
    } else {
      if (converting)
        setEntries((current) => current.filter((e) => e.id !== entry!.id));
      const createValues = converting
        ? { kind: entry!.kind, ...values }
        : values;
      const {
        repeat,
        repeat_until,
        rotation_partner,
        scope: _scope,
        ...rest
      } = createValues;
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
      // Conversion creates the series before deleting the original so a
      // dropped create can't silently lose the entry; a failed delete leaves
      // a visible duplicate the recovery refresh surfaces instead.
      const conversion = { failed: false };
      persist(
        "create",
        createValues,
        copies,
        converting
          ? () => {
              conversion.failed = true;
            }
          : undefined,
      );
      if (converting) {
        persist(
          "delete",
          { id: entry!.id, undo_token: crypto.randomUUID() },
          [],
          undefined,
          () => conversion.failed,
        );
        if (repeat && repeat_until)
          setNotice(
            `Now repeats ${
              {
                weekly: "weekly",
                biweekly: "every 2 weeks",
                monthly: "monthly",
              }[repeat]
            } until ${parseDate(repeat_until).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}.`,
          );
      }
    }
    setEditing(null);
  }
  async function toggle(entry: Entry) {
    if (demo && uid)
      setActivity((current) =>
        [
          {
            id: crypto.randomUUID(),
            actor: uid,
            action: entry.done
              ? "reopened"
              : entry.kind === "request"
                ? "bought"
                : "completed",
            title: entry.title,
            created_at: new Date().toISOString(),
          } satisfies HouseActivity,
          ...current,
        ].slice(0, 20),
      );
    if (!entry.done)
      celebrate({
        kind:
          entry.kind === "task" &&
          entries.filter((item) => item.kind === "task" && !item.done)
            .length === 1
            ? "all-done"
            : "task",
      });
    setEntries((current) =>
      current.map((e) => (e.id === entry.id ? { ...e, done: !entry.done } : e)),
    );
    persist("update", { id: entry.id, done: !entry.done });
  }
  // One-tap row actions: a single occurrence moves or changes hands, never
  // the whole series, matching what the row's edit dialog does by default.
  function pushToTomorrow(entry: Entry) {
    const date =
      entry.date && entry.date > today
        ? shiftDay(entry.date, 1)
        : shiftDay(today, 1);
    setEntries((current) =>
      current.map((e) => (e.id === entry.id ? { ...e, date } : e)),
    );
    persist("update", { id: entry.id, date });
  }
  function handOff(entry: Entry, member: Member) {
    setEntries((current) =>
      current.map((e) =>
        e.id === entry.id ? { ...e, assignee: member.user_id } : e,
      ),
    );
    persist("update", { id: entry.id, assignee: member.user_id });
  }
  // A nudge is a push to the assignee's phones, not a change to the entry,
  // so nothing here is optimistic: the toast waits for the server's word.
  async function nudge(entry: Entry, member?: Member) {
    const name = member ? member.name : person(entry.assignee);
    setError("");
    try {
      // A hand-off or a fresh to-do may still be in the queue; the server
      // reads the database, so let it catch up before asking who to poke.
      await writes.current;
      const result = await homeRequest("/api/nudge", "POST", {
        id: savedIds.current.get(entry.id) || entry.id,
        member: member?.user_id,
      });
      setNotice(
        result.sent
          ? `Nudged ${name}`
          : result.devices
            ? `Couldn’t reach ${name}’s phone right now`
            : `${name} hasn’t turned on reminders on any device`,
      );
    } catch (err) {
      setError((err as Error).message);
    }
  }
  // "I'll grab it" is the shopping list's assignee: a claim says who is
  // picking it up so two people don't both come home with olive oil.
  function claim(entry: Entry) {
    if (!uid) return;
    const assignee = entry.assignee === uid ? null : uid;
    setEntries((current) =>
      current.map((e) => (e.id === entry.id ? { ...e, assignee } : e)),
    );
    persist("update", { id: entry.id, assignee });
  }
  // Priced items are pre-set expenses: buying one logs it without a dialog.
  // The expense reuses the entry id so re-buying can't double-log.
  function logPurchase(entry: Entry) {
    const cents = estimateCents(entry);
    const payers = members
      .filter((m) => m.name !== "Housemates")
      .map((m) => m.user_id);
    if (!uid || !cents || !payers.length) return;
    const logged = expenseController.expenses.find((e) => e.id === entry.id);
    if (logged) {
      setNotice(
        `Already logged ${expenseMoney(logged.amount_cents)} for “${entry.title}”. Adjust it in the Expenses tab.`,
      );
      return;
    }
    expenseController.create(
      {
        kind: "expense",
        title: entry.title,
        date: dateKey(new Date()),
        amount_cents: cents,
        paid_by: uid,
        shares: splitEvenly(cents, payers),
        recipient: null,
      },
      entry.id,
    );
    setNotice(
      `Logged ${expenseMoney(cents)} to expenses for “${entry.title}”. Adjust it in the Expenses tab if the price differed.`,
    );
  }
  // Shared by the Shopping tab and the Overview board so buying a priced item
  // logs its expense on both paths; tasks just toggle.
  function toggleBought(entry: Entry) {
    void toggle(entry);
    if (entry.kind !== "request") return;
    if (!entry.done && entry.amount != null) logPurchase(entry);
    else if (entry.done) {
      const logged = expenseController.expenses.find((e) => e.id === entry.id);
      if (logged)
        setNoticeAction({
          text: `Reopened “${entry.title}”. Remove the ${expenseMoney(logged.amount_cents)} expense too?`,
          label: "Remove",
          run: () => expenseController.remove(entry.id),
        });
    }
  }
  // Rebuying a staple is a fresh request, not a reopen: the bought row and
  // its logged expense stay put, and a new open item carries the details.
  function needAgain(entry: Entry) {
    if (!household || !uid) return;
    const values: SaveValues = {
      kind: entry.kind,
      title: entry.title,
      category: entry.category,
      description: entry.description,
      date: null,
      assignee: null,
      amount: entry.amount,
      url: entry.url,
    };
    const copy = {
      ...values,
      household_id: household.id,
      created_by: uid,
      created_at: new Date().toISOString(),
      done: false,
      id: crypto.randomUUID(),
      series_id: null,
      rotation_members: [],
      payment_members: [],
      paid_by: [],
    } as Entry;
    setEntries((current) => [copy, ...current]);
    persist("create", values, [copy]);
    setNotice(`Added “${entry.title}” back to the list`);
  }
  // Several items at once, each its own row from the first paint, saved in
  // the order typed so the list reads back the way it was written.
  function addItems(titles: string[]) {
    if (!household || !uid) return;
    const copies = titles.map((title) => {
      const values: SaveValues = {
        kind: "request",
        title,
        category: "Need",
        description: "",
        date: null,
        assignee: null,
        amount: null,
        url: "",
      };
      const copy = {
        ...values,
        household_id: household.id,
        created_by: uid,
        created_at: new Date().toISOString(),
        done: false,
        id: crypto.randomUUID(),
        series_id: null,
        rotation_members: [],
        payment_members: [],
        paid_by: [],
      } as Entry;
      return { values, copy };
    });
    setEntries((current) => [...copies.map((c) => c.copy), ...current]);
    // The server lists newest first, so the first line typed is written
    // last; after a refresh the list still reads the way it was written.
    for (const { values, copy } of [...copies].reverse())
      persist("create", values, [copy]);
    if (titles.length > 1) setNotice(`Added ${titles.length} items`);
  }
  function togglePayment(entry: Entry) {
    if (!uid) return;
    const paid = !entry.paid_by?.includes(uid);
    if (paid) celebrate({ kind: "paid" });
    setEntries((current) =>
      current.map((e) => (e.id === entry.id ? markPaid(e, uid, paid) : e)),
    );
    persist("payment", { id: entry.id, paid });
  }
  // One person paid the biller for everyone: check every payer and put the
  // split on the ledger so the others owe them their shares. One write creates
  // both server-side; the expense row is only injected optimistically here so
  // a failed write can't leave a payment without its expense (or vice versa).
  function coverBill(entry: Entry) {
    const cents = estimateCents(entry);
    if (!uid || !cents || !entry.payment_members?.length) return;
    celebrate();
    setEntries((current) =>
      current.map((e) => (e.id === entry.id ? markAllPaid(e) : e)),
    );
    const expense: ExpenseValues & { id: string } = {
      id: entry.id,
      kind: "expense",
      title: entry.title,
      date: dateKey(new Date()),
      amount_cents: cents,
      paid_by: uid,
      shares: splitEvenly(cents, entry.payment_members),
      recipient: null,
    };
    expenseController.inject({
      ...expense,
      household_id: entry.household_id,
      created_by: uid,
      created_at: new Date().toISOString(),
    });
    persist(
      "payment",
      { id: entry.id, paid: true, cover: true, expense },
      [],
      expenseController.recover,
    );
    expenseController.hold(writes.current);
    setNotice(
      `Marked everyone paid and logged ${expenseMoney(cents)} to expenses for “${entry.title}”.`,
    );
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
      await expenseController.flush();
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
  const tasks = taskOrder.sort(entries.filter((e) => e.kind === "task"));
  const shopping = shoppingOrder.sort(
    entries.filter((e) => e.kind === "request"),
  );
  const filteredTasks = tasks.filter(
    (e) =>
      filter === "All" ||
      (filter === "Mine" && e.assignee === uid) ||
      (filter === "Open" && !e.done) ||
      (filter === "Done" && e.done),
  );
  const filteredShopping = shopping.filter((e) =>
    filter === "Bought"
      ? e.done
      : !e.done && (filter === "All" || e.category === filter),
  );
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
        : date === shiftDay(today, 1)
          ? "Tomorrow"
          : date === shiftDay(today, -1)
            ? "Yesterday"
            : parseDate(date).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                // A chore repeating into next year would otherwise read
                // "Jan 7", the same as the one that came and went.
                ...(date.slice(0, 4) === today.slice(0, 4)
                  ? {}
                  : { year: "numeric" }),
              });
  return {
    activity,
    reduced,
    ready,
    loaded,
    session,
    setSession,
    demo,
    household,
    members,
    entries,
    tab,
    setTab,
    editing,
    setEditing,
    showShortcuts,
    setShowShortcuts,
    busy,
    setBusy,
    error,
    setError,
    notice,
    setNotice,
    noticeAction,
    setNoticeAction,
    undoDeletes,
    month,
    setMonth,
    agendaPage,
    setAgendaPage,
    agendaLimit,
    selectedDay,
    setSelectedDay,
    agendaRef,
    filter,
    setFilter,
    display,
    identity,
    choosingPerson,
    setChoosingPerson,
    uid,
    pending,
    savedIds,
    expenseController,
    taskOrder,
    shoppingOrder,
    today,
    weeks,
    changeDisplay,
    refresh,
    live,
    signOut,
    save,
    toggle,
    pushToTomorrow,
    handOff,
    nudge,
    claim,
    toggleBought,
    needAgain,
    addItems,
    togglePayment,
    coverBill,
    remove,
    undoDelete,
    choosePerson,
    exportCalendar,
    addMember,
    tasks,
    shopping,
    filteredTasks,
    filteredShopping,
    notes,
    monthEntries,
    person,
    friendlyDate,
  };
}
