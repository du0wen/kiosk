import { parseArgs } from "node:util";
import { resolveConfig, saveConfig } from "./config.js";
import { KioskClient, CliError } from "./client.js";
import { publishCommand } from "./commands.js";

const USAGE = `kiosk <command>

  login                 Save an API token (--token <t>, or KIOSK_TOKEN)
  publish <file>        Publish/update an HTML file, prints the public URL
                          --id <id>   update a specific page
                          --new       force a new page
                          --title <t> override the title
                          --json      print JSON
  list                  List your pages
  delete <id>           Unpublish a page
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
        const token = values.token ?? process.env.KIOSK_TOKEN;
        if (!token) {
          throw new CliError(
            "Provide a token: kiosk login --token <t> (or set KIOSK_TOKEN)",
          );
        }
        const cfg = resolveConfig();
        await new KioskClient(cfg.apiBase, token).me(); // validate
        saveConfig({ token, apiBase: cfg.apiBase });
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
          },
        });
        const file = positionals[0];
        if (!file) throw new CliError("Usage: kiosk publish <file>");
        const { apiBase, token } = requireToken();
        const url = await publishCommand(
          { client: new KioskClient(apiBase, token), cwd: process.cwd() },
          { file, id: values.id, forceNew: values.new, title: values.title },
        );
        process.stdout.write(
          values.json ? JSON.stringify({ url }) + "\n" : url + "\n",
        );
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
