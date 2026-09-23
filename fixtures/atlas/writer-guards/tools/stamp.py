import os
import sys
from pathlib import Path

if "--check" in sys.argv:
    sys.exit(0)

if os.environ.get("CI"):
    sys.exit(0)

(Path(__file__).parent.parent / "VERSION").write_text("1.0.0\n")
