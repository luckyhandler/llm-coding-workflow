Implement `parse_semver` and `compare_semver` in `semver.py` so all tests in
`test_semver.py` pass.

`parse_semver(text)` returns a tuple `(major, minor, patch, prerelease)` where the
first three are ints and `prerelease` is a tuple of identifiers (each an int when
it is all digits, otherwise a str). Build metadata (`+...`) is ignored. Raise
`ValueError` for anything that is not `major.minor.patch` with optional
`-prerelease`.

`compare_semver(a, b)` returns -1, 0, or 1, comparing by major, then minor, then
patch, then prerelease with SemVer precedence rules:
- A version with a prerelease is lower than the same version without one.
- Prerelease identifiers are compared left to right.
- Numeric identifiers compare numerically and are lower than alphanumeric ones.
- A shorter prerelease tuple is lower when all its identifiers are equal.

Do not change the signatures or the tests. Keep `semver.py` dependency-free.
