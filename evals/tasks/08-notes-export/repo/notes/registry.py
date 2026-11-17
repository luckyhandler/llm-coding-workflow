"""Plugin registries. Modules register themselves at import time."""

COMMANDS = {}
EXPORTERS = {}


def command(name):
    def decorate(cls):
        if name in COMMANDS:
            raise ValueError(f"duplicate command: {name}")
        COMMANDS[name] = cls()
        return cls

    return decorate


def exporter(name):
    def decorate(fn):
        if name in EXPORTERS:
            raise ValueError(f"duplicate exporter: {name}")
        EXPORTERS[name] = fn
        return fn

    return decorate


def get_exporter(name):
    try:
        return EXPORTERS[name]
    except KeyError:
        raise KeyError(f"unknown export format: {name}") from None
