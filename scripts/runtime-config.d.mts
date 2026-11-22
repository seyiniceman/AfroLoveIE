export type AppEnvironment = "development" | "staging" | "production";

export type RuntimeConfig = {
  appEnvironment: AppEnvironment;
  appOrigin: string | undefined;
  demoDataEnabled: boolean;
  inviteOnly: boolean;
  sessionSecret: string;
};

export function getRuntimeConfig(env?: NodeJS.ProcessEnv): RuntimeConfig;
export function assertRuntimeConfig(env?: NodeJS.ProcessEnv): void;
