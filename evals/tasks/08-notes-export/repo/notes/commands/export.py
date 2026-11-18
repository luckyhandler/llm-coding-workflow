from notes.ordering import sort_notes, visible
from notes.registry import EXPORTERS, command, get_exporter


@command("export")
class ExportCommand:
    help = "export notes"

    def configure(self, parser):
        parser.add_argument("--format", default="md", choices=sorted(EXPORTERS))
        parser.add_argument("--all", action="store_true", help="include archived notes")

    def run(self, args, store, out):
        notes = sort_notes(visible(store.load(), args.all))
        out.write(get_exporter(args.format)(notes))
        return 0
