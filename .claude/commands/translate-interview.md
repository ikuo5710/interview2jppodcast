Lex Fridmanポッドキャストのトランスクリプトから日本語音声ファイルを生成するワークフロー。

入力: $ARGUMENTS

## ワークフロー

### Step 1: 入力の判定と取得

入力がURLかファイルパスかを判定する。

**URLの場合（Lex Fridmanトランスクリプト）:**

`parse_transcript.py` を使ってURLからトランスクリプトを取得・パースする。

```
# ゲスト名を取得（ファイル名に使用）
python parse_transcript.py <URL> --guest-name

# パース実行（Speaker 1/2形式に変換）
python parse_transcript.py <URL> -o <ゲスト名（スペース除去）>_parsed.txt
```

- Lex Fridman が `Speaker 1`（インタビュアー）
- ゲストが `Speaker 2`

**ファイルパスの場合:**

`parse_transcript.py` を使ってローカルファイルをパースする。

```
python parse_transcript.py <入力ファイル> -o <ベース名>_parsed.txt
```

- 最初に発言する話者が `Speaker 1`（通常はインタビュアー Lex Fridman）
- 2人目以降の話者が `Speaker 2`
- 話者マッピングを明示指定する場合は `-s` オプションを使う:
  ```
  python parse_transcript.py <入力ファイル> -s '{"Lex Fridman":"Speaker 1","ゲスト名":"Speaker 2"}'
  ```

### Step 2: 日本語翻訳（100行ごとに分割・並行処理）

パース済みファイルを100行ごとのチャンクに分割し、**サブエージェントを並行起動**して翻訳する。

翻訳ルール:
- `Speaker 1:` と `Speaker 2:` の接頭辞はそのまま維持（翻訳しない）
- 自然な話し言葉の日本語（です/ます調）で翻訳
- 技術用語（CUDA, GPU, NVLink 等）は原語のまま
- 固有名詞（人名、企業名、製品名）は原語のまま
- 各チャンクの行数を維持する（行の結合・分割をしない）

出力ファイル名: `<ゲスト名（スペース除去）>_part<N>.processed.txt`（N=1,2,3,...）

各サブエージェントへの指示テンプレート:
```
You are a professional English-to-Japanese translator. Translate the following interview transcript lines into natural, fluent Japanese.

CRITICAL RULES:
- Keep "Speaker 1:" and "Speaker 2:" prefixes EXACTLY as-is (do not translate them)
- Each line must start with "Speaker 1: " or "Speaker 2: " followed by the Japanese translation
- Maintain the same number of lines
- Do not add or remove any lines
- Translate naturally - this is a spoken interview, so use natural spoken Japanese (です/ます調)
- Technical terms should remain in English/original form
- Proper nouns (person names, company names, product names) should remain in original form

Write the result to: <出力ファイルパス>

Here are the lines to translate:
<該当チャンクの全行>
```

### Step 3: 翻訳結果の検証

生成された全 `.processed.txt` ファイルについて:
- 行数を確認（`grep -c "" <file>`）
- 先頭数行を読み取り、`Speaker 1:` / `Speaker 2:` 接頭辞が維持されていることを確認
- 合計行数がパース済みファイルの行数と一致することを確認

### Step 4: 音声化（パートごとに逐次実行・リエントリ対応）

生成された `.processed.txt` ファイルを **part1 から順番に1つずつ** 音声化する。
**TTSのレートリミットがあるため、並列実行は不可。必ず1パートずつ逐次実行すること。**

各パートの実行前に、対応する `.m4a` ファイルが既に存在するか確認する。
**既に存在する場合はそのパートをスキップする。** これにより途中で失敗した場合でも、再実行時に完了済みパートを飛ばして途中から再開できる。

失敗したパートの `audio_output/` に中間ファイル（`chunk_*.wav`）が残っている場合、再実行時にTTSは既存のチャンクをスキップして未生成分のみ処理する。API料金の無駄を避けるため、中間ファイルは削除しないこと。

```bash
# パートごとに実行（.m4a が既にあればスキップ）
npm start -- --skip-transcript <ゲスト名>_part1.processed.txt  # → <ゲスト名>_part1.m4a
npm start -- --skip-transcript <ゲスト名>_part2.processed.txt  # → <ゲスト名>_part2.m4a
...
npm start -- --skip-transcript <ゲスト名>_partN.processed.txt  # → <ゲスト名>_partN.m4a
```

各コマンドの完了を待ってから次を実行する。
成功すると `audio_output/` 内の中間ファイル（`chunk_*.wav`, `temp_speech.wav`）は自動的にクリーンナップされる。

**エラー時の動作:**
- コマンドが非ゼロで終了した場合、`audio_output/` 内のファイルはそのまま残る。
- **以降のパートの音声化は実行しない（即座に中止する）。**
- ユーザーに処理が失敗したことを通知する。どのパートで失敗したか、エラー内容を伝える。

## 出力ファイル一覧

| ファイル | 説明 |
|---------|------|
| `<ゲスト名>_parsed.txt` | パース済み英語（中間ファイル） |
| `<ゲスト名>_part1.processed.txt` | 日本語翻訳 行1-100 |
| `<ゲスト名>_partN.processed.txt` | 日本語翻訳（以降100行ごと） |
| `<ゲスト名>_part1.m4a` | 日本語音声（BGM付き） |
| `<ゲスト名>_partN.m4a` | 日本語音声（以降パートごと） |
