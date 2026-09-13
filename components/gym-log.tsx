"use client";
import { useState } from "react";
import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAgreementsContext } from "./agreements-context";
import type {
  DayType,
  GymExercise,
  GymLog as GymLogRow,
} from "@/lib/agreements";
import type { Entry, Member } from "@/lib/model";

const DAY_TYPES: DayType[] = ["Push", "Pull", "Legs"];
const emptySet = () => ({ reps: 0, weight: "" });

// Minutes fields stay strings while typing; the gateway wants 0–120 ints.
const minutes = (value: string) =>
  Math.max(0, Math.min(120, Math.round(Number(value) || 0)));

type Draft = {
  day_type: DayType;
  weights_minutes: string;
  cardio_minutes: string;
  exercises: GymExercise[];
  notes: string;
};

function startingDraft(log: GymLogRow | undefined, entry: Entry): Draft {
  if (log)
    return {
      day_type: log.day_type,
      weights_minutes: String(log.weights_minutes),
      cardio_minutes: String(log.cardio_minutes),
      exercises: log.exercises,
      notes: log.notes,
    };
  return {
    day_type: DAY_TYPES.find((type) => entry.title.startsWith(type)) ?? "Push",
    weights_minutes: "",
    cardio_minutes: "",
    exercises: [],
    notes: "",
  };
}

function LogSummary({ log }: { log: GymLogRow }) {
  return (
    <>
      <p className="subtle">
        {log.day_type} day · {log.weights_minutes} min weights ·{" "}
        {log.cardio_minutes} min cardio
      </p>
      {log.exercises.map((exercise, i) => (
        <p className="subtle" key={i}>
          {exercise.name}:{" "}
          {exercise.sets
            .map((set) => `${set.reps}${set.weight ? ` × ${set.weight}` : ""}`)
            .join(", ")}
        </p>
      ))}
      {log.notes && <p className="subtle">“{log.notes}”</p>}
    </>
  );
}

export default function GymLog({
  entry,
  members,
  uid,
}: {
  entry: Entry;
  members: Member[];
  uid: string | null;
}) {
  const agreements = useAgreementsContext();
  // Local edits sit on top of the shared log, so a log arriving after the
  // dialog opened still prefills an untouched form.
  const [draft, setDraft] = useState<Draft | null>(null);
  if (!agreements || !agreements.enabled) return null;
  const mine = uid
    ? agreements.logs.find(
        (log) => log.entry_id === entry.id && log.member === uid,
      )
    : undefined;
  const other = members.find(
    (m) => m.name !== "Housemates" && m.user_id !== uid,
  );
  const otherLog = other
    ? agreements.logs.find(
        (log) => log.entry_id === entry.id && log.member === other.user_id,
      )
    : undefined;
  const values = draft ?? startingDraft(mine, entry);
  const edit = (patch: Partial<Draft>) => setDraft({ ...values, ...patch });
  const editExercise = (index: number, patch: Partial<GymExercise>) =>
    edit({
      exercises: values.exercises.map((exercise, i) =>
        i === index ? { ...exercise, ...patch } : exercise,
      ),
    });
  const total = minutes(values.weights_minutes) + minutes(values.cardio_minutes);
  // saveLog applies optimistically and queues the write, so "in flight" is
  // simply "nothing left to save": draft resets and the button disables.
  const canSave = Boolean(uid) && (draft !== null || !mine);
  function save() {
    if (!uid || !agreements) return;
    agreements.saveLog(entry.id, {
      day_type: values.day_type,
      weights_minutes: minutes(values.weights_minutes),
      cardio_minutes: minutes(values.cardio_minutes),
      exercises: values.exercises
        .map((exercise) => ({ ...exercise, name: exercise.name.trim() }))
        .filter((exercise) => exercise.name),
      notes: values.notes.trim(),
    });
    setDraft(null);
  }
  return (
    <section
      className="gym-log"
      aria-label={`Workout logs for ${entry.title}`}
      style={{
        padding: 16,
        marginBottom: 20,
        border: "1px solid var(--line)",
        borderRadius: 12,
      }}
    >
      <div className="bill-heading">
        <strong>Your workout log</strong>
        <small>Only you can edit yours</small>
      </div>
      <div className="form-grid">
        <label>
          Day type
          <select
            value={values.day_type}
            disabled={!uid}
            onChange={(event) =>
              edit({ day_type: event.target.value as DayType })
            }
          >
            {DAY_TYPES.map((type) => (
              <option key={type}>{type}</option>
            ))}
          </select>
        </label>
        <label>
          Weights minutes
          <input
            type="number"
            min={0}
            max={120}
            placeholder="0"
            value={values.weights_minutes}
            disabled={!uid}
            onChange={(event) => edit({ weights_minutes: event.target.value })}
          />
        </label>
        <label>
          Cardio minutes
          <input
            type="number"
            min={0}
            max={120}
            placeholder="0"
            value={values.cardio_minutes}
            disabled={!uid}
            onChange={(event) => edit({ cardio_minutes: event.target.value })}
          />
        </label>
      </div>
      {total > 60 && (
        <p className="subtle" role="status">
          Over the 60-minute cap — Article 3 is judging you.
        </p>
      )}
      {values.exercises.map((exercise, i) => (
        <div key={i} style={{ display: "grid", gap: 6, margin: "10px 0" }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input
              placeholder="Exercise"
              maxLength={80}
              value={exercise.name}
              disabled={!uid}
              onChange={(event) => editExercise(i, { name: event.target.value })}
            />
            <Button
              type="button"
              className="icon-button danger"
              aria-label={`Remove ${exercise.name || "exercise"}`}
              disabled={!uid}
              onClick={() =>
                edit({
                  exercises: values.exercises.filter((_, j) => j !== i),
                })
              }
            >
              <X size={15} />
            </Button>
          </div>
          {exercise.sets.map((set, j) => (
            <div
              key={j}
              style={{ display: "flex", gap: 6, alignItems: "center" }}
            >
              <small className="subtle" style={{ flexShrink: 0 }}>
                Set {j + 1}
              </small>
              <input
                type="number"
                min={0}
                max={999}
                placeholder="Reps"
                aria-label={`Set ${j + 1} reps`}
                style={{ width: 84 }}
                value={set.reps || ""}
                disabled={!uid}
                onChange={(event) =>
                  editExercise(i, {
                    sets: exercise.sets.map((s, k) =>
                      k === j
                        ? {
                            ...s,
                            reps: Math.max(
                              0,
                              Math.round(Number(event.target.value) || 0),
                            ),
                          }
                        : s,
                    ),
                  })
                }
              />
              <input
                placeholder="Weight"
                aria-label={`Set ${j + 1} weight`}
                maxLength={20}
                value={set.weight}
                disabled={!uid}
                onChange={(event) =>
                  editExercise(i, {
                    sets: exercise.sets.map((s, k) =>
                      k === j ? { ...s, weight: event.target.value } : s,
                    ),
                  })
                }
              />
              <Button
                type="button"
                className="icon-button danger"
                aria-label={`Remove set ${j + 1}`}
                disabled={!uid}
                onClick={() =>
                  editExercise(i, {
                    sets: exercise.sets.filter((_, k) => k !== j),
                  })
                }
              >
                <X size={13} />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            className="text-button"
            disabled={!uid}
            onClick={() =>
              editExercise(i, { sets: [...exercise.sets, emptySet()] })
            }
          >
            <Plus size={12} /> Add set
          </Button>
        </div>
      ))}
      <Button
        type="button"
        className="button secondary small"
        disabled={!uid}
        onClick={() =>
          edit({
            exercises: [
              ...values.exercises,
              { name: "", sets: [emptySet(), emptySet()] },
            ],
          })
        }
      >
        <Plus size={14} /> Add exercise
      </Button>
      <label>
        Notes
        <textarea
          rows={2}
          maxLength={2000}
          placeholder="How did it go?"
          value={values.notes}
          disabled={!uid}
          onChange={(event) => edit({ notes: event.target.value })}
        />
      </label>
      {agreements.error && (
        <p className="error" role="alert">
          {agreements.error}
        </p>
      )}
      <Button
        type="button"
        className="button small"
        disabled={!canSave}
        onClick={save}
      >
        {mine && draft === null ? "Saved" : "Save my log"}
      </Button>
      {other && (
        <>
          <div className="bill-heading" style={{ margin: "16px 0 0" }}>
            <strong>{other.name}’s log</strong>
          </div>
          {otherLog ? (
            <LogSummary log={otherLog} />
          ) : (
            <p className="subtle">No log yet.</p>
          )}
        </>
      )}
    </section>
  );
}
