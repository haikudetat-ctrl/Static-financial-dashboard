import crypto from "node:crypto";

/**
 * Read-only Google Drive client for a service account. The account sees
 * only folders shared with its email, so the team shares the documents
 * folder with it once and the app reads from there.
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_URL = "https://www.googleapis.com/drive/v3";
const SCOPE = "https://www.googleapis.com/auth/drive.readonly";

export const FOLDER_MIME = "application/vnd.google-apps.folder";
export const SHEET_MIME = "application/vnd.google-apps.spreadsheet";

export type ServiceAccount = { clientEmail: string; privateKey: string };

export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  webViewLink: string;
  /** Folder names from the root down, e.g. "P10 FY26 / 03 Inventory Counts". */
  path: string;
};

export class DriveError extends Error {
  constructor(
    message: string,
    readonly status = 500,
  ) {
    super(message);
  }
}

/**
 * GOOGLE_SERVICE_ACCOUNT_JSON holds the key file Google gives you, pasted
 * whole. Returns null when it isn't set.
 */
export function readServiceAccount(
  raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON,
): ServiceAccount | null {
  if (!raw?.trim()) return null;
  let parsed: { client_email?: string; private_key?: string };
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new DriveError(
      "GOOGLE_SERVICE_ACCOUNT_JSON isn't valid JSON. Paste the whole key file.",
    );
  }
  if (!parsed.client_email || !parsed.private_key) {
    throw new DriveError(
      "GOOGLE_SERVICE_ACCOUNT_JSON is missing client_email or private_key.",
    );
  }
  return {
    clientEmail: parsed.client_email,
    privateKey: parsed.private_key.replace(/\\n/g, "\n"),
  };
}

const base64url = (input: Buffer | string) =>
  Buffer.from(input).toString("base64url");

/** Signed JWT assertion for the OAuth token exchange. */
export function buildAssertion(account: ServiceAccount, now = Date.now()) {
  const issuedAt = Math.floor(now / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: account.clientEmail,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat: issuedAt,
      exp: issuedAt + 3600,
    }),
  );
  const signature = crypto
    .createSign("RSA-SHA256")
    .update(`${header}.${claims}`)
    .sign(account.privateKey);
  return `${header}.${claims}.${base64url(signature)}`;
}

async function describe(response: Response) {
  const body = await response.text().catch(() => "");
  try {
    const parsed = JSON.parse(body) as {
      error?: { message?: string } | string;
      error_description?: string;
    };
    if (typeof parsed.error === "object" && parsed.error?.message) {
      return parsed.error.message;
    }
    return parsed.error_description ?? String(parsed.error ?? "");
  } catch {
    return body.slice(0, 200);
  }
}

export async function getAccessToken(account: ServiceAccount) {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: buildAssertion(account),
    }),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new DriveError(
      `Google sign-in failed: ${await describe(response)}`,
      response.status,
    );
  }
  const json = (await response.json()) as { access_token?: string };
  if (!json.access_token) throw new DriveError("Google returned no token.");
  return json.access_token;
}

export function createDriveClient(token: string) {
  const request = async (path: string) => {
    const response = await fetch(`${DRIVE_URL}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!response.ok) {
      const detail = await describe(response);
      throw new DriveError(
        response.status === 404
          ? "Drive can't find that folder or file. Share it with the app's service account."
          : `Drive returned ${response.status}: ${detail}`,
        response.status,
      );
    }
    return response;
  };

  const shared = "supportsAllDrives=true&includeItemsFromAllDrives=true";

  return {
    async getFile(id: string) {
      const response = await request(
        `/files/${encodeURIComponent(id)}?supportsAllDrives=true&fields=id,name,mimeType,modifiedTime,webViewLink`,
      );
      return (await response.json()) as Omit<DriveFile, "path">;
    },

    async listChildren(folderId: string) {
      const files: Array<Omit<DriveFile, "path">> = [];
      let pageToken = "";
      do {
        const query = encodeURIComponent(
          `'${folderId.replace(/'/g, "\\'")}' in parents and trashed = false`,
        );
        const response = await request(
          `/files?q=${query}&${shared}&pageSize=1000&fields=nextPageToken,files(id,name,mimeType,modifiedTime,webViewLink)${
            pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""
          }`,
        );
        const json = (await response.json()) as {
          files?: Array<Omit<DriveFile, "path">>;
          nextPageToken?: string;
        };
        files.push(...(json.files ?? []));
        pageToken = json.nextPageToken ?? "";
      } while (pageToken);
      return files;
    },

    /** Every file under a folder, depth first, with its folder path. */
    async listTree(rootId: string, { maxFolders = 200 } = {}) {
      const result: DriveFile[] = [];
      const queue: Array<{ id: string; path: string }> = [
        { id: rootId, path: "" },
      ];
      let visited = 0;
      while (queue.length) {
        const folder = queue.shift()!;
        if (++visited > maxFolders) {
          throw new DriveError(`More than ${maxFolders} folders to scan.`);
        }
        for (const child of await this.listChildren(folder.id)) {
          if (child.mimeType === FOLDER_MIME) {
            queue.push({
              id: child.id,
              path: folder.path ? `${folder.path} / ${child.name}` : child.name,
            });
          } else {
            result.push({ ...child, path: folder.path });
          }
        }
      }
      return result;
    },

    /** A Google Sheet's first tab as CSV text. */
    async exportCsv(id: string) {
      const response = await request(
        `/files/${encodeURIComponent(id)}/export?mimeType=text%2Fcsv`,
      );
      return response.text();
    },

    /** An uploaded file's bytes (PDFs and photos). */
    async download(id: string) {
      const response = await request(
        `/files/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true`,
      );
      return Buffer.from(await response.arrayBuffer());
    },
  };
}

export type DriveClient = ReturnType<typeof createDriveClient>;

/** Pulls a folder ID out of a Drive link, or returns the ID as given. */
export function parseFolderId(input: string) {
  const value = input.trim();
  const fromUrl = value.match(/\/folders\/([A-Za-z0-9_-]{10,})/);
  if (fromUrl) return fromUrl[1];
  const fromQuery = value.match(/[?&]id=([A-Za-z0-9_-]{10,})/);
  if (fromQuery) return fromQuery[1];
  return /^[A-Za-z0-9_-]{10,}$/.test(value) ? value : null;
}
