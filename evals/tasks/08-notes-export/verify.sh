#!/usr/bin/env bash
set -euo pipefail
python3 -m unittest -q test_cli test_export_json test_notes_hidden
