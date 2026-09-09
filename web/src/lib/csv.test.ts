import { describe, expect, it } from "vitest";

import { addDecimal, parseBalancesCsv, parseRosterCsv } from "./csv";

describe("balances CSV", () => {
  it("groups rows by user, sorted, and totals the non-negative side", () => {
    const parsed = parseBalancesCsv("bob,USDA,7\nalice,USDA,100.5\nalice,CBTC,0.25\n");
    expect(parsed.leaves.map((l) => l.user_id)).toEqual(["alice", "bob"]);
    expect(parsed.leaves[0].balances).toEqual({ USDA: "100.5", CBTC: "0.25" });
    expect(parsed.totals).toEqual({ USDA: "107.5", CBTC: "0.25" });
    expect(parsed.rows).toBe(3);
    expect(parsed.errors).toEqual([]);
  });

  it("skips a header and comments, counts negatives, and reports bad rows by line", () => {
    const parsed = parseBalancesCsv("user_id,asset,amount\n# note\ncarol,USDA,-3.5\ndave,USDA,abc\neve,USDA\n");
    expect(parsed.negatives).toBe(1);
    expect(parsed.negativeTotals).toEqual({ USDA: "3.5" });
    expect(parsed.totals).toEqual({});
    expect(parsed.errors).toHaveLength(2);
    expect(parsed.errors[0]).toContain("line 4");
    expect(parsed.errors[1]).toContain("line 5");
  });

  it("refuses a duplicate asset for one user and more than 18 decimals", () => {
    const parsed = parseBalancesCsv("a,USDA,1\na,USDA,2\nb,USDA,1.0000000000000000001\n");
    expect(parsed.errors).toHaveLength(2);
    expect(parsed.leaves).toHaveLength(1);
  });

  it("honours quoted fields", () => {
    const parsed = parseBalancesCsv('"smith, john",USDA,1\n');
    expect(parsed.leaves[0].user_id).toBe("smith, john");
  });

  it("adds decimals exactly", () => {
    expect(addDecimal("0.1", "0.2")).toBe("0.3");
    expect(addDecimal("99999999999999999999.999999999999999999", "0.000000000000000001")).toBe(
      "100000000000000000000"
    );
  });
});

describe("roster CSV", () => {
  it("parses user_id,email and lower-cases the address", () => {
    const { rows, errors } = parseRosterCsv("user_id,email\nalice,Alice@Example.com\nbob,bob@example.com\n");
    expect(rows).toEqual([
      { externalId: "alice", email: "alice@example.com" },
      { externalId: "bob", email: "bob@example.com" },
    ]);
    expect(errors).toEqual([]);
  });

  it("rejects malformed emails and duplicate ids", () => {
    const { rows, errors } = parseRosterCsv("alice,not-an-email\nbob,bob@example.com\nbob,bob2@example.com\n");
    expect(rows).toHaveLength(1);
    expect(errors).toHaveLength(2);
  });
});
