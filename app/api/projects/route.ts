import { randomUUID } from "crypto";
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

export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const projectsCollection = await projectsCollectionPromise;
    const projects = await projectsCollection
      .find({ userId: session.user.id })
      .sort({ createdAt: -1 })
      .toArray();

    return NextResponse.json({ projects: projects.map(mapProject) });
  } catch (error) {
    console.error("Error fetching projects:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse JSON body
    const body = await request.json() as {
      name: string;
      description?: string | null;
      vibe?: string | null;
      strict?: boolean;
      timeframe?: number | null;
    };
    const { name, description } = body;

    if (!name || typeof name !== "string") {
      return NextResponse.json({ error: "Name is required and must be a string" }, { status: 400 });
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
    const strict = body.strict ?? false;
    const timeframe = body.timeframe ?? 0;

    const now = new Date();
    const project: ProjectDocument = {
      _id: randomUUID(),
      name,
      description: description ? description : null,
      vibe: trimmedVibe ? trimmedVibe : null,
      strict,
      timeframe,
      userId: session.user.id,
      createdAt: now,
      updatedAt: now,
    };

    const projectsCollection = await projectsCollectionPromise;
    await projectsCollection.insertOne(project);

    return NextResponse.json({ success: true, project: mapProject(project) });
  } catch (error) {
    console.error("Project creation error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
