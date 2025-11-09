import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getCollection } from "@/lib/db";
import { AudioUploadDocument } from "@/lib/types/models";

const uploadsCollectionPromise = getCollection<AudioUploadDocument>("audioUpload");

const mapUpload = (upload: AudioUploadDocument) => ({
  id: upload._id,
  userId: upload.userId,
  projectId: upload.projectId,
  fileName: upload.fileName,
  fileData: upload.fileData,
  fileHash: upload.fileHash,
  createdAt: upload.createdAt,
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ project: string }> }
) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { project: projectId } = await params;
    if (!projectId) {
      return NextResponse.json({ error: "Project ID is required" }, { status: 400 });
    }

    const uploadsCollection = await uploadsCollectionPromise;
    const uploads = await uploadsCollection
      .find({ userId: session.user.id, projectId })
      .sort({ createdAt: -1 })
      .toArray();

    return NextResponse.json({ uploads: uploads.map(mapUpload) });
  } catch (error) {
    console.error("Error fetching uploads:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ project: string }> }
) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { project: projectId } = await params;

    // Parse form data
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    // Limit file size to avoid MongoDB document size limit (16MB). Use 15MB as safe threshold.
    const MAX_BYTES = 15 * 1024 * 1024; // 15MB
    if (file && typeof (file as any).size === "number" && (file as any).size > MAX_BYTES) {
      return NextResponse.json({ error: "File too large. Maximum allowed size is 15MB." }, { status: 413 });
    }

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!file.type.startsWith("audio/")) {
      return NextResponse.json({ error: "File must be an audio file" }, { status: 400 });
    }

    // Read bytes and compute hash using Web Crypto
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const fileHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

    const uploadsCollection = await uploadsCollectionPromise;
    const existingUpload = await uploadsCollection.findOne({
      userId: session.user.id,
      fileHash,
    });
    if (existingUpload) {
      return NextResponse.json({ error: "This file has already been uploaded" }, { status: 409 });
    }

    const base64Data = buffer.toString('base64');

    const upload: AudioUploadDocument = {
      _id: randomUUID(),
      userId: session.user.id,
      projectId: projectId || null,
      fileName: file.name,
      fileData: base64Data,
      fileHash,
      createdAt: new Date(),
    };

    await uploadsCollection.insertOne(upload);

    return NextResponse.json({ success: true, upload: mapUpload(upload) });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
