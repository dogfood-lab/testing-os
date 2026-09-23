from .trainer import Trainer


def main():
    Trainer(steps=1).train()


def run():
    main()


if __name__ == "__main__":
    run()
