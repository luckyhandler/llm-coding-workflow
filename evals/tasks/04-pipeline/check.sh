#!/usr/bin/env bash
set -euo pipefail
python3 -m unittest -q test_retry test_worker
