export type HouseholdUserId = "egor" | "julia";

export type UserProfile = {
  id: HouseholdUserId;
  label: string;
};

export const HOUSEHOLD_USER_IDS: HouseholdUserId[] = ["egor", "julia"];

function loginLabels(): Record<HouseholdUserId, string> {
  const fromList = process.env.AUTH_LABELS?.split(",").map((part) => part.trim()).filter(Boolean);
  if (fromList?.length === 2) {
    return { egor: fromList[0]!, julia: fromList[1]! };
  }
  return {
    egor: process.env.AUTH_LABEL_EGOR?.trim() || "",
    julia: process.env.AUTH_LABEL_JULIA?.trim() || "",
  };
}

export function loginLabelsConfigured(): boolean {
  const labels = loginLabels();
  return Boolean(labels.egor && labels.julia);
}

export function uiDisplayName(userId: HouseholdUserId): string {
  return userId;
}

export function userProfile(userId: HouseholdUserId): UserProfile {
  return {
    id: userId,
    label: uiDisplayName(userId),
  };
}

export function listAuthUsers(): { id: HouseholdUserId; label: string }[] {
  return HOUSEHOLD_USER_IDS.map((id) => ({ id, label: uiDisplayName(id) }));
}

export function isHouseholdUserId(value: unknown): value is HouseholdUserId {
  return value === "egor" || value === "julia";
}

export function parseUserId(value: unknown): HouseholdUserId | null {
  return isHouseholdUserId(value) ? value : null;
}

export function parseUsername(raw: string): HouseholdUserId | null {
  if (!loginLabelsConfigured()) return null;
  const name = raw.trim().toLowerCase();
  if (!name) return null;
  const labels = loginLabels();
  const primaryLabel = labels.egor.toLowerCase();
  const secondaryLabel = labels.julia.toLowerCase();
  if (name === primaryLabel) return "egor";
  if (name === secondaryLabel) return "julia";
  return null;
}

export function passwordForUser(userId: HouseholdUserId): string | undefined {
  const shared = process.env.AUTH_PASSWORD?.trim();
  if (userId === "egor") {
    return process.env.AUTH_USER_EGOR?.trim() || shared;
  }
  return process.env.AUTH_PASSWORD_JULIA?.trim() || shared;
}
