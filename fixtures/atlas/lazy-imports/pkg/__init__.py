_LAZY_IMPORTS = {
    "Intelligence": ("ai", ".intelligence"),
    "Monitor": ("health", ".health"),
    "launch": ("ui", None),
}


def __getattr__(name):
    if name in _LAZY_IMPORTS:
        feature, module = _LAZY_IMPORTS[name]
        if module:
            import importlib

            mod = importlib.import_module(module, __package__)
            return getattr(mod, name)
    raise AttributeError(name)
