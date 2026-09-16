import "server-only";
import { sharedDatabase } from "./shared-server";
import {
  defaultHouseholdPreferences,
  defaultReminderPreferences,
  inQuietHours,
  localClock,
  type HouseholdPreferences,
  type ReminderPreferences,
  type NotificationTopic,
} from "./improvements";
export async function reminderRoster(): Promise<{
  household: HouseholdPreferences;
  members: Record<string, ReminderPreferences>;
}> {
  const data = await sharedDatabase(
    "reminder_roster",
    {},
    "shared_improvements",
  );
  return {
    household: { ...defaultHouseholdPreferences, ...data.household },
    members: data.members ?? {},
  };
}
export async function householdQuietHours(now: Date) {
  const { household } = await reminderRoster();
  return inQuietHours(
    localClock(now, household.timezone),
    household.quiet_start,
    household.quiet_end,
  );
}
export async function notificationAllowed(
  member: string,
  topic: NotificationTopic,
) {
  const { household, members } = await reminderRoster();
  const preferences = { ...defaultReminderPreferences, ...members[member] };
  return (
    preferences.topics.includes(topic) &&
    !inQuietHours(
      localClock(new Date(), household.timezone),
      household.quiet_start,
      household.quiet_end,
    )
  );
}
