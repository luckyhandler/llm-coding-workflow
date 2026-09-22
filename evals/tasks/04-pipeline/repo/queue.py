class TaskQueue:
    """A FIFO queue of (name, callable) tasks."""

    def __init__(self):
        self._items = []

    def add(self, name, fn):
        self._items.append((name, fn))

    def pop(self):
        return self._items.pop(0) if self._items else None

    def __len__(self):
        return len(self._items)
