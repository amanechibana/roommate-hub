"use client";

import type { ReactElement } from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

export function Tooltip({
  children,
  text,
}: {
  children: ReactElement;
  text: string;
}) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          className="ui-tooltip"
          sideOffset={8}
          collisionPadding={12}
        >
          {text}
          <TooltipPrimitive.Arrow
            className="ui-tooltip-arrow"
            width={10}
            height={5}
          />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
