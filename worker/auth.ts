import { createRemoteJWKSet, jwtVerify } from "jose";

export interface User {
  email: string;
  /** Stable, non-reversible id used as `user_id` and as the chat agent name prefix. */
  id: string;
}

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Identifies the caller from the Cloudflare Access JWT. Returns null when the
 * token is missing or invalid. `DEV_USER` (set in .dev.vars) bypasses Access
 * for local development only.
 */
export async function getUser(request: Request, env: Env): Promise<User | null> {
  let email: string | undefined;
  const devUser = (env as unknown as { DEV_USER?: string }).DEV_USER;
  if (devUser) {
    email = devUser;
  } else {
    const token = request.headers.get("cf-access-jwt-assertion");
    if (!token) return null;
    jwks ??= createRemoteJWKSet(new URL(`https://${env.ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`));
    try {
      const { payload } = await jwtVerify(token, jwks, {
        issuer: `https://${env.ACCESS_TEAM_DOMAIN}`,
        audience: env.ACCESS_AUD,
      });
      email = typeof payload.email === "string" ? payload.email : undefined;
    } catch {
      return null;
    }
  }
  if (!email) return null;
  return { email, id: (await sha256Hex(email.toLowerCase())).slice(0, 24) };
}
