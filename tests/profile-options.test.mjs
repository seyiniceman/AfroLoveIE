import assert from "node:assert/strict";
import test from "node:test";
import { canDiscover, visibleProfile } from "../lib/profile-options.ts";

const member = {
  published: true,
  discoveryPaused: false,
  city: "Dublin",
  relationshipIntent: "MARRIAGE",
  relationshipIntents: ["MARRIAGE"],
};

test("discovery requires published, unpaused profiles and overlapping intentions", () => {
  const compatible = { ...member, city: "dublin", relationshipIntents: ["FRIENDSHIP", "LONG_TERM"] };
  assert.equal(canDiscover(member, compatible), true);
  assert.equal(canDiscover(member, { ...compatible, relationshipIntents: ["FRIENDSHIP", "CASUAL"] }), false);
  assert.equal(canDiscover(member, { ...compatible, published: false }), false);
  assert.equal(canDiscover(member, { ...compatible, discoveryPaused: true }), false);
});

test("the public profile omits sex and hides gender and ethnicity unless shared", () => {
  const profile = {
    ...member,
    displayName: "Fictional member",
    sex: "Private test value",
    gender: "Member’s gender",
    ethnicity: "Member’s ethnicity",
    showGender: true,
    showEthnicity: false,
  };
  const publicProfile = visibleProfile(profile);
  assert.equal("sex" in publicProfile, false);
  assert.equal("discoveryPaused" in publicProfile, false);
  assert.equal(publicProfile.gender, profile.gender);
  assert.equal(publicProfile.ethnicity, null);
  assert.equal(visibleProfile({ ...profile, showEthnicity: true }).ethnicity, profile.ethnicity);
});


test("county discovery includes nearby towns and preserves existing same-city profiles", () => {
  const viewer = { ...member, county: "Dublin" };
  const nearby = { ...viewer, city: "Tallaght" };
  assert.equal(canDiscover(viewer, nearby), true);
  assert.equal(canDiscover(viewer, { ...nearby, county: "Kildare" }), false);
  assert.equal(canDiscover(viewer, { ...viewer, county: null }), true);
  assert.equal(canDiscover(viewer, { ...nearby, county: null }), false);
});

test("networking matches a shared networking intention", () => {
  const networking = { ...member, relationshipIntents: ["NETWORKING"] };
  assert.equal(canDiscover(networking, networking), true);
  assert.equal(canDiscover(networking, { ...member, relationshipIntents: ["CASUAL"] }), false);
});
