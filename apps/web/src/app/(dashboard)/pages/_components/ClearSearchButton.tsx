"use client";
import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui";

// Clears the ?q search param by navigating back to the bare route, reusing the
// same mechanism as the topbar search clear button.
export function ClearSearchButton({ label }: { label: string }) {
  const router = useRouter();
  const pathname = usePathname();
  return <Button variant="secondary" onClick={() => router.push(pathname as Route)}>{label}</Button>;
}
