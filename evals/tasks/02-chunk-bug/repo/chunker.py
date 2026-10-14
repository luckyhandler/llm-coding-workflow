def chunk(items, size):
    """Split items into consecutive groups of the given size."""
    if size <= 0:
        raise ValueError("size must be positive")
    groups = []
    for start in range(0, len(items) - size + 1, size):
        groups.append(list(items[start:start + size]))
    return groups
