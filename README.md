# Interview to Japanese Podcast (interview2jppodcast)

This application converts a text transcript into a podcast-style audio file with background music, spoken in natural-sounding Japanese. It utilizes Google's Generative AI for Text-to-Speech and GraphAI for parallel processing to accelerate audio generation.

## Features

- **Text-to-Speech Conversion**: Converts plain text into high-quality Japanese audio.
- **BGM Integration**: Mixes background music with the generated speech.
- **Parallel Processing**: Leverages GraphAI to process multiple text chunks concurrently, significantly speeding up the audio creation process.
- **Flexible Input**: Accepts input from both a file and standard input (stdin).

## Prerequisites

Before you begin, ensure you have the following installed:

- [Node.js](https://nodejs.org/) (v18 or later recommended)
- [ffmpeg](https://ffmpeg.org/download.html): Make sure the `ffmpeg` command is accessible from your system's PATH.

## Setup

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/ikuo5710/interview2jppodcast.git
    cd interview2jppodcast
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Create a `.env` file:**
    Create a file named `.env` in the root of the project and add your Google Generative AI API key. You can also optionally specify a default path for the background music.

    ```env
    # .env file
    GOOGLE_GENERATIVE_AI_API_KEY="YOUR_API_KEY_HERE"
    BGM_PATH="path/to/your/bgm.m4a"
    ```

4.  **Build the project:**
    Compile the TypeScript files into JavaScript.
    ```bash
    npm run build
    ```

## Usage

You can run the application in two ways:

### 1. From a text file

Provide the path to your transcript file as an argument.

```bash
npm start -- <path/to/your/transcript.txt>
```
*Example:*
```bash
npm start -- sample_transcript.txt
```

The final audio file (`final_podcast.m4a`) will be created in the project root directory.

### 2. From standard input (stdin)

Pipe text directly into the application.

```bash
cat your_transcript.txt | npm start -- --stdin
```

### BGM Customization

The background music is specified by the `BGM_PATH` variable in the `.env` file. If this variable is not set, the application will look for a file named `podcast-old.m4a` in the project root directory as a fallback.

## How It Works

The application follows these steps to generate the podcast:

1.  **`runner.ts`**: The main entry point that orchestrates the entire process. It reads the input transcript and prepares the necessary paths.
2.  **`transcriptProcessor.ts`**: Takes the raw transcript and formats it into a script suitable for narration by adding prompts.
3.  **`graphaiProcessor.ts`**: Splits the script into smaller chunks and uses GraphAI to manage parallel audio synthesis for each chunk.
4.  **`audioProcessor.ts`**: Calls the Google Generative AI API to convert a single text chunk into a WAV audio file.
5.  **`audioCombiner.ts`**: Once all chunks are synthesized, it uses `ffmpeg` to concatenate the individual audio files and mix them with the background music to produce the final podcast file.

## License

This project is licensed under the MIT License.
