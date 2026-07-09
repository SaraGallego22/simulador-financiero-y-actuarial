import { z } from "zod";
import type { CsvSchema } from "./csv";
import { CONCEPTO_BY_ID } from "@/domain/grading/concepts";

const numericString = z.string().transform((v, ctx) => {
  const n = Number(v.replace(/[^0-9.-]/g, ""));
  if (Number.isNaN(n)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `"${v}" no es un número válido` });
    return z.NEVER;
  }
  return n;
});

/** Tariff upload: `id_expuesto,prima`, one row per priced exposure (Día 1/2). */
export const tariffRowSchema = z.object({
  id_expuesto: numericString,
  prima: numericString,
});
export type TariffRow = z.infer<typeof tariffRowSchema>;
export const tariffCsvSchema: CsvSchema<TariffRow> = {
  headerAliases: { id_expuesto: ["expuesto"], prima: ["prima"] },
  rowSchema: tariffRowSchema,
};

/** Team roster upload: `nombre,equipo` — matched against team names case-insensitively. */
export const rosterRowSchema = z.object({
  nombre: z.string().trim().min(1),
  equipo: z.string().trim().min(1),
});
export type RosterRow = z.infer<typeof rosterRowSchema>;
export const rosterCsvSchema: CsvSchema<RosterRow> = {
  headerAliases: { nombre: ["nombre"], equipo: ["equipo"] },
  rowSchema: rosterRowSchema,
};

/** Financial deliverable upload: `concepto,valor` — concepto must be a "reporte"-type CONCEPTO. */
export const deliverableRowSchema = z.object({
  concepto: z.string().trim().refine((id) => CONCEPTO_BY_ID[id]?.tipo === "reporte", {
    message: "concepto no reconocido o no es un entregable de tipo reporte",
  }),
  valor: numericString,
});
export type DeliverableRow = z.infer<typeof deliverableRowSchema>;
export const deliverableCsvSchema: CsvSchema<DeliverableRow> = {
  headerAliases: { concepto: ["concepto"], valor: ["valor"] },
  rowSchema: deliverableRowSchema,
};
