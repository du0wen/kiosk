import { getAuth } from "@/lib/auth";
import { isSetupCompletedLive } from "@/lib/setup/config-file";

async function handle(req: Request): Promise<Response> {
  await isSetupCompletedLive();
  return getAuth().handler(req);
}

export const GET = handle;
export const POST = handle;
