const LOCAL_SESSION_SECRETS = new Set([
  "local-only-change-this-session-secret-before-any-deployment",
]);

export function getRuntimeConfig(env = process.env) {
  const appEnvironment = env.APP_ENV;
  if (!["development", "staging", "production"].includes(appEnvironment)) {
    throw new Error("APP_ENV must be development, staging, or production.");
  }

  const demoDataEnabled = env.DEMO_DATA_ENABLED === "true";
  if (env.DEMO_DATA_ENABLED && !["true", "false"].includes(env.DEMO_DATA_ENABLED)) {
    throw new Error("DEMO_DATA_ENABLED must be true or false.");
  }
  const inviteOnly = env.INVITE_ONLY === "true";
  if (env.INVITE_ONLY && !["true", "false"].includes(env.INVITE_ONLY)) {
    throw new Error("INVITE_ONLY must be true or false.");
  }

  const sessionSecret = env.SESSION_SECRET ?? "";
  const minimumSecretLength = appEnvironment === "development" ? 32 : 64;
  if (sessionSecret.length < minimumSecretLength) {
    throw new Error(`SESSION_SECRET must contain at least ${minimumSecretLength} characters in ${appEnvironment}.`);
  }
  if (appEnvironment !== "development" && new Set(sessionSecret).size < 24) {
    throw new Error("SESSION_SECRET must use at least 24 distinct characters outside local development.");
  }

  let appOrigin;
  if (appEnvironment !== "development") {
    if (env.NODE_ENV !== "production") {
      throw new Error("NODE_ENV must be production outside local development.");
    }
    if (demoDataEnabled) {
      throw new Error("Demo data must be disabled outside local development.");
    }
    if (!inviteOnly) {
      throw new Error("INVITE_ONLY=true is required outside local development.");
    }
    if (LOCAL_SESSION_SECRETS.has(sessionSecret)) {
      throw new Error("Replace the local SESSION_SECRET before staging or production.");
    }
    try {
      const parsed = new URL(env.APP_ORIGIN ?? "");
      if (parsed.protocol !== "https:" || parsed.origin !== env.APP_ORIGIN) {
        throw new Error();
      }
      appOrigin = parsed.origin;
    } catch {
      throw new Error("APP_ORIGIN must be the exact HTTPS origin used by the browser.");
    }
  }

  let databaseUrl;
  try {
    databaseUrl = new URL(env.DATABASE_URL ?? "");
    if (!["postgres:", "postgresql:"].includes(databaseUrl.protocol) ||
        !databaseUrl.username || !databaseUrl.password) {
      throw new Error();
    }
    if (appEnvironment !== "development" && decodeURIComponent(databaseUrl.password) === "local-postgres-password") {
      throw new Error();
    }
  } catch {
    throw new Error("DATABASE_URL must be a PostgreSQL URL with non-local credentials.");
  }

  return {
    appEnvironment,
    appOrigin,
    demoDataEnabled,
    inviteOnly,
    sessionSecret,
  };
}

export function assertRuntimeConfig(env = process.env) {
  getRuntimeConfig(env);
}
