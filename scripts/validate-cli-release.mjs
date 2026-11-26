import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function normalizeGithubRepository(value) {
  if (!value) return null;
  const match = value.match(
    /^(?:https:\/\/github\.com\/|git@github\.com:)([^/]+)\/([^/]+?)(?:\.git)?$/,
  );
  return match ? `${match[1]}/${match[2]}`.toLowerCase() : null;
}

function isProductionApiBase(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !["localhost", "127.0.0.1", "::1"].includes(url.hostname) &&
      url.pathname.replace(/\/$/, "") === "/api/v1"
    );
  } catch {
    return false;
  }
}

export function collectReleaseErrors(config) {
  const errors = [];
  const repository = normalizeGithubRepository(config.repository);
  const origin = normalizeGithubRepository(config.origin);

  if (!repository) {
    errors.push("Cargo repository must be a real GitHub repository URL.");
  }
  if (!origin) {
    errors.push("Git origin must be configured as a GitHub repository.");
  }
  if (repository && origin && repository !== origin) {
    errors.push("Cargo repository does not match Git origin.");
  }

  const apiBases = [
    config.rustApiBase,
    config.contractApiBase,
  ];
  if (apiBases.some((value) => !isProductionApiBase(value))) {
    errors.push("Every CLI default must be a production HTTPS /api/v1 URL.");
  }
  if (new Set(apiBases).size !== 1) {
    errors.push("Rust and CLI API defaults disagree.");
  }

  if (config.releaseContractVersion !== 1) {
    errors.push("The release contract version must be 1.");
  }

  const releaseVersions = Object.values(config.releaseVersions ?? {});
  if (releaseVersions.length !== 3 || new Set(releaseVersions).size !== 1) {
    errors.push("The release unit versions disagree.");
  }
  const packageVersions = config.packageVersions ?? {};
  for (const [unit, version] of Object.entries(config.releaseVersions ?? {})) {
    if (packageVersions[unit] !== version) {
      errors.push("Release contract package versions do not match source metadata.");
      break;
    }
  }

  if (!config.contractMigrationHead || !config.journalMigrationHead) {
    errors.push("The release migration head is missing.");
  } else if (config.contractMigrationHead !== config.journalMigrationHead) {
    errors.push("The release migration head does not match the Drizzle journal.");
  }
  if (config.migrationFileExists === false) {
    errors.push("The release migration head SQL file is missing.");
  }

  return errors;
}

function readConstant(path, name) {
  const source = readFileSync(path, "utf8");
  const match = source.match(
    new RegExp(`(?:const|static)\\s+${name}[^=]*=\\s*["']([^"']+)["']`),
  );
  if (!match) throw new Error(`Could not read ${name} from ${path}`);
  return match[1];
}

function loadReleaseConfig() {
  const metadataResult = spawnSync(
    "cargo",
    [
      "metadata",
      "--format-version",
      "1",
      "--no-deps",
      "--manifest-path",
      "packages/cli/Cargo.toml",
    ],
    { cwd: root, encoding: "utf8" },
  );
  if (metadataResult.status !== 0) {
    throw new Error(metadataResult.stderr || "cargo metadata failed");
  }
  const metadata = JSON.parse(metadataResult.stdout);
  const packageMetadata = metadata.packages.find(
    (candidate) => candidate.name === "kiosk-cli",
  );
  if (!packageMetadata) throw new Error("kiosk-cli package metadata is missing");

  const originResult = spawnSync(
    "git",
    ["config", "--get", "remote.origin.url"],
    { cwd: root, encoding: "utf8" },
  );
  const contract = JSON.parse(
    readFileSync(resolve(root, "packages/cli/contract/v1.json"), "utf8"),
  );
  const releaseContract = JSON.parse(
    readFileSync(resolve(root, "scripts/release-contract.json"), "utf8"),
  );
  const webPackage = JSON.parse(
    readFileSync(resolve(root, "apps/web/package.json"), "utf8"),
  );
  const renderPackage = JSON.parse(
    readFileSync(resolve(root, "apps/render/package.json"), "utf8"),
  );
  const journal = JSON.parse(
    readFileSync(resolve(root, "apps/web/src/db/migrations/meta/_journal.json"), "utf8"),
  );
  const journalMigrationHead = journal.entries?.at(-1)?.tag ?? null;

  return {
    repository: packageMetadata.repository,
    origin: originResult.status === 0 ? originResult.stdout.trim() : null,
    rustApiBase: readConstant(
      resolve(root, "packages/cli/src/config.rs"),
      "DEFAULT_API_BASE",
    ),
    contractApiBase: contract.config.defaultApiBase,
    releaseContractVersion: releaseContract.schemaVersion,
    releaseVersions: releaseContract.units,
    packageVersions: {
      web: webPackage.version,
      render: renderPackage.version,
      rustCli: packageMetadata.version,
    },
    contractMigrationHead: releaseContract.migrationHead,
    journalMigrationHead,
    migrationFileExists: journalMigrationHead
      ? (() => {
          try {
            readFileSync(
              resolve(root, `apps/web/src/db/migrations/${journalMigrationHead}.sql`),
            );
            return true;
          } catch {
            return false;
          }
        })()
      : false,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const errors = collectReleaseErrors(loadReleaseConfig());
  if (errors.length > 0) {
    console.error("CLI release is blocked:");
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
  } else {
    console.log("CLI release configuration is ready.");
  }
}
