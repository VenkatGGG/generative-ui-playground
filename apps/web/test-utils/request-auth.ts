import { ACTOR_HEADER_NAME } from "@/lib/server/request-auth";

export const TEST_ACTOR_ID = "test-actor";
export const OTHER_TEST_ACTOR_ID = "other-test-actor";

export function buildActorRequest(
  input: string,
  init: RequestInit = {},
  actorId = TEST_ACTOR_ID
): Request {
  const headers = new Headers(init.headers);
  headers.set(ACTOR_HEADER_NAME, actorId);

  return new Request(input, {
    ...init,
    headers
  });
}
