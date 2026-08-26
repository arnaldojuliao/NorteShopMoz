import type { Province } from "@/lib/types";

/** Províncias de Moçambique com taxa de entrega estimada (Meticais). */
export const provinces: Province[] = [
  { name: "Maputo Cidade", fee: 120, days: [1, 3] },
  { name: "Maputo Província", fee: 150, days: [2, 4] },
  { name: "Gaza", fee: 200, days: [3, 5] },
  { name: "Inhambane", fee: 220, days: [3, 6] },
  { name: "Sofala", fee: 260, days: [4, 7] },
  { name: "Manica", fee: 280, days: [4, 7] },
  { name: "Tete", fee: 320, days: [5, 8] },
  { name: "Zambézia", fee: 300, days: [5, 8] },
  { name: "Nampula", fee: 320, days: [5, 9] },
  { name: "Cabo Delgado", fee: 360, days: [6, 10] },
  { name: "Niassa", fee: 380, days: [6, 11] },
];

export function getProvince(name: string): Province | undefined {
  return provinces.find((p) => p.name === name);
}
