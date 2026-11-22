import { z } from "zod";

export const intents = ["MARRIAGE", "LONG_TERM"] as const;
export const reportReasons = [
  "HARASSMENT",
  "FAKE_PROFILE",
  "INAPPROPRIATE_CONTENT",
  "SCAM_OR_SPAM",
  "OTHER",
] as const;

export function ageOnDate(date: Date, today = new Date()) {
  let age = today.getUTCFullYear() - date.getUTCFullYear();
  const birthdayHasPassed =
    today.getUTCMonth() > date.getUTCMonth() ||
    (today.getUTCMonth() === date.getUTCMonth() && today.getUTCDate() >= date.getUTCDate());
  if (!birthdayHasPassed) age -= 1;
  return age;
}

export const profileSchema = z.object({
  displayName: z.string().trim().min(2).max(40),
  bio: z.string().trim().max(800),
  city: z.string().trim().min(2).max(80),
  relationshipIntent: z.enum(intents),
  identityText: z.string().trim().max(160).nullable(),
  culturalBackground: z.string().trim().max(160).nullable(),
  traditionPrompt: z.string().trim().max(280),
  futurePrompt: z.string().trim().max(280),
  photos: z.array(
    z.object({
      url: z.string().min(1).max(2_800_000),
      altText: z.string().trim().max(160),
    }),
  ).max(6).superRefine((photos, context) => {
    photos.forEach((photo, index) => {
      if (photo.altText.length < 5) {
        context.addIssue({
          code: "custom",
          message: "Add a short, descriptive alt text for each photo.",
          path: [index, "altText"],
        });
      }
    });
  }),
});
