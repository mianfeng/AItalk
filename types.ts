
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
  targetWords: string[]; // The 3 words being tested
  targetWordPronunciations?: string[]; // New: Standard IPA for the words
  sentence: string; // Full correct sentence
  sentenceZh: string; 
  quizQuestion: string; // Sentence with 3 blanks (____)
  options: string[]; // Pool of options (correct words + distractors)
  correctAnswers: string[]; // Ordered list of the 3 correct words
  explanation: string; 
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
  itemsReviewed: number;
  completedSpeaking: boolean;
}

export interface StatsHistory {
  [date: string]: DailyStats;
}

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

export interface AnalysisResult {
  userTranscript: string;
  betterVersion: string;
  analysis: string;
  pronunciation: string;
  chunks: string[];
  score: number;
  replyText: string;
}

export interface DailyQuoteItem {
  english: string;
  chinese: string;
  source: string;
}

export interface BackupData {
  vocabList: VocabularyItem[];
  dailyStats: DailyStats;
  timestamp: number;
  version: number;
}
