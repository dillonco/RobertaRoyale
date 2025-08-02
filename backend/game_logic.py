from enum import Enum
from typing import List, Dict, Optional, Tuple
import random
from dataclasses import dataclass, field
from copy import deepcopy

class Suit(Enum):
    HEARTS = "hearts"
    DIAMONDS = "diamonds"
    CLUBS = "clubs"
    SPADES = "spades"

class Rank(Enum):
    NINE = 9
    TEN = 10
    JACK = 11
    QUEEN = 12
    KING = 13
    ACE = 14

@dataclass
class Card:
    suit: Suit
    rank: Rank
    
    def __str__(self):
        return f"{self.rank.name.lower()}_of_{self.suit.value}"
    
    def to_dict(self):
        return {
            'suit': self.suit.value,
            'rank': self.rank.value,
            'display_name': str(self)
        }

class GamePhase(Enum):
    WAITING_FOR_PLAYERS = "waiting_for_players"
    DEALING = "dealing"
    TRUMP_SELECTION = "trump_selection"
    PLAYING = "playing"
    ROUND_COMPLETE = "round_complete"
    GAME_COMPLETE = "game_complete"

@dataclass
class Player:
    id: str
    name: str
    hand: List[Card] = field(default_factory=list)
    position: int = 0  # 0=North, 1=East, 2=South, 3=West
    is_connected: bool = True
    is_ai: bool = False

@dataclass
class Trick:
    cards: List[Tuple[str, Card]] = field(default_factory=list)  # (player_id, card)
    leader: str = ""
    winner: str = ""
    
class EuchreGame:
    def __init__(self, room_code: str):
        self.room_code = room_code
        self.players: Dict[str, Player] = {}
        self.player_order: List[str] = []
        self.phase = GamePhase.WAITING_FOR_PLAYERS
        
        # Game state
        self.deck: List[Card] = []
        self.trump_suit: Optional[Suit] = None
        self.trump_card: Optional[Card] = None
        self.dealer_index = 0
        self.current_player_index = 0
        
        # Round state
        self.current_trick = Trick()
        self.completed_tricks: List[Trick] = []
        self.trump_maker: Optional[str] = None
        self.going_alone: Optional[str] = None
        
        # Scoring
        self.team_scores = {0: 0, 1: 0}  # Team 0: players 0&2, Team 1: players 1&3
        self.round_points = 0
        
        # Trump selection state
        self.trump_selection_round = 1  # 1 or 2
        self.trump_selection_player_index = 0
        
    def add_player(self, player_id: str, name: str, is_ai: bool = False) -> bool:
        if len(self.players) >= 4:
            return False
        
        position = len(self.players)
        self.players[player_id] = Player(id=player_id, name=name, position=position, is_ai=is_ai)
        self.player_order.append(player_id)
        
        if len(self.players) == 4:
            self.start_game()
        
        return True
    
    def start_game(self):
        if len(self.players) != 4:
            return False
        
        self.phase = GamePhase.DEALING
        self.deal_cards()
        return True
    
    def create_deck(self) -> List[Card]:
        """Create a 24-card Euchre deck (9, 10, J, Q, K, A of each suit)"""
        deck = []
        for suit in Suit:
            for rank in Rank:
                deck.append(Card(suit, rank))
        return deck
    
    def deal_cards(self):
        """Deal cards according to Euchre rules: 5 cards to each player, 4 to kitty"""
        self.deck = self.create_deck()
        random.shuffle(self.deck)
        
        # Clear all hands
        for player in self.players.values():
            player.hand = []
        
        # Deal 5 cards to each player
        card_index = 0
        for _ in range(5):
            for player_id in self.player_order:
                self.players[player_id].hand.append(self.deck[card_index])
                card_index += 1
        
        # Set trump card (top card of remaining 4)
        self.trump_card = self.deck[card_index]
        
        # Start trump selection
        self.phase = GamePhase.TRUMP_SELECTION
        self.trump_selection_round = 1
        self.trump_selection_player_index = (self.dealer_index + 1) % 4
    
    def get_card_value(self, card: Card, trump_suit: Suit, leading_suit: Suit) -> int:
        """Get the value of a card for comparison purposes"""
        # Jack of trump suit is highest
        if card.rank == Rank.JACK and card.suit == trump_suit:
            return 100
        
        # Jack of same color as trump is second highest
        if card.rank == Rank.JACK:
            if ((trump_suit in [Suit.HEARTS, Suit.DIAMONDS] and 
                 card.suit in [Suit.HEARTS, Suit.DIAMONDS]) or
                (trump_suit in [Suit.CLUBS, Suit.SPADES] and 
                 card.suit in [Suit.CLUBS, Suit.SPADES])):
                return 99
        
        # Trump cards (excluding jacks handled above)
        if card.suit == trump_suit:
            return 50 + card.rank.value
        
        # Cards of leading suit
        if card.suit == leading_suit:
            return card.rank.value
        
        # Off-suit cards
        return 0
    
    def is_trump(self, card: Card) -> bool:
        """Check if a card is trump (including the off-color jack)"""
        if not self.trump_suit:
            return False
        
        if card.suit == self.trump_suit:
            return True
        
        # Check for off-color jack
        if card.rank == Rank.JACK:
            if ((self.trump_suit in [Suit.HEARTS, Suit.DIAMONDS] and 
                 card.suit in [Suit.HEARTS, Suit.DIAMONDS]) or
                (self.trump_suit in [Suit.CLUBS, Suit.SPADES] and 
                 card.suit in [Suit.CLUBS, Suit.SPADES])):
                return True
        
        return False
    
    def get_effective_suit(self, card: Card) -> Suit:
        """Get the effective suit of a card (trump for off-color jack)"""
        if self.trump_suit and card.rank == Rank.JACK:
            if ((self.trump_suit in [Suit.HEARTS, Suit.DIAMONDS] and 
                 card.suit in [Suit.HEARTS, Suit.DIAMONDS]) or
                (self.trump_suit in [Suit.CLUBS, Suit.SPADES] and 
                 card.suit in [Suit.CLUBS, Suit.SPADES])):
                return self.trump_suit
        
        return card.suit
    
    def can_play_card(self, player_id: str, card: Card) -> bool:
        """Check if a player can legally play a card"""
        if player_id not in self.players:
            return False
        
        player = self.players[player_id]
        if card not in player.hand:
            return False
        
        # If leading the trick, any card is valid
        if len(self.current_trick.cards) == 0:
            return True
        
        # Must follow suit if possible
        leading_card = self.current_trick.cards[0][1]
        leading_suit = self.get_effective_suit(leading_card)
        
        # Check if player has cards of the leading suit
        has_leading_suit = any(
            self.get_effective_suit(c) == leading_suit 
            for c in player.hand
        )
        
        if has_leading_suit:
            return self.get_effective_suit(card) == leading_suit
        
        # If can't follow suit, any card is valid
        return True
    
    def play_card(self, player_id: str, card: Card) -> bool:
        """Play a card to the current trick"""
        if not self.can_play_card(player_id, card):
            return False
        
        player = self.players[player_id]
        player.hand.remove(card)
        
        if len(self.current_trick.cards) == 0:
            self.current_trick.leader = player_id
        
        self.current_trick.cards.append((player_id, card))
        
        # If trick is complete, determine winner
        if len(self.current_trick.cards) == 4:
            self.complete_trick()
        else:
            self.current_player_index = (self.current_player_index + 1) % 4
        
        return True
    
    def complete_trick(self):
        """Determine the winner of the current trick"""
        if not self.trump_suit or len(self.current_trick.cards) != 4:
            return
        
        leading_card = self.current_trick.cards[0][1]
        leading_suit = self.get_effective_suit(leading_card)
        
        winner_idx = 0
        highest_value = self.get_card_value(leading_card, self.trump_suit, leading_suit)
        
        for i, (player_id, card) in enumerate(self.current_trick.cards[1:], 1):
            card_value = self.get_card_value(card, self.trump_suit, leading_suit)
            if card_value > highest_value:
                highest_value = card_value
                winner_idx = i
        
        winner_id = self.current_trick.cards[winner_idx][0]
        self.current_trick.winner = winner_id
        
        self.completed_tricks.append(deepcopy(self.current_trick))
        self.current_trick = Trick()
        
        # Winner leads next trick
        self.current_player_index = self.player_order.index(winner_id)
        
        # Check if round is complete
        if len(self.completed_tricks) == 5:
            self.complete_round()
    
    def complete_round(self):
        """Complete the current round and calculate scores"""
        team_tricks = {0: 0, 1: 0}
        
        for trick in self.completed_tricks:
            winner_position = self.players[trick.winner].position
            team = winner_position % 2
            team_tricks[team] += 1
        
        # Determine which team made trump
        trump_maker_position = self.players[self.trump_maker].position
        trump_making_team = trump_maker_position % 2
        
        # Calculate points
        winning_team = 0 if team_tricks[0] > team_tricks[1] else 1
        tricks_won = team_tricks[winning_team]
        
        points = 0
        if winning_team == trump_making_team:
            # Trump making team won
            if self.going_alone:
                points = 4 if tricks_won == 5 else 1
            else:
                points = 2 if tricks_won == 5 else 1
        else:
            # Trump making team was euchred
            points = 2
        
        self.team_scores[winning_team] += points
        
        # Check for game end
        if max(self.team_scores.values()) >= 10:
            self.phase = GamePhase.GAME_COMPLETE
        else:
            self.start_next_round()
    
    def start_next_round(self):
        """Start the next round"""
        self.completed_tricks = []
        self.trump_suit = None
        self.trump_card = None
        self.trump_maker = None
        self.going_alone = None
        
        # Advance dealer
        self.dealer_index = (self.dealer_index + 1) % 4
        
        self.deal_cards()
    
    def handle_trump_selection(self, player_id: str, action: str, suit: Optional[Suit] = None) -> bool:
        """Handle trump selection (order up, pass, or name trump)"""
        if self.phase != GamePhase.TRUMP_SELECTION:
            return False
        
        current_player_id = self.player_order[self.trump_selection_player_index]
        if player_id != current_player_id:
            return False
        
        if action == "order_up" and self.trump_selection_round == 1:
            # Order up the turned card
            self.trump_suit = self.trump_card.suit
            self.trump_maker = player_id
            # Dealer picks up the trump card
            dealer = self.players[self.player_order[self.dealer_index]]
            dealer.hand.append(self.trump_card)
            self.start_playing_phase()
            return True
        
        elif action == "name_trump" and self.trump_selection_round == 2 and suit:
            # Name a different suit as trump
            if suit != self.trump_card.suit:
                self.trump_suit = suit
                self.trump_maker = player_id
                self.start_playing_phase()
                return True
        
        elif action == "pass":
            self.trump_selection_player_index = (self.trump_selection_player_index + 1) % 4
            
            # If all players pass in round 1, go to round 2
            if (self.trump_selection_round == 1 and 
                self.trump_selection_player_index == (self.dealer_index + 1) % 4):
                self.trump_selection_round = 2
            
            # If all players pass in round 2, redeal
            elif (self.trump_selection_round == 2 and 
                  self.trump_selection_player_index == (self.dealer_index + 1) % 4):
                self.deal_cards()
            
            return True
        
        return False
    
    def handle_going_alone(self, player_id: str, going_alone: bool) -> bool:
        """Handle going alone decision"""
        if player_id == self.trump_maker:
            self.going_alone = player_id if going_alone else None
            return True
        return False
    
    def start_playing_phase(self):
        """Start the playing phase"""
        self.phase = GamePhase.PLAYING
        self.current_player_index = (self.dealer_index + 1) % 4
    
    def get_game_state(self, player_id: str) -> Dict:
        """Get the current game state for a specific player"""
        player = self.players.get(player_id)
        if not player:
            return {}
        
        return {
            'room_code': self.room_code,
            'phase': self.phase.value,
            'player_id': player_id,
            'player_position': player.position,
            'players': [
                {
                    'id': p.id,
                    'name': p.name,
                    'position': p.position,
                    'hand_size': len(p.hand),
                    'is_connected': p.is_connected,
                    'is_ai': p.is_ai
                } for p in self.players.values()
            ],
            'hand': [card.to_dict() for card in player.hand],
            'trump_suit': self.trump_suit.value if self.trump_suit else None,
            'trump_card': self.trump_card.to_dict() if self.trump_card else None,
            'current_trick': {
                'cards': [(pid, card.to_dict()) for pid, card in self.current_trick.cards],
                'leader': self.current_trick.leader
            },
            'completed_tricks_count': len(self.completed_tricks),
            'team_scores': self.team_scores,
            'dealer_index': self.dealer_index,
            'current_player_index': self.current_player_index,
            'trump_selection_player_index': self.trump_selection_player_index,
            'trump_selection_round': self.trump_selection_round,
            'trump_maker': self.trump_maker,
            'going_alone': self.going_alone
        }