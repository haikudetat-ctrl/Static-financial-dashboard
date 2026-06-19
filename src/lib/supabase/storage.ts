import { createClient } from "@/lib/supabase/server";

export async function getSignedDocumentUrl(
  filePath: string,
  expiresInSeconds = 3600,
): Promise<string | null> {
  if (!filePath) return null;
  const supabase = await createClient();
  const { data } = await supabase.storage
    .from("source-documents")
    .createSignedUrl(filePath, expiresInSeconds);
  return data?.signedUrl ?? null;
}
