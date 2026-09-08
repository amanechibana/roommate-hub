"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { m, useIsPresent } from "motion/react";
import { useRef, type ReactNode } from "react";
import { useHouseMotion } from "./motion-provider";

/** The parent AnimatePresence owns removal, including save/delete closes. */
export function PaperDialog({
  children,
  onClose,
  className = "entry-dialog",
  "aria-labelledby": labelledBy,
  sharedId,
}: {
  children: ReactNode;
  onClose: () => void;
  className?: string;
  "aria-labelledby": string;
  sharedId?: string;
}) {
  const present = useIsPresent();
  const { reduced } = useHouseMotion();
  const opener = useRef<HTMLElement | null>(
    typeof document === "undefined"
      ? null
      : (document.activeElement as HTMLElement),
  );
  return (
    <Dialog.Root
      open={present}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal forceMount>
        <Dialog.Overlay forceMount asChild>
          <m.div
            className="paper-backdrop"
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.16 }}
          />
        </Dialog.Overlay>
        <Dialog.Content
          forceMount
          asChild
          aria-labelledby={labelledBy}
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            // A day dialog may hand off directly to an editor. Don't steal its focus.
            if (!document.querySelector('[role="dialog"][data-state="open"]'))
              opener.current?.focus();
          }}
        >
          <m.div
            className={`${className} paper-dialog`}
            layoutId={reduced ? undefined : sharedId}
            initial={reduced ? false : { opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
            transition={
              reduced
                ? { duration: 0 }
                : {
                    type: "spring",
                    stiffness: 420,
                    damping: 32,
                    opacity: { duration: 0.16 },
                  }
            }
            inert={!present || undefined}
          >
            <Dialog.Title className="flip-sr">Household details</Dialog.Title>
            {children}
          </m.div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
