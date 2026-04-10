import re
import sys
import argparse
import json
import urllib.request
from html.parser import HTMLParser


class TranscriptHTMLParser(HTMLParser):
    """Extract structured transcript segments from Lex Fridman transcript pages.

    Parses HTML with structure:
        <div class="ts-segment">
            <span class="ts-name">Speaker Name</span>
            <span class="ts-timestamp">...</span>
            <span class="ts-text">Spoken text</span>
        </div>
    """

    def __init__(self):
        super().__init__()
        self.segments = []  # list of (speaker_name, text)
        self._current_class = None
        self._current_name = None
        self._current_text = None

    def handle_starttag(self, tag, attrs):
        attrs_dict = dict(attrs)
        cls = attrs_dict.get("class", "")
        if cls == "ts-name":
            self._current_class = "name"
        elif cls == "ts-text":
            self._current_class = "text"
        elif cls == "ts-segment":
            self._current_name = None
            self._current_text = None

    def handle_endtag(self, tag):
        if tag == "span" and self._current_class:
            self._current_class = None
        if tag == "div" and self._current_name and self._current_text:
            self.segments.append((self._current_name.strip(), self._current_text.strip()))

    def handle_data(self, data):
        if self._current_class == "name":
            self._current_name = data
        elif self._current_class == "text":
            if self._current_text is None:
                self._current_text = data
            else:
                self._current_text += data

    def handle_entityref(self, name):
        import html as html_mod
        char = html_mod.unescape(f"&{name};")
        if self._current_class == "text":
            if self._current_text is None:
                self._current_text = char
            else:
                self._current_text += char

    def handle_charref(self, name):
        import html as html_mod
        char = html_mod.unescape(f"&#{name};")
        if self._current_class == "text":
            if self._current_text is None:
                self._current_text = char
            else:
                self._current_text += char


def fetch_and_parse_url(url, speaker_map=None):
    """Fetch transcript from URL and return (turns, detected_speakers)."""
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req) as resp:
        html = resp.read().decode("utf-8")

    parser = TranscriptHTMLParser()
    parser.feed(html)

    detected_speakers = []
    turns = []

    for speaker_name, text in parser.segments:
        if not text:
            continue
        if speaker_name not in detected_speakers:
            detected_speakers.append(speaker_name)

        if speaker_map:
            label = speaker_map.get(speaker_name)
            if label is None:
                continue
        else:
            idx = detected_speakers.index(speaker_name)
            label = "Speaker 1" if idx == 0 else "Speaker 2"

        turns.append(f"{label}: {text}")

    if not speaker_map and detected_speakers:
        auto_map = {name: ("Speaker 1" if i == 0 else "Speaker 2")
                    for i, name in enumerate(detected_speakers)}
        print(f"Auto-detected speakers: {auto_map}")

    return turns, detected_speakers


def extract_guest_name_from_url(url):
    """Extract the guest (non-Lex) speaker name from a transcript URL."""
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req) as resp:
        html = resp.read().decode("utf-8")

    parser = TranscriptHTMLParser()
    parser.feed(html)

    for speaker_name, _ in parser.segments:
        if speaker_name.strip() != "Lex Fridman":
            return speaker_name.strip()
    return None


def parse_file_format(lines, speaker_map):
    """Parse local file transcript format.

    Format: speaker name on its own line, then (HH:MM:SS) text lines.
    """
    turns = []
    current_speaker = None

    for line in lines:
        line = line.strip()

        if line in speaker_map:
            current_speaker = speaker_map[line]
            continue

        timestamp_match = re.match(r"^\([\d:]+\)\s*(.*)", line)
        if timestamp_match and current_speaker:
            text = timestamp_match.group(1).strip()
            if text:
                turns.append(f"{current_speaker}: {text}")
            continue

    return turns


def auto_detect_speakers_from_file(filepath):
    """Auto-detect speaker names from a local transcript file."""
    with open(filepath, "r", encoding="utf-8") as f:
        all_lines = [l.strip() for l in f.readlines()]

    speaker_names = []
    for idx, line in enumerate(all_lines):
        if (
            line
            and not re.match(r"^\([\d:]+\)", line)
            and idx + 1 < len(all_lines)
            and re.match(r"^\([\d:]+\)", all_lines[idx + 1])
            and line not in speaker_names
        ):
            speaker_names.append(line)

    if len(speaker_names) >= 2:
        speaker_map = {speaker_names[0]: "Speaker 1"}
        for name in speaker_names[1:]:
            speaker_map[name] = "Speaker 2"
        print(f"Auto-detected speakers: {speaker_map}")
        return speaker_map
    return None


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Parse interview transcript for TTS")
    parser.add_argument("input", help="Input transcript file or URL")
    parser.add_argument("-o", "--output", help="Output file (default: <input>_parsed.txt)")
    parser.add_argument(
        "-s", "--speakers",
        help='Speaker mapping as JSON, e.g. \'{"Lex Fridman":"Speaker 1","Jensen Huang":"Speaker 2"}\'',
    )
    parser.add_argument(
        "--guest-name", action="store_true",
        help="Print the detected guest name and exit",
    )
    args = parser.parse_args()

    speaker_map = json.loads(args.speakers) if args.speakers else None
    is_url = args.input.startswith("http://") or args.input.startswith("https://")

    if is_url:
        print(f"Fetching transcript from URL: {args.input}")

        if args.guest_name:
            guest = extract_guest_name_from_url(args.input)
            if guest:
                print(guest)
            else:
                print("Could not detect guest name", file=sys.stderr)
                sys.exit(1)
            sys.exit(0)

        turns, detected_speakers = fetch_and_parse_url(args.input, speaker_map)
    else:
        if args.guest_name:
            print("--guest-name is only supported with URL input", file=sys.stderr)
            sys.exit(1)

        with open(args.input, "r", encoding="utf-8") as f:
            lines = f.readlines()

        if not speaker_map:
            speaker_map = auto_detect_speakers_from_file(args.input)
            if not speaker_map:
                print("Could not auto-detect speakers. Use -s option.")
                sys.exit(1)

        turns = parse_file_format(lines, speaker_map)

    if not turns:
        print("No transcript turns found.", file=sys.stderr)
        sys.exit(1)

    output_file = args.output
    if not output_file:
        if is_url:
            output_file = "transcript_parsed.txt"
        else:
            base = args.input.rsplit(".", 1)[0]
            output_file = f"{base}_parsed.txt"

    with open(output_file, "w", encoding="utf-8") as f:
        for turn in turns:
            f.write(turn + "\n")

    print(f"Parsed {len(turns)} turns -> {output_file}")
