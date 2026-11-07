const UPLOAD_JOB_KEY = "finance-upload-job";

export function saveUploadJobId(jobId: string): void {
  try {
    localStorage.setItem(UPLOAD_JOB_KEY, jobId);
  } catch {
    /* private mode */
  }
}

export function readUploadJobId(): string | null {
  try {
    return localStorage.getItem(UPLOAD_JOB_KEY);
  } catch {
    return null;
  }
}

export function clearUploadJobId(): void {
  try {
    localStorage.removeItem(UPLOAD_JOB_KEY);
  } catch {
    /* private mode */
  }
}
