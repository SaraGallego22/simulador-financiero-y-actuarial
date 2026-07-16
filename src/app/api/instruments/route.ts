import { auth } from "@/lib/auth";
import { INSTRUMENTS, displayYieldLabel } from "@/domain/finance/instruments";
import { COVARIANCE_MATRIX } from "@/domain/finance/markowitz";

/**
 * Reference CSV of the investment menu — informational only, since the
 * portfolio decision itself is entered through an in-app form (see
 * PortfolioForm.tsx), not a CSV upload. Ported from dlInstrumentos() in the
 * legacy prototype, line ~1911. `?kind=covarianza` instead returns the
 * covariance matrix Día 1's minimum-variance exercise needs (see
 * markowitz.ts) — a separate download since it's a matrix, not a per-row
 * table, and only relevant to that one exercise.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session) return new Response("No autorizado", { status: 403 });

  const { searchParams } = new URL(request.url);
  if (searchParams.get("kind") === "covarianza") {
    const ids = INSTRUMENTS.map((i) => i.id);
    const lines = [
      `instrumento_id,${ids.join(",")}`,
      ...COVARIANCE_MATRIX.map((row, i) => `${ids[i]},${row.map((v) => v.toFixed(8)).join(",")}`),
    ];
    return new Response(lines.join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=matriz_covarianza.csv",
      },
    });
  }

  const lines = [
    "instrumento_id,nombre,rendimiento_EA,plazo_meses,nota",
    ...INSTRUMENTS.map(
      (i) =>
        `${i.id},"${i.nombre}","${displayYieldLabel(i)}",${i.plazoM >= 400 ? "sin venc." : i.plazoM},"${i.nota}"`
    ),
  ];
  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=menu_instrumentos.csv",
    },
  });
}
