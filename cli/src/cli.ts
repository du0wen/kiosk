import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { resolveConfig, saveConfig } from "./config.js";
import { KioskClient, CliError } from "./client.js";
import { publishCommand } from "./commands.js";

const USAGE = `kiosk <command>

  login                 Log in via the browser (or --token <t> / KIOSK_TOKEN)
  publish <file>        Publish/update an HTML file, prints the URL (private by default)
                          --id <id>   update a specific page
                          --new       force a new page
                          --title <t> override the title
                          --public    publish as publicly viewable
                          --json      print JSON
  share <id>            Set page visibility: --public | --private
  list                  List your pages
  open <file>           Open a published page in the browser
  delete <id>           Unpublish a page
  install-skill         Install the Claude/Codex skill files (--claude/--codex)
  whoami                Show the authenticated account
  logout                Remove the saved token
`;

function requireToken(): { apiBase: string; token: string } {
  const cfg = resolveConfig();
  if (!cfg.token) {
    throw new CliError("Not logged in. Run `kiosk login` or set KIOSK_TOKEN.", 2);
  }
  return { apiBase: cfg.apiBase, token: cfg.token };
}

export async function runCli(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  try {
    switch (command) {
      case "login": {
        const { values } = parseArgs({
          args: rest,
          options: { token: { type: "string" } },
        });
        const cfg = resolveConfig();
        const token = values.token ?? process.env.KIOSK_TOKEN;
        if (token) {
          // Headless path: validate the provided token and save it.
          await new KioskClient(cfg.apiBase, token).me();
          saveConfig({ token, apiBase: cfg.apiBase });
          process.stdout.write("Logged in.\n");
          return 0;
        }
        // Interactive path: browser loopback flow.
        const { browserLogin } = await import("./login.js");
        const minted = await browserLogin(cfg.apiBase);
        saveConfig({ token: minted, apiBase: cfg.apiBase });
        process.stdout.write("Logged in.\n");
        return 0;
      }
      case "logout": {
        saveConfig({ apiBase: resolveConfig().apiBase });
        process.stdout.write("Logged out.\n");
        return 0;
      }
      case "publish": {
        const { values, positionals } = parseArgs({
          args: rest,
          allowPositionals: true,
          options: {
            id: { type: "string" },
            new: { type: "boolean" },
            title: { type: "string" },
            json: { type: "boolean" },
            public: { type: "boolean" },
          },
        });
        const file = positionals[0];
        if (!file) throw new CliError("Usage: kiosk publish <file>");
        const { apiBase, token } = requireToken();
        const url = await publishCommand(
          { client: new KioskClient(apiBase, token), cwd: process.cwd() },
          {
            file,
            id: values.id,
            forceNew: values.new,
            title: values.title,
            visibility: values.public ? "public" : undefined,
          },
        );
        process.stdout.write(
          values.json ? JSON.stringify({ url }) + "\n" : url + "\n",
        );
        if (!values.public && !values.json) {
          process.stderr.write(
            "(private to your org — add --public or use the console to share publicly)\n",
          );
        }
        return 0;
      }
      case "share": {
        const { values, positionals } = parseArgs({
          args: rest,
          allowPositionals: true,
          options: { public: { type: "boolean" }, private: { type: "boolean" } },
        });
        const id = positionals[0];
        if (!id) throw new CliError("Usage: kiosk share <id> --public | --private");
        if (values.public === values.private) {
          throw new CliError("Specify exactly one of --public or --private");
        }
        const { apiBase, token } = requireToken();
        const r = await new KioskClient(apiBase, token).setVisibility(
          id,
          values.public ? "public" : "org",
        );
        process.stdout.write(`${r.url} (${String(r.visibility)})\n`);
        return 0;
      }
      case "list": {
        const { apiBase, token } = requireToken();
        const { pages } = await new KioskClient(apiBase, token).list();
        process.stdout.write(JSON.stringify(pages, null, 2) + "\n");
        return 0;
      }
      case "delete": {
        const { positionals } = parseArgs({ args: rest, allowPositionals: true });
        const id = positionals[0];
        if (!id) throw new CliError("Usage: kiosk delete <id>");
        const { apiBase, token } = requireToken();
        await new KioskClient(apiBase, token).del(id);
        process.stdout.write("Deleted.\n");
        return 0;
      }
      case "whoami": {
        const { apiBase, token } = requireToken();
        process.stdout.write(
          JSON.stringify(await new KioskClient(apiBase, token).me(), null, 2) + "\n",
        );
        return 0;
      }
      case "install-skill": {
        const { values } = parseArgs({
          args: rest,
          options: { claude: { type: "boolean" }, codex: { type: "boolean" } },
        });
        const both = !values.claude && !values.codex;
        const { installSkill } = await import("./skills.js");
        const written = installSkill({
          dir: process.cwd(),
          claude: both || !!values.claude,
          codex: both || !!values.codex,
        });
        process.stdout.write(
          `Installed skill files:\n${written.map((w) => "  " + w).join("\n")}\n`,
        );
        return 0;
      }
      case "open": {
        const { positionals } = parseArgs({ args: rest, allowPositionals: true });
        const target = positionals[0];
        if (!target) throw new CliError("Usage: kiosk open <file>");
        const { findProjectRoot } = await import("./state.js");
        const { resolveOpenUrl } = await import("./open.js");
        const { openBrowser } = await import("./browser.js");
        const url = resolveOpenUrl(findProjectRoot(process.cwd()), target);
        process.stdout.write(url + "\n");
        openBrowser(url);
        return 0;
      }
      default:
        process.stdout.write(USAGE);
        return command ? 1 : 0;
    }
  } catch (e) {
    const err = e as CliError;
    process.stderr.write(`kiosk: ${err.message}\n`);
    return typeof err.exitCode === "number" ? err.exitCode : 1;
  }
}

// Run directly (tsx src/cli.ts … or node dist/cli.js …). Dormant when imported by
// bin/kiosk.mjs, which calls runCli itself (argv[1] is the bin, not this module).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runCli(process.argv.slice(2)).then((code) => process.exit(code));
}
