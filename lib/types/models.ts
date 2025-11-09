import type { Document } from "mongodb";

export interface ProjectDocument extends Document {
  _id: string;
  name: string;
  description: string | null;
  vibe: string | null;
  strict: boolean;
  timeframe: number;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AudioUploadDocument extends Document {
  _id: string;
  userId: string;
  projectId: string | null;
  fileName: string;
  fileData: string;
  fileHash: string;
  createdAt: Date;
}

export interface AudioAnalysisDocument extends Document {
  _id: string;
  uploadId: string;
  transcript: string;
  durationSeconds: number;
  wordCount: number;
  wpm: number;
  fillerWords: unknown;
  totalFillerWords: number;
  gaps: unknown;
  averageGapDuration: number;
  speechSegments: unknown;
  sentenceIssues: unknown;
  timestampedTranscript?: unknown;
  overallCoherenceScore: number;
  suggestions: unknown;
  performance: PerformanceMetrics | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PerformanceFactorScores {
  time: number;
  coherence: number;
  filler: number;
  pauses: number;
}

export interface PerformanceDetails {
  timeGoalSeconds: number | null;
  timeDeltaSeconds: number | null;
  fillerPercentage: number;
  longPauseCount: number;
  wordsPerMinute: number;
  averageGapDuration: number;
}

export interface PerformanceMetrics {
  overallGrade: number;
  factorScores: PerformanceFactorScores;
  details: PerformanceDetails;
}
