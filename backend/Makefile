.PHONY: seed help install run test lint format type-check coverage migrate upgrade downgrade clean

VENV := venv
PYTHON := $(VENV)/bin/python
PIP := $(VENV)/bin/pip

help:
	@echo "Available commands:"
	@echo "  make install       - Create venv and install dependencies"
	@echo "  make run          - Run development server"
	@echo "  make test         - Run all tests"
	@echo "  make test-one     - Run single test (usage: make test-one tests/test_file.py::test_func)"
	@echo "  make coverage     - Generate coverage report"
	@echo "  make lint         - Run flake8 linter"
	@echo "  make format       - Format code with black"
	@echo "  make type-check   - Run mypy type checker"
	@echo "  make migrate      - Create new database migration"
	@echo "  make upgrade      - Apply database migrations"
	@echo "  make downgrade    - Rollback last migration"
	@echo "  make clean        - Remove cache and build files"

install:
	python -m venv $(VENV)
	$(PIP) install --upgrade pip
	$(PIP) install -r requirements.txt
	@echo "Virtual environment created and dependencies installed"

run:
	$(PYTHON) -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

test:
	$(PYTHON) -m pytest -v

test-one:
	@if [ -z "$(FILE)" ]; then \
		echo "Usage: make test-one FILE=tests/test_file.py::test_function"; \
	else \
		$(PYTHON) -m pytest -v $(FILE); \
	fi

coverage:
	$(PYTHON) -m pytest --cov=app --cov-report=html --cov-report=term

lint:
	$(PYTHON) -m flake8 app --max-line-length=100

format:
	$(PYTHON) -m black app --line-length=100

type-check:
	$(PYTHON) -m mypy app --ignore-missing-imports

migrate:
	$(PYTHON) -m alembic revision --autogenerate -m "Auto migration"

upgrade:
	$(PYTHON) -m alembic upgrade head

downgrade:
	$(PYTHON) -m alembic downgrade -1

clean:
	find . -type d -name __pycache__ -exec rm -rf {} +
	find . -type f -name "*.pyc" -delete
	rm -rf .pytest_cache .coverage htmlcov .mypy_cache
	rm -rf dist build *.egg-info

seed:
	$(PYTHON) -m app.seed
