const CAL_SYNC_JOB_KEY = "finance-cal-sync-job";

export function saveCalSyncJobId(jobId: string): void {
  try {
    localStorage.setItem(CAL_SYNC_JOB_KEY, jobId);
  } catch {
    /* private mode */
  }
}

export function readCalSyncJobId(): string | null {
  try {
    return localStorage.getItem(CAL_SYNC_JOB_KEY);
  } catch {
    return null;
  }
}

export function clearCalSyncJobId(): void {
  try {
    localStorage.removeItem(CAL_SYNC_JOB_KEY);
  } catch {
    /* private mode */
  }
}
