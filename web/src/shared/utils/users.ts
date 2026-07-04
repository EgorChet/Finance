import type { HouseholdUserId } from "@/shared/types";

export type UserFeatures = {
  portfolio: boolean;
  spending: boolean;
  calendar: boolean;
  upload: boolean;
  recurring: boolean;
};

/** Everyone gets full access for now. */
export const ALL_FEATURES: UserFeatures = {
  portfolio: true,
  spending: true,
  calendar: true,
  upload: true,
  recurring: true,
};

export type UserProfile = {
  id: HouseholdUserId;
  label: string;
  features: UserFeatures;
};

/** In-app names — internal ids only; login names stay on the server. */
export const UI_USER_LABELS: Record<HouseholdUserId, string> = {
  egor: "egor",
  julia: "julia",
};

export const DEMO_USER_LABELS: Record<HouseholdUserId, string> = {
  egor: "User 1",
  julia: "User 2",
};

export const DEFAULT_HOUSEHOLD_USERS = (
  Object.entries(UI_USER_LABELS) as [HouseholdUserId, string][]
).map(([id, label]) => ({ id, label }));

export function isHouseholdUserId(value: unknown): value is HouseholdUserId {
  return value === "egor" || value === "julia";
}

export function userLabel(
  userId: HouseholdUserId | null | undefined,
  directory: Partial<Record<HouseholdUserId, string>> = UI_USER_LABELS,
): string {
  if (!userId) return "";
  return directory[userId] ?? UI_USER_LABELS[userId] ?? userId;
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

export function householdUsersForUi(): { id: HouseholdUserId; label: string }[] {
  return DEFAULT_HOUSEHOLD_USERS;
}
