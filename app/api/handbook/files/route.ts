import { logApiFailure } from "@/lib/api-log";
import { randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";
import { handbookFileTypes, type HandbookFile } from "@/lib/handbook";
import {
  handbookStorage,
  handbookStorageConfigured,
} from "@/lib/handbook-server";
import {
  broadcastChange,
  json,
  sameOrigin,
  sharedDatabase,
  signedIn,
  selectedMember,
} from "@/lib/shared-server";

export const runtime = "nodejs";
const gateway = "shared_handbook";
const MAX_BYTES = 10 * 1024 * 1024;

function cleanName(name: string) {
  return (
    name
      .normalize("NFKC")
      .replace(/[^\p{L}\p{N}._ -]/gu, "_")
      .replace(/\s+/g, " ")
      .slice(-180) || "attachment"
  );
}

async function actor() {
  const member = await selectedMember();
  return member || null;
}

export async function GET(request: Request) {
  if (!(await signedIn()))
    return json({ error: "Please enter your household code." }, 401);
  if (!handbookStorageConfigured())
    return json({ error: "Handbook file storage is not configured." }, 503);
  try {
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return json({ error: "Choose a handbook file." }, 400);
    const result = await sharedDatabase("file", { id }, gateway);
    const file = result.file as HandbookFile;
    const { data, error } = await handbookStorage().createSignedUrl(
      file.storage_path,
      120,
      { download: file.file_name },
    );
    if (error || !data?.signedUrl) throw error || new Error("No signed URL");
    return Response.redirect(data.signedUrl, 302);
  } catch (err) {
    logApiFailure("/api/handbook/files", "get", err);
    return json({ error: "Could not open that handbook file." }, 404);
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Request not allowed." }, 403);
  if (!(await signedIn()))
    return json({ error: "Please enter your household code." }, 401);
  if (!handbookStorageConfigured())
    return json({ error: "Handbook file storage is not configured." }, 503);
  let path = "";
  try {
    const member = await actor();
    if (!member)
      return json({ error: "Choose who’s using this device first." }, 400);
    const form = await request.formData();
    const entryId = String(form.get("entry_id") || "");
    const uploaded = form.get("file");
    if (!entryId || !(uploaded instanceof File))
      return json({ error: "Choose a file to attach." }, 400);
    if (!uploaded.size || uploaded.size > MAX_BYTES)
      return json({ error: "Files must be between 1 byte and 10 MB." }, 400);
    if (!handbookFileTypes.has(uploaded.type))
      return json(
        { error: "Use a PDF, image, text file, or Word document." },
        400,
      );

    const home = await sharedDatabase("get");
    const householdId = String(home.household?.id || "");
    if (!householdId) throw new Error("Household missing");
    const name = cleanName(uploaded.name);
    path = `${householdId}/${entryId}/${randomUUID()}-${name}`;
    const { error: uploadError } = await handbookStorage().upload(
      path,
      Buffer.from(await uploaded.arrayBuffer()),
      { contentType: uploaded.type, cacheControl: "3600", upsert: false },
    );
    if (uploadError) throw uploadError;

    try {
      const result = await sharedDatabase(
        "attach",
        {
          actor: member,
          entry_id: entryId,
          storage_path: path,
          file_name: name,
          content_type: uploaded.type,
          size_bytes: uploaded.size,
        },
        gateway,
      );
      broadcastChange("home", null);
      return json(result, 201);
    } catch (err) {
      await handbookStorage().remove([path]);
      throw err;
    }
  } catch (err) {
    console.error("POST /api/handbook/files", {
      name: (err as Error).name,
      uploaded: Boolean(path),
    });
    return json({ error: "Could not attach that file." }, 400);
  }
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Request not allowed." }, 403);
  if (!(await signedIn()))
    return json({ error: "Please enter your household code." }, 401);
  if (!handbookStorageConfigured())
    return json({ error: "Handbook file storage is not configured." }, 503);
  try {
    const member = await actor();
    if (!member)
      return json({ error: "Choose who’s using this device first." }, 400);
    const raw = await request.text();
    if (raw.length > 1000) return json({ error: "Invalid request." }, 400);
    const { id } = JSON.parse(raw);
    if (typeof id !== "string")
      return json({ error: "Choose a handbook file." }, 400);
    const result = await sharedDatabase(
      "remove_file",
      { actor: member, id },
      gateway,
    );
    const file = result.file as HandbookFile;
    const { error } = await handbookStorage().remove([file.storage_path]);
    if (error)
      console.error("Handbook object removal failed", {
        code: error.statusCode,
      });
    broadcastChange("home", null);
    return json({ ok: true });
  } catch (err) {
    logApiFailure("/api/handbook/files", "delete", err);
    return json({ error: "Could not remove that file." }, 400);
  }
}
