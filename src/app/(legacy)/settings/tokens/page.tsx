import { permanentRedirect } from "next/navigation";
import { LEGACY_REDIRECTS } from "@/app/(dashboard)/_lib/paths";

export default function LegacyTokensPage() {
  permanentRedirect(LEGACY_REDIRECTS["/settings/tokens"]);
}
