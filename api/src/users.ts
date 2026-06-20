export type HouseholdUserId = "egor" | "julia";

export type UserFeatures = {
  portfolio: boolean;
  spending: boolean;
  calendar: boolean;
  upload: boolean;
  recurring: boolean;
};

export type UserProfile = {
  id: HouseholdUserId;
  label: string;
  features: UserFeatures;
};

const DEFAULT_FEATURES: UserFeatures = {
  portfolio: true,
  spending: true,
  calendar: true,
  upload: true,
  recurring: true,
};

/** Everyone gets full access for now — flip individual flags later if needed. */
export const ALL_FEATURES: UserFeatures = { ...DEFAULT_FEATURES };

export const HOUSEHOLD_USER_IDS: HouseholdUserId[] = ["egor", "julia"];

function displayLabel(userId: HouseholdUserId): string {
  if (userId === "egor") return process.env.AUTH_LABEL_EGOR?.trim() || "boss";
  return process.env.AUTH_LABEL_JULIA?.trim() || "julia";
}

export function userProfile(userId: HouseholdUserId): UserProfile {
  return {
    id: userId,
    label: displayLabel(userId),
    features: ALL_FEATURES,
  };
}

export function listAuthUsers(): { id: HouseholdUserId; label: string }[] {
  return HOUSEHOLD_USER_IDS.map((id) => ({ id, label: displayLabel(id) }));
}

export function isHouseholdUserId(value: unknown): value is HouseholdUserId {
  return value === "egor" || value === "julia";
}

export function parseUserId(value: unknown): HouseholdUserId | null {
  return isHouseholdUserId(value) ? value : null;
}

/** Same family password for both — pick a name only to tag calendar events etc. */
export function passwordForUser(userId: HouseholdUserId): string | undefined {
  const shared = process.env.AUTH_PASSWORD?.trim();
  if (userId === "egor") {
    return process.env.AUTH_USER_EGOR?.trim() || shared;
  }
  return process.env.AUTH_PASSWORD_JULIA?.trim() || shared;
}

export function defaultEventCreator(existing?: string | null): HouseholdUserId {
  return parseUserId(existing) ?? "egor";
}
