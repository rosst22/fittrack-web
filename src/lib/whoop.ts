import { createClient, getUser } from "@/lib/supabase/server";

export const WHOOP_AUTH_URL = "https://api.prod.whoop.com/oauth/oauth2/auth";
export const WHOOP_TOKEN_URL = "https://api.prod.whoop.com/oauth/oauth2/token";
export const WHOOP_API_BASE = "https://api.prod.whoop.com/developer";
const WHOOP_REQUEST_TIMEOUT_MS = 10_000;

export const WHOOP_SCOPES = [
  "read:recovery",
  "read:sleep",
  "read:workout",
  "read:cycles",
  "read:profile",
  "offline",
].join(" ");

export function whoopRedirectUri(origin: string) {
  return `${origin}/api/whoop/callback`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  token_type: string;
}

interface OAuthFailure {
  message: string;
  code?: string;
}

interface WhoopConnectionTokens {
  access_token: string;
  refresh_token: string | null;
  expires_at: string;
}

function whoopCredentials() {
  const clientId = process.env.WHOOP_CLIENT_ID?.trim();
  const clientSecret = process.env.WHOOP_CLIENT_SECRET?.trim();

  if (!clientId) throw new Error("WHOOP_CLIENT_ID is not configured");
  if (!clientSecret) throw new Error("WHOOP_CLIENT_SECRET is not configured");

  return { clientId, clientSecret };
}

async function whoopFetch(
  input: string,
  init: RequestInit,
  action: string
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WHOOP_REQUEST_TIMEOUT_MS);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`${action} timed out after 10 seconds`);
    }
    throw new Error(`${action} could not reach WHOOP`, { cause: error });
  } finally {
    clearTimeout(timeout);
  }
}

async function tokenError(action: string, res: Response): Promise<OAuthFailure> {
  let detail = "";
  let code: string | undefined;
  try {
    const payload: unknown = await res.json();
    if (payload && typeof payload === "object") {
      const fields = payload as Record<string, unknown>;
      if (typeof fields.error === "string") code = fields.error;
      const message = fields.error_description ?? fields.error;
      if (typeof message === "string") detail = `: ${message}`;
    }
  } catch {
    // WHOOP did not return a JSON OAuth error body.
  }
  return { message: `${action} failed (${res.status})${detail}`, code };
}

export async function exchangeCodeForToken(
  code: string,
  redirectUri: string
): Promise<TokenResponse> {
  const { clientId, clientSecret } = whoopCredentials();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
  });
  const res = await whoopFetch(WHOOP_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  }, "Whoop token exchange");
  if (!res.ok) {
    const failure = await tokenError("Whoop token exchange", res);
    throw new Error(failure.message);
  }
  return res.json();
}

class WhoopRefreshRejected extends Error {
  constructor(message: string, readonly oauthCode?: string) {
    super(message);
  }
}

export class WhoopReconnectRequired extends Error {}

async function refreshToken(refresh: string): Promise<TokenResponse> {
  const { clientId, clientSecret } = whoopCredentials();
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refresh,
    client_id: clientId,
    client_secret: clientSecret,
    scope: "offline",
  });
  const res = await whoopFetch(WHOOP_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  }, "Whoop token refresh");
  if (res.status === 400 || res.status === 401) {
    const failure = await tokenError("Whoop token refresh", res);
    throw new WhoopRefreshRejected(failure.message, failure.code);
  }
  if (!res.ok) {
    const failure = await tokenError("Whoop token refresh", res);
    throw new Error(failure.message);
  }
  return res.json();
}

function tokenIsFresh(conn: WhoopConnectionTokens) {
  return new Date(conn.expires_at).getTime() >= Date.now() + 60_000;
}

async function latestTokens(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
) {
  const { data, error } = await supabase
    .from("whoop_connections")
    .select("access_token, refresh_token, expires_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data as WhoopConnectionTokens | null;
}

async function concurrentlyRefreshedToken(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  previousRefreshToken: string
) {
  // WHOOP rotates refresh tokens. If two explicit syncs overlap, one wins and
  // the other is rejected. Give the winner a brief chance to save its tokens,
  // then reuse that result instead of incorrectly forcing a reconnect.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 150));
    const latest = await latestTokens(supabase, userId);
    if (
      latest &&
      latest.refresh_token !== previousRefreshToken &&
      tokenIsFresh(latest)
    ) {
      return latest.access_token;
    }
  }
  return null;
}

// Returns a valid access token for the current user, refreshing if expired.
// Returns null if the user has not connected Whoop.
export async function getValidWhoopToken(
  existingClient?: Awaited<ReturnType<typeof createClient>>,
  existingUserId?: string
): Promise<string | null> {
  const supabase = existingClient ?? (await createClient());
  const userId = existingUserId ?? (await getUser())?.id;
  if (!userId) return null;

  const conn = await latestTokens(supabase, userId);
  if (!conn) return null;

  if (tokenIsFresh(conn)) return conn.access_token;

  if (!conn.refresh_token) {
    throw new WhoopReconnectRequired("Your WHOOP connection expired. Reconnect WHOOP.");
  }

  let refreshed: TokenResponse;
  try {
    refreshed = await refreshToken(conn.refresh_token);
  } catch (error) {
    if (error instanceof WhoopRefreshRejected) {
      const winner = await concurrentlyRefreshedToken(supabase, userId, conn.refresh_token);
      if (winner) return winner;

      throw new WhoopReconnectRequired(
        error.oauthCode === "invalid_client"
          ? "WHOOP rejected the app credentials. Reconnect WHOOP; if that fails, verify the Vercel Client ID and secret."
          : "Your WHOOP authorization expired or was replaced. Reconnect WHOOP."
      );
    }
    throw error;
  }

  const expiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
  const { data: saved, error: saveError } = await supabase
    .from("whoop_connections")
    .update({
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token ?? conn.refresh_token,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("refresh_token", conn.refresh_token)
    .select("access_token")
    .maybeSingle();

  if (saveError) throw saveError;
  if (saved) return saved.access_token;

  const winner = await concurrentlyRefreshedToken(supabase, userId, conn.refresh_token);
  if (winner) return winner;

  throw new WhoopReconnectRequired(
    "WHOOP refreshed, but FitTrack could not safely save the rotated token. Reconnect WHOOP."
  );
}

export async function whoopGet<T>(path: string, token: string): Promise<T> {
  const res = await whoopFetch(`${WHOOP_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  }, `Whoop API ${path}`);
  if (res.status === 401) {
    throw new WhoopReconnectRequired("WHOOP revoked this connection. Reconnect WHOOP.");
  }
  if (!res.ok) throw new Error(`Whoop API ${path} failed: ${res.status}`);
  return res.json();
}

export interface WhoopCollection<T> {
  records: T[];
  next_token?: string;
}

export interface WhoopWorkoutRecord {
  id: string;
  start: string;
  end: string;
  sport_name: string;
  score_state: string;
  score?: {
    strain?: number;
    average_heart_rate?: number;
    max_heart_rate?: number;
    kilojoule?: number;
    distance_meter?: number;
  };
}

export interface WhoopSleepRecord {
  id: string;
  start: string;
  end: string;
  nap: boolean;
  score_state: string;
  score?: {
    sleep_performance_percentage?: number;
    sleep_efficiency_percentage?: number;
    sleep_consistency_percentage?: number;
    respiratory_rate?: number;
    stage_summary?: {
      total_in_bed_time_milli?: number;
      total_awake_time_milli?: number;
      total_light_sleep_time_milli?: number;
      total_slow_wave_sleep_time_milli?: number;
      total_rem_sleep_time_milli?: number;
    };
  };
}

export async function listWhoopWorkouts(token: string, limit = 25) {
  return whoopGet<WhoopCollection<WhoopWorkoutRecord>>(
    `/v2/activity/workout?limit=${limit}`,
    token
  );
}

export async function listWhoopSleep(token: string, limit = 14) {
  return whoopGet<WhoopCollection<WhoopSleepRecord>>(
    `/v2/activity/sleep?limit=${limit}`,
    token
  );
}
