import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageSection } from "../../_components/PageHeader";
import { SettingsLayout } from "../_components/SettingsLayout";
import { getSession } from "@/lib/session";
import { isAdminEmail } from "@/lib/console";
import {
  listStorageMigrationSummaries,
  listStorageProfileSummaries,
} from "@/lib/storage/admin";
import { StorageClient } from "../../admin/storage/_components/StorageClient";
import {
  operateStorageProfileAction,
  saveStorageProfileAction,
} from "../../admin/storage/_lib/actions";

export default async function StorageSettingsPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in?callback=/settings/storage");
  if (!isAdminEmail(session.user.email)) notFound();
  const [t, profiles, migrations] = await Promise.all([
    getTranslations("storageAdmin"),
    listStorageProfileSummaries(),
    listStorageMigrationSummaries(),
  ]);

  return <SettingsLayout><PageSection title={t("title")} description={t("subtitle")}><StorageClient profiles={profiles.map((profile) => ({ ...profile, lastCheckedAt: profile.lastCheckedAt?.toISOString() ?? null, createdAt: profile.createdAt.toISOString(), updatedAt: profile.updatedAt.toISOString() }))} migrations={migrations.map((migration) => ({ ...migration, updatedAt: migration.updatedAt.toISOString() }))} storageMode={process.env.CONTENT_STORAGE_MODE ?? "database"} allowFilesystem={process.env.NODE_ENV !== "production"} saveAction={saveStorageProfileAction} operationAction={operateStorageProfileAction} /></PageSection></SettingsLayout>;
}
