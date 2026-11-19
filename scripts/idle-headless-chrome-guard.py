#!/usr/bin/env python3
"""Stop only allowlisted Aoo test Chrome instances after CDP has been idle."""

import json
import os
import re
import signal
import subprocess
import time
from pathlib import Path


STATE = Path.home() / "Library/Caches/aoo-idle-headless-chrome.json"
IDLE_SECONDS = 15 * 60
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PROFILE = re.compile(r"--user-data-dir=(/tmp/(?:aoo-[^\s]+|cx001-xqp-profile\.[^\s]+))")
PORT = re.compile(r"--remote-debugging-port=(1234|1298[0-7])(?:\s|$)")


def run(*args):
    return subprocess.run(args, capture_output=True, text=True, check=False).stdout


def candidates():
    for line in run("/bin/ps", "-axo", "pid=,command=").splitlines():
        parts = line.strip().split(None, 1)
        if len(parts) != 2 or not parts[0].isdigit():
            continue
        pid, command = int(parts[0]), parts[1]
        if not command.startswith(CHROME + " --headless=new "):
            continue
        profile, port = PROFILE.search(command), PORT.search(command)
        if profile and port:
            yield pid, command, profile.group(1), int(port.group(1))


def connected(port):
    return bool(run("/usr/sbin/lsof", "-nP", f"-iTCP:{port}", "-sTCP:ESTABLISHED").strip())


def main():
    now = time.time()
    try:
        state = json.loads(STATE.read_text())
    except (FileNotFoundError, ValueError):
        state = {}
    next_state = {}
    for pid, command, profile, port in candidates():
        key = f"{pid}:{profile}:{port}"
        last_active = float(state.get(key, now))
        if connected(port):
            last_active = now
        if now - last_active >= IDLE_SECONDS:
            # Recheck identity immediately before signaling; never target ordinary Chrome.
            current = run("/bin/ps", "-p", str(pid), "-o", "command=").strip()
            if current == command:
                os.kill(pid, signal.SIGTERM)
                print(f"stopped idle Aoo test Chrome pid={pid} port={port} profile={profile}")
            continue
        next_state[key] = last_active
    STATE.parent.mkdir(parents=True, exist_ok=True)
    temporary = STATE.with_suffix(".tmp")
    temporary.write_text(json.dumps(next_state))
    temporary.replace(STATE)


if __name__ == "__main__":
    main()
