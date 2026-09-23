"use client";

import { useState } from "react";
import { AnimatePresence } from "motion/react";
import { PaperDialog } from "./ui/dialog";
import { Button } from "@/components/ui/button";

import HouseholdSetup from "./household-setup";
import ReminderPreferencesForm from "./reminder-preferences";
import type { ImprovementsController } from "@/lib/use-improvements";
import PushSettings from "@/components/push-settings";
import CalendarFeed from "@/components/calendar-feed";
import AgreementsSection from "@/components/agreements-section";
import HouseholdReliability from "@/components/household-reliability";
import HouseholdHistory from "@/components/household-history";
import { AmbientToggle } from "@/components/ui/display-button";
import { homeRequest } from "@/lib/home-client";
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
  | "setTab"
  | "setEditing"
> & {
  improvements: ImprovementsController;
  avatar: (member: Member, index: number) => import("react").ReactNode;
};
export default function HouseholdSettings({
  demo,
  improvements,
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
  setTab,
  setEditing,
}: Props) {
  const [confirm, setConfirm] = useState<{
    operation: "remove_member" | "leave" | "transfer_owner";
    member?: string;
    name: string;
  } | null>(null);
  const [backupStatus, setBackupStatus] = useState("");
  const [invite, setInvite] = useState<{
    name: string;
    code: string;
    expires_at: string;
  } | null>(null);
  const [backupBusy, setBackupBusy] = useState(false);
  async function exportBackup() {
    setBackupBusy(true);
    setBackupStatus("");
    try {
      const backup = await homeRequest("/api/backup");
      const blob = new Blob([JSON.stringify(backup, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `common-ground-household-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setBackupStatus("Household backup downloaded.");
    } catch (err) {
      setBackupStatus((err as Error).message);
    } finally {
      setBackupBusy(false);
    }
  }
  async function restoreBackup(file: File) {
    setBackupBusy(true);
    setBackupStatus("");
    try {
      if (file.size > 10_000_000) throw new Error("Backup is too large.");
      const backup = JSON.parse(await file.text());
      if (
        backup?.format !== "common-ground-household" ||
        backup?.household_id !== household?.id
      )
        throw new Error("Choose a backup from this household.");
      const result = await homeRequest("/api/backup", "POST", backup);
      const count = Object.values(result.restored || {}).reduce(
        (total: number, value) => total + Number(value || 0),
        0,
      );
      setBackupStatus(
        `Restored ${count} missing records. Refreshing household data…`,
      );
      await refresh(true);
    } catch (err) {
      setBackupStatus((err as Error).message);
    } finally {
      setBackupBusy(false);
    }
  }
  if (!household) return null;
  const owner = uid === household.owner_id;
  async function createAccountInvite(member: Member) {
    try {
      const result = await homeRequest("/api/account-invite", "POST", {
        member_id: member.user_id,
      });
      setInvite({
        name: member.name,
        code: result.code,
        expires_at: result.expires_at,
      });
    } catch (err) {
      setBackupStatus((err as Error).message);
    }
  }

  return (
    <div className="settings-grid">
      {owner && !demo && (
        <section className="panel settings-panel">
          <h2>Household backup</h2>
          <p className="subtle">
            Download shared plans, chores, shopping, handbook entries, and
            planning records, plus your own private entries. Restore adds
            missing records to this household. Other members’ private entries
            and file attachments need separate backups.
          </p>
          <Button
            className="button secondary"
            disabled={backupBusy}
            onClick={() => void exportBackup()}
          >
            Download backup
          </Button>
          <label>
            Restore from backup
            <input
              type="file"
              accept="application/json,.json"
              disabled={backupBusy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void restoreBackup(file);
                event.target.value = "";
              }}
            />
          </label>
          {backupStatus && <p role="status">{backupStatus}</p>}
        </section>
      )}
      <HouseholdSetup
        members={members}
        entries={entries}
        notificationsReviewed={!!improvements.reminders.setup_reviewed}
        readOnly={sharedScreen}
        navigate={(step) => {
          if (step === "members")
            document
              .getElementById("household-members")
              ?.scrollIntoView({ behavior: "smooth" });
          else if (step === "notifications")
            document
              .getElementById("household-notifications")
              ?.scrollIntoView({ behavior: "smooth" });
          else {
            setTab(step === "bills" ? "Calendar" : "To-dos");
            setEditing({
              kind: step === "bills" ? "event" : "task",
              setup: step === "bills" ? "bills" : "chores",
            });
          }
        }}
      />
      <section id="household-members" className="panel settings-panel">
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
              {owner && uid !== member.user_id && !demo && (
                <Button
                  className="text-button"
                  onClick={() => void createAccountInvite(member)}
                >
                  Create sign-in invitation
                </Button>
              )}
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
        {invite && (
          <p role="status">
            Invitation for {invite.name}: <code>{invite.code}</code>. Share it
            privately; it expires{" "}
            {new Date(invite.expires_at).toLocaleDateString()}.
          </p>
        )}
        {sharedScreen ? (
          <p className="subtle">
            This device is signed in as the household, so it reads the house but
            doesn’t check things off. Pick a person above to join in.
          </p>
        ) : owner ? (
          <>
            <h3>Invite a housemate</h3>
            <p className="subtle">
              Add their name, create a sign-in invitation above, then share the
              household code and invitation with them privately. Adding a
              housemate returns existing agreements to draft so everyone can
              review and sign them together.
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
            The household owner manages invitations and removals.
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
          {demo ? "Make yourself at home" : "Who can access this home"}
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
        <h3>Personal visibility</h3>
        <p className="subtle">
          Personal items stay off shared boards and reminders. “Personal view
          only” restricts an item to its creator’s signed-in account. The
          household code alone opens a read-only view. Offline copies stay on
          this device until sign-out or an account change.
        </p>
        {!demo && !sharedScreen && <PushSettings />}
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
        <Button
          className="button secondary"
          onClick={() => void exportCalendar()}
        >
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
      <ReminderPreferencesForm
        controller={improvements}
        readOnly={sharedScreen}
      />
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
