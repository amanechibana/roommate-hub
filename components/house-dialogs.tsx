"use client";
import { PaperDialog } from "./ui/dialog";

import { Button } from "@/components/ui/button";

import { billPaid, isBill } from "@/lib/household-actions";
import { parseDate, type Entry } from "@/lib/model";
import { ChevronRight, Leaf, Plus, X } from "lucide-react";

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const rows: [string, string][] = [
    ["1 – 6", "Switch tabs"],
    ["N", "Add to the current tab"],
    ["/", "Jump to quick add"],
    ["Esc", "Close dialogs"],
    ["?", "Show these shortcuts"],
  ];
  return (
    <PaperDialog
      onClose={onClose}
      className="entry-dialog"
      aria-labelledby="shortcuts-title"
    >
      <div className="dialog-heading">
        <h2 id="shortcuts-title">Keyboard shortcuts</h2>
        <Button
          className="icon-button"
          aria-label="Close shortcuts"
          onClick={onClose}
        >
          <X size={20} />
        </Button>
      </div>
      {rows.map(([keys, action]) => (
        <div className="shortcut-row" key={keys}>
          <kbd>{keys}</kbd>
          <span>{action}</span>
        </div>
      ))}
    </PaperDialog>
  );
}

export function DayDialog({
  date,
  entries,
  person,
  onClose,
  onOpen,
  onAdd,
}: {
  date: string;
  entries: Entry[];
  person: (id: string | null) => string;
  onClose: () => void;
  onOpen: (entry: Entry) => void;
  onAdd: () => void;
}) {
  return (
    <PaperDialog
      onClose={onClose}
      className="entry-dialog"
      aria-labelledby="day-title"
    >
      <div className="dialog-heading">
        <h2 id="day-title">
          {parseDate(date).toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </h2>
        <Button
          className="icon-button"
          aria-label="Close day"
          onClick={onClose}
        >
          <X size={20} />
        </Button>
      </div>
      {entries.map((entry) => (
        <Button
          className="agenda-entry"
          key={entry.id}
          onClick={() => onOpen(entry)}
        >
          <span>
            <strong>
              {entry.series_id ? "↻ " : ""}
              {entry.done ? "✓ " : ""}
              {entry.title}
            </strong>
            <small>
              {entry.category}, {person(entry.assignee)}
              {isBill(entry)
                ? billPaid(entry)
                  ? ", paid"
                  : ", payment due"
                : ""}
            </small>
          </span>
          <ChevronRight size={16} />
        </Button>
      ))}
      <Button className="button" onClick={onAdd}>
        <Plus size={16} />
        Add event
      </Button>
    </PaperDialog>
  );
}

export function Empty({ text }: { text: string }) {
  return (
    <div className="empty">
      <Leaf size={25} />
      <p>{text}</p>
    </div>
  );
}
