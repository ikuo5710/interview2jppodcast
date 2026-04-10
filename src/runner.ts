import 'dotenv/config';
import { processTranscript } from './transcriptProcessor';
import { processWithGraphAI } from './graphaiProcessor';
import * as path from 'path';
import * as fs from 'fs/promises';

async function run() {
  const args = process.argv.slice(2);
  const useStdin = args.includes('--stdin');
  const skipTranscriptProcessing = args.includes('--skip-transcript');

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
      console.error('オプション: --skip-transcript  翻訳済み .processed.txt を直接指定する場合に使用');
      process.exit(1);
    }
    inputFilePath = positional[0];
  }

  let processedTextPath: string;
  if (skipTranscriptProcessing) {
    processedTextPath = inputFilePath;
  } else {
    const baseName = path.basename(inputFilePath, path.extname(inputFilePath));
    const outputDir = path.dirname(inputFilePath);
    processedTextPath = path.join(outputDir, `${baseName}.processed.txt`);
  }

  const outputDir = path.dirname(processedTextPath);
  const audioOutputDir = path.join(outputDir, 'audio_output');
  const bgmPath = process.env.BGM_PATH;

  try {
    if (bgmPath) {
      await fs.access(bgmPath);
      console.log(`BGMファイルを使用します: ${bgmPath}`);
    }

    if (skipTranscriptProcessing) {
      console.log(`翻訳処理をスキップし、直接音声化します: ${processedTextPath}`);
    } else {
      await processTranscript(inputFilePath, processedTextPath);
      console.log('テキスト処理が完了しました。');
    }

    console.log('GraphAIによる音声化処理を開始します...');
    const processedTranscript = await fs.readFile(processedTextPath, 'utf-8');

    const linesPerChunk = process.env.NUM_LINES_PER_CHUNK ? parseInt(process.env.NUM_LINES_PER_CHUNK, 10) : 20;
    const concurrency = process.env.NUM_PARALLEL_AUDIO_EXEC ? parseInt(process.env.NUM_PARALLEL_AUDIO_EXEC, 10) : 10;

    const processedBaseName = path.basename(processedTextPath, '.processed.txt');
    const finalAudioPath = path.join(outputDir, `${processedBaseName}.m4a`);

    await processWithGraphAI(processedTranscript, audioOutputDir, finalAudioPath, bgmPath, linesPerChunk, concurrency);

    // 最終ファイルの存在を確認してからクリーンナップ
    try {
      await fs.access(finalAudioPath);
    } catch {
      console.error(`最終音声ファイルが生成されませんでした: ${finalAudioPath}`);
      process.exit(1);
    }

    // audio_output 内の中間ファイルを削除
    console.log('中間ファイルをクリーンナップしています...');
    const audioFiles = await fs.readdir(audioOutputDir);
    for (const file of audioFiles) {
      await fs.unlink(path.join(audioOutputDir, file));
    }
    console.log('クリーンナップ完了。');

  } catch (error) {
    console.error('メイン処理でエラーが発生しました。', error);
    process.exit(1);
  }
}

run();

