"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Eye, EyeOff } from "lucide-react";
import { Button, Select, TextField } from "@/components/ui";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { setLocaleAction } from "@/i18n/locale";
import { localeLabels, locales, type Locale } from "@/i18n/config";
import {
  buildPostgresUrl,
  parsePostgresUrl,
  type PostgresFormFields,
} from "@/lib/setup/database-url";
import styles from "../page.module.css";

type SetupStatusResponse = {
  writable: boolean;
  defaults: {
    appOrigin: string;
    serveOrigin: string;
    databaseUrl: string;
    databaseUrlPresent: boolean;
    localStorageDir: string;
    configPath: string;
  };
};

type Step = 1 | 2 | 3 | 4 | 5;

type MessageState =
  | { kind: "key"; key: string; values?: Record<string, string> }
  | { kind: "raw"; text: string }
  | null;

export function SetupWizard() {
  const t = useTranslations("setup");
  const tShell = useTranslations("shell");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [localePending, startLocaleTransition] = useTransition();

  const [step, setStep] = useState<Step>(1);
  const [writable, setWritable] = useState(true);
  const [configPath, setConfigPath] = useState("~/.config/kiosk/kiosk.config.json");

  // Step 1: Origins
  const [appOrigin, setAppOrigin] = useState("");
  const [serveOrigin, setServeOrigin] = useState("");

  // Step 2: Database
  const [dbInputMode, setDbInputMode] = useState<"fields" | "url">("fields");
  const [dbFields, setDbFields] = useState<PostgresFormFields>({
    host: "localhost",
    port: "5432",
    database: "kiosk",
    username: "kiosk",
    password: "",
    ssl: false,
  });
  const [databaseUrl, setDatabaseUrl] = useState("");
  const [showDatabaseUrl, setShowDatabaseUrl] = useState(false);
  const [dbTested, setDbTested] = useState(false);
  const [dbMigrated, setDbMigrated] = useState(false);
  const [dbDriver, setDbDriver] = useState<string | null>(null);

  // Step 3: Storage
  const [storageProvider, setStorageProvider] = useState<
    "filesystem" | "s3" | "vercel_blob"
  >("filesystem");
  const [localDir, setLocalDir] = useState("");
  const [s3Name, setS3Name] = useState("Primary S3 Storage");
  const [s3Endpoint, setS3Endpoint] = useState("");
  const [s3Region, setS3Region] = useState("auto");
  const [s3Bucket, setS3Bucket] = useState("");
  const [s3ForcePathStyle, setS3ForcePathStyle] = useState(false);
  const [s3AccessKeyId, setS3AccessKeyId] = useState("");
  const [s3SecretAccessKey, setS3SecretAccessKey] = useState("");
  const [blobName, setBlobName] = useState("Vercel Blob Storage");
  const [blobToken, setBlobToken] = useState("");
  const [storageTested, setStorageTested] = useState(false);

  // Step 4: Admin & Registration
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminPasswordConfirm, setAdminPasswordConfirm] = useState("");
  const [workspaceName, setWorkspaceName] = useState(t("defaultWorkspaceName"));
  const [allowPublicSignup, setAllowPublicSignup] = useState(false);
  const [githubClientId, setGithubClientId] = useState("");
  const [githubClientSecret, setGithubClientSecret] = useState("");
  const [googleClientId, setGoogleClientId] = useState("");
  const [googleClientSecret, setGoogleClientSecret] = useState("");

  // Step 5: Completion result
  const [persistedToDisk, setPersistedToDisk] = useState(true);
  const [envSnippet, setEnvSnippet] = useState<string | null>(null);

  // Shared UI status
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MessageState>(null);
  const [info, setInfo] = useState<MessageState>(null);

  const renderMessage = (msg: MessageState): string | null => {
    if (!msg) return null;
    if (msg.kind === "raw") return msg.text;
    return t(msg.key as Parameters<typeof t>[0], msg.values);
  };

  const stepLabels = [
    t("stepOrigins"),
    t("stepDatabase"),
    t("stepStorage"),
    t("stepAdmin"),
    t("stepDone"),
  ];

  useEffect(() => {
    void fetch("/api/setup/status")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: SetupStatusResponse | null) => {
        if (!data) return;
        setWritable(data.writable);
        setConfigPath(data.defaults.configPath);
        setAppOrigin(data.defaults.appOrigin || window.location.origin);
        setServeOrigin(data.defaults.serveOrigin || "");
        if (data.defaults.databaseUrl) {
          setDatabaseUrl(data.defaults.databaseUrl);
          const parsed = parsePostgresUrl(data.defaults.databaseUrl);
          if (parsed) setDbFields(parsed);
        }
        setLocalDir(data.defaults.localStorageDir || "");
      })
      .catch(() => {});
  }, []);

  const localeOptions = locales.map((code) => ({
    value: code,
    label: localeLabels[code],
  }));

  function changeLocale(next: string) {
    if (next === locale) return;
    startLocaleTransition(async () => {
      await setLocaleAction(next as Locale);
      router.refresh();
    });
  }

  const effectiveDatabaseUrl =
    dbInputMode === "fields" ? buildPostgresUrl(dbFields) : databaseUrl.trim();

  function updateDbField<K extends keyof PostgresFormFields>(
    key: K,
    value: PostgresFormFields[K],
  ) {
    const next = { ...dbFields, [key]: value };
    setDbFields(next);
    setDatabaseUrl(buildPostgresUrl(next));
    setDbTested(false);
    setDbMigrated(false);
  }

  function switchDbMode(nextMode: "fields" | "url") {
    if (nextMode === dbInputMode) return;
    if (nextMode === "url") {
      const built = buildPostgresUrl(dbFields);
      if (built) setDatabaseUrl(built);
    } else {
      const parsed = parsePostgresUrl(databaseUrl);
      if (parsed) setDbFields(parsed);
    }
    setDbInputMode(nextMode);
  }

  async function testDb() {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch("/api/setup/test-db", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ databaseUrl: effectiveDatabaseUrl }),
      });
      const data = (await res.json()) as { ok?: boolean; driver?: string; error?: string };
      if (!res.ok) {
        setDbTested(false);
        setError(data.error ? { kind: "raw", text: data.error } : { kind: "key", key: "dbConnectionFailed" });
        return;
      }
      const driver = data.driver ?? "pg";
      setDbTested(true);
      setDbDriver(driver);
      setInfo({ kind: "key", key: "dbConnected", values: { driver } });
    } catch {
      setDbTested(false);
      setError({ kind: "key", key: "dbConnectionFailed" });
    } finally {
      setBusy(false);
    }
  }

  async function initDb() {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch("/api/setup/init-db", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ databaseUrl: effectiveDatabaseUrl }),
      });
      const data = (await res.json()) as { ok?: boolean; driver?: string; error?: string };
      if (!res.ok) {
        setDbMigrated(false);
        setError(data.error ? { kind: "raw", text: data.error } : { kind: "key", key: "dbMigrationFailed" });
        return;
      }
      setDbTested(true);
      setDbMigrated(true);
      setDbDriver(data.driver ?? "pg");
      setInfo({ kind: "key", key: "dbMigrated" });
    } catch {
      setDbMigrated(false);
      setError({ kind: "key", key: "dbMigrationFailed" });
    } finally {
      setBusy(false);
    }
  }

  async function testStorage() {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const payload =
        storageProvider === "filesystem"
          ? { provider: "filesystem", config: { rootPath: localDir }, credentials: {} }
          : storageProvider === "s3"
            ? {
                provider: "s3",
                config: {
                  ...(s3Endpoint.trim() ? { endpoint: s3Endpoint.trim() } : {}),
                  region: s3Region.trim(),
                  bucket: s3Bucket.trim(),
                  forcePathStyle: s3ForcePathStyle,
                },
                credentials: {
                  accessKeyId: s3AccessKeyId.trim(),
                  secretAccessKey: s3SecretAccessKey.trim(),
                },
              }
            : {
                provider: "vercel_blob",
                config: {},
                credentials: { token: blobToken.trim() },
              };

      const res = await fetch("/api/setup/test-storage", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setStorageTested(false);
        setError(data.error ? { kind: "raw", text: data.error } : { kind: "key", key: "storageFailed" });
        return;
      }
      setStorageTested(true);
      setInfo({ kind: "key", key: "storageVerified" });
    } catch {
      setStorageTested(false);
      setError({ kind: "key", key: "storageFailed" });
    } finally {
      setBusy(false);
    }
  }

  async function completeSetup(e: React.FormEvent) {
    e.preventDefault();
    if (adminPassword.length < 12) {
      setError({ kind: "key", key: "passwordTooShort" });
      return;
    }
    if (adminPassword !== adminPasswordConfirm) {
      setError({ kind: "key", key: "passwordMismatch" });
      return;
    }

    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const storage =
        storageProvider === "filesystem"
          ? { provider: "filesystem" as const, localDir }
          : storageProvider === "s3"
            ? {
                provider: "s3" as const,
                name: s3Name.trim() || "Primary S3 Storage",
                config: {
                  ...(s3Endpoint.trim() ? { endpoint: s3Endpoint.trim() } : {}),
                  region: s3Region.trim(),
                  bucket: s3Bucket.trim(),
                  forcePathStyle: s3ForcePathStyle,
                },
                credentials: {
                  accessKeyId: s3AccessKeyId.trim(),
                  secretAccessKey: s3SecretAccessKey.trim(),
                },
              }
            : {
                provider: "vercel_blob" as const,
                name: blobName.trim() || "Vercel Blob Storage",
                credentials: { token: blobToken.trim() },
              };

      const res = await fetch("/api/setup/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          appOrigin: appOrigin.trim(),
          serveOrigin: serveOrigin.trim(),
          databaseUrl: effectiveDatabaseUrl,
          allowPublicSignup,
          storage,
          admin: {
            name: adminName.trim(),
            email: adminEmail.trim(),
            password: adminPassword,
            workspaceName: workspaceName.trim() || undefined,
          },
          oauth: {
            github:
              githubClientId.trim() && githubClientSecret.trim()
                ? {
                    clientId: githubClientId.trim(),
                    clientSecret: githubClientSecret.trim(),
                  }
                : null,
            google:
              googleClientId.trim() && googleClientSecret.trim()
                ? {
                    clientId: googleClientId.trim(),
                    clientSecret: googleClientSecret.trim(),
                  }
                : null,
          },
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        persistedToDisk?: boolean;
        configPath?: string;
        envSnippet?: string;
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ? { kind: "raw", text: data.error } : { kind: "key", key: "setupFailed" });
        return;
      }

      setPersistedToDisk(Boolean(data.persistedToDisk));
      if (data.configPath) setConfigPath(data.configPath);
      setEnvSnippet(data.envSnippet ?? null);
      setStep(5);
    } catch {
      setError({ kind: "key", key: "setupFailed" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.canvas}>
      <section className={styles.card}>
        <div className={styles.header}>
          <div className={styles.rowBetween}>
            <div className={styles.row}>
              <BrandLogo size={24} />
              <h1>{t("title")}</h1>
            </div>
            <div className={styles.localePicker}>
              <Select
                label={tShell("language")}
                value={locale}
                options={localeOptions}
                disabled={localePending}
                onValueChange={changeLocale}
              />
            </div>
          </div>
          <p>{t("subtitle")}</p>
        </div>

        <ol className={styles.stepper}>
          {stepLabels.map((label, idx) => {
            const num = (idx + 1) as Step;
            const cls =
              num < step
                ? `${styles.stepItem} ${styles.stepDone}`
                : num === step
                  ? `${styles.stepItem} ${styles.stepActive}`
                  : styles.stepItem;
            return (
              <li key={label} className={cls}>
                {label}
              </li>
            );
          })}
        </ol>

        {!writable && step < 5 && (
          <div className={styles.noticeWarn}>{t("readOnlyWarning")}</div>
        )}

        {error && (
          <div className={styles.noticeError} role="alert">
            {renderMessage(error)}
          </div>
        )}
        {info && <div className={styles.noticeOk}>{renderMessage(info)}</div>}

        {step === 1 && (
          <div className={styles.section}>
            <TextField
              name="appOrigin"
              label={t("appOriginLabel")}
              value={appOrigin}
              onChange={(e) => setAppOrigin(e.target.value)}
              placeholder="https://app.example.com"
              required
            />
            <TextField
              name="serveOrigin"
              label={t("serveOriginLabel")}
              value={serveOrigin}
              onChange={(e) => setServeOrigin(e.target.value)}
              placeholder="https://pages.example-usercontent.net"
              required
            />
            <div className={styles.rowBetween}>
              <span />
              <Button
                type="button"
                variant="primary"
                disabled={!appOrigin.trim() || !serveOrigin.trim()}
                onClick={() => {
                  setError(null);
                  setInfo(null);
                  setStep(2);
                }}
              >
                {t("nextDatabase")}
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className={styles.section}>
            <div className={styles.modeTabs} role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={dbInputMode === "fields"}
                className={`${styles.modeTab} ${
                  dbInputMode === "fields" ? styles.modeTabActive : ""
                }`}
                onClick={() => switchDbMode("fields")}
              >
                {t("dbModeFields")}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={dbInputMode === "url"}
                className={`${styles.modeTab} ${
                  dbInputMode === "url" ? styles.modeTabActive : ""
                }`}
                onClick={() => switchDbMode("url")}
              >
                {t("dbModeUrl")}
              </button>
            </div>

            {dbInputMode === "fields" ? (
              <div className={styles.section}>
                <div className={styles.twoCol}>
                  <TextField
                    name="dbHost"
                    label={t("dbHost")}
                    value={dbFields.host}
                    onChange={(e) => updateDbField("host", e.target.value)}
                    placeholder="localhost"
                    required
                  />
                  <TextField
                    name="dbPort"
                    label={t("dbPort")}
                    value={dbFields.port}
                    onChange={(e) => updateDbField("port", e.target.value)}
                    placeholder="5432"
                    required
                  />
                </div>
                <TextField
                  name="dbName"
                  label={t("dbName")}
                  value={dbFields.database}
                  onChange={(e) => updateDbField("database", e.target.value)}
                  placeholder="kiosk"
                  required
                />
                <div className={styles.twoCol}>
                  <TextField
                    name="dbUser"
                    label={t("dbUser")}
                    value={dbFields.username}
                    onChange={(e) => updateDbField("username", e.target.value)}
                    placeholder="kiosk"
                    required
                  />
                  <TextField
                    name="dbPassword"
                    label={t("dbPassword")}
                    type="password"
                    value={dbFields.password}
                    onChange={(e) => updateDbField("password", e.target.value)}
                  />
                </div>
                <label className={styles.checkbox}>
                  <input
                    type="checkbox"
                    checked={dbFields.ssl}
                    onChange={(e) => updateDbField("ssl", e.target.checked)}
                  />
                  <span>{t("dbSsl")}</span>
                </label>
              </div>
            ) : (
              <div className={styles.secretField}>
                <TextField
                  name="databaseUrl"
                  label={t("databaseUrlLabel")}
                  type={showDatabaseUrl ? "text" : "password"}
                  className={styles.secretInput}
                  value={databaseUrl}
                  onChange={(e) => {
                    setDatabaseUrl(e.target.value);
                    setDbTested(false);
                    setDbMigrated(false);
                  }}
                  placeholder="postgresql://kiosk:password@postgres:5432/kiosk"
                  required
                />
                <button
                  type="button"
                  className={styles.eyeToggle}
                  onClick={() => setShowDatabaseUrl((prev) => !prev)}
                  aria-label={showDatabaseUrl ? t("hideSecret") : t("showSecret")}
                  title={showDatabaseUrl ? t("hideSecret") : t("showSecret")}
                >
                  {showDatabaseUrl ? (
                    <EyeOff size={16} aria-hidden="true" />
                  ) : (
                    <Eye size={16} aria-hidden="true" />
                  )}
                </button>
              </div>
            )}

            <div className={styles.row}>
              <Button
                type="button"
                variant="secondary"
                disabled={busy || !effectiveDatabaseUrl}
                onClick={() => void testDb()}
              >
                {t("testConnection")}
              </Button>
              <Button
                type="button"
                variant="primary"
                disabled={busy || !effectiveDatabaseUrl}
                onClick={() => void initDb()}
              >
                {t("initDatabase")}
              </Button>
              {dbDriver && (
                <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                  {t("driverLabel", { driver: dbDriver })}
                </span>
              )}
            </div>
            <div className={styles.rowBetween}>
              <Button type="button" variant="secondary" onClick={() => setStep(1)}>
                {t("back")}
              </Button>
              <Button
                type="button"
                variant="primary"
                disabled={!dbTested || !dbMigrated}
                onClick={() => {
                  setError(null);
                  setInfo(null);
                  setStep(3);
                }}
              >
                {t("nextStorage")}
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className={styles.section}>
            <div className={styles.radioGroup}>
              <label
                className={`${styles.radioCard} ${
                  storageProvider === "filesystem" ? styles.radioCardSelected : ""
                }`}
              >
                <div className={styles.row}>
                  <input
                    type="radio"
                    name="storageProvider"
                    checked={storageProvider === "filesystem"}
                    onChange={() => {
                      setStorageProvider("filesystem");
                      setStorageTested(false);
                    }}
                  />
                  <strong>{t("localFolderTitle")}</strong>
                </div>
                <span>{t("localFolderDesc")}</span>
              </label>

              <label
                className={`${styles.radioCard} ${
                  storageProvider === "s3" ? styles.radioCardSelected : ""
                }`}
              >
                <div className={styles.row}>
                  <input
                    type="radio"
                    name="storageProvider"
                    checked={storageProvider === "s3"}
                    onChange={() => {
                      setStorageProvider("s3");
                      setStorageTested(false);
                    }}
                  />
                  <strong>{t("s3Title")}</strong>
                </div>
                <span>{t("s3Desc")}</span>
              </label>

              <label
                className={`${styles.radioCard} ${
                  storageProvider === "vercel_blob" ? styles.radioCardSelected : ""
                }`}
              >
                <div className={styles.row}>
                  <input
                    type="radio"
                    name="storageProvider"
                    checked={storageProvider === "vercel_blob"}
                    onChange={() => {
                      setStorageProvider("vercel_blob");
                      setStorageTested(false);
                    }}
                  />
                  <strong>{t("vercelBlobTitle")}</strong>
                </div>
                <span>{t("vercelBlobDesc")}</span>
              </label>
            </div>

            {storageProvider === "filesystem" && (
              <TextField
                name="localDir"
                label={t("localDirLabel")}
                value={localDir}
                onChange={(e) => {
                  setLocalDir(e.target.value);
                  setStorageTested(false);
                }}
                placeholder="/var/lib/kiosk/storage"
                required
              />
            )}

            {storageProvider === "s3" && (
              <div className={styles.section}>
                <TextField
                  name="s3Name"
                  label={t("profileNameLabel")}
                  value={s3Name}
                  onChange={(e) => setS3Name(e.target.value)}
                />
                <TextField
                  name="s3Endpoint"
                  label={t("s3EndpointLabel")}
                  value={s3Endpoint}
                  onChange={(e) => {
                    setS3Endpoint(e.target.value);
                    setStorageTested(false);
                  }}
                  placeholder="https://<account>.r2.cloudflarestorage.com"
                />
                <TextField
                  name="s3Region"
                  label={t("s3RegionLabel")}
                  value={s3Region}
                  onChange={(e) => setS3Region(e.target.value)}
                  required
                />
                <TextField
                  name="s3Bucket"
                  label={t("s3BucketLabel")}
                  value={s3Bucket}
                  onChange={(e) => {
                    setS3Bucket(e.target.value);
                    setStorageTested(false);
                  }}
                  required
                />
                <TextField
                  name="s3AccessKeyId"
                  label={t("s3AccessKeyIdLabel")}
                  value={s3AccessKeyId}
                  onChange={(e) => {
                    setS3AccessKeyId(e.target.value);
                    setStorageTested(false);
                  }}
                  required
                />
                <TextField
                  name="s3SecretAccessKey"
                  label={t("s3SecretAccessKeyLabel")}
                  type="password"
                  value={s3SecretAccessKey}
                  onChange={(e) => {
                    setS3SecretAccessKey(e.target.value);
                    setStorageTested(false);
                  }}
                  required
                />
                <label className={styles.checkbox}>
                  <input
                    type="checkbox"
                    checked={s3ForcePathStyle}
                    onChange={(e) => setS3ForcePathStyle(e.target.checked)}
                  />
                  <span>{t("s3ForcePathStyle")}</span>
                </label>
              </div>
            )}

            {storageProvider === "vercel_blob" && (
              <div className={styles.section}>
                <TextField
                  name="blobName"
                  label={t("profileNameLabel")}
                  value={blobName}
                  onChange={(e) => setBlobName(e.target.value)}
                />
                <TextField
                  name="blobToken"
                  label={t("blobTokenLabel")}
                  type="password"
                  value={blobToken}
                  onChange={(e) => {
                    setBlobToken(e.target.value);
                    setStorageTested(false);
                  }}
                  required
                />
              </div>
            )}

            <div className={styles.row}>
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => void testStorage()}
              >
                {t("verifyStorage")}
              </Button>
            </div>

            <div className={styles.rowBetween}>
              <Button type="button" variant="secondary" onClick={() => setStep(2)}>
                {t("back")}
              </Button>
              <Button
                type="button"
                variant="primary"
                disabled={!storageTested}
                onClick={() => {
                  setError(null);
                  setInfo(null);
                  setStep(4);
                }}
              >
                {t("nextAdmin")}
              </Button>
            </div>
          </div>
        )}

        {step === 4 && (
          <form onSubmit={completeSetup} className={styles.section}>
            <TextField
              name="adminName"
              label={t("adminNameLabel")}
              value={adminName}
              onChange={(e) => setAdminName(e.target.value)}
              required
            />
            <TextField
              name="adminEmail"
              label={t("adminEmailLabel")}
              type="email"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              required
            />
            <TextField
              name="adminPassword"
              label={t("adminPasswordLabel")}
              type="password"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              required
            />
            <TextField
              name="adminPasswordConfirm"
              label={t("adminPasswordConfirmLabel")}
              type="password"
              value={adminPasswordConfirm}
              onChange={(e) => setAdminPasswordConfirm(e.target.value)}
              required
            />
            <TextField
              name="workspaceName"
              label={t("workspaceNameLabel")}
              value={workspaceName}
              onChange={(e) => setWorkspaceName(e.target.value)}
              required
            />

            <label className={styles.checkbox}>
              <input
                type="checkbox"
                checked={allowPublicSignup}
                onChange={(e) => setAllowPublicSignup(e.target.checked)}
              />
              <span>{t("allowPublicSignup")}</span>
            </label>

            <details className={styles.details}>
              <summary>{t("optionalOAuth")}</summary>
              <div className={styles.detailsBody}>
                <TextField
                  name="githubClientId"
                  label={t("githubClientId")}
                  value={githubClientId}
                  onChange={(e) => setGithubClientId(e.target.value)}
                />
                <TextField
                  name="githubClientSecret"
                  label={t("githubClientSecret")}
                  type="password"
                  value={githubClientSecret}
                  onChange={(e) => setGithubClientSecret(e.target.value)}
                />
                <TextField
                  name="googleClientId"
                  label={t("googleClientId")}
                  value={googleClientId}
                  onChange={(e) => setGoogleClientId(e.target.value)}
                />
                <TextField
                  name="googleClientSecret"
                  label={t("googleClientSecret")}
                  type="password"
                  value={googleClientSecret}
                  onChange={(e) => setGoogleClientSecret(e.target.value)}
                />
              </div>
            </details>

            <div className={styles.rowBetween}>
              <Button type="button" variant="secondary" onClick={() => setStep(3)}>
                {t("back")}
              </Button>
              <Button type="submit" variant="primary" disabled={busy}>
                {t("completeButton")}
              </Button>
            </div>
          </form>
        )}

        {step === 5 && (
          <div className={styles.section}>
            <div className={styles.noticeOk}>
              <strong>{t("doneTitle")}</strong> {t("doneBody")}
            </div>
            {persistedToDisk ? (
              <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--text-secondary)" }}>
                {t("configSaved", { path: configPath })}
              </p>
            ) : (
              <div className={styles.section}>
                <div className={styles.noticeWarn}>{t("readOnlyEnvPrompt")}</div>
                {envSnippet && <pre className={styles.pre}>{envSnippet}</pre>}
              </div>
            )}
            <div className={styles.row}>
              <Button
                type="button"
                variant="primary"
                onClick={() => window.location.assign("/sign-in")}
              >
                {t("goToSignIn")}
              </Button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
