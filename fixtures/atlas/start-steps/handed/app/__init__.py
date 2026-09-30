from .config import SETTINGS


def __getattr__(name):
    if name == "launch":

        def _launch():
            from .ui import serve

            serve(SETTINGS)

        return _launch
    raise AttributeError(name)
