"use client";
import { useHouseholdClock } from "@/lib/household-clock";
import {
  choreTemplates,
  calendarConflicts,
  type ChecklistStep,
} from "@/lib/improvements";
import type { ImprovementsController } from "@/lib/use-improvements";
import { shareCents, toCents, splitEvenly } from "@/lib/expenses";
import { PaperDialog } from "./ui/dialog";

import { Button } from "@/components/ui/button";

import BillChecks from "@/components/bill-checks";
import GymLog from "@/components/gym-log";
import { homeRequest } from "@/lib/home-client";
import {
  dateKey,
  googleCalendarUrl,
  parseDate,
  safeUrl,
  seriesDates,
  type Entry,
  type Kind,
  type Member,
  type Repeat,
} from "@/lib/model";
import {
  ArrowRight,
  CalendarDays,
  ExternalLink,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";

import {
  SaveValues,
  categories,
  kindTabs,
  labels,
} from "@/lib/household-config";
export default function EntryDialog({
  editing,
  entries,
  improvements,
  members,
  busy,
  error,
  onClose,
  onSave,
  onDelete,
  uid,
  onPayment,
  onCover,
  onLogShare,
  onNudge,
}: {
  entries: Entry[];
  improvements: ImprovementsController;
  uid: string | null;
  onPayment: (entry: Entry) => void;
  onCover: (entry: Entry) => void;
  onLogShare?: (entry: Entry) => void;
  onNudge?: (entry: Entry, member: Member) => void;
  editing: {
    kind: Kind;
    entry?: Entry;
    date?: string;
    setup?: "bills" | "chores";
    suggestedAssignee?: string;
    draft?: { title: string; url: string };
  };
  members: Member[];
  busy: boolean;
  error: string;
  onClose: () => void;
  onSave: (values: SaveValues) => Promise<void>;
  onDelete: (entry: Entry, scope?: "series") => Promise<void>;
}) {
  const { today } = useHouseholdClock();
  const [kind, setKind] = useState<Kind>(editing.kind);
  const [validation, setValidation] = useState("");
  const [lookup, setLookup] = useState<"" | "loading" | "failed">("");
  const [repeat, setRepeat] = useState<Repeat | "">(
    editing.setup === "bills"
      ? "monthly"
      : editing.setup === "chores"
        ? "weekly"
        : "",
  );
  const [startDate, setStartDate] = useState(
    editing.entry?.date ||
      editing.date ||
      (editing.setup ? dateKey(new Date()) : ""),
  );
  const [repeatDays, setRepeatDays] = useState<number[]>([
    parseDate(startDate || today).getDay(),
  ]);
  const [repeatInterval, setRepeatInterval] = useState(1);
  const [repeatUntil, setRepeatUntil] = useState(
    editing.setup
      ? dateKey(
          new Date(
            new Date().getFullYear(),
            new Date().getMonth() + 6,
            new Date().getDate(),
          ),
        )
      : "",
  );
  const [rangeEnd, setRangeEnd] = useState("");
  function chooseRepeat(value: Repeat | "") {
    setRepeat(value);
    if (!value) return;
    const start = startDate || today;
    setStartDate(start);
    if (!repeatUntil) {
      const end = parseDate(start);
      end.setFullYear(end.getFullYear() + 1);
      setRepeatUntil(dateKey(end));
    }
  }
  const [wholeSeries, setWholeSeries] = useState(false);
  const [alternating, setAlternating] = useState(editing.setup === "chores");
  const [assignee, setAssignee] = useState(
    editing.suggestedAssignee ||
      editing.entry?.assignee ||
      (editing.setup === "chores" ? (uid ?? "") : ""),
  );
  const [category, setCategory] = useState(
    editing.entry?.category ||
      (editing.setup === "bills" ? "Bill" : categories[editing.kind][0]),
  );
  const entry = editing.entry;
  const [checklist, setChecklist] = useState<ChecklistStep[]>(
    entry?.checklist ?? [],
  );
  const [effort, setEffort] = useState(String(entry?.effort_minutes ?? ""));
  const [visibility, setVisibility] = useState(
    entry?.visibility ?? "household",
  );
  const [templateMessage, setTemplateMessage] = useState("");
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [confirmedConflicts, setConfirmedConflicts] = useState(false);
  const templates = [...choreTemplates, ...improvements.household.templates];
  const [billSplit, setBillSplit] = useState(!!entry?.bill_shares);
  const [billAmount, setBillAmount] = useState(entry?.amount?.toString() || "");
  const billPayers = entry?.payment_members?.length
    ? entry.payment_members
    : members.filter((m) => m.name !== "Housemates").map((m) => m.user_id);
  const [billShares, setBillShares] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      billPayers.map((id) => [
        id,
        (
          (entry?.bill_shares ??
            splitEvenly(Math.round((entry?.amount || 0) * 100), billPayers))[
            id
          ] / 100
        ).toFixed(2),
      ]),
    ),
  );
  const billLike = kind === "event" && ["Rent", "Bill"].includes(category);
  const formRef = useRef<HTMLFormElement>(null);
  // Fill only fields the person hasn't typed in; their words always win.
  async function fillFromLink(input: HTMLInputElement) {
    const url = safeUrl(input.value.trim());
    const form = input.form;
    if (!url || !form) return;
    const title = form.elements.namedItem("title") as HTMLInputElement;
    const amount = form.elements.namedItem("amount") as HTMLInputElement | null;
    if (title.value && amount?.value) return;
    setLookup("loading");
    try {
      const data = await homeRequest("/api/preview", "POST", { url });
      if (!form.isConnected) return;
      if (!title.value && data.title) title.value = data.title;
      if (amount && !amount.value && data.price != null)
        amount.value = String(data.price);
      setLookup(data.title || data.price != null ? "" : "failed");
    } catch {
      setLookup("failed");
    }
  }
  // A link that arrived from the share sheet is looked up straight away, as
  // if it had just been pasted.
  useEffect(() => {
    const input = formRef.current?.elements.namedItem("url");
    if (editing.draft?.url && input instanceof HTMLInputElement)
      void fillFromLink(input);
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
    const rangedEvent =
      kind === "event" && ["Away", "Guest"].includes(category) && !entry;
    const until = String(
      data.get(rangedEvent ? "range_end" : "repeat_until") || "",
    );
    const repeating =
      rangedEvent && until !== date
        ? "daily"
        : (!entry || !entry.series_id) &&
            repeat &&
            ["task", "event"].includes(kind)
          ? repeat
          : null;
    if (repeating && !date) {
      setValidation("Pick a start date for a repeating plan.");
      return;
    }
    if (repeating && until < date!) {
      setValidation("The repeat end date should be after the start.");
      return;
    }
    if (repeating === "weekdays" && !repeatDays.length) {
      setValidation("Choose at least one weekday.");
      return;
    }
    if (repeating) {
      const cap = parseDate(date!);
      if (repeating === "daily") cap.setDate(cap.getDate() + 30);
      else cap.setFullYear(cap.getFullYear() + 2);
      if (until > dateKey(cap)) {
        setValidation(
          repeating === "daily"
            ? "Keep an away or guest stay within 31 days."
            : "Pick a repeat end date within two years.",
        );
        return;
      }
    }
    if (
      repeating &&
      date &&
      !seriesDates(
        date,
        repeating,
        until,
        repeatDays,
        rangedEvent ? 1 : repeatInterval,
      ).length
    ) {
      setValidation(
        "No occurrences fall within these dates. Adjust the days or end date.",
      );
      return;
    }
    if (data.get("end_time") && !data.get("time_of_day")) {
      setValidation("Choose a start time before adding an end time.");
      return;
    }
    const rotation = [assignee, ...data.getAll("rotation_member").map(String)];
    const rotating = kind === "task" && repeating && alternating;
    if (
      rotating &&
      (!assignee ||
        rotation.length < 2 ||
        new Set(rotation).size !== rotation.length)
    ) {
      setValidation(
        "Choose a first assignee and at least one other housemate to take turns.",
      );
      return;
    }
    const warnings =
      kind === "event" && category === "Guest"
        ? Array.from(
            new Set(
              seriesDates(date!, "daily", rangedEvent ? until : date!).flatMap(
                (day) =>
                  calendarConflicts(
                    {
                      id: entry?.id ?? "",
                      category,
                      date: day,
                      time_of_day:
                        String(data.get("time_of_day") || "") || null,
                      end_time: String(data.get("end_time") || "") || null,
                    },
                    entries,
                    improvements.household,
                  ),
              ),
            ),
          )
        : [];
    if (warnings.length && !confirmedConflicts) {
      setConflicts(warnings);
      return;
    }
    if (checklist.some((step) => !step.title.trim())) {
      setValidation("Give every checklist step a title, or remove it.");
      return;
    }
    let customShares: Record<string, number> | null = null;
    if (billLike && billSplit) {
      const cents = toCents(String(data.get("amount") || ""));
      const parsed = billPayers.map(
        (id) => [id, shareCents(billShares[id] || "")] as const,
      );
      if (
        !cents ||
        parsed.some(([, value]) => value === null) ||
        parsed.reduce((sum, [, value]) => sum + (value || 0), 0) !== cents
      ) {
        setValidation(
          "Each share must be a valid dollar amount, and all shares must add up to the bill total.",
        );
        return;
      }
      customShares = Object.fromEntries(parsed) as Record<string, number>;
    }
    setValidation("");
    await onSave({
      ...(!entry || kind !== entry.kind ? { kind } : {}),
      title,
      ...(kind === "request"
        ? {
            quantity: Number(data.get("quantity") || 1),
            unit: String(data.get("unit") || "").trim(),
            store: String(data.get("store") || "").trim(),
          }
        : {}),
      ...(kind === "task"
        ? {
            checklist: checklist.map((step) => ({
              ...step,
              title: step.title.trim(),
            })),
            effort_minutes: effort ? Number(effort) : null,
          }
        : {}),
      ...(["task", "request"].includes(kind)
        ? { visibility: category === "Personal" ? visibility : "household" }
        : {}),
      description: String(data.get("description") || "").trim(),
      category: String(data.get("category") || categories[kind][0]),
      date,
      assignee: category === "Personal" ? assignee || uid : assignee || null,
      amount: data.get("amount") ? Number(data.get("amount")) : null,
      ...(billLike ? { bill_shares: customShares } : {}),
      url,
      time_of_day: String(data.get("time_of_day") || "") || null,
      end_time: String(data.get("end_time") || "") || null,
      ...(repeating
        ? {
            repeat: repeating,
            repeat_until: until,
            repeat_days: repeatDays,
            repeat_interval: rangedEvent ? 1 : repeatInterval,
          }
        : {}),
      ...(rotating ? { rotation_members: rotation } : {}),
      ...(entry?.series_id && wholeSeries ? { scope: "series" as const } : {}),
    });
  }
  return (
    <PaperDialog
      onClose={onClose}
      className="entry-dialog"
      aria-labelledby="dialog-title"
      sharedId={entry?.kind === "note" ? `note-${entry.id}` : undefined}
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
          onCover={onCover}
          onLogShare={onLogShare}
          onNudge={onNudge}
        />
      )}
      {entry?.category === "Gym" && (
        <>
          {entry.time_of_day && (
            <p className="subtle">
              Scheduled for {entry.time_of_day.replace(/^0/, "")}
            </p>
          )}
          <GymLog entry={entry} members={members} uid={uid} />
        </>
      )}
      <form
        onSubmit={submit}
        ref={formRef}
        onChange={() => {
          setConfirmedConflicts(false);
          setConflicts([]);
        }}
      >
        {(!entry || entry.kind === "note") && (
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
        {entry?.kind === "note" && kind !== "note" && (
          <p className="subtle">
            Saving turns this note into a {labels[kind]} and moves it to{" "}
            {kindTabs[kind]}.
          </p>
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
            defaultValue={entry?.title ?? editing.draft?.title}
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
        {kind === "request" && (
          <div className="form-grid">
            <label>
              Quantity
              <input
                name="quantity"
                type="number"
                min="0.001"
                max="100000"
                step="any"
                required
                defaultValue={entry?.quantity ?? 1}
              />
            </label>
            <label>
              Unit
              <input
                name="unit"
                maxLength={40}
                placeholder="e.g. bottles, kg, packs"
                defaultValue={entry?.unit ?? ""}
              />
            </label>
            <label>
              Store
              <input
                name="store"
                maxLength={100}
                placeholder="e.g. Trader Joe’s"
                defaultValue={entry?.store ?? ""}
              />
            </label>
            <p className="subtle">
              The amount below is the estimate for this whole row, including its
              quantity.
            </p>
          </div>
        )}
        {kind === "task" && (
          <fieldset className="chore-checklist">
            <legend>Chore checklist</legend>
            <label>
              Use a reusable template
              <select
                defaultValue=""
                onChange={(event) => {
                  const template = templates.find(
                    (t) => t.id === event.target.value,
                  );
                  if (!template) return;
                  setChecklist(
                    template.steps.map((title) => ({
                      id: crypto.randomUUID(),
                      title,
                      done: false,
                    })),
                  );
                  setEffort(String(template.effort_minutes));
                  const title = formRef.current?.elements.namedItem(
                    "title",
                  ) as HTMLInputElement | null;
                  if (title && !title.value) title.value = template.title;
                }}
              >
                <option value="">Choose a template</option>
                {templates.map((t) => (
                  <option value={t.id} key={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </label>
            {checklist.map((step, index) => (
              <div className="checklist-step" key={step.id}>
                <input
                  type="checkbox"
                  aria-label={`Complete checklist step ${index + 1}`}
                  checked={step.done}
                  onChange={(event) =>
                    setChecklist((steps) =>
                      steps.map((s) =>
                        s.id === step.id
                          ? { ...s, done: event.target.checked }
                          : s,
                      ),
                    )
                  }
                />
                <input
                  aria-label={`Checklist step ${index + 1}`}
                  maxLength={160}
                  required
                  value={step.title}
                  onChange={(event) =>
                    setChecklist((steps) =>
                      steps.map((s) =>
                        s.id === step.id
                          ? { ...s, title: event.target.value }
                          : s,
                      ),
                    )
                  }
                />
                <Button
                  type="button"
                  className="text-button"
                  aria-label={`Remove checklist step ${index + 1}`}
                  onClick={() =>
                    setChecklist((steps) =>
                      steps.filter((s) => s.id !== step.id),
                    )
                  }
                >
                  Remove
                </Button>
              </div>
            ))}
            <Button
              type="button"
              className="text-button"
              disabled={checklist.length >= 50}
              onClick={() =>
                setChecklist((steps) => [
                  ...steps,
                  { id: crypto.randomUUID(), title: "", done: false },
                ])
              }
            >
              Add checklist step
            </Button>
            <label>
              Estimated effort (minutes)
              <input
                type="number"
                min={1}
                max={1440}
                value={effort}
                onChange={(event) => setEffort(event.target.value)}
              />
            </label>
            <Button
              type="button"
              className="button secondary small"
              disabled={
                improvements.busy ||
                !improvements.loaded ||
                !checklist.length ||
                !effort ||
                improvements.household.templates.length >= 30
              }
              onClick={async () => {
                const title = (
                  formRef.current?.elements.namedItem(
                    "title",
                  ) as HTMLInputElement
                ).value.trim();
                if (
                  !title ||
                  checklist.some((step) => !step.title.trim()) ||
                  Number(effort) < 1 ||
                  Number(effort) > 1440
                ) {
                  setTemplateMessage(
                    "Add a title, steps and estimated effort before saving a template.",
                  );
                  return;
                }
                if (
                  await improvements.saveHousehold({
                    ...improvements.household,
                    templates: [
                      ...improvements.household.templates,
                      {
                        id: crypto.randomUUID(),
                        title,
                        steps: checklist.map((s) => s.title.trim()),
                        effort_minutes: Number(effort),
                      },
                    ],
                  })
                )
                  setTemplateMessage("Template saved for this household.");
              }}
            >
              Save as reusable template
            </Button>
            {templateMessage && <p role="status">{templateMessage}</p>}
            {improvements.error && (
              <p className="error" role="alert">
                {improvements.error}
              </p>
            )}
          </fieldset>
        )}
        {category === "Personal" && (
          <div>
            <p className="subtle">
              Personal items are visible to every housemate unless marked
              private. They stay off the overview, wall display and digests.
            </p>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={visibility === "private"}
                disabled={!!entry && entry.created_by !== uid}
                onChange={(event) => {
                  setVisibility(event.target.checked ? "private" : "household");
                  if (event.target.checked && uid) setAssignee(uid);
                }}
              />
              Personal view only (household code holders can access)
            </label>
            <p className="subtle">
              This hides the item from other selected people and shared screens.
              Anyone with the household code can switch to your name, see this
              item, and make changes in your name. Selecting a person is not a
              separate sign-in. Earlier shared activity remains visible.
            </p>
          </div>
        )}
        <div className="form-grid">
          <label>
            Category
            <select
              name="category"
              key={kind}
              value={category}
              onChange={(event) => {
                const next = event.target.value;
                setCategory(next);
                if (next === "Personal" && uid && !assignee) setAssignee(uid);
              }}
            >
              {categories[kind].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label>
            {kind === "note"
              ? "From"
              : kind === "request"
                ? category === "Personal"
                  ? "Who’s it for?"
                  : "Who’s getting it?"
                : category === "Away"
                  ? "Who’s away?"
                  : category === "Guest"
                    ? "Guest of"
                    : category === "Quiet hours"
                      ? "Who needs quiet?"
                      : "Who’s on it?"}
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
              {kind === "event" && ["Away", "Guest"].includes(category)
                ? "Starts"
                : kind === "event"
                  ? "Date"
                  : "Due date (optional)"}
              <input
                name="date"
                type="date"
                required={kind === "event"}
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </label>
          )}
          {!entry &&
            kind === "event" &&
            ["Away", "Guest"].includes(category) && (
              <label>
                Ends
                <input
                  name="range_end"
                  type="date"
                  required
                  min={startDate}
                  value={rangeEnd}
                  onChange={(event) => setRangeEnd(event.target.value)}
                />
              </label>
            )}
          {(!entry || !entry.series_id) &&
            ["task", "event"].includes(kind) &&
            !(kind === "event" && ["Away", "Guest"].includes(category)) && (
              <label>
                Repeats
                <select
                  name="repeat"
                  value={repeat}
                  onChange={(event) =>
                    chooseRepeat(event.target.value as Repeat | "")
                  }
                >
                  <option value="">Never</option>
                  <option value="weekly">Weekly</option>
                  <option value="weekdays">Selected weekdays</option>
                  <option value="biweekly">Every 2 weeks</option>
                  <option value="monthly">Monthly</option>
                </select>
              </label>
            )}
          {repeat && !entry?.series_id && repeat !== "daily" && (
            <label>
              Repeat every
              <input
                type="number"
                min={1}
                max={52}
                required
                value={repeatInterval}
                onChange={(event) =>
                  setRepeatInterval(Number(event.target.value))
                }
              />
              {repeat === "monthly"
                ? "months"
                : repeat === "biweekly"
                  ? "two-week periods"
                  : "weeks"}
            </label>
          )}
          {repeat === "weekdays" && !entry?.series_id && (
            <fieldset>
              <legend>On these days</legend>
              {[1, 2, 3, 4, 5, 6, 0].map((day) => (
                <label className="checkbox-row" key={day}>
                  <input
                    type="checkbox"
                    checked={repeatDays.includes(day)}
                    onChange={(event) =>
                      setRepeatDays((current) =>
                        event.target.checked
                          ? [...current, day]
                          : current.filter((d) => d !== day),
                      )
                    }
                  />
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][day]}
                </label>
              ))}
            </fieldset>
          )}
          {kind === "event" && (
            <>
              <label>
                Start time (optional)
                <input
                  name="time_of_day"
                  type="time"
                  defaultValue={entry?.time_of_day || ""}
                />
              </label>
              <label>
                End time (optional)
                <input
                  name="end_time"
                  type="time"
                  defaultValue={entry?.end_time || ""}
                />
              </label>
            </>
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
                <fieldset>
                  <legend>Take turns with</legend>
                  <p className="subtle">
                    The first assignee goes first, followed by selected
                    housemates in the order below.
                  </p>
                  {members
                    .filter(
                      (m) =>
                        m.name !== "Housemates" &&
                        m.active !== false &&
                        m.user_id !== assignee,
                    )
                    .map((m) => (
                      <label className="checkbox-row" key={m.user_id}>
                        <input
                          type="checkbox"
                          name="rotation_member"
                          value={m.user_id}
                        />
                        {m.name}
                      </label>
                    ))}
                </fieldset>
              )}
            </>
          )}
          {(!entry || !entry.series_id) &&
            ["task", "event"].includes(kind) &&
            repeat && (
              <label>
                Repeat until
                <input
                  name="repeat_until"
                  type="date"
                  required
                  min={startDate}
                  value={repeatUntil}
                  onChange={(event) => setRepeatUntil(event.target.value)}
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
                value={billAmount}
                onChange={(event) => setBillAmount(event.target.value)}
              />
            </label>
          )}
        </div>
        {billLike && (
          <fieldset>
            <legend>Bill shares</legend>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={billSplit}
                onChange={(event) => {
                  setBillSplit(event.target.checked);
                  if (event.target.checked && !entry?.bill_shares)
                    setBillShares(
                      Object.fromEntries(
                        Object.entries(
                          splitEvenly(toCents(billAmount) || 0, billPayers),
                        ).map(([id, cents]) => [id, (cents / 100).toFixed(2)]),
                      ),
                    );
                }}
              />
              Adjust each person’s share
            </label>
            {billSplit &&
              billPayers.map((id) => (
                <label key={id}>
                  {members.find((m) => m.user_id === id)?.name || "Housemate"}’s
                  bill share ($)
                  <input
                    type="number"
                    min="0"
                    max="999999.99"
                    step="0.01"
                    required
                    value={billShares[id] || ""}
                    onChange={(event) =>
                      setBillShares((current) => ({
                        ...current,
                        [id]: event.target.value,
                      }))
                    }
                  />
                </label>
              ))}
            <p className="subtle">
              {billSplit
                ? `Assigned $${(billPayers.reduce((sum, id) => sum + (shareCents(billShares[id] || "") || 0), 0) / 100).toFixed(2)} of $${((toCents(billAmount) || 0) / 100).toFixed(2)}. Zero is allowed.`
                : "Split evenly among bill participants."}{" "}
              Repeating bills keep these shares for each occurrence.
            </p>
          </fieldset>
        )}
        {kind !== "note" &&
          uid &&
          assignee !== uid &&
          !(wholeSeries && entry?.rotation_members?.length) && (
            <div className="assignment-actions">
              <Button
                type="button"
                className="text-button"
                onClick={() => setAssignee(uid)}
              >
                Assign to me
              </Button>
            </div>
          )}
        {!entry?.series_id && ["task", "event"].includes(kind) && !repeat && (
          <Button
            type="button"
            className="button secondary small"
            onClick={() => chooseRepeat(kind === "task" ? "weekly" : "monthly")}
          >
            {kind === "task"
              ? "Make this a weekly chore"
              : "Repeat every month"}
          </Button>
        )}
        {repeat &&
          !entry?.series_id &&
          ["task", "event"].includes(kind) &&
          startDate &&
          repeatUntil >= startDate && (
            <p className="repeat-summary">
              {
                seriesDates(
                  startDate,
                  repeat,
                  repeatUntil,
                  repeatDays,
                  repeatInterval,
                ).length
              }{" "}
              occurrences, starting{" "}
              {parseDate(startDate).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })}
              . You can change or delete one occurrence later.
            </p>
          )}
        {kind === "request" && (
          <>
            <label>
              Product link (optional)
              <input
                name="url"
                type="url"
                maxLength={2048}
                placeholder="https://www.amazon.com/…"
                defaultValue={entry?.url ?? editing.draft?.url}
                onBlur={(event) => void fillFromLink(event.currentTarget)}
                onPaste={(event) => {
                  const input = event.currentTarget;
                  setTimeout(() => void fillFromLink(input), 0);
                }}
              />
            </label>
            {lookup && (
              <p className="subtle" role="status">
                {lookup === "loading"
                  ? "Looking up the link…"
                  : "Couldn’t read that link — fill in the details yourself."}
              </p>
            )}
          </>
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
          <>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={wholeSeries}
                onChange={(event) => setWholeSeries(event.target.checked)}
              />
              Apply to every occurrence of this plan
            </label>
            <p className="repeat-summary">
              {wholeSeries
                ? "Changes apply to every occurrence, including past ones. Saving preserves payment records and rotating assignments. Deleting removes the whole series."
                : "Saving or deleting affects only this occurrence. The rest of the series stays as it is."}
            </p>
          </>
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
        {!!conflicts.length && (
          <div className="conflict-warning" role="alert">
            <strong>Calendar conflicts</strong>
            {conflicts.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={confirmedConflicts}
                onChange={(event) => {
                  event.stopPropagation();
                  setConfirmedConflicts(event.target.checked);
                }}
              />
              I’ve reviewed these conflicts; save this visit anyway
            </label>
          </div>
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
    </PaperDialog>
  );
}
