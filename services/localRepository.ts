import { StudyItem, ItemType } from "../types";
import { RAW_SLANG_DATA } from "./data/slangData";
import { RAW_ACADEMIC_DATA } from "./data/academicData";

/**
 * Parsers
 */

function parseSlangItem(item: any): StudyItem {
  return {
    id: `local-slang-${Math.random().toString(36).substr(2, 9)}`,
    text: item.text,
    translation: item.translation,
    definition: item.definition || item.translation,
    example: "No example provided.", // Slang dataset might lack examples
    type: item.text.includes(' ') ? 'idiom' : 'word', // Simple heuristic, can be refined
    pronunciation: item.pronunciation,
    extra_info: "来源: 生活俚语库",
    saved: false,
    masteryLevel: 0
  };
}

function parseAcademicItem(item: any): StudyItem {
  // Parsing logic for: "__emperor__ [ˈempərə(r)] n. 皇帝；君主"
  let pronunciation = "";
  let translation = item.definition;
  let definition = item.definition;

  // 1. Extract IPA found in []
  const ipaMatch = item.definition.match(/\[(.*?)\]/);
  if (ipaMatch) {
    pronunciation = `/${ipaMatch[1]}/`;
  }

  // 2. Clean translation: 
  // Remove __word__, remove [ipa], remove part of speech (n. v. adj. etc at the start)
  translation = translation
    .replace(/__.*?__/g, '') // Remove __word__
    .replace(/\[.*?\]/g, '') // Remove [ipa]
    .trim();
  
  // Try to remove part of speech (e.g., "n. ", "vt. ", "a. ") if present at start
  translation = translation.replace(/^[a-z]+\.\s*/, '');

  return {
    id: `local-acad-${Math.random().toString(36).substr(2, 9)}`,
    text: item.text,
    translation: translation,
    definition: "", // Academic def is often just translation in the raw data, clearing to avoid duplication in UI
    example: item.example || "No example provided.",
    type: 'word',
    pronunciation: pronunciation,
    extra_info: "来源: 学术词库",
    saved: false,
    masteryLevel: 0
  };
}

// Unified Repository
const ALL_LOCAL_ITEMS: StudyItem[] = [
  ...RAW_SLANG_DATA.map(parseSlangItem),
  ...RAW_ACADEMIC_DATA.map(parseAcademicItem)
];

/**
 * Get total number of items available in the local repository.
 */
export function getTotalLocalItemsCount(): number {
  return ALL_LOCAL_ITEMS.length;
}

/**
 * Get random items from local repository, excluding already learned ones.
 * Supports requesting specific count by type.
 */
export function getLocalContent(count: number, existingTexts: Set<string>, typePreference?: 'word' | 'sentence'): StudyItem[] {
  // 1. Filter out duplicates (words user has already saved)
  let available = ALL_LOCAL_ITEMS.filter(item => !existingTexts.has(item.text));

  // 2. Filter by type if requested
  if (typePreference) {
      if (typePreference === 'word') {
          available = available.filter(item => item.type === 'word');
      } else {
          available = available.filter(item => item.type === 'sentence' || item.type === 'idiom');
      }
  }

  // 3. Shuffle
  const shuffled = available.sort(() => 0.5 - Math.random());

  // 4. Slice
  return shuffled.slice(0, count);
}