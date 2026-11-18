from notes.registry import command
from notes.util import timefmt
from notes.util.text import parse_tags


@command("tag")
class TagCommand:
    help = "replace a note's tags"

    def configure(self, parser):
        parser.add_argument("id", type=int)
        parser.add_argument("tags")

    def run(self, args, store, out):
        notes = store.load()
        match = next((n for n in notes if n.id == args.id), None)
        if match is None:
            out.write(f"no note #{args.id}\n")
            return 1
        store.save(store.replace_note(notes, match.with_tags(parse_tags(args.tags), timefmt.now())))
        return 0
