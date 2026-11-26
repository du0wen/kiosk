import assert from "node:assert/strict";
import test from "node:test";

import { collectReleaseErrors } from "./validate-cli-release.mjs";

const valid = {
  repository: "https://github.com/acme/kiosk",
  origin: "git@github.com:acme/kiosk.git",
  rustApiBase: "https://kiosk.example/api/v1",
  contractApiBase: "https://kiosk.example/api/v1",
  releaseContractVersion: 1,
  releaseVersions: {
    web: "0.1.0",
    render: "0.1.0",
    rustCli: "0.1.0",
  },
  packageVersions: {
    web: "0.1.0",
    render: "0.1.0",
    rustCli: "0.1.0",
  },
  contractMigrationHead: "0017_steady_vulture",
  journalMigrationHead: "0017_steady_vulture",
};

test("accepts a coherent GitHub release configuration", () => {
  assert.deepEqual(collectReleaseErrors(valid), []);
});

test("rejects missing external release gates", () => {
  const errors = collectReleaseErrors({
    ...valid,
    repository: null,
    origin: null,
    rustApiBase: "http://localhost:3000/api/v1",
    contractApiBase: "http://localhost:3000/api/v1",
  });

  assert.ok(errors.some((error) => error.includes("Cargo repository")));
  assert.ok(errors.some((error) => error.includes("Git origin")));
  assert.ok(errors.some((error) => error.includes("production HTTPS")));
});

test("rejects repository and API contract drift", () => {
  const errors = collectReleaseErrors({
    ...valid,
    origin: "https://github.com/acme/another-repo.git",
    contractApiBase: "https://other.example/api/v1",
  });

  assert.ok(errors.some((error) => error.includes("does not match Git origin")));
  assert.ok(errors.some((error) => error.includes("CLI API defaults disagree")));
});

test("rejects missing or invalid release contract metadata", () => {
  const errors = collectReleaseErrors({
    ...valid,
    releaseContractVersion: null,
    contractMigrationHead: null,
  });

  assert.ok(errors.some((error) => error.includes("release contract version")));
  assert.ok(errors.some((error) => error.includes("migration head")));
});

test("rejects artifact version and migration drift", () => {
  const errors = collectReleaseErrors({
    ...valid,
    releaseVersions: { ...valid.releaseVersions, render: "0.2.0" },
    packageVersions: { ...valid.packageVersions, rustCli: "0.1.1" },
    journalMigrationHead: "0014_unexpected",
  });

  assert.ok(errors.some((error) => error.includes("release unit versions disagree")));
  assert.ok(errors.some((error) => error.includes("package versions do not match")));
  assert.ok(errors.some((error) => error.includes("migration head does not match")));
});
