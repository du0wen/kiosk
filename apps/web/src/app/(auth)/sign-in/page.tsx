"use client";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button, TextField } from "@/components/ui";
import { useTranslations } from "next-intl";
import styles from "./page.module.css";

function SignIn() {
  const t = useTranslations("auth");
  const params = useSearchParams();
  // OIDC login continuation: Better Auth's oidcProvider redirects an unauthenticated
  // authorize request here with the original oauth query. After login we must return
  // to the authorize endpoint so it issues the code and redirects to the CLI loopback.
  const callback = params.get("client_id")
    ? `/api/auth/oauth2/authorize?${params.toString()}`
    : params.get("callback") || "/pages";

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [allowPublicSignup, setAllowPublicSignup] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<{ kind: "key"; key: "authError" } | { kind: "raw"; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void fetch("/api/auth/providers")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { allowPublicSignup?: boolean } | null) => {
        if (data?.allowPublicSignup) setAllowPublicSignup(true);
      })
      .catch(() => {});
  }, []);

  const signInSocial = (provider: "github" | "google") =>
    authClient.signIn.social({ provider, callbackURL: callback });

  async function onEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result =
        mode === "signup"
          ? await authClient.signUp.email({
              name: name.trim() || email.split("@")[0],
              email: email.trim(),
              password,
              callbackURL: callback,
            })
          : await authClient.signIn.email({
              email: email.trim(),
              password,
              callbackURL: callback,
            });
      if (result.error) {
        setError(
          result.error.message
            ? { kind: "raw", text: result.error.message }
            : { kind: "key", key: "authError" },
        );
        return;
      }
      window.location.assign(callback);
    } catch {
      setError({ kind: "key", key: "authError" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.content}>
      <h1>{t("signInTitle")}</h1>
      <p>{t("signInDescription")}</p>

      <form onSubmit={onEmailSubmit} className={styles.form}>
        {mode === "signup" && (
          <TextField
            name="name"
            label={t("name")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        )}
        <TextField
          name="email"
          type="email"
          label={t("email")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <TextField
          name="password"
          type="password"
          label={t("password")}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && (
          <p className={styles.error} role="alert">
            {error.kind === "key" ? t(error.key) : error.text}
          </p>
        )}
        <Button type="submit" variant="primary" disabled={submitting}>
          {mode === "signup" ? t("createAccount") : t("signInEmail")}
        </Button>
      </form>

      {allowPublicSignup ? (
        <button
          type="button"
          className={styles.modeToggle}
          onClick={() => {
            setError(null);
            setMode(mode === "signin" ? "signup" : "signin");
          }}
        >
          {mode === "signin" ? t("switchToSignUp") : t("switchToSignIn")}
        </button>
      ) : (
        <p className={styles.inviteNotice}>{t("inviteOnlyNotice")}</p>
      )}

      <div className={styles.divider}>
        <span>{t("orContinueWith")}</span>
      </div>

      <div className={styles.actions}>
        <Button type="button" onClick={() => signInSocial("github")}>
          {t("continueGithub")}
        </Button>
        <Button type="button" onClick={() => signInSocial("google")}>
          {t("continueGoogle")}
        </Button>
      </div>
      <p className={styles.terms}>{t("termsNotice")}</p>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignIn />
    </Suspense>
  );
}
