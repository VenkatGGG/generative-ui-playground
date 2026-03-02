import React, { createContext, useContext, type ReactNode } from "react";
import type { RepeatScopeV2 } from "@repo/spec-engine";

const RepeatScopeContextV2 = createContext<RepeatScopeV2 | undefined>(undefined);

export interface RepeatScopeProviderV2Props {
  scope: RepeatScopeV2 | undefined;
  children: ReactNode;
}

export function RepeatScopeProviderV2({ scope, children }: RepeatScopeProviderV2Props) {
  return <RepeatScopeContextV2.Provider value={scope}>{children}</RepeatScopeContextV2.Provider>;
}

export function useRepeatScopeV2(): RepeatScopeV2 | undefined {
  return useContext(RepeatScopeContextV2);
}
