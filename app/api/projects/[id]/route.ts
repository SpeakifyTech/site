import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getCollection } from "@/lib/db";
import { ProjectDocument } from "@/lib/types/models";

const projectsCollectionPromise = getCollection<ProjectDocument>("project");

const mapProject = (project: ProjectDocument) => ({
  id: project._id,
  name: project.name,
  description: project.description,
  vibe: project.vibe,
  strict: project.strict,
  timeframe: project.timeframe,
  userId: project.userId,
  createdAt: project.createdAt,
  updatedAt: project.updatedAt,
});

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Check authentication
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: projectId } = await params;

    const projectsCollection = await projectsCollectionPromise;
    const result = await projectsCollection.deleteOne({
      _id: projectId,
      userId: session.user.id,
    });

    if (result.deletedCount === 0) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting project:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Check authentication
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: projectId } = await params;
    const body = await request.json() as {
      name?: string;
      description?: string | null;
      vibe?: string | null;
      strict?: boolean;
      timeframe?: number | null;
    };

    // Validate input
    if (
      body.name === undefined &&
      body.description === undefined &&
      body.vibe === undefined &&
      body.strict === undefined &&
      body.timeframe === undefined
    ) {
      return NextResponse.json({ error: "At least one field must be provided" }, { status: 400 });
    }

    if (body.name && typeof body.name !== "string") {
      return NextResponse.json({ error: "Name must be a string" }, { status: 400 });
    }

    if (body.description !== undefined && body.description !== null && typeof body.description !== "string") {
      return NextResponse.json({ error: "Description must be a string" }, { status: 400 });
    }

    if (body.vibe !== undefined && body.vibe !== null && typeof body.vibe !== "string") {
      return NextResponse.json({ error: "Vibe must be a string" }, { status: 400 });
    }

    if (body.strict !== undefined && typeof body.strict !== "boolean") {
      return NextResponse.json({ error: "Strict must be a boolean" }, { status: 400 });
    }

    if (body.timeframe !== undefined && body.timeframe !== null) {
      if (typeof body.timeframe !== "number" || !Number.isFinite(body.timeframe)) {
        return NextResponse.json({ error: "Timeframe must be a finite number" }, { status: 400 });
      }
      if (!Number.isInteger(body.timeframe) || body.timeframe < 0) {
        return NextResponse.json({ error: "Timeframe must be a non-negative integer" }, { status: 400 });
      }
    }

    const trimmedVibe = body.vibe?.trim();

    const updateData: Record<string, unknown> = {};

    if (body.name !== undefined) {
      updateData.name = body.name;
    }

    if (body.description !== undefined) {
      updateData.description = body.description ?? null;
    }

    if (body.vibe !== undefined) {
      updateData.vibe = trimmedVibe ? trimmedVibe : null;
    }

    if (body.strict !== undefined) {
      updateData.strict = body.strict;
    }

    if (body.timeframe !== undefined) {
      updateData.timeframe = body.timeframe ?? 0;
    }

    updateData.updatedAt = new Date();

    const projectsCollection = await projectsCollectionPromise;
    const updateResult = await projectsCollection.findOneAndUpdate(
      { _id: projectId, userId: session.user.id },
      { $set: updateData },
      { returnDocument: "after" },
    );

    const updatedProject = updateResult?.value ?? null;

    if (!updatedProject) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, project: mapProject(updatedProject) });
  } catch (error) {
    console.error("Error updating project:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Check authentication
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: projectId } = await params;

    const projectsCollection = await projectsCollectionPromise;
    const project = await projectsCollection.findOne({
      _id: projectId,
      userId: session.user.id,
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    return NextResponse.json({ project: mapProject(project) });
  } catch (error) {
    console.error("Error fetching project:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
