import { auth } from "@/lib/auth";
import { INSTRUMENTS } from "@/domain/finance/instruments";

/**
 * Reference CSV of the investment menu — informational only, since the
 * portfolio decision itself is entered through an in-app form (see
 * PortfolioForm.tsx), not a CSV upload. Ported from dlInstrumentos() in the
 * legacy prototype, line ~1911.
 */
export async function GET() {
  const session = await auth();
  if (!session) return new Response("No autorizado", { status: 403 });

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
