import { redirect } from "next/navigation";
import { BrandLogo } from "@/components/ui";
import { isSetupCompletedLive } from "@/lib/setup/config-file";
import styles from "./layout.module.css";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  if (!(await isSetupCompletedLive())) {
    redirect("/setup");
  }
  return <main className={styles.canvas}><div className={styles.brand}><span><BrandLogo size={32} /></span><strong>Kiosk</strong></div><section className={styles.panel}>{children}</section></main>;
}
