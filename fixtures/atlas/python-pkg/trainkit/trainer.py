from datasets import load_dataset
import requests

from .datasets import load


class Trainer:
    def __init__(self, steps):
        self.steps = steps

    def train(self):
        load("data.jsonl")
        return load_dataset("json")
