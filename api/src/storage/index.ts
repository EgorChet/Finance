import * as local from "./local.js";
import * as supabase from "./supabase.js";
import { useLocalFileStorage } from "./paths.js";
import { invalidateStatementsCache, readStatementsWithCache } from "./statementsCache.js";

/** Supabase by default when credentials are set; STORAGE=local forces disk files. */
const store = useLocalFileStorage() ? local : supabase;

async function readStatementsRaw(): Promise<import("../types.js").StatementsData> {
  return store.readStatements();
}

export async function readStatements(): Promise<import("../types.js").StatementsData> {
  return readStatementsWithCache(readStatementsRaw);
}

export async function writeStatements(data: import("../types.js").StatementsData): Promise<void> {
  invalidateStatementsCache();
  await store.writeStatements(data);
}

export const discoverXlsxFiles = store.discoverXlsxFiles;
export const fileHash = store.fileHash;
export const saveUploadedXlsx = store.saveUploadedXlsx;
export const readRules = store.readRules;
export const writeRules = store.writeRules;
export const readReviewProgress = store.readReviewProgress;
export const writeReviewProgress = store.writeReviewProgress;
export const readExclusions = store.readExclusions;
export const writeExclusions = store.writeExclusions;
export const readFixedCharges = store.readFixedCharges;
export const writeFixedCharges = store.writeFixedCharges;
export const readLivingBudget = store.readLivingBudget;
export const writeLivingBudget = store.writeLivingBudget;
export const readFxFallback = store.readFxFallback;
export const writeFxFallback = store.writeFxFallback;
export const readKaspaPriceCache = store.readKaspaPriceCache;
export const writeKaspaPriceCache = store.writeKaspaPriceCache;
export const readFxcnPriceCache = store.readFxcnPriceCache;
export const writeFxcnPriceCache = store.writeFxcnPriceCache;
export const readCalendar = store.readCalendar;
export const writeCalendar = store.writeCalendar;
