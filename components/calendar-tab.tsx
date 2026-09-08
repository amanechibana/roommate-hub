"use client";
import { Empty } from "./house-dialogs";

import { Button } from "@/components/ui/button";

import { billPaid, isBill } from "@/lib/household-actions";
import { dateKey, parseDate } from "@/lib/model";
import { ArrowDownToLine, ChevronLeft, ChevronRight } from "lucide-react";
import { type CSSProperties } from "react";

import type { useHousehold } from "@/lib/use-household";
type Props = Pick<
  ReturnType<typeof useHousehold>,
  | "members"
  | "entries"
  | "setEditing"
  | "month"
  | "setMonth"
  | "agendaPage"
  | "setAgendaPage"
  | "agendaLimit"
  | "setSelectedDay"
  | "agendaRef"
  | "filter"
  | "today"
  | "weeks"
  | "exportCalendar"
  | "monthEntries"
  | "person"
>;
export default function CalendarTab({
  members,
  entries,
  setEditing,
  month,
  setMonth,
  agendaPage,
  setAgendaPage,
  agendaLimit,
  setSelectedDay,
  agendaRef,
  filter,
  today,
  weeks,
  exportCalendar,
  monthEntries,
  person,
}: Props) {
  return (
    <section className="panel calendar-panel">
      <div className="panel-heading">
        <div className="month-control">
          <Button
            className="icon-button"
            aria-label="Previous month"
            onClick={() =>
              setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
            }
          >
            <ChevronLeft size={20} />
          </Button>
          <h2>
            {month.toLocaleDateString("en-US", {
              month: "long",
              year: "numeric",
            })}
          </h2>
          <Button
            className="icon-button"
            aria-label="Next month"
            onClick={() =>
              setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))
            }
          >
            <ChevronRight size={20} />
          </Button>
        </div>
        <div className="actions">
          <Button
            className="button secondary small"
            onClick={() => setMonth(new Date())}
          >
            Today
          </Button>
          <Button className="button secondary small" onClick={exportCalendar}>
            <ArrowDownToLine size={16} /> Export .ics
          </Button>
        </div>
      </div>
      <p className="calendar-help desktop-calendar-help">
        All-day plans and dated chores. Select a day to add a plan, or an entry
        to edit it.
      </p>
      <div
        className="mobile-agenda"
        ref={agendaRef}
        aria-label="This month’s agenda"
      >
        {monthEntries
          .slice(
            (agendaPage %
              Math.max(1, Math.ceil(monthEntries.length / agendaLimit))) *
              agendaLimit,
            ((agendaPage %
              Math.max(1, Math.ceil(monthEntries.length / agendaLimit))) +
              1) *
              agendaLimit,
          )
          .map((entry) => (
            <Button
              className="agenda-entry"
              key={entry.id}
              onClick={() => setEditing({ kind: entry.kind, entry })}
            >
              <span className="board-date">
                <small>
                  {parseDate(entry.date!).toLocaleDateString("en-US", {
                    weekday: "short",
                  })}
                </small>
                <b>{parseDate(entry.date!).getDate()}</b>
              </span>
              <span>
                <strong>
                  {entry.series_id ? "↻ " : ""}
                  {entry.done ? "✓ " : ""}
                  {entry.title}
                </strong>
                <small>
                  {entry.category} · {person(entry.assignee)}
                </small>
              </span>
              <ChevronRight size={17} />
            </Button>
          ))}
        {!monthEntries.length && (
          <Empty text="No plans this month. Add something to look forward to." />
        )}
      </div>
      <div className="agenda-pager">
        <Button
          aria-label="Previous agenda page"
          disabled={agendaPage === 0}
          onClick={() => setAgendaPage((p) => Math.max(0, p - 1))}
        >
          <ChevronLeft size={18} />
        </Button>
        <span>
          {Math.min(
            agendaPage + 1,
            Math.max(1, Math.ceil(monthEntries.length / agendaLimit)),
          )}{" "}
          / {Math.max(1, Math.ceil(monthEntries.length / agendaLimit))}
        </span>
        <Button
          aria-label="Next agenda page"
          disabled={(agendaPage + 1) * agendaLimit >= monthEntries.length}
          onClick={() => setAgendaPage((p) => p + 1)}
        >
          <ChevronRight size={18} />
        </Button>
      </div>
      <div className="calendar-scroll">
        <div
          className="calendar-grid"
          style={{ "--weeks": weeks } as CSSProperties}
        >
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
            <div className="weekday" key={day}>
              {day}
            </div>
          ))}
          {Array.from(
            {
              length:
                Math.ceil(
                  (new Date(month.getFullYear(), month.getMonth(), 1).getDay() +
                    new Date(
                      month.getFullYear(),
                      month.getMonth() + 1,
                      0,
                    ).getDate()) /
                    7,
                ) * 7,
            },
            (_, i) => {
              const date = new Date(
                month.getFullYear(),
                month.getMonth(),
                1 -
                  new Date(month.getFullYear(), month.getMonth(), 1).getDay() +
                  i,
              );
              const key = dateKey(date);
              const dayEntries = entries.filter(
                (e) => e.date === key && ["task", "event"].includes(e.kind),
              );
              return (
                <div
                  className={`calendar-cell ${date.getMonth() !== month.getMonth() ? "outside" : ""} ${key === today ? "is-today" : ""}`}
                  key={key}
                >
                  <Button
                    className="day-number"
                    aria-label={`Add event on ${key}`}
                    onClick={() => setEditing({ kind: "event", date: key })}
                  >
                    {date.getDate()}
                  </Button>
                  {dayEntries.length > 1 && (
                    <Button
                      className="day-more"
                      aria-label={`Show all ${dayEntries.length} entries on ${key}`}
                      onClick={() => setSelectedDay(key)}
                    >
                      +{dayEntries.length - 1}
                    </Button>
                  )}
                  {dayEntries.slice(0, 1).map((entry) => (
                    <Button
                      key={entry.id}
                      className={`calendar-event person-color-${
                        Math.max(
                          0,
                          members.findIndex(
                            (m) =>
                              m.user_id ===
                              (entry.assignee || entry.created_by),
                          ),
                        ) % 3
                      } ${entry.category === "Rent" ? "rent" : ""} ${entry.done ? "completed-event" : ""}`}
                      onClick={() => setEditing({ kind: entry.kind, entry })}
                    >
                      {entry.series_id ? "↻ " : ""}
                      {entry.done ? "✓ " : ""}
                      {entry.title}
                      {isBill(entry)
                        ? billPaid(entry)
                          ? " · Paid"
                          : " · Payment due"
                        : ""}
                    </Button>
                  ))}
                </div>
              );
            },
          )}
        </div>
      </div>
    </section>
  );
}
