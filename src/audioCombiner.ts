import * as fs from 'fs/promises';
import * as path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import ffprobePath from 'ffprobe-static';

ffmpeg.setFfmpegPath(ffmpegPath as string);
ffmpeg.setFfprobePath((ffprobePath as any).path as string);

/**
 * Extracts the chunk number from a filename like 'chunk_10.wav'.
 * @param filename The filename to extract the number from.
 * @returns The extracted chunk number.
 */
const getChunkNumber = (filename: string): number => {
  const match = filename.match(/chunk_(\d+)\.wav/);
  return match ? parseInt(match[1], 10) : -1;
};

/**
 * Combines audio chunks into a single audio file using fluent-ffmpeg.
 * @param audioOutputDir The directory containing the audio chunks.
 * @param finalOutputFilePath The path for the final combined audio file.
 */
export async function combineAudioChunks(audioOutputDir: string, finalOutputFilePath: string) {
  console.log('音声ファイルの結合を開始します...');

  try {
    const files = await fs.readdir(audioOutputDir);
    const wavFiles = files
      .filter(file => file.endsWith('.wav') && file.startsWith('chunk_'))
      .sort((a, b) => getChunkNumber(a) - getChunkNumber(b))
      .map(file => path.join(audioOutputDir, file));

    if (wavFiles.length === 0) {
      console.log('結合する音声ファイルが見つかりませんでした。');
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const command = ffmpeg();
      wavFiles.forEach(file => {
        command.input(file);
      });

      command
        .on('error', (err) => {
          console.error('ffmpegエラー:', err.message);
          if (err.message.includes('ENOENT')) {
            console.error('ffmpegが見つかりません。ffmpegがインストールされ、システムのPATHに含まれていることを確認してください。');
          }
          reject(err);
        })
        .on('end', () => {
          console.log(`音声ファイルの結合が完了しました: ${finalOutputFilePath}`);
          resolve();
        })
        .mergeToFile(finalOutputFilePath, audioOutputDir);
    });

    // Clean up temporary chunk files
    for (const file of wavFiles) {
      await fs.unlink(file);
    }
    console.log('一時ファイルをクリーンアップしました。');

  } catch (error) {
    console.error('音声ファイルの結合中にエラーが発生しました:', error);
    throw error;
  }
}
