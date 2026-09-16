import type { Agreement, Amendment, AgreementEvent } from "./agreements";

export const reliefLabels: Record<string, string> = {
  swap: "chore swap",
  skip_cover: "chore cover",
  reschedule: "gym reschedule",
  pto: "gym PTO",
  sick: "sick day",
  skip_rollover: "chore rollover",
  cover_repaid: "repaid chore cover",
};

// Only committed gateway rows determine notification content and recipients.
export function agreementNotification(
  operation: string,
  result: Record<string, unknown>,
  name: string,
) {
  const agreement = result.agreement as Agreement | undefined;
  const amendment = result.amendment as Amendment | undefined;
  const event = result.event as AgreementEvent | undefined;
  const base = {
    member: undefined as string | undefined,
    url: "/?tab=Our%20household",
  };
  if (agreement && ["propose", "sign", "revoke"].includes(operation))
    return {
      ...base,
      tag: `agreement-${agreement.id}`,
      title: `${name} ${operation === "propose" ? "proposed an agreement" : operation === "sign" ? "signed your agreement" : "withdrew an agreement"}`,
      body: `${agreement.title}${operation === "propose" ? " — open Agreements to review and sign." : agreement.status === "active" ? " — now in force." : ""}`,
    };
  if (
    amendment &&
    ["amend", "amend_decide", "amend_withdraw"].includes(operation)
  )
    return {
      ...base,
      tag: `amendment-${amendment.id}`,
      member: operation === "amend" ? undefined : amendment.proposed_by,
      title: `${name} ${operation === "amend" ? "proposed an amendment" : amendment.status + " your amendment"}`,
      body: `${amendment.title}${operation === "amend" ? " — your decision is needed in Agreements." : amendment.reason ? ` — ${amendment.reason}` : ""}`,
    };
  if (event && ["event", "event_decide"].includes(operation))
    return {
      ...base,
      tag: `relief-${event.id}`,
      member: operation === "event_decide" ? event.actor : undefined,
      title: `${name} ${operation === "event_decide" ? `${event.status} your request` : event.status === "open" ? "requested relief" : "recorded relief"}`,
      body: `${reliefLabels[event.kind] ?? event.kind}${event.hours != null ? ` (${event.hours} hours)` : ""}${event.status === "open" ? " — your decision is needed in Agreements." : " — see Agreements for details."}`,
    };
  return null;
}
