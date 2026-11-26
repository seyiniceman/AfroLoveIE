import assert from "node:assert/strict";
import { test } from "node:test";
import { checkStagingHealth } from "../scripts/notify-staging-health.mjs";

test("healthy checks do not send a webhook alert", async () => {
  let webhookCalls = 0;
  const exitCode = await checkStagingHealth({
    healthUrl: "https://staging.example.test/api/health",
    webhookUrl: "https://alerts.example.test/hook",
    fetchImpl: async (url) => {
      if (url.hostname === "staging.example.test") {
        return new Response(JSON.stringify({ status: "ok" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      webhookCalls += 1;
      return new Response(null, { status: 204 });
    },
  });
  assert.equal(exitCode, 0);
  assert.equal(webhookCalls, 0);
});

test("failed checks deliver a provider-independent webhook alert", async () => {
  let alert;
  const exitCode = await checkStagingHealth({
    healthUrl: "http://127.0.0.1:3001/api/health",
    webhookUrl: "http://127.0.0.1:3999/alerts",
    now: () => new Date("2026-11-22T22:00:00.000Z"),
    fetchImpl: async (url, options) => {
      if (url.port === "3001") return new Response("unavailable", { status: 503 });
      alert = { url, options };
      return new Response(null, { status: 204 });
    },
  });
  assert.equal(exitCode, 1);
  assert.equal(alert.url.port, "3999");
  assert.deepEqual(JSON.parse(alert.options.body), {
    text: "AfroIE Meet staging health check failed at 2026-11-22T22:00:00.000Z. Health endpoint returned HTTP 503.",
  });
});

test("failed checks report when no webhook is configured", async () => {
  const exitCode = await checkStagingHealth({
    healthUrl: "https://staging.example.test/api/health",
    fetchImpl: async () => new Response(null, { status: 503 }),
  });
  assert.equal(exitCode, 2);
});
