from __future__ import annotations

import argparse
import base64
import json
import math
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from faster_whisper import WhisperModel


class NexoSttServer(ThreadingHTTPServer):
    def __init__(self, address: tuple[str, int], model_name: str, models_root: Path):
        super().__init__(address, NexoSttHandler)
        self.model_name = model_name
        self.models_root = models_root
        self.model: WhisperModel | None = None
        self.model_lock = threading.Lock()

    def get_model(self) -> WhisperModel:
        with self.model_lock:
            if self.model is None:
                self.model = WhisperModel(
                    self.model_name,
                    device="cpu",
                    compute_type="int8",
                    cpu_threads=6,
                    num_workers=1,
                    download_root=str(self.models_root),
                )
            return self.model


class NexoSttHandler(BaseHTTPRequestHandler):
    server: NexoSttServer

    def log_message(self, format: str, *args: object) -> None:
        return

    def send_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Nexo-STT-Provider", "faster-whisper-local")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def do_HEAD(self) -> None:
        if self.path in {"/health", "/transcribe"}:
            self.send_json(200, {"ok": True})
        else:
            self.send_json(404, {"error": "not found"})

    def do_GET(self) -> None:
        if self.path == "/health":
            self.send_json(200, {"ok": True, "provider": "faster-whisper-local", "model": self.server.model_name, "loaded": self.server.model is not None})
        else:
            self.send_json(404, {"error": "not found"})

    def do_POST(self) -> None:
        if self.path != "/transcribe":
            self.send_json(404, {"error": "not found"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length < 1 or length > 12_000_000:
                raise ValueError("payload de áudio fora do limite")
            payload = json.loads(self.rfile.read(length))
            encoded = str(payload.get("audio") or "")
            audio = base64.b64decode(encoded, validate=True)
            if not audio or len(audio) > 8_000_000:
                raise ValueError("áudio vazio ou maior que 8 MB")
            mime_type = str(payload.get("mimeType") or "audio/webm").lower()
            suffix = ".wav" if "wav" in mime_type else ".ogg" if "ogg" in mime_type else ".mp4" if "mp4" in mime_type else ".webm"
            source_path = None
            try:
                with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as source:
                    source_path = Path(source.name)
                    source.write(audio)
                    source.flush()
                segments, info = self.server.get_model().transcribe(
                    str(source_path),
                    language="pt",
                    beam_size=3,
                    best_of=3,
                    vad_filter=True,
                    condition_on_previous_text=False,
                    word_timestamps=False,
                    initial_prompt="Conversa em português brasileiro com um assistente chamado Nexo.",
                    hotwords="Nexo",
                )
                rows = []
                probabilities = []
                for segment in segments:
                    text = segment.text.strip()
                    if not text:
                        continue
                    rows.append({"start": round(segment.start, 3), "end": round(segment.end, 3), "text": text})
                    probabilities.append(math.exp(min(0.0, float(segment.avg_logprob))))
            finally:
                if source_path is not None:
                    source_path.unlink(missing_ok=True)
            text = " ".join(row["text"] for row in rows).strip()
            self.send_json(200, {
                "text": text,
                "language": info.language,
                "confidence": round(sum(probabilities) / len(probabilities), 3) if probabilities else 0,
                "segments": rows,
                "provider": "faster-whisper-local",
            })
        except Exception as error:
            self.send_json(400, {"error": str(error)[:300]})


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=7333)
    parser.add_argument("--model", default="small")
    parser.add_argument("--models-root", type=Path, required=True)
    args = parser.parse_args()
    if args.host not in {"127.0.0.1", "localhost", "::1"}:
        raise ValueError("STT local deve escutar somente no loopback")
    args.models_root.mkdir(parents=True, exist_ok=True)
    server = NexoSttServer((args.host, args.port), args.model, args.models_root)
    print(f"[nexo-stt] pronto em http://{args.host}:{args.port} com {args.model}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
