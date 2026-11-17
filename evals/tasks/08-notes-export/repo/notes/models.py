from dataclasses import dataclass, field, replace
from datetime import datetime
from typing import Optional


@dataclass(frozen=True)
class Note:
    id: int
    title: str
    body: str
    created: datetime
    updated: Optional[datetime] = None
    tags: frozenset = field(default_factory=frozenset)
    archived: bool = False

    def with_tags(self, tags, when):
        return replace(self, tags=frozenset(tags), updated=when)

    def archive(self, when):
        return replace(self, archived=True, updated=when)
