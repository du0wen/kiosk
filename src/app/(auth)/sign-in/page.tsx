"use client";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { authClient } from "@/lib/auth-client";

function SignIn() {
  const params = useSearchParams();
  // OIDC login continuation: Better Auth's oidcProvider redirects an unauthenticated
  // authorize request here with the original oauth query. After login we must return
  // to the authorize endpoint so it issues the code and redirects to the CLI loopback.
  const callback = params.get("client_id")
    ? `/api/auth/oauth2/authorize?${params.toString()}`
    : params.get("callback") || "/pages";
  const signIn = (provider: "github" | "google") =>
    authClient.signIn.social({ provider, callbackURL: callback });

  return (
    <main style={{ maxWidth: 320, margin: "10vh auto", display: "grid", gap: 12 }}>
      <h1>Sign in to Kiosk</h1>
      <button onClick={() => signIn("github")}>Continue with GitHub</button>
      <button onClick={() => signIn("google")}>Continue with Google</button>
    </main>
  );
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignIn />
    </Suspense>
  );
}
