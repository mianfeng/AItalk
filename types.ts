export interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
  feedback?: Feedback; // Optional feedback attached to a model's turn
}

export interface Feedback {
  original: string;
  better: string;
  analysis: string;
  chunks: string[];
}

export type ItemType = 'word' | 'sentence' | 'idiom';

export interface StudyItem {
  id: string;
  text: string;
  translation: string; // Chinese translation
  definition: string;
  example: string;
  type: ItemType;
  pronunciation?: string;
}

export interface VocabularyItem extends StudyItem {
  addedAt: number;
  nextReviewAt: number;
  masteryLevel: number; // 0-5
  lastReviewed?: number; // Timestamp of the last review session
}

export interface Scenario {
  id: string;
  title: string;
  description: string;
  icon: string;
  systemInstruction: string;
}

export enum ConnectionState {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  ERROR = 'ERROR',
}

export interface DailyStats {
  date: string;
  itemsLearned: number;
  completedSpeaking: boolean;
}

// New Types for Turn-Based Conversation
export interface AnalysisResult {
  userTranscript: string;
  betterVersion: string;
  analysis: string; // Chinese explanation
  score: number; // 1-100
  replyText: string; // AI's response to continue conversation
}

export interface DailyQuoteItem {
  english: string;
  chinese: string;
  source: string; // e.g., "Friends S01E02" or "The Great Gatsby"
}