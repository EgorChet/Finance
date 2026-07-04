const BROWSE_INCLUDE_RECURRING_KEY = "finance-browse-include-recurring";

export function loadBrowseIncludeRecurring(): boolean {
  const raw = localStorage.getItem(BROWSE_INCLUDE_RECURRING_KEY);
  return raw === "true";
}

export function saveBrowseIncludeRecurring(value: boolean): void {
  localStorage.setItem(BROWSE_INCLUDE_RECURRING_KEY, String(value));
}
