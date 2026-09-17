export const FLOORS = Array.from({length:30}, (_,i)=>30-i);
export const validRoom = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{32}$/.test(v);
export function normalizeNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((s): s is string => typeof s === 'string' && /^[가-힣]{2,5}$/.test(s)))].slice(0,20);
}
export type Floor = {floor:number; count:number; names:string[]; updatedAt:number|null; state:'active'|'empty'|'offline'};
