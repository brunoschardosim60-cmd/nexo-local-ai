"""Loopback-only Piper adapter for Nexo's local TTS contract."""

from __future__ import annotations

import argparse
import io
import json
import os
import threading
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from piper import PiperVoice, SynthesisConfig


def clamp(value: object, minimum: float, maximum: float, fallback: float) -> float:
    try:
        return max(minimum, min(maximum, float(value)))
    except (TypeError, ValueError):
        return fallback


class NexoTtsServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, address: tuple[str, int], model_path: Path):
        super().__init__(address, NexoTtsHandler)
        self.model_path = model_path
        self.voice = PiperVoice.load(str(model_path))
        self.synthesis_lock = threading.Lock()


class NexoTtsHandler(BaseHTTPRequestHandler):
    server: NexoTtsServer

    def log_message(self, format_string: str, *args: object) -> None:
        print(f"[nexo-tts] {self.address_string()} {format_string % args}", flush=True)

    def send_json(self, status: int, value: dict[str, object]) -> None:
        payload = json.dumps(value, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(payload)

    def do_HEAD(self) -> None:  # noqa: N802
        if self.path not in {"/health", "/synthesize"}:
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header("Cache-Control", "no-store")
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/health":
            self.send_json(200, {"ok": True, "provider": "piper", "model": self.server.model_path.stem, "local": True})
            return
        if self.path == "/voices":
            self.send_json(200, {"voices": [{"id": "nexo-pt-BR", "model": self.server.model_path.stem, "language": "pt-BR"}]})
            return
        self.send_error(404)

    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/synthesize":
            self.send_error(404)
            return
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if size < 2 or size > 64_000:
                raise ValueError("corpo inválido")
            request = json.loads(self.rfile.read(size))
            text = str(request.get("text", "")).strip()
            if not text or len(text) > 2_000:
                raise ValueError("texto deve ter entre 1 e 2000 caracteres")
            speed = clamp(request.get("speed"), 0.65, 1.5, 1.0)
            energy = str(request.get("energy", "calm"))
            emphasis = str(request.get("emphasis", "selective"))
            volume = {"calm": 0.92, "balanced": 1.0, "energetic": 1.08}.get(energy, 1.0)
            noise_scale = 0.72 if emphasis in {"expressive", "strong"} else 0.667
            noise_w_scale = 0.86 if emphasis in {"expressive", "strong"} else 0.8
            config = SynthesisConfig(
                volume=volume,
                length_scale=1.0 / speed,
                noise_scale=noise_scale,
                noise_w_scale=noise_w_scale,
                normalize_audio=True,
            )
            output = io.BytesIO()
            with self.server.synthesis_lock, wave.open(output, "wb") as wav_file:
                self.server.voice.synthesize_wav(text, wav_file, syn_config=config)
            payload = output.getvalue()
            self.send_response(200)
            self.send_header("Content-Type", "audio/wav")
            self.send_header("Content-Length", str(len(payload)))
            self.send_header("X-Nexo-TTS-Provider", "piper")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(payload)
        except (ValueError, json.JSONDecodeError) as error:
            self.send_json(400, {"error": str(error)})
        except Exception as error:  # keep the process alive and report provider errors
            self.send_json(500, {"error": f"falha de síntese: {error}"})


def main() -> None:
    parser = argparse.ArgumentParser(description="Nexo local Piper TTS service")
    parser.add_argument("--host", default=os.environ.get("NEXO_TTS_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("NEXO_TTS_PORT", "7332")))
    parser.add_argument("--model", default=os.environ.get("NEXO_TTS_MODEL"))
    args = parser.parse_args()
    if args.host not in {"127.0.0.1", "localhost", "::1"}:
        raise SystemExit("Por segurança, o TTS do Nexo aceita apenas loopback.")
    if not args.model:
        raise SystemExit("Informe --model ou NEXO_TTS_MODEL.")
    model_path = Path(args.model).expanduser().resolve()
    if not model_path.is_file() or model_path.suffix != ".onnx":
        raise SystemExit(f"Modelo Piper inválido: {model_path}")
    server = NexoTtsServer((args.host, args.port), model_path)
    print(f"[nexo-tts] Piper pronto em http://{args.host}:{args.port} com {model_path.stem}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
