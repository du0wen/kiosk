import assert from "node:assert/strict";
import test from "node:test";

import { classifyTestFile, classifyTestSource } from "./test-groups.mjs";

test("classifies direct database and factory dependencies as Neon integration", () => {
  assert.equal(classifyTestSource('import { db } from "@/db";'), "db");
  assert.equal(
    classifyTestSource('import { createPrincipal } from "@/test/factories";'),
    "db",
  );
  assert.equal(classifyTestSource("process.env.DATABASE_URL"), "db");
  assert.equal(classifyTestSource('const env = { DATABASE_URL: "fixture" };'), "unit");
});

test("keeps deterministic component and utility tests in the unit group", () => {
  assert.equal(
    classifyTestSource('import { render } from "@testing-library/react";'),
    "unit",
  );
  assert.equal(
    classifyTestFile("src/db/content-schema.test.ts", 'from "@/db/schema"'),
    "unit",
  );
  assert.equal(classifyTestFile("src/components/ui/Button.test.ts", ""), "unit");
});
