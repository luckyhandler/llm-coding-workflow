import unittest

from queue import TaskQueue
from worker import run_pending


def _ok(value):
    def run():
        return value

    return run


def _flaky(value, failures):
    state = {"calls": 0}

    def run():
        state["calls"] += 1
        if state["calls"] <= failures:
            raise RuntimeError("transient")
        return value

    return run


def _always_fails():
    def run():
        raise RuntimeError("permanent")

    return run


class RunPendingTest(unittest.TestCase):
    def test_all_succeed(self):
        q = TaskQueue()
        q.add("a", _ok(1))
        q.add("b", _ok(2))
        results, failures = run_pending(q)
        self.assertEqual(results, [1, 2])
        self.assertEqual(failures, [])
        self.assertEqual(len(q), 0)

    def test_flaky_task_is_retried(self):
        q = TaskQueue()
        q.add("a", _flaky("recovered", 2))
        results, failures = run_pending(q, attempts=3)
        self.assertEqual(results, ["recovered"])
        self.assertEqual(failures, [])

    def test_failure_does_not_stop_the_rest(self):
        q = TaskQueue()
        q.add("bad", _always_fails())
        q.add("good", _ok("done"))
        results, failures = run_pending(q)
        self.assertEqual(results, ["done"])
        self.assertEqual(failures, ["bad"])

    def test_order_of_results_is_preserved(self):
        q = TaskQueue()
        for i in range(4):
            q.add(f"t{i}", _ok(i))
        results, failures = run_pending(q)
        self.assertEqual(results, [0, 1, 2, 3])
        self.assertEqual(failures, [])


if __name__ == "__main__":
    unittest.main()
