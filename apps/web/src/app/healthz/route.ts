export function GET(): Response {
  return Response.json(
    {
      status: "ok",
      release: process.env.KIOSK_RELEASE_ID?.trim() || "development",
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
