import unittest

from chunker import chunk


class ChunkTest(unittest.TestCase):
    def test_even_split(self):
        self.assertEqual(chunk([1, 2, 3, 4], 2), [[1, 2], [3, 4]])

    def test_keeps_last_partial(self):
        self.assertEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]])

    def test_size_larger_than_input(self):
        self.assertEqual(chunk([1, 2], 5), [[1, 2]])

    def test_empty(self):
        self.assertEqual(chunk([], 3), [])

    def test_does_not_mutate_input(self):
        data = [1, 2, 3]
        chunk(data, 2)
        self.assertEqual(data, [1, 2, 3])

    def test_rejects_bad_size(self):
        for bad in [0, -1]:
            with self.assertRaises(ValueError, msg=bad):
                chunk([1, 2, 3], bad)


if __name__ == "__main__":
    unittest.main()
