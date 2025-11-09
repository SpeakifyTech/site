"use client";

import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
// Card UI removed for transcript tab to match other tab layouts (no card background)
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertTriangle, Info, RefreshCw } from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { useEffect, useState, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { motion } from "framer-motion";
import { Play, Pause } from "lucide-react";

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

interface CoherenceIssue {
  startTime: string;
  endTime: string;
  issue: string; // e.g. "Rambling", "Run-on sentence"
  suggestion: string;
  severity: "low" | "medium" | "high";
}

interface TimestampedSegment {
  startTime: string;
  endTime: string;
  text: string;
}

interface PerformanceFactor {
  label: string;
  score: number;
  description: string;
}

interface PerformanceMetrics {
  overallGrade: number;
  factorScores: {
    time: number;
    coherence: number;
    filler: number;
    pauses: number;
  };
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
  coherenceIssues?: CoherenceIssue[];
  timestampedTranscript?: TimestampedSegment[];
  overallCoherenceScore: number;
  suggestions: string[];
  performance?: PerformanceMetrics;
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

  // Audio playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  // Used to mark a target end time when we want to play a short segment and stop at its end
  const targetEndRef = useRef<number | null>(null);

  const parseTimestamp = (timeStr: string) => {
    if (!timeStr) return 0;
    const parts = timeStr.split(":").map((p) => Number(p));
    const mins = parts[0] || 0;
    const secs = parts[1] || 0;
    return mins * 60 + secs;
  };

  const jumpToTranscriptSegment = (seg: TimestampedSegment) => {
    if (!audioRef.current) return;
    const start = parseTimestamp(seg.startTime);
    const end = parseTimestamp(seg.endTime);
    audioRef.current.currentTime = start;
    setCurrentTime(start);
    targetEndRef.current = end;
    if (!isPlaying) {
      setIsPlaying(true);
      audioRef.current.play();
    }
  };

  const fetchProject = async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}`);
      if (res.ok) {
        const data = (await res.json()) as { project: Project };
        setProject(data.project);
      } else {
        console.error("Failed to fetch project");
      }
    } catch (err) {
      console.error("Error fetching project:", err);
    }
  };

  const calculateGrade = (
    analysis: AudioAnalysis,
    project: Project
  ): number => {
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
    const fillerPercentage =
      (analysis.totalFillerWords / analysis.wordCount) * 100;
    const fillerScore = Math.max(0, 100 - fillerPercentage * 5); // 5% filler = 75% score, etc.

    // Long pauses score (0-100) - fewer long pauses is better
    const longPauses = analysis.gaps.filter(
      (g) => g.type === "long" || g.type === "excessive"
    ).length;
    const pauseScore = Math.max(0, 100 - longPauses * 10); // 10 long pauses = 0% score

    // Average the scores
    const totalScore =
      (timeScore + coherenceScore + fillerScore + pauseScore) / 4;
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
    const fillerPercentage =
      (analysis.totalFillerWords / analysis.wordCount) * 100;
    const fillerScore = Math.max(0, 100 - fillerPercentage * 5); // 5% filler = 75% score, etc.

    // Long pauses score (0-100) - fewer long pauses is better
    const longPauses = analysis.gaps.filter(
      (g) => g.type === "long" || g.type === "excessive"
    ).length;
    const pauseScore = Math.max(0, 100 - longPauses * 10); // 10 long pauses = 0% score

    return {
      time: Math.round(timeScore),
      coherence: Math.round(coherenceScore),
      filler: Math.round(fillerScore),
      pauses: Math.round(pauseScore),
    };
  };

  useEffect(() => {
    console.log("useEffect triggered:", {
      session: !!session,
      projectId,
      uploadId,
      isPending,
      hasFetched,
    });

    if (session && projectId && uploadId && !hasFetched && !isPending) {
      console.log("Calling fetchAnalysis and fetchProject");
      fetchProject();
      fetchAnalysis();
    }
  }, [session, projectId, uploadId, hasFetched, isPending]);

  // Set duration from analysis data as fallback
  
  useEffect(() => {
    if (analysis && !duration) {
      console.log("Setting duration from analysis:", analysis.durationSeconds);
      setDuration(analysis.durationSeconds);
    }
  }, [analysis, duration]);

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

      const data = (await res.json()) as AnalysisResponse | { error: string };
      console.log("API response data:", data);

      if (res.ok && "analysis" in data) {
        setAnalysis(data.analysis);
        setFileName(data.fileName);
        setErrorMessage("");
        setHasFetched(true);
      } else {
        const errorMsg =
          "error" in data ? data.error : "Failed to analyze audio";
        setErrorMessage(errorMsg);
        console.error("Analysis failed:", errorMsg);
      }
    } catch (err) {
      let errorMsg = "An error occurred while analyzing audio";
      if (err instanceof Error) {
        if (err.name === "AbortError") {
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

  // Audio control functions
  const togglePlayPause = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      const t = audioRef.current.currentTime;
      setCurrentTime(t);
      // If a target segment end is set, pause when we reach or pass it
      if (targetEndRef.current !== null && t >= targetEndRef.current) {
        audioRef.current.pause();
        setIsPlaying(false);
        targetEndRef.current = null;
      }
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      const audioDuration = audioRef.current.duration;
      console.log("Audio duration loaded:", audioDuration);
      if (!isNaN(audioDuration) && audioDuration > 0) {
        setDuration(audioDuration);
      } else {
        // Fallback to analysis duration if audio duration is not available
        console.log(
          "Using analysis duration as fallback:",
          analysis?.durationSeconds
        );
        setDuration(analysis?.durationSeconds || 0);
      }
    }
  };

  const handleTimelineClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const currentDuration = duration || analysis?.durationSeconds || 0;
    console.log("Timeline clicked, duration:", currentDuration);
    if (audioRef.current && currentDuration > 0) {
      const rect = event.currentTarget.getBoundingClientRect();
      const clickX = event.clientX - rect.left;
      const percentage = clickX / rect.width;
      const newTime = percentage * currentDuration;
      console.log("Jumping to time:", newTime);
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  const jumpToSegment = (segment: SpeechSegment) => {
    console.log("Jumping to segment:", segment.startTime);
    if (audioRef.current) {
      // Parse start time (assuming format like "0:15" or "1:23")
      const [mins, secs] = segment.startTime.split(":").map(Number);
      const startTime = mins * 60 + secs;
      console.log("Parsed start time:", startTime);
      audioRef.current.currentTime = startTime;
      setCurrentTime(startTime);
      if (!isPlaying) {
        setIsPlaying(true);
        audioRef.current.play();
      }
    }
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
          <p className="text-xs text-muted-foreground mt-2">
            This may take around 30 seconds
          </p>
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
        <Alert variant="destructive" className="mb-4 items-center">
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
          {/* Hidden Audio Element */}
          <audio
            ref={audioRef}
            src={`/api/uploads/${projectId}/${uploadId}`}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onEnded={() => setIsPlaying(false)}
            onError={(e) => console.error("Audio loading error:", e)}
            onLoadStart={() => console.log("Audio load started")}
            onCanPlay={() => console.log("Audio can play")}
            preload="metadata"
          />

          {/* Hero Header */}
          <motion.div
            className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          >
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                Project Analysis
              </p>
              <h1 className="text-3xl font-bold mb-1">
                {project?.name || "Audio Analysis"}
              </h1>
              <p className="text-sm text-muted-foreground">
                {fileName}{" "}
                {project?.vibe ? `• Target tone: ${project.vibe}` : ""}
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
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

          {/* Pill Tabs Navigation */}
          <motion.div
            className="mb-8 flex justify-center"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <div className="relative flex bg-muted/50 p-2 rounded-full backdrop-blur-sm border shadow-lg">
              {/* Animated pill background */}
              <motion.div
                layout
                layoutId="active-pill"
                className="absolute top-2 bottom-2 rounded-full bg-primary shadow-lg"
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                style={{
                  // This element's size/position will be driven by the active tab button via layoutId
                  zIndex: 0,
                }}
              />

              {[
                { id: "overview", label: "Overview" },
                { id: "structure", label: "Structure" },
                { id: "coherence", label: "Coherence" },
                { id: "pauses", label: "Pauses" },
                { id: "filler", label: "Filler Words" },
                { id: "transcript", label: "Transcript" },
              ].map((tab) => (
                <motion.button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative px-6 py-2 text-sm font-medium rounded-full transition-colors duration-200 z-10 ${
                    activeTab === tab.id
                      ? "text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  layout
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                >
                  {activeTab === tab.id && (
                    <motion.span
                      layoutId="active-pill"
                      className="absolute inset-0 rounded-full bg-primary shadow-lg -z-10"
                      transition={{
                        type: "spring",
                        stiffness: 400,
                        damping: 30,
                      }}
                    />
                  )}
                  <span className="relative z-10">{tab.label}</span>
                </motion.button>
              ))}
            </div>
          </motion.div>

          {/* Tab Content */}
          {activeTab === "overview" && (
            <>
              {/* Three Column Layout */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                {/* Left Column - Performance Factors */}
                <motion.div
                  initial={{ opacity: 0, x: -30 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.6, delay: 0.3 }}
                >
                  <div className="h-fit">
                    <div className="mb-3 flex items-baseline gap-2">
                      <h2 className="text-base font-semibold text-foreground">
                        Performance breakdown
                      </h2>
                    </div>
                    <div className="grid grid-cols-1 gap-4">
                      {project &&
                        (() => {
                          const scores = calculateFactorScores(
                            analysis,
                            project
                          );
                          return [
                            {
                              label: "Time Accuracy",
                              score: scores.time,
                              description:
                                project.timeframe > 0
                                  ? `Goal: ${formatTime(
                                      project.timeframe / 1000
                                    )}`
                                  : "No time goal set",
                            },
                            {
                              label: "Coherence & Tone",
                              score: scores.coherence,
                              description: `Score: ${analysis.overallCoherenceScore.toFixed(
                                1
                              )}/10`,
                            },
                            {
                              label: "Filler Words",
                              score: scores.filler,
                              description: `${(
                                (analysis.totalFillerWords /
                                  analysis.wordCount) *
                                100
                              ).toFixed(1)}% of speech`,
                            },
                            {
                              label: "Pause Control",
                              score: scores.pauses,
                              description: `${
                                analysis.gaps.filter(
                                  (g) =>
                                    g.type === "long" || g.type === "excessive"
                                ).length
                              } long pauses`,
                            },
                            {
                              label: "WPM",
                              score: analysis.wpm || 0,
                              description: `Words per minute: ${analysis.wpm || 0}`,
                            },
                          ].map((factor, index) => {
                            const isWpm = factor.label === "WPM";
                            const getBubbleColor = (score: number) => {
                              if (isWpm) return "bg-sky-50 text-sky-600 border-sky-100";
                              if (score >= 80)
                                return "bg-emerald-500/10 text-emerald-600 border-emerald-100";
                              if (score >= 60)
                                return "bg-amber-500/10 text-amber-600 border-amber-100";
                              return "bg-rose-500/10 text-rose-600 border-rose-100";
                            };

                            const displayValue = isWpm ? `${factor.score} WPM` : `${factor.score}%`;

                            return (
                              <motion.div
                                key={index}
                                className={`flex flex-col items-start gap-1 px-4 py-3 rounded-2xl border backdrop-blur-sm ${getBubbleColor(
                                  Math.min(100, factor.score)
                                )}`}
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{
                                  duration: 0.25,
                                  delay: 0.15 + index * 0.05,
                                }}
                              >
                                <div className="flex items-baseline gap-2">
                                  <span className="text-lg font-semibold">
                                    {displayValue}
                                  </span>
                                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                    {factor.label}
                                  </span>
                                </div>
                                <p className="text-[11px] text-muted-foreground">
                                  {factor.description}
                                </p>
                              </motion.div>
                            );
                          });
                        })()}
                    </div>
                  </div>
                </motion.div>

                {/* Center Column - Overall Percentage (glowing circle) */}
                <motion.div
                  className="flex flex-col items-center justify-center mt-12"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.6, delay: 0.2 }}
                >
                  {project &&
                    (() => {
                      const grade = calculateGrade(analysis, project);
                      const glowColor =
                        grade > 85
                          ? "bg-emerald-500/40"
                          : grade >= 70
                          ? "bg-amber-500/40"
                          : "bg-rose-500/40";
                      const textColor =
                        grade > 85
                          ? "text-emerald-500"
                          : grade >= 70
                          ? "text-amber-500"
                          : "text-rose-500";
                      const progressColor =
                        grade > 85
                          ? "stroke-emerald-500"
                          : grade >= 70
                          ? "stroke-amber-500"
                          : "stroke-rose-500";
                      const radius = 130;
                      const circumference = 2 * Math.PI * radius;
                      const strokeDashoffset =
                        circumference * (1 - grade / 100);
                      return (
                        <>
                          <div className="relative flex items-center justify-center">
                            <div
                              className={`absolute inset-0 rounded-full blur-3xl ${glowColor}`}
                              style={{ width: 320, height: 320 }}
                            />
                            <svg
                              width="288"
                              height="288"
                              viewBox="0 0 288 288"
                              className="relative"
                            >
                              {/* Background circle */}
                              <circle
                                cx="144"
                                cy="144"
                                r={radius}
                                stroke="currentColor"
                                strokeWidth="8"
                                fill="none"
                                className="text-muted-foreground/20"
                              />
                              {/* Progress circle */}
                              <circle
                                cx="144"
                                cy="144"
                                r={radius}
                                stroke="currentColor"
                                strokeWidth="8"
                                fill="none"
                                strokeDasharray={circumference}
                                strokeDashoffset={strokeDashoffset}
                                strokeLinecap="round"
                                className={progressColor}
                                transform="rotate(-90 144 144)"
                              />
                              {/* Center text */}
                              <text
                                x="144"
                                y="144"
                                textAnchor="middle"
                                dominantBaseline="middle"
                                className={`text-9xl font-semibold font-serif tracking-tight fill-current ${textColor}`}
                              >
                                {grade}
                              </text>
                            </svg>
                          </div>
                          <p className="text-muted-foreground mt-4 text-xl font-medium">
                            Overall score
                          </p>
                        </>
                      );
                    })()}
                </motion.div>

                {/* Right Column - Recommendations */}
                <motion.div
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.6, delay: 0.3 }}
                >
                  <div className="h-fit">
                    <div className="mb-3 flex items-center gap-2">
                      <Info className="h-4 w-4 text-primary" />
                      <h2 className="text-base font-semibold text-foreground">
                        Recommendations
                      </h2>
                    </div>
                    <div className="max-h-96 overflow-y-auto space-y-2 pr-1">
                      {analysis.suggestions.map((suggestion, index) => (
                        <motion.div
                          key={index}
                          className="flex items-start gap-2 px-3 py-2 rounded-xl bg-muted/60 border border-border/60"
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{
                            duration: 0.25,
                            delay: 0.15 + index * 0.04,
                          }}
                        >
                          <div className="mt-1 h-1.5 w-1.5 rounded-full bg-primary" />
                          <p className="text-xs leading-relaxed text-muted-foreground">
                            {suggestion}
                          </p>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              </div>
            </>
          )}

          {activeTab === "structure" && (
            <div className="space-y-6">
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold">
                  Speech Structure Timeline
                </h2>
                <div className="flex items-center gap-4">
                  <span className="text-sm text-muted-foreground">
                    {formatTime(currentTime)} /{" "}
                    {formatTime(duration || analysis?.durationSeconds || 0)}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={togglePlayPause}
                    className="flex items-center gap-2"
                  >
                    {isPlaying ? (
                      <Pause className="h-4 w-4" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                    {isPlaying ? "Pause" : "Play"}
                  </Button>
                </div>
              </div>

              {/* Horizontal Timeline */}
              <div className="relative">
                {/* Timeline track */}
                <div
                  className="relative h-2 bg-muted rounded-full cursor-pointer"
                  onClick={handleTimelineClick}
                >
                  {/* Progress bar */}
                  <div
                    className="absolute top-0 left-0 h-full bg-gray-300 rounded-full transition-all duration-200"
                    style={{
                      width: `${
                        (duration || analysis?.durationSeconds || 0) > 0
                          ? (currentTime /
                              (duration || analysis?.durationSeconds || 1)) *
                            100
                          : 0
                      }%`,
                    }}
                  />

                  {/* Segment markers */}
                  {analysis.speechSegments.map((segment, index) => {
                    // Parse start and end times (assuming format like "0:15" or "1:23")
                    const parseTime = (timeStr: string) => {
                      const [mins, secs] = timeStr.split(":").map(Number);
                      return mins * 60 + secs;
                    };

                    const currentDuration =
                      duration || analysis.durationSeconds || 0;
                    const startTime = parseTime(segment.startTime);
                    const endTime = parseTime(segment.endTime);
                    const startPercent =
                      currentDuration > 0
                        ? (startTime / currentDuration) * 100
                        : 0;
                    const widthPercent =
                      currentDuration > 0
                        ? ((endTime - startTime) / currentDuration) * 100
                        : 0;

                    const getSegmentColor = (type: string) => {
                      switch (type) {
                        case "introduction":
                          return "bg-blue-500";
                        case "body":
                          return "bg-green-500";
                        case "transition":
                          return "bg-yellow-500";
                        case "conclusion":
                          return "bg-purple-500";
                        default:
                          return "bg-gray-500";
                      }
                    };

                    return (
                      <div
                        key={index}
                        className={`absolute top-0 h-full rounded-full opacity-80 ${getSegmentColor(
                          segment.type
                        )} cursor-pointer hover:opacity-100 transition-opacity`}
                        style={{
                          left: `${startPercent}%`,
                          width: `${Math.max(widthPercent, 0.5)}%`, // Minimum width for visibility
                        }}
                        title={`${segment.type}: ${segment.startTime} - ${segment.endTime} (Click to jump)`}
                        onClick={(e) => {
                          e.stopPropagation(); // Prevent timeline click
                          jumpToSegment(segment);
                        }}
                      />
                    );
                  })}
                </div>

                {/* Time markers */}
                <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                  <span>0:00</span>
                  <span>
                    {formatTime(duration || analysis?.durationSeconds || 0)}
                  </span>
                </div>
              </div>

              {/* Segment Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {analysis.speechSegments.map((segment, index) => {
                  const getSegmentColor = (type: string) => {
                    switch (type) {
                      case "introduction":
                        return "border-blue-200 bg-blue-50/50";
                      case "body":
                        return "border-green-200 bg-green-50/50";
                      case "transition":
                        return "border-yellow-200 bg-yellow-50/50";
                      case "conclusion":
                        return "border-purple-200 bg-purple-50/50";
                      default:
                        return "border-gray-200 bg-gray-50/50";
                    }
                  };

                  return (
                    <motion.div
                      key={index}
                      className={`border rounded-lg p-4 ${getSegmentColor(
                        segment.type
                      )} cursor-pointer hover:shadow-md transition-shadow`}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, delay: index * 0.1 }}
                      onClick={() => jumpToSegment(segment)}
                      title="Click to jump to this segment"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <span className="inline-block px-2 py-1 text-xs font-semibold rounded-full bg-primary/10 text-primary capitalize mb-2">
                            {segment.type}
                          </span>
                          <p className="text-sm text-muted-foreground font-mono">
                            {segment.startTime} - {segment.endTime}
                          </p>
                        </div>
                        <div
                          className={`text-lg font-bold ${getCoherenceColor(
                            segment.coherenceScore
                          )}`}
                        >
                          {segment.coherenceScore.toFixed(1)}/10
                        </div>
                      </div>
                      <p className="text-sm leading-relaxed">
                        {segment.content}
                      </p>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === "coherence" && (
            <div className="space-y-6">
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold">
                  Coherence & Tone Analysis
                </h2>
                <div className="flex items-center gap-4">
                  <span className="text-sm text-muted-foreground">
                    {formatTime(currentTime)} /{" "}
                    {formatTime(duration || analysis?.durationSeconds || 0)}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={togglePlayPause}
                    className="flex items-center gap-2"
                  >
                    {isPlaying ? (
                      <Pause className="h-4 w-4" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                    {isPlaying ? "Pause" : "Play"}
                  </Button>
                </div>
              </div>

              {/* Horizontal Timeline (coherence issues) */}
              <div className="relative">
                {/* Timeline track */}
                <div
                  className="relative h-2 bg-muted rounded-full cursor-pointer"
                  onClick={handleTimelineClick}
                >
                  {/* Progress bar */}
                  <div
                    className="absolute top-0 left-0 h-full bg-gray-300 rounded-full transition-all duration-200"
                    style={{
                      width: `${
                        (duration || analysis?.durationSeconds || 0) > 0
                          ? (currentTime /
                              (duration || analysis?.durationSeconds || 1)) *
                            100
                          : 0
                      }%`,
                    }}
                  />

                  {/* Coherence issue markers */}
                  {(analysis.coherenceIssues || []).map((issue, index) => {
                    const parseTime = (timeStr: string) => {
                      const [mins, secs] = timeStr.split(":").map(Number);
                      return mins * 60 + secs;
                    };

                    const currentDuration =
                      duration || analysis.durationSeconds || 0;
                    const startTimeStr = issue.startTime as string;
                    const endTimeStr = issue.endTime as string;
                    const startTimeSec = startTimeStr
                      ? parseTime(startTimeStr)
                      : 0;
                    const endTimeSec = endTimeStr
                      ? parseTime(endTimeStr)
                      : startTimeSec + 2; // default 2s
                    const startPercent =
                      currentDuration > 0
                        ? (startTimeSec / currentDuration) * 100
                        : 0;
                    const widthPercent =
                      currentDuration > 0
                        ? ((endTimeSec - startTimeSec) / currentDuration) * 100
                        : 0;

                    return (
                      <div
                        key={index}
                        className={`absolute top-0 h-full rounded-full opacity-90 bg-amber-500 cursor-pointer hover:opacity-100 transition-opacity`}
                        style={{
                          left: `${startPercent}%`,
                          width: `${Math.max(widthPercent, 0.5)}%`,
                        }}
                        title={`${issue.issue} ${issue.startTime || ""} - ${
                          issue.endTime || ""
                        } (${issue.severity})`}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (audioRef.current) {
                            audioRef.current.currentTime = startTimeSec;
                            setCurrentTime(startTimeSec);
                            if (!isPlaying) {
                              setIsPlaying(true);
                              audioRef.current.play();
                            }

                            // pause at endTime
                            setTimeout(() => {
                              if (
                                audioRef.current &&
                                audioRef.current.currentTime >= startTimeSec
                              ) {
                                audioRef.current.pause();
                                setIsPlaying(false);
                              }
                            }, (endTimeSec - startTimeSec) * 1000);
                          }
                        }}
                      />
                    );
                  })}
                </div>

                {/* Time markers */}
                <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                  <span>0:00</span>
                  <span>
                    {formatTime(duration || analysis?.durationSeconds || 0)}
                  </span>
                </div>
              </div>

              {/* Coherence Issues List */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {(analysis.coherenceIssues || []).length === 0 ? (
                  <div className="col-span-1 md:col-span-2 lg:col-span-3 text-sm text-muted-foreground">
                    No coherence issues detected.
                  </div>
                ) : (
                  (analysis.coherenceIssues || []).map((issue, index) => {
                    const parseTime = (timeStr: string) => {
                      const [mins, secs] = timeStr.split(":").map(Number);
                      return mins * 60 + secs;
                    };

                    const jumpToIssue = () => {
                      if (audioRef.current) {
                        const time = issue.startTime
                          ? parseTime(issue.startTime)
                          : 0;
                        const end = issue.endTime
                          ? parseTime(issue.endTime)
                          : time + 2;
                        audioRef.current.currentTime = time;
                        setCurrentTime(time);
                        if (!isPlaying) {
                          setIsPlaying(true);
                          audioRef.current.play();
                        }

                        // pause at end
                        setTimeout(() => {
                          if (audioRef.current) {
                            audioRef.current.pause();
                            setIsPlaying(false);
                          }
                        }, (end - time) * 1000);
                      }
                    };

                    const severityColor =
                      issue.severity === "high"
                        ? "bg-red-100 text-red-700"
                        : issue.severity === "medium"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-green-50 text-green-700";

                    return (
                      <motion.div
                        key={index}
                        className={`border rounded-lg p-4 cursor-pointer hover:shadow-md transition-shadow`}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: index * 0.04 }}
                        onClick={jumpToIssue}
                        title="Click to jump to this coherence issue"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <p className="font-semibold">{issue.issue}</p>
                            <p className="text-xs text-muted-foreground font-mono">
                              {issue.startTime} - {issue.endTime}
                            </p>
                          </div>
                          <div
                            className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${severityColor}`}
                          >
                            {issue.severity}
                          </div>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {issue.suggestion}
                        </p>
                      </motion.div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {activeTab === "pauses" && (
            <div className="space-y-6">
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold">Pause & Gap Analysis</h2>
                <div className="flex items-center gap-4">
                  <span className="text-sm text-muted-foreground">
                    {formatTime(currentTime)} /{" "}
                    {formatTime(duration || analysis?.durationSeconds || 0)}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={togglePlayPause}
                    className="flex items-center gap-2"
                  >
                    {isPlaying ? (
                      <Pause className="h-4 w-4" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                    {isPlaying ? "Pause" : "Play"}
                  </Button>
                </div>
              </div>

              {/* Horizontal Timeline */}
              <div className="relative">
                {/* Timeline track */}
                <div
                  className="relative h-2 bg-muted rounded-full cursor-pointer"
                  onClick={handleTimelineClick}
                >
                  {/* Progress bar */}
                  <div
                    className="absolute top-0 left-0 h-full bg-gray-300 rounded-full transition-all duration-200"
                    style={{
                      width: `${
                        (duration || analysis?.durationSeconds || 0) > 0
                          ? (currentTime /
                              (duration || analysis?.durationSeconds || 1)) *
                            100
                          : 0
                      }%`,
                    }}
                  />

                  {/* Pause markers */}
                  {(() => {
                    // Parse timestamp helper (assuming format like "0:15" or "1:23")
                    const parseTime = (timeStr: string) => {
                      const [mins, secs] = timeStr.split(":").map(Number);
                      return mins * 60 + secs;
                    };

                    const playPauseSegment = (gap: GapAnalysis) => {
                      if (audioRef.current) {
                        const time = parseTime(gap.timestamp);
                        audioRef.current.currentTime = time;
                        setCurrentTime(time);
                        setIsPlaying(true);
                        audioRef.current.play();

                        // Set up a timeout to pause after the gap duration
                        setTimeout(() => {
                          if (audioRef.current) {
                            audioRef.current.pause();
                            setIsPlaying(false);
                          }
                        }, gap.duration * 1000);
                      }
                    };

                    return analysis.gaps.map((gap, index) => {
                      const currentDuration =
                        duration || analysis.durationSeconds || 0;
                      const gapTime = parseTime(gap.timestamp);
                      const gapPercent =
                        currentDuration > 0
                          ? (gapTime / currentDuration) * 100
                          : 0;
                      const gapWidthPercent =
                        currentDuration > 0
                          ? (gap.duration / currentDuration) * 100
                          : 0;

                      const getGapColor = (type: string) => {
                        switch (type) {
                          case "short":
                            return "bg-green-500";
                          case "medium":
                            return "bg-blue-500";
                          case "long":
                            return "bg-yellow-500";
                          case "excessive":
                            return "bg-red-500";
                          default:
                            return "bg-gray-500";
                        }
                      };

                      return (
                        <div
                          key={index}
                          className={`absolute top-0 h-full rounded-full opacity-80 ${getGapColor(
                            gap.type
                          )} cursor-pointer hover:opacity-100 transition-opacity`}
                          style={{
                            left: `${gapPercent}%`,
                            width: `${Math.max(gapWidthPercent, 0.5)}%`, // Minimum width for visibility
                          }}
                          title={`${gap.type} pause: ${
                            gap.timestamp
                          } (${gap.duration.toFixed(2)}s)`}
                          onClick={(e) => {
                            e.stopPropagation(); // Prevent timeline click
                            playPauseSegment(gap);
                          }}
                        />
                      );
                    });
                  })()}
                </div>

                {/* Time markers */}
                <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                  <span>0:00</span>
                  <span>
                    {formatTime(duration || analysis?.durationSeconds || 0)}
                  </span>
                </div>
              </div>

              {/* Pause Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {(() => {
                  // Parse timestamp helper (assuming format like "0:15" or "1:23")
                  const parseTime = (timeStr: string) => {
                    const [mins, secs] = timeStr.split(":").map(Number);
                    return mins * 60 + secs;
                  };

                  const playPauseSegment = (gap: GapAnalysis) => {
                    if (audioRef.current) {
                      const time = parseTime(gap.timestamp);
                      audioRef.current.currentTime = time;
                      setCurrentTime(time);
                      setIsPlaying(true);
                      audioRef.current.play();

                      // Set up a timeout to pause after the gap duration
                      setTimeout(() => {
                        if (audioRef.current) {
                          audioRef.current.pause();
                          setIsPlaying(false);
                        }
                      }, gap.duration * 1000);
                    }
                  };

                  return analysis.gaps.map((gap, index) => (
                    <motion.div
                      key={index}
                      className={`border rounded-lg p-3 flex justify-between items-center ${getGapColor(
                        gap.type
                      )} cursor-pointer hover:shadow-md transition-shadow`}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.4, delay: index * 0.05 }}
                      onClick={() => playPauseSegment(gap)}
                      title="Click to play this pause segment"
                    >
                      <div>
                        <p className="font-semibold capitalize">
                          {gap.type} pause
                        </p>
                        <p className="text-xs">{gap.timestamp}</p>
                      </div>
                      <span className="text-lg font-bold">
                        {gap.duration.toFixed(2)}s
                      </span>
                    </motion.div>
                  ));
                })()}
              </div>
            </div>
          )}

          {activeTab === "filler" && (
            <div className="space-y-6">
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold">Filler Words Analysis</h2>
                <div className="flex items-center gap-4">
                  <span className="text-sm text-muted-foreground">
                    {formatTime(currentTime)} /{" "}
                    {formatTime(duration || analysis?.durationSeconds || 0)}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={togglePlayPause}
                    className="flex items-center gap-2"
                  >
                    {isPlaying ? (
                      <Pause className="h-4 w-4" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                    {isPlaying ? "Pause" : "Play"}
                  </Button>
                </div>
              </div>

              {/* Horizontal Timeline */}
              <div className="relative">
                {/* Timeline track */}
                <div
                  className="relative h-2 bg-muted rounded-full cursor-pointer"
                  onClick={handleTimelineClick}
                >
                  {/* Progress bar */}
                  <div
                    className="absolute top-0 left-0 h-full bg-gray-300 rounded-full transition-all duration-200"
                    style={{
                      width: `${
                        (duration || analysis?.durationSeconds || 0) > 0
                          ? (currentTime /
                              (duration || analysis?.durationSeconds || 1)) *
                            100
                          : 0
                      }%`,
                    }}
                  />

                  {/* Filler word markers */}
                  {analysis.fillerWords.map((filler, index) => {
                    // Parse timestamp (assuming format like "0:15" or "1:23")
                    const parseTime = (timeStr: string) => {
                      const [mins, secs] = timeStr.split(":").map(Number);
                      return mins * 60 + secs;
                    };

                    const currentDuration =
                      duration || analysis.durationSeconds || 0;
                    const fillerTime = parseTime(filler.timestamp);
                    const fillerPercent =
                      currentDuration > 0
                        ? (fillerTime / currentDuration) * 100
                        : 0;

                    return (
                      <div
                        key={index}
                        className="absolute top-0 h-full w-1 bg-red-500 rounded-full opacity-80 cursor-pointer hover:opacity-100 transition-opacity"
                        style={{
                          left: `${fillerPercent}%`,
                        }}
                        title={`"${filler.word}" at ${filler.timestamp} (${filler.count} times)`}
                        onClick={(e) => {
                          e.stopPropagation(); // Prevent timeline click
                          if (audioRef.current) {
                            audioRef.current.currentTime = fillerTime;
                            setCurrentTime(fillerTime);
                            if (!isPlaying) {
                              setIsPlaying(true);
                              audioRef.current.play();
                            }
                          }
                        }}
                      />
                    );
                  })}
                </div>

                {/* Time markers */}
                <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                  <span>0:00</span>
                  <span>
                    {formatTime(duration || analysis?.durationSeconds || 0)}
                  </span>
                </div>
              </div>

              {/* Filler Words Grid */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
              >
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
                      Your speech is free of filler words. This creates a clean,
                      professional delivery that keeps your audience engaged.
                    </p>
                  </motion.div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {analysis.fillerWords.map((filler, index) => {
                      // Parse timestamp (assuming format like "0:15" or "1:23")
                      const parseTime = (timeStr: string) => {
                        const [mins, secs] = timeStr.split(":").map(Number);
                        return mins * 60 + secs;
                      };

                      const jumpToFiller = () => {
                        if (audioRef.current) {
                          const time = parseTime(filler.timestamp);
                          audioRef.current.currentTime = time;
                          setCurrentTime(time);
                          if (!isPlaying) {
                            setIsPlaying(true);
                            audioRef.current.play();
                          }
                        }
                      };

                      return (
                        <motion.div
                          key={index}
                          className="border rounded-lg p-3 flex justify-between items-center cursor-pointer hover:shadow-md transition-shadow"
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ duration: 0.3, delay: index * 0.05 }}
                          onClick={jumpToFiller}
                          title="Click to jump to this filler word"
                        >
                          <div>
                            <p className="font-semibold">"{filler.word}"</p>
                            <p className="text-xs text-muted-foreground">
                              {filler.timestamp}
                            </p>
                          </div>
                          <span className="text-lg font-bold text-muted-foreground">
                            ×{filler.count}
                          </span>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            </div>
          )}

          {activeTab === "transcript" && (
            <div className="space-y-6">
              {/* Header (same style as other tabs) */}
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold">Transcript</h2>
                <div className="flex items-center gap-4">
                  <span className="text-sm text-muted-foreground">
                    {formatTime(currentTime)} / {formatTime(duration || analysis?.durationSeconds || 0)}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={togglePlayPause}
                    className="flex items-center gap-2"
                  >
                    {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    {isPlaying ? "Pause" : "Play"}
                  </Button>
                </div>
              </div>

              {/* Timeline (matches other tabs visually) */}
              {analysis.timestampedTranscript && analysis.timestampedTranscript.length > 0 && (
                <div className="mb-4">
                  <div
                    className="relative h-2 bg-muted rounded-full cursor-pointer"
                    onClick={handleTimelineClick}
                  >
                    <div
                      className="absolute top-0 left-0 h-full bg-gray-300 rounded-full transition-all duration-200"
                      style={{ width: `${(duration || analysis?.durationSeconds || 0) > 0 ? (currentTime / (duration || analysis?.durationSeconds || 1)) * 100 : 0}%` }}
                    />

                    {analysis.timestampedTranscript.map((seg, idx) => {
                      const start = parseTimestamp(seg.startTime);
                      const end = parseTimestamp(seg.endTime);
                      const currentDuration = duration || analysis.durationSeconds || 0;
                      const leftPercent = currentDuration > 0 ? (start / currentDuration) * 100 : 0;
                      const widthPercent = currentDuration > 0 ? ((end - start) / currentDuration) * 100 : 0;
                      return (
                        <div
                          key={idx}
                          className="absolute top-0 h-full rounded-full opacity-90 bg-sky-500 cursor-pointer hover:opacity-100 transition-opacity"
                          style={{ left: `${leftPercent}%`, width: `${Math.max(widthPercent, 0.5)}%` }}
                          title={`${seg.startTime} - ${seg.endTime}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            jumpToTranscriptSegment(seg);
                          }}
                        />
                      );
                    })}
                  </div>
                  <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                    <span>0:00</span>
                    <span>{formatTime(duration || analysis?.durationSeconds || 0)}</span>
                  </div>
                </div>
              )}

              {/* Transcript list (no card background) */}
              <div className="max-h-96 overflow-y-auto">
                <div className="space-y-2">
                  {analysis.timestampedTranscript && analysis.timestampedTranscript.length > 0
                    ? analysis.timestampedTranscript.map((seg, index) => (
                        <motion.div
                          key={index}
                          className="p-2 rounded hover:bg-muted/10 cursor-pointer"
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{
                            duration: 0.25,
                            delay: index * 0.02,
                          }}
                          onClick={() => jumpToTranscriptSegment(seg)}
                          title={`Jump to ${seg.startTime}`}
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-mono text-muted-foreground">{seg.startTime}</span>
                            <p className="text-sm leading-relaxed">{seg.text.trim()}</p>
                          </div>
                        </motion.div>
                      ))
                    : analysis.transcript
                        .split(/[.!?]+/)
                        .filter((sentence) => sentence.trim().length > 0)
                        .map((sentence, index) => (
                          <motion.p
                            key={index}
                            className="text-sm leading-relaxed"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{
                              duration: 0.3,
                              delay: index * 0.03,
                            }}
                          >
                            {sentence.trim()}.
                          </motion.p>
                        ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
