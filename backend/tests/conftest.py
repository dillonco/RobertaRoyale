"""
Shared fixtures for testing the Euchre game backend.
"""
import pytest
from fastapi.testclient import TestClient
from game_logic import EuchreGame, Card, Suit, Rank
from ai_player import EuchreAI, AIPersonality, AIManager

@pytest.fixture
def test_game():
    """Create a test game instance."""
    game = EuchreGame(room_code="TEST123")
    return game

@pytest.fixture
def test_game_with_players():
    """Create a test game with 4 players."""
    game = EuchreGame(room_code="TEST123")
    game.add_player("player1", "Player 1")
    game.add_player("player2", "Player 2")
    game.add_player("player3", "Player 3")
    game.add_player("player4", "Player 4")
    return game

@pytest.fixture
def test_cards():
    """Create a set of test cards."""
    return {
        "ace_hearts": Card(Suit.HEARTS, Rank.ACE),
        "king_hearts": Card(Suit.HEARTS, Rank.KING),
        "queen_hearts": Card(Suit.HEARTS, Rank.QUEEN),
        "jack_hearts": Card(Suit.HEARTS, Rank.JACK),
        "ten_hearts": Card(Suit.HEARTS, Rank.TEN),
        "nine_hearts": Card(Suit.HEARTS, Rank.NINE),
        
        "ace_diamonds": Card(Suit.DIAMONDS, Rank.ACE),
        "king_diamonds": Card(Suit.DIAMONDS, Rank.KING),
        "queen_diamonds": Card(Suit.DIAMONDS, Rank.QUEEN),
        "jack_diamonds": Card(Suit.DIAMONDS, Rank.JACK),
        "ten_diamonds": Card(Suit.DIAMONDS, Rank.TEN),
        "nine_diamonds": Card(Suit.DIAMONDS, Rank.NINE),
        
        "ace_clubs": Card(Suit.CLUBS, Rank.ACE),
        "king_clubs": Card(Suit.CLUBS, Rank.KING),
        "queen_clubs": Card(Suit.CLUBS, Rank.QUEEN),
        "jack_clubs": Card(Suit.CLUBS, Rank.JACK),
        "ten_clubs": Card(Suit.CLUBS, Rank.TEN),
        "nine_clubs": Card(Suit.CLUBS, Rank.NINE),
        
        "ace_spades": Card(Suit.SPADES, Rank.ACE),
        "king_spades": Card(Suit.SPADES, Rank.KING),
        "queen_spades": Card(Suit.SPADES, Rank.QUEEN),
        "jack_spades": Card(Suit.SPADES, Rank.JACK),
        "ten_spades": Card(Suit.SPADES, Rank.TEN),
        "nine_spades": Card(Suit.SPADES, Rank.NINE),
    }

@pytest.fixture
def test_ai():
    """Create a test AI instance."""
    personality = AIPersonality(
        name="TestAI",
        aggression=0.5,
        conservatism=0.5,
        partnership_focus=0.5,
        risk_tolerance=0.5
    )
    return EuchreAI(personality)

@pytest.fixture
def test_ai_manager():
    """Create a test AI manager instance."""
    return AIManager()

@pytest.fixture
def test_client():
    """Create a test client for the FastAPI app."""
    from main import app
    return TestClient(app)