"""
Tests for the ai_player.py module.
"""
import asyncio
import pytest
from unittest.mock import MagicMock, patch
from ai_player import EuchreAI, AIPersonality, AIManager
from game_logic import Card, Suit, Rank

class TestAIPersonality:
    """Tests for the AIPersonality class."""
    
    def test_personality_creation(self):
        """Test that an AI personality can be created with the correct values."""
        personality = AIPersonality(
            name="TestAI",
            aggression=0.7,
            conservatism=0.4,
            partnership_focus=0.6,
            risk_tolerance=0.3
        )
        assert personality.name == "TestAI"
        assert personality.aggression == 0.7
        assert personality.conservatism == 0.4
        assert personality.partnership_focus == 0.6
        assert personality.risk_tolerance == 0.3


class TestEuchreAI:
    """Tests for the EuchreAI class."""
    
    def test_ai_creation(self, test_ai):
        """Test that an AI can be created with a personality."""
        assert test_ai.personality.name == "TestAI"
        assert test_ai.personality.aggression == 0.5
        assert test_ai.personality.conservatism == 0.5
        assert test_ai.personality.partnership_focus == 0.5
        assert test_ai.personality.risk_tolerance == 0.5
    
    def test_evaluate_hand_strength(self, test_ai, test_cards):
        """Test the hand strength evaluation."""
        # Create a strong hand with multiple trump cards
        hand = [
            test_cards["ace_hearts"],
            test_cards["king_hearts"],
            test_cards["jack_hearts"],
            test_cards["jack_diamonds"],  # Left bower when hearts is trump
            test_cards["ace_spades"]
        ]
        
        # Evaluate with hearts as trump
        strength = test_ai.evaluate_hand_strength(hand, Suit.HEARTS)
        
        # Should be a strong hand
        assert strength > 0.5
        
        # Create a weak hand with no trump cards
        weak_hand = [
            test_cards["nine_clubs"],
            test_cards["ten_clubs"],
            test_cards["queen_clubs"],
            test_cards["king_clubs"],
            test_cards["nine_spades"]
        ]
        
        # Evaluate with hearts as trump
        weak_strength = test_ai.evaluate_hand_strength(weak_hand, Suit.HEARTS)
        
        # Should be a weak hand
        assert weak_strength < 0.5
        
        # The strong hand should be stronger than the weak hand
        assert strength > weak_strength
    
    def test_is_trump(self, test_ai, test_cards):
        """Test the is_trump method."""
        # Set trump suit to HEARTS
        trump_suit = Suit.HEARTS
        
        # HEARTS cards should be trump
        assert test_ai.is_trump(test_cards["ace_hearts"], trump_suit)
        assert test_ai.is_trump(test_cards["king_hearts"], trump_suit)
        
        # JACK of DIAMONDS should be trump (left bower)
        assert test_ai.is_trump(test_cards["jack_diamonds"], trump_suit)
        
        # Other cards should not be trump
        assert not test_ai.is_trump(test_cards["ace_spades"], trump_suit)
        assert not test_ai.is_trump(test_cards["king_clubs"], trump_suit)
        assert not test_ai.is_trump(test_cards["queen_diamonds"], trump_suit)
    
    def test_should_call_trump(self, test_ai, test_cards):
        """Test the trump calling decision."""
        # Create a strong hand with multiple hearts
        strong_hand = [
            test_cards["ace_hearts"],
            test_cards["king_hearts"],
            test_cards["jack_hearts"],
            test_cards["ten_hearts"],
            test_cards["ace_spades"]
        ]
        
        # With a strong hand in hearts, should call hearts as trump
        trump_card = test_cards["nine_hearts"]
        should_call, suit = test_ai.should_call_trump(strong_hand, trump_card, False, 1)
        assert should_call
        assert suit == Suit.HEARTS
        
        # Create a weak hand with no hearts
        weak_hand = [
            test_cards["nine_clubs"],
            test_cards["ten_clubs"],
            test_cards["queen_clubs"],
            test_cards["king_clubs"],
            test_cards["ace_spades"]
        ]
        
        # With a weak hand in hearts, should not call hearts as trump
        should_call, suit = test_ai.should_call_trump(weak_hand, trump_card, False, 1)
        assert not should_call
        assert suit is None
    
    def test_choose_card_to_play(self, test_ai, test_cards):
        """Test the card selection for play."""
        # Create a hand
        hand = [
            test_cards["ace_hearts"],
            test_cards["king_hearts"],
            test_cards["jack_spades"],
            test_cards["ten_clubs"],
            test_cards["nine_diamonds"]
        ]
        
        # Create a game state with hearts as trump
        game_state = {
            "trump_suit": "hearts",
            "current_trick": [],
            "tricks": [],
            "scores": {"team1": 0, "team2": 0}
        }
        
        # When leading, should choose a strong card
        card = test_ai.choose_card_to_play(hand, game_state, [])
        assert card in hand
        
        # Create a current trick with a clubs lead
        current_trick = [("player1", test_cards["ace_clubs"])]
        
        # When following, should follow suit if possible
        card = test_ai.choose_card_to_play(hand, game_state, current_trick)
        assert card == test_cards["ten_clubs"]  # Only clubs card in hand


class TestAIManager:
    """Tests for the AIManager class."""
    
    def test_create_ai_player(self, test_ai_manager):
        """Test creating an AI player."""
        ai = test_ai_manager.create_ai_player("ai1")
        assert "ai1" in test_ai_manager.ai_players
        assert test_ai_manager.ai_players["ai1"] is not None
    
    def test_get_ai_player(self, test_ai_manager):
        """Test getting an AI player."""
        # Create an AI player
        test_ai_manager.create_ai_player("ai1")
        
        # Get the AI player
        ai = test_ai_manager.get_ai_player("ai1")
        assert ai is not None
        
        # Try to get a non-existent AI player
        ai = test_ai_manager.get_ai_player("nonexistent")
        assert ai is None
    
    def test_remove_ai_player(self, test_ai_manager):
        """Test removing an AI player."""
        # Create an AI player
        test_ai_manager.create_ai_player("ai1")
        
        # Remove the AI player
        test_ai_manager.remove_ai_player("ai1")
        assert "ai1" not in test_ai_manager.ai_players
        
        # Try to remove a non-existent AI player (should not raise an error)
        test_ai_manager.remove_ai_player("nonexistent")
    
    @pytest.mark.asyncio
    async def test_schedule_ai_action(self, test_ai_manager):
        """Test scheduling an AI action."""
        # Create a mock action function that returns a coroutine
        async def mock_action():
            pass
        
        # Schedule the action - this should create and store a task immediately
        await test_ai_manager.schedule_ai_action("ai1", mock_action, 0.1)
        
        # Verify that a task was created and stored
        assert "ai1" in test_ai_manager.ai_timers
        
        # Clean up the task
        test_ai_manager.ai_timers["ai1"].cancel()