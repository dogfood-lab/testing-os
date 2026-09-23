import importlib

import helpers


def main():
    from trainkit import Trainer

    trainer = Trainer(steps=1)
    trainer.train()
    handle = build()
    handle.close()
    return importlib.import_module("trainkit.plugins")


def build():
    from trainkit.console import main as cli_main

    cli_main()
    return helpers.handle()


if __name__ == "__main__":
    main()
