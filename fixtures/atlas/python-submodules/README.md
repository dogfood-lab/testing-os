# python-submodules

An Atlas fixture for `from package import module`: tests/test_formats.py
imports `formats` from the regular package audiokit, whose `__init__.py`
does not import it, so Python loads the submodule audiokit/formats.py;
`VERSION` is a name `__init__.py` defines and loads nothing more.
audiokit/core.py does the same relatively, `from . import mix`. Each
import reaches the module file as well as the package's `__init__.py`.
audiobooker, record-index and sprite-foundry import their modules this way.
