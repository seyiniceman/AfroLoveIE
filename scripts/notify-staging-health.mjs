import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

function isLoopback(hostname) {
  return hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]";
}

export async function checkStagingHealth({
  healthUrl,
  webhookUrl,
  fetchImpl = fetch,
  now = () => new Date(),
}) {
  if (!healthUrl) throw new Error("STAGING_HEALTH_URL is required.");
  const parsedHealthUrl = new URL(healthUrl);
  if (!["http:", "https:"].includes(parsedHealthUrl.protocol)) {
    throw new Error("STAGING_HEALTH_URL must use HTTP or HTTPS.");
  }

  let failureReason;
  try {
    const response = await fetchImpl(parsedHealthUrl, { signal: AbortSignal.timeout(5000) });
    const body = response.headers.get("content-type")?.includes("application/json")
      ? await response.json()
      : null;
    if (!response.ok || body?.status !== "ok") {
      failureReason = `Health endpoint returned HTTP ${response.status}.`;
    }
  } catch {
    failureReason = "Health endpoint could not be reached.";
  }

  if (!failureReason) {
    console.log("Staging health check passed.");
    return 0;
  }

  if (!webhookUrl) {
    console.error(`${failureReason} Alert not sent: STAGING_ALERT_WEBHOOK_URL is not configured.`);
    return 2;
  }
  const parsedWebhookUrl = new URL(webhookUrl);
  if (parsedWebhookUrl.protocol !== "https:" &&
      !(parsedWebhookUrl.protocol === "http:" && isLoopback(parsedWebhookUrl.hostname))) {
    throw new Error("STAGING_ALERT_WEBHOOK_URL must use HTTPS (HTTP is allowed only for a loopback test receiver).");
  }

  const alertResponse = await fetchImpl(parsedWebhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      text: `AfroIE Meet staging health check failed at ${now().toISOString()}. ${failureReason}`,
    }),
    signal: AbortSignal.timeout(5000),
  });
  if (!alertResponse.ok) {
    console.error(`Staging health failed; alert endpoint returned HTTP ${alertResponse.status}.`);
    return 3;
  }
  console.error("Staging health failed; alert was delivered to the configured webhook.");
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  checkStagingHealth({
    healthUrl: process.env.STAGING_HEALTH_URL,
    webhookUrl: process.env.STAGING_ALERT_WEBHOOK_URL,
  }).then((exitCode) => {
    process.exitCode = exitCode;
  }).catch((error) => {
    console.error("Staging health alert check failed:", error);
    process.exitCode = 3;
  });
}

