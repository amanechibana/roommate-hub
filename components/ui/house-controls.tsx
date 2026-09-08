"use client";
import * as Menu from "@radix-ui/react-dropdown-menu";
import * as Popover from "@radix-ui/react-popover";
import * as Avatar from "@radix-ui/react-avatar";
import { MoreHorizontal, Plus } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "./button";
import { expenseMoney } from "@/lib/expenses";

export function EntryMenu({
  title,
  onEdit,
  onDelete,
  onConvert,
}: {
  title: string;
  onEdit: () => void;
  onDelete: () => void;
  onConvert?: () => void;
}) {
  return (
    <Menu.Root>
      <Menu.Trigger asChild>
        <Button
          className="icon-button entry-menu"
          aria-label={`Actions for ${title}`}
        >
          <MoreHorizontal size={17} />
        </Button>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content className="paper-menu" sideOffset={5} align="end">
          <Menu.Item onSelect={onEdit}>Edit</Menu.Item>
          {onConvert && (
            <Menu.Item onSelect={onConvert}>
              Convert to to-do, plan, or item
            </Menu.Item>
          )}
          <Menu.Separator />
          <Menu.Item className="danger" onSelect={onDelete}>
            Delete
          </Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}

export function NoteComposer({
  onSave,
}: {
  onSave: (title: string, description: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <Button className="button secondary small">
          <Plus size={15} /> Leave a note
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="paper-popover"
          sideOffset={8}
          aria-label="Quick note"
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              const title = String(data.get("title") || "").trim();
              if (!title) return;
              onSave(title, String(data.get("description") || "").trim());
              setOpen(false);
            }}
          >
            <label>
              Note title
              <input
                name="title"
                required
                maxLength={160}
                placeholder="A little reminder…"
              />
            </label>
            <label>
              Your note
              <textarea name="description" rows={3} maxLength={5000} />
            </label>
            <div className="dialog-actions">
              <Popover.Close asChild>
                <Button type="button" className="text-button">
                  Cancel
                </Button>
              </Popover.Close>
              <Button className="button small">Pin note</Button>
            </div>
          </form>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function MemberCard({
  name,
  balance,
  chores,
  children,
}: {
  name: string;
  balance: number | null;
  chores: number;
  children: ReactNode;
}) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="member-trigger"
          aria-label={`About ${name}`}
        >
          {children}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="paper-popover member-card"
          sideOffset={8}
          aria-label={`About ${name}`}
        >
          <Avatar.Root className="avatar">
            <Avatar.Fallback>{name.slice(0, 1).toUpperCase()}</Avatar.Fallback>
          </Avatar.Root>
          <strong>{name}</strong>
          <p>
            {chores} open {chores === 1 ? "to-do" : "to-dos"}
          </p>
          <p>
            {balance === null
              ? "Balance available in Expenses"
              : balance === 0
                ? "Settled up"
                : `${expenseMoney(Math.abs(balance))} ${balance > 0 ? "owed to them" : "to repay"}`}
          </p>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
