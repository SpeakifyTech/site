import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getCollection } from "@/lib/db";
import { AudioAnalysisDocument, AudioUploadDocument } from "@/lib/types/models";

const uploadsCollectionPromise = getCollection<AudioUploadDocument>("audioUpload");
const analysisCollectionPromise = getCollection<AudioAnalysisDocument>("audioAnalysis");

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ project: string; id: string }> }
) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { project: projectId, id } = await params;
    if (!projectId || !id) {
      return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
    }

    const uploadsCollection = await uploadsCollectionPromise;
    const upload = await uploadsCollection.findOne({
      _id: id,
      userId: session.user.id,
      projectId,
    });

    if (!upload) {
      return NextResponse.json({ error: "Upload not found" }, { status: 404 });
    }

    // Decode base64 file data
    const fileBuffer = Buffer.from(upload.fileData, 'base64');

    // Determine content type based on file extension
    const fileExtension = upload.fileName.split('.').pop()?.toLowerCase();
    let contentType = 'application/octet-stream'; // default

    if (fileExtension === 'mp3') {
      contentType = 'audio/mpeg';
    } else if (fileExtension === 'wav') {
      contentType = 'audio/wav';
    } else if (fileExtension === 'm4a') {
      contentType = 'audio/mp4';
    } else if (fileExtension === 'ogg') {
      contentType = 'audio/ogg';
    }

    // Return the file with appropriate headers
    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Length': fileBuffer.length.toString(),
        'Content-Disposition': `inline; filename="${upload.fileName}"`,
        'Cache-Control': 'public, max-age=31536000', // Cache for 1 year
      },
    });
  } catch (error) {
    console.error("Error retrieving upload:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ project: string; id: string }> }
) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { project: projectId, id } = await params;
    if (!projectId || !id) {
      return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
    }

    const uploadsCollection = await uploadsCollectionPromise;
    const upload = await uploadsCollection.findOne({
      _id: id,
      userId: session.user.id,
      projectId,
    });

    if (!upload) {
      return NextResponse.json({ error: "Upload not found" }, { status: 404 });
    }

    await uploadsCollection.deleteOne({ _id: id });

    const analysisCollection = await analysisCollectionPromise;
    await analysisCollection.deleteOne({ uploadId: id });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting upload:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
