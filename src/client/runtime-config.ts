export type FlowcutRuntimeConfig = {
  clerkPublishableKey?: string;
  VITE_CLERK_PUBLISHABLE_KEY?: string;
  CLERK_PUBLISHABLE_KEY?: string;
};

type RuntimeConfigInput = {
  viteEnv?: Record<string, string | undefined>;
  runtimeConfig?: FlowcutRuntimeConfig;
};

declare global {
  interface Window {
    __FLOWCUT_RUNTIME_CONFIG__?: FlowcutRuntimeConfig;
    __PRYMEIRA_CONFIG__?: FlowcutRuntimeConfig;
  }
}

export function getClerkPublishableKey(input: RuntimeConfigInput = {}): string | undefined {
  const runtimeKey = (
    input.runtimeConfig?.clerkPublishableKey ??
    input.runtimeConfig?.VITE_CLERK_PUBLISHABLE_KEY ??
    input.runtimeConfig?.CLERK_PUBLISHABLE_KEY
  )?.trim();
  if (runtimeKey) return runtimeKey;

  const viteKey = input.viteEnv?.VITE_CLERK_PUBLISHABLE_KEY?.trim();
  return viteKey || undefined;
}

export function getBrowserClerkPublishableKey(): string | undefined {
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  return getClerkPublishableKey({
    viteEnv: env,
    runtimeConfig: {
      ...globalThis.window?.__FLOWCUT_RUNTIME_CONFIG__,
      ...globalThis.window?.__PRYMEIRA_CONFIG__
    }
  });
}
