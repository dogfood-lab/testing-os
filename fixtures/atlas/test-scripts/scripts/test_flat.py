import sys

from check import total

fails = [] if total([3]) == 3 else ["total of one value"]
sys.exit(1 if fails else 0)
