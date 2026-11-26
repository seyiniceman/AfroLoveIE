import type { Profile as StoredProfile, RelationshipIntent } from "@/generated/prisma/client";

export type EditableProfile = Omit<StoredProfile, "id" | "userId" | "updatedAt">;

export const profileIntents = ["LONG_TERM", "CASUAL", "FRIENDSHIP", "MARRIAGE", "NETWORKING"] as const;
export const intentNames: Record<RelationshipIntent, string> = {
  LONG_TERM: "Long-term dating",
  CASUAL: "Casual dating",
  FRIENDSHIP: "Friendship",
  MARRIAGE: "Marriage-minded",
  NETWORKING: "Networking",
};

export const counties = [
  "Antrim", "Armagh", "Carlow", "Cavan", "Clare", "Cork", "Derry", "Donegal", "Down", "Dublin", "Fermanagh",
  "Galway", "Kerry", "Kildare", "Kilkenny", "Laois", "Leitrim", "Limerick", "Longford", "Louth", "Mayo",
  "Meath", "Monaghan", "Offaly", "Roscommon", "Sligo", "Tipperary", "Tyrone", "Waterford", "Westmeath", "Wexford", "Wicklow",
] as const;

export const interestOptions = [
  "Cooking", "Live music", "Travel", "Fitness", "Books", "Film", "Art", "Dance",
  "Football", "Hiking", "Food spots", "Volunteering", "Photography", "Games",
] as const;

export const promptOptions = {
  saturdayPrompt: "My ideal Saturday in Ireland…",
  traditionPrompt: "A tradition I’d love to share…",
  meetupPrompt: "A good first meet-up for me is…",
  futurePrompt: "The future I’m working towards looks like…",
} as const;
export type PromptKey = keyof typeof promptOptions;
export const promptKeys = Object.keys(promptOptions) as PromptKey[];

export function isPromptKey(value: unknown): value is PromptKey {
  return typeof value === "string" && Object.hasOwn(promptOptions, value);
}

export function memberIntents(profile: Pick<EditableProfile, "relationshipIntent" | "relationshipIntents">) {
  return profile.relationshipIntents.length ? profile.relationshipIntents : [profile.relationshipIntent];
}

export function compatibleIntents(profile: Pick<EditableProfile, "relationshipIntent" | "relationshipIntents">): RelationshipIntent[] {
  const selected = memberIntents(profile);
  return [...new Set<RelationshipIntent>(selected.flatMap((intent) =>
    intent === "MARRIAGE" || intent === "LONG_TERM" ? ["MARRIAGE", "LONG_TERM"] : [intent],
  ))];
}

export function canDiscover(
  viewer: Pick<EditableProfile, "published" | "discoveryPaused" | "city" | "relationshipIntents" | "relationshipIntent"> & { county?: string | null },
  other: typeof viewer,
) {
  return viewer.published && other.published && !viewer.discoveryPaused && !other.discoveryPaused &&
    (viewer.county && other.county
      ? viewer.county === other.county
      : viewer.city.toLowerCase() === other.city.toLowerCase()) &&
    memberIntents(other).some((intent) => compatibleIntents(viewer).includes(intent));
}

export function visibleProfile(profile: EditableProfile) {
  return {
    displayName: profile.displayName,
    city: profile.city,
    county: profile.county,
    relationshipIntent: profile.relationshipIntent,
    relationshipIntents: memberIntents(profile),
    bio: profile.bio,
    identityText: profile.identityText,
    culturalBackground: profile.culturalBackground,
    gender: profile.showGender ? profile.gender : null,
    ethnicity: profile.showEthnicity ? profile.ethnicity : null,
    occupation: profile.occupation,
    interests: profile.interests,
    languages: profile.languages,
    lookingFor: profile.lookingFor,
    traditionPrompt: profile.traditionPrompt,
    futurePrompt: profile.futurePrompt,
    saturdayPrompt: profile.saturdayPrompt,
    meetupPrompt: profile.meetupPrompt,
  };
}

export type VisibleProfile = ReturnType<typeof visibleProfile>;
