import { describe, expect, it } from "vitest";

import { fromLocalInput, isIso, isoNow, offsetLabel, plusSeconds, toIso, toLocalInput } from "./instant";

describe("instant helpers", () => {
  it("writes RFC 3339 UTC with whole seconds", () => {
    expect(toIso(new Date("2026-09-10T11:00:00.123Z"))).toBe("2026-09-10T11:00:00Z");
    expect(isoNow(new Date("2026-01-01T00:00:00.999Z"))).toBe("2026-01-01T00:00:00Z");
    expect(isIso("2026-09-10T11:00:00Z")).toBe(true);
    expect(isIso("2026-09-10T11:00:00")).toBe(false);
    expect(isIso("2026-13-10T11:00:00Z")).toBe(false);
  });

  it("round-trips through a datetime-local control in any timezone", () => {
    const iso = "2026-09-10T11:00:00Z";
    for (const offset of [0, 480, -210, 60]) {
      const local = toLocalInput(iso, offset);
      expect(local).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
      expect(fromLocalInput(local, offset)).toBe(iso);
    }
    expect(toLocalInput(iso, 480)).toBe("2026-09-10T19:00:00");
    expect(fromLocalInput("2026-09-10T19:00", 480)).toBe(iso);
    expect(fromLocalInput("", 0)).toBeNull();
    expect(fromLocalInput("nonsense", 0)).toBeNull();
  });

  it("adds seconds and labels offsets", () => {
    expect(plusSeconds("2026-09-10T11:00:00Z", 60)).toBe("2026-09-10T11:01:00Z");
    expect(plusSeconds("x", 60)).toBeNull();
    expect(offsetLabel(0)).toBe("UTC");
    expect(offsetLabel(480)).toBe("UTC+08:00");
    expect(offsetLabel(-210)).toBe("UTC-03:30");
  });
});
