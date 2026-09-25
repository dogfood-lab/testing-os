import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))

from process_month import process


def test_process():
    assert process("jan") == "JAN"
