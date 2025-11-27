import { GoogleGenAI, Type } from "@google/genai";
import { StudyItem } from "../types";

export async function generateDailyContent(count: number = 5): Promise<StudyItem[]> {
  const client = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  const model = "gemini-2.5-flash";
  
  const prompt = `Generate ${count} distinct, high-frequency English oral expressions, idioms, or useful sentences for a learner who wants to sound native in daily casual and professional settings. 
  Mix between single words/idioms (type='word') and full sentences (type='sentence').
  Provide a clear, simple English definition and one usage example.
  Focus on: Office small talk, expressing opinions, and modern daily life slang.`;

  try {
    const response = await client.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              text: { type: Type.STRING, description: "The word, idiom, or sentence" },
              definition: { type: Type.STRING, description: "Simple explanation in English" },
              example: { type: Type.STRING, description: "A sentence using the term" },
              type: { type: Type.STRING, enum: ["word", "sentence", "idiom"] },
              pronunciation: { type: Type.STRING, description: "IPA or simple phonetic spelling" }
            },
            required: ["text", "definition", "example", "type"]
          }
        }
      }
    });

    if (response.text) {
      const data = JSON.parse(response.text);
      return data.map((item: any) => ({
        ...item,
        id: Math.random().toString(36).substr(2, 9)
      }));
    }
    return [];
  } catch (error) {
    console.error("Failed to generate content", error);
    // Fallback content if API fails
    return [
        { id: '1', text: 'touch base', type: 'idiom', definition: 'To briefly contact someone', example: 'Let’s touch base later today.', pronunciation: '/tʌtʃ beɪs/' },
        { id: '2', text: 'call it a day', type: 'idiom', definition: 'Stop working for the day', example: 'I’m tired, let’s call it a day.', pronunciation: '/kɔːl ɪt ə deɪ/' },
    ];
  }
}