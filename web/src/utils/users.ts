import type { HouseholdUserId } from "../types";

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

/** Default display names — API may override via /auth/status. */
export const DEFAULT_USER_LABELS: Record<HouseholdUserId, string> = {
  egor: "boss",
  julia: "julia",
};

export const DEFAULT_HOUSEHOLD_USERS = (
  Object.entries(DEFAULT_USER_LABELS) as [HouseholdUserId, string][]
).map(([id, label]) => ({ id, label }));

export function isHouseholdUserId(value: unknown): value is HouseholdUserId {
  return value === "egor" || value === "julia";
}

export function userLabel(
  userId: HouseholdUserId | null | undefined,
  directory: Partial<Record<HouseholdUserId, string>> = DEFAULT_USER_LABELS,
): string {
  if (!userId) return "";
  return directory[userId] ?? DEFAULT_USER_LABELS[userId] ?? userId;
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

export function directoryFromUsers(users: { id: HouseholdUserId; label: string }[]): Record<HouseholdUserId, string> {
  return {
    egor: users.find((u) => u.id === "egor")?.label ?? DEFAULT_USER_LABELS.egor,
    julia: users.find((u) => u.id === "julia")?.label ?? DEFAULT_USER_LABELS.julia,
  };
}
