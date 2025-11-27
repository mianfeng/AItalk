import { Scenario } from './types';

// Retaining these for potential "Free Play" mode if re-added later, 
// but currently the Daily Logic overrides the static scenario list.
export const SCENARIOS: Scenario[] = [
  {
    id: 'vocab-builder',
    title: 'Daily Vocab Builder',
    description: 'Expand your vocabulary.',
    icon: '📚',
    systemInstruction: ''
  }
];

export const MODEL_NAME = 'gemini-2.5-flash-native-audio-preview-09-2025';