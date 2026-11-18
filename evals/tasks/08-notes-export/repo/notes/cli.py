import argparse
import sys

import notes.commands  # noqa: F401  (registers commands)
import notes.exporters  # noqa: F401  (registers export formats)
from notes.config import store_path
from notes.registry import COMMANDS
from notes.storage import JsonlStore


def build_parser():
    parser = argparse.ArgumentParser(prog="notes")
    sub = parser.add_subparsers(dest="command", required=True)
    for name, cmd in sorted(COMMANDS.items()):
        cmd.configure(sub.add_parser(name, help=cmd.help))
    return parser


def main(argv=None, store=None, out=None):
    args = build_parser().parse_args(argv)
    store = store or JsonlStore(store_path())
    return COMMANDS[args.command].run(args, store, out or sys.stdout)


if __name__ == "__main__":
    raise SystemExit(main())
