def parse_semver(text):
    """Parse a SemVer string into (major, minor, patch, prerelease)."""
    raise NotImplementedError


def compare_semver(a, b):
    """Compare two SemVer strings, returning -1, 0, or 1."""
    raise NotImplementedError
