"use client";
import { useEffect, useState, useRef, type ReactNode } from "react";
import { useDragControls, useMotionValue } from "motion/react";
import { GripVertical } from "lucide-react";
import { PresenceRow } from "./presence";
import { useHouseMotion } from "./motion-provider";

/** Personal arrangement is stored per household on this device. */
export function useListOrder(key: string) {
  const [saved, setSaved] = useState<{ key: string; ids: string[] }>({
    key,
    ids: [],
  });
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
  const ids = saved.key === key ? saved.ids : [];
  return {
    // Whether this device has ever arranged this list by hand. Until it has,
    // callers are free to pick their own opening order.
    touched: ids.length > 0,
    sort: <T extends { id: string }>(items: T[]) =>
      [...items].sort((a, b) => {
        const rank = (id: string) =>
          ids.includes(id) ? ids.indexOf(id) : ids.length;
        return rank(a.id) - rank(b.id);
      }),
    move: (visible: { id: string }[], from: number, to: number) => {
      if (to < 0 || to >= visible.length || from === to) return;
      const ordered = visible.map((item) => item.id);
      ordered.splice(to, 0, ordered.splice(from, 1)[0]);
      const next = [...ordered, ...ids.filter((id) => !ordered.includes(id))];
      setSaved({ key, ids: next });
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
        aria-description="Use Up and Down arrow keys to move this item. Order is saved on this device."
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
