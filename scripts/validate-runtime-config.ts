import { config as loadEnv } from "dotenv";
import { RuntimeConfigError, parseRuntimeConfig } from "../apps/web/src/lib/runtime-config";

loadEnv({ path: ".env", quiet: true });

try {
  const config = parseRuntimeConfig(process.env);
  console.log(
    `Runtime configuration is valid for ${config.nodeEnv} (${config.releaseId}).`,
  );
} catch (error) {
  if (error instanceof RuntimeConfigError) {
    console.error("Runtime configuration is blocked:");
    for (const issue of error.issues) console.error(`- ${issue}`);
    process.exitCode = 1;
  } else {
    throw error;
  }
}
