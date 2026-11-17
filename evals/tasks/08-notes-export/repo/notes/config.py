import os
from pathlib import Path

ENV_VAR = "NOTES_FILE"
DEFAULT_PATH = Path.home() / ".notes.jsonl"


def store_path():
    return Path(os.environ.get(ENV_VAR, DEFAULT_PATH))
