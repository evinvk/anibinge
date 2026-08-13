import { Container, getContainer } from "@cloudflare/containers";

export interface Env {
  ANIBINGE: DurableObjectNamespace<AnibingeContainer>;
  DATABASE_URL?: string;
  AUTH_SECRET?: string;
  AUTH_PEPPER?: string;
  ADMIN_EMAIL?: string;
  ADMIN_PASSWORD?: string;
  MONITOR_SECRET?: string;
  CF_PROXY_URL?: string;
  NEXT_PUBLIC_API_URL?: string;
  NEXT_PUBLIC_SITE_URL?: string;
}

export class AnibingeContainer extends Container {
  defaultPort = 3000;
  sleepAfter = "10m";
  pingEndpoint = "localhost/";

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const vars: Record<string, string> = {
      NODE_ENV: "production",
      HOSTNAME: "0.0.0.0",
      PORT: "3000",
      NEXT_TELEMETRY_DISABLED: "1",
    };
    for (const key of [
      "DATABASE_URL",
      "AUTH_SECRET",
      "AUTH_PEPPER",
      "ADMIN_EMAIL",
      "ADMIN_PASSWORD",
      "MONITOR_SECRET",
      "CF_PROXY_URL",
      "NEXT_PUBLIC_API_URL",
      "NEXT_PUBLIC_SITE_URL",
    ] as const) {
      const value = env[key];
      if (value) vars[key] = value;
    }
    this.envVars = vars;
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return getContainer(env.ANIBINGE).fetch(request);
  },
};
