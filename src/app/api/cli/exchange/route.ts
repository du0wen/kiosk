import { exchangeCliAuthCode, CliAuthError } from "@/lib/cli-auth";

export async function POST(req: Request): Promise<Response> {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      code?: string;
      device?: string;
    };
    if (!body.code) {
      return Response.json(
        { error: { code: "bad_request", message: "Missing code" } },
        { status: 400 },
      );
    }
    const { token } = await exchangeCliAuthCode(body.code, body.device);
    return Response.json({ token });
  } catch (e) {
    if (e instanceof CliAuthError) {
      return Response.json(
        { error: { code: "invalid_code", message: e.message } },
        { status: 400 },
      );
    }
    console.error("cli/exchange error", e);
    return Response.json(
      { error: { code: "internal", message: "Internal error" } },
      { status: 500 },
    );
  }
}
