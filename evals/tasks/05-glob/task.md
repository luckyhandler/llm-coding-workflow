Implement `glob_match(pattern, path)` in `globmatch.py` so all tests in
`test_globmatch.py` pass. It returns `True` when the whole `path` matches the
whole `pattern`. Paths use `/` as the separator.

Pattern syntax:
- `?` matches exactly one character other than `/`.
- `*` matches zero or more characters other than `/`.
- `**` that makes up an entire segment (`a/**/b`, `**/x`, `x/**`) matches zero
  or more whole path segments. So `a/**/b` matches `a/b` and `a/x/y/b`, and
  `x/**` matches `x`, `x/y` and `x/y/z`. `**` anywhere else (e.g. `a**b`)
  behaves like `*`.
- `[abc]`, `[a-z]` and negated `[!a-z]` match one character from (or not from)
  the set. A class never matches `/`. An unclosed `[` raises `ValueError`.
- `{a,b,c}` matches any one of the comma-separated alternatives. Alternatives
  may contain any other syntax, including nested braces and `/`. An unclosed
  `{` raises `ValueError`.
- `\` escapes the next character so it matches literally (`\*` matches `*`).
  A trailing lone `\` raises `ValueError`.
- Hidden files: a path segment that starts with `.` is only matched when the
  pattern segment starts with a literal `.`. `*`, `?`, classes and `**` never
  match that leading dot (so `*` does not match `.env` and `**/x` does not look
  inside `.git/`).

Matching must run in polynomial time: patterns like `*a*a*a*a*a*a*b` against
long paths must not backtrack exponentially.

Do not change the signature or the tests. Keep `globmatch.py` dependency-free
(no `fnmatch`, `glob`, `re` or `pathlib` matching helpers).
