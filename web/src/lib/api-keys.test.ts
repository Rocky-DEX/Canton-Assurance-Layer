import { describe, expect, it } from "vitest";

import { generateApiKey, hashApiKey } from "./api-keys";

describe("api keys", () => {
  it("generates distinct keys with a recognisable prefix and stores only a hash", () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a.key).not.toBe(b.key);
    expect(a.key.startsWith("cal_")).toBe(true);
    expect(a.prefix).toBe(a.key.slice(0, 12));
    expect(a.hash).toBe(hashApiKey(a.key));
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.hash).not.toContain(a.key);
  });
});
