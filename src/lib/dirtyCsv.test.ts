import { describe, expect, it } from "vitest";
import { dirtyRow } from "./dirtyCsv";
import type { DirtyColumns } from "./dirtyCsv";

const COLUMNS: DirtyColumns = { categorical: [1, 2], numeric: [3, 4] };

describe("dirtyRow", () => {
  it("is deterministic: same seed/rowIndex/fields always produces the same result", () => {
    const fields = [1, "urbana", "comercial", 25, 900];
    const a = dirtyRow(42, 777, fields, COLUMNS);
    const b = dirtyRow(42, 777, fields, COLUMNS);
    expect(a).toEqual(b);
  });

  it("never touches field 0 (the join key)", () => {
    let anyDirty = false;
    for (let i = 0; i < 2000; i++) {
      const fields = [i + 1, "urbana", "comercial", 25, 900];
      const [row] = dirtyRow(42, i, fields, COLUMNS);
      if (row[0] !== fields[0]) anyDirty = true;
    }
    expect(anyDirty).toBe(false);
  });

  it("dirties roughly ~3% of rows over a large sample, leaving the rest untouched", () => {
    let dirtyCount = 0;
    const total = 20_000;
    for (let i = 0; i < total; i++) {
      const fields = [i + 1, "urbana", "comercial", 25, 900];
      const result = dirtyRow(42, i, fields, COLUMNS);
      const changed = result.length > 1 || result[0].some((v, idx) => v !== fields[idx]);
      if (changed) dirtyCount++;
    }
    const rate = dirtyCount / total;
    expect(rate).toBeGreaterThan(0.02);
    expect(rate).toBeLessThan(0.04);
  });

  it("only ever corrupts a declared categorical or numeric index, never an undeclared one", () => {
    const fields = [1, "urbana", "comercial", 25, 900, "untouchable"];
    for (let i = 0; i < 5000; i++) {
      const [row] = dirtyRow(42, i, fields, COLUMNS);
      expect(row[5]).toBe("untouchable");
      expect(row[0]).toBe(1);
    }
  });

  it("can duplicate a row (returns two entries) at least once over a large sample", () => {
    let sawDuplicate = false;
    for (let i = 0; i < 20_000; i++) {
      const fields = [i + 1, "urbana", "comercial", 25, 900];
      const result = dirtyRow(42, i, fields, COLUMNS);
      if (result.length === 2) {
        sawDuplicate = true;
        expect(result[0]).toEqual(result[1]);
        break;
      }
    }
    expect(sawDuplicate).toBe(true);
  });

  it("gives the same exposure the same treatment regardless of which export it appears in (pure function of seed+rowIndex)", () => {
    const fieldsA = [500, "urbana", "comercial", 25, 900];
    const fieldsB = [500, "urbana", "comercial", 25, 900]; // same exposure, re-fetched independently
    expect(dirtyRow(42, 123, fieldsA, COLUMNS)).toEqual(dirtyRow(42, 123, fieldsB, COLUMNS));
  });
});
