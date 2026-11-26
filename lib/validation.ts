import { z } from "zod";

import { counties, interestOptions, profileIntents, promptKeys } from "./profile-options";

export const intents = profileIntents;
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
  county: z.enum(counties).nullable().optional(),
  relationshipIntent: z.enum(intents),
  relationshipIntents: z.array(z.enum(intents)).max(4).optional(),
  saveMode: z.enum(["draft", "publish"]).optional(),
  onboardingStep: z.number().int().min(0).max(4).optional(),
  sex: z.string().trim().max(80).nullable().optional(),
  gender: z.string().trim().max(80).nullable().optional(),
  showGender: z.boolean().optional(),
  ethnicity: z.string().trim().max(120).nullable().optional(),
  showEthnicity: z.boolean().optional(),
  occupation: z.string().trim().max(100).nullable().optional(),
  interests: z.array(z.enum(interestOptions)).max(8).optional(),
  languages: z.array(z.string().trim().min(1).max(40)).max(6).optional(),
  lookingFor: z.string().trim().max(400).optional(),
  saturdayPrompt: z.string().trim().max(280).optional(),
  meetupPrompt: z.string().trim().max(280).optional(),
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
}).superRefine((profile, context) => {
  if (profile.saveMode !== "publish") return;
  if (profile.bio.length < 20) {
    context.addIssue({ code: "custom", message: "Write at least 20 characters in your bio.", path: ["bio"] });
  }
  const answered = promptKeys.filter((key) => Boolean(profile[key]?.trim())).length;
  if (answered < 2 || answered > 3) {
    context.addIssue({ code: "custom", message: "Answer two or three profile prompts before saving.", path: ["traditionPrompt"] });
  }
  if (!profile.relationshipIntents?.length) {
    context.addIssue({ code: "custom", message: "Choose at least one relationship intention.", path: ["relationshipIntents"] });
  }
});
