import test from "node:test";
import assert from "node:assert/strict";
import { getRuntimeConfig } from "../scripts/runtime-config.mjs";

const local = {
  APP_ENV: "development",
  DEMO_DATA_ENABLED: "true",
  INVITE_ONLY: "false",
  SESSION_SECRET: "local-development-secret-with-at-least-32-characters",
  DATABASE_URL: "postgresql://afroie:local-postgres-password@db:5432/afroie",
};

const staging = {
  APP_ENV: "staging",
  NODE_ENV: "production",
  DEMO_DATA_ENABLED: "false",
  INVITE_ONLY: "true",
  SESSION_SECRET: Array.from({ length: 64 }, (_, index) => String.fromCharCode(33 + index)).join(""),
  DATABASE_URL: "postgresql://staging_user:non-local-secret@db:5432/afroie",
  APP_ORIGIN: "https://staging.example.ie",
};

test("accepts the documented local development configuration", () => {
  assert.equal(getRuntimeConfig(local).demoDataEnabled, true);
});

test("accepts a secure invite-only staging configuration", () => {
  const config = getRuntimeConfig(staging);
  assert.equal(config.appOrigin, "https://staging.example.ie");
  assert.equal(config.inviteOnly, true);
});

test("rejects unsafe staging settings", () => {
  for (const patch of [
    { DEMO_DATA_ENABLED: "true" },
    { INVITE_ONLY: "false" },
    { APP_ORIGIN: "http://staging.example.ie" },
    { APP_ORIGIN: "https://staging.example.ie/path" },
    { DATABASE_URL: local.DATABASE_URL },
    { SESSION_SECRET: "A".repeat(64) },
  ]) {
    assert.throws(() => getRuntimeConfig({ ...staging, ...patch }));
  }
});

test("rejects invalid database URLs and environment flags", () => {
  assert.throws(() => getRuntimeConfig({ ...local, DATABASE_URL: "mysql://u:p@db/name" }));
  assert.throws(() => getRuntimeConfig({ ...local, DEMO_DATA_ENABLED: "yes" }));
});
