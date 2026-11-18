def sort_notes(notes):
    """Canonical display order: oldest first, ties broken by id."""
    return sorted(notes, key=lambda n: (n.created, n.id))


def visible(notes, include_archived=False):
    return [n for n in notes if include_archived or not n.archived]
