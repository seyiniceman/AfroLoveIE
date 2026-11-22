import "dotenv/config";
import { PrismaClient, RelationshipIntent, Role } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { getRuntimeConfig } from "../scripts/runtime-config.mjs";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 }),
});

async function main() {
  const config = getRuntimeConfig();
  if (config.appEnvironment !== "development" || !config.demoDataEnabled) {
    throw new Error("Demo seeding is restricted to local development.");
  }

  const passwordHash = await bcrypt.hash("LocalOnly!2026", 12);
  const accounts = [
    {
      email: "amara@example.test",
      role: Role.MEMBER,
      displayName: "Amara",
      bio: "A hopeful romantic building a thoughtful life in Dublin. I value family, laughter and a home that feels welcoming.",
      city: "Dublin",
      identityText: "Nigerian-Irish",
      culturalBackground: "A mix of both, in my own way",
      traditionPrompt: "Sunday lunch that brings everyone around the table.",
      futurePrompt: "A calm, joyful home where we keep choosing each other.",
    },
    {
      email: "daniel@example.test",
      role: Role.MEMBER,
      displayName: "Daniel",
      bio: "I like long walks, good food and making space for the people I love. Here for a relationship with real intention.",
      city: "Dublin",
      identityText: "Ghanaian",
      culturalBackground: "I carry Ghana with me and love learning the traditions that matter to someone else.",
      traditionPrompt: "I’d love to share the way my family gathers across generations to cook, tell stories and make room for one more chair.",
      futurePrompt: "A steady partnership, shared adventures and a family table that keeps growing.",
    },
    {
      email: "moderator@example.test",
      role: Role.MODERATOR,
      displayName: "Community moderator",
      bio: "",
      city: "Dublin",
      identityText: null,
      culturalBackground: null,
      traditionPrompt: "",
      futurePrompt: "",
    },
    {
      email: "nnenna@example.test",
      role: Role.MEMBER,
      displayName: "Nnenna",
      bio: "Bookshops, live music and making a home in Ireland. Looking for my person, not a pen pal.",
      city: "Dublin",
      identityText: "Igbo",
      culturalBackground: "I’m happy to share if you ask with curiosity.",
      traditionPrompt: "A birthday breakfast made by the people who know you best.",
      futurePrompt: "Building a kind and grounded life with someone who means what they say.",
    },
    {
      email: "lucas@example.test",
      role: Role.MEMBER,
      displayName: "Lucas",
      bio: "Irish, outdoorsy and learning to cook more than one reliable dish. Here for a future-minded connection.",
      city: "Dublin",
      identityText: "Irish",
      culturalBackground: null,
      traditionPrompt: "A coastal walk followed by a big Sunday dinner.",
      futurePrompt: "A partnership that feels like being on the same team.",
    },
  ];

  for (const account of accounts) {
    const profileData = {
      displayName: account.displayName,
      bio: account.bio,
      city: account.city,
      relationshipIntent: RelationshipIntent.MARRIAGE,
      identityText: account.identityText,
      culturalBackground: account.culturalBackground,
      traditionPrompt: account.traditionPrompt,
      futurePrompt: account.futurePrompt,
    };
    const user = await prisma.user.upsert({
      where: { email: account.email },
      update: {
        profile: {
          upsert: {
            create: profileData,
            update: {},
          },
        },
      },
      create: {
        email: account.email,
        passwordHash,
        role: account.role,
        dateOfBirth: new Date("1992-05-15T00:00:00.000Z"),
        profile: { create: profileData },
      },
    });
    if (!user.id) throw new Error("Demo account was not created.");
  }
}

main()
  .catch((error: unknown) => {
    console.error("Demo data seeding failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
