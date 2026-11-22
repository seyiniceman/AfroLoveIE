import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const baseUrl = new URL(process.env.TEST_BASE_URL ?? "http://localhost:3000");
const origin = baseUrl.origin;
const credentials = `LocalTest!${randomUUID()}Aa9`;
const synthetic = randomUUID().replaceAll("-", "");
const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/r9sAAAAASUVORK5CYII=";

async function request(actor, path, { method = "GET", body, requestOrigin = origin } = {}) {
  const headers = {};
  if (actor?.cookie) headers.Cookie = actor.cookie;
  if (method !== "GET") headers.Origin = requestOrigin;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(new URL(path, baseUrl), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = response.headers.get("content-type")?.includes("application/json")
    ? await response.json()
    : null;
  return { response, data };
}

async function expectStatus(actor, path, status, options) {
  const result = await request(actor, path, options);
  assert.equal(
    result.response.status,
    status,
    `${options?.method ?? "GET"} ${path}: expected ${status}, received ${result.response.status}; ${JSON.stringify(result.data)}`,
  );
  return result;
}

async function signUp(label, city = "Dublin") {
  const account = {
    cookie: "",
    email: `${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${synthetic}@example.test`,
  };
  const result = await expectStatus(account, "/api/auth", 201, {
    method: "POST",
    body: {
      action: "signup",
      email: account.email,
      password: credentials,
      displayName: label,
      dateOfBirth: "1992-05-15",
      ageConfirmed: true,
    },
  });
  account.cookie = result.response.headers.get("set-cookie")?.split(";")[0] ?? "";
  assert.ok(account.cookie, "signup must set the session cookie");
  await expectStatus(account, "/api/profile", 200, {
    method: "PUT",
    body: {
      displayName: label,
      bio: "A synthetic account for local release verification.",
      city,
      relationshipIntent: "MARRIAGE",
      identityText: null,
      culturalBackground: null,
      traditionPrompt: `${label}'s family table is a tradition worth sharing.`,
      futurePrompt: "A thoughtful partnership built on kindness and trust.",
      photos: [],
    },
  });
  return account;
}

async function acceptIntroduction(sender, recipient, targetId) {
  const sent = await expectStatus(sender, "/api/discovery", 201, {
    method: "POST",
    body: {
      toUserId: targetId,
      promptKey: "traditionPrompt",
      message: "I would love to hear more about that tradition.",
    },
  });
  const introId = sent.data.introduction.id;
  await expectStatus(sender, `/api/introductions/${introId}`, 404, {
    method: "PATCH",
    body: { action: "accept" },
  });
  const inbox = await expectStatus(recipient, "/api/introductions", 200);
  assert.ok(inbox.data.introductions.some((item) => item.id === introId));
  const accepted = await expectStatus(recipient, `/api/introductions/${introId}`, 200, {
    method: "PATCH",
    body: { action: "accept" },
  });
  const repeated = await expectStatus(recipient, `/api/introductions/${introId}`, 200, {
    method: "PATCH",
    body: { action: "accept" },
  });
  assert.equal(repeated.data.match.id, accepted.data.match.id);
  assert.equal(repeated.data.match.conversation.id, accepted.data.match.conversation.id);
  return accepted.data.match;
}

const authState = await expectStatus(null, "/api/auth", 200);
assert.equal(
  authState.data.demoAvailable,
  true,
  "This integration script only runs against the local development app with demo fixtures enabled.",
);

const accounts = [];
try {
  const amara = await signUp("Synthetic Amara");
  accounts.push(amara);
  const daniel = await signUp("Synthetic Daniel");
  accounts.push(daniel);
  const outsider = await signUp("Synthetic Outsider", "Cork");
  accounts.push(outsider);
  const unmatchPartner = await signUp("Synthetic Unmatch");
  accounts.push(unmatchPartner);

  const amaraProfile = (await expectStatus(amara, "/api/profile", 200)).data.profile;
  await expectStatus(amara, "/api/profile", 200, {
    method: "PUT",
    body: {
      ...amaraProfile,
      userId: outsider.id,
      photos: [],
    },
  });
  assert.equal((await expectStatus(outsider, "/api/profile", 200)).data.profile.displayName, "Synthetic Outsider");

  await expectStatus(amara, "/api/discovery", 403, {
    method: "POST",
    requestOrigin: "https://not-the-app.example",
    body: { toUserId: "untrusted", promptKey: "traditionPrompt", message: "A valid-sized note." },
  });

  const danielProfile = (await expectStatus(daniel, "/api/profile", 200)).data.profile;
  await expectStatus(daniel, "/api/profile", 400, {
    method: "PUT",
    body: {
      ...danielProfile,
      photos: [{ url: "https://example.invalid/member-photo.jpg", altText: "Remote image attempt" }],
    },
  });
  await expectStatus(daniel, "/api/profile", 200, {
    method: "PUT",
    body: {
      ...danielProfile,
      photos: [{ url: png, altText: "A tiny test image" }],
    },
  });
  const discovery = (await expectStatus(amara, "/api/discovery", 200)).data.profiles;
  const discoveredDaniel = discovery.find((profile) => profile.displayName === "Synthetic Daniel");
  assert.ok(discoveredDaniel, "same-city profile should be discoverable");
  const photoUrl = discoveredDaniel.photos[0].url;
  assert.match(photoUrl, /^\/api\/media\//);
  assert.equal((await request(amara, photoUrl)).response.status, 200);
  assert.equal((await request(outsider, photoUrl)).response.status, 404);

  const firstMatch = await acceptIntroduction(amara, daniel, discoveredDaniel.userId);
  const matches = (await expectStatus(amara, "/api/matches", 200)).data.matches;
  assert.equal(matches.filter((match) => match.id === firstMatch.id).length, 1);
  assert.equal((await expectStatus(daniel, "/api/matches", 200)).data.matches.length, 1);

  await expectStatus(amara, `/api/matches/${firstMatch.id}`, 201, {
    method: "POST",
    body: { body: "A synthetic hello from the local test." },
  });
  const conversation = await expectStatus(daniel, `/api/matches/${firstMatch.id}`, 200);
  assert.equal(conversation.data.messages.length, 1);
  await expectStatus(outsider, `/api/matches/${firstMatch.id}`, 404, {
    method: "POST",
    body: { body: "This account is not a participant." },
  });

  const report = await expectStatus(amara, "/api/safety", 201, {
    method: "POST",
    body: { action: "report", subjectId: discoveredDaniel.userId, reason: "OTHER", details: "Synthetic report." },
  });
  const moderator = {};
  const modLogin = await expectStatus(moderator, "/api/auth", 200, {
    method: "POST",
    body: { action: "demo", email: "moderator@example.test" },
  });
  moderator.cookie = modLogin.response.headers.get("set-cookie")?.split(";")[0] ?? "";
  const memberQueue = await request(outsider, "/api/moderation");
  assert.equal(memberQueue.response.status, 403);
  const queue = await expectStatus(moderator, "/api/moderation", 200);
  assert.ok(queue.data.reports.some((item) => item.id === report.data.report.id));

  const secondMatch = await acceptIntroduction(amara, unmatchPartner, (
    await expectStatus(amara, "/api/discovery", 200)
  ).data.profiles.find((profile) => profile.displayName === "Synthetic Unmatch").userId);
  await expectStatus(unmatchPartner, `/api/matches/${secondMatch.id}`, 200, {
    method: "PATCH",
    body: { action: "unmatch" },
  });
  await expectStatus(amara, `/api/matches/${secondMatch.id}`, 403, {
    method: "POST",
    body: { body: "This must fail after unmatching." },
  });

  await expectStatus(amara, "/api/safety", 200, {
    method: "POST",
    body: { action: "block", subjectId: discoveredDaniel.userId },
  });
  assert.equal((await request(amara, photoUrl)).response.status, 404);
  assert.ok(!(await expectStatus(amara, "/api/discovery", 200)).data.profiles.some((profile) => profile.userId === discoveredDaniel.userId));
  assert.ok(!(await expectStatus(daniel, "/api/discovery", 200)).data.profiles.some((profile) => profile.userId === amara.id));
  await expectStatus(amara, `/api/matches/${firstMatch.id}`, 403, {
    method: "POST",
    body: { body: "This must fail after blocking." },
  });

  await expectStatus(outsider, "/api/account", 403, {
    method: "DELETE",
    body: { password: "wrong password" },
  });
  await expectStatus(outsider, "/api/account", 200, {
    method: "DELETE",
    body: { password: credentials },
  });
  assert.equal((await request(outsider, "/api/profile")).response.status, 401);

  await expectStatus(amara, "/api/auth", 200, {
    method: "POST",
    body: { action: "logout" },
  });
  assert.equal((await request(amara, "/api/profile")).response.status, 401);
  console.log("Local beta API journey passed: permissions, media, invite-independent signup, introductions, duplicate acceptance, chat, moderation, unmatch, block, logout, and account deletion.");
} finally {
  for (const account of accounts) {
    if (!account.cookie) continue;
    let result = await request(account, "/api/account", {
      method: "DELETE",
      body: { password: credentials },
    });
    if (result.response.status === 401) {
      const login = await request(null, "/api/auth", {
        method: "POST",
        body: { action: "login", email: account.email, password: credentials },
      });
      if (login.response.status === 200) {
        account.cookie = login.response.headers.get("set-cookie")?.split(";")[0] ?? "";
        result = await request(account, "/api/account", {
          method: "DELETE",
          body: { password: credentials },
        });
      }
    }
    if (![200, 401].includes(result.response.status)) {
      throw new Error(`Synthetic account cleanup failed: ${account.email} returned ${result.response.status}.`);
    }
  }
}
