PYTHON ?= python3

.PHONY: lint typecheck

lint: typecheck
	$(PYTHON) -m flake8 tool/

typecheck:
	@mypy scripts/types.py

unused:
	python scripts/unused.py
