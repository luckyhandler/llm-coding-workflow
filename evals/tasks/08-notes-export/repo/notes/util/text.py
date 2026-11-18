import re
import unicodedata


def slugify(text):
    normalized = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", normalized.lower()).strip("-")


def truncate(text, width):
    return text if len(text) <= width else text[: max(width - 1, 0)] + "…"


def parse_tags(raw):
    return {t.strip().lower() for t in raw.split(",") if t.strip()}
