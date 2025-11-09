import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { PrismaClient, Prisma } from "@/generated/prisma/client";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

const prisma = new PrismaClient();
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// Define Project type for server-side calculations
interface AnalysisProject {
  id: string;
  name: string;
  timeframe: number;
}

interface PerformanceFactorScores extends Prisma.JsonObject {
  time: number;
  coherence: number;
  filler: number;
  pauses: number;
}

interface PerformanceDetails extends Prisma.JsonObject {
  timeGoalSeconds: number | null;
  timeDeltaSeconds: number | null;
  fillerPercentage: number;
  longPauseCount: number;
  wordsPerMinute: number;
  averageGapDuration: number;
}

interface PerformanceMetrics extends Prisma.JsonObject {
  overallGrade: number;
  factorScores: PerformanceFactorScores;
  details: PerformanceDetails;
}

// Define the structured output schema using Zod
const FillerWordSchema = z.object({
  word: z.string().describe("The filler word detected (e.g., 'um', 'uh', 'like')"),
  timestamp: z.string().describe("Timestamp in format MM:SS when the filler word occurs"),
});

const GapAnalysisSchema = z.object({
  timestamp: z.string().describe("Timestamp in format MM:SS where the gap occurs"),
  duration: z.number().describe("Duration of the gap/pause in seconds"),
  type: z.enum(["short", "medium", "long", "excessive"]).describe("Classification of the gap duration"),
});

const SpeechSegmentSchema = z.object({
  type: z.enum(["introduction", "body", "conclusion", "transition"]).describe("Type of speech segment"),
  startTime: z.string().describe("Start timestamp in format MM:SS"),
  endTime: z.string().describe("End timestamp in format MM:SS"),
  content: z.string().describe("Summary of what is discussed in this segment"),
  coherenceScore: z.number().min(0).max(10).describe("Coherence score from 0-10"),
});

const CoherenceIssueSchema = z.object({
  startTime: z.string().describe("Start timestamp in format MM:SS for the coherence issue segment"),
  endTime: z.string().describe("End timestamp in format MM:SS for the coherence issue segment"),
  issue: z.string().describe("Description of the coherence issue (e.g., 'Rambling', 'Run-on sentence')"),
  suggestion: z.string().describe("Suggestion for improvement"),
  severity: z.enum(["low", "medium", "high"]).describe("Severity of the issue"),
});

const AudioAnalysisSchema = z.object({
  transcript: z.string().describe("Complete transcript of the audio"),
  timestampedTranscript: z.array(z.object({
    startTime: z.string().describe("Start timestamp in MM:SS for this utterance"),
    endTime: z.string().describe("End timestamp in MM:SS for this utterance"),
    text: z.string().describe("The transcribed text for this timestamp range (must be exactly one full sentence)"),
  }).refine((obj) => {
    const text = (obj.text || "").trim();
    if (!text) return false;
    // Heuristic: require exactly one sentence-terminating punctuation (., !, or ?) followed by space or end
    const matches = text.match(/[.!?](\s|$)/g);
    return !!matches && matches.length === 1;
  }, {
    message: "Each timestampedTranscript entry must contain exactly one complete sentence ending with '.', '!' or '?'.",
  })).optional().describe("Optional array of transcript segments with timestamps (MM:SS); each item must be exactly one sentence") ,
  durationSeconds: z.number().describe("Total duration of the audio in seconds"),
  wordCount: z.number().describe("Total number of words in the transcript"),
  wpm: z.number().describe("Words per minute (calculated as wordCount / (durationSeconds / 60))"),
  fillerWords: z.array(FillerWordSchema).describe("Array of detected filler words with timestamps"),
  totalFillerWords: z.number().describe("Total count of all filler words"),
  gaps: z.array(GapAnalysisSchema).describe("Array of detected pauses/gaps with analysis"),
  averageGapDuration: z.number().describe("Average duration of gaps in seconds"),
  speechSegments: z.array(SpeechSegmentSchema).describe("Breakdown of speech into segments"),
  coherenceIssues: z.array(CoherenceIssueSchema).describe("Identified coherence issues like rambling or run-on sentences"),
  overallCoherenceScore: z.number().min(0).max(10).describe("Overall speech coherence score from 0-10"),
  suggestions: z.array(z.string()).describe("General suggestions for improving the speech"),
});

const getProjectTimeframeSeconds = (
  project: AnalysisProject | null
): number | null => {
  if (!project?.timeframe || project.timeframe <= 0) return null;
  return project.timeframe / 1000; // stored in ms
};

const calculateFactorScores = (
  analysis: any,
  project: AnalysisProject | null
): PerformanceFactorScores => {
  const timeframeSeconds = getProjectTimeframeSeconds(project);
  let timeScore = 100;
  if (typeof timeframeSeconds === "number" && timeframeSeconds > 0) {
    const timeDiff = Math.abs((analysis.durationSeconds || 0) - timeframeSeconds);
    const maxDiff = Math.max(timeframeSeconds * 0.2, 1);
    timeScore = Math.max(0, 100 - (timeDiff / maxDiff) * 100);
  }

  const coherenceScore = ((analysis.overallCoherenceScore ?? 0) / 10) * 100;
  const fillerPercentage =
    analysis.wordCount > 0
      ? (analysis.totalFillerWords / analysis.wordCount) * 100
      : 0;
  const fillerScore = Math.max(0, 100 - fillerPercentage * 5);
  const longPauseCount = Array.isArray(analysis.gaps)
    ? analysis.gaps.filter(
        (g: any) => g.type === "long" || g.type === "excessive"
      ).length
    : 0;
  const pauseScore = Math.max(0, 100 - longPauseCount * 10);

  return {
    time: Math.round(timeScore),
    coherence: Math.round(Math.max(0, Math.min(100, coherenceScore))),
    filler: Math.round(Math.max(0, Math.min(100, fillerScore))),
    pauses: Math.round(Math.max(0, Math.min(100, pauseScore))),
  };
};

const calculateOverallGrade = (
  analysis: any,
  project: AnalysisProject | null
): number => {
  const scores = calculateFactorScores(analysis, project);
  const total =
    scores.time + scores.coherence + scores.filler + scores.pauses;
  return Math.round(total / 4);
};

const buildPerformanceMetrics = (
  analysis: any,
  project: AnalysisProject | null
): PerformanceMetrics => {
  const fillerPercentage =
    analysis.wordCount > 0
      ? (analysis.totalFillerWords / analysis.wordCount) * 100
      : 0;
  const longPauseCount = Array.isArray(analysis.gaps)
    ? analysis.gaps.filter(
        (g: any) => g.type === "long" || g.type === "excessive"
      ).length
    : 0;
  const timeGoalSeconds = getProjectTimeframeSeconds(project);
  const timeDeltaSeconds =
    typeof timeGoalSeconds === "number"
      ? (analysis.durationSeconds || 0) - timeGoalSeconds
      : null;

  return {
    overallGrade: calculateOverallGrade(analysis, project),
    factorScores: calculateFactorScores(analysis, project),
    details: {
      timeGoalSeconds,
      timeDeltaSeconds,
      fillerPercentage,
      longPauseCount,
      wordsPerMinute: analysis.wpm ?? 0,
      averageGapDuration: analysis.averageGapDuration ?? 0,
    },
  };
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ project: string; id: string }> }
) {
  try {
    console.log("Analysis API called with params:", await params);

    const session = await auth.api.getSession({ headers: request.headers });
    console.log("Session check:", { hasSession: !!session, userId: session?.user?.id });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { project: projectId, id } = await params;
    const { searchParams } = new URL(request.url);
    const isRetry = searchParams.get('retry') === 'true';
    
    console.log("Parameters:", { projectId, id, isRetry });

    if (!projectId || !id) {
      return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
    }

    // Fetch project to drive performance calculations and validate ownership
    console.log("Checking project in database...");
    const project = (await prisma.project.findFirst({
      where: {
        id: projectId,
        userId: session.user.id,
      },
    })) as AnalysisProject | null;

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Verify the upload exists and belongs to the user and project
    console.log("Checking upload in database...");
    const upload = await prisma.audioUpload.findFirst({
      where: {
        id: id,
        userId: session.user.id,
        projectId: projectId,
      },
      include: {
        analysis: true,
      },
    });
    console.log("Upload found:", {
      exists: !!upload,
      fileName: upload?.fileName,
      hasAnalysis: !!upload?.analysis,
      projectName: project.name,
    });

    if (!upload) {
      return NextResponse.json({ error: "Upload not found" }, { status: 404 });
    }

    // Check if analysis already exists and this is not a retry
    if (upload.analysis && !isRetry) {
      console.log("Returning cached analysis");
      const cachedAnalysis = {
        transcript: upload.analysis.transcript,
        durationSeconds: upload.analysis.durationSeconds,
        wordCount: upload.analysis.wordCount,
        wpm: upload.analysis.wpm,
        fillerWords: upload.analysis.fillerWords,
        totalFillerWords: upload.analysis.totalFillerWords,
        gaps: upload.analysis.gaps,
        averageGapDuration: upload.analysis.averageGapDuration,
        speechSegments: upload.analysis.speechSegments,
        coherenceIssues: upload.analysis.sentenceIssues,
        timestampedTranscript: upload.analysis.timestampedTranscript,
        overallCoherenceScore: upload.analysis.overallCoherenceScore,
        suggestions: upload.analysis.suggestions,
      };

      let performance =
        (upload.analysis.performance as PerformanceMetrics | null) ?? null;
      if (!performance) {
        performance = buildPerformanceMetrics(cachedAnalysis, project);
        await prisma.audioAnalysis.update({
          where: { uploadId: upload.id },
          data: { performance },
        });
      }

      return NextResponse.json({
        success: true,
        uploadId: upload.id,
        fileName: upload.fileName,
        analysis: {
          ...cachedAnalysis,
          performance,
        },
        cached: true,
      });
    }

    // Determine MIME type from filename
    const mimeType = getMimeTypeFromFilename(upload.fileName);
    console.log("MIME type:", mimeType, "File size:", upload.fileData.length, "characters");

    const prompt = `
You are an expert speech analyst. Analyze this audio file comprehensively and provide detailed metrics.

Please analyze the following aspects:

1. **Transcription**: Provide a complete, accurate transcript of the speech. Use proper punctuation and paragraph breaks to reflect natural speech patterns. Ensure the transcript is easy to read and understand, and includes all spoken words (including filler words).
  Additionally, produce a structured timestamped transcript as an array named 'timestampedTranscript'. IMPORTANT: each array entry MUST represent exactly one complete grammatical sentence (not multiple sentences, not fragments). Each entry should include 'startTime' and 'endTime' in MM:SS format and the 'text' for that single sentence. Make sure the sentence ends with proper sentence-ending punctuation (one of: '.', '!' or '?') and that the start/end times precisely cover that sentence.

2. **Duration & Word Count**: Calculate the total duration in seconds and count all words.

3. **Words Per Minute (WPM)**: Calculate speaking rate as: (total words / duration in minutes).

4. **Filler Words**: Identify ALL filler words like "um", "uh", "like", "you know", "so", "actually", "basically", "literally", etc. For each individual occurrence of a filler word, provide the word and its timestamp (MM:SS format). Create a new entry for every single filler word spoken.

5. **Gap Analysis**: Identify pauses/gaps in speech. Ignore natural pauses under 2 seconds.
   - Medium gaps: 2-4 seconds (hesitation)
   - Long gaps: 4-7 seconds (concerning pauses)
   - Excessive gaps: 7+ seconds (major disruption)
   Provide timestamp and duration for each detected gap.

6. **Speech Segmentation**: Break down the speech into logical segments (introduction, body, conclusion, transitions). Provide start/end timestamps and a brief content summary for each segment. Rate each segment's coherence (0-10).

7. **Clarity & Coherence Issues**: Identify problems like:
   - Stuttering or stammering
   - Mumbled or unclear speech
   - Run-on sentences
   - Incomplete sentences
   - Overly complex sentences
   - Awkward phrasing
   Provide timestamp, issue description, suggestion, and severity.

8. **Overall Coherence**: Rate the overall speech coherence and flow (0-10).

9. **Suggestions**: Provide 3-5 actionable suggestions to improve the speech delivery.

Analyze the audio thoroughly and provide all requested metrics with timestamps in MM:SS format.
`;

    console.log("Calling Gemini API...");
    const contents = [
      { text: prompt },
      {
        inlineData: {
          mimeType: mimeType,
          data: upload.fileData,
        },
      },
    ];

    // Define JSON Schema manually for Gemini
    const jsonSchema = {
      type: "object",
      properties: {
        transcript: { type: "string", description: "Complete transcript of the audio" },
        timestampedTranscript: {
          type: "array",
          items: {
            type: "object",
            properties: {
              startTime: { type: "string", description: "Start timestamp in MM:SS" },
              endTime: { type: "string", description: "End timestamp in MM:SS" },
              text: { type: "string", description: "Transcribed text for this segment" },
            },
            required: ["startTime", "endTime", "text"],
          },
        },
        durationSeconds: { type: "number", description: "Total duration of the audio in seconds" },
        wordCount: { type: "number", description: "Total number of words in the transcript" },
        wpm: { type: "number", description: "Words per minute" },
        fillerWords: {
          type: "array",
          items: {
            type: "object",
            properties: {
              word: { type: "string", description: "The filler word detected" },
              timestamp: { type: "string", description: "Timestamp in format MM:SS" },
            },
            required: ["word", "timestamp"],
          },
        },
        totalFillerWords: { type: "number", description: "Total count of all filler words" },
        gaps: {
          type: "array",
          items: {
            type: "object",
            properties: {
              timestamp: { type: "string", description: "Timestamp in format MM:SS" },
              duration: { type: "number", description: "Duration of the gap in seconds" },
              type: { type: "string", enum: ["short", "medium", "long", "excessive"] },
            },
            required: ["timestamp", "duration", "type"],
          },
        },
        averageGapDuration: { type: "number", description: "Average duration of gaps in seconds" },
        speechSegments: {
          type: "array",
          items: {
            type: "object",
            properties: {
              type: { type: "string", enum: ["introduction", "body", "conclusion", "transition"] },
              startTime: { type: "string", description: "Start timestamp in format MM:SS" },
              endTime: { type: "string", description: "End timestamp in format MM:SS" },
              content: { type: "string", description: "Summary of segment content" },
              coherenceScore: { type: "number", minimum: 0, maximum: 10 },
            },
            required: ["type", "startTime", "endTime", "content", "coherenceScore"],
          },
        },
        coherenceIssues: {
          type: "array",
          items: {
            type: "object",
            properties: {
              startTime: { type: "string", description: "Start timestamp in format MM:SS for the coherence issue segment" },
              endTime: { type: "string", description: "End timestamp in format MM:SS for the coherence issue segment" },
              issue: { type: "string", description: "Description of the coherence issue (e.g., 'Rambling', 'Run-on sentence')" },
              suggestion: { type: "string", description: "Suggestion for improvement" },
              severity: { type: "string", enum: ["low", "medium", "high"] },
            },
            required: ["startTime", "endTime", "issue", "suggestion", "severity"],
          },
        },
        overallCoherenceScore: { type: "number", minimum: 0, maximum: 10 },
        suggestions: { type: "array", items: { type: "string" } },
      },
      required: [
  "transcript",
  "durationSeconds",
  "wordCount",
  "wpm",
  "fillerWords",
  "totalFillerWords",
  "gaps",
  "averageGapDuration",
  "speechSegments",
  "coherenceIssues",
  "overallCoherenceScore",
  "suggestions",
      ],
    };

    // Generate analysis with structured output
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: contents,
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: jsonSchema,
        thinkingConfig: {
            thinkingBudget: -1
        }
      },
    });

    console.log("Gemini response received, parsing...");

    // Parse and validate the response
    const responseText = response.text;
    if (!responseText) {
      console.error("No response text from Gemini");
      return NextResponse.json({ error: "No response from AI" }, { status: 500 });
    }

    console.log("Response length:", responseText.length);
    const analysisData = AudioAnalysisSchema.parse(JSON.parse(responseText));
    console.log("Analysis parsed successfully");

    // Server-side authoritative word count & WPM calculation
    const countWords = (text: string) => {
      if (!text) return 0;
      // Basic word split: split on whitespace and punctuation, filter empties
      return (text || "")
        .trim()
        .split(/\s+/)
        .map((w) => w.replace(/^[^\w']+|[^\w']+$/g, ""))
        .filter(Boolean).length;
    };

    // Prefer timestampedTranscript texts if available, fallback to full transcript
    const reconstructedTranscript = (analysisData.timestampedTranscript && analysisData.timestampedTranscript.length > 0)
      ? analysisData.timestampedTranscript.map((s) => s.text).join(" ")
      : analysisData.transcript || "";

    const serverWordCount = countWords(reconstructedTranscript);
    const durationSec = analysisData.durationSeconds || 0;
    const serverWpm = durationSec > 0 ? Math.round((serverWordCount / (durationSec / 60))) : 0;

    // Overwrite values from AI with server-calculated authoritative values
    analysisData.wordCount = serverWordCount;
    analysisData.wpm = serverWpm;
    console.log("Computed server-side wordCount and wpm:", { serverWordCount, serverWpm });
    console.log("Analysis parsed successfully");
    const performanceMetrics = buildPerformanceMetrics(analysisData, project);

    // Save analysis to database
    console.log("Saving analysis to database...");
    if (upload.analysis && isRetry) {
      // Update existing analysis
      const updateData = {
        transcript: analysisData.transcript,
        durationSeconds: analysisData.durationSeconds,
        wordCount: analysisData.wordCount,
        wpm: analysisData.wpm,
        fillerWords: analysisData.fillerWords,
        totalFillerWords: analysisData.totalFillerWords,
        gaps: analysisData.gaps,
        averageGapDuration: analysisData.averageGapDuration,
        speechSegments: analysisData.speechSegments,
        sentenceIssues: analysisData.coherenceIssues,
        overallCoherenceScore: analysisData.overallCoherenceScore,
        suggestions: analysisData.suggestions,
        performance: performanceMetrics,
        ...(analysisData.timestampedTranscript ? { timestampedTranscript: analysisData.timestampedTranscript } : {}),
      };

      await prisma.audioAnalysis.update({
        where: { uploadId: upload.id },
        data: updateData,
      });
      console.log("Analysis updated in database");
    } else {
      // Create new analysis
      const createData = {
        uploadId: upload.id,
        transcript: analysisData.transcript,
        durationSeconds: analysisData.durationSeconds,
        wordCount: analysisData.wordCount,
        wpm: analysisData.wpm,
        fillerWords: analysisData.fillerWords,
        totalFillerWords: analysisData.totalFillerWords,
        gaps: analysisData.gaps,
        averageGapDuration: analysisData.averageGapDuration,
        speechSegments: analysisData.speechSegments,
        sentenceIssues: analysisData.coherenceIssues,
        overallCoherenceScore: analysisData.overallCoherenceScore,
        suggestions: analysisData.suggestions,
        performance: performanceMetrics,
        ...(analysisData.timestampedTranscript ? { timestampedTranscript: analysisData.timestampedTranscript } : {}),
      };

      await prisma.audioAnalysis.create({ data: createData });
      console.log("Analysis saved to database");
    }

    // Return the structured analysis
    return NextResponse.json({
      success: true,
      uploadId: upload.id,
      fileName: upload.fileName,
      analysis: {
        ...analysisData,
        performance: performanceMetrics,
      },
    });
  } catch (error) {
    console.error("Error analyzing audio:", error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid analysis format from AI", details: error.issues },
        { status: 500 }
      );
    }
    
    return NextResponse.json(
      { error: "Internal server error", message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

function getMimeTypeFromFilename(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
    mp3: "audio/mp3",
    wav: "audio/wav",
    m4a: "audio/mp4",
    aac: "audio/aac",
    ogg: "audio/ogg",
    flac: "audio/flac",
    aiff: "audio/aiff",
  };
  return mimeTypes[ext || ""] || "audio/mpeg";
}
