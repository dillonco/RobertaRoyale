# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Roberta Royale is a real-time multiplayer online Euchre game with a Python FastAPI backend and vanilla JavaScript frontend. The game supports 4 players with WebSocket communication, AI players, and full Euchre rules implementation.

## Development Commands

### Backend Development
```bash
# Start development server (from backend/ directory)
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Alternative: run directly
python main.py

# Install dependencies (from backend/ directory)
pip install -e .
```

### Frontend Development
- No build process required - static files served directly
- Frontend files served at http://localhost:8000
- Static assets in `/static` directory

## Architecture Overview

### Backend Structure (`backend/`)
- **`main.py`**: FastAPI application with WebSocket handlers, room management, and AI integration
- **`game_logic.py`**: Core Euchre game engine with rules, card logic, and state management
- **`ai_player.py`**: AI player implementation with decision-making algorithms
- **`pyproject.toml`**: Python dependencies (FastAPI, uvicorn, websockets)

### Frontend Structure (`frontend/`)
- **`index.html`**: Single-page application with all game screens
- **`game-client.js`**: WebSocket client, game state management, and UI interactions
- **`styles.css`**: Modern CSS with animations and responsive design

### Key Technical Patterns

**WebSocket Communication**: Real-time bidirectional communication using FastAPI WebSockets
- Message-based protocol with typed message handlers
- Automatic reconnection with exponential backoff
- Player connection status tracking

**Game State Management**: 
- Server maintains authoritative game state
- Each player receives personalized game state (hand, perspective)
- State synchronization after every action

**Room-Based Architecture**:
- 6-character room codes for game sessions
- Connection manager handles player lifecycle
- Automatic cleanup of empty rooms

**AI Integration**:
- Pluggable AI system with separate AI players
- AI actions delayed to simulate human timing
- AI decisions based on game state analysis

## Euchre Game Rules Implementation

**Card System**: 24-card deck (9, 10, J, Q, K, A) with trump suit mechanics
**Teams**: Fixed partnerships (North/South vs East/West)
**Scoring**: First to 10 points wins, with euchre and going-alone bonuses
**Trump Selection**: Two-round bidding system with dealer advantage

## Development Notes

- Uses vanilla JavaScript for frontend (no framework dependencies)
- WebSocket connections managed through ConnectionManager class
- Game logic separated from server logic for clean architecture
- AI players seamlessly integrated into multiplayer flow
- Responsive design works on desktop and tablet
- No registration system - jump-in gameplay

## File Dependencies

- Backend depends on: `fastapi>=0.104.0`, `uvicorn[standard]>=0.24.0`, `websockets>=12.0`, `python-multipart>=0.0.6`
- Frontend has no external dependencies (pure vanilla JS/CSS/HTML)
- Static files served by FastAPI StaticFiles middleware