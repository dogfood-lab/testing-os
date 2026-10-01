# python-star-init

Package `__init__.py` files that hand on their siblings with relative
imports: `app/__init__.py` star-imports `.engine` and imports `clock` from
`.`, and `tests/suite/__init__.py` star-imports its two test modules. Each
resolves to the sibling module beside it.
