/* Only the shopping snapshot is stored. Household authentication stays in
   HttpOnly cookies and is checked afresh for every replay. */
(() => {
  const CACHE = "common-ground-offline-shopping-v1";
  const QUEUE = "common-ground-offline-shopping-queue-v1";
  const $ = (id) => document.getElementById(id);
  let snapshot;
  const readQueue = () => JSON.parse(localStorage.getItem(QUEUE) || "[]");
  const writeQueue = (queue) =>
    localStorage.setItem(QUEUE, JSON.stringify(queue));
  const lock = (work) =>
    navigator.locks
      ? navigator.locks.request("common-ground-shopping", work)
      : Promise.resolve().then(work);
  try {
    snapshot = JSON.parse(localStorage.getItem(CACHE) || "null");
  } catch {}
  if (!snapshot) {
    $("status").textContent =
      "Open Shopping at home while online to save a list on this device.";
    $("sync").hidden = true;
    return;
  }
  $("saved").textContent =
    `${snapshot.household.name} · Saved ${new Date(snapshot.saved_at).toLocaleString()}`;
  let syncing = false;
  const conflicts = new Map();
  function render(message) {
    let queue;
    try {
      queue = readQueue();
    } catch {
      queue = [];
    }
    $("items").replaceChildren();
    const items = [...snapshot.entries].sort(
      (a, b) => Number(a.done) - Number(b.done),
    );
    for (const item of items) {
      const pending = queue.find((q) => q.id === item.id);
      const done = pending ? pending.done : item.done;
      const li = document.createElement("li");
      li.className = done ? "bought" : "";
      const label = document.createElement("label");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = done;
      input.disabled = !snapshot.actor || syncing;
      input.setAttribute("aria-label", `Bought ${item.title}`);
      const text = document.createElement("span");
      const title = document.createElement("strong");
      title.textContent = item.title;
      const detail = document.createElement("small");
      const name = snapshot.members.find(
        (m) => m.user_id === item.assignee,
      )?.name;
      detail.textContent = [
        item.category,
        name,
        item.amount != null
          ? new Intl.NumberFormat("en-US", {
              style: "currency",
              currency: "USD",
            }).format(item.amount)
          : "",
        item.description,
        pending ? "Waiting to sync" : "",
      ]
        .filter(Boolean)
        .join(" · ");
      text.append(title, detail);
      label.append(input, text);
      li.append(label);
      $("items").append(li);
      const conflict = conflicts.get(item.id);
      if (conflict) {
        const explanation = document.createElement("small");
        explanation.textContent = conflict.error;
        const resolve = document.createElement("button");
        resolve.type = "button";
        resolve.textContent = "Use latest household version";
        resolve.disabled = syncing;
        resolve.addEventListener(
          "click",
          () =>
            void lock(async () => {
              writeQueue(readQueue().filter((q) => q.id !== item.id));
              snapshot.entries = conflict.entry
                ? snapshot.entries.map((e) =>
                    e.id === item.id ? conflict.entry : e,
                  )
                : snapshot.entries.filter((e) => e.id !== item.id);
              localStorage.setItem(CACHE, JSON.stringify(snapshot));
              conflicts.delete(item.id);
              render();
            }),
        );
        li.append(explanation, resolve);
      }
      input.addEventListener(
        "change",
        () =>
          void lock(async () => {
            try {
              const queue = readQueue().filter((q) => q.id !== item.id);
              if (input.checked !== item.done)
                queue.push({
                  id: item.id,
                  write_id: crypto.randomUUID(),
                  household_id: snapshot.household.id,
                  actor: snapshot.actor,
                  done: input.checked,
                  expected_done: item.done,
                  expected_completed_at: item.completed_at || null,
                  expected_title: item.title,
                  expected_amount: item.amount,
                  expected_category: item.category,
                  expected_assignee: item.assignee,
                });
              writeQueue(queue);
              render();
            } catch {
              render(
                "Could not save on this device. Free storage and try again.",
              );
            }
          }).then(() => {
            if (navigator.onLine) void sync();
          }),
      );
    }
    $("empty").textContent = items.length
      ? ""
      : "Nothing on the saved shopping list.";
    $("sync").disabled = syncing || !snapshot.actor;
    $("status").textContent =
      message ||
      (!snapshot.actor
        ? "Shared screen: choose a person at home to check items off."
        : syncing
          ? "Syncing your check-offs…"
          : queue.length
            ? `${queue.length} change${queue.length === 1 ? "" : "s"} saved on this device. ${navigator.onLine ? "Ready to sync." : "Will sync when your signal returns."}`
            : navigator.onLine
              ? "Your saved checklist is ready. Check-offs sync when online."
              : "Offline. You can keep checking items off.");
  }
  async function sync() {
    if (syncing || !snapshot.actor || !navigator.onLine) {
      render();
      return;
    }
    syncing = true;
    render();
    let message;
    try {
      await lock(async () => {
        for (const change of readQueue()) {
          let result;
          if (snapshot.demo)
            result = {
              ok: true,
              entry: {
                ...snapshot.entries.find((e) => e.id === change.id),
                done: change.done,
              },
            };
          else {
            const response = await fetch("/api/shopping/sync", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(change),
              cache: "no-store",
            });
            result = await response.json();
            if (!response.ok)
              throw new Error(
                result.error || "Could not sync. Changes remain saved.",
              );
          }
          if (result.conflict) {
            // Keep unresolved writes available for review, including across reloads.
            conflicts.set(change.id, result);
            message = `${change.expected_title}: ${result.error} Your check-off is still saved here.`;
            continue;
          }
          if (!result.ok || !result.entry)
            throw new Error("Could not confirm this change. It remains saved.");
          snapshot.entries = snapshot.entries.map((e) =>
            e.id === change.id ? result.entry : e,
          );
          localStorage.setItem(CACHE, JSON.stringify(snapshot));
          writeQueue(readQueue().filter((q) => q.write_id !== change.write_id));
        }
      });
    } catch (error) {
      message =
        error.message || "No signal. Changes remain saved on this device.";
    } finally {
      syncing = false;
      render(message);
    }
  }
  $("sync").addEventListener("click", () => void sync());
  window.addEventListener("online", () => void sync());
  window.addEventListener("offline", () => render());
  window.addEventListener("storage", (event) => {
    if (event.key === CACHE && !event.newValue) location.reload();
    else if (event.key === CACHE && event.newValue) {
      try {
        const latest = JSON.parse(event.newValue);
        if (
          latest.actor !== snapshot.actor ||
          latest.household.id !== snapshot.household.id
        )
          location.reload();
        else {
          snapshot = latest;
          render();
        }
      } catch {}
    } else if (event.key === QUEUE) render();
  });
  render();
  if (navigator.onLine) void sync();
})();
