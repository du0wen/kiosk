import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { isSetupCompletedLive } from "@/lib/setup/config-file";

export default async function Home() {
  if (!(await isSetupCompletedLive())) {
    redirect("/setup");
  }
  const session = await getSession();
  redirect(session ? "/pages" : "/sign-in");
}
