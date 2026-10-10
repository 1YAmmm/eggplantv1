import assert from "node:assert/strict";
import { test } from "node:test";
import { buildAdvicePrompt, validateAdvice } from "../src/lib/advice.ts";
import { PESTS } from "../src/lib/pests.ts";

const aphids = PESTS.aphids;
const soap = aphids.pesticides[0].name;

/** A reply that follows the rules, with room to change one field. */
const reply = (overrides = {}) =>
  JSON.stringify({
    intro: "Aphids were found on your plants. They suck sap and can spread plant viruses.",
    pesticides: [{ name: soap, why_for_you: "Cheap and safe close to harvest." }],
    steps: [
      "Blast the colonies off with a strong jet of water.",
      "Spray the soap solution on leaf undersides in the late afternoon.",
      "Repeat after 3–5 days.",
      "Check the leaf undersides again.",
    ],
    watch_for: "Look for curled leaves and sticky honeydew.",
    spray_schedule: "Repeat after 3 to 5 days.",
    ...overrides,
  });

test("a plan that follows the rules passes, with names copied from the verified list", () => {
  const check = validateAdvice(reply(), aphids);
  assert.equal(check.ok, true);
  assert.deepEqual(check.advice.picks, [{ name: soap, why: "Cheap and safe close to harvest." }]);
  assert.equal(check.advice.steps.length, 4);
});

test("JSON inside a code fence is accepted", () => {
  assert.equal(validateAdvice("```json\n" + reply() + "\n```", aphids).ok, true);
});

test("a product is matched by brand or partial name, and repeated picks are merged", () => {
  const benevia = aphids.pesticides.find((p) => p.brand?.startsWith("Benevia"));
  const check = validateAdvice(
    reply({ pesticides: [{ name: "Benevia" }, { name: benevia.name }, { name: "Laundry soap spray" }] }),
    aphids,
  );
  assert.equal(check.ok, true);
  assert.deepEqual(check.advice.picks.map((p) => p.name), [benevia.name, soap]);
});

test("unknown pesticides are dropped; a plan with none from the list is rejected", () => {
  const mixed = validateAdvice(reply({ pesticides: [{ name: "Neem oil" }, { name: soap }] }), aphids);
  assert.equal(mixed.ok, true);
  assert.deepEqual(mixed.advice.picks.map((p) => p.name), [soap]);
  const none = validateAdvice(reply({ pesticides: [{ name: "Malathion" }] }), aphids);
  assert.equal(none.ok, false);
});

test("a dose that is not in the facts is rejected", () => {
  const check = validateAdvice(reply({ steps: ["Mix 50 ml of soap per liter.", "Spray.", "Wait.", "Repeat."] }), aphids);
  assert.equal(check.ok, false);
  assert.match(check.reason, /number/);
});

test("an invented spray interval is rejected, but both ends of a range in the facts are allowed", () => {
  assert.equal(validateAdvice(reply({ spray_schedule: "Spray every 2 days." }), aphids).ok, false);
  assert.equal(validateAdvice(reply({ spray_schedule: "Spray after 3 days." }), aphids).ok, true);
  assert.equal(validateAdvice(reply({ spray_schedule: "Spray after five days." }), aphids).ok, true);
});

test("a product that is not in the verified list is rejected even in the free text", () => {
  const check = validateAdvice(reply({ steps: ["Spray neem oil.", "Repeat.", "Check.", "Wait."] }), aphids);
  assert.equal(check.ok, false);
  assert.match(check.reason, /neem/i);
});

test("replies of the wrong shape are rejected", () => {
  assert.equal(validateAdvice("Here is your plan: spray soap.", aphids).ok, false);
  assert.equal(validateAdvice(reply({ steps: ["one", "two"] }), aphids).ok, false);
  assert.equal(validateAdvice(reply({ intro: "" }), aphids).ok, false);
  assert.equal(validateAdvice(reply({ steps: ["a", "b", "c", "x".repeat(400)] }), aphids).ok, false);
});

test("the prompt carries the verified facts and the rules", () => {
  const { system, user } = buildAdvicePrompt(aphids);
  assert.match(system, /JSON only/);
  assert.match(user, new RegExp(soap.replace(/[()]/g, "\\$&")));
  assert.match(user, /Why each product is a good choice/);
});
