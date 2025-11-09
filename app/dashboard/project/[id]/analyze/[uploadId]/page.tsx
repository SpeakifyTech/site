"use client";

import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, ArrowLeft, Clock, MessageSquare, Gauge, TrendingUp, AlertTriangle, CheckCircle2, Info, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";

interface FillerWord {
  word: string;
  timestamp: string;
  count: number;
}

interface GapAnalysis {
  timestamp: string;
  duration: number;
  type: "short" | "medium" | "long" | "excessive";
}

interface SpeechSegment {
  type: "introduction" | "body" | "conclusion" | "transition";
  startTime: string;
  endTime: string;
  content: string;
  coherenceScore: number;
}

interface SentenceIssue {
  timestamp: string;
  issue: string;
  suggestion: string;
  severity: "low" | "medium" | "high";
}

interface AudioAnalysis {
  transcript: string;
  durationSeconds: number;
  wordCount: number;
  wpm: number;
  fillerWords: FillerWord[];
  totalFillerWords: number;
  gaps: GapAnalysis[];
  averageGapDuration: number;
  speechSegments: SpeechSegment[];
  sentenceIssues: SentenceIssue[];
  overallCoherenceScore: number;
  suggestions: string[];
}

interface AnalysisResponse {
  success: boolean;
  uploadId: string;
  fileName: string;
  analysis: AudioAnalysis;
  cached?: boolean;
}

export default function AudioAnalysisPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;
  const uploadId = params.uploadId as string;
  const { data: session, isPending } = authClient.useSession();

  const [analysis, setAnalysis] = useState<AudioAnalysis | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [hasFetched, setHasFetched] = useState(false);

  useEffect(() => {
    console.log("useEffect triggered:", { session: !!session, projectId, uploadId, isPending, hasFetched });

    if (session && projectId && uploadId && !hasFetched && !isPending) {
      console.log("Calling fetchAnalysis");
      fetchAnalysis();
    }
  }, [session, projectId, uploadId, hasFetched, isPending]);

  const fetchAnalysis = async (isRetry = false) => {
    try {
      console.log("Starting analysis fetch", { isRetry });
      setIsLoading(true);
      setErrorMessage("");

      // Add timeout to prevent infinite loading
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minutes timeout

      const url = isRetry 
        ? `/api/analyze/${projectId}/${uploadId}?retry=true`
        : `/api/analyze/${projectId}/${uploadId}`;
      
      const res = await fetch(url, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      console.log("API response status:", res.status);

      const data = await res.json() as AnalysisResponse | { error: string };
      console.log("API response data:", data);

      if (res.ok && "analysis" in data) {
        setAnalysis(data.analysis);
        setFileName(data.fileName);
        setErrorMessage("");
        setHasFetched(true);
      } else {
        const errorMsg = "error" in data ? data.error : "Failed to analyze audio";
        setErrorMessage(errorMsg);
        console.error("Analysis failed:", errorMsg);
      }
    } catch (err) {
      let errorMsg = "An error occurred while analyzing audio";
      if (err instanceof Error) {
        if (err.name === 'AbortError') {
          errorMsg = "Analysis timed out. Please try again.";
        } else {
          errorMsg = err.message;
        }
      }
      setErrorMessage(errorMsg);
      console.error("Analysis error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const getGapColor = (type: string) => {
    switch (type) {
      case "short":
        return "text-green-600 bg-green-50 border-green-200";
      case "medium":
        return "text-blue-600 bg-blue-50 border-blue-200";
      case "long":
        return "text-yellow-600 bg-yellow-50 border-yellow-200";
      case "excessive":
        return "text-red-600 bg-red-50 border-red-200";
      default:
        return "text-gray-600 bg-gray-50 border-gray-200";
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "low":
        return "text-yellow-600 bg-yellow-50 border-yellow-200";
      case "medium":
        return "text-orange-600 bg-orange-50 border-orange-200";
      case "high":
        return "text-red-600 bg-red-50 border-red-200";
      default:
        return "text-gray-600 bg-gray-50 border-gray-200";
    }
  };

  const getCoherenceColor = (score: number) => {
    if (score >= 8) return "text-green-600";
    if (score >= 6) return "text-blue-600";
    if (score >= 4) return "text-yellow-600";
    return "text-red-600";
  };

  if (isPending) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading session...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    router.push("/login");
    return null;
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Analyzing audio...</p>
          <p className="text-xs text-muted-foreground mt-2">This may take 30-60 seconds</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-6">
        <Link href={`/dashboard/project/${projectId}`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Project
          </Button>
        </Link>
      </div>

      {errorMessage && (
        <Alert variant="destructive" className="mb-6">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>{errorMessage}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setHasFetched(false);
                setErrorMessage("");
                fetchAnalysis(true);
              }}
              className="ml-4"
            >
              Retry Analysis
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {analysis && (
        <>
          <div className="mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold mb-2">Audio Analysis</h1>
                <p className="text-muted-foreground">{fileName}</p>
              </div>
              <Button
                variant="outline"
                onClick={() => fetchAnalysis(true)}
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Retrying...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Retry Analysis
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Duration
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatTime(analysis.durationSeconds)}</div>
                <p className="text-xs text-muted-foreground">{analysis.wordCount} words</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Gauge className="h-4 w-4" />
                  Speaking Rate
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{Math.round(analysis.wpm)} WPM</div>
                <p className="text-xs text-muted-foreground">
                  {analysis.wpm < 120 ? "Slow" : analysis.wpm < 160 ? "Normal" : "Fast"}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Filler Words
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{analysis.totalFillerWords}</div>
                <p className="text-xs text-muted-foreground">
                  {((analysis.totalFillerWords / analysis.wordCount) * 100).toFixed(1)}% of speech
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Coherence Score
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${getCoherenceColor(analysis.overallCoherenceScore)}`}>
                  {analysis.overallCoherenceScore.toFixed(1)}/10
                </div>
                <p className="text-xs text-muted-foreground">Overall quality</p>
              </CardContent>
            </Card>
          </div>

          {/* Transcript */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Transcript</CardTitle>
              <CardDescription>Complete transcription of your audio</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="p-4 bg-muted rounded-lg max-h-96 overflow-y-auto">
                <p className="whitespace-pre-wrap">{analysis.transcript}</p>
              </div>
            </CardContent>
          </Card>

          {/* Speech Segments */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Speech Structure</CardTitle>
              <CardDescription>Breakdown of your speech into logical segments</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {analysis.speechSegments.map((segment, index) => (
                  <div key={index} className="border rounded-lg p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <span className="inline-block px-2 py-1 text-xs font-semibold rounded-full bg-primary/10 text-primary capitalize mb-2">
                          {segment.type}
                        </span>
                        <p className="text-sm text-muted-foreground">
                          {segment.startTime} - {segment.endTime}
                        </p>
                      </div>
                      <div className={`text-lg font-bold ${getCoherenceColor(segment.coherenceScore)}`}>
                        {segment.coherenceScore.toFixed(1)}/10
                      </div>
                    </div>
                    <p className="text-sm">{segment.content}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Filler Words */}
          {analysis.fillerWords.length > 0 && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Filler Words Analysis</CardTitle>
                <CardDescription>
                  Detected {analysis.totalFillerWords} filler words throughout the speech
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {analysis.fillerWords.map((filler, index) => (
                    <div key={index} className="border rounded-lg p-3 flex justify-between items-center">
                      <div>
                        <p className="font-semibold">"{filler.word}"</p>
                        <p className="text-xs text-muted-foreground">{filler.timestamp}</p>
                      </div>
                      <span className="text-lg font-bold text-muted-foreground">×{filler.count}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Gap Analysis */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Pause & Gap Analysis</CardTitle>
              <CardDescription>
                Average gap duration: {analysis.averageGapDuration.toFixed(2)}s
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {analysis.gaps.map((gap, index) => (
                  <div
                    key={index}
                    className={`border rounded-lg p-3 flex justify-between items-center ${getGapColor(gap.type)}`}
                  >
                    <div>
                      <p className="font-semibold capitalize">{gap.type} pause</p>
                      <p className="text-xs">{gap.timestamp}</p>
                    </div>
                    <span className="text-lg font-bold">{gap.duration.toFixed(2)}s</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Sentence Issues */}
          {analysis.sentenceIssues.length > 0 && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Sentence Structure Issues</CardTitle>
                <CardDescription>Areas for improvement in your speech</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {analysis.sentenceIssues.map((issue, index) => (
                    <div
                      key={index}
                      className={`border rounded-lg p-4 ${getSeverityColor(issue.severity)}`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <span className="inline-block px-2 py-1 text-xs font-semibold rounded-full capitalize">
                            {issue.severity} severity
                          </span>
                          <p className="text-xs mt-1">{issue.timestamp}</p>
                        </div>
                      </div>
                      <p className="font-semibold mb-1">Issue: {issue.issue}</p>
                      <p className="text-sm flex items-start gap-2">
                        <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        <span>{issue.suggestion}</span>
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Suggestions */}
          <Card>
            <CardHeader>
              <CardTitle>Recommendations</CardTitle>
              <CardDescription>Actionable suggestions to improve your speech</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {analysis.suggestions.map((suggestion, index) => (
                  <div key={index} className="flex items-start gap-3 p-3 bg-muted rounded-lg">
                    <Info className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                    <p className="text-sm">{suggestion}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
