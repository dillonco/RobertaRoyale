"""
Tests for the game_logic.py module.
"""
import pytest
from game_logic import EuchreGame, Card, Suit, Rank, GamePhase, Player

class TestCard:
    """Tests for the Card class."""
    
    def test_card_creation(self, test_cards):
        """Test that cards can be created with the correct suit and rank."""
        card = test_cards["ace_hearts"]
        assert card.suit == Suit.HEARTS
        assert card.rank == Rank.ACE
    
    def test_card_str(self, test_cards):
        """Test the string representation of a card."""
        card = test_cards["king_spades"]
        assert str(card) == "king_of_spades"
    
    def test_card_to_dict(self, test_cards):
        """Test the dictionary representation of a card."""
        card = test_cards["queen_diamonds"]
        card_dict = card.to_dict()
        assert card_dict["suit"] == "diamonds"
        assert card_dict["rank"] == 12  # QUEEN value
        assert card_dict["display_name"] == "queen_of_diamonds"


class TestEuchreGame:
    """Tests for the EuchreGame class."""
    
    def test_game_creation(self, test_game):
        """Test that a game can be created with the correct initial state."""
        assert test_game.room_code == "TEST123"
        assert test_game.phase == GamePhase.WAITING_FOR_PLAYERS
        assert len(test_game.players) == 0
        assert len(test_game.deck) == 0
        assert test_game.trump_suit is None
    
    def test_add_player(self, test_game):
        """Test that players can be added to the game."""
        test_game.add_player("player1", "Player 1")
        assert len(test_game.players) == 1
        assert "player1" in test_game.players
        assert test_game.players["player1"].name == "Player 1"
        assert not test_game.players["player1"].is_ai
        
        # Add an AI player
        test_game.add_player("ai1", "AI 1", is_ai=True)
        assert len(test_game.players) == 2
        assert "ai1" in test_game.players
        assert test_game.players["ai1"].name == "AI 1"
        assert test_game.players["ai1"].is_ai
    
    def test_start_game(self, test_game_with_players):
        """Test that the game can be started."""
        game = test_game_with_players
        result = game.start_game()
        
        # Check that the game started successfully
        assert result is True
        
        # Check that the game phase has changed
        assert game.phase == GamePhase.TRUMP_SELECTION
        
        # Check that the deck has been created and cards dealt
        assert len(game.deck) > 0
        
        # Check that each player has 5 cards
        for player_id, player in game.players.items():
            assert len(player.hand) == 5
        
        # Check that the current player index is set
        assert game.current_player_index is not None
        assert 0 <= game.current_player_index < len(game.player_order)
        assert game.player_order[game.current_player_index] in game.players
    
    def test_create_deck(self, test_game):
        """Test that the deck is created with the correct cards."""
        deck = test_game.create_deck()
        
        # A Euchre deck should have 24 cards (9, 10, J, Q, K, A of each suit)
        assert len(deck) == 24
        
        # Check that the deck contains the expected cards
        suits = [Suit.HEARTS, Suit.DIAMONDS, Suit.CLUBS, Suit.SPADES]
        ranks = [Rank.NINE, Rank.TEN, Rank.JACK, Rank.QUEEN, Rank.KING, Rank.ACE]
        
        for suit in suits:
            for rank in ranks:
                # Find the card in the deck
                found = False
                for card in deck:
                    if card.suit == suit and card.rank == rank:
                        found = True
                        break
                assert found, f"Card {rank} of {suit} not found in deck"
    
    def test_deal_cards(self, test_game_with_players):
        """Test that cards are dealt correctly."""
        game = test_game_with_players
        game.deal_cards()
        
        # Check that each player has 5 cards
        for player_id, player in game.players.items():
            assert len(player.hand) == 5
        
        # Check that the trump card is set
        assert game.trump_card is not None
        
        # Check that all cards are accounted for (20 cards dealt to players, 1 trump card shown, 3 remaining in deck)
        total_cards_in_hands = sum(len(player.hand) for player in game.players.values())
        assert total_cards_in_hands == 20  # 5 cards * 4 players
        
        # Check that the phase has changed to TRUMP_SELECTION
        assert game.phase == GamePhase.TRUMP_SELECTION
        
        # Check that the trump selection round is set to 1
        assert game.trump_selection_round == 1
    
    def test_is_trump(self, test_game, test_cards):
        """Test the is_trump method."""
        game = test_game
        
        # Set trump suit to HEARTS
        game.trump_suit = Suit.HEARTS
        
        # HEARTS cards should be trump
        assert game.is_trump(test_cards["ace_hearts"])
        assert game.is_trump(test_cards["king_hearts"])
        
        # JACK of DIAMONDS should be trump (left bower)
        assert game.is_trump(test_cards["jack_diamonds"])
        
        # Other cards should not be trump
        assert not game.is_trump(test_cards["ace_spades"])
        assert not game.is_trump(test_cards["king_clubs"])
        assert not game.is_trump(test_cards["queen_diamonds"])
    
    def test_get_effective_suit(self, test_game, test_cards):
        """Test the get_effective_suit method."""
        game = test_game
        
        # Set trump suit to HEARTS
        game.trump_suit = Suit.HEARTS
        
        # Regular cards should have their own suit
        assert game.get_effective_suit(test_cards["ace_hearts"]) == Suit.HEARTS
        assert game.get_effective_suit(test_cards["king_spades"]) == Suit.SPADES
        
        # JACK of HEARTS should be HEARTS
        assert game.get_effective_suit(test_cards["jack_hearts"]) == Suit.HEARTS
        
        # JACK of DIAMONDS should be HEARTS (left bower)
        assert game.get_effective_suit(test_cards["jack_diamonds"]) == Suit.HEARTS