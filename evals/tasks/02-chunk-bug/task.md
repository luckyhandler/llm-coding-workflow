`chunk(items, size)` in `chunker.py` is supposed to split a sequence into
consecutive sublists of length `size`, keeping the final shorter group. It has a
bug: the last partial group is dropped. Fix the bug so all tests in
`test_chunker.py` pass.

Requirements:
- `chunk([1,2,3,4,5], 2)` -> `[[1,2],[3,4],[5]]`
- Raise `ValueError` when `size <= 0`.
- Preserve order and do not mutate the input sequence.
- Do not change the signature or the tests.
