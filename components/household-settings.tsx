"use client";

import { useState } from "react";
import { AnimatePresence } from "motion/react";
import { PaperDialog } from "./ui/dialog";
import { Button } from "@/components/ui/button";

import PushSettings from "@/components/push-settings";
import CalendarFeed from "@/components/calendar-feed";
import AgreementsSection from "@/components/agreements-section";
import HouseholdReliability from "@/components/household-reliability";
import HouseholdHistory from "@/components/household-history";
import { AmbientToggle } from "@/components/ui/display-button";
import { type Member } from "@/lib/model";
import { ArrowDownToLine, Plus, ShieldCheck, Users } from "lucide-react";

import type { useHousehold } from "@/lib/use-household";
type Props = Pick<
  ReturnType<typeof useHousehold>,
  | "demo"
  | "household"
  | "members"
  | "entries"
  | "busy"
  | "live"
  | "exportCalendar"
  | "addMember"
  | "manageMembership"
  | "sharedScreen"
  | "uid"
  | "setChoosingPerson"
  | "refresh"
> & { avatar: (member: Member, index: number) => import("react").ReactNode };
export default function HouseholdSettings({
  demo,
  household,
  members,
  entries,
  busy,
  live,
  exportCalendar,
  addMember,
  manageMembership,
  sharedScreen,
  avatar,
  uid,
  setChoosingPerson,
  refresh,
}: Props) {
  const [confirm, setConfirm] = useState<{
    operation: "remove_member" | "leave" | "transfer_owner";
    member?: string;
    name: string;
  } | null>(null);
  if (!household) return null;
  const owner = uid === household.owner_id;

  return (
    <div className="settings-grid">
      <section className="panel settings-panel">
        <h2>
          <Users size={20} /> {household.name}
        </h2>
        <p className="subtle">People who share this home.</p>
        <p>
          Using this device as{" "}
          <strong>
            {members.find((member) => member.user_id === uid)?.name ||
              "a housemate"}
          </strong>
          .
        </p>
        <Button
          className="button secondary"
          onClick={() => setChoosingPerson(true)}
        >
          Change person on this device
        </Button>
        {members.map((member, i) =>
          // Keep avatar indices aligned while hiding the shared-screen identity.
          member.name === "Housemates" ? null : (
            <div className="member-row" key={member.user_id}>
              {avatar(member, i)}
              <strong>{member.name}</strong>
              <span className="subtle">
                {member.user_id === household.owner_id ? "Owner" : "Housemate"}
              </span>
              {!sharedScreen && owner && member.user_id !== uid && (
                <>
                  <Button
                    className="text-button"
                    disabled={busy}
                    onClick={() =>
                      setConfirm({
                        operation: "transfer_owner",
                        member: member.user_id,
                        name: member.name,
                      })
                    }
                  >
                    Transfer ownership
                  </Button>
                  <Button
                    className="text-button"
                    disabled={busy}
                    onClick={() =>
                      setConfirm({
                        operation: "remove_member",
                        member: member.user_id,
                        name: member.name,
                      })
                    }
                  >
                    Remove housemate
                  </Button>
                </>
              )}
            </div>
          ),
        )}
        {sharedScreen ? (
          <p className="subtle">
            This device is signed in as the household, so it reads the house but
            doesn’t check things off. Pick a person above to join in.
          </p>
        ) : owner &&
          members.filter((m) => m.name !== "Housemates").length < 2 ? (
          <>
            <h3>Invite a housemate</h3>
            <p className="subtle">
              Add their name, then share the household code with them privately.
              They can open this site and choose their name after signing in.
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
                Invite housemate
              </Button>
            </form>
          </>
        ) : (
          <p className="subtle">
            {owner
              ? "Households currently support two people. You can invite a replacement after a housemate leaves."
              : "The household owner manages invitations and removals."}
          </p>
        )}
        {!sharedScreen && (
          <>
            <h3>Leave this household</h3>
            <p className="subtle">
              Past expenses and moving checklists stay with the house. Future
              reservations are canceled.{" "}
              {owner && "Transfer ownership to your housemate first."}
            </p>
            <Button
              className="button secondary"
              disabled={busy || owner}
              onClick={() => setConfirm({ operation: "leave", name: "you" })}
            >
              Leave household
            </Button>
            {!demo && (
              <p className="subtle">
                Access uses a shared household code. To revoke a departing
                person’s access to the home and its calendar feed, the owner
                must change that code in the hosting settings.
              </p>
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
            ? "You’re exploring a sample home. Connect Supabase and configure your household code to save across devices."
            : live
              ? "Anyone with your household code can use this home. Keep it between housemates. Changes from other devices appear live while this page is open."
              : "Anyone with your household code can use this home. Keep it between housemates. Changes refresh every 15 seconds while this page is visible."}
        </p>
        {demo && (
          <p className="subtle">
            Setup instructions are in this project’s README: create a Supabase
            project, apply the included database migration, and add your project
            URL and publishable key.
          </p>
        )}
        {!demo && <PushSettings />}
        <h3>Display motion</h3>
        <p className="subtle">
          Gentle details for this device. Your system’s reduced-motion
          preference is always respected.
        </p>
        <AmbientToggle />
        <h3>Calendar export</h3>
        <p className="subtle">
          Download your dated chores and events for Apple Calendar, Google
          Calendar, or Outlook.
        </p>
        <Button className="button secondary" onClick={exportCalendar}>
          <ArrowDownToLine size={16} /> Export calendar
        </Button>
        {!demo && <CalendarFeed />}
        <h3>Shopping, with fewer tabs</h3>
        <p className="subtle">
          Paste an Amazon or other store’s product link when adding an item and
          the name and price fill in when the store allows it. Some stores block
          lookups — you can always type the details yourself. Account linking
          isn’t connected.
        </p>
      </section>
      <AgreementsSection
        members={members}
        uid={uid}
        entries={entries}
        refreshHousehold={refresh}
      />
      {!demo && <HouseholdReliability readOnly={sharedScreen} />}
      {!demo && <HouseholdHistory />}
      <AnimatePresence>
        {confirm && (
          <PaperDialog
            aria-labelledby="membership-title"
            onClose={() => {
              if (!busy) setConfirm(null);
            }}
          >
            <h2 id="membership-title">
              {confirm.operation === "transfer_owner"
                ? `Transfer ownership to ${confirm.name}?`
                : confirm.operation === "leave"
                  ? "Leave this household?"
                  : `Remove ${confirm.name}?`}
            </h2>
            <p>
              {confirm.operation === "transfer_owner"
                ? "They will manage invitations, removals, and ownership. You will remain a housemate."
                : "Past records remain. Future reservations are canceled, shared chores become unassigned, and existing agreements return to draft for the new household to review."}
            </p>
            <div className="dialog-actions">
              <Button
                className="button secondary"
                disabled={busy}
                onClick={() => setConfirm(null)}
              >
                Cancel
              </Button>
              <Button
                className="button"
                disabled={busy}
                onClick={async () => {
                  if (await manageMembership(confirm.operation, confirm.member))
                    setConfirm(null);
                }}
              >
                {confirm.operation === "transfer_owner"
                  ? "Transfer ownership"
                  : confirm.operation === "leave"
                    ? "Leave household"
                    : "Remove housemate"}
              </Button>
            </div>
          </PaperDialog>
        )}
      </AnimatePresence>
    </div>
  );
}
