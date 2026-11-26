import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isSetupCompletedLive } from "@/lib/setup/config-file";
import { SetupWizard } from "./_components/SetupWizard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Kiosk — First-Run Setup",
  robots: { index: false, follow: false },
};

export default async function SetupPage() {
  if (await isSetupCompletedLive()) {
    notFound();
  }
  return <SetupWizard />;
}
