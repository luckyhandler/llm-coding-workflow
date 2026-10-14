Implement `parse_duration(text)` in `duration.py` so all tests in `test_duration.py` pass.

Requirements:
- Return the total number of seconds as an `int`.
- Accept one or more `<number><unit>` groups in any order, where unit is one of
  `w` (weeks), `d` (days), `h` (hours), `m` (minutes), `s` (seconds).
  e.g. `"1h30m"` -> 5400, `"2d"` -> 172800, `"1w2d3h"` -> 788400.
- An empty string returns `0`.
- Raise `ValueError` for malformed input: an unknown unit, a group with no
  digits, a number with no unit, or a negative number.

Do not change the signature or the tests. Keep `duration.py` dependency-free.
