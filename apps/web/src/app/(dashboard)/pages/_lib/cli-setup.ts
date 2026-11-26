/**
 * The command list shown in the "CLI setup" dialog. Kept as data so the copy
 * affordances and captions can be rendered (and translated) in the component,
 * while the command strings stay testable.
 */
export type CliCommand = { id: "login" | "skill" | "publish" | "apiBase"; command: string };

export function cliCommands(apiBase: string): CliCommand[] {
  return [
    { id: "login", command: "kiosk login" },
    { id: "skill", command: "kiosk install-skill" },
    { id: "publish", command: "kiosk publish ./report.html --public" },
    {
      id: "apiBase",
      command: `export KIOSK_API_BASE=${apiBase || "https://<your-kiosk-domain>/api/v1"}`,
    },
  ];
}
