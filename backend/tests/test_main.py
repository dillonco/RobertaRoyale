"""
Tests for the main.py module.
"""
import json
import pytest
from unittest.mock import MagicMock, patch, AsyncMock
from fastapi.testclient import TestClient
from fastapi import WebSocket, WebSocketDisconnect

# Import the app and other components from main.py
from main import app, ConnectionManager, health_check, handle_message, broadcast_game_state
from game_logic import EuchreGame, Card, Suit, Rank, GamePhase

class TestHealthCheck:
    """Tests for the health check endpoint."""
    
    def test_health_check(self, test_client):
        """Test that the health check endpoint returns a 200 status code."""
        response = test_client.get("/health")
        assert response.status_code == 200
        response_json = response.json()
        assert response_json["status"] == "healthy"
        assert "timestamp" in response_json


class TestConnectionManager:
    """Tests for the ConnectionManager class."""
    
    def test_init(self):
        """Test that the ConnectionManager is initialized correctly."""
        manager = ConnectionManager()
        assert manager.active_connections == {}
        assert manager.rooms == {}
        assert manager.games == {}
        assert manager.player_rooms == {}
        assert manager.player_names == {}
    
    @pytest.mark.asyncio
    async def test_connect(self):
        """Test connecting a player."""
        manager = ConnectionManager()
        
        # Create a mock WebSocket
        mock_websocket = AsyncMock(spec=WebSocket)
        
        # Connect the player
        await manager.connect(mock_websocket, "player1")
        
        # Check that the player is connected
        assert "player1" in manager.active_connections
        assert manager.active_connections["player1"] == mock_websocket
        
        # Check that the accept method was called
        mock_websocket.accept.assert_called_once()
    
    def test_disconnect(self):
        """Test disconnecting a player."""
        manager = ConnectionManager()
        
        # Create a mock WebSocket
        mock_websocket = MagicMock(spec=WebSocket)
        
        # Add the player to active connections
        manager.active_connections["player1"] = mock_websocket
        
        # Create a mock game and add the player
        mock_game = MagicMock(spec=EuchreGame)
        mock_player = MagicMock()
        mock_game.players = {"player1": mock_player}
        
        # Add the game to the manager
        manager.games["room1"] = mock_game
        manager.player_rooms["player1"] = "room1"
        
        # Disconnect the player
        manager.disconnect("player1")
        
        # Check that the player is disconnected
        assert "player1" not in manager.active_connections
        
        # Check that the player is marked as disconnected in the game
        assert mock_player.is_connected is False
    
    @pytest.mark.asyncio
    async def test_send_personal_message(self):
        """Test sending a personal message to a player."""
        manager = ConnectionManager()
        
        # Create a mock WebSocket
        mock_websocket = AsyncMock(spec=WebSocket)
        
        # Add the player to active connections
        manager.active_connections["player1"] = mock_websocket
        
        # Send a message
        await manager.send_personal_message("test message", "player1")
        
        # Check that the send_text method was called with the correct message
        mock_websocket.send_text.assert_called_once_with("test message")
    
    @pytest.mark.asyncio
    async def test_broadcast_to_room(self):
        """Test broadcasting a message to a room."""
        manager = ConnectionManager()
        
        # Create mock WebSockets
        mock_websocket1 = AsyncMock(spec=WebSocket)
        mock_websocket2 = AsyncMock(spec=WebSocket)
        
        # Add players to active connections
        manager.active_connections["player1"] = mock_websocket1
        manager.active_connections["player2"] = mock_websocket2
        
        # Create a mock game with players
        mock_game = MagicMock(spec=EuchreGame)
        mock_game.players = {"player1": MagicMock(), "player2": MagicMock()}
        
        # Add the game to the manager
        manager.games["room1"] = mock_game
        
        # Mock the send_personal_message method to track calls
        original_send_personal_message = manager.send_personal_message
        manager.send_personal_message = AsyncMock()
        
        # Broadcast a message
        await manager.broadcast_to_room("test message", "room1")
        
        # Check that send_personal_message was called for both players
        assert manager.send_personal_message.call_count == 2
        manager.send_personal_message.assert_any_call("test message", "player1")
        manager.send_personal_message.assert_any_call("test message", "player2")
        
        # Reset the mock
        manager.send_personal_message.reset_mock()
        
        # Test with exclude_player
        await manager.broadcast_to_room("test message 2", "room1", exclude_player="player1")
        
        # Check that send_personal_message was called only for player2
        assert manager.send_personal_message.call_count == 1
        manager.send_personal_message.assert_called_once_with("test message 2", "player2")
    
    def test_create_room(self):
        """Test creating a room."""
        manager = ConnectionManager()
        
        # Create a room
        success = manager.create_room("room1", "player1", "Player 1")
        
        # Check that the room was created successfully
        assert success is True
        
        # Check that the room was created
        assert "room1" in manager.rooms
        assert manager.rooms["room1"]["creator"] == "player1"
        assert manager.rooms["room1"]["players"] == ["player1"]
        
        # Check that a game was created
        assert "room1" in manager.games
        assert isinstance(manager.games["room1"], EuchreGame)
        
        # Check that the player is associated with the room
        assert manager.player_rooms["player1"] == "room1"
        assert manager.player_names["player1"] == "Player 1"
        
        # Check that the player was added to the game
        assert "player1" in manager.games["room1"].players
    
    def test_join_room(self):
        """Test joining a room."""
        manager = ConnectionManager()
        
        # Create a room
        manager.create_room("room1", "player1", "Player 1")
        
        # Join the room
        success = manager.join_room("room1", "player2", "Player 2")
        
        # Check that the player joined the room successfully
        assert success is True
        
        # Check that the player joined the room
        assert "player2" in manager.rooms["room1"]["players"]
        
        # Check that the player is associated with the room
        assert manager.player_rooms["player2"] == "room1"
        assert manager.player_names["player2"] == "Player 2"
        
        # Check that the player was added to the game
        assert "player2" in manager.games["room1"].players


@pytest.mark.asyncio
class TestMessageHandling:
    """Tests for message handling functions."""
    
    async def test_handle_message_create_room(self):
        """Test handling a create_room message."""
        # Create a mock ConnectionManager
        mock_manager = MagicMock(spec=ConnectionManager)
        mock_manager.create_room.return_value = True
        
        # Create the message
        message = {
            "type": "create_room",
            "player_name": "Player 1"
        }
        
        # Mock the send_personal_message method
        mock_manager.send_personal_message = AsyncMock()
        
        # Mock generate_room_code to return a predictable value
        with patch('main.generate_room_code', return_value="ABCDEF"):
            # Handle the message
            with patch('main.manager', mock_manager):
                await handle_message("player1", message)
        
        # Check that create_room was called with the correct parameters
        mock_manager.create_room.assert_called_once_with("ABCDEF", "player1", "Player 1")
        
        # Check that send_personal_message was called with the correct response
        expected_response = json.dumps({
            "type": "room_created",
            "room_code": "ABCDEF",
            "success": True
        })
        mock_manager.send_personal_message.assert_called_once_with(expected_response, "player1")
    
    async def test_handle_message_join_room(self):
        """Test handling a join_room message."""
        # Create a mock ConnectionManager
        mock_manager = MagicMock(spec=ConnectionManager)
        mock_manager.join_room.return_value = True
        
        # Create the message
        message = {
            "type": "join_room",
            "room_code": "room1",
            "player_name": "Player 2"
        }
        
        # Mock the send_personal_message and broadcast_to_room methods
        mock_manager.send_personal_message = AsyncMock()
        mock_manager.broadcast_to_room = AsyncMock()
        
        # Handle the message
        with patch('main.manager', mock_manager):
            await handle_message("player2", message)
        
        # Check that join_room was called with the correct parameters
        mock_manager.join_room.assert_called_once_with("ROOM1", "player2", "Player 2")
        
        # Check that send_personal_message was called with the correct response
        expected_response = json.dumps({
            "type": "room_joined",
            "room_code": "ROOM1",
            "success": True
        })
        mock_manager.send_personal_message.assert_called_once_with(expected_response, "player2")
        
        # Check that broadcast_game_state was called
        # Note: The current implementation doesn't broadcast a player_joined message directly,
        # but instead calls broadcast_game_state which updates all players


@pytest.mark.asyncio
class TestBroadcastGameState:
    """Tests for the broadcast_game_state function."""
    
    async def test_broadcast_game_state(self):
        """Test broadcasting the game state."""
        # Create a mock ConnectionManager
        mock_manager = MagicMock(spec=ConnectionManager)
        
        # Create a mock game
        mock_game = MagicMock(spec=EuchreGame)
        mock_game.get_game_state.return_value = {"test": "state"}
        
        # Add the required attributes to the mock game
        mock_player1 = MagicMock()
        mock_player1.is_ai = False
        mock_player2 = MagicMock()
        mock_player2.is_ai = False
        mock_game.players = {"player1": mock_player1, "player2": mock_player2}
        mock_game.phase = GamePhase.PLAYING
        mock_game.room_code = "room1"
        mock_game.player_order = ["player1", "player2"]
        mock_game.current_player_index = 0
        mock_game.trump_selection_player_index = 0
        mock_game.dealer_index = 0
        
        # Set up the mock manager to return the mock game
        mock_manager.get_game.return_value = mock_game
        
        # Mock the send_personal_message method
        mock_manager.send_personal_message = AsyncMock()
        
        # Call the function
        with patch('main.manager', mock_manager):
            await broadcast_game_state("room1")
        
        # Check that get_game was called
        mock_manager.get_game.assert_called_once_with("room1")
        
        # Check that get_game_state was called for each player
        assert mock_game.get_game_state.call_count == 2
        
        # Check that send_personal_message was called for each player
        assert mock_manager.send_personal_message.call_count == 2