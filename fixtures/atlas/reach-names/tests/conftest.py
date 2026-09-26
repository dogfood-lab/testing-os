import subprocess
import sys
from pathlib import Path

TOOLS = Path(__file__).resolve().parent.parent / 'tools'


def run_py(script, args):
    return subprocess.run([sys.executable, str(TOOLS / script), *args], capture_output=True)
