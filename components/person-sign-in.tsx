"use client";

import { Button } from "@/components/ui/button";
import { homeRequest } from "@/lib/home-client";
import type { Member } from "@/lib/model";
import { useEffect, useState } from "react";

export default function PersonSignIn({
  members,
  ownerId,
  busy,
  onSignIn,
}: {
  members: Member[];
  ownerId: string | undefined;
  busy: boolean;
  onSignIn: (member: Member, password: string, code: string) => void;
}) {
  // null = unknown (older server or offline): fall back to letting the person
  // choose setup themselves.
  const [accounts, setAccounts] = useState<string[] | null>(null);
  const [selected, setSelected] = useState<Member | null>(null);
  const [settingUp, setSettingUp] = useState(false);
  useEffect(() => {
    homeRequest("/api/session")
      .then((data) => {
        if (Array.isArray(data.accounts)) setAccounts(data.accounts);
      })
      .catch(() => {});
  }, []);
  const people = members.filter((m) => m.name !== "Housemates");
  const owner = people.find((m) => m.user_id === ownerId);

  if (!selected)
    return (
      <div className="person-picker">
        {people.map((member, i) => (
          <Button
            className="button secondary"
            key={member.user_id}
            aria-label={member.name}
            disabled={busy}
            onClick={() => {
              setSelected(member);
              setSettingUp(
                accounts !== null && !accounts.includes(member.user_id),
              );
            }}
          >
            <span className={`avatar tone-${i % 3}`}>
              {member.name.slice(0, 1).toUpperCase()}
            </span>
            {member.name}
          </Button>
        ))}
      </div>
    );

  const isOwner = selected.user_id === ownerId;
  return (
    <form
      className="person-picker"
      onSubmit={(event) => {
        event.preventDefault();
        const values = new FormData(event.currentTarget);
        onSignIn(
          selected,
          String(values.get("password") || ""),
          settingUp ? String(values.get("enrollment_code") || "") : "",
        );
      }}
    >
      <h2>{settingUp ? `Set up ${selected.name}’s password` : selected.name}</h2>
      {settingUp && (
        <>
          <p className="subtle">
            {isOwner
              ? "Enter the owner setup secret once to create your account."
              : `Ask ${owner?.name ?? "the owner"} to create a sign-in invitation in Household settings, then paste it here. Invitations last 7 days.`}
          </p>
          <label>
            {isOwner ? "Owner setup secret" : "Invitation code"}
            <input
              name="enrollment_code"
              type="password"
              required
              maxLength={128}
              autoComplete="one-time-code"
            />
          </label>
        </>
      )}
      <label>
        {settingUp ? "New password" : "Password"}
        <input
          name="password"
          type="password"
          required
          minLength={10}
          maxLength={128}
          autoComplete={settingUp ? "new-password" : "current-password"}
          autoFocus
        />
      </label>
      {settingUp && <p className="subtle">At least 10 characters.</p>}
      <Button className="button" disabled={busy}>
        {settingUp ? "Create account" : "Sign in"}
      </Button>
      {accounts === null && (
        <Button
          className="text-button"
          type="button"
          onClick={() => setSettingUp(!settingUp)}
        >
          {settingUp ? "I already have a password" : "First time? Set up your password"}
        </Button>
      )}
      <Button
        className="text-button"
        type="button"
        onClick={() => setSelected(null)}
      >
        Not {selected.name}?
      </Button>
    </form>
  );
}
