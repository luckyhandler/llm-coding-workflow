#!/usr/bin/env bash
set -euo pipefail
python3 -m unittest -q test_money test_invoice test_shop_hidden
