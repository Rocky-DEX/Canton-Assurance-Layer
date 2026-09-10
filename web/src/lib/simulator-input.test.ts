import { describe, expect, it } from "vitest";

import { parseSimulationInput, parseTransferAmounts, splitParties, type SimulationForm } from "./simulator-input";

const exercise = {
  ExerciseCommand: {
    templateId: "#perp-custody:PerpCustody:PlatformAccount",
    contractId: "00abc",
    choice: "Debit",
    choiceArgument: { delta: "25.0" },
  },
};

function form(over: Partial<SimulationForm>): SimulationForm {
  return {
    commandsText: JSON.stringify(exercise),
    actAs: "alice::1220aa",
    readAs: "",
    synchronizerId: "",
    lookupContracts: true,
    includeArguments: true,
    ...over,
  };
}

describe("splitParties", () => {
  it("accepts newlines, commas and spaces, and drops duplicates", () => {
    expect(splitParties("a::1, b::2\nc::3 a::1")).toEqual(["a::1", "b::2", "c::3"]);
    expect(splitParties("  ")).toEqual([]);
  });
});

describe("parseSimulationInput", () => {
  it("wraps a single command object", () => {
    const r = parseSimulationInput(form({}));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.request.commands).toEqual([exercise]);
    expect(r.request.act_as).toEqual(["alice::1220aa"]);
    expect(r.request.read_as).toEqual([]);
    expect(r.request.synchronizer_id).toBeUndefined();
    expect(r.request.include_prepared_transaction).toBe(false);
  });

  it("accepts an array of commands and the form's parties", () => {
    const r = parseSimulationInput(form({ commandsText: JSON.stringify([exercise, exercise]), readAs: "bob::1" }));
    expect(r.ok && r.request.commands.length).toBe(2);
    expect(r.ok && r.request.read_as).toEqual(["bob::1"]);
  });

  it("accepts a full request object, letting the form override its parties", () => {
    const full = { act_as: ["from-file::1"], read_as: ["r::1"], commands: [exercise], synchronizer_id: "global::1", user_id: "u" };
    const fromFile = parseSimulationInput(form({ commandsText: JSON.stringify(full), actAs: "" }));
    expect(fromFile.ok && fromFile.request.act_as).toEqual(["from-file::1"]);
    expect(fromFile.ok && fromFile.request.synchronizer_id).toBe("global::1");
    expect(fromFile.ok && fromFile.request.user_id).toBe("u");
    const overridden = parseSimulationInput(form({ commandsText: JSON.stringify(full), actAs: "typed::1", synchronizerId: "other::2" }));
    expect(overridden.ok && overridden.request.act_as).toEqual(["typed::1"]);
    expect(overridden.ok && overridden.request.read_as).toEqual(["r::1"]);
    expect(overridden.ok && overridden.request.synchronizer_id).toBe("other::2");
  });

  it("names the problem", () => {
    expect(parseSimulationInput(form({ commandsText: "{" }))).toEqual({ ok: false, error: "notJson" });
    expect(parseSimulationInput(form({ commandsText: '{"foo": 1}' }))).toEqual({ ok: false, error: "notCommand" });
    expect(parseSimulationInput(form({ commandsText: "[]" }))).toEqual({ ok: false, error: "noCommands" });
    expect(parseSimulationInput(form({ commandsText: '[{"ExerciseCommand":{}},{"x":1}]' }))).toEqual({ ok: false, error: "notCommand" });
    expect(parseSimulationInput(form({ actAs: "" }))).toEqual({ ok: false, error: "noActAs" });
  });

  it("passes the option toggles through", () => {
    const r = parseSimulationInput(form({ lookupContracts: false, includeArguments: false }));
    expect(r.ok && r.request.lookup_contracts).toBe(false);
    expect(r.ok && r.request.include_arguments).toBe(false);
  });
});

describe("parseTransferAmounts", () => {
  it("accepts plain decimals only", () => {
    expect(parseTransferAmounts("10000, 2.5\n0.001")).toEqual({ ok: true, amounts: ["10000", "2.5", "0.001"] });
    expect(parseTransferAmounts("")).toEqual({ ok: true, amounts: [] });
    expect(parseTransferAmounts("1e3")).toEqual({ ok: false, bad: "1e3" });
    expect(parseTransferAmounts("-5")).toEqual({ ok: false, bad: "-5" });
  });
});
