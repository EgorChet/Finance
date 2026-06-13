/** Roll up subscription billing descriptors to a short vendor name for charts. */
export function subscriptionVendor(name: string): string {
  const n = name.trim();
  if (/apple/i.test(n)) return "Apple";
  if (/cursor/i.test(n)) return "Cursor";
  if (/netflix/i.test(n)) return "Netflix";
  if (/\baws\b/i.test(n)) return "AWS";
  if (/openai|chatgpt/i.test(n)) return "OpenAI";
  if (/spotify/i.test(n)) return "Spotify";
  if (/github/i.test(n)) return "GitHub";
  if (/google\s*one|youtube/i.test(n)) return "Google";
  if (/microsoft|office\s*365/i.test(n)) return "Microsoft";
  if (/adobe/i.test(n)) return "Adobe";
  if (/disney/i.test(n)) return "Disney";
  if (/fitness|\bgym\b|כושר|raybo|רייבו/i.test(n)) return "Fitness";
  if (/\bcellcom\b|hot\s*mobile|pelephone|פלאפון|סלקום/i.test(n)) return "Mobile phone";
  return n;
}
