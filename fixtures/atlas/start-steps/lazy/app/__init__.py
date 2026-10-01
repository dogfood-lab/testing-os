from .flags import FEATURES


def launch():
    from .ui import serve

    serve(FEATURES)
