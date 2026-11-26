export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { bootstrapSetupConfigFromDisk } = await import(
      "@/lib/setup/config-file"
    );
    await bootstrapSetupConfigFromDisk();
  }
}
