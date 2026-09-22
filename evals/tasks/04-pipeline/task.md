Implement the missing pieces in this small task-processing library so all tests
in `test_retry.py` and `test_worker.py` pass.

`retry.with_retry(fn, attempts)`:
- Call `fn()` up to `attempts` times.
- Return the result of the first call that does not raise.
- If every call raises, re-raise the last exception.
- Raise `ValueError` if `attempts < 1`.

`worker.run_pending(queue, attempts=3)`:
- Process tasks from `queue` in order, draining it.
- For each task call `with_retry(fn, attempts)` (reuse the helper, do not
  reimplement the retry loop).
- Return `(results, failures)`: `results` holds the successful return values in
  the order the tasks succeeded, `failures` holds the names of tasks that raised
  after all attempts.
- A failing task must not stop the remaining tasks from running.

Do not change the signatures or the tests.
