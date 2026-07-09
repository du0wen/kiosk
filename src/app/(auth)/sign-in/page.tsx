"use client";
import { authClient } from "@/lib/auth-client";

export default function SignInPage() {
  const signIn = (provider: "github" | "google") =>
    authClient.signIn.social({ provider, callbackURL: "/pages" });

  return (
    <main style={{ maxWidth: 320, margin: "10vh auto", display: "grid", gap: 12 }}>
      <h1>Sign in to Kiosk</h1>
      <button onClick={() => signIn("github")}>Continue with GitHub</button>
      <button onClick={() => signIn("google")}>Continue with Google</button>
    </main>
  );
}
