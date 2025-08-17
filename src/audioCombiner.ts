import * as fs from 'fs/promises';
import * as path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';

ffmpeg.setFfmpegPath(ffmpegPath as string);
ffmpeg.setFfprobePath(ffprobeStatic.path);

/**
 * Extracts the chunk number from a filename like 'chunk_10.wav'.
 * @param filename The filename to extract the number from.
 * @returns The extracted chunk number.
 */
const getChunkNumber = (filename: string): number => {
  const match = filename.match(/chunk_(\d+)\.wav/);
  return match ? parseInt(match[1], 10) : -1;
};

const ffprobe = (filePath: string): Promise<ffmpeg.FfprobeData> => {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) {
        reject(err);
      } else {
        resolve(data);
      }
    });
  });
}

function ffmpegOnce(cfg: (cmd: ffmpeg.FfmpegCommand) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const cmd = ffmpeg();
    cfg(cmd);
    cmd.on("error", reject).on("end", () => resolve()).run();
  });
}

/**
 * Combines audio chunks into a single audio file using fluent-ffmpeg.
 * @param audioOutputDir The directory containing the audio chunks.
 * @param finalOutputFilePath The path for the final combined audio file.
 * @param bgmPath Optional path to the background music file.
 */
export async function combineAudioChunks(audioOutputDir: string, finalOutputFilePath: string, bgmPath?: string) {
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

    const tempSpeechPath = path.join(audioOutputDir, 'temp_speech.wav');

    // 1. Concatenate speech chunks into a temporary file
    await new Promise<void>((resolve, reject) => {
      const command = ffmpeg();
      wavFiles.forEach(file => {
        command.input(file);
      });
      command
        .on('error', reject)
        .on('end', () => resolve())
        .mergeToFile(tempSpeechPath, audioOutputDir);
    });
    console.log(`一時的なスピーチファイルを作成しました: ${tempSpeechPath}`);

    // If no BGM, just move the temp file and clean up
    if (!bgmPath) {
      await fs.rename(tempSpeechPath, finalOutputFilePath);
      console.log(`音声ファイルの結合が完了しました: ${finalOutputFilePath}`);
    } else {
      // 2. Get duration of the speech file
      const speechMetadata = await ffprobe(tempSpeechPath);
      const speechDuration = speechMetadata.format.duration;
      if (speechDuration === undefined) {
        throw new Error('一時スピーチファイルの再生時間を取得できませんでした。');
      }
      console.log(`スピーチの長さ: ${speechDuration}秒`);

      // 3. Combine speech with BGM using sidechain compression
      await new Promise<void>((resolve, reject) => {

        const fadeOutStart = Math.max(speechDuration - 3, 0).toFixed(3); // 終了3秒前からフェード
        ffmpegOnce(cmd => {
          cmd.input(tempSpeechPath);
          cmd.input(bgmPath).inputOptions(["-stream_loop -1"]);

          const filter = [
            // 0番入力（声）を正規化 → 2系統に分岐
            "[0:a]loudnorm=I=-16:TP=-1.5:LRA=11,asplit=2[voice_mix][voice_key]",

            // 1番入力（BGM）を整える
            "[1:a]volume=0.18,afade=t=in:st=0:d=2[bgm]",

            // BGMに声（key）でサイドチェイン・コンプをかける
            "[bgm][voice_key]sidechaincompress=threshold=0.08:ratio=8:attack=5:release=250:makeup=1[ducked]",

            // ダック済みBGMと声（mix用）を合流 → 終端フェード
            `[ducked][voice_mix]amix=inputs=2:duration=shortest:dropout_transition=0:normalize=0[mix]`,
            `[mix]afade=t=out:st=${fadeOutStart}:d=3[out]`,
          ].join(";");

          cmd.complexFilter(filter)
            .outputOptions(["-map [out]", "-shortest"])
            .audioFrequency(48000)
            .audioCodec("aac").audioBitrate("192k")
            .output(finalOutputFilePath);
        });
      });
      console.log(`BGM付きの最終ファイルを生成しました: ${finalOutputFilePath}`);
    }

  } catch (error) {
    console.error('音声ファイルの結合中にエラーが発生しました:', error);
    throw error;
  }
}