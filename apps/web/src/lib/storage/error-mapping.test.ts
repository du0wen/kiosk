import { describe, expect, it } from "vitest";
import { errorResponse } from "@/lib/api";
import { OperationError } from "@/lib/page-operations";
import { ContentRepositoryError } from "./content-repository";

describe("content storage transport errors", () => {
  it.each([
    new ContentRepositoryError("storage_unavailable", "provider secret"),
    new OperationError("storage_unavailable", "Content storage is unavailable"),
  ])("maps %s to a sanitized REST 503", async (error) => {
    const response = errorResponse(error);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: {
        code: "storage_unavailable",
        message: "Content storage is unavailable",
      },
    });
  });
});
