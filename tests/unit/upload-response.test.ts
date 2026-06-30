import { describe, expect, it } from "vitest";
import { readUploadResponse } from "@/components/imports/upload-response";

describe("readUploadResponse", () => {
  it("reads JSON upload responses", async () => {
    const response = new Response(
      JSON.stringify({ importId: "import-1", duplicate: false }),
      {
        headers: { "content-type": "application/json" },
      },
    );

    await expect(readUploadResponse(response)).resolves.toEqual({
      importId: "import-1",
      duplicate: false,
    });
  });

  it("returns a useful error when Vercel returns a non-JSON failure", async () => {
    const response = new Response("<html>Server error</html>", {
      status: 500,
      headers: { "content-type": "text/html" },
    });

    await expect(readUploadResponse(response)).resolves.toEqual({
      error: "Upload failed with status 500: <html>Server error</html>",
    });
  });
});
