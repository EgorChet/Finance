const CAL_SYNC_JOB_KEY = "finance-cal-sync-job";

export function saveCalSyncJobId(jobId: string): void {
  try {
    sessionStorage.setItem(CAL_SYNC_JOB_KEY, jobId);
  } catch {
    /* private browsing / storage full */
  }
}

export function readCalSyncJobId(): string | null {
  try {
    return sessionStorage.getItem(CAL_SYNC_JOB_KEY);
  } catch {
    return null;
  }
}

export function clearCalSyncJobId(): void {
  try {
    sessionStorage.removeItem(CAL_SYNC_JOB_KEY);
  } catch {
    /* ignore */
  }
}
