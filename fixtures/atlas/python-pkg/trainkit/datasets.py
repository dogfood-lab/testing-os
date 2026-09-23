from datasets import Dataset


def load(path):
    return Dataset.from_json(path)
