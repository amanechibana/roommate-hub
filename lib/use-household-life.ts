"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { homeRequest } from "./home-client";
import { TAB_ID } from "./realtime";
import { beginSave } from "./save-status";
import {
  emptyLife,
  missingIngredients,
  maintenanceImageType,
  pollOpen,
  type LifeSnapshot,
  type LifeOperation,
  type Poll,
  type PantryItem,
  type MaintenanceRequest,
  type Meal,
  type Ingredient,
} from "./household-life";
import type { Entry } from "./model";
export function useHouseholdLife({
  enabled,
  demo,
  householdId,
  uid,
  entries,
  addItems,
  syncDemoMeal,
  refreshHome,
}: {
  enabled: boolean;
  demo: boolean;
  householdId?: string;
  uid: string | null;
  entries: Entry[];
  addItems: (titles: string[]) => void;
  syncDemoMeal: (
    values: {
      title: string;
      date: string;
      notes: string;
      cook: string | null;
    } | null,
    id: string | null,
  ) => Promise<string | null>;
  refreshHome: () => Promise<unknown>;
}) {
  const [data, setData] = useState<LifeSnapshot>(emptyLife);
  const [loaded, setLoaded] = useState(demo);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [photosEnabled, setPhotosEnabled] = useState(demo);
  const lock = useRef(false);
  const revision = useRef(0);
  const sequence = useRef(0);
  const urls = useRef(new Set<string>());
  useEffect(() => {
    revision.current++;
    sequence.current++;
    setData(emptyLife());
    setLoaded(demo);
    setError("");
    setNotice("");
    setPhotosEnabled(demo);
  }, [householdId, demo, uid]);
  useEffect(
    () => () => {
      for (const url of urls.current) URL.revokeObjectURL(url);
    },
    [],
  );
  const refresh = useCallback(async () => {
    if (!enabled || demo || !householdId || lock.current) return;
    const read = ++sequence.current;
    const version = revision.current;
    try {
      const result = await homeRequest("/api/household-life");
      if (
        read !== sequence.current ||
        version !== revision.current ||
        lock.current
      )
        return;
      setData(result);
      setLoaded(true);
      setPhotosEnabled(result.photos_enabled === true);
      setError("");
    } catch (err) {
      if (read === sequence.current && version === revision.current)
        setError((err as Error).message);
    }
  }, [enabled, demo, householdId, uid]);
  useEffect(() => {
    if (!enabled) return;
    void refresh();
    const poll = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const timer = window.setInterval(poll, 15000);
    window.addEventListener("focus", poll);
    document.addEventListener("visibilitychange", poll);
    window.addEventListener("household-life-changed", poll);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", poll);
      document.removeEventListener("visibilitychange", poll);
      window.removeEventListener("household-life-changed", poll);
    };
  }, [enabled, refresh]);
  async function run(work: () => Promise<void>) {
    if (lock.current || !uid) return false;
    lock.current = true;
    revision.current++;
    setBusy(true);
    setError("");
    setNotice("");
    const finish = beginSave();
    try {
      await work();
      finish(true);
      return true;
    } catch (err) {
      setError((err as Error).message);
      finish(false);
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function mutate(
    operation: LifeOperation,
    payload: Record<string, unknown>,
  ) {
    return run(async () => {
      if (!demo) {
        const result = await homeRequest("/api/household-life", "POST", {
          operation,
          payload,
          sender: TAB_ID,
        });
        setData(result);
        if (operation.endsWith("_shop"))
          setNotice(
            result.added
              ? `Added ${result.added} ${result.added === 1 ? "item" : "items"} to shopping.`
              : "Everything needed is already on the shopping list.",
          );
        else setNotice("Saved to your household.");
        if (operation.endsWith("_shop") || operation.startsWith("meal_"))
          await refreshHome();
        return;
      }
      const now = new Date().toISOString();
      const id = String(payload.id || crypto.randomUUID());
      const next = { ...data };
      const replace = <T extends { id: string }>(items: T[], value: T) =>
        items.some((i) => i.id === id)
          ? items.map((i) => (i.id === id ? value : i))
          : [value, ...items];
      if (operation === "poll_create") {
        if (Date.parse(String(payload.deadline)) <= Date.now())
          throw new Error("Choose a future deadline.");
        next.polls = [
          {
            ...payload,
            id,
            decision: null,
            decided_by: null,
            decided_at: null,
            created_by: uid,
            created_at: now,
          } as Poll,
          ...data.polls,
        ];
      } else if (operation === "poll_vote" || operation === "poll_decide") {
        const poll = data.polls.find((p) => p.id === id);
        if (!poll) throw new Error("Poll not found.");
        if (operation === "poll_vote") {
          if (!pollOpen(poll)) throw new Error("Voting has ended.");
          next.votes = [
            ...data.votes.filter(
              (v) => !(v.poll_id === id && v.member_id === uid),
            ),
            { poll_id: id, member_id: uid!, choice: Number(payload.choice) },
          ];
        } else {
          if (pollOpen(poll) || poll.decision)
            throw new Error("Wait until the deadline to save a decision.");
          next.polls = data.polls.map((p) =>
            p.id === id
              ? {
                  ...p,
                  decision: String(payload.decision),
                  decided_by: uid,
                  decided_at: now,
                }
              : p,
          );
        }
      } else if (operation === "pantry_save") {
        if (
          data.pantry.some(
            (p) =>
              p.id !== id &&
              p.title.trim().toLowerCase() ===
                String(payload.title).trim().toLowerCase(),
          )
        )
          throw new Error("This staple is already tracked.");
        next.pantry = replace(data.pantry, { ...payload, id } as PantryItem);
      } else if (operation === "pantry_delete")
        next.pantry = data.pantry.filter((p) => p.id !== id);
      else if (operation === "maintenance_save") {
        if (
          payload.status === "resolved" &&
          !String(payload.resolution || "").trim()
        )
          throw new Error("Record how it was resolved.");
        const old = data.maintenance.find((r) => r.id === id);
        next.maintenance = replace(data.maintenance, {
          ...old,
          ...payload,
          id,
          created_by: old?.created_by || uid,
          created_at: old?.created_at || now,
          updated_at: now,
          resolved_at:
            payload.status === "resolved" ? old?.resolved_at || now : null,
        } as MaintenanceRequest);
      } else if (operation === "maintenance_delete") {
        next.maintenance = data.maintenance.filter((r) => r.id !== id);
        next.photos = data.photos.filter((p) => p.request_id !== id);
      } else if (operation === "meal_save") {
        const old = data.meals.find((m) => m.id === id);
        const calendarId = await syncDemoMeal(
          {
            title: String(payload.title),
            date: String(payload.date),
            notes: String(payload.notes || ""),
            cook: payload.cook as string | null,
          },
          old?.calendar_entry_id || null,
        );
        next.meals = replace(data.meals, {
          ...payload,
          id,
          calendar_entry_id: calendarId,
        } as Meal);
      } else if (operation === "meal_delete") {
        await syncDemoMeal(
          null,
          data.meals.find((m) => m.id === id)?.calendar_entry_id || null,
        );
        next.meals = data.meals.filter((m) => m.id !== id);
      } else if (operation === "pantry_shop" || operation === "meal_shop") {
        const ingredients: Ingredient[] =
          operation === "pantry_shop"
            ? [
                {
                  title: data.pantry.find((p) => p.id === id)!.title,
                  missing: true,
                },
              ]
            : data.meals.find((m) => m.id === id)!.ingredients;
        const titles = missingIngredients(
          ingredients,
          entries
            .filter(
              (e) =>
                e.kind === "request" && !e.done && e.category !== "Personal",
            )
            .map((e) => e.title),
        );
        if (titles.length) addItems(titles);
        setNotice(
          titles.length
            ? `Added ${titles.length} ${titles.length === 1 ? "item" : "items"} to shopping.`
            : "Everything needed is already on the shopping list.",
        );
      } else if (operation === "budget_target")
        next.targets = [
          ...data.targets.filter(
            (t) =>
              !(t.month === payload.month && t.category === payload.category),
          ),
          payload as LifeSnapshot["targets"][number],
        ];
      else if (operation === "budget_category")
        next.categories = [
          ...data.categories.filter((c) => c.expense_id !== id),
          ...(payload.category
            ? [
                {
                  expense_id: id,
                  category: payload.category as "groceries" | "utilities",
                },
              ]
            : []),
        ];
      setData(next);
      if (!operation.endsWith("_shop")) setNotice("Saved to your household.");
    });
  }
  async function upload(requestId: string, file: File) {
    return run(async () => {
      if (
        !file.size ||
        file.size > 10 * 1024 * 1024 ||
        !["image/jpeg", "image/png", "image/webp"].includes(file.type)
      )
        throw new Error("Choose a JPEG, PNG, or WebP photo up to 10 MB.");
      if (demo) {
        if (
          maintenanceImageType(new Uint8Array(await file.arrayBuffer())) !==
          file.type
        )
          throw new Error("Use a JPEG, PNG, or WebP photo.");
        const url = URL.createObjectURL(file);
        urls.current.add(url);
        setData((current) => ({
          ...current,
          photos: [
            ...current.photos,
            {
              id: crypto.randomUUID(),
              request_id: requestId,
              file_name: file.name,
              storage_path: url,
            },
          ],
        }));
      } else {
        const form = new FormData();
        form.set("request_id", requestId);
        form.set("file", file);
        const response = await fetch("/api/household-life/photos", {
          method: "POST",
          body: form,
        });
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error || "Could not attach this photo.");
        setData(result);
      }
      setNotice("Photo attached.");
    });
  }
  async function removePhoto(id: string) {
    return run(async () => {
      if (demo)
        setData((current) => ({
          ...current,
          photos: current.photos.filter((p) => p.id !== id),
        }));
      else {
        const result = await homeRequest(
          "/api/household-life/photos",
          "DELETE",
          { id },
        );
        setData(result);
      }
      setNotice("Photo removed.");
    });
  }
  return {
    data,
    loaded,
    busy,
    error,
    notice,
    photosEnabled,
    refresh,
    mutate,
    upload,
    removePhoto,
  };
}
export type HouseholdLifeController = ReturnType<typeof useHouseholdLife>;
