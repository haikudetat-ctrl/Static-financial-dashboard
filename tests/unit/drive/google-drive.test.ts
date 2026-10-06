import crypto from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  buildAssertion,
  parseFolderId,
  readServiceAccount,
} from "@/lib/google/drive";

describe("parseFolderId", () => {
  it("takes a folder link or a bare ID", () => {
    expect(
      parseFolderId(
        "https://drive.google.com/drive/folders/1qH37NiHlRsSC_cwFL4-t1QEL5LfdkQdM?usp=sharing",
      ),
    ).toBe("1qH37NiHlRsSC_cwFL4-t1QEL5LfdkQdM");
    expect(parseFolderId(" 1qH37NiHlRsSC_cwFL4-t1QEL5LfdkQdM ")).toBe(
      "1qH37NiHlRsSC_cwFL4-t1QEL5LfdkQdM",
    );
    expect(parseFolderId("not a folder")).toBeNull();
  });
});

describe("service account", () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

  it("reads the pasted key file, including escaped newlines", () => {
    const account = readServiceAccount(
      JSON.stringify({
        client_email: "app@x.iam.gserviceaccount.com",
        private_key: pem.replace(/\n/g, "\\n"),
      }),
    );
    expect(account?.clientEmail).toBe("app@x.iam.gserviceaccount.com");
    expect(account?.privateKey).toContain("\n");
    expect(readServiceAccount("")).toBeNull();
    expect(() => readServiceAccount("{")).toThrow(/valid JSON/);
  });

  it("signs a read-only Drive assertion Google can verify", () => {
    const jwt = buildAssertion(
      { clientEmail: "app@x.iam.gserviceaccount.com", privateKey: pem },
      Date.UTC(2026, 9, 6),
    );
    const [header, claims, signature] = jwt.split(".");
    const valid = crypto
      .createVerify("RSA-SHA256")
      .update(`${header}.${claims}`)
      .verify(publicKey, Buffer.from(signature, "base64url"));
    expect(valid).toBe(true);
    const payload = JSON.parse(Buffer.from(claims, "base64url").toString());
    expect(payload).toMatchObject({
      iss: "app@x.iam.gserviceaccount.com",
      scope: "https://www.googleapis.com/auth/drive.readonly",
      aud: "https://oauth2.googleapis.com/token",
    });
    expect(payload.exp - payload.iat).toBe(3600);
  });
});
