"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import AmendmentsPanel from "./amendments-panel";
import ReliefPanel from "./relief-panel";
import {
  agreementDocuments,
  renderTokens,
  type DocSection,
} from "@/lib/agreements-content";
import {
  defaultGymTerms,
  defaultHouseTerms,
  type AgreementSlug,
  type DayType,
  type GymTerms,
  type HouseTerms,
} from "@/lib/agreements";
import { dateKey, shiftDay, type Entry, type Member } from "@/lib/model";
import type { AgreementsController } from "@/lib/use-agreements";
import styles from "./agreements.module.css";

export const AGREEMENT_TITLES: Record<AgreementSlug, string> = {
  house: "The Clean Split",
  gym: "The Iron Pact",
};
const DAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
const fmtDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "";
const ptoPreset = (pto: GymTerms["pto"]) =>
  pto.hours === 3 && pto.period === "month"
    ? "month3"
    : pto.hours === 7 && pto.period === "year"
      ? "year7"
      : "custom";

export default function AgreementView({
  slug,
  controller,
  members,
  uid,
  entries,
  refreshEntries,
}: {
  slug: AgreementSlug;
  controller: AgreementsController;
  members: Member[];
  uid: string;
  entries: Entry[];
  refreshEntries: () => void;
}) {
  const row = controller.agreements.find((a) => a.slug === slug);
  const other = members.find((m) => m.user_id !== uid);
  const [draft, setDraft] = useState<HouseTerms | GymTerms>(
    () =>
      row?.terms ??
      (slug === "house"
        ? defaultHouseTerms(members.map((m) => m.user_id))
        : defaultGymTerms()),
  );
  const [customPto, setCustomPto] = useState(
    () => slug === "gym" && ptoPreset((draft as GymTerms).pto) === "custom",
  );
  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  });
  const status = row?.status ?? "draft";
  // Status flips (revoke, sign, amendment approval) re-seed the local copy;
  // plain refetches don't, so mid-edit text isn't clobbered.
  useEffect(() => {
    if (row) setDraft(row.terms);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row?.id, row?.status]);
  const editing = status === "draft";
  const terms = editing || !row ? draft : row.terms;
  const persistDraft = () =>
    controller.saveDraft(slug, AGREEMENT_TITLES[slug], draftRef.current);
  const save = (next: HouseTerms | GymTerms) => {
    setDraft(next);
    controller.saveDraft(slug, AGREEMENT_TITLES[slug], next);
  };
  const touch = (next: HouseTerms | GymTerms) => setDraft(next);
  const saveNumber = (
    key: string,
    raw: string,
    { min = 0, max = 99 }: { min?: number; max?: number } = {},
  ) => {
    const value = Number(raw);
    if (raw.trim() === "" || !Number.isFinite(value)) return;
    save({
      ...draftRef.current,
      [key]: Math.min(max, Math.max(min, Math.round(value))),
    } as HouseTerms | GymTerms);
  };

  const checklist = (section: DocSection) => {
    if (!section.checklist) return null;
    const key =
      slug === "house" && section.heading.startsWith("SCHEDULE A")
        ? ("a" as const)
        : slug === "house" && section.heading.startsWith("SCHEDULE B")
          ? ("b" as const)
          : null;
    const items = key
      ? ((terms as HouseTerms).bundles?.[key]?.items ?? section.checklist)
      : section.checklist;
    if (key && editing) {
      const bundles = (draft as HouseTerms).bundles;
      const editItems = (lines: string[], persist: boolean) => {
        const next = {
          ...(draft as HouseTerms),
          bundles: {
            ...bundles,
            [key]: { ...bundles[key], items: lines },
          },
        };
        if (persist) save(next);
        else touch(next);
      };
      return (
        <textarea
          className={styles.checkTextarea}
          aria-label={`${bundles[key].name} checklist, one item per line`}
          value={bundles[key].items.join("\n")}
          onChange={(event) => editItems(event.target.value.split("\n"), false)}
          onBlur={(event) =>
            editItems(
              event.target.value
                .split("\n")
                .map((line) => line.trim())
                .filter(Boolean),
              true,
            )
          }
        />
      );
    }
    return (
      <ul>
        {items.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    );
  };

  const houseEditor = (heading: string) => {
    const draftTerms = draft as HouseTerms;
    if (heading.startsWith("ARTICLE 2"))
      return (
        <div className={styles.editors}>
          <label>
            Bundle A in week one
            <select
              value={draftTerms.first_bundle_a ?? ""}
              onChange={(event) =>
                save({
                  ...draftTerms,
                  first_bundle_a: event.target.value || null,
                })
              }
            >
              <option value="">Choose…</option>
              {members.map((member) => (
                <option key={member.user_id} value={member.user_id}>
                  {member.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      );
    if (heading.startsWith("SCHEDULE C"))
      return (
        <div className={styles.editors}>
          <label>
            Swap deadline
            <input
              type="text"
              maxLength={80}
              value={draftTerms.swap_deadline}
              onChange={(event) =>
                touch({ ...draftTerms, swap_deadline: event.target.value })
              }
              onBlur={persistDraft}
            />
          </label>
          <label>
            Max swaps / month
            <input
              type="number"
              min={0}
              max={31}
              value={draftTerms.max_swaps_month}
              onChange={(event) =>
                saveNumber("max_swaps_month", event.target.value, { max: 31 })
              }
            />
          </label>
          <label>
            Max skips / month
            <input
              type="number"
              min={0}
              max={31}
              value={draftTerms.max_skips_month}
              onChange={(event) =>
                saveNumber("max_skips_month", event.target.value, { max: 31 })
              }
            />
          </label>
          <label>
            Misses to trigger
            <input
              type="number"
              min={1}
              max={31}
              value={draftTerms.miss_trigger}
              onChange={(event) =>
                saveNumber("miss_trigger", event.target.value, {
                  min: 1,
                  max: 31,
                })
              }
            />
          </label>
          <label className={styles.wide}>
            Failure clause
            <textarea
              rows={3}
              maxLength={1000}
              value={draftTerms.failure_clause}
              onChange={(event) =>
                touch({ ...draftTerms, failure_clause: event.target.value })
              }
              onBlur={persistDraft}
            />
          </label>
        </div>
      );
    return null;
  };

  const gymEditor = (heading: string) => {
    const draftTerms = draft as GymTerms;
    if (heading.startsWith("SCHEDULE A"))
      return (
        <div className={styles.editors}>
          <label>
            Days per week
            <input
              type="number"
              min={1}
              max={7}
              value={draftTerms.days_per_week}
              onChange={(event) =>
                saveNumber("days_per_week", event.target.value, {
                  min: 1,
                  max: 7,
                })
              }
            />
          </label>
          <div className={styles.template}>
            {DAY_NAMES.map((name, index) => {
              const day = draftTerms.template[index];
              const editDay = (patch: Partial<typeof day>) =>
                save({
                  ...draftTerms,
                  template: draftTerms.template.map((slot, i) =>
                    i === index ? { ...slot, ...patch } : slot,
                  ),
                });
              return (
                <div key={name} className={styles.templateRow}>
                  <label className={styles.choice}>
                    <input
                      type="checkbox"
                      checked={day.on}
                      onChange={(event) =>
                        editDay({ on: event.target.checked })
                      }
                    />
                    {name}
                  </label>
                  <select
                    aria-label={`${name} day type`}
                    value={day.day_type}
                    disabled={!day.on}
                    onChange={(event) =>
                      editDay({
                        day_type: event.target.value as DayType | "Auto",
                      })
                    }
                  >
                    {["Auto", "Push", "Pull", "Legs"].map((type) => (
                      <option key={type}>{type}</option>
                    ))}
                  </select>
                  <input
                    aria-label={`${name} time`}
                    type="time"
                    value={day.time}
                    disabled={!day.on}
                    onChange={(event) =>
                      event.target.value &&
                      editDay({ time: event.target.value })
                    }
                  />
                </div>
              );
            })}
          </div>
        </div>
      );
    if (heading.startsWith("SCHEDULE C")) {
      const ramp = draftTerms.ramp;
      return (
        <div className={styles.editors}>
          <label className={styles.choice}>
            <input
              type="radio"
              name="ramp-election"
              checked={!!ramp}
              onChange={() =>
                save({
                  ...draftTerms,
                  ramp: ramp ?? {
                    start_time: "08:00",
                    weekly_shift_min: 15,
                    target_time: "07:00",
                    target_date: shiftDay(dateKey(new Date()), 56),
                  },
                })
              }
            />
            Ramp-Up
          </label>
          <label className={styles.choice}>
            <input
              type="radio"
              name="ramp-election"
              checked={!ramp}
              onChange={() => save({ ...draftTerms, ramp: null })}
            />
            Cold Open
          </label>
          {ramp && (
            <>
              <label>
                Start time (week 1)
                <input
                  type="time"
                  value={ramp.start_time}
                  onChange={(event) =>
                    event.target.value &&
                    save({
                      ...draftTerms,
                      ramp: { ...ramp, start_time: event.target.value },
                    })
                  }
                />
              </label>
              <label>
                Weekly shift (minutes earlier)
                <input
                  type="number"
                  min={5}
                  max={120}
                  step={5}
                  value={ramp.weekly_shift_min}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    if (event.target.value === "" || !Number.isFinite(value))
                      return;
                    save({
                      ...draftTerms,
                      ramp: {
                        ...ramp,
                        weekly_shift_min: Math.max(1, Math.round(value)),
                      },
                    });
                  }}
                />
              </label>
              <label>
                Target time
                <input
                  type="time"
                  value={ramp.target_time}
                  onChange={(event) =>
                    event.target.value &&
                    save({
                      ...draftTerms,
                      ramp: { ...ramp, target_time: event.target.value },
                    })
                  }
                />
              </label>
              <label>
                Target date
                <input
                  type="date"
                  value={ramp.target_date}
                  onChange={(event) =>
                    event.target.value &&
                    save({
                      ...draftTerms,
                      ramp: { ...ramp, target_date: event.target.value },
                    })
                  }
                />
              </label>
            </>
          )}
        </div>
      );
    }
    if (heading.startsWith("SCHEDULE D")) {
      const custom = customPto || ptoPreset(draftTerms.pto) === "custom";
      return (
        <div className={styles.editors}>
          <label className={styles.choice}>
            <input
              type="radio"
              name="pto-election"
              checked={!custom && ptoPreset(draftTerms.pto) === "month3"}
              onChange={() => {
                setCustomPto(false);
                save({ ...draftTerms, pto: { hours: 3, period: "month" } });
              }}
            />
            3.0 hours / month
          </label>
          <label className={styles.choice}>
            <input
              type="radio"
              name="pto-election"
              checked={!custom && ptoPreset(draftTerms.pto) === "year7"}
              onChange={() => {
                setCustomPto(false);
                save({ ...draftTerms, pto: { hours: 7, period: "year" } });
              }}
            />
            7.0 hours / year
          </label>
          <label className={styles.choice}>
            <input
              type="radio"
              name="pto-election"
              checked={custom}
              onChange={() => setCustomPto(true)}
            />
            Custom
          </label>
          {custom && (
            <>
              <label>
                Hours
                <input
                  type="number"
                  min={0.25}
                  max={24}
                  step={0.25}
                  value={draftTerms.pto.hours}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    if (
                      event.target.value === "" ||
                      !Number.isFinite(value) ||
                      value <= 0 ||
                      value > 24 ||
                      Math.round(value * 4) !== value * 4
                    )
                      return;
                    save({
                      ...draftTerms,
                      pto: { ...draftTerms.pto, hours: value },
                    });
                  }}
                />
              </label>
              <label>
                Per
                <select
                  value={draftTerms.pto.period}
                  onChange={(event) =>
                    save({
                      ...draftTerms,
                      pto: {
                        ...draftTerms.pto,
                        period: event.target.value as "month" | "year",
                      },
                    })
                  }
                >
                  <option value="month">Calendar month</option>
                  <option value="year">Year</option>
                </select>
              </label>
            </>
          )}
          <label>
            Misses to trigger
            <input
              type="number"
              min={1}
              max={31}
              value={draftTerms.miss_trigger}
              onChange={(event) =>
                saveNumber("miss_trigger", event.target.value, {
                  min: 1,
                  max: 31,
                })
              }
            />
          </label>
          <label className={styles.wide}>
            Failure clause
            <textarea
              rows={3}
              maxLength={1000}
              value={draftTerms.failure_clause}
              onChange={(event) =>
                touch({ ...draftTerms, failure_clause: event.target.value })
              }
              onBlur={persistDraft}
            />
          </label>
        </div>
      );
    }
    return null;
  };

  const editorFor = (heading: string) =>
    !editing ? null : slug === "house" ? houseEditor(heading) : gymEditor(heading);

  const waitingFor = row
    ? members.find((m) => !row.signed_by.includes(m.user_id))
    : undefined;
  return (
    <div>
      <article className={styles.paper}>
        {agreementDocuments[slug].map((section) => (
          <section key={section.heading}>
            <h3>{section.heading}</h3>
            {section.paragraphs.map((paragraph, index) => (
              <p key={index}>{renderTokens(paragraph, terms, members)}</p>
            ))}
            {checklist(section)}
            {editorFor(section.heading)}
          </section>
        ))}
        {editing && (
          <footer className={styles.actions}>
            <Button
              className="button"
              disabled={!other}
              onClick={() => {
                if (!row)
                  controller.saveDraft(
                    slug,
                    AGREEMENT_TITLES[slug],
                    draftRef.current,
                  );
                controller.propose(slug);
              }}
            >
              Send to {other?.name ?? "your housemate"} to agree
            </Button>
            {!other && (
              <span className="subtle">Add your housemate first.</span>
            )}
          </footer>
        )}
        {status === "proposed" && row && (
          <footer className={styles.actions}>
            {row.proposed_by === uid ? (
              <>
                <span className="subtle">
                  Waiting for {waitingFor?.name ?? "your housemate"} · sent{" "}
                  {fmtDate(row.proposed_at)}
                </span>
                <Button
                  className="button secondary"
                  onClick={() => controller.revoke(slug)}
                >
                  Pull back
                </Button>
              </>
            ) : (
              <Button
                className="button"
                onClick={() => {
                  controller.sign(slug);
                  refreshEntries();
                }}
              >
                I agree — sign
              </Button>
            )}
          </footer>
        )}
        {status === "active" && row && (
          <footer className={styles.signatures}>
            {members
              .filter((m) => row.signed_by.includes(m.user_id))
              .map((m) => (
                <div key={m.user_id}>
                  <strong>{m.name}</strong>
                  <small>
                    Signed{" "}
                    {fmtDate(
                      m.user_id === row.proposed_by
                        ? row.proposed_at
                        : row.updated_at,
                    )}
                  </small>
                </div>
              ))}
          </footer>
        )}
      </article>
      {controller.error && (
        <p className="error" role="alert">
          {controller.error}
        </p>
      )}
      {status === "active" && row && (
        <>
          <AmendmentsPanel
            agreement={row}
            members={members}
            uid={uid}
            controller={controller}
            refreshEntries={refreshEntries}
          />
          <ReliefPanel
            agreement={row}
            members={members}
            uid={uid}
            entries={entries}
            controller={controller}
            refreshEntries={refreshEntries}
          />
        </>
      )}
    </div>
  );
}
