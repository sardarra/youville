import { verifyFindings } from "./verifier.ts"
import { runInferences, atomicVocabulary, inferenceRules, splitAlternatives } from "./rules-engine.ts"

function assert(cond: unknown, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg)
    process.exitCode = 1
  }
}

const clauses = [
  { id: "segment-0", text: "We collect precise location data." },
  { id: "segment-1", text: "We also store timestamps of each visit." },
  { id: "segment-2", text: "Contacts are uploaded to our servers." },
  { id: "segment-3", text: "We collect precise location data." },
]

function raw(over: Record<string, unknown>) {
  return {
    category: "Location",
    field: "Precise location",
    summary: "Collects location",
    quote: "precise location",
    severity: 3 as const,
    clauseId: "segment-0",
    signals: ["Precise location"],
    ...over,
  }
}

{
  const r = verifyFindings([raw({ quote: "   " })], clauses)
  assert(r.verified.length === 0 && r.removed[0]?.removedReason === "quote_empty", "empty")
  assert(r.removed[0]?.id === "f-0", "id")
}

{
  const r = verifyFindings([raw({ clauseId: "segment-99", quote: "precise location" })], clauses)
  assert(r.removed.length === 1 && r.removed[0]?.removedReason === "invalid_clause_id", "invalid")
}

{
  const r = verifyFindings([raw({ quote: "Precise location!" })], clauses)
  assert(r.verified.length === 1 && r.verified[0]?.clauseId === "segment-0", "exact claimed")
  assert(r.verified[0]?.removedReason === undefined, "no removed reason")
}

{
  const r = verifyFindings([raw({ clauseId: "segment-2", quote: "precise location data" })], clauses)
  assert(r.verified.length === 1 && r.verified[0]?.clauseId === "segment-0", "earliest " + r.verified[0]?.clauseId)
}

{
  const r = verifyFindings([raw({ clauseId: "segment-3", quote: "precise location data" })], clauses)
  assert(r.verified[0]?.clauseId === "segment-3", "keep claimed duplicate " + r.verified[0]?.clauseId)
}

{
  const r = verifyFindings([raw({ clauseId: "segment-1", quote: "precise location data" })], clauses)
  assert(r.verified[0]?.clauseId === "segment-0", "dup earliest " + r.verified[0]?.clauseId)
}

{
  const r = verifyFindings([raw({ quote: "we sell your biometric iris scan to brokers" })], clauses)
  assert(r.removed[0]?.removedReason === "quote_not_found", "not found")
}

{
  const r = verifyFindings([raw({ quote: "xy" })], clauses)
  assert(r.removed[0]?.removedReason === "quote_not_found", "short")
}

{
  const r = verifyFindings([raw({ quote: "We" })], clauses)
  assert(r.verified.length === 1, "short exact")
}

{
  const r = verifyFindings([raw({ quote: "precise locaton data" })], clauses)
  console.log("fuzzy result", r.verified[0]?.clauseId, r.removed[0]?.removedReason)
  assert(r.verified.length === 1 && r.verified[0]?.clauseId === "segment-0", "fuzzy keep claimed")
}

{
  const r = verifyFindings([raw({ clauseId: "segment-2", quote: "timestamp of each visit" })], clauses)
  console.log("fuzzy correct", r.verified[0]?.clauseId, r.removed[0]?.removedReason)
  assert(r.verified.length === 1 && r.verified[0]?.clauseId === "segment-1", "fuzzy correct")
}

{
  const r = verifyFindings(
    [raw({ quote: "We collect precise location data. We also store timestamps of each visit. Contacts are uploaded." })],
    clauses,
  )
  assert(r.removed[0]?.removedReason === "quote_not_found", "too long " + r.removed[0]?.removedReason)
}

{
  const r = verifyFindings(
    [raw({ quote: "nope not here at all xyz" }), raw({ quote: "timestamps of each visit" })],
    clauses,
  )
  assert(r.removed[0]?.id === "f-0" && r.verified[0]?.id === "f-1", "ids")
}

const vocab = atomicVocabulary(inferenceRules)
const expected = [
  "Precise location",
  "Timestamps",
  "Email ending in .edu",
  "Usage activity",
  "Contacts",
  "messaging metadata",
  "Usage",
  "purchase data",
  "Ad-partner sharing",
  "IP address",
  "Wi-Fi",
  "Bluetooth scanning",
  "Photos",
  "Location metadata",
  "Device ID",
  "Third-party sharing",
]
assert(JSON.stringify(vocab) === JSON.stringify(expected), "vocab " + vocab.join(","))
assert(splitAlternatives("Contacts or messaging metadata").join("|") === "Contacts|messaging metadata", "split")

function finding(id: string, signals: string[], verified = true) {
  return { id, signals, verified }
}

{
  const inf = runInferences(
    [finding("f-2", ["Timestamps"]), finding("f-0", ["Precise location"]), finding("f-9", ["Photos"], false)],
    inferenceRules,
  )
  const r1 = inf.find((i) => i.id === "R1")
  assert(r1, "R1 fired " + inf.map((i) => i.id))
  assert(JSON.stringify(r1?.supportingFindingIds) === JSON.stringify(["f-0", "f-2"]), "support")
  assert(r1?.explanation === inferenceRules[0]?.explanation, "verbatim")
  assert(!inf.some((i) => i.id === "R9"), "R9")
  assert(
    inf.every((i) => !/\bwill\b/i.test(i.explanation) && i.explanation.includes("could")),
    "wording",
  )
}

{
  const inf = runInferences([finding("f-1", ["Contacts"])], inferenceRules)
  assert(inf.length === 1 && inf[0]?.id === "R5", "R5 only")
}

{
  const inf = runInferences([finding("f-1", ["Precise location", "Usage activity"])], inferenceRules)
  assert(inf.some((i) => i.id === "R4"), "R4")
  assert(!inf.some((i) => i.id === "R6"), "R6 not from Usage activity")
}

{
  const a = runInferences([finding("f-1", ["Usage"]), finding("f-2", ["Ad-partner sharing"])], inferenceRules)
  assert(a.find((i) => i.id === "R6")?.supportingFindingIds.join() === "f-1,f-2", "R6")
  const b = runInferences([finding("f-3", ["purchase data", "Ad-partner sharing"])], inferenceRules)
  assert(b.some((i) => i.id === "R6"), "R6 purchase alt")
}

{
  const inf = runInferences([finding("f-1", ["Precise location"])], inferenceRules)
  assert(inf.length === 0, "no partial R1")
}

{
  const findings = [finding("f-1", ["Device ID"]), finding("f-4", ["Third-party sharing"]), finding("f-2", ["IP address"])]
  const a = runInferences(findings, inferenceRules)
  const b = runInferences(findings, inferenceRules)
  assert(JSON.stringify(a) === JSON.stringify(b), "determinism")
  assert(a.map((i) => i.id).join() === "R7,R10", "order " + a.map((i) => i.id))
}

{
  let threw = false
  try {
    runInferences([], [{ id: "Rx", inputs: ["IP address"], output: "x", explanation: "This will reveal you." }])
  } catch {
    threw = true
  }
  assert(threw, "will throws")
  const ok = runInferences(
    [finding("f-1", ["IP address"])],
    [{ id: "R7", inputs: ["IP address"], output: "City only", explanation: "A willing reader could notice this." }],
  )
  assert(ok.length === 1, "willing allowed")
}

{
  const inf = runInferences([finding("f-1", vocab)], inferenceRules)
  assert(inf.length === 10, "all rules " + inf.length)
  assert(inf.map((i) => i.id).join() === "R1,R2,R3,R4,R5,R6,R7,R8,R9,R10", "sorted")
}

// fuzzy tie: claimed wins over an equal earlier clause. Use identical clauses.
{
  const same = [
    { id: "segment-0", text: "Alpha beta gamma delta signal." },
    { id: "segment-1", text: "Alpha beta gamma delta signal." },
  ]
  const r = verifyFindings([raw({ clauseId: "segment-1", quote: "Alpha beta gamma delta signl." })], same)
  console.log("tie", r.verified[0]?.clauseId, r.removed[0]?.removedReason)
  assert(r.verified[0]?.clauseId === "segment-1", "tie favors claimed")
}

console.log(process.exitCode ? "FAILED" : "OK")
