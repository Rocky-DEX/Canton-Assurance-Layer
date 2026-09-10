import { describe, expect, it } from "vitest";

import { SigningKeyChanged, assertSameSigningKey } from "./signing-key";

const a = "a".repeat(64);
const b = "b".repeat(64);

describe("assertSameSigningKey", () => {
  it("accepts the first key and the same key again", () => {
    expect(() => assertSameSigningKey({ slug: "demo", signingKeyHex: null }, a)).not.toThrow();
    expect(() => assertSameSigningKey({ slug: "demo", signingKeyHex: a }, a)).not.toThrow();
  });

  it("refuses a different key once one is recorded, naming both and the way out", () => {
    let err: unknown;
    try {
      assertSameSigningKey({ slug: "demo", signingKeyHex: a }, b);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(SigningKeyChanged);
    const m = (err as Error).message;
    expect(m).toMatch(/signing key changed for demo/);
    expect(m).toContain(b.slice(0, 16));
    expect(m).toContain(a.slice(0, 16));
    expect(m).toMatch(/DEPLOY\.md/);
  });
});
