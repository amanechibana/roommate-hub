"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { homeRequest } from "./home-client";
import { TAB_ID } from "./realtime";
import { dateKey, nextSaturday, parseDate, type Member } from "./model";
import {
  pendingForMember,
  type Agreement,
  type AgreementEvent,
  type AgreementEventKind,
  type AgreementSlug,
  type Amendment,
  type DayType,
  type GymExercise,
  type GymLog,
  type GymTerms,
  type HouseTerms,
} from "./agreements";
import { gymSessions, houseChores } from "./gym-schedule";

// The chore gateway caps at 52 weeks; half a year keeps the calendar light
// and a re-activation regenerates from scratch anyway.
const CHORE_WEEKS = 26;

export function useAgreements({
  enabled,
  memberId,
  members,
  householdId,
  demo,
}: {
  enabled: boolean;
  memberId: string | null;
  members: Member[];
  householdId: string | undefined;
  demo: boolean;
}) {
  const on = enabled && !demo && Boolean(householdId);
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [amendments, setAmendments] = useState<Amendment[]>([]);
  const [events, setEvents] = useState<AgreementEvent[]>([]);
  const [logs, setLogs] = useState<GymLog[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(0);
  const writes = useRef(Promise.resolve());
  const generation = useRef(0);
  const revision = useRef(0);
  const readSequence = useRef(0);
  const recovery = useRef(false);
  const interested = useRef(false);
  // Deferred callbacks (post-sign activation, post-amendment regeneration)
  // need the agreements as they stand when the write lands, not as they were
  // when the click happened.
  const agreementsRef = useRef<Agreement[]>([]);
  useEffect(() => {
    agreementsRef.current = agreements;
  }, [agreements]);
  const realIds = members
    .filter((m) => m.name !== "Housemates")
    .map((m) => m.user_id);
  const refresh = useCallback(async () => {
    if (!on || pending.current) return;
    const current = generation.current;
    const version = revision.current;
    const read = ++readSequence.current;
    try {
      const data = await homeRequest("/api/agreements");
      if (
        current !== generation.current ||
        version !== revision.current ||
        read !== readSequence.current ||
        pending.current
      )
        return;
      setAgreements(data.agreements ?? []);
      setAmendments(data.amendments ?? []);
      setEvents(data.events ?? []);
      setLogs(data.logs ?? []);
      setLoaded(true);
      setError((message) =>
        message.startsWith("Could not load") ? "" : message,
      );
    } catch {
      if (current === generation.current)
        setError("Could not load the agreements. Try again.");
    }
  }, [on]);
  useEffect(() => {
    generation.current++;
    revision.current++;
    interested.current = false;
    setAgreements([]);
    setAmendments([]);
    setEvents([]);
    setLogs([]);
    setLoaded(false);
    setError("");
  }, [householdId, demo]);
  useEffect(() => {
    if (on && !interested.current) {
      interested.current = true;
      void refresh();
    }
  }, [on, refresh]);
  useEffect(() => {
    const focus = () => {
      if (interested.current && document.visibilityState === "visible")
        void refresh();
    };
    window.addEventListener("focus", focus);
    return () => window.removeEventListener("focus", focus);
  }, [refresh]);
  function persist(
    operation: string,
    payload: Record<string, unknown>,
    // Runs on success, inside the queue; it may schedule follow-up writes but
    // must never await them, or the queue deadlocks on itself.
    after?: (result: Record<string, unknown>) => void,
  ) {
    revision.current++;
    if (demo) return;
    pending.current++;
    const current = generation.current;
    writes.current = writes.current.then(async () => {
      try {
        const result = await homeRequest("/api/agreements", "POST", {
          operation,
          payload,
          sender: TAB_ID,
        });
        if (current === generation.current) after?.(result ?? {});
      } catch (err) {
        if (generation.current === current) {
          recovery.current = true;
          setError(
            (err as Error & { rejected?: boolean }).rejected
              ? (err as Error).message
              : "Couldn’t save that. Refreshing the shared agreements.",
          );
        }
      } finally {
        pending.current--;
        if (
          !pending.current &&
          recovery.current &&
          current === generation.current
        ) {
          recovery.current = false;
          void refresh();
        }
      }
    });
  }
  // Server-generated ids (new rows, series written into terms) come back via
  // the same drain-time refetch that failure recovery uses.
  const refetchOnDrain = () => {
    recovery.current = true;
  };
  // The write endpoint returns the gateway's row; tolerate it arriving bare
  // or wrapped as { agreement }.
  function agreementRow(result: Record<string, unknown>): Agreement | null {
    const row = (result.agreement ?? result) as Partial<Agreement> | null;
    return row && typeof row === "object" && typeof row.id === "string" && row.slug
      ? (row as Agreement)
      : null;
  }
  function saveDraft(
    slug: AgreementSlug,
    title: string,
    terms: HouseTerms | GymTerms,
  ) {
    if (!memberId || !householdId) return;
    setError("");
    const now = new Date().toISOString();
    const existing = agreementsRef.current.some((a) => a.slug === slug);
    setAgreements((current) =>
      existing
        ? current.map((a) =>
            a.slug === slug ? { ...a, title, terms, updated_at: now } : a,
          )
        : [
            ...current,
            {
              id: crypto.randomUUID(),
              household_id: householdId,
              slug,
              title,
              status: "draft" as const,
              terms,
              signed_by: [],
              proposed_by: null,
              proposed_at: null,
              created_at: now,
              updated_at: now,
            },
          ],
    );
    persist("save", { slug, title, terms }, existing ? undefined : refetchOnDrain);
  }
  function propose(slug: AgreementSlug) {
    if (!memberId) return;
    const uid = memberId;
    setError("");
    const now = new Date().toISOString();
    setAgreements((current) =>
      current.map((a) =>
        a.slug === slug
          ? {
              ...a,
              status: "proposed" as const,
              signed_by: [uid],
              proposed_by: uid,
              proposed_at: now,
              updated_at: now,
            }
          : a,
      ),
    );
    persist("propose", { slug });
  }
  function revoke(slug: AgreementSlug) {
    if (!memberId) return;
    setError("");
    setAgreements((current) =>
      current.map((a) =>
        a.slug === slug
          ? {
              ...a,
              status: "draft" as const,
              signed_by: [],
              proposed_by: null,
              proposed_at: null,
              updated_at: new Date().toISOString(),
            }
          : a,
      ),
    );
    persist("revoke", { slug });
  }
  function activateGym(agreement: Agreement) {
    const terms = agreement.terms as GymTerms;
    const seriesId = terms.gym_series_id || crypto.randomUUID();
    const today = new Date();
    persist(
      "set_sessions",
      {
        agreement_id: agreement.id,
        series_id: seriesId,
        from_date: dateKey(today),
        sessions: gymSessions(terms, today, seriesId),
      },
      refetchOnDrain,
    );
  }
  function activateHouse(agreement: Agreement) {
    if (realIds.length !== 2) return;
    const first = parseDate(nextSaturday(dateKey(new Date())));
    persist(
      "set_chores",
      {
        agreement_id: agreement.id,
        first_date: dateKey(first),
        weeks: CHORE_WEEKS,
        chores: houseChores(
          agreement.terms as HouseTerms,
          [realIds[0], realIds[1]],
          first,
        ),
      },
      refetchOnDrain,
    );
  }
  function regenerateGym() {
    const gym = agreementsRef.current.find(
      (a) => a.slug === "gym" && a.status === "active",
    );
    if (gym) activateGym(gym);
  }
  function sign(slug: AgreementSlug) {
    if (!memberId) return;
    const uid = memberId;
    const ids = realIds;
    setError("");
    setAgreements((current) =>
      current.map((a) => {
        if (a.slug !== slug || a.signed_by.includes(uid)) return a;
        const signed = [...a.signed_by, uid];
        const active =
          ids.length === 2 && ids.every((id) => signed.includes(id));
        return {
          ...a,
          signed_by: signed,
          status: active ? ("active" as const) : a.status,
          updated_at: new Date().toISOString(),
        };
      }),
    );
    persist("sign", { slug }, (result) => {
      const row = agreementRow(result);
      if (row?.status !== "active") return;
      if (row.slug === "gym") activateGym(row);
      else activateHouse(row);
    });
  }
  function amend(
    agreementId: string,
    title: string,
    body: string,
    termsPatch?: Record<string, unknown> | null,
  ) {
    if (!memberId) return;
    const uid = memberId;
    setError("");
    setAmendments((current) => [
      {
        id: crypto.randomUUID(),
        agreement_id: agreementId,
        title,
        body,
        terms_patch: termsPatch ?? null,
        status: "open" as const,
        proposed_by: uid,
        decided_by: null,
        reason: null,
        created_at: new Date().toISOString(),
        decided_at: null,
      },
      ...current,
    ]);
    persist(
      "amend",
      { agreement_id: agreementId, title, body, terms_patch: termsPatch ?? null },
      refetchOnDrain,
    );
  }
  function decideAmendment(id: string, approve: boolean, reason?: string) {
    if (!memberId) return;
    const uid = memberId;
    setError("");
    const amendment = amendments.find((a) => a.id === id);
    const now = new Date().toISOString();
    setAmendments((current) =>
      current.map((a) =>
        a.id === id
          ? {
              ...a,
              status: approve ? ("approved" as const) : ("declined" as const),
              decided_by: uid,
              reason: reason ?? null,
              decided_at: now,
            }
          : a,
      ),
    );
    const patch = approve ? (amendment?.terms_patch ?? null) : null;
    if (patch && amendment)
      setAgreements((current) =>
        current.map((a) =>
          a.id === amendment.agreement_id
            ? {
                ...a,
                terms: { ...a.terms, ...patch } as HouseTerms | GymTerms,
                updated_at: now,
              }
            : a,
        ),
      );
    const touchesSchedule =
      Boolean(patch) &&
      ["template", "ramp"].some((key) => key in (patch as object));
    const gymPatched =
      touchesSchedule &&
      agreementsRef.current.some(
        (a) => a.id === amendment?.agreement_id && a.slug === "gym",
      );
    persist(
      "amend_decide",
      { id, approve, ...(reason ? { reason } : {}) },
      (result) => {
        if (!gymPatched) return;
        const row = agreementRow(result);
        if (row && row.slug === "gym" && row.status === "active")
          activateGym(row);
        else regenerateGym();
      },
    );
  }
  function withdrawAmendment(id: string) {
    if (!memberId) return;
    setError("");
    setAmendments((current) =>
      current.map((a) =>
        a.id === id ? { ...a, status: "withdrawn" as const } : a,
      ),
    );
    persist("amend_withdraw", { id });
  }
  function createEvent(
    agreementId: string,
    kind: AgreementEventKind,
    options: {
      entry_id?: string;
      hours?: number;
      details?: Record<string, unknown>;
    } = {},
  ) {
    if (!memberId) return;
    const uid = memberId;
    setError("");
    const unilateral = ["pto", "sick", "skip_rollover", "cover_repaid"].includes(
      kind,
    );
    setEvents((current) => [
      {
        id: crypto.randomUUID(),
        agreement_id: agreementId,
        entry_id: options.entry_id ?? null,
        kind,
        status: unilateral ? ("done" as const) : ("open" as const),
        actor: uid,
        hours: options.hours ?? null,
        details: options.details ?? {},
        created_at: new Date().toISOString(),
        decided_by: null,
        decided_at: null,
      },
      ...current,
    ]);
    persist(
      "event",
      {
        agreement_id: agreementId,
        kind,
        ...(options.entry_id ? { entry_id: options.entry_id } : {}),
        ...(options.hours != null ? { hours: options.hours } : {}),
        ...(options.details ? { details: options.details } : {}),
      },
      refetchOnDrain,
    );
  }
  function decideEvent(id: string, accept: boolean) {
    if (!memberId) return;
    const uid = memberId;
    setError("");
    const now = new Date().toISOString();
    setEvents((current) =>
      current.map((e) =>
        e.id === id
          ? {
              ...e,
              status: accept ? ("accepted" as const) : ("declined" as const),
              decided_by: uid,
              decided_at: now,
            }
          : e,
      ),
    );
    persist("event_decide", { id, accept });
  }
  function saveLog(
    entryId: string,
    values: {
      day_type: DayType;
      weights_minutes: number;
      cardio_minutes: number;
      exercises: GymExercise[];
      notes: string;
    },
  ) {
    if (!memberId) return;
    const uid = memberId;
    setError("");
    const now = new Date().toISOString();
    setLogs((current) => {
      const existing = current.find(
        (log) => log.entry_id === entryId && log.member === uid,
      );
      if (existing)
        return current.map((log) =>
          log === existing ? { ...log, ...values, updated_at: now } : log,
        );
      return [
        {
          id: crypto.randomUUID(),
          entry_id: entryId,
          member: uid,
          ...values,
          created_at: now,
          updated_at: now,
        },
        ...current,
      ];
    });
    persist("log", { entry_id: entryId, ...values }, refetchOnDrain);
  }
  // Realtime change ping from another device, wired by the hub like the
  // expenses controller's. Deferred to the drain during a local write.
  function ping() {
    if (!interested.current || document.visibilityState !== "visible") return;
    if (pending.current) recovery.current = true;
    else void refresh();
  }
  return {
    enabled: on,
    agreements,
    amendments,
    events,
    logs,
    pendingCount: on ? pendingForMember(agreements, amendments, events, memberId) : 0,
    loading: on && !loaded,
    error,
    saveDraft,
    propose,
    revoke,
    sign,
    amend,
    decideAmendment,
    withdrawAmendment,
    createEvent,
    decideEvent,
    saveLog,
    activateGym,
    activateHouse,
    regenerateGym,
    refresh,
    ping,
    dismissError: () => setError(""),
  };
}
export type AgreementsController = ReturnType<typeof useAgreements>;
