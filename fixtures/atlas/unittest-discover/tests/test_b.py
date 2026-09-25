import unittest

from tool import add


class CaseB(unittest.TestCase):
    def test_add(self):
        self.assertEqual(add(1, 2), 3)
