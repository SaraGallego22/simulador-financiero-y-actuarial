import { auth } from "@/lib/auth";
import { INSTRUMENTS } from "@/domain/finance/instruments";

/**
 * Small static CSVs for the investment menu: `menu` (reference, read-only)
 * and `template` (instrumento_id,asignacion with 0s, ready for a team to
 * fill in and re-upload) — ported from dlInstrumentos()/dlPlantillaPortafolio()
 * in the legacy prototype, line ~1911/1916.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session) return new Response("No autorizado", { status: 403 });

  const kind = new URL(request.url).searchParams.get("kind");

  if (kind === "template") {
    const lines = [
      "instrumento_id,asignacion",
      ...INSTRUMENTS.map((i) => `${i.id},0`),
      "# asignacion = peso o monto; se normaliza al 100%. Usa los IDs de la columna instrumento_id.",
    ];
    return new Response(lines.join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=plantilla_portafolio.csv",
      },
    });
  }

  const lines = [
    "instrumento_id,nombre,rendimiento_EA,plazo_meses,nota",
    ...INSTRUMENTS.map(
      (i) =>
        `${i.id},"${i.nombre}",${(i.yield * 100).toFixed(1)}%,${i.plazoM >= 400 ? "sin venc." : i.plazoM},"${i.nota}"`
    ),
  ];
  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=menu_instrumentos.csv",
    },
  });
}
