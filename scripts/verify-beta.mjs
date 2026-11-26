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

async function getMailToken(email, action, expectedUsername) {
  const mailpit = new URL(process.env.TEST_MAILPIT_URL ?? "http://localhost:8025");
  const search = new URL("/api/v1/search", mailpit);
  search.searchParams.set("query", `to:${email}`);
  const subject = action === "verify" ? "Verify your AfroIE Meet email" : "Reset your AfroIE Meet password";
  for (let attempt = 0; attempt < 20; attempt++) {
    const response = await fetch(search);
    assert.ok(response.ok, "Mailpit search should succeed");
    const { messages = [] } = await response.json();
    const match = messages.find((message) => message.Subject === subject);
    if (match) {
      const detail = await fetch(new URL(`/api/v1/message/${encodeURIComponent(match.ID)}`, mailpit));
      assert.ok(detail.ok, "The captured email should be available");
      const { Text } = await detail.json();
      if (expectedUsername) assert.ok(Text.includes(expectedUsername), "Recovery email should include the sign-in username");
      const link = Text.match(/https?:\/\/[^\s]+\/account-email#[^\s]+/)?.[0];
      assert.ok(link, "Email should contain an account action link");
      const params = new URLSearchParams(new URL(link).hash.slice(1));
      assert.equal(params.get("action"), action);
      const token = params.get("token");
      assert.match(token, /^[A-Za-z0-9_-]{43}$/);
      return token;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Expected account email was not captured by Mailpit.");
}


async function signUp(label, city = "Dublin", publish = true) {
  const account = {
    cookie: "",
    email: `${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${synthetic}@example.test`,
    username: `${label.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 17)}_${synthetic.slice(0, 12)}`,
  };
  const result = await expectStatus(account, "/api/auth", 201, {
    method: "POST",
    body: {
      action: "signup",
      username: account.username,
      email: account.email,
      password: credentials,
      displayName: label,
      dateOfBirth: "1992-05-15",
      ageConfirmed: true,
    },
  });
  account.cookie = result.response.headers.get("set-cookie")?.split(";")[0] ?? "";
  assert.ok(account.cookie, "signup must set the session cookie");
  accounts.push(account);
  await expectStatus(account, "/api/profile", 401);
  const token = await getMailToken(account.email, "verify");
  await expectStatus(null, "/api/account-email", 403, {
    method: "POST", body: { action: "verify", token },
  });
  await expectStatus(account, "/api/account-email", 200, {
    method: "POST", body: { action: "verify", token },
  });
  await expectStatus(account, "/api/account-email", 400, {
    method: "POST", body: { action: "verify", token },
  });
  assert.equal((await expectStatus(account, "/api/profile", 200)).data.profile.published, false);
  assert.deepEqual((await expectStatus(account, "/api/discovery", 200)).data.profiles, []);
  if (!publish) return account;
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

async function acceptIntroduction(sender, recipient, targetId, promptKey = "traditionPrompt") {
  const sent = await expectStatus(sender, "/api/discovery", 201, {
    method: "POST",
    body: {
      toUserId: targetId,
      promptKey,
      message: "I would love to hear more about that."
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
  const daniel = await signUp("Synthetic Daniel", "Dublin", false);
  const outsider = await signUp("Synthetic Outsider", "Cork");
  const unmatchPartner = await signUp("Synthetic Unmatch");

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

  await expectStatus(null, "/api/auth", 409, {
    method: "POST",
    body: {
      action: "signup", username: daniel.username.toUpperCase(), email: `duplicate-${synthetic}@example.test`,
      password: credentials, displayName: "Duplicate fixture", dateOfBirth: "1992-05-15", ageConfirmed: true,
    },
  });
  const privateDraft = (await expectStatus(daniel, "/api/profile", 200)).data.profile;
  assert.equal(privateDraft.published, false);
  const draft = await expectStatus(daniel, "/api/profile", 200, {
    method: "PUT",
    body: {
      ...privateDraft,
      bio: "I’m usually out for live music or a walk along the canal.",
      sex: "Private fixture",
      gender: "Man",
      showGender: true,
      ethnicity: "Hidden fixture",
      showEthnicity: false,
      occupation: "Teacher",
      interests: ["Cooking", "Live music"],
      languages: ["English", "Yoruba"],
      traditionPrompt: "I like hosting friends and family for Sunday lunch.",
      saturdayPrompt: "A canal walk, a bookshop, and a live gig.",
      lookingFor: "Someone who enjoys exploring Dublin together.",
      relationshipIntent: "LONG_TERM",
      relationshipIntents: ["LONG_TERM", "FRIENDSHIP"],
      saveMode: "draft",
      onboardingStep: 4,
      photos: [],
    },
  });
  assert.equal(draft.data.profile.published, false);
  const resumed = (await expectStatus(daniel, "/api/profile", 200)).data.profile;
  assert.equal(resumed.onboardingStep, 4);
  assert.equal(resumed.occupation, "Teacher");
  assert.ok(!(await expectStatus(amara, "/api/discovery", 200)).data.profiles.some((profile) => profile.displayName === "Synthetic Daniel"));
  await expectStatus(daniel, "/api/profile", 200, {
    method: "PUT",
    body: { ...resumed, saveMode: "publish", photos: [] },
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
      photos: [{ url: png, altText: "Cover test image" }, { url: png, altText: "Second test image" }],
    },
  });
  const discovery = (await expectStatus(amara, "/api/discovery", 200)).data.profiles;
  const discoveredDaniel = discovery.find((profile) => profile.displayName === "Synthetic Daniel");
  assert.ok(discoveredDaniel, "same-city profile with overlapping intentions should be discoverable");
  assert.equal("sex" in discoveredDaniel, false);
  assert.equal("username" in discoveredDaniel, false);
  assert.equal(discoveredDaniel.ethnicity, null);
  assert.equal(discoveredDaniel.gender, "Man");
  assert.deepEqual(discoveredDaniel.relationshipIntents, ["LONG_TERM", "FRIENDSHIP"]);
  assert.ok(discoveredDaniel.saturdayPrompt);
  assert.deepEqual(discoveredDaniel.photos.map((photo) => photo.altText), ["Cover test image", "Second test image"]);
  const danielViewer = (await expectStatus(daniel, "/api/auth", 200)).data.user;
  assert.equal(danielViewer.mainPhoto.url, discoveredDaniel.photos[0].url);
  const photoUrl = discoveredDaniel.photos[0].url;
  assert.match(photoUrl, /^\/api\/media\//);
  assert.equal((await request(amara, photoUrl)).response.status, 200);
  assert.equal((await request(outsider, photoUrl)).response.status, 404);

  await expectStatus(daniel, "/api/profile", 200, { method: "PATCH", body: { discoveryPaused: true } });
  assert.ok(!(await expectStatus(amara, "/api/discovery", 200)).data.profiles.some((profile) => profile.userId === discoveredDaniel.userId));
  assert.equal((await request(amara, photoUrl)).response.status, 404);
  await expectStatus(daniel, "/api/profile", 200, { method: "PATCH", body: { discoveryPaused: false } });

  const firstMatch = await acceptIntroduction(amara, daniel, discoveredDaniel.userId, "saturdayPrompt");
  const matches = (await expectStatus(amara, "/api/matches", 200)).data.matches;
  assert.equal(matches.filter((match) => match.id === firstMatch.id).length, 1);
  assert.equal((await expectStatus(daniel, "/api/matches", 200)).data.matches.length, 1);

  const sentMessage = await expectStatus(amara, `/api/matches/${firstMatch.id}`, 201, {
    method: "POST",
    body: { body: "A synthetic hello from the local test." },
  });
  const amaraUserId = (await expectStatus(amara, "/api/auth", 200)).data.user.id;
  assert.equal(sentMessage.data.message.sender.id, amaraUserId);
  assert.equal((await expectStatus(daniel, "/api/notifications", 200)).data.unreadMessages, 1);
  assert.equal((await expectStatus(amara, "/api/notifications", 200)).data.unreadMessages, 0);
  const conversation = await expectStatus(daniel, `/api/matches/${firstMatch.id}`, 200);
  assert.equal(conversation.data.messages.length, 1);
  assert.equal(conversation.data.messages[0].unread, true);
  const readRequest = { method: "PATCH", body: { action: "mark-read", messageIds: [sentMessage.data.message.id] } };
  await expectStatus(outsider, `/api/matches/${firstMatch.id}`, 404, readRequest);
  await expectStatus(daniel, `/api/matches/${firstMatch.id}`, 200, readRequest);
  assert.equal((await expectStatus(daniel, "/api/notifications", 200)).data.unreadMessages, 0);
  await expectStatus(outsider, `/api/matches/${firstMatch.id}`, 404, {
    method: "POST",
    body: { body: "This account is not a participant." },
  });

  const report = await expectStatus(amara, "/api/safety", 201, {
    method: "POST",
    body: { action: "report", subjectId: discoveredDaniel.userId, reason: "OTHER", details: "Synthetic report." },
  });
  const photoRequest = {
    method: "POST",
    body: { action: "report", subjectId: discoveredDaniel.userId, reason: "OTHER", details: "Synthetic photo report.", evidenceKind: "PHOTO", evidenceRef: photoUrl.split("/").at(-1) },
  };
  await expectStatus(outsider, "/api/safety", 404, photoRequest);
  const photoReport = await expectStatus(amara, "/api/safety", 201, photoRequest);
  await expectStatus(amara, "/api/safety", 409, photoRequest);
  const messageRequest = {
    method: "POST",
    body: { action: "report", subjectId: amaraUserId, reason: "OTHER", details: "Synthetic message report.", evidenceKind: "MESSAGE", evidenceRef: sentMessage.data.message.id },
  };
  await expectStatus(outsider, "/api/safety", 404, messageRequest);
  const messageReport = await expectStatus(daniel, "/api/safety", 201, messageRequest);
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
  const photoEvidenceUrl = queue.data.reports.find((item) => item.id === photoReport.data.report.id)?.photoEvidenceUrl;
  assert.match(photoEvidenceUrl, /^\/api\/moderation\//);
  await expectStatus(outsider, photoEvidenceUrl, 403);
  const evidence = await expectStatus(moderator, photoEvidenceUrl, 200);
  assert.match(evidence.response.headers.get("content-type"), /^image\//);
  assert.equal(queue.data.reports.find((item) => item.id === messageReport.data.report.id)?.messageEvidence, "A synthetic hello from the local test.");
  const memberUpdate = await request(outsider, "/api/moderation", {
    method: "PATCH",
    body: { id: report.data.report.id, status: "REVIEWING" },
  });
  assert.equal(memberUpdate.response.status, 403);
  const reviewedReport = await expectStatus(moderator, "/api/moderation", 200, {
    method: "PATCH",
    body: { id: report.data.report.id, status: "REVIEWING" },
  });
  assert.equal(reviewedReport.data.report.status, "REVIEWING");
  const resolution = { id: report.data.report.id, status: "RESOLVED", outcome: "NO_VIOLATION" };
  await expectStatus(moderator, "/api/moderation", 400, { method: "PATCH", body: resolution });
  await expectStatus(moderator, "/api/moderation", 200, {
    method: "PATCH", body: { ...resolution, note: "Synthetic evidence reviewed." },
  });
  const resolved = await expectStatus(moderator, "/api/moderation?status=RESOLVED", 200);
  const resolvedItem = resolved.data.reports.find((item) => item.id === report.data.report.id);
  assert.equal(resolvedItem.outcome, "NO_VIOLATION");
  assert.ok(resolvedItem.reviews.some((entry) => entry.note === "Synthetic evidence reviewed."));

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

  await expectStatus(null, "/api/account-email", 200, {
    method: "POST", body: { action: "request-reset", email: daniel.email },
  });
  const resetToken = await getMailToken(daniel.email, "reset", daniel.username);
  const resetPassword = `LocalReset!${randomUUID()}Aa9`;
  await expectStatus(null, "/api/account-email", 200, {
    method: "POST", body: { action: "reset", token: resetToken, password: resetPassword },
  });
  daniel.password = resetPassword;
  await expectStatus(null, "/api/account-email", 400, {
    method: "POST", body: { action: "reset", token: resetToken, password: resetPassword },
  });
  await expectStatus(daniel, "/api/profile", 401);
  await expectStatus(null, "/api/auth", 401, {
    method: "POST", body: { action: "login", email: daniel.email, password: resetPassword },
  });
  const resetLogin = await expectStatus(null, "/api/auth", 200, {
    method: "POST", body: { action: "login", username: daniel.username.toUpperCase(), password: resetPassword },
  });
  daniel.cookie = resetLogin.response.headers.get("set-cookie")?.split(";")[0] ?? "";

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
      body: { password: account.password ?? credentials },
    });
    if (result.response.status === 401) {
      const login = await request(null, "/api/auth", {
        method: "POST",
        body: { action: "login", username: account.username, password: account.password ?? credentials },
      });
      if (login.response.status === 200) {
        account.cookie = login.response.headers.get("set-cookie")?.split(";")[0] ?? "";
        result = await request(account, "/api/account", {
          method: "DELETE",
          body: { password: account.password ?? credentials },
        });
      }
    }
    if (![200, 401].includes(result.response.status)) {
      throw new Error(`Synthetic account cleanup failed: ${account.email} returned ${result.response.status}.`);
    }
  }
}
