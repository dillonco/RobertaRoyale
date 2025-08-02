import json
import logging
import random
from datetime import datetime
from pathlib import Path
from typing import Dict, Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from ai_player import ai_manager
from game_logic import EuchreGame, Suit, Card, Rank

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Euchre Game Server", version="1.0.0")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static files are served through frontend mount below

# Game state storage
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
        self.rooms: Dict[str, Dict] = {}
        self.games: Dict[str, EuchreGame] = {}
        self.player_rooms: Dict[str, str] = {}
        self.player_names: Dict[str, str] = {}

    async def connect(self, websocket: WebSocket, player_id: str):
        await websocket.accept()
        self.active_connections[player_id] = websocket
        logger.info(f"Player {player_id} connected")

    def disconnect(self, player_id: str):
        if player_id in self.active_connections:
            del self.active_connections[player_id]
        
        # Mark player as disconnected in game
        if player_id in self.player_rooms:
            room_code = self.player_rooms[player_id]
            if room_code in self.games:
                game = self.games[room_code]
                if player_id in game.players:
                    game.players[player_id].is_connected = False
        
        logger.info(f"Player {player_id} disconnected")

    async def send_personal_message(self, message: str, player_id: str):
        if player_id in self.active_connections:
            websocket = self.active_connections[player_id]
            try:
                await websocket.send_text(message)
            except:
                self.disconnect(player_id)

    async def broadcast_to_room(self, message: str, room_code: str, exclude_player: str = None):
        if room_code in self.games:
            game = self.games[room_code]
            for player_id in game.players:
                if player_id != exclude_player:
                    await self.send_personal_message(message, player_id)

    def create_room(self, room_code: str, creator_id: str, player_name: str):
        self.rooms[room_code] = {
            'players': [creator_id],
            'created_at': datetime.now(),
            'creator': creator_id
        }
        self.player_rooms[creator_id] = room_code
        self.player_names[creator_id] = player_name
        
        # Create game instance
        game = EuchreGame(room_code)
        game.add_player(creator_id, player_name)
        self.games[room_code] = game
        
        return True

    def join_room(self, room_code: str, player_id: str, player_name: str):
        if room_code not in self.rooms:
            return False
        
        room = self.rooms[room_code]
        if len(room['players']) >= 4:
            return False
        
        if player_id not in room['players']:
            room['players'].append(player_id)
            self.player_rooms[player_id] = room_code
            self.player_names[player_id] = player_name
            
            # Add player to game
            if room_code in self.games:
                self.games[room_code].add_player(player_id, player_name)
        
        return True

    def get_room_info(self, room_code: str):
        if room_code in self.rooms:
            room = self.rooms[room_code]
            return {
                'room_code': room_code,
                'players': room['players'],
                'player_count': len(room['players']),
                'created_at': room['created_at'].isoformat()
            }
        return None
    
    def get_game(self, room_code: str) -> Optional[EuchreGame]:
        return self.games.get(room_code)
    
    def get_player_game(self, player_id: str) -> Optional[EuchreGame]:
        if player_id in self.player_rooms:
            room_code = self.player_rooms[player_id]
            return self.games.get(room_code)
        return None
    
    async def send_reconnection_data(self, player_id: str, game: EuchreGame):
        """Send current game state to reconnected player"""
        game_state = game.get_game_state(player_id)
        response = {
            'type': 'reconnected',
            'game_state': game_state
        }
        await self.send_personal_message(json.dumps(response), player_id)
        
        # Notify other players about reconnection
        reconnection_notice = {
            'type': 'player_reconnected',
            'player_id': player_id,
            'player_name': self.player_names.get(player_id, 'Unknown Player')
        }
        await self.broadcast_to_room(json.dumps(reconnection_notice), game.room_code, exclude_player=player_id)

manager = ConnectionManager()


@app.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}

@app.websocket("/ws/{player_id}")
async def websocket_endpoint(websocket: WebSocket, player_id: str):
    await manager.connect(websocket, player_id)
    try:
        while True:
            data = await websocket.receive_text()
            logger.info(f"Raw WebSocket data received from {player_id}: {data}")
            message = json.loads(data)
            await handle_message(player_id, message)
    except WebSocketDisconnect:
        manager.disconnect(player_id)
    except Exception as e:
        logger.error(f"WebSocket error for player {player_id}: {e}")
        manager.disconnect(player_id)

async def handle_message(player_id: str, message: dict):
    message_type = message.get('type')
    logger.info(f"Received message from player {player_id}: {message_type}")
    
    if message_type == 'create_room':
        player_name = message.get('player_name', f'Player {player_id[:6]}')
        room_code = generate_room_code()
        success = manager.create_room(room_code, player_id, player_name)
        response = {
            'type': 'room_created',
            'room_code': room_code,
            'success': success
        }
        await manager.send_personal_message(json.dumps(response), player_id)
        
        if success:
            # Send initial game state to show the creator in the room
            await broadcast_game_state(room_code)
    
    elif message_type == 'join_room':
        room_code = message.get('room_code', '').upper()
        player_name = message.get('player_name', f'Player {player_id[:6]}')
        success = manager.join_room(room_code, player_id, player_name)
        response = {
            'type': 'room_joined',
            'room_code': room_code,
            'success': success
        }
        await manager.send_personal_message(json.dumps(response), player_id)
        
        if success:
            # Send game state to all players
            await broadcast_game_state(room_code)
    
    elif message_type == 'check_reconnection':
        # Check if player can reconnect to existing game
        if player_id in manager.player_rooms:
            room_code = manager.player_rooms[player_id]
            if room_code in manager.games:
                game = manager.games[room_code]
                if player_id in game.players:
                    game.players[player_id].is_connected = True
                    # Send current game state to reconnected player
                    await manager.send_reconnection_data(player_id, game)
                    return
        
        # No valid reconnection available
        response = {
            'type': 'no_reconnection_available'
        }
        await manager.send_personal_message(json.dumps(response), player_id)
    
    elif message_type == 'get_game_state':
        game = manager.get_player_game(player_id)
        if game:
            game_state = game.get_game_state(player_id)
            response = {
                'type': 'game_state',
                'game_state': game_state
            }
            await manager.send_personal_message(json.dumps(response), player_id)
    
    elif message_type == 'trump_selection':
        game = manager.get_player_game(player_id)
        if game:
            action = message.get('action')  # 'order_up', 'pass', 'name_trump'
            suit = None
            if action == 'name_trump':
                suit_str = message.get('suit')
                if suit_str:
                    suit = Suit(suit_str)
            
            success = game.handle_trump_selection(player_id, action, suit)
            if success:
                await broadcast_game_state(game.room_code)
    
    elif message_type == 'going_alone':
        game = manager.get_player_game(player_id)
        if game:
            going_alone = message.get('going_alone', False)
            success = game.handle_going_alone(player_id, going_alone)
            if success:
                await broadcast_game_state(game.room_code)
    
    elif message_type == 'play_card':
        game = manager.get_player_game(player_id)
        if game:
            card_data = message.get('card')
            if card_data:
                suit = Suit(card_data['suit'])
                rank = Rank(card_data['rank'])
                card = Card(suit, rank)
                
                success = game.play_card(player_id, card)
                if success:
                    await broadcast_game_state(game.room_code)
    
    elif message_type == 'discard_card':
        # Handle dealer discarding after picking up trump card
        game = manager.get_player_game(player_id)
        if game:
            card_data = message.get('card')
            if card_data:
                suit = Suit(card_data['suit'])
                rank = Rank(card_data['rank'])
                card = Card(suit, rank)
                
                # Use the game logic to handle discard
                success = game.handle_dealer_discard(player_id, card)
                if success:
                    await broadcast_game_state(game.room_code)
    
    elif message_type == 'leave_room':
        # Remove player from room and game
        if player_id in manager.player_rooms:
            room_code = manager.player_rooms[player_id]
            del manager.player_rooms[player_id]
            
            if player_id in manager.player_names:
                del manager.player_names[player_id]
            
            if room_code in manager.games:
                game = manager.games[room_code]
                if player_id in game.players:
                    del game.players[player_id]
                    
                    # Remove from player order
                    if player_id in game.player_order:
                        game.player_order.remove(player_id)
                    
                    # Clean up empty room
                    if len(game.players) == 0:
                        del manager.games[room_code]
                        if room_code in manager.rooms:
                            del manager.rooms[room_code]
        
        response = {
            'type': 'left_room',
            'success': True
        }
        await manager.send_personal_message(json.dumps(response), player_id)
    
    elif message_type == 'add_ai_player':
        # Add AI player to the room
        if player_id in manager.player_rooms:
            room_code = manager.player_rooms[player_id]
            if room_code in manager.games:
                game = manager.games[room_code]
                if len(game.players) < 4:
                    # Generate AI player ID and create AI
                    ai_player_id = f"ai_{len(game.players)}_{room_code}"
                    ai = ai_manager.create_ai_player(ai_player_id)
                    
                    # Add AI to game
                    success = game.add_player(ai_player_id, ai.name, is_ai=True)
                    if success:
                        manager.player_rooms[ai_player_id] = room_code
                        manager.player_names[ai_player_id] = ai.name
                        await broadcast_game_state(room_code)
    
    elif message_type == 'start_game' or message_type == 'start_game_with_ai':
        # Start game if exactly 4 players are present
        logger.info(f"Received {message_type} message from player {player_id}")
        if player_id in manager.player_rooms:
            room_code = manager.player_rooms[player_id]
            logger.info(f"Player {player_id} is in room {room_code}")
            if room_code in manager.games:
                game = manager.games[room_code]
                logger.info(f"Game found for room {room_code}, current players: {len(game.players)}")
                
                # If start_game_with_ai and not enough players, fill with AI
                if message_type == 'start_game_with_ai' and len(game.players) < 4:
                    while len(game.players) < 4:
                        ai_player_id = f"ai_{len(game.players)}_{room_code}"
                        ai = ai_manager.create_ai_player(ai_player_id)
                        game.add_player(ai_player_id, ai.name, is_ai=True)
                        manager.player_rooms[ai_player_id] = room_code
                        manager.player_names[ai_player_id] = ai.name
                
                # Only start if exactly 4 players
                logger.info(f"Checking if can start game: {len(game.players)} players, game phase: {game.phase}")
                if len(game.players) == 4:
                    logger.info("Starting game...")
                    success = game.start_game()
                    logger.info(f"Game start success: {success}")
                    if success:
                        await broadcast_game_state(room_code)
                else:
                    logger.info(f"Cannot start game - need 4 players, have {len(game.players)}")
            else:
                logger.error(f"No game found for room {room_code}")
        else:
            logger.error(f"Player {player_id} not in any room")

async def broadcast_game_state(room_code: str):
    """Broadcast current game state to all players in room"""
    game = manager.get_game(room_code)
    if game:
        for player_id in game.players:
            game_state = game.get_game_state(player_id)
            response = {
                'type': 'game_state',
                'game_state': game_state
            }
            await manager.send_personal_message(json.dumps(response), player_id)
        
        # Check if it's an AI player's turn and schedule their action
        await check_ai_turn(game)

async def check_ai_turn(game: EuchreGame):
    """Check if it's an AI player's turn and schedule their action"""
    current_player_id = None
    
    if game.phase.value == 'trump_selection':
        current_player_id = game.player_order[game.trump_selection_player_index]
    elif game.phase.value == 'dealer_discard':
        current_player_id = game.player_order[game.dealer_index]
    elif game.phase.value == 'playing':
        current_player_id = game.player_order[game.current_player_index]
    
    if current_player_id and current_player_id in game.players:
        player = game.players[current_player_id]
        if player.is_ai:
            ai = ai_manager.get_ai_player(current_player_id)
            if ai:
                await ai_manager.schedule_ai_action(
                    current_player_id,
                    lambda: make_ai_decision(game, current_player_id, ai),
                    delay=1.5 + random.uniform(0.5, 2.0)  # Random delay 2-3.5 seconds
                )

async def make_ai_decision(game: EuchreGame, player_id: str, ai):
    """Make AI decision based on current game state"""
    try:
        if game.phase.value == 'trump_selection':
            await handle_ai_trump_selection(game, player_id, ai)
        elif game.phase.value == 'dealer_discard':
            await handle_ai_dealer_discard(game, player_id, ai)
        elif game.phase.value == 'playing':
            await handle_ai_card_play(game, player_id, ai)
    except Exception as e:
        logger.error(f"AI decision error for {player_id}: {e}")

async def handle_ai_trump_selection(game: EuchreGame, player_id: str, ai):
    """Handle AI trump selection decision"""
    player = game.players[player_id]
    is_dealer = game.dealer_index == player.position
    
    should_call, suit = ai.should_call_trump(
        player.hand, 
        game.trump_card, 
        is_dealer, 
        game.trump_selection_round
    )
    
    if should_call and suit:
        action = 'order_up' if game.trump_selection_round == 1 else 'name_trump'
        success = game.handle_trump_selection(player_id, action, suit)
        if success:
            # Check if AI should go alone
            if ai.should_go_alone(player.hand, suit):
                game.handle_going_alone(player_id, True)
            
            await broadcast_game_state(game.room_code)
    else:
        # AI passes
        success = game.handle_trump_selection(player_id, 'pass')
        if success:
            await broadcast_game_state(game.room_code)

async def handle_ai_dealer_discard(game: EuchreGame, player_id: str, ai):
    """Handle AI dealer discard decision"""
    player = game.players[player_id]
    
    # AI chooses which card to discard
    card_to_discard = ai.choose_discard(player.hand, game.trump_suit)
    if card_to_discard in player.hand:
        success = game.handle_dealer_discard(player_id, card_to_discard)
        if success:
            await broadcast_game_state(game.room_code)

async def handle_ai_card_play(game: EuchreGame, player_id: str, ai):
    """Handle AI card playing decision"""
    player = game.players[player_id]
    
    # Normal card play
    if game.current_player_index == player.position:
        game_state = game.get_game_state(player_id)
        card_to_play = ai.choose_card_to_play(
            player.hand, 
            game_state, 
            game.current_trick.cards
        )
        
        success = game.play_card(player_id, card_to_play)
        if success:
            await broadcast_game_state(game.room_code)

def generate_room_code(length: int = 6) -> str:
    import random
    import string
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=length))

# Mount frontend files (must be last to avoid conflicts with API routes)
frontend_dir = Path(__file__).parent.parent / "frontend"
app.mount("/", StaticFiles(directory=str(frontend_dir), html=True), name="frontend")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)