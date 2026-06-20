import type { HouseholdUserId } from "../types";

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

/** Default display labels — API may override via /auth/status. */
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

export function parseUsername(
  raw: string,
  labels: Partial<Record<HouseholdUserId, string>> = DEFAULT_USER_LABELS,
): HouseholdUserId | null {
  const name = raw.trim().toLowerCase();
  if (!name) return null;
  const boss = (labels.egor ?? DEFAULT_USER_LABELS.egor).toLowerCase();
  const julia = (labels.julia ?? DEFAULT_USER_LABELS.julia).toLowerCase();
  if (name === "egor" || name === boss) return "egor";
  if (name === "julia" || name === julia) return "julia";
  return null;
}

export function loginNameHint(labels: Partial<Record<HouseholdUserId, string>> = DEFAULT_USER_LABELS): string {
  return `${labels.egor ?? DEFAULT_USER_LABELS.egor} or ${labels.julia ?? DEFAULT_USER_LABELS.julia}`;
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
