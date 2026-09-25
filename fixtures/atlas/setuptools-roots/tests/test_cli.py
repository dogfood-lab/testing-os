import stub_env
from core.cli import main


def test_main():
    assert main() == stub_env.EXPECTED
