"use client";
import { PaperDialog } from "./ui/dialog";

import { Button } from "@/components/ui/button";

import BillChecks from "@/components/bill-checks";
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
import { useState, type FormEvent } from "react";

import {
  SaveValues,
  categories,
  kindTabs,
  labels,
} from "@/lib/household-config";
export default function EntryDialog({
  editing,
  members,
  busy,
  error,
  onClose,
  onSave,
  onDelete,
  uid,
  onPayment,
  onCover,
}: {
  uid: string | null;
  onPayment: (entry: Entry) => void;
  onCover: (entry: Entry) => void;
  editing: { kind: Kind; entry?: Entry; date?: string };
  members: Member[];
  busy: boolean;
  error: string;
  onClose: () => void;
  onSave: (values: SaveValues) => Promise<void>;
  onDelete: (entry: Entry, scope?: "series") => Promise<void>;
}) {
  const [kind, setKind] = useState<Kind>(editing.kind);
  const [validation, setValidation] = useState("");
  const [lookup, setLookup] = useState<"" | "loading" | "failed">("");
  const [repeat, setRepeat] = useState<Repeat | "">("");
  const [startDate, setStartDate] = useState(
    editing.entry?.date || editing.date || "",
  );
  const [repeatUntil, setRepeatUntil] = useState("");
  function chooseRepeat(value: Repeat | "") {
    setRepeat(value);
    if (!value) return;
    const start = startDate || dateKey(new Date());
    setStartDate(start);
    if (!repeatUntil) {
      const end = parseDate(start);
      end.setFullYear(end.getFullYear() + 1);
      setRepeatUntil(dateKey(end));
    }
  }
  const [wholeSeries, setWholeSeries] = useState(false);
  const [alternating, setAlternating] = useState(false);
  const [assignee, setAssignee] = useState(editing.entry?.assignee || "");
  const [category, setCategory] = useState(
    editing.entry?.category || categories[editing.kind][0],
  );
  const entry = editing.entry;
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
      (!entry || !entry.series_id) && repeat && ["task", "event"].includes(kind)
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
    if (repeating) {
      const cap = parseDate(date!);
      cap.setFullYear(cap.getFullYear() + 2);
      if (until > dateKey(cap)) {
        setValidation("Pick a repeat end date within two years.");
        return;
      }
    }
    const partner = String(data.get("rotation_partner") || "");
    const rotating = kind === "task" && repeating && alternating;
    if (rotating && (!assignee || !partner || assignee === partner)) {
      setValidation("Choose two different people to take turns.");
      return;
    }
    setValidation("");
    await onSave({
      ...(!entry || kind !== entry.kind ? { kind } : {}),
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
        />
      )}
      <form onSubmit={submit}>
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
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </label>
          )}
          {(!entry || !entry.series_id) && ["task", "event"].includes(kind) && (
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
                defaultValue={entry?.amount ?? ""}
              />
            </label>
          )}
        </div>
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
              {seriesDates(startDate, repeat, repeatUntil).length} occurrences,
              starting{" "}
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
                defaultValue={entry?.url}
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
