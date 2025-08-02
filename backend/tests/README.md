# RobertaRoyale Backend Tests

This directory contains tests for the RobertaRoyale backend components.

## Test Structure

The tests are organized by component:

- `test_game_logic.py`: Tests for the game logic component
- `test_ai_player.py`: Tests for the AI player component
- `test_main.py`: Tests for the FastAPI server and WebSocket handling

Shared test fixtures are defined in `conftest.py`.

## Running Tests

To run the tests, you need to install the test dependencies first:

```bash
cd backend
pip install -e ".[test]"
```

Or if you're using `uv`:

```bash
cd backend
uv pip install -e ".[test]"
```

Then you can run the tests using pytest:

```bash
pytest
```

### Running Specific Tests

To run tests for a specific component:

```bash
pytest tests/test_game_logic.py
```

To run a specific test:

```bash
pytest tests/test_game_logic.py::TestCard::test_card_creation
```

### Test Coverage

To generate a test coverage report:

```bash
pytest --cov=. --cov-report=term
```

Or for HTML output:

```bash
pytest --cov=. --cov-report=html
```

## Test Components

### Game Logic Tests

Tests for the core game mechanics:
- Card and deck functionality
- Game state management
- Player actions
- Trick and round completion

### AI Player Tests

Tests for the AI components:
- AI personality creation
- Hand evaluation
- Decision-making (trump calling, card selection)
- AI manager functionality

### Server Tests

Tests for the FastAPI server:
- Health check endpoint
- Connection management
- WebSocket message handling
- Game state broadcasting