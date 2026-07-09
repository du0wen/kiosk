"use client";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { authClient } from "@/lib/auth-client";

function SignIn() {
  const callback = useSearchParams().get("callback") || "/pages";
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
