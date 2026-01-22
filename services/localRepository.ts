import { StudyItem, ItemType } from "../types";
import { RAW_SLANG_DATA } from "./data/slangData";
import { RAW_ACADEMIC_DATA } from "./data/academicData";

/**
 * 强大的文本清洗工具：剔除单词末尾可能的字母后缀或重复标记
 * 同时处理短语中的省略号，使其与用户输入或AI生成的标准文本兼容
 * 例如："K-drama k" -> "K-drama"
 *      "run…into the ground" -> "run into the ground"
 */
function cleanText(text: string): string {
  if (!text) return "";
  return text
    // Replace ellipses and dots with space to handle "run...into" vs "run into"
    .replace(/[…\.]+/g, ' ') 
    .replace(/\s+/g, ' ')    // Collapse multiple spaces
    .replace(/\s+[A-Z]\s+.*$/i, '') // 匹配 " S scale" 这种模式
    .replace(/\s+[a-z]$/, '')       // 匹配 " k" 这种模式
    .trim();
}

function parseSlangItem(item: any): StudyItem {
  const cleanedText = cleanText(item.text);
  return {
    id: `local-slang-${Math.random().toString(36).substr(2, 9)}`,
    text: cleanedText,
    translation: item.translation,
    definition: item.definition || item.translation,
    example: item.example || "No example provided.",
    type: cleanedText.includes(' ') ? 'idiom' : 'word',
    pronunciation: item.pronunciation,
    extra_info: "来源: 生活俚语库",
    saved: false,
    masteryLevel: 0
  };
}

function parseAcademicItem(item: any): StudyItem {
  let pronunciation = "";
  let translation = item.definition;

  const ipaMatch = item.definition.match(/\[(.*?)\]/);
  if (ipaMatch) {
    pronunciation = `/${ipaMatch[1]}/`;
  }

  translation = translation
    .replace(/__.*?__/g, '')
    .replace(/\[.*?\]/g, '')
    .trim();
  
  translation = translation.replace(/^[a-z]+\.\s*/, '');

  return {
    id: `local-acad-${Math.random().toString(36).substr(2, 9)}`,
    text: item.text,
    translation: translation,
    definition: "",
    example: item.example || "No example provided.",
    type: 'word',
    pronunciation: pronunciation,
    extra_info: "来源: 学术词库",
    saved: false,
    masteryLevel: 0
  };
}

const ALL_LOCAL_ITEMS: StudyItem[] = [
  ...RAW_SLANG_DATA.map(parseSlangItem),
  ...RAW_ACADEMIC_DATA.map(parseAcademicItem)
];

export function getTotalLocalItemsCount(): number {
  return ALL_LOCAL_ITEMS.length;
}

export function getLocalContent(count: number, existingTexts: Set<string>, typePreference?: 'word' | 'sentence'): StudyItem[] {
  let available = ALL_LOCAL_ITEMS.filter(item => !existingTexts.has(item.text));

  if (typePreference) {
      if (typePreference === 'word') {
          available = available.filter(item => item.type === 'word');
      } else {
          available = available.filter(item => item.type === 'sentence' || item.type === 'idiom');
      }
  }

  const shuffled = available.sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}