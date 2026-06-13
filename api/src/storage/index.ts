import * as local from "./local.js";
import * as supabase from "./supabase.js";

const useSupabase = process.env.STORAGE === "supabase" && supabase.supabaseConfigured();

const store = useSupabase ? supabase : local;

export const discoverXlsxFiles = store.discoverXlsxFiles;
export const fileHash = store.fileHash;
export const saveUploadedXlsx = store.saveUploadedXlsx;
export const readStatements = store.readStatements;
export const writeStatements = store.writeStatements;
export const readRules = store.readRules;
export const writeRules = store.writeRules;
export const readReviewProgress = store.readReviewProgress;
export const writeReviewProgress = store.writeReviewProgress;
export const readExclusions = store.readExclusions;
export const writeExclusions = store.writeExclusions;
export const readFixedCharges = store.readFixedCharges;
export const writeFixedCharges = store.writeFixedCharges;
