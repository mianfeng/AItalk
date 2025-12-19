
export type ItemType = 'word' | 'sentence' | 'idiom';

export interface StudyItem {
  id: string;
  text: string;
  translation: string; // Chinese translation
  definition: string;
  example: string;
  example_zh?: string; // New: Chinese translation of the example
  type: ItemType;
  pronunciation?: string;
  extra_info?: string; // New: Origin, word usage notes, or synonyms
  saved?: boolean; // New: Whether the user has collected/bookmarked this item
  masteryLevel?: number; // New: Display current familiarity level (0-5)
}

export interface PracticeExercise {
  word: string;
  sentence: string; // Original sentence for study
  sentenceZh: string; // Chinese translation
  quizQuestion: string; // Question with a blank (e.g., "I feel very ___ today.")
  options: string[]; // 4 multiple choice options
  correctAnswer: string;
  explanation: string; // Why this word fits
}

export interface VocabularyItem extends StudyItem {
  addedAt: number;
  nextReviewAt: number;
  masteryLevel: number; // 0-5
  lastReviewed?: number; // Timestamp of the last review session
}

export interface DailyStats {
  date: string;
  itemsLearned: number;
  completedSpeaking: boolean;
}

// ... existing types remain the same
export interface SessionResult {
    item: StudyItem;
    remembered: boolean;
}

export interface Scenario {
  id: string;
  title: string;
  description: string;
  icon: string;
  systemInstruction: string;
}

export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ERROR = 'error',
}

export interface Feedback {
  original: string;
  better: string;
  analysis: string;
  chunks: string[];
}

export interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
  feedback?: Feedback;
}

export interface ConversationSession {
  topic: string;
  history: {user: string, ai: string}[];
  targetWords: VocabularyItem[];
  lastUpdated: number;
}

/**
 * Fix: Added missing AnalysisResult interface used for AI audio analysis feedback.
 */
export interface AnalysisResult {
  userTranscript: string;
  betterVersion: string;
  analysis: string;
  pronunciation: string;
  chunks: string[];
  score: number;
  replyText: string;
}

/**
 * Fix: Added missing DailyQuoteItem interface used for the daily quote feature.
 */
export interface DailyQuoteItem {
  english: string;
  chinese: string;
  source: string;
}

/**
 * Fix: Added missing BackupData interface used for exporting and importing application data.
 */
export interface BackupData {
  vocabList: VocabularyItem[];
  dailyStats: DailyStats;
  timestamp: number;
  version: number;
}
