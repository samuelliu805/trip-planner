import assert from "node:assert/strict";
import { test } from "node:test";
import { priceFromExpression } from "./price-expression.ts";

test("prices evaluate arithmetic with precedence, parentheses and signed operands", () => {
  for (const [expression, expected] of [
    ["120 + 30 * 2", 180],
    ["(120 + 30) * 2 / 3", 100],
    ["20 - -5", 25],
    ["-(2 - 10) / +2", 4],
    [".5 + 1.", 1.5],
    ["１２＋（３×４）÷２", 18],
    ["100 − 20", 80],
    ["0.1 + 0.2", 0.3],
    ["1.005", 1.01],
    ["10 / 3", 3.33],
    ["9999999999.99", 9999999999.99],
    ["(100-200)+300", 200],
  ] as const)
    assert.equal(priceFromExpression(expression), expected, expression);
});

test("invalid, negative, unbounded or executable expressions become zero", () => {
  for (const expression of [
    "",
    " ",
    "1+",
    "(2+3",
    "2(3)",
    "1/0",
    "0/0",
    "NaN",
    "Infinity",
    "1e3",
    "2**3",
    "1,000",
    "Math.random()",
    "process.exit()",
    "1;2",
    "2-3",
    "10000000000",
    "9".repeat(513),
    "(".repeat(40) + "1" + ")".repeat(40),
  ])
    assert.equal(priceFromExpression(expression), 0, expression);
});
