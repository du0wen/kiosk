"use client";

import { createContext, useContext, type ReactNode } from "react";

const PlatformAdminContext = createContext(false);

export function PlatformAdminProvider({ value, children }: { value: boolean; children: ReactNode }) {
  return <PlatformAdminContext.Provider value={value}>{children}</PlatformAdminContext.Provider>;
}

export function usePlatformAdmin(): boolean {
  return useContext(PlatformAdminContext);
}
