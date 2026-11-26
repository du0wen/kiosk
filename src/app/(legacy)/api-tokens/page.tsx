import { permanentRedirect } from "next/navigation";
import { LEGACY_REDIRECTS } from "@/app/(dashboard)/_lib/paths";

export default function LegacyApiTokensPage() {
  permanentRedirect(LEGACY_REDIRECTS["/api-tokens"]);
}
