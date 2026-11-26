"use client";
import { useState } from "react";
import { Check, Copy, Terminal } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button, Dialog } from "@/components/ui";
import { cliCommands } from "../_lib/cli-setup";
import styles from "./CliSetup.module.css";

export function CliSetup({ apiBase }: { apiBase: string }) {
  const t = useTranslations("pages");
  const common = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const commands = cliCommands(apiBase);
  const caption: Record<string, string> = {
    login: t("cliLoginCaption"),
    skill: t("cliSkillCaption"),
    publish: t("cliPublishCaption"),
    apiBase: t("cliApiBaseCaption"),
  };

  const copy = async (id: string, command: string) => {
    await navigator.clipboard.writeText(command);
    setCopiedId(id);
    window.setTimeout(() => setCopiedId((value) => (value === id ? null : value)), 1500);
  };

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Terminal size={16} aria-hidden="true" />
        {t("cliSetup")}
      </Button>
      <Dialog
        open={open}
        title={t("cliTitle")}
        description={t("cliDescription")}
        closeLabel={common("close")}
        onClose={() => setOpen(false)}
      >
        <ol className={styles.steps}>
          {commands.map(({ id, command }) => (
            <li key={id} className={styles.step}>
              <p className={styles.caption}>{caption[id]}</p>
              <div className={styles.command}>
                <code>{command}</code>
                <button
                  type="button"
                  className={styles.copy}
                  aria-label={copiedId === id ? common("copied") : common("copy")}
                  title={copiedId === id ? common("copied") : common("copy")}
                  onClick={() => copy(id, command)}
                >
                  {copiedId === id ? <Check size={15} /> : <Copy size={15} />}
                </button>
              </div>
            </li>
          ))}
        </ol>
      </Dialog>
    </>
  );
}
