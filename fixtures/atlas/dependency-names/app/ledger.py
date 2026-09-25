import docx
import xrpl


def read(path):
    return docx.Document(path), xrpl.__name__
