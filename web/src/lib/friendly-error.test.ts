import { describe, expect, it } from "vitest";

import { friendlyError } from "./friendly-error";

describe("friendlyError", () => {
  it("explains a backwards offset with the zeros stripped", () => {
    expect(friendlyError("ledger offset 000000000000000003 moves backwards (previous 000000000000004000)")).toEqual({
      key: "offsetBackwards",
      values: { offset: "3", previous: "4000" },
    });
  });

  it("explains a snapshot that does not advance", () => {
    expect(
      friendlyError("snapshot time 2026-09-10T06:53:55Z does not advance past the previous publication (2026-09-11T10:00:00Z)")
    ).toEqual({ key: "snapshotNotLater", values: { time: "2026-09-10T06:53:55Z", previous: "2026-09-11T10:00:00Z" } });
  });

  it("recognises services that are down or unconfigured", () => {
    expect(friendlyError("signing service unreachable at http://127.0.0.1:8790: fetch failed").key).toBe("signingUnreachable");
    expect(friendlyError("SERVICE_URL and SERVICE_TOKEN must be configured").key).toBe("signingNotConfigured");
    expect(friendlyError("simulator unreachable at http://x: fetch failed").key).toBe("simulatorUnreachable");
    expect(friendlyError("SIMULATOR_URL is not configured").key).toBe("simulatorNotConfigured");
    expect(friendlyError("forbidden").key).toBe("forbidden");
    expect(friendlyError("signing key changed for demo: the signing service signed with …")).toEqual({ key: "signingKeyChanged", values: { slug: "demo" } });
  });

  it("passes anything else through as the detail", () => {
    expect(friendlyError("something odd happened")).toEqual({ key: "unknown", values: { detail: "something odd happened" } });
  });
});
