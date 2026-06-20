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

export const USER_PROFILES: Record<HouseholdUserId, UserProfile> = {
  egor: { id: "egor", label: "Egor", features: { ...DEFAULT_FEATURES } },
  julia: { id: "julia", label: "Julia", features: { ...DEFAULT_FEATURES } },
};

export const HOUSEHOLD_USER_IDS: HouseholdUserId[] = ["egor", "julia"];

export function isHouseholdUserId(value: unknown): value is HouseholdUserId {
  return value === "egor" || value === "julia";
}

export function parseUserId(value: unknown): HouseholdUserId | null {
  return isHouseholdUserId(value) ? value : null;
}

export function userProfile(userId: HouseholdUserId): UserProfile {
  return USER_PROFILES[userId];
}

export function listAuthUsers(): { id: HouseholdUserId; label: string }[] {
  return HOUSEHOLD_USER_IDS.map((id) => ({ id, label: USER_PROFILES[id].label }));
}

/** Password for a household user (from env). */
export function passwordForUser(userId: HouseholdUserId): string | undefined {
  const shared = process.env.AUTH_PASSWORD?.trim();
  if (userId === "egor") {
    return process.env.AUTH_USER_EGOR?.trim() || shared;
  }
  return process.env.AUTH_PASSWORD_JULIA?.trim() || process.env.AUTH_USER_JULIA?.trim() || shared;
}

export function defaultEventCreator(existing?: string | null): HouseholdUserId {
  return parseUserId(existing) ?? "egor";
}
