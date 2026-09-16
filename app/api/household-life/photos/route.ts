import { randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";
import { maintenanceStorage } from "@/lib/maintenance-server";
import { maintenanceImageType } from "@/lib/household-life";
import { handbookStorageConfigured } from "@/lib/handbook-server";
import {
  broadcastChange,
  json,
  sameOrigin,
  selectedMember,
  sharedDatabase,
  signedIn,
} from "@/lib/shared-server";
import { logApiFailure } from "@/lib/api-log";
export const runtime = "nodejs";
const gateway = "shared_household_life";
export async function GET(request: Request) {
  if (!(await signedIn()))
    return json({ error: "Please enter your household code." }, 401);
  if (!handbookStorageConfigured())
    return json({ error: "Photo storage is not configured." }, 503);
  try {
    const id = new URL(request.url).searchParams.get("id");
    const { photo } = await sharedDatabase("photo", { id }, gateway);
    const { data, error } = await maintenanceStorage().createSignedUrl(
      photo.storage_path,
      120,
    );
    if (error || !data?.signedUrl) throw new Error("Photo unavailable");
    return new Response(null, {
      status: 302,
      headers: {
        Location: data.signedUrl,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    logApiFailure("/api/household-life/photos", "get", err);
    return json({ error: "Could not open this photo." }, 404);
  }
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Request not allowed." }, 403);
  if (!(await signedIn()))
    return json({ error: "Please enter your household code." }, 401);
  if (!handbookStorageConfigured())
    return json({ error: "Photo storage is not configured." }, 503);
  let path = "";
  try {
    const actor = await selectedMember();
    const home = await sharedDatabase("get");
    if (
      !home.members?.some(
        (m: { user_id: string; name: string }) =>
          m.user_id === actor && m.name !== "Housemates",
      )
    )
      return json({ error: "Choose a household member." }, 403);
    const form = await request.formData();
    const requestId = String(form.get("request_id") || "");
    const file = form.get("file");
    if (!(file instanceof File) || !file.size || file.size > 10 * 1024 * 1024)
      return json({ error: "Choose a photo up to 10 MB." }, 400);
    const snapshot = await sharedDatabase("get", {}, gateway);
    if (!snapshot.maintenance.some((r: { id: string }) => r.id === requestId))
      return json({ error: "Request not found." }, 404);
    const bytes = Buffer.from(await file.arrayBuffer());
    const contentType = maintenanceImageType(bytes);
    if (!contentType || file.type !== contentType)
      return json({ error: "Use a JPEG, PNG, or WebP photo." }, 400);
    const name =
      file.name
        .normalize("NFKC")
        .replace(/[^\p{L}\p{N}._ -]/gu, "_")
        .slice(-180) || "photo";
    path = `${home.household.id}/${requestId}/${randomUUID()}-${name}`;
    const { error } = await maintenanceStorage().upload(path, bytes, {
      contentType,
      upsert: false,
    });
    if (error) throw new Error("Upload failed");
    const result = await sharedDatabase(
      "photo_attach",
      {
        actor,
        request_id: requestId,
        storage_path: path,
        file_name: name,
        content_type: contentType,
        size_bytes: file.size,
      },
      gateway,
    );
    broadcastChange("home", null);
    return json(result, 201);
  } catch (err) {
    if (path)
      await maintenanceStorage()
        .remove([path])
        .catch(() => {});
    logApiFailure("/api/household-life/photos", "post", err);
    return json(
      { error: "Could not attach this photo. Please try again." },
      400,
    );
  }
}
export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Request not allowed." }, 403);
  if (!(await signedIn()))
    return json({ error: "Please enter your household code." }, 401);
  if (!handbookStorageConfigured())
    return json({ error: "Photo storage is not configured." }, 503);
  try {
    const raw = await request.text();
    if (raw.length > 1000) return json({ error: "Invalid request." }, 400);
    const { id } = JSON.parse(raw);
    const actor = await selectedMember();
    const result = await sharedDatabase("photo_delete", { id, actor }, gateway);
    const { error } = await maintenanceStorage().remove(result.paths);
    if (error)
      console.error("Maintenance photo cleanup failed", {
        code: error.statusCode,
      });
    broadcastChange("home", null);
    return json(result);
  } catch (err) {
    logApiFailure("/api/household-life/photos", "delete", err);
    return json({ error: "Could not remove this photo." }, 400);
  }
}
