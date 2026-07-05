export type VehicleType = "sedan" | "suv" | "pickup" | "deportivo" | "compacto" | "van";
export type Zone = "urbana" | "suburbana" | "rural";
export type Usage = "personal" | "comercial" | "mixto";
export type ParkingAccess = "si" | "no";
export type EducationLevel = "basica" | "tecnica" | "universitaria" | "posgrado";
export type Brand =
  | "chevrolet"
  | "renault"
  | "mazda"
  | "toyota"
  | "nissan"
  | "hyundai"
  | "kia"
  | "ford";
export type Gender = "M" | "F";

/** Risk factors for one Colombia exposure, mirroring the legacy `eObj` shape. */
export interface ColombiaExposure {
  id: number;
  edad: number;
  tipo: VehicleType;
  zona: Zone;
  antig: number;
  km: number;
  hist: number;
  valor: number;
  uso: Usage;
  parq: ParkingAccess;
  edu: EducationLevel;
  estrato: number;
  genero: Gender;
  marca: Brand;
}
