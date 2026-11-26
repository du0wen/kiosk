import { redirect } from "next/navigation";

export default async function StorageAdminPage() {
  redirect("/settings/storage");
}
