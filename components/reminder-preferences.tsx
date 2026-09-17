"use client";
import { useState } from "react";
import { Button } from "./ui/button";
import {
  inQuietHours,
  notificationTopics,
  type HouseholdPreferences,
  type ReminderPreferences,
} from "@/lib/improvements";
import type { ImprovementsController } from "@/lib/use-improvements";
export default function ReminderPreferencesForm({
  controller,
  readOnly,
}: {
  controller: ImprovementsController;
  readOnly: boolean;
}) {
  const [message, setMessage] = useState("");
  if (!controller.loaded)
    return (
      <p className="subtle">
        {controller.error || "Loading reminder preferences…"}
      </p>
    );
  return (
    <section
      id="household-notifications"
      className="panel settings-panel settings-wide"
    >
      <h2>Household time & notifications</h2>
      <p className="subtle">
        Quiet hours and timezone apply to the home. Reminder times and
        notification choices follow your selected person across devices. Equal
        quiet-hour times turn quiet hours off.
      </p>
      <div className="form-pair">
        <form
          key={JSON.stringify(controller.household)}
          onSubmit={async (event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const settings: HouseholdPreferences = {
              ...controller.household,
              timezone: String(data.get("timezone")),
              quiet_start: String(data.get("quiet_start")),
              quiet_end: String(data.get("quiet_end")),
            };
            if (await controller.saveHousehold(settings))
              setMessage("Household time settings saved.");
          }}
        >
          <fieldset disabled={readOnly || controller.busy}>
            <legend>Shared household settings</legend>
            <label>
              Household timezone
              <input
                name="timezone"
                list="household-timezones"
                required
                defaultValue={controller.household.timezone}
                placeholder="America/New_York"
              />
            </label>
            <datalist id="household-timezones">
              {Intl.supportedValuesOf("timeZone").map((zone) => (
                <option key={zone} value={zone} />
              ))}
            </datalist>
            <div className="form-grid">
              <label>
                Quiet hours start
                <input
                  name="quiet_start"
                  type="time"
                  required
                  defaultValue={controller.household.quiet_start}
                />
              </label>
              <label>
                Quiet hours end
                <input
                  name="quiet_end"
                  type="time"
                  required
                  defaultValue={controller.household.quiet_end}
                />
              </label>
            </div>
            <Button className="button secondary">Save household time</Button>
          </fieldset>
        </form>
        <form
          key={JSON.stringify(controller.reminders)}
          onSubmit={async (event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const settings: ReminderPreferences = {
              setup_reviewed: true,
              morning: data.has("morning_enabled")
                ? String(data.get("morning"))
                : null,
              evening: data.has("evening_enabled")
                ? String(data.get("evening"))
                : null,
              topics: notificationTopics.filter((topic) => data.has(topic)),
            };
            if (
              [settings.morning, settings.evening].some(
                (time) =>
                  time &&
                  inQuietHours(
                    time,
                    controller.household.quiet_start,
                    controller.household.quiet_end,
                  ),
              )
            ) {
              setMessage(
                "Choose reminder times outside household quiet hours.",
              );
              return;
            }
            if (await controller.saveReminders(settings))
              setMessage("Your notification preferences saved.");
          }}
        >
          <fieldset disabled={readOnly || controller.busy}>
            <legend>Your notifications</legend>
            <div className="form-grid">
              {(["morning", "evening"] as const).map((edition) => (
                <div key={edition}>
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      name={`${edition}_enabled`}
                      defaultChecked={controller.reminders[edition] !== null}
                    />
                    {edition === "morning"
                      ? "Morning digest"
                      : "Evening heads-up"}
                  </label>
                  <label>
                    {edition === "morning"
                      ? "Morning reminder time"
                      : "Evening reminder time"}
                    <input
                      type="time"
                      name={edition}
                      required
                      defaultValue={
                        controller.reminders[edition] ??
                        (edition === "morning" ? "08:00" : "19:00")
                      }
                    />
                  </label>
                </div>
              ))}
            </div>
            <div className="form-grid">
              {notificationTopics.map((topic) => (
                <label className="checkbox-row" key={topic}>
                  <input
                    type="checkbox"
                    name={topic}
                    defaultChecked={controller.reminders.topics.includes(topic)}
                  />
                  {topic[0].toUpperCase() + topic.slice(1)}
                </label>
              ))}
            </div>
            <Button className="button secondary">
              Save notification choices
            </Button>
          </fieldset>
        </form>
      </div>
      {controller.error && (
        <p className="error" role="alert">
          {controller.error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
