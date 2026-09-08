"use client";
import { activityVerb, activityWhen, type HouseActivity } from "@/lib/activity";
import type { Member } from "@/lib/model";

export default function ActivityFeed({
  activity,
  members,
}: {
  activity: HouseActivity[];
  members: Member[];
}) {
  const now = new Date();
  return (
    <section className="panel activity-feed" aria-labelledby="activity-title">
      <h2 id="activity-title">Lately at home</h2>
      {activity.length ? (
        <ol>
          {activity.slice(0, 20).map((item) => (
            <li key={item.id}>
              <span>
                <strong>
                  {members.find((member) => member.user_id === item.actor)
                    ?.name || "A housemate"}
                </strong>{" "}
                {activityVerb(item.action)} {item.title}
              </span>
              <time
                dateTime={item.created_at}
                title={new Date(item.created_at).toLocaleString()}
              >
                {activityWhen(new Date(item.created_at).getTime(), now)}
              </time>
            </li>
          ))}
        </ol>
      ) : (
        <p className="subtle">
          Completed chores, purchases, and new notes will show up here.
        </p>
      )}
    </section>
  );
}
