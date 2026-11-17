from notes.ordering import sort_notes, visible
from notes.registry import command


@command("search")
class SearchCommand:
    help = "find notes containing text or a tag"

    def configure(self, parser):
        parser.add_argument("query")
        parser.add_argument("--all", action="store_true")

    def run(self, args, store, out):
        q = args.query.lower()
        for note in sort_notes(visible(store.load(), args.all)):
            if q.startswith("#") and q[1:] in note.tags:
                out.write(f"{note.id:>4}  {note.title}\n")
            elif q in note.title.lower() or q in note.body.lower():
                out.write(f"{note.id:>4}  {note.title}\n")
        return 0
