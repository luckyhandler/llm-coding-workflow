from collections import Counter

from notes.registry import command


@command("stats")
class StatsCommand:
    help = "show counts per tag"

    def configure(self, parser):
        pass

    def run(self, args, store, out):
        notes = store.load()
        counts = Counter(tag for n in notes if not n.archived for tag in n.tags)
        out.write(f"notes: {len(notes)} ({sum(n.archived for n in notes)} archived)\n")
        for tag, count in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0])):
            out.write(f"  #{tag}: {count}\n")
        return 0
