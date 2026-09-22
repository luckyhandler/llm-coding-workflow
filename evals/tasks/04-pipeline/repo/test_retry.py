import unittest

from retry import with_retry


class WithRetryTest(unittest.TestCase):
    def test_returns_first_success(self):
        calls = []

        def flaky():
            calls.append(1)
            if len(calls) < 3:
                raise RuntimeError("boom")
            return "ok"

        self.assertEqual(with_retry(flaky, 3), "ok")
        self.assertEqual(len(calls), 3)

    def test_reraises_last_error_after_all_attempts(self):
        calls = []

        def always_fails():
            calls.append(1)
            raise ValueError(f"fail {len(calls)}")

        with self.assertRaises(ValueError) as ctx:
            with_retry(always_fails, 3)
        self.assertEqual(str(ctx.exception), "fail 3")
        self.assertEqual(len(calls), 3)

    def test_single_attempt(self):
        calls = []

        def flaky():
            calls.append(1)
            raise RuntimeError("boom")

        with self.assertRaises(RuntimeError):
            with_retry(flaky, 1)
        self.assertEqual(len(calls), 1)

    def test_rejects_bad_attempts(self):
        with self.assertRaises(ValueError):
            with_retry(lambda: 1, 0)


if __name__ == "__main__":
    unittest.main()
