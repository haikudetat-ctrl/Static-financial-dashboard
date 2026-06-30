export type UploadApiResult = {
  importId?: string;
  duplicate?: boolean;
  fileName?: string;
  error?: string;
};

export async function readUploadResponse(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return (await response.json()) as UploadApiResult;
  }

  const body = await response.text();
  return {
    error: response.ok
      ? body
      : `Upload failed with status ${response.status}${body ? `: ${body.slice(0, 160)}` : ""}`,
  };
}
