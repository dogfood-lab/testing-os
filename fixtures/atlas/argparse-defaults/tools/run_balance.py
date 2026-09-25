import argparse
from pathlib import Path

from sim.reporting import write_json_report


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="artifacts/balance", help="Output directory")
    args = parser.parse_args()
    out_dir = Path(args.output)
    write_json_report({"ok": True}, out_dir / "balance-report.json")


if __name__ == "__main__":
    main()
