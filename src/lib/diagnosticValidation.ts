import { z } from "zod";

/**
 * Schéma de validation pour un code défaut (DTC)
 */
export const dtcCodeSchema = z.object({
  code: z.string().min(1, "Le code défaut ne peut pas être vide").trim(),
  description: z.string().optional().default(""),
});

export type DtcCode = z.infer<typeof dtcCodeSchema>;

/**
 * Parse une ligne de code défaut au format "CODE - Description"
 * Supporte aussi le format "CODE" seul
 */
export function parseDtcLine(line: string): DtcCode | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  // Format: "P0171 - Mélange trop pauvre" ou juste "P0171"
  const parts = trimmed.split("-").map(p => p.trim());

  const code = parts[0];
  const description = parts[1] || "";

  try {
    return dtcCodeSchema.parse({ code, description });
  } catch (error) {
    console.error(`Invalid DTC format: "${line}"`, error);
    return null;
  }
}

/**
 * Parse plusieurs lignes de codes défaut
 */
export function parseDtcCodes(text: string): DtcCode[] {
  return text
    .split("\n")
    .map(line => parseDtcLine(line))
    .filter((dtc): dtc is DtcCode => dtc !== null);
}

/**
 * Parse les symptômes (un par ligne, non vides)
 */
export function parseSymptoms(text: string): string[] {
  return text
    .split("\n")
    .map(line => line.trim())
    .filter(line => line.length > 0);
}

/**
 * Parse les tests effectués (un par ligne, non vides)
 */
export function parseTests(text: string): string[] {
  return text
    .split("\n")
    .map(line => line.trim())
    .filter(line => line.length > 0);
}

/**
 * Schéma de validation pour les données du véhicule
 */
export const vehicleDataSchema = z.object({
  vin: z.string()
    .length(17, "Le VIN doit contenir exactement 17 caractères")
    .regex(/^[A-HJ-NPR-Z0-9]{17}$/, "Format VIN invalide"),
  make: z.string().min(1, "La marque est requise").trim(),
  model: z.string().min(1, "Le modèle est requis").trim(),
  year: z.number()
    .int("L'année doit être un nombre entier")
    .min(1900, "L'année doit être supérieure à 1900")
    .max(new Date().getFullYear() + 1, "L'année ne peut pas être dans le futur"),
  engineCode: z.string().trim().optional(),
});

export type VehicleData = z.infer<typeof vehicleDataSchema>;

/**
 * Valide les données du véhicule
 */
export function validateVehicleData(data: {
  vin: string;
  make: string;
  model: string;
  year: number;
  engineCode?: string;
}): { success: true; data: VehicleData } | { success: false; errors: string[] } {
  try {
    const validated = vehicleDataSchema.parse(data);
    return { success: true, data: validated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = error.errors.map(err => `${err.path.join('.')}: ${err.message}`);
      return { success: false, errors };
    }
    return { success: false, errors: ["Erreur de validation inconnue"] };
  }
}
