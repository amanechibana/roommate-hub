import type { Entry, Member } from "./model";
export function householdSetup(
  members: Member[],
  entries: Entry[],
  notificationsReviewed: boolean,
) {
  return [
    {
      id: "members",
      title: "Invite your housemates",
      detail:
        "Add everyone who shares the home and share the household code privately.",
      done:
        members.filter((m) => m.name !== "Housemates" && m.active !== false)
          .length >= 2,
    },
    {
      id: "bills",
      title: "Add a recurring bill",
      detail:
        "Set up rent or a shared bill with a repeat schedule and everyone’s payment share.",
      done: entries.some(
        (e) =>
          e.kind === "event" &&
          ["Rent", "Bill"].includes(e.category) &&
          !!e.series_id,
      ),
    },
    {
      id: "chores",
      title: "Plan recurring chores",
      detail:
        "Add a recurring chore, estimate its minutes, and choose housemates for the rotation.",
      done: entries.some(
        (e) =>
          e.kind === "task" &&
          e.category === "Chore" &&
          !!e.series_id &&
          !!e.effort_minutes &&
          (e.rotation_members?.length ?? 0) >= 2,
      ),
    },
    {
      id: "notifications",
      title: "Choose your notifications",
      detail:
        "Review reminder times and topics, then save your choices. You can opt out; device push notifications are enabled separately.",
      done: notificationsReviewed,
    },
  ];
}
