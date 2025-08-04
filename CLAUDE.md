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
- **`index.html`**: Single-page application with responsive game screens and dynamic layouts
- **`game-client.js`**: WebSocket client, game state management, UI interactions, and advanced game mechanics
- **`styles.css`**: Modern responsive CSS with animations, visual feedback, and adaptive layouts

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
- Fully responsive design with CSS clamp() functions and dynamic viewport units
- No registration system - jump-in gameplay
- Advanced UI features: playable card indicators, trick completion displays, winner highlighting
- Dynamic player positioning system (current player always at bottom)
- Real-time visual feedback for game actions and card playability

## Recent UI/UX Improvements

### Responsive Design Overhaul
- Comprehensive responsive design using CSS clamp() functions for scaling
- Dynamic viewport units (100dvh) for optimal screen utilization
- Flexible layouts that adapt to different screen sizes without scrolling
- Enhanced card sizing and spacing for better visual hierarchy

### Enhanced Game Experience
- **Dynamic Player Positioning**: Current player's cards always appear at bottom with larger size
- **Playable Card Indicators**: Green glow and upward movement for selectable cards
- **Complete Trick Display**: All 4 cards visible for 5 seconds after trick completion
- **Winner Highlighting**: Current winning card highlighted with golden glow during active tricks
- **Streamlined Interface**: Removed action panel for cleaner gameplay experience
- **Game Log Integration**: Real-time game events replace waiting messages

### Advanced Card Game Features
- Sophisticated card playability logic following Euchre rules (suit following, trump handling)
- Dealer discard functionality with proper phase handling
- Trick completion system with local data storage to prevent server clearing issues
- Visual feedback for all game actions and state changes
- Automatic positioning system that adapts to different player perspectives

### Technical Implementation Details
- **CSS Animations**: Smooth transitions for card movements and state changes
- **JavaScript State Management**: Local storage of trick data for enhanced display control
- **Dynamic CSS Classes**: Real-time class assignment based on game state
- **Responsive Breakpoints**: Optimized layouts for desktop, tablet, and mobile
- **Performance Optimizations**: Efficient DOM manipulation and event handling

## File Dependencies

- Backend depends on: `fastapi>=0.104.0`, `uvicorn[standard]>=0.24.0`, `websockets>=12.0`, `python-multipart>=0.0.6`
- Frontend has no external dependencies (pure vanilla JS/CSS/HTML)
- Static files served by FastAPI StaticFiles middleware