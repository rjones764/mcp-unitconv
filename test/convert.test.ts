import { test } from "node:test";
import assert from "node:assert/strict";
import { convert, supportedUnits } from "../src/convert.ts";

test("celsius to fahrenheit", () => {
  assert.equal(convert(100, "C", "F"), 212);
});

test("fahrenheit to celsius", () => {
  assert.equal(convert(32, "F", "C"), 0);
});

test("celsius to kelvin at freezing point", () => {
  assert.equal(convert(0, "C", "K"), 273.15);
});

test("the crossing point of celsius and fahrenheit", () => {
  assert.equal(convert(-40, "C", "F"), -40);
});

test("km to m", () => {
  assert.equal(convert(1, "km", "m"), 1000);
});

test("miles to km", () => {
  assert.ok(Math.abs(convert(1, "mi", "km") - 1.609344) < 1e-9);
});

test("pounds to kg", () => {
  assert.ok(Math.abs(convert(1, "lb", "kg") - 0.45359237) < 1e-9);
});

test("hours to minutes", () => {
  assert.equal(convert(2, "h", "min"), 120);
});

test("same unit is a no-op", () => {
  assert.equal(convert(42, "kg", "kg"), 42);
});

test("dimension mismatch throws", () => {
  assert.throws(() => convert(1, "km", "kg"), /dimension mismatch/);
});

test("unknown source unit throws", () => {
  assert.throws(() => convert(1, "furlong", "km"), /unknown unit: furlong/);
});

test("unknown target unit throws", () => {
  assert.throws(() => convert(1, "km", "furlong"), /unknown unit: furlong/);
});

test("cm to m", () => {
  assert.equal(convert(100, "cm", "m"), 1);
});

test("mm to m", () => {
  assert.equal(convert(1000, "mm", "m"), 1);
});

test("yards to feet", () => {
  assert.equal(convert(1, "yd", "ft"), 3);
});

test("inches to feet", () => {
  assert.ok(Math.abs(convert(12, "in", "ft") - 1) < 1e-9);
});

test("milligrams to kilograms", () => {
  assert.equal(convert(1000000, "mg", "kg"), 1);
});

test("ounces to pounds", () => {
  assert.ok(Math.abs(convert(16, "oz", "lb") - 1) < 1e-9);
});

test("milliseconds to seconds", () => {
  assert.equal(convert(1000, "ms", "s"), 1);
});

test("day to hours", () => {
  assert.equal(convert(1, "day", "h"), 24);
});

test("supportedUnits lists every unit exactly once", () => {
  const units = supportedUnits();
  assert.equal(new Set(units).size, units.length);
  assert.ok(units.includes("C"));
  assert.ok(units.includes("kg"));
});
