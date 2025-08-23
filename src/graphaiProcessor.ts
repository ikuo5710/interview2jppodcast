import { GraphAI, GraphData, StaticNodeData, AgentFunctionInfo } from 'graphai';
import * as agents from '@graphai/agents';
import * as path from 'path';
import * as fs from 'fs';
import { processAudio } from './audioProcessor';
import { combineAudioChunks } from './audioCombiner';

// 1分待機するヘルパー関数
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// テキストを20行ごとのチャンクに分割する関数
const chunkTranscript = (transcript: string, linesPerChunk = 20): string[] => {
  const lines = transcript.split('\n');
  const chunks: string[] = [];
  for (let i = 0; i < lines.length; i += linesPerChunk) {
    chunks.push(lines.slice(i, i + linesPerChunk).join('\n'));
  }
  console.log(`${chunks.length}個のチャンクに分割しました。`);
  return chunks;
};

// 各チャンクを音声化するGraphAIエージェントの定義
const synthesizeSpeechAgentInfo: AgentFunctionInfo = {
  name: "synthesizeSpeechAgent",
  agent: async ({ namedInputs }: { namedInputs: { chunk: string, index: number, outputDir: string } }) => {
    const { chunk, index, outputDir } = namedInputs;
    const numericIndex = Number(index);
    if (!chunk || chunk.trim() === '') {
      console.log(`チャンク ${numericIndex + 1} は空なのでスキップします。`);
      return null;
    }
    const outputFilePath = path.join(outputDir, `chunk_${numericIndex + 1}.wav`);
    await processAudio(chunk, outputFilePath);
    return outputFilePath;
  },
  mock: async () => "mocked_path",
  inputs: {
    type: "object",
    properties: {
      chunk: { type: "string", description: "The text chunk to synthesize" },
      index: { type: "number", description: "The index of the chunk" },
      outputDir: { type: "string", description: "The output directory for the audio file" },
    }
  },
  output: {
    type: "string",
    description: "The path to the generated audio file"
  },
  samples: [],
  description: "Synthesizes speech from a text chunk and saves it as a .wav file.",
  category: ["tts"],
  author: "Gemini",
  repository: "-",
  license: "MIT",
};

// GraphAIのグラフ定義
const graphDefinition = (audioOutputDir: string, concurrency: number): GraphData => ({
  version: 0.5,
  concurrency,
  nodes: {
    rows: { value: [] },
    index: { value: [] },
    outputDir: { value: audioOutputDir },
    audioFiles: {
      agent: 'mapAgent',
      inputs: {
        rows: ":rows",
        index: ":index",
        outputDir: ":outputDir",
      },
      params: {
        expandKeys: ["index"]
      },
      graph: {
        nodes: {
          synthesisNode: {
            agent: "synthesizeSpeechAgent",
            inputs: {
              chunk: ":row",
              index: ":index",
              outputDir: ":outputDir"
            }
          }
        },
      },
    },
  },
});

/**
 * GraphAIを使ってトランスクリプトのチャンクを並列で音声化する
 * @param transcript 処理済みトランスクリプト
 * @param audioOutputDir 音声ファイルの出力先ディレクトリ
 */
export async function processWithGraphAI(transcript: string, audioOutputDir: string, bgmPath?: string, linesPerChunk = 20, concurrency = 10) {
  const allChunks = chunkTranscript(transcript, linesPerChunk);
  const batchSize = 10;

  const allAgents = { ...agents, synthesizeSpeechAgent: synthesizeSpeechAgentInfo };

  for (let i = 0; i < allChunks.length; i += batchSize) {
    const batchChunks = allChunks.slice(i, i + batchSize);
    const batchIndices = batchChunks.map((_, j) => i + j);
    console.log(`バッチ ${Math.floor(i / batchSize) + 1} の処理を開始します。対象チャンク: ${i + 1} から ${i + batchChunks.length}`);

    const graphData = graphDefinition(audioOutputDir, concurrency);

    (graphData.nodes.rows as StaticNodeData).value = batchChunks;
    (graphData.nodes.index as StaticNodeData).value = batchIndices;

    const graph = new GraphAI(graphData, allAgents);

    try {
      await graph.run();
      console.log(`バッチ ${Math.floor(i / batchSize) + 1} の音声化が完了しました。`);
    } catch (error) {
      console.error(`バッチ ${Math.floor(i / batchSize) + 1} の処理中にエラーが発生しました。`, error);
    }

    if (i + batchSize < allChunks.length) {
      console.log('Geminiのレートリミットを考慮し、60秒間待機します...');
      await sleep(60000);
    }
  }

  console.log('すべてのバッチ処理が完了しました。');

  // すべての音声ファイルが生成されているか確認
  const allFilesExist = allChunks.every((_, index) => {
    const outputFilePath = path.join(audioOutputDir, `chunk_${index + 1}.wav`);
    return fs.existsSync(outputFilePath);
  });

  if (allFilesExist) {
    console.log('すべての音声ファイルの存在を確認しました。結合処理を開始します。');
    const finalAudioPath = path.join(process.cwd(), 'final_podcast.m4a');
    await combineAudioChunks(audioOutputDir, finalAudioPath, bgmPath);
    console.log(`最終的なポッドキャストファイルを生成しました: ${finalAudioPath}`);
  } else {
    console.log('一部の音声ファイルが不足しているため、結合処理をスキップしました。');
  }
}