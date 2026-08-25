import { describe, expect, it } from "vitest";
import { RATING_SCORES, averageSoftSkillsByMember } from "./softSkills";
import type { SoftSkillEvalRow } from "./softSkills";

const row = (teamMemberId: string, competency: string, rating: string): SoftSkillEvalRow => ({ teamMemberId, competency, rating });

describe("averageSoftSkillsByMember", () => {
  it("averages the scored ratings of one competency across activities", () => {
    const result = averageSoftSkillsByMember([
      row("m1", "LIDERAZGO", "BUENO"),
      row("m1", "LIDERAZGO", "EXCELENTE"),
    ]);

    expect(result.get("m1")?.LIDERAZGO).toBe(2.5);
  });

  it("excludes NO_EVIDENCIA instead of scoring it, so it can't drag the average down", () => {
    const withNoEvidencia = averageSoftSkillsByMember([
      row("m1", "LIDERAZGO", "BUENO"),
      row("m1", "LIDERAZGO", "NO_EVIDENCIA"),
      row("m1", "LIDERAZGO", "EXCELENTE"),
    ]);

    // Same as if that activity had never rated the competency at all.
    expect(withNoEvidencia.get("m1")?.LIDERAZGO).toBe(2.5);
    expect(RATING_SCORES.NO_EVIDENCIA).toBeNull();
  });

  it("leaves a competency with no nota when every activity rated it NO_EVIDENCIA", () => {
    const result = averageSoftSkillsByMember([
      row("m1", "CREATIVIDAD", "NO_EVIDENCIA"),
      row("m1", "CREATIVIDAD", "NO_EVIDENCIA"),
    ]);

    expect(result.get("m1")?.CREATIVIDAD).toBeUndefined();
  });

  it("keeps members and competencies separate", () => {
    const result = averageSoftSkillsByMember([
      row("m1", "LIDERAZGO", "EXCELENTE"),
      row("m1", "COMUNICACION", "REGULAR"),
      row("m2", "LIDERAZGO", "REGULAR"),
    ]);

    expect(result.get("m1")?.LIDERAZGO).toBe(3);
    expect(result.get("m1")?.COMUNICACION).toBe(1);
    expect(result.get("m2")?.LIDERAZGO).toBe(1);
  });
});
