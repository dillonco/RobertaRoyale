import random
import asyncio
from typing import List, Optional, Tuple
from game_logic import Card, Suit, Rank, EuchreGame
from dataclasses import dataclass

@dataclass
class AIPersonality:
    name: str
    aggression: float  # 0.0 - 1.0, affects trump calling and going alone
    conservatism: float  # 0.0 - 1.0, affects card play strategy
    partnership_focus: float  # 0.0 - 1.0, how much they consider partner
    risk_tolerance: float  # 0.0 - 1.0, willingness to take risks

# Predefined AI personalities
AI_PERSONALITIES = [
    AIPersonality("Ada", 0.7, 0.3, 0.8, 0.6),      # Aggressive, team-focused
    AIPersonality("Bob", 0.3, 0.7, 0.6, 0.4),      # Conservative, cautious
    AIPersonality("Clara", 0.8, 0.2, 0.5, 0.8),    # Very aggressive, risk taker
    AIPersonality("Dave", 0.5, 0.5, 0.9, 0.5),     # Balanced, partnership focused
]

class EuchreAI:
    def __init__(self, personality: AIPersonality):
        self.personality = personality
        self.name = personality.name
        
    def evaluate_hand_strength(self, hand: List[Card], trump_suit: Optional[Suit] = None) -> float:
        """Evaluate hand strength from 0.0 to 1.0"""
        if not trump_suit:
            return 0.0
        
        strength = 0.0
        trump_count = 0
        off_aces = 0
        
        for card in hand:
            if self.is_trump(card, trump_suit):
                trump_count += 1
                if card.rank == Rank.JACK and card.suit == trump_suit:
                    strength += 0.25  # Right bower
                elif card.rank == Rank.JACK and self.is_same_color_jack(card, trump_suit):
                    strength += 0.20  # Left bower
                elif card.rank == Rank.ACE:
                    strength += 0.15  # Trump ace
                else:
                    strength += 0.08  # Other trump
            elif card.rank == Rank.ACE:
                off_aces += 1
                strength += 0.05  # Off-suit ace
        
        # Bonus for multiple trump
        if trump_count >= 3:
            strength += 0.15
        elif trump_count >= 2:
            strength += 0.08
        
        # Bonus for off-suit aces
        strength += off_aces * 0.03
        
        return min(strength, 1.0)
    
    def is_trump(self, card: Card, trump_suit: Suit) -> bool:
        """Check if card is trump including off-color jack"""
        if card.suit == trump_suit:
            return True
        return card.rank == Rank.JACK and self.is_same_color_jack(card, trump_suit)
    
    def is_same_color_jack(self, card: Card, trump_suit: Suit) -> bool:
        """Check if card is the off-color jack (left bower)"""
        if card.rank != Rank.JACK:
            return False
        
        red_suits = {Suit.HEARTS, Suit.DIAMONDS}
        black_suits = {Suit.CLUBS, Suit.SPADES}
        
        return ((trump_suit in red_suits and card.suit in red_suits) or
                (trump_suit in black_suits and card.suit in black_suits))
    
    def should_call_trump(self, hand: List[Card], trump_card: Card, is_dealer: bool, 
                         round_num: int) -> Tuple[bool, Optional[Suit]]:
        """Decide whether to call trump and which suit"""
        if round_num == 1:
            # First round - decide on ordering up
            strength = self.evaluate_hand_strength(hand, trump_card.suit)
            threshold = 0.4 - (self.personality.aggression * 0.2)
            
            if is_dealer:
                threshold -= 0.1  # Dealers should be more likely to call
            
            return strength >= threshold, trump_card.suit if strength >= threshold else None
        
        else:
            # Second round - choose best suit
            best_suit = None
            best_strength = 0.0
            
            for suit in Suit:
                if suit == trump_card.suit:  # Can't choose the turned down suit
                    continue
                    
                strength = self.evaluate_hand_strength(hand, suit)
                if strength > best_strength:
                    best_strength = strength
                    best_suit = suit
            
            threshold = 0.5 - (self.personality.aggression * 0.25)
            should_call = best_strength >= threshold
            
            return should_call, best_suit if should_call else None
    
    def should_go_alone(self, hand: List[Card], trump_suit: Suit) -> bool:
        """Decide whether to go alone"""
        if self.personality.risk_tolerance < 0.3:
            return False
        
        strength = self.evaluate_hand_strength(hand, trump_suit)
        threshold = 0.8 - (self.personality.risk_tolerance * 0.2)
        
        # Check for strong combinations
        has_right_bower = any(
            card.rank == Rank.JACK and card.suit == trump_suit 
            for card in hand
        )
        has_left_bower = any(
            card.rank == Rank.JACK and self.is_same_color_jack(card, trump_suit)
            for card in hand
        )
        trump_count = sum(1 for card in hand if self.is_trump(card, trump_suit))
        
        if has_right_bower and has_left_bower and trump_count >= 3:
            return True
        
        return strength >= threshold and random.random() < self.personality.aggression
    
    def choose_card_to_play(self, hand: List[Card], game_state: dict, 
                           current_trick: List[Tuple[str, Card]]) -> Card:
        """Choose which card to play"""
        trump_suit = Suit(game_state['trump_suit']) if game_state['trump_suit'] else None
        playable_cards = self.get_playable_cards(hand, current_trick, trump_suit)
        
        if not playable_cards:
            return hand[0]  # Fallback
        
        if len(current_trick) == 0:
            # Leading the trick
            return self.choose_lead_card(playable_cards, trump_suit, game_state)
        else:
            # Following suit
            return self.choose_follow_card(playable_cards, current_trick, trump_suit, game_state)
    
    def get_playable_cards(self, hand: List[Card], current_trick: List[Tuple[str, Card]], 
                          trump_suit: Optional[Suit]) -> List[Card]:
        """Get cards that can legally be played"""
        if not current_trick:
            return hand  # Can play any card when leading
        
        leading_card = current_trick[0][1]
        leading_suit = self.get_effective_suit(leading_card, trump_suit)
        
        # Find cards of the leading suit
        same_suit_cards = [
            card for card in hand 
            if self.get_effective_suit(card, trump_suit) == leading_suit
        ]
        
        return same_suit_cards if same_suit_cards else hand
    
    def get_effective_suit(self, card: Card, trump_suit: Optional[Suit]) -> Suit:
        """Get the effective suit of a card (considering off-color jack)"""
        if trump_suit and card.rank == Rank.JACK and self.is_same_color_jack(card, trump_suit):
            return trump_suit
        return card.suit
    
    def choose_lead_card(self, playable_cards: List[Card], trump_suit: Optional[Suit], 
                        game_state: dict) -> Card:
        """Choose card to lead with"""
        if not trump_suit:
            return random.choice(playable_cards)
        
        trump_cards = [card for card in playable_cards if self.is_trump(card, trump_suit)]
        non_trump_cards = [card for card in playable_cards if not self.is_trump(card, trump_suit)]
        
        # Aggressive players lead trump more often
        if trump_cards and random.random() < self.personality.aggression:
            # Lead highest trump
            return max(trump_cards, key=lambda c: self.get_card_value(c, trump_suit))
        
        # Lead off-suit aces or high cards
        if non_trump_cards:
            aces = [card for card in non_trump_cards if card.rank == Rank.ACE]
            if aces:
                return aces[0]
            return max(non_trump_cards, key=lambda c: c.rank.value)
        
        return playable_cards[0]
    
    def choose_follow_card(self, playable_cards: List[Card], current_trick: List[Tuple[str, Card]], 
                          trump_suit: Optional[Suit], game_state: dict) -> Card:
        """Choose card when following suit"""
        if not trump_suit:
            return random.choice(playable_cards)
        
        # Determine if we can win the trick
        current_best_card = self.get_winning_card(current_trick, trump_suit)
        winning_cards = [
            card for card in playable_cards 
            if self.get_card_value(card, trump_suit) > self.get_card_value(current_best_card, trump_suit)
        ]
        
        if winning_cards:
            # Try to win with lowest possible card
            return min(winning_cards, key=lambda c: self.get_card_value(c, trump_suit))
        else:
            # Can't win, play lowest card
            return min(playable_cards, key=lambda c: self.get_card_value(c, trump_suit))
    
    def get_winning_card(self, current_trick: List[Tuple[str, Card]], trump_suit: Suit) -> Card:
        """Get the currently winning card in the trick"""
        if not current_trick:
            return None
        
        leading_card = current_trick[0][1]
        leading_suit = self.get_effective_suit(leading_card, trump_suit)
        
        best_card = leading_card
        best_value = self.get_card_value(leading_card, trump_suit)
        
        for _, card in current_trick[1:]:
            card_value = self.get_card_value(card, trump_suit)
            if card_value > best_value:
                best_card = card
                best_value = card_value
        
        return best_card
    
    def get_card_value(self, card: Card, trump_suit: Suit) -> int:
        """Get card value for comparison (matches game_logic.py)"""
        if card.rank == Rank.JACK and card.suit == trump_suit:
            return 100  # Right bower
        
        if card.rank == Rank.JACK and self.is_same_color_jack(card, trump_suit):
            return 99   # Left bower
        
        if card.suit == trump_suit:
            return 50 + card.rank.value  # Trump cards
        
        return card.rank.value  # Regular cards
    
    def choose_discard(self, hand: List[Card], trump_suit: Suit) -> Card:
        """Choose card to discard when dealer picks up trump"""
        non_trump_cards = [card for card in hand if not self.is_trump(card, trump_suit)]
        
        if non_trump_cards:
            # Discard lowest non-trump card
            return min(non_trump_cards, key=lambda c: c.rank.value)
        else:
            # All trump - discard lowest trump
            return min(hand, key=lambda c: self.get_card_value(c, trump_suit))

class AIManager:
    def __init__(self):
        self.ai_players = {}
        self.ai_timers = {}
    
    def create_ai_player(self, player_id: str) -> EuchreAI:
        """Create a new AI player with random personality"""
        personality = random.choice(AI_PERSONALITIES)
        ai = EuchreAI(personality)
        self.ai_players[player_id] = ai
        return ai
    
    def get_ai_player(self, player_id: str) -> Optional[EuchreAI]:
        """Get AI player by ID"""
        return self.ai_players.get(player_id)
    
    def remove_ai_player(self, player_id: str):
        """Remove AI player"""
        if player_id in self.ai_players:
            del self.ai_players[player_id]
        if player_id in self.ai_timers:
            self.ai_timers[player_id].cancel()
            del self.ai_timers[player_id]
    
    async def schedule_ai_action(self, player_id: str, action_func, delay: float = 2.0):
        """Schedule an AI action with realistic delay"""
        if player_id in self.ai_timers:
            self.ai_timers[player_id].cancel()
        
        self.ai_timers[player_id] = asyncio.create_task(
            self._delayed_action(action_func, delay)
        )
    
    async def _delayed_action(self, action_func, delay: float):
        """Execute action after delay"""
        await asyncio.sleep(delay)
        await action_func()

# Global AI manager instance
ai_manager = AIManager()