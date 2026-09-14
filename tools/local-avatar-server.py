#!/usr/bin/env python3
import argparse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class AvatarHandler(SimpleHTTPRequestHandler):
    def end_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "public, max-age=86400")
        super().end_headers()


def main() -> None:
    parser = argparse.ArgumentParser(description="Serve Aoo local player avatars with CORS")
    parser.add_argument("--root", default="/Users/aoo/Pictures/头像")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    root = Path(args.root).expanduser().resolve(strict=True)
    handler = lambda *values, **options: AvatarHandler(*values, directory=str(root), **options)
    ThreadingHTTPServer(("0.0.0.0", args.port), handler).serve_forever()


if __name__ == "__main__":
    main()
