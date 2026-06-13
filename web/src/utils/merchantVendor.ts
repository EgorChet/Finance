/**
 * Roll up chain branch names to a single display label (Arcaffe, Super Pharm, …).
 * Hebrew keys stay unique in rules; English names group merchants in charts.
 */
export function canonicalMerchantEnglish(english: string, hebrew = ""): string {
  const n = english.trim();
  if (!n) return n;
  const text = `${hebrew} ${n}`;

  if (/ארקפה\s*ביג\s*גלילות|arcaffe.*big.*galilot|zara.*big\s*fashion/i.test(text)) {
    return "Zara Big Fashion Galilot";
  }

  if (/leumi\s*bonus|לאומי\s*בונוס/i.test(text)) return "Leumi Bonus";
  if (/arcaff|ארקפה/i.test(text)) return "Arcaffe";
  if (/good\s*[- ]?pharm|גוד\s*פארם/i.test(text)) return "Good Pharm";
  if (/super\s*[- ]?pharm|superpharm|סופר\s*פארם/i.test(text)) return "Super Pharm";
  if (/tiv\s*taam|טיב\s*טעם/i.test(text)) return "Tiv Taam";
  if (/shufersal|שופרסל/i.test(text)) return "Shufersal";
  if (/carrefour|קרפור/i.test(text)) return "Carrefour";
  if (/\bam:pm\b|am\s*pm/i.test(text)) return "AM:PM";
  if (/\bwolt\b|וולט/i.test(text) && !/tiv\s*taam|טיב\s*טעם/i.test(text)) return "Wolt";

  return n;
}
