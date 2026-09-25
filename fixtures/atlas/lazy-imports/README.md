# lazy-imports

An Atlas fixture for a package that loads optional modules lazily from a
table, the shape comfy-headless's `__init__.py` has: `_LAZY_IMPORTS =
{"Name": ("feature", ".module")}`, and `__getattr__` unpacks
`feature, module = _LAZY_IMPORTS[name]` and calls
`importlib.import_module(module, __package__)`. Every module the table
names is one the package imports.
