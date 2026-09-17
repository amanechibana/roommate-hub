import type { Entry } from "./model";
import type {
  Agreement,
  Amendment,
  AgreementEvent,
  AgreementSlug,
} from "./agreements";
import type { CoverageRequest } from "./use-improvements";
import { billShare, collapseSeries, isBill } from "./household-actions";

export type AttentionItem = {
  id: string;
  title: string;
  date: string | null;
} & (
  | { kind: "chore" | "bill"; entry: Entry }
  | { kind: "agreement"; slug: AgreementSlug; reason: string }
  | { kind: "coverage"; request: CoverageRequest }
);
export function attentionItems({
  entries,
  uid,
  today,
  agreements,
  amendments,
  events,
  coverage,
}: {
  entries: Entry[];
  uid: string | null;
  today: string;
  agreements: Agreement[];
  amendments: Amendment[];
  events: AgreementEvent[];
  coverage: CoverageRequest[];
}): AttentionItem[] {
  if (!uid) return [];
  const actionable = entries
    .filter((entry) => {
      if (entry.visibility === "private" && entry.created_by !== uid)
        return false;
      if (entry.kind === "task") return !entry.done && entry.assignee === uid;
      return (
        isBill(entry) &&
        entry.payment_members?.includes(uid) &&
        !entry.paid_by?.includes(uid) &&
        billShare(entry, uid) !== 0
      );
    })
    .sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999"));
  const result: AttentionItem[] = collapseSeries(actionable, today).map(
    (entry) => ({
      id: entry.id,
      title: entry.title,
      date: entry.date,
      kind: entry.kind === "task" ? "chore" : "bill",
      entry,
    }),
  );
  for (const agreement of agreements) {
    if (agreement.status === "proposed" && !agreement.signed_by.includes(uid))
      result.push({
        id: agreement.id,
        kind: "agreement",
        title: agreement.title,
        slug: agreement.slug,
        date: null,
        reason: "Signature requested",
      });
    for (const amendment of amendments.filter(
      (a) =>
        a.agreement_id === agreement.id &&
        a.status === "open" &&
        a.proposed_by !== uid,
    ))
      result.push({
        id: amendment.id,
        kind: "agreement",
        title: amendment.title,
        slug: agreement.slug,
        date: null,
        reason: "Amendment to review",
      });
    for (const event of events.filter(
      (e) =>
        e.agreement_id === agreement.id &&
        e.status === "open" &&
        e.actor !== uid,
    ))
      result.push({
        id: event.id,
        kind: "agreement",
        title: `${agreement.title}: ${event.kind.replaceAll("_", " ")}`,
        slug: agreement.slug,
        date: null,
        reason: "Request to review",
      });
  }
  for (const request of coverage.filter(
    (r) =>
      r.status === "open" &&
      r.requester !== uid &&
      [r.original, r.candidate].includes(uid),
  )) {
    result.push({
      id: request.id,
      kind: "coverage",
      request,
      date: request.date,
      title:
        entries.find((e) => e.id === request.entry_id)?.title ??
        "Chore coverage",
    });
  }
  const rank = (item: AttentionItem) =>
    item.date && item.date < today
      ? 0
      : item.date === today
        ? 1
        : item.kind === "agreement" || item.kind === "coverage"
          ? 2
          : 3;
  return result.sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (a.date ?? "9999").localeCompare(b.date ?? "9999") ||
      a.title.localeCompare(b.title) ||
      a.id.localeCompare(b.id),
  );
}
