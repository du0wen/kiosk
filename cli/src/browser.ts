import { spawn } from "node:child_process";

/** Best-effort open a URL in the user's browser. */
export function openBrowser(url: string): void {
  const cmd =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "start"
        : "xdg-open";
  try {
    spawn(cmd, [url], { stdio: "ignore", detached: true }).unref();
  } catch {
    // could not open automatically; callers print the URL
  }
}
