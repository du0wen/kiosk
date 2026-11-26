"use client";

import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button, EmptyState } from "@/components/ui";

type ApplicationErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export function ApplicationError({ error, reset }: ApplicationErrorProps) {
  const shell = useTranslations("shell");
  const common = useTranslations("common");

  useEffect(() => {
    console.error("Application render error:", error);
  }, [error]);

  return (
    <EmptyState
      icon={<TriangleAlert size={20} />}
      title={shell("loadFailedTitle")}
      description={shell("loadFailedBody")}
      action={
        <Button type="button" variant="primary" onClick={reset}>
          {common("retry")}
        </Button>
      }
    />
  );
}

