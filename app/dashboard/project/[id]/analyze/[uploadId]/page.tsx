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
import { Loader2, Clock, MessageSquare, Gauge, TrendingUp, AlertTriangle, Info, RefreshCw } from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { motion } from "framer-motion";

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

interface Project {
  id: string;
  name: string;
  description: string | null;
  vibe: string | null;
  strict: boolean;
  timeframe: number;
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
  const [project, setProject] = useState<Project | null>(null);
  const [activeTab, setActiveTab] = useState<string>("overview");

  const fetchProject = async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}`);
      if (res.ok) {
        const data = await res.json() as { project: Project };
        setProject(data.project);
      } else {
        console.error("Failed to fetch project");
      }
    } catch (err) {
      console.error("Error fetching project:", err);
    }
  };

  const calculateGrade = (analysis: AudioAnalysis, project: Project): number => {
    if (!analysis || !project) return 0;

    // Time accuracy score (0-100)
    let timeScore = 100;
    if (project.timeframe > 0) {
      const timeDiff = Math.abs(analysis.durationSeconds - project.timeframe);
      const maxDiff = project.timeframe * 0.2; // 20% tolerance
      timeScore = Math.max(0, 100 - (timeDiff / maxDiff) * 100);
    }

    // Coherence score (0-100) - using as proxy for tone
    const coherenceScore = (analysis.overallCoherenceScore / 10) * 100;

    // Filler words score (0-100) - lower filler % is better
    const fillerPercentage = (analysis.totalFillerWords / analysis.wordCount) * 100;
    const fillerScore = Math.max(0, 100 - fillerPercentage * 5); // 5% filler = 75% score, etc.

    // Long pauses score (0-100) - fewer long pauses is better
    const longPauses = analysis.gaps.filter(g => g.type === 'long' || g.type === 'excessive').length;
    const pauseScore = Math.max(0, 100 - longPauses * 10); // 10 long pauses = 0% score

    // Average the scores
    const totalScore = (timeScore + coherenceScore + fillerScore + pauseScore) / 4;
    return Math.round(totalScore);
  };

  const calculateFactorScores = (analysis: AudioAnalysis, project: Project) => {
    // Time accuracy score (0-100)
    let timeScore = 100;
    if (project.timeframe > 0) {
      const timeDiff = Math.abs(analysis.durationSeconds - project.timeframe);
      const maxDiff = project.timeframe * 0.2; // 20% tolerance
      timeScore = Math.max(0, 100 - (timeDiff / maxDiff) * 100);
    }

    // Coherence score (0-100) - using as proxy for tone
    const coherenceScore = (analysis.overallCoherenceScore / 10) * 100;

    // Filler words score (0-100) - lower filler % is better
    const fillerPercentage = (analysis.totalFillerWords / analysis.wordCount) * 100;
    const fillerScore = Math.max(0, 100 - fillerPercentage * 5); // 5% filler = 75% score, etc.

    // Long pauses score (0-100) - fewer long pauses is better
    const longPauses = analysis.gaps.filter(g => g.type === 'long' || g.type === 'excessive').length;
    const pauseScore = Math.max(0, 100 - longPauses * 10); // 10 long pauses = 0% score

    return {
      time: Math.round(timeScore),
      coherence: Math.round(coherenceScore),
      filler: Math.round(fillerScore),
      pauses: Math.round(pauseScore),
    };
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-yellow-600";
    return "text-red-600";
  };

  useEffect(() => {
    console.log("useEffect triggered:", { session: !!session, projectId, uploadId, isPending, hasFetched });

    if (session && projectId && uploadId && !hasFetched && !isPending) {
      console.log("Calling fetchAnalysis and fetchProject");
      fetchProject();
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
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/dashboard">Dashboard</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href={`/dashboard/project/${projectId}`}>
                {project?.name || "Project"}
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Audio Analysis</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
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
          {/* Hero Header */}
          <motion.div 
            className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          >
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Project Analysis</p>
              <h1 className="text-3xl font-bold mb-1">
                {project?.name || "Audio Analysis"}
              </h1>
              <p className="text-sm text-muted-foreground">
                {fileName} {project?.vibe ? `• Target tone: ${project.vibe}` : ""}
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              {project && (
                <div className="flex flex-col items-end">
                  <span className="text-xs uppercase text-muted-foreground">Overall performance</span>
                  {(() => {
                    const grade = calculateGrade(analysis, project)
                    const color = grade > 85
                      ? "text-green-500"
                      : grade >= 70
                        ? "text-yellow-500"
                        : "text-red-500"
                    return (
                      <span className={`text-4xl font-semibold leading-none ${color}`}>
                        {grade}%
                      </span>
                    )
                  })()}

                </div>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchAnalysis(true)}
                disabled={isLoading}
                className="mt-1"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Refreshing
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Re-run analysis
                  </>
                )}
              </Button>
            </div>
          </motion.div>

          {/* Tab Navigation */}
          <motion.div 
            className="mb-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <div className="flex space-x-1 border-b">
              {[
                { id: "overview", label: "Overview" },
                { id: "structure", label: "Structure" },
                { id: "time", label: "Time" },
                { id: "coherence", label: "Coherence" },
                { id: "pauses", label: "Pauses" },
                { id: "filler", label: "Filler Words" },
                { id: "transcript", label: "Transcript" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </motion.div>

          {/* Tab Content */}
          {activeTab === "overview" && (
            <>
              {/* Key Metrics */}
              <motion.div 
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.3 }}
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3, delay: 0.4 }}
                >
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
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3, delay: 0.5 }}
                >
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
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3, delay: 0.6 }}
                >
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
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3, delay: 0.7 }}
                >
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
                </motion.div>
              </motion.div>

              {/* Factor Breakdown */}
              {project && (
                <motion.div
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.5 }}
                >
                  <Card className="mb-6">
                    <CardHeader>
                      <CardTitle>Performance Breakdown</CardTitle>
                      <CardDescription>Individual scores for each factor contributing to your grade</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {(() => {
                          const scores = calculateFactorScores(analysis, project);
                          return [
                            {
                              label: "Time Accuracy",
                              score: scores.time,
                              description: project.timeframe > 0 ? `Goal: ${formatTime(project.timeframe / 1000)}` : "No time goal set",
                            },
                            {
                              label: "Coherence & Tone",
                              score: scores.coherence,
                              description: `Score: ${analysis.overallCoherenceScore.toFixed(1)}/10`,
                            },
                            {
                              label: "Filler Words",
                              score: scores.filler,
                              description: `${((analysis.totalFillerWords / analysis.wordCount) * 100).toFixed(1)}% of speech`,
                            },
                            {
                              label: "Pause Control",
                              score: scores.pauses,
                              description: `${analysis.gaps.filter(g => g.type === 'long' || g.type === 'excessive').length} long pauses`,
                            },
                          ].map((factor, index) => (
                            <motion.div 
                              key={index} 
                              className="text-center p-4 border rounded-lg"
                              initial={{ opacity: 0, y: 20 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ duration: 0.4, delay: 0.6 + index * 0.1 }}
                            >
                              <div className={`text-3xl font-bold mb-2 ${getScoreColor(factor.score)}`}>
                                {factor.score}%
                              </div>
                              <h3 className="font-semibold mb-1">{factor.label}</h3>
                              <p className="text-sm text-muted-foreground">{factor.description}</p>
                            </motion.div>
                          ));
                        })()}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )}

              {/* Suggestions */}
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.7 }}
              >
                <Card>
                  <CardHeader>
                    <CardTitle>Recommendations</CardTitle>
                    <CardDescription>Actionable suggestions to improve your speech</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {analysis.suggestions.map((suggestion, index) => (
                        <motion.div 
                          key={index} 
                          className="flex items-start gap-3 p-3 bg-muted rounded-lg"
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: 0.4, delay: 0.8 + index * 0.1 }}
                        >
                          <Info className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                          <p className="text-sm">{suggestion}</p>
                        </motion.div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            </>
          )}

          {activeTab === "structure" && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <Card>
                <CardHeader>
                  <CardTitle>Speech Structure</CardTitle>
                  <CardDescription>Breakdown of your speech into logical segments</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {analysis.speechSegments.map((segment, index) => (
                      <motion.div 
                        key={index} 
                        className="border rounded-lg p-4"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: index * 0.1 }}
                      >
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
                      </motion.div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {activeTab === "time" && project && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <Card>
                <CardHeader>
                  <CardTitle>Time Analysis</CardTitle>
                  <CardDescription>How close you were to your goal time</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-center mb-4">
                    <div className="text-4xl font-bold mb-2">
                      {formatTime(analysis.durationSeconds)}
                    </div>
                    <p className="text-muted-foreground">
                      Goal: {project.timeframe > 0 ? formatTime(project.timeframe / 1000) : 'Not set'}
                    </p>
                    {project.timeframe > 0 && (
                      <p className="text-sm mt-2">
                        Difference: {Math.abs(analysis.durationSeconds - project.timeframe / 1000).toFixed(1)}s 
                        ({analysis.durationSeconds > project.timeframe / 1000 ? 'over' : 'under'})
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {activeTab === "coherence" && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <Card>
                <CardHeader>
                  <CardTitle>Coherence & Tone Analysis</CardTitle>
                  <CardDescription>Your speech coherence score and tone alignment</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-center mb-4">
                    <div className={`text-4xl font-bold mb-2 ${getCoherenceColor(analysis.overallCoherenceScore)}`}>
                      {analysis.overallCoherenceScore.toFixed(1)}/10
                    </div>
                    <p className="text-muted-foreground">
                      Desired Tone: {project?.vibe || 'Not specified'}
                    </p>
                  </div>
                  <div className="space-y-4">
                    {analysis.speechSegments.map((segment, index) => (
                      <motion.div 
                        key={index} 
                        className="border rounded-lg p-4"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: index * 0.1 }}
                      >
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
                      </motion.div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {activeTab === "pauses" && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <Card>
                <CardHeader>
                  <CardTitle>Pause & Gap Analysis</CardTitle>
                  <CardDescription>
                    Average gap duration: {analysis.averageGapDuration.toFixed(2)}s
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {analysis.gaps.map((gap, index) => (
                      <motion.div
                        key={index}
                        className={`border rounded-lg p-3 flex justify-between items-center ${getGapColor(gap.type)}`}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.4, delay: index * 0.05 }}
                      >
                        <div>
                          <p className="font-semibold capitalize">{gap.type} pause</p>
                          <p className="text-xs">{gap.timestamp}</p>
                        </div>
                        <span className="text-lg font-bold">{gap.duration.toFixed(2)}s</span>
                      </motion.div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {activeTab === "filler" && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <Card>
                <CardHeader>
                  <CardTitle>Filler Words Analysis</CardTitle>
                  <CardDescription>
                    {analysis.totalFillerWords > 0
                      ? `Detected ${analysis.totalFillerWords} filler words throughout the speech`
                      : "No filler words detected in your speech"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {analysis.totalFillerWords === 0 ? (
                    <motion.div 
                      className="text-center py-12"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.4, delay: 0.2 }}
                    >
                      <div className="text-6xl mb-4">🎉</div>
                      <h3 className="text-lg font-semibold mb-2">Excellent!</h3>
                      <p className="text-muted-foreground max-w-sm mx-auto">
                        Your speech is free of filler words. This creates a clean, professional delivery that keeps your audience engaged.
                      </p>
                    </motion.div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {analysis.fillerWords.map((filler, index) => (
                        <motion.div 
                          key={index} 
                          className="border rounded-lg p-3 flex justify-between items-center"
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ duration: 0.3, delay: index * 0.05 }}
                        >
                          <div>
                            <p className="font-semibold">"{filler.word}"</p>
                            <p className="text-xs text-muted-foreground">{filler.timestamp}</p>
                          </div>
                          <span className="text-lg font-bold text-muted-foreground">×{filler.count}</span>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}

          {activeTab === "transcript" && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <Card>
                <CardHeader>
                  <CardTitle>Transcript</CardTitle>
                  <CardDescription>Complete transcription of your audio</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="p-4 bg-muted rounded-lg max-h-96 overflow-y-auto">
                    <div className="space-y-2">
                      {analysis.transcript.split(/[.!?]+/).filter(sentence => sentence.trim().length > 0).map((sentence, index) => (
                        <motion.p 
                          key={index} 
                          className="text-sm leading-relaxed"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.3, delay: index * 0.03 }}
                        >
                          {sentence.trim()}.
                        </motion.p>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </>
      )}
    </div>
  );
}
