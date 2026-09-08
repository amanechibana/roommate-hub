"use client";

import { Button } from "@/components/ui/button";

import PushSettings from "@/components/push-settings";
import { AmbientToggle } from "@/components/ui/display-button";
import { type Member } from "@/lib/model";
import { ArrowDownToLine, Plus, ShieldCheck, Users } from "lucide-react";

import type { useHousehold } from "@/lib/use-household";
type Props = Pick<
  ReturnType<typeof useHousehold>,
  | "demo"
  | "household"
  | "members"
  | "busy"
  | "live"
  | "exportCalendar"
  | "addMember"
  | "uid"
  | "setChoosingPerson"
> & { avatar: (member: Member, index: number) => import("react").ReactNode };
export default function HouseholdSettings({
  demo,
  household,
  members,
  busy,
  live,
  exportCalendar,
  addMember,
  avatar,
  uid,
  setChoosingPerson,
}: Props) {
  if (!household) return null;
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
        {members.map((member, i) => (
          <div className="member-row" key={member.user_id}>
            {avatar(member, i)}
            <strong>{member.name}</strong>
            <span className="subtle">
              {member.user_id === household.owner_id
                ? "Shared home"
                : "Housemate"}
            </span>
          </div>
        ))}
        <h3>Add your housemates</h3>
        <p className="subtle">
          Everyone uses the same household code. Add names here to assign chores
          and leave notes for each other.
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
            Add housemate
          </Button>
        </form>
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
        <h3>Shopping, with fewer tabs</h3>
        <p className="subtle">
          Paste an Amazon or other store’s product link when adding an item and
          the name and price fill in when the store allows it. Some stores block
          lookups — you can always type the details yourself. Account linking
          isn’t connected.
        </p>
      </section>
    </div>
  );
}
