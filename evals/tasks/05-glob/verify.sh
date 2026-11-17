#!/usr/bin/env bash
set -euo pipefail
python3 -m unittest -q test_globmatch test_globmatch_hidden
