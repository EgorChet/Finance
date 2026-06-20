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

export const USER_PROFILES: Record<HouseholdUserId, UserProfile> = {
  egor: { id: "egor", label: "Egor", features: { portfolio: true, spending: true, calendar: true, upload: true, recurring: true } },
  julia: { id: "julia", label: "Julia", features: { portfolio: true, spending: true, calendar: true, upload: true, recurring: true } },
};

export const HOUSEHOLD_USERS = [
  { id: "egor" as const, label: "Egor" },
  { id: "julia" as const, label: "Julia" },
];

export function isHouseholdUserId(value: unknown): value is HouseholdUserId {
  return value === "egor" || value === "julia";
}

export function userLabel(userId: HouseholdUserId | null | undefined): string {
  if (!userId) return "";
  return USER_PROFILES[userId]?.label ?? userId;
}

export function creatorClass(userId: HouseholdUserId | undefined): string {
  return userId ? `calendar-creator-dot--${userId}` : "calendar-creator-dot--unknown";
}

/** Decode user id from auth token payload (client-side, UI only). */
export function userIdFromToken(token: string | null | undefined): HouseholdUserId | null {
  if (!token) return null;
  try {
    const payload = token.split(".")[0];
    if (!payload) return null;
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const data = JSON.parse(json) as { user?: string };
    return isHouseholdUserId(data.user) ? data.user : null;
  } catch {
    return null;
  }
}
