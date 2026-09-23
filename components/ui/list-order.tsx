"use client";
import { useEffect, useState, useRef, type ReactNode } from "react";
import { useDragControls, useMotionValue } from "motion/react";
import { GripVertical } from "lucide-react";
import { PresenceRow } from "./presence";
import { useHouseMotion } from "./motion-provider";
import { homeRequest } from "@/lib/home-client";
import { TAB_ID } from "@/lib/realtime";

/** Personal arrangement is stored per household on this device. */
export function useListOrder(
  key: string,
  shared?: { list: "tasks" | "shopping"; enabled: boolean; writable: boolean },
) {
  const [saved, setSaved] = useState<{ key: string; ids: string[] }>({
    key,
    ids: [],
  });
  const moving = useRef(false);
  useEffect(() => {
    try {
      const ids: unknown = JSON.parse(localStorage.getItem(key) || "[]");
      setSaved({
        key,
        ids: Array.isArray(ids)
          ? ids.filter((id): id is string => typeof id === "string")
          : [],
      });
    } catch {
      setSaved({ key, ids: [] });
    }
  }, [key]);
  useEffect(() => {
    if (!shared?.enabled) return;
    let active = true;
    const refresh = async () => {
      if (moving.current) return;
      try {
        let result = await homeRequest(`/api/list-order?list=${shared.list}`);
        if (
          active &&
          shared.writable &&
          Array.isArray(result.ids) &&
          !result.ids.length
        ) {
          let local: unknown = [];
          try {
            local = JSON.parse(localStorage.getItem(key) || "[]");
          } catch {
            /* Ignore damaged local order. */
          }
          if (
            Array.isArray(local) &&
            local.some(
              (id) => typeof id === "string" && /^[0-9a-f-]{36}$/.test(id),
            )
          ) {
            moving.current = true;
            try {
              result = await homeRequest("/api/list-order", "POST", {
                list: shared.list,
                ids: local.filter(
                  (id) => typeof id === "string" && /^[0-9a-f-]{36}$/.test(id),
                ),
                sender: TAB_ID,
              });
              localStorage.setItem(key, JSON.stringify(result.ids || []));
            } finally {
              moving.current = false;
            }
          }
        }
        if (active && Array.isArray(result.ids))
          setSaved({ key, ids: result.ids });
      } catch {
        /* Keep the last known order while disconnected. */
      }
    };
    void refresh();
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [key, shared?.enabled, shared?.list, shared?.writable]);
  const ids = saved.key === key ? saved.ids : [];
  return {
    // Whether this device has ever arranged this list by hand. Until it has,
    // callers are free to pick their own opening order.
    touched: ids.length > 0,
    sort: <T extends { id: string }>(items: T[]) =>
      [...items].sort((a, b) => {
        // One drag records the whole visible list, so anything without a
        // place here arrived after the arranging: it goes on top, newest
        // first, where a just-added thing lands before the list is touched.
        // Sending it to the bottom instead hides it the moment you add it.
        const rank = (id: string) => (ids.includes(id) ? ids.indexOf(id) : -1);
        return rank(a.id) - rank(b.id);
      }),
    move: (visible: { id: string }[], from: number, to: number) => {
      if (to < 0 || to >= visible.length || from === to) return;
      const ordered = visible.map((item) => item.id);
      ordered.splice(to, 0, ordered.splice(from, 1)[0]);
      const next = [...ordered, ...ids.filter((id) => !ordered.includes(id))];
      setSaved({ key, ids: next });
      if (shared?.enabled && shared.writable) {
        moving.current = true;
        void homeRequest("/api/list-order", "POST", {
          list: shared.list,
          ids: next,
          sender: TAB_ID,
        })
          .then((result) => {
            if (Array.isArray(result.ids)) setSaved({ key, ids: result.ids });
          })
          .catch(() => setSaved({ key, ids }))
          .finally(() => {
            moving.current = false;
          });
      }
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* In-memory arrangement still works. */
      }
    },
  };
}

export function DraggableRow({
  children,
  title,
  className,
  onMove,
  index,
  count,
}: {
  children: ReactNode;
  title: string;
  className: string;
  onMove: (to: number) => void;
  index: number;
  count: number;
}) {
  const controls = useDragControls();
  const y = useMotionValue(0);
  const { reduced } = useHouseMotion();
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<Element | null>(null);
  const [message, setMessage] = useState("");
  const [dragging, setDragging] = useState(false);
  return (
    <PresenceRow
      ref={ref}
      className={className}
      data-order-row="true"
      data-dragging={dragging || undefined}
      drag="y"
      dragListener={false}
      dragControls={controls}
      dragConstraints={listRef}
      dragElastic={0.08}
      style={{ y }}
      dragSnapToOrigin={!reduced}
      dragMomentum={false}
      whileDrag={reduced ? undefined : { scale: 1.015, zIndex: 3 }}
      onDragStart={() => setDragging(true)}
      onDragEnd={(_, info) => {
        setDragging(false);
        const rows = [
          ...(ref.current?.parentElement?.querySelectorAll<HTMLElement>(
            '[data-order-row="true"]',
          ) || []),
        ];
        const target = rows.findIndex((row, rowIndex) => {
          if (rowIndex === index) return false;
          const rect = row.getBoundingClientRect();
          return info.point.y >= rect.top && info.point.y <= rect.bottom;
        });
        if (target >= 0) onMove(target);
        if (reduced) y.jump(0);
      }}
    >
      <button
        type="button"
        className="drag-handle"
        aria-label={`Reorder ${title}`}
        title="Drag to reorder, or use arrow keys"
        aria-description="Use Up and Down arrow keys to move this item. Order is shared across devices."
        onPointerDown={(event) => {
          listRef.current = ref.current?.parentElement ?? null;
          controls.start(event);
        }}
        onKeyDown={(event) => {
          if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key))
            return;
          event.preventDefault();
          const to =
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? count - 1
                : index + (event.key === "ArrowUp" ? -1 : 1);
          if (to >= 0 && to < count) {
            onMove(to);
            setMessage(`${title}, position ${to + 1} of ${count}`);
          }
        }}
      >
        <GripVertical size={15} />
      </button>
      {message && (
        <span role="status" className="flip-sr">
          {message}
        </span>
      )}
      {children}
    </PresenceRow>
  );
}
