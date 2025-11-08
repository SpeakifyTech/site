import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { PrismaClient } from "@/generated/prisma/client";

const prisma = new PrismaClient();

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

    // Verify the upload exists and belongs to the user and project
    const upload = await prisma.audioUpload.findFirst({
      where: {
        id: id,
        userId: session.user.id,
        projectId: projectId,
      },
    });

    if (!upload) {
      return NextResponse.json({ error: "Upload not found" }, { status: 404 });
    }

    await prisma.audioUpload.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting upload:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
