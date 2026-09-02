import { env } from "cloudflare:workers";

import { getCurrentUser } from "@/app/auth/current-user";

import {
  claimLegacyProgressPhotos,
  deleteProgressPhoto,
  getProgressPhoto,
  getProgressPhotoByDate,
  insertProgressPhoto,
  listProgressPhotos,
} from "@/db/progress-photos";

export const dynamic = "force-dynamic";

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function bucket() {
  if (!env.BUCKET) throw new Error("R2 binding BUCKET is unavailable");
  return env.BUCKET;
}

function publicPhoto(row: {
  id: string;
  captured_on: string;
  weight: number;
  content_type: string;
  size_bytes: number;
  created_at: string;
}) {
  return {
    id: row.id,
    capturedOn: row.captured_on,
    weight: row.weight,
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at,
    imageUrl: `/api/progress-photos?image=${encodeURIComponent(row.id)}`,
  };
}

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return json({ error: "UNAUTHENTICATED", message: "Log in om je foto's te bekijken." }, 401);
    await claimLegacyProgressPhotos(user.email);
    const url = new URL(request.url);
    const imageId = url.searchParams.get("image");
    if (imageId) {
      const row = await getProgressPhoto(imageId, user.email);
      if (!row) return json({ error: "NOT_FOUND" }, 404);
      const object = await bucket().get(row.object_key);
      if (!object) return json({ error: "IMAGE_NOT_FOUND" }, 404);
      return new Response(object.body, {
        headers: {
          "Content-Type": row.content_type,
          "Content-Length": String(row.size_bytes),
          "Cache-Control": "private, max-age=3600",
          ETag: object.httpEtag,
        },
      });
    }

    const rows = await listProgressPhotos(user.email);
    return json({ photos: rows.map(publicPhoto) });
  } catch (error) {
    return json(
      { error: "STORAGE_ERROR", message: error instanceof Error ? error.message : "Opslag niet beschikbaar" },
      500,
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return json({ error: "UNAUTHENTICATED", message: "Log in om een foto op te slaan." }, 401);
    await claimLegacyProgressPhotos(user.email);
    const form = await request.formData();
    const image = form.get("image");
    const capturedOn = String(form.get("capturedOn") ?? "");
    const weight = Number(String(form.get("weight") ?? "").replace(",", "."));

    if (!(image instanceof File) || !image.type.startsWith("image/")) {
      return json({ error: "INVALID_IMAGE", message: "Kies een geldige afbeelding." }, 400);
    }
    if (image.size === 0 || image.size > 10 * 1024 * 1024) {
      return json({ error: "IMAGE_SIZE", message: "De afbeelding mag maximaal 10 MB zijn." }, 400);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(capturedOn) || Number.isNaN(Date.parse(`${capturedOn}T12:00:00Z`))) {
      return json({ error: "INVALID_DATE", message: "Kies een geldige datum." }, 400);
    }
    if (!Number.isFinite(weight) || weight < 35 || weight > 250) {
      return json({ error: "INVALID_WEIGHT", message: "Vul een geldig gewicht in." }, 400);
    }
    if (await getProgressPhotoByDate(capturedOn, user.email)) {
      return json({ error: "DATE_EXISTS", message: "Voor deze datum bestaat al een check-in." }, 409);
    }

    const id = crypto.randomUUID();
    const extension = image.type === "image/png" ? "png" : image.type === "image/webp" ? "webp" : "jpg";
    const objectKey = `progress-photos/${capturedOn}/${id}.${extension}`;
    const createdAt = new Date().toISOString();

    await bucket().put(objectKey, image.stream(), {
      httpMetadata: { contentType: image.type },
      customMetadata: { capturedOn, weight: String(weight) },
    });

    const row = {
      id,
      captured_on: capturedOn,
      weight,
      object_key: objectKey,
      content_type: image.type,
      size_bytes: image.size,
      created_at: createdAt,
      owner_email: user.email,
    };

    try {
      await insertProgressPhoto(row);
    } catch (error) {
      await bucket().delete(objectKey);
      throw error;
    }

    return json({ photo: publicPhoto(row) }, 201);
  } catch (error) {
    return json(
      { error: "UPLOAD_ERROR", message: error instanceof Error ? error.message : "Upload mislukt" },
      500,
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return json({ error: "UNAUTHENTICATED", message: "Log in om een foto te verwijderen." }, 401);
    await claimLegacyProgressPhotos(user.email);
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return json({ error: "MISSING_ID" }, 400);
    const row = await getProgressPhoto(id, user.email);
    if (!row) return json({ error: "NOT_FOUND" }, 404);
    await bucket().delete(row.object_key);
    await deleteProgressPhoto(id, user.email);
    return json({ deleted: true });
  } catch (error) {
    return json(
      { error: "DELETE_ERROR", message: error instanceof Error ? error.message : "Verwijderen mislukt" },
      500,
    );
  }
}
