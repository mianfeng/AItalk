export interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}

export type ItemType = 'word' | 'sentence' | 'idiom';

export interface StudyItem {
  id: string;
  text: string;
  definition: string;
  example: string;
  type: ItemType;
  pronunciation?: string;
}

export interface VocabularyItem extends StudyItem {
  addedAt: number;
  nextReviewAt: number;
  masteryLevel: number; // 0-5
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