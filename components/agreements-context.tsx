"use client";

import { createContext, useContext } from "react";
import type { AgreementsController } from "@/lib/use-agreements";

const AgreementsContext = createContext<AgreementsController | null>(null);

export const AgreementsProvider = AgreementsContext.Provider;

export function useAgreementsContext() {
  return useContext(AgreementsContext);
}
