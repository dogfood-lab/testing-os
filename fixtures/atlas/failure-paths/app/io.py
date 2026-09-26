def read_rows(path):
    try:
        with open(path) as handle:
            return handle.readlines()
    except OSError:
        raise ValueError(f"cannot read {path}")
