from retry import with_retry


def run_pending(queue, attempts=3):
    """Drain the queue, retrying each task; return (results, failures)."""
    raise NotImplementedError
