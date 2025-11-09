import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { PrismaClient } from "@/generated/prisma/client";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

const prisma = new PrismaClient();
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

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

const SentenceIssueSchema = z.object({
  timestamp: z.string().describe("Timestamp in format MM:SS"),
  issue: z.string().describe("Description of the sentence structure issue"),
  suggestion: z.string().describe("Suggestion for improvement"),
  severity: z.enum(["low", "medium", "high"]).describe("Severity of the issue"),
});

const AudioAnalysisSchema = z.object({
  transcript: z.string().describe("Complete transcript of the audio"),
  durationSeconds: z.number().describe("Total duration of the audio in seconds"),
  wordCount: z.number().describe("Total number of words in the transcript"),
  wpm: z.number().describe("Words per minute (calculated as wordCount / (durationSeconds / 60))"),
  fillerWords: z.array(FillerWordSchema).describe("Array of detected filler words with timestamps"),
  totalFillerWords: z.number().describe("Total count of all filler words"),
  gaps: z.array(GapAnalysisSchema).describe("Array of detected pauses/gaps with analysis"),
  averageGapDuration: z.number().describe("Average duration of gaps in seconds"),
  speechSegments: z.array(SpeechSegmentSchema).describe("Breakdown of speech into segments"),
  sentenceIssues: z.array(SentenceIssueSchema).describe("Identified sentence structure issues"),
  overallCoherenceScore: z.number().min(0).max(10).describe("Overall speech coherence score from 0-10"),
  suggestions: z.array(z.string()).describe("General suggestions for improving the speech"),
});

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
    console.log("Upload found:", { exists: !!upload, fileName: upload?.fileName, hasAnalysis: !!upload?.analysis });

    if (!upload) {
      return NextResponse.json({ error: "Upload not found" }, { status: 404 });
    }

    // Check if analysis already exists and this is not a retry
    if (upload.analysis && !isRetry) {
      console.log("Returning cached analysis");
      return NextResponse.json({
        success: true,
        uploadId: upload.id,
        fileName: upload.fileName,
        analysis: {
          transcript: upload.analysis.transcript,
          durationSeconds: upload.analysis.durationSeconds,
          wordCount: upload.analysis.wordCount,
          wpm: upload.analysis.wpm,
          fillerWords: upload.analysis.fillerWords,
          totalFillerWords: upload.analysis.totalFillerWords,
          gaps: upload.analysis.gaps,
          averageGapDuration: upload.analysis.averageGapDuration,
          speechSegments: upload.analysis.speechSegments,
          sentenceIssues: upload.analysis.sentenceIssues,
          overallCoherenceScore: upload.analysis.overallCoherenceScore,
          suggestions: upload.analysis.suggestions,
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

1. **Transcription**: Provide a complete, accurate transcript of the speech.

2. **Duration & Word Count**: Calculate the total duration in seconds and count all words.

3. **Words Per Minute (WPM)**: Calculate speaking rate as: (total words / duration in minutes).

4. **Filler Words**: Identify ALL filler words like "um", "uh", "like", "you know", "so", "actually", "basically", "literally", etc. For each individual occurrence of a filler word, provide the word and its timestamp (MM:SS format). Create a new entry for every single filler word spoken.

5. **Gap Analysis**: Identify pauses/gaps in speech. Ignore natural pauses under 1 second.
   - Short gaps: 1-2 seconds (thoughtful pauses)
   - Medium gaps: 2-4 seconds (hesitation)
   - Long gaps: 4-7 seconds (concerning pauses)
   - Excessive gaps: 7+ seconds (major disruption)
   Provide timestamp and duration for each detected gap.

6. **Speech Segmentation**: Break down the speech into logical segments (introduction, body, conclusion, transitions). Provide start/end timestamps and a brief content summary for each segment. Rate each segment's coherence (0-10).

7. **Sentence Structure Issues**: Identify problems like:
   - Passive voice usage
   - Run-on sentences
   - Incomplete sentences
   - Overly complex sentences
   - Lack of variety
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
        sentenceIssues: {
          type: "array",
          items: {
            type: "object",
            properties: {
              timestamp: { type: "string", description: "Timestamp in format MM:SS" },
              issue: { type: "string", description: "Description of the issue" },
              suggestion: { type: "string", description: "Suggestion for improvement" },
              severity: { type: "string", enum: ["low", "medium", "high"] },
            },
            required: ["timestamp", "issue", "suggestion", "severity"],
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
        "sentenceIssues",
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

    // Save analysis to database
    console.log("Saving analysis to database...");
    if (upload.analysis && isRetry) {
      // Update existing analysis
      await prisma.audioAnalysis.update({
        where: { uploadId: upload.id },
        data: {
          transcript: analysisData.transcript,
          durationSeconds: analysisData.durationSeconds,
          wordCount: analysisData.wordCount,
          wpm: analysisData.wpm,
          fillerWords: analysisData.fillerWords,
          totalFillerWords: analysisData.totalFillerWords,
          gaps: analysisData.gaps,
          averageGapDuration: analysisData.averageGapDuration,
          speechSegments: analysisData.speechSegments,
          sentenceIssues: analysisData.sentenceIssues,
          overallCoherenceScore: analysisData.overallCoherenceScore,
          suggestions: analysisData.suggestions,
        },
      });
      console.log("Analysis updated in database");
    } else {
      // Create new analysis
      await prisma.audioAnalysis.create({
        data: {
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
          sentenceIssues: analysisData.sentenceIssues,
          overallCoherenceScore: analysisData.overallCoherenceScore,
          suggestions: analysisData.suggestions,
        },
      });
      console.log("Analysis saved to database");
    }

    // Return the structured analysis
    return NextResponse.json({
      success: true,
      uploadId: upload.id,
      fileName: upload.fileName,
      analysis: analysisData,
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
