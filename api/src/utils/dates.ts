const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Format YYYY-MM-DD as "Mon YYYY" without timezone drift. */
export function monthLabelFromIso(dateStr: string): string {
  const [y, m] = dateStr.slice(0, 10).split("-");
  const monthIndex = parseInt(m, 10) - 1;
  if (monthIndex < 0 || monthIndex > 11 || !y) return dateStr;
  return `${MONTHS[monthIndex]} ${y}`;
}
