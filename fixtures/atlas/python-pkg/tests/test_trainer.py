from trainkit import Trainer


def test_train():
    assert Trainer(steps=1).steps == 1
