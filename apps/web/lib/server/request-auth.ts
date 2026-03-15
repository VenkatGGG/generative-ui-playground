import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export const ACTOR_COOKIE_NAME = "genui_actor";
export const ACTOR_HEADER_NAME = "x-generative-ui-user";

type ActorSource = "header" | "cookie" | "bootstrap";

export interface RequestActor {
  userId: string;
  source: ActorSource;
}

export interface ResolvedRequestActor {
  actor: RequestActor;
  setCookieHeader?: string;
}

function invalidAuthResponse(code: "AUTH_INVALID" | "AUTH_REQUIRED", message: string): Response {
  return Response.json(
    {
      error: code,
      message
    },
    { status: code === "AUTH_REQUIRED" ? 401 : 400 }
  );
}

function threadAccessDeniedResponse(): Response {
  return Response.json(
    {
      error: "THREAD_ACCESS_DENIED",
      message: "Thread does not belong to the current actor."
    },
    { status: 403 }
  );
}

function parseCookieHeader(value: string | null): Record<string, string> {
  if (!value) {
    return {};
  }

  return value
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((cookies, entry) => {
      const separatorIndex = entry.indexOf("=");
      if (separatorIndex <= 0) {
        return cookies;
      }

      const key = entry.slice(0, separatorIndex).trim();
      const cookieValue = entry.slice(separatorIndex + 1).trim();
      cookies[key] = cookieValue;
      return cookies;
    }, {});
}

function getSigningSecret(): string {
  return process.env.GENUI_AUTH_SECRET ?? "generative-ui-playground-dev-secret";
}

function signUserId(userId: string): string {
  return createHmac("sha256", getSigningSecret()).update(userId).digest("hex");
}

function encodeActorCookie(userId: string): string {
  return `${userId}.${signUserId(userId)}`;
}

function decodeActorCookie(cookieValue: string): string | null {
  const separatorIndex = cookieValue.lastIndexOf(".");
  if (separatorIndex <= 0 || separatorIndex === cookieValue.length - 1) {
    return null;
  }

  const userId = cookieValue.slice(0, separatorIndex);
  const signature = cookieValue.slice(separatorIndex + 1);
  const expectedSignature = signUserId(userId);

  if (signature.length !== expectedSignature.length) {
    return null;
  }

  const provided = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);
  if (!timingSafeEqual(provided, expected)) {
    return null;
  }

  return userId;
}

function buildActorCookieHeader(userId: string): string {
  return `${ACTOR_COOKIE_NAME}=${encodeActorCookie(userId)}; Path=/; HttpOnly; SameSite=Lax`;
}

function normalizeUserId(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function resolveRequestActor(
  request: Request,
  options: { allowBootstrap: boolean }
): { ok: true; value: ResolvedRequestActor } | { ok: false; response: Response } {
  const headerUserId = normalizeUserId(request.headers.get(ACTOR_HEADER_NAME));
  if (headerUserId) {
    return {
      ok: true,
      value: {
        actor: {
          userId: headerUserId,
          source: "header"
        },
        setCookieHeader: buildActorCookieHeader(headerUserId)
      }
    };
  }

  const cookies = parseCookieHeader(request.headers.get("cookie"));
  const actorCookie = cookies[ACTOR_COOKIE_NAME];
  if (actorCookie) {
    const userId = decodeActorCookie(actorCookie);
    if (!userId) {
      return {
        ok: false,
        response: invalidAuthResponse("AUTH_INVALID", "Actor cookie is invalid.")
      };
    }

    return {
      ok: true,
      value: {
        actor: {
          userId,
          source: "cookie"
        }
      }
    };
  }

  if (!options.allowBootstrap) {
    return {
      ok: false,
      response: invalidAuthResponse("AUTH_REQUIRED", "Actor identity is required.")
    };
  }

  const userId = randomUUID();
  return {
    ok: true,
    value: {
      actor: {
        userId,
        source: "bootstrap"
      },
      setCookieHeader: buildActorCookieHeader(userId)
    }
  };
}

export function attachActorCookie(response: Response, auth: ResolvedRequestActor): Response {
  if (auth.setCookieHeader) {
    response.headers.append("Set-Cookie", auth.setCookieHeader);
  }

  return response;
}

export function ensureThreadOwnership(
  ownerUserId: string,
  actor: RequestActor
): { ok: true } | { ok: false; response: Response } {
  if (ownerUserId === actor.userId) {
    return { ok: true };
  }

  return {
    ok: false,
    response: threadAccessDeniedResponse()
  };
}
