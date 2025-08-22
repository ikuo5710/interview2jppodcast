import 'dotenv/config';
import { processTranscript } from './transcriptProcessor';
import { processWithGraphAI } from './graphaiProcessor';
import { combineAudioChunks } from './audioCombiner';
import * as path from 'path';
import * as fs from 'fs/promises';

async function run() {
  const args = process.argv.slice(2);
  const useStdin = args.includes('--stdin');

  let inputFilePath: string;
  if (useStdin) {
    console.log('標準入力からトランスクリプトを読み込みます。入力終了は Ctrl+D (Unix) / Ctrl+Z, Enter (Windows)。');
    const stdinChunks: Buffer[] = [];
    await new Promise<void>((resolve) => {
      process.stdin.on('data', (chunk) => stdinChunks.push(Buffer.from(chunk)));
      process.stdin.on('end', () => resolve());
    });
    const transcriptText = Buffer.concat(stdinChunks).toString('utf-8');
    if (!transcriptText.trim()) {
      console.error('標準入力から内容が読み取れませんでした。');
      process.exit(1);
    }
    const tmpBase = `stdin_transcript_${Date.now()}.txt`;
    inputFilePath = path.resolve(process.cwd(), tmpBase);
    await fs.writeFile(inputFilePath, transcriptText, 'utf-8');
    console.log(`一時入力ファイルを作成しました: ${inputFilePath}`);
  } else {
    const positional = args.filter(a => !a.startsWith('--'));
    if (positional.length !== 1) {
      console.error('使用法: node dist/main.js <トランスクリプトファイルのパス> または --stdin');
      process.exit(1);
    }
    inputFilePath = positional[0];
  }

  const baseName = path.basename(inputFilePath, path.extname(inputFilePath));
  const outputDir = path.dirname(inputFilePath);
  const processedTextPath = path.join(outputDir, `${baseName}.processed.txt`);
  const audioOutputDir = path.join(outputDir, 'audio_output');
  const finalOutputFilePath = path.join(process.cwd(), 'podcast.m4a');
  const bgmPath = process.env.BGM_PATH;

  try {
    if (bgmPath) {
      await fs.access(bgmPath);
      console.log(`BGMファイルを使用します: ${bgmPath}`);
    }

    await processTranscript(inputFilePath, processedTextPath);
    console.log('テキスト処理が完了しました。');

    console.log('GraphAIによる音声化処理を開始します...');
    const processedTranscript = await fs.readFile(processedTextPath, 'utf-8');
    await processWithGraphAI(processedTranscript, audioOutputDir, bgmPath);

  } catch (error) {
    console.error('メイン処理でエラーが発生しました。', error);
    process.exit(1);
  }
}

run();

