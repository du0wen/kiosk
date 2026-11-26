/**
 * Pure state machine for the branded viewer's cross-origin iframe.
 *
 * The iframe points at the separate SERVE_ORIGIN. Because it is cross-origin
 * and sandboxed, the shell cannot inspect its contents — it can only observe
 * the `load` event (which fires even for served error pages) or fall back to a
 * timeout when the origin never responds (e.g. DNS/connection failure). This
 * reducer keeps that logic testable and out of the component.
 */
export type ViewerStatus = "loading" | "loaded" | "error";
export type ViewerEvent = "loaded" | "timeout" | "errored" | "retry";

export function viewerReducer(status: ViewerStatus, event: ViewerEvent): ViewerStatus {
  switch (event) {
    case "loaded":
      // A load event always means content arrived — even after a timeout.
      return "loaded";
    case "timeout":
      // Only a still-loading frame times out; ignore a late timeout on a good page.
      return status === "loading" ? "error" : status;
    case "errored":
      return "error";
    case "retry":
      return "loading";
    default:
      return status;
  }
}

/** How long to wait for the cross-origin frame before showing the error state. */
export const VIEWER_LOAD_TIMEOUT_MS = 12_000;
