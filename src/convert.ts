interface UnitDef {
  dimension: string;
  toBase(value: number): number;
  fromBase(value: number): number;
}

function linear(factor: number): Pick<UnitDef, "toBase" | "fromBase"> {
  return { toBase: (v) => v * factor, fromBase: (v) => v / factor };
}

const UNITS: Record<string, UnitDef> = {
  // length, base unit: meter
  m: { dimension: "length", ...linear(1) },
  km: { dimension: "length", ...linear(1000) },
  cm: { dimension: "length", ...linear(0.01) },
  mm: { dimension: "length", ...linear(0.001) },
  mi: { dimension: "length", ...linear(1609.344) },
  yd: { dimension: "length", ...linear(0.9144) },
  ft: { dimension: "length", ...linear(0.3048) },
  in: { dimension: "length", ...linear(0.0254) },

  // mass, base unit: kilogram
  kg: { dimension: "mass", ...linear(1) },
  g: { dimension: "mass", ...linear(0.001) },
  mg: { dimension: "mass", ...linear(0.000001) },
  lb: { dimension: "mass", ...linear(0.45359237) },
  oz: { dimension: "mass", ...linear(0.028349523125) },

  // time, base unit: second
  s: { dimension: "time", ...linear(1) },
  ms: { dimension: "time", ...linear(0.001) },
  min: { dimension: "time", ...linear(60) },
  h: { dimension: "time", ...linear(3600) },
  day: { dimension: "time", ...linear(86400) },

  // temperature, base unit: celsius (not a linear scale, so no shared factor)
  C: { dimension: "temperature", toBase: (v) => v, fromBase: (v) => v },
  F: {
    dimension: "temperature",
    toBase: (v) => ((v - 32) * 5) / 9,
    fromBase: (v) => (v * 9) / 5 + 32,
  },
  K: {
    dimension: "temperature",
    toBase: (v) => v - 273.15,
    fromBase: (v) => v + 273.15,
  },
};

export function convert(value: number, from: string, to: string): number {
  const fromUnit = UNITS[from];
  if (!fromUnit) throw new Error(`unknown unit: ${from}`);
  const toUnit = UNITS[to];
  if (!toUnit) throw new Error(`unknown unit: ${to}`);
  if (fromUnit.dimension !== toUnit.dimension) {
    throw new Error(
      `dimension mismatch: cannot convert ${from} (${fromUnit.dimension}) to ${to} (${toUnit.dimension})`,
    );
  }
  return toUnit.fromBase(fromUnit.toBase(value));
}

export function supportedUnits(): string[] {
  return Object.keys(UNITS);
}
