/** Internal workers accept only the server credential, never a user/anon JWT. */
export function requireServiceCredential(
  request: Request,
  expected: string | undefined,
): Response | null {
  const bearer = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");
  const apiKey = request.headers.get("apikey");
  if (!expected || (bearer !== expected && apiKey !== expected)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  return null;
}
