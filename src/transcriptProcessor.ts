import * as fs from 'fs/promises';
import { GoogleGenAI } from '@google/genai';

// APIキーを環境変数から取得
const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
if (!apiKey) {
  throw new Error('GOOGLE_GENERATIVE_AI_API_KEY is not set in the environment variables.');
}

const genAI = new GoogleGenAI({ apiKey });
// 使用モデルは環境変数で上書き可能
const TEXT_MODEL = process.env.GOOGLE_GENAI_TEXT_MODEL || 'gemini-2.5-flash-lite';

async function callGeminiApi(transcript: string): Promise<string> {
  console.log('Gemini APIを呼び出し中...');

  const prompt = `以下のインタビューのトランスクリプトを日本語に翻訳した上で話者分離してください。登場人物は二人です。一人目の発言には接頭辞としてSpeaker 1: 、二人目の発言には接頭辞としてSpeaker 2: をつけてください。なお、回答には日本語訳済の話者分離したトランスクリプトのみを記載してください。

--- transcript start ---
${transcript}
--- transcript end ---`;

  try {
    const result = await genAI.models.generateContent({
      model: TEXT_MODEL,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });
    const text = result.text ?? '';
    if (!text.trim()) throw new Error('空の応答を受信しました。');
    console.log('Gemini API処理完了。');
    return text;
  } catch (error: any) {
    console.error('Gemini API呼び出しエラー');
    console.error(`model=${TEXT_MODEL}`);
    console.error(error?.message || error);
    throw error;
  }
}

export async function processTranscript(inputFilePath: string, outputFilePath: string): Promise<void> {
  try {
    console.log(`トランスクリプトファイルを読み込んでいます: ${inputFilePath}`);
    const transcript = await fs.readFile(inputFilePath, 'utf-8');
    console.log('読み込み完了。');

    const processedText = await callGeminiApi(transcript);

    console.log(`処理結果をファイルに書き込んでいます: ${outputFilePath}`);
    await fs.writeFile(outputFilePath, processedText);
    console.log('書き込み完了。');

  } catch (error) {
    console.error('処理中にエラーが発生しました:', error);
    throw error;
  }
}
