import { SOFT_SKILL_COMPETENCIES, COMPETENCY_LABELS } from "@/lib/softSkills";
import type { SoftSkillCompetency } from "@/lib/softSkills";

// RATING_SCORES range: 1 (Regular) .. 3 (Excelente) — "No se evidencia" is
// NA and never becomes a number, so it has no ring of its own (see
// softSkills.ts).
const RADAR_MAX = 3;
const RADAR_RINGS = [1, 2, 3];

function polar(cx: number, cy: number, r: number, angle: number) {
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
}

/**
 * Greedy word-wrap so competency labels (up to "Tolerancia a la
 * frustración") fit around the chart without overlapping. maxChars=16 keeps
 * every label to at most 2 lines — 3+ lines is what caused labels to
 * collide with their neighbors at only 8 axes 45° apart.
 */
function wrapLabel(label: string, maxChars = 16): string[] {
  const words = label.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * One member's habilidades blandas profile across the 8 fixed competencies
 * (see softSkills.ts), averaged over whichever of the 3 activities rated
 * each one so far. A competency with no nota plots at the center (0) rather
 * than being omitted — that covers both "not rated yet" and "rated only as
 * No se evidencia", since the latter is NA and never becomes a number.
 */
export function SoftSkillsRadarChart({ scores, size = 340 }: { scores: Partial<Record<SoftSkillCompetency, number>>; size?: number }) {
  const hasAnyData = Object.keys(scores).length > 0;
  const n = SOFT_SKILL_COMPETENCIES.length;
  const cx = size / 2;
  const cy = size / 2;
  // Generous — a wrapped label line can still run ~15 characters wide (see
  // wrapLabel), which needs real room to stay inside the viewBox at a
  // start/end anchor instead of clipping past the edge.
  const labelPad = size * 0.32;
  const R = size / 2 - labelPad;
  const angleFor = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;

  const axisPoints = SOFT_SKILL_COMPETENCIES.map((competency, i) => {
    const angle = angleFor(i);
    const value = scores[competency] ?? null;
    const r = (Math.min(value ?? 0, RADAR_MAX) / RADAR_MAX) * R;
    return { competency, angle, value, point: polar(cx, cy, r, angle), outer: polar(cx, cy, R, angle) };
  });

  const dataPoints = axisPoints.map((p) => `${p.point.x},${p.point.y}`).join(" ");

  return (
    <div className="flex flex-col gap-2">
      {/* max-width caps it at `size`, but width:100% lets it shrink to fit a
          narrower card column instead of overflowing it — the SVG's own
          coordinate space (viewBox) stays fixed, so labels scale down with
          the chart rather than staying full-size inside a squeezed one. */}
      <div className="w-full" style={{ maxWidth: size, aspectRatio: "1 / 1" }}>
        <svg viewBox={`0 0 ${size} ${size}`} width="100%" height="100%" role="img" aria-label="Radar de habilidades blandas">
          {RADAR_RINGS.map((level) => {
            const r = (level / RADAR_MAX) * R;
            const pts = SOFT_SKILL_COMPETENCIES.map((_, i) => polar(cx, cy, r, angleFor(i)));
            return (
              <polygon
                key={level}
                points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="none"
                stroke="var(--color-brand-gray-light)"
                strokeWidth={1}
              />
            );
          })}

          {axisPoints.map((p) => (
            <line key={p.competency} x1={cx} y1={cy} x2={p.outer.x} y2={p.outer.y} stroke="var(--color-brand-gray-light)" strokeWidth={1} />
          ))}

          {hasAnyData && (
            <polygon
              points={dataPoints}
              fill="var(--color-brand-blue-accent)"
              fillOpacity={0.18}
              stroke="var(--color-brand-blue-accent)"
              strokeWidth={2}
              strokeLinejoin="round"
            />
          )}
          {hasAnyData &&
            axisPoints.map(
              (p) => p.value != null && <circle key={p.competency} cx={p.point.x} cy={p.point.y} r={3} fill="var(--color-brand-blue-accent)" />
            )}

          {axisPoints.map((p) => {
            const cos = Math.cos(p.angle);
            const anchor = cos > 0.3 ? "start" : cos < -0.3 ? "end" : "middle";
            const labelPoint = polar(cx, cy, R + 12, p.angle);
            const lines = wrapLabel(COMPETENCY_LABELS[p.competency]);
            const startDy = -((lines.length - 1) / 2) * 11;
            return (
              <text key={p.competency} x={labelPoint.x} y={labelPoint.y} textAnchor={anchor} fill="var(--color-brand-text-secondary)" fontSize={9}>
                {lines.map((line, i) => (
                  <tspan key={i} x={labelPoint.x} dy={i === 0 ? startDy : 11}>
                    {line}
                  </tspan>
                ))}
              </text>
            );
          })}
        </svg>
      </div>

      {!hasAnyData && (
        <p className="text-xs text-[var(--color-brand-text-secondary)]">Todavía no hay competencias evidenciadas.</p>
      )}

      {hasAnyData && (
        <details className="text-xs">
          <summary className="cursor-pointer text-[var(--color-brand-blue-accent)]">Ver como tabla</summary>
          <table className="mt-1 w-full">
            <tbody>
              {SOFT_SKILL_COMPETENCIES.map((c) => (
                <tr key={c} className="border-t border-[var(--color-brand-gray-light)]">
                  <td className="py-1 pr-2 text-[var(--color-brand-text-secondary)]">{COMPETENCY_LABELS[c]}</td>
                  <td className="py-1 text-right font-medium">{scores[c] != null ? scores[c]!.toFixed(1) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </div>
  );
}
