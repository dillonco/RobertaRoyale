# Roberta Royale - Online Euchre Game

A modern, real-time multiplayer Euchre game built with Python FastAPI backend and vanilla JavaScript frontend. Play with friends online with smooth animations, responsive design, and full Euchre rules implementation.

## Features

### 🎮 Complete Euchre Experience
- **Full 4-player Euchre** with fixed partnerships (North/South vs East/West)
- **24-card deck** (9, 10, J, Q, K, A in each suit)
- **Trump suit selection** with proper ordering/passing mechanics
- **Jack rankings** (jack of trump suit and jack of same color)
- **Going alone** option for ambitious players
- **Proper scoring** - first to 10 points wins
- **Euchre scoring rules**:
  - 1 point for 3-4 tricks
  - 2 points for all 5 tricks (euchre)
  - 4 points for going alone and taking all 5

### 🎨 Modern UI/UX
- **Beautiful card animations** - dealing, playing, and collecting tricks
- **Smooth screen transitions** and responsive design
- **Visual indicators** for current dealer, trump suit, and game state
- **Real-time connection status** and player disconnect handling
- **Clean, modern aesthetic** with glassmorphism design
- **Responsive layout** that works on desktop and tablet

### 🌐 Multiplayer Features
- **No registration required** - jump right into games
- **Room-based system** with 6-character join codes
- **Real-time WebSocket communication** for instant updates
- **Player disconnect/reconnect handling** with game state persistence
- **Connection status indicators** show who's online

## Project Structure

```
RobertaRoyale/
├── backend/                 # Python FastAPI server
│   ├── main.py             # FastAPI app and WebSocket handlers
│   ├── game_logic.py       # Core Euchre game rules and logic
│   └── pyproject.toml      # Python dependencies
├── frontend/               # Client-side application
│   ├── index.html          # Main HTML structure
│   ├── styles.css          # Modern CSS with animations
│   └── game-client.js      # JavaScript game client
├── static/                 # Static assets (for future card images)
└── README.md              # This file
```

## Setup and Installation

### Prerequisites
- Python 3.8 or higher
- A modern web browser

### Installation Steps

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd RobertaRoyale
   ```

2. **Set up the Python backend**
   ```bash
   cd backend
   pip install -e .
   ```

3. **Install dependencies manually if needed**
   ```bash
   pip install fastapi uvicorn websockets python-multipart
   ```

## Running the Application

### Start the Backend Server

From the `backend` directory:

```bash
# For development (with auto-reload)
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# For production
uvicorn main:app --host 0.0.0.0 --port 8000
```

Alternatively, you can use the Python script directly:
```bash
python main.py
```

### Access the Game

1. Open your web browser
2. Navigate to `http://localhost:8000`
3. Enter your name and either:
   - **Create Room** to start a new game
   - **Join Room** with a 6-character room code

### Playing with Friends

1. One player creates a room and shares the 6-character room code
2. Other players join using the room code
3. Game starts automatically when 4 players have joined
4. Follow standard Euchre rules and enjoy!

## How to Play Euchre

### Basic Rules
1. **Teams**: North/South vs East/West (fixed partnerships)
2. **Goal**: First team to 10 points wins
3. **Dealing**: 5 cards to each player, rotate dealer clockwise
4. **Trump Selection**: 
   - Round 1: Players can "order up" the turned card or pass
   - Round 2: Players can name any suit except the turned-down suit
5. **Playing**: Follow suit if possible, highest card wins trick
6. **Scoring**: 
   - 3-4 tricks = 1 point
   - All 5 tricks = 2 points
   - Going alone with all 5 tricks = 4 points
   - Getting euchred (trump makers win <3 tricks) = 2 points for opponents

### Trump Card Rankings (High to Low)
1. Jack of trump suit (Right Bower)
2. Jack of same color (Left Bower)
3. Ace of trump
4. King of trump
5. Queen of trump
6. 10 of trump
7. 9 of trump

## Technical Details

### Backend Architecture
- **FastAPI** for HTTP and WebSocket server
- **Real-time WebSocket communication** for multiplayer functionality
- **Room-based game management** with automatic cleanup
- **Comprehensive game state tracking** with disconnect handling

### Frontend Architecture
- **Vanilla JavaScript** - no frameworks, pure performance
- **Modern CSS** with CSS Grid, Flexbox, and animations
- **WebSocket client** with automatic reconnection
- **Responsive design** using CSS media queries

### Key Features
- **Connection management** with exponential backoff reconnection
- **Game state synchronization** across all clients
- **Smooth animations** for card dealing, playing, and collecting
- **Visual feedback** for game actions and player states
- **Error handling** with user-friendly messages

## Browser Compatibility

- **Chrome/Edge** 88+
- **Firefox** 85+
- **Safari** 14+

## Development

### Running in Development Mode

The server includes auto-reload for development:
```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Project Architecture

The application follows a clean separation between:
- **Game Logic** (`game_logic.py`) - Pure Python Euchre rules
- **Server Logic** (`main.py`) - WebSocket handling and room management  
- **Client Logic** (`game-client.js`) - UI and server communication
- **Styling** (`styles.css`) - Modern, responsive design

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is open source. Feel free to use, modify, and distribute.

## Support

If you encounter any issues:
1. Check that the server is running on port 8000
2. Ensure your browser supports WebSockets
3. Try refreshing the page to reconnect
4. Check the browser console for error messages

Enjoy playing Roberta Royale! 🎯♠️♥️♦️♣️
