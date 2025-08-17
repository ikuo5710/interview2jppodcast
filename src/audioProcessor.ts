import { GoogleGenAI, type SpeechConfig } from '@google/genai';
import wav from 'wav';

const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
if (!apiKey) {
  throw new Error('GOOGLE_GENERATIVE_AI_API_KEY is not set in the environment variables.');
}

const genAI = new GoogleGenAI({ apiKey });
// 使用モデルは環境変数で上書き可能
// 推奨の公開 API 対応 TTS モデル（ドキュメント準拠）
const TTS_MODEL = process.env.GOOGLE_GENAI_TTS_MODEL || 'gemini-2.5-flash-preview-tts';

async function saveWaveFile(
  filename: string,
  pcmData: Buffer,
  channels = 1,
  rate = 24000,
  sampleWidth = 2,
) {
  return new Promise((resolve, reject) => {
    const writer = new wav.FileWriter(filename, {
      channels,
      sampleRate: rate,
      bitDepth: sampleWidth * 8,
    });

    writer.on('finish', resolve);
    writer.on('error', reject);

    writer.write(pcmData);
    writer.end();
  });
}

export async function processAudio(chunk: string, outputFilePath: string): Promise<void> {
  console.log(`音声化を開始します: ${outputFilePath}`);
  const prompt = `以下の日本語テキストを、自然で聞きやすいポッドキャスト風の話し方で読み上げてください。

--- text start ---
${chunk}
--- text end ---`;

  const voiceSpeaker1 = process.env.VOICE_SPEAKER_1 || 'Charon';
  const voiceSpeaker2 = process.env.VOICE_SPEAKER_2 || 'Leda';

  // Try 1: 指定モデル + generationConfig.responseMimeType = 'audio/mpeg'
  try {
    const res = await genAI.models.generateContent({
      model: TTS_MODEL,
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          multiSpeakerVoiceConfig: {
            speakerVoiceConfigs: [
              {
                speaker: 'Speaker 1',
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: voiceSpeaker1 }
                }
              },
              {
                speaker: 'Speaker 2',
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: voiceSpeaker2 }
                }
              }
            ]
          }
        } satisfies SpeechConfig,
      }
    } as any);
    const audioContent = res.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (audioContent) {
      const audioBuffer = Buffer.from(audioContent, 'base64');
      await saveWaveFile(outputFilePath, audioBuffer)
      console.log(`音声化が完了しました: ${outputFilePath}`);
      return;
    }
    throw new Error('音声データを取得できませんでした(Try1)。');
  } catch (e: any) {
    console.warn(`失敗 (${TTS_MODEL} ): ${e?.message || e}`);
  }

}
