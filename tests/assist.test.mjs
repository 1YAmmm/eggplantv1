import assert from "node:assert/strict";
import { test } from "node:test";
import { applyOpinion, judge, needsSecondOpinion, parseVote } from "../src/lib/assist.ts";
import { parseRecognizeRequest } from "../src/lib/recognize.ts";

const KNOWN = ["aphids", "flea_beetle", "fruit_shoot_borer", "thrips", "healthy", "healthy_leaf"];
const local = (label, probability = 0.9) => [
  { label, probability },
  { label: "thrips", probability: 0.05 },
  { label: "aphids", probability: 0.03 },
];
const vote = (label, confidence = 0.9, reason = "because") => ({ provider: "Llama 4 Scout", label, confidence, reason });

test("needsSecondOpinion: low confidence and the aphids/flea beetle mix-up always get a second look", () => {
  assert.equal(needsSecondOpinion(local("thrips", 0.55)), true);
  assert.equal(needsSecondOpinion(local("aphids", 0.998)), true);
  assert.equal(needsSecondOpinion(local("flea_beetle", 0.95)), true);
  assert.equal(needsSecondOpinion(local("thrips", 0.95)), false);
  assert.equal(needsSecondOpinion(local("thrips", 0.95), "always"), true);
  assert.equal(needsSecondOpinion([]), false);
});

test("judge: no answer or a doubtful answer leaves the result alone", () => {
  assert.equal(judge(local("aphids"), null).kind, "unavailable");
  assert.equal(judge([], vote("thrips")).kind, "unavailable");
  assert.equal(judge(local("aphids"), vote("thrips", 0.3)).kind, "unsure");
});

test("judge: agreement confirms, including the two healthy labels", () => {
  assert.equal(judge(local("thrips"), vote("thrips")).kind, "confirmed");
  assert.equal(judge(local("healthy"), vote("healthy_leaf")).kind, "confirmed");
});

test("judge: a trusted AI can correct or reject, a backup AI cannot", () => {
  assert.deepEqual(judge(local("aphids"), vote("flea_beetle")), {
    kind: "corrected",
    by: "Llama 4 Scout",
    label: "flea_beetle",
    confidence: 0.9,
  });
  assert.deepEqual(judge(local("aphids"), vote("not_eggplant", 0.9, "a face")), {
    kind: "not_eggplant",
    by: "Llama 4 Scout",
    reason: "a face",
  });
  assert.equal(judge(local("aphids"), vote("flea_beetle"), false).kind, "unsure");
  assert.equal(judge(local("aphids"), vote("not_eggplant"), false).kind, "unsure");
  assert.equal(judge(local("aphids"), vote("aphids"), false).kind, "confirmed");
});

test("applyOpinion: only a correction reorders the predictions", () => {
  const predictions = [
    { label: "aphids", probability: 0.9 },
    { label: "flea_beetle", probability: 0.07 },
  ];
  const corrected = applyOpinion(predictions, { kind: "corrected", by: "x", label: "flea_beetle", confidence: 0.85 });
  assert.deepEqual(corrected.map((p) => p.label), ["flea_beetle", "aphids"]);
  assert.equal(corrected[0].probability, 0.85);
  assert.equal(applyOpinion(predictions, { kind: "corrected", by: "x", label: "flea_beetle", confidence: 0.01 })[0].probability, 0.07);
  assert.equal(applyOpinion(predictions, { kind: "confirmed", by: "x" }), predictions);
  assert.equal(applyOpinion(predictions, null), predictions);
});

test("parseVote: reads fenced JSON, normalises labels, clamps confidence", () => {
  const fenced = '```json\n{"label": "Flea Beetle", "confidence": 1.4, "reason": "tiny holes"}\n```';
  assert.deepEqual(parseVote("p", fenced, KNOWN), { provider: "p", label: "flea_beetle", confidence: 1, reason: "tiny holes" });
  assert.equal(parseVote("p", 'Sure! {"label": "not_eggplant"} done', KNOWN)?.label, "not_eggplant");
  assert.equal(parseVote("p", '{"label": "aphids"}', KNOWN)?.confidence, 0.5);
});

test("parseVote: rejects unknown labels and replies that are not JSON", () => {
  assert.equal(parseVote("p", '{"label": "whitefly"}', KNOWN), null);
  assert.equal(parseVote("p", "It looks like aphids.", KNOWN), null);
  assert.equal(parseVote("p", '{"confidence": 0.9}', KNOWN), null);
});

test("parseRecognizeRequest: accepts a small image data URL only", () => {
  const ok = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
  assert.equal(parseRecognizeRequest({ image: ok }), ok);
  assert.equal(parseRecognizeRequest({ image: "data:text/html;base64,PGh0bWw+" }), null);
  assert.equal(parseRecognizeRequest({ image: "https://example.com/a.jpg" }), null);
  assert.equal(parseRecognizeRequest({ image: `data:image/png;base64,${"A".repeat(2_000_001)}` }), null);
  assert.equal(parseRecognizeRequest(null), null);
  assert.equal(parseRecognizeRequest({}), null);
});
