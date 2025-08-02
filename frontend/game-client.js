class EuchreClient {
    constructor() {
        this.ws = null;
        this.playerId = this.loadOrGeneratePlayerId();
        this.gameState = null;
        this.currentScreen = 'main-menu';
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.dealingAnimationStarted = false;
        this.hasLeftRoom = this.getLeftRoomFlag(); // Load flag from localStorage
        
        this.init();
    }

    generatePlayerId() {
        return 'player_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
    }

    loadOrGeneratePlayerId() {
        const stored = localStorage.getItem('euchre_player_id');
        if (stored) {
            return stored;
        }
        const newId = this.generatePlayerId();
        localStorage.setItem('euchre_player_id', newId);
        return newId;
    }

    saveGameSession(roomCode, playerName) {
        const sessionData = {
            playerId: this.playerId,
            roomCode: roomCode,
            playerName: playerName,
            timestamp: Date.now()
        };
        localStorage.setItem('euchre_session', JSON.stringify(sessionData));
    }

    loadGameSession() {
        const sessionData = localStorage.getItem('euchre_session');
        if (sessionData) {
            try {
                const parsed = JSON.parse(sessionData);
                // Only use session if it's less than 24 hours old
                if (Date.now() - parsed.timestamp < 24 * 60 * 60 * 1000) {
                    return parsed;
                }
            } catch (e) {
                console.error('Failed to parse session data:', e);
            }
        }
        return null;
    }

    clearGameSession() {
        localStorage.removeItem('euchre_session');
    }

    setLeftRoomFlag(value) {
        if (value) {
            localStorage.setItem('euchre_left_room', 'true');
        } else {
            localStorage.removeItem('euchre_left_room');
        }
        this.hasLeftRoom = value;
    }

    getLeftRoomFlag() {
        return localStorage.getItem('euchre_left_room') === 'true';
    }

    init() {
        this.setupEventListeners();
        this.connectWebSocket();
        this.updateConnectionStatus('connecting', 'Connecting...');
        
        // Try to restore previous session
        this.restoreSession();
    }

    restoreSession() {
        // Don't restore session if user explicitly left
        if (this.hasLeftRoom) {
            return;
        }
        
        const session = this.loadGameSession();
        if (session) {
            // Pre-fill the player name
            document.getElementById('player-name').value = session.playerName;
            
            // Show loading while attempting to reconnect
            this.showLoading();
            
            // Wait for WebSocket connection, then try to rejoin
            setTimeout(() => {
                this.attemptSessionReconnect(session);
            }, 1000);
        }
    }

    attemptSessionReconnect(session) {
        // Check if we can reconnect to existing game session
        this.sendMessage({
            type: 'check_reconnection'
        });
        
        // Hide loading after a timeout if no response
        this.reconnectTimeout = setTimeout(() => {
            this.hideLoading();
            this.showNotification('Could not reconnect to previous game', 'warning');
            this.clearGameSession();
        }, 5000);
    }

    setupEventListeners() {
        // Main Menu Events
        document.getElementById('create-room-btn').addEventListener('click', () => {
            const playerName = document.getElementById('player-name').value.trim();
            if (!playerName) {
                this.showMessage('Error', 'Please enter your name first.');
                return;
            }
            this.createRoom(playerName);
        });

        document.getElementById('join-room-btn').addEventListener('click', () => {
            const playerName = document.getElementById('player-name').value.trim();
            const roomCode = document.getElementById('room-code-input').value.trim().toUpperCase();
            
            if (!playerName) {
                this.showMessage('Error', 'Please enter your name first.');
                return;
            }
            
            if (!roomCode || roomCode.length !== 6) {
                this.showMessage('Error', 'Please enter a valid 6-character room code.');
                return;
            }
            
            this.joinRoom(roomCode, playerName);
        });

        // Auto-uppercase room code input
        document.getElementById('room-code-input').addEventListener('input', (e) => {
            e.target.value = e.target.value.toUpperCase();
        });

        // Waiting Room Events
        document.getElementById('leave-room-btn').addEventListener('click', () => {
            this.leaveRoom();
        });

        document.getElementById('copy-room-code').addEventListener('click', () => {
            const roomCode = document.getElementById('room-code-large').textContent;
            navigator.clipboard.writeText(roomCode).then(() => {
                this.showNotification('Room code copied to clipboard!', 'success');
            }).catch(() => {
                this.showNotification('Failed to copy room code', 'error');
            });
        });

        // AI Controls Events
        document.getElementById('add-ai-btn').addEventListener('click', () => {
            this.addAIOpponent();
        });


        // Event Log Events
        document.getElementById('toggle-log-btn').addEventListener('click', () => {
            this.toggleEventLog();
        });

        // Game Events
        document.getElementById('leave-game-btn').addEventListener('click', () => {
            this.leaveRoom();
        });

        document.getElementById('new-game-btn').addEventListener('click', () => {
            this.startNewGame();
        });

        // Trump Selection Events
        document.getElementById('order-up-btn').addEventListener('click', () => {
            this.sendTrumpSelection('order_up');
        });

        document.getElementById('pass-btn').addEventListener('click', () => {
            this.sendTrumpSelection('pass');
        });

        // Suit Selection Events
        document.querySelectorAll('.suit-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const suit = btn.dataset.suit;
                this.sendTrumpSelection('name_trump', suit);
            });
        });

        // Going Alone Events
        document.getElementById('go-alone-btn').addEventListener('click', () => {
            this.sendGoingAlone(true);
        });

        document.getElementById('with-partner-btn').addEventListener('click', () => {
            this.sendGoingAlone(false);
        });

        // Message Overlay Events
        document.getElementById('message-ok-btn').addEventListener('click', () => {
            this.hideMessage();
        });

        // Keyboard Events
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.hideMessage();
                this.hideLoading();
            }
        });
    }

    connectWebSocket() {
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${wsProtocol}//${window.location.host}/ws/${this.playerId}`;
        
        try {
            this.ws = new WebSocket(wsUrl);
            
            this.ws.onopen = () => {
                console.log('WebSocket connected');
                this.updateConnectionStatus('connected', 'Connected');
                this.reconnectAttempts = 0;
            };

            this.ws.onmessage = (event) => {
                const message = JSON.parse(event.data);
                this.handleMessage(message);
            };

            this.ws.onclose = () => {
                console.log('WebSocket disconnected');
                this.updateConnectionStatus('disconnected', 'Disconnected');
                this.attemptReconnect();
            };

            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.updateConnectionStatus('disconnected', 'Connection Error');
            };
        } catch (error) {
            console.error('Failed to create WebSocket:', error);
            this.updateConnectionStatus('disconnected', 'Connection Failed');
        }
    }

    attemptReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            this.updateConnectionStatus('connecting', `Reconnecting... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
            
            setTimeout(() => {
                this.connectWebSocket();
            }, 2000 * this.reconnectAttempts);
        } else {
            this.updateConnectionStatus('disconnected', 'Connection Failed');
            this.showMessage('Connection Error', 'Unable to connect to the server. Please refresh the page and try again.');
        }
    }

    sendMessage(message) {
        console.log('Attempting to send message:', message);
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            console.log('WebSocket is open, sending message');
            this.ws.send(JSON.stringify(message));
            console.log('Message sent successfully');
        } else {
            console.error('WebSocket not connected. State:', this.ws ? this.ws.readyState : 'no ws');
            this.showMessage('Error', 'Not connected to server.');
        }
    }

    handleMessage(message) {
        console.log('Received message:', message);

        switch (message.type) {
            case 'room_created':
                if (message.success) {
                    const playerName = document.getElementById('player-name').value.trim();
                    this.saveGameSession(message.room_code, playerName);
                    this.showScreen('waiting-room');
                    document.getElementById('room-code-display').textContent = message.room_code;
                    document.getElementById('room-code-large').textContent = message.room_code;
                } else {
                    this.showMessage('Error', 'Failed to create room.');
                }
                break;

            case 'room_joined':
                if (message.success) {
                    const playerName = document.getElementById('player-name').value.trim();
                    this.saveGameSession(message.room_code, playerName);
                    this.showScreen('waiting-room');
                    document.getElementById('room-code-display').textContent = message.room_code;
                    document.getElementById('room-code-large').textContent = message.room_code;
                    
                    // Clear reconnect timeout if successful
                    if (this.reconnectTimeout) {
                        clearTimeout(this.reconnectTimeout);
                        this.reconnectTimeout = null;
                    }
                } else {
                    this.showMessage('Error', 'Failed to join room. Room may be full or not exist.');
                }
                this.hideLoading(); // Hide loading overlay after join attempt
                break;

            case 'game_state':
                this.gameState = message.game_state;
                this.updateGameDisplay();
                break;

            case 'reconnected':
                this.gameState = message.game_state;
                this.updateGameDisplay();
                this.hideLoading();
                this.showNotification('Successfully reconnected to your game!', 'success');
                break;

            case 'player_reconnected':
                this.showNotification(`${message.player_name} has reconnected`, 'success');
                break;

            case 'player_disconnected':
                this.showNotification(`${message.player_name} has disconnected`, 'warning');
                break;

            case 'no_reconnection_available':
                this.hideLoading();
                this.clearGameSession();
                break;

            default:
                console.log('Unknown message type:', message.type);
        }
    }

    updateGameDisplay() {
        if (!this.gameState) return;

        const phase = this.gameState.phase;
        
        // Show appropriate screen based on game phase
        if (phase === 'waiting_for_players') {
            this.showScreen('waiting-room');
            this.updateWaitingRoom();
        } else {
            this.showScreen('game-screen');
            this.updateGameScreen();
        }
    }

    updateWaitingRoom() {
        const playerSlots = document.querySelectorAll('.player-slot');
        
        // Reset all slots
        playerSlots.forEach((slot, index) => {
            const card = slot.querySelector('.player-card');
            const nameSpan = card.querySelector('.player-name');
            
            card.classList.remove('filled', 'ai');
            card.classList.add('empty');
            nameSpan.textContent = 'Waiting...';
        });

        // Fill slots with players
        if (this.gameState.players) {
            this.gameState.players.forEach(player => {
                const slot = document.querySelector(`[data-position="${player.position}"]`);
                if (slot) {
                    const card = slot.querySelector('.player-card');
                    const nameSpan = card.querySelector('.player-name');
                    
                    card.classList.remove('empty');
                    card.classList.add('filled');
                    
                    // Check if player is AI
                    if (player.is_ai) {
                        card.classList.add('ai');
                    }
                    
                    nameSpan.textContent = player.name;
                }
            });
        }

        // Update AI controls visibility
        this.updateAIControls();
    }

    updateAIControls() {
        const aiControls = document.getElementById('ai-controls');
        const roomStatus = document.getElementById('room-status');
        const addAIBtn = document.getElementById('add-ai-btn');
        const startGameBtn = document.getElementById('start-game-btn');
        
        if (!this.gameState || !this.gameState.players) {
            return;
        }

        const playerCount = this.gameState.players.length;
        const canAddAI = playerCount < 4;
        const canStartGame = playerCount === 4 && (this.gameState.phase === 'waiting_for_players' || this.gameState.phase === 'game_complete');
        console.log('Update AI Controls - Player count:', playerCount, 'Phase:', this.gameState.phase, 'Can start:', canStartGame);

        // Update room status text
        if (playerCount === 4) {
            roomStatus.textContent = 'Ready to start!';
        } else if (playerCount >= 2) {
            roomStatus.textContent = `Need ${4 - playerCount} more player${4 - playerCount === 1 ? '' : 's'}`;
        } else {
            roomStatus.textContent = `Need ${4 - playerCount} more players`;
        }

        // Show/hide AI controls based on player count
        aiControls.style.display = 'block';
        addAIBtn.style.display = canAddAI ? 'inline-block' : 'none';
        startGameBtn.style.display = canStartGame ? 'inline-block' : 'none';
    }

    updateGameScreen() {
        // Reset dealing animation flag when not in dealing phase
        if (this.gameState.phase !== 'dealing') {
            this.dealingAnimationStarted = false;
        }
        
        // Handle dealing phase with shuffling animation
        if (this.gameState.phase === 'dealing' && !this.dealingAnimationStarted) {
            this.startShufflingAndDealingAnimation();
            return; // Exit early - the animation will call updateGameScreen again when done
        }
        
        this.updateScores();
        this.updateTrumpDisplay();
        this.updatePlayerAreas();
        this.updateTrickArea();
        this.updateActionPanel();
        this.updateGameStatus();
        this.updateYourTurnIndicator();
        this.updateEventLog();
    }

    updateScores() {
        if (this.gameState.team_scores) {
            document.getElementById('team1-score').textContent = this.gameState.team_scores[0] || 0;
            document.getElementById('team2-score').textContent = this.gameState.team_scores[1] || 0;
        }
        
        // Update trick counters
        if (this.gameState.team_tricks) {
            document.getElementById('team1-tricks').textContent = this.gameState.team_tricks[0] || 0;
            document.getElementById('team2-tricks').textContent = this.gameState.team_tricks[1] || 0;
        } else {
            // Reset trick counters when not in playing phase
            document.getElementById('team1-tricks').textContent = '0';
            document.getElementById('team2-tricks').textContent = '0';
        }
    }

    updateTrumpDisplay() {
        const trumpCard = document.getElementById('trump-card-display');
        
        if (this.gameState.trump_card) {
            const card = this.gameState.trump_card;
            const rankSpan = trumpCard.querySelector('.card-rank');
            const suitSpan = trumpCard.querySelector('.card-suit');
            
            rankSpan.textContent = this.getCardRankDisplay(card.rank);
            suitSpan.textContent = this.getSuitSymbol(card.suit);
            suitSpan.className = `card-suit ${card.suit}`;
            
            document.getElementById('trump-card').style.display = 'block';
        } else if (this.gameState.trump_suit) {
            const rankSpan = trumpCard.querySelector('.card-rank');
            const suitSpan = trumpCard.querySelector('.card-suit');
            
            rankSpan.textContent = '';
            suitSpan.textContent = this.getSuitSymbol(this.gameState.trump_suit);
            suitSpan.className = `card-suit ${this.gameState.trump_suit}`;
            
            document.getElementById('trump-card').style.display = 'block';
        } else {
            document.getElementById('trump-card').style.display = 'none';
        }
    }

    updatePlayerAreas() {
        const playerAreas = document.querySelectorAll('.player-area');
        
        playerAreas.forEach(area => {
            const position = parseInt(area.dataset.position);
            const player = this.gameState.players.find(p => p.position === position);
            
            if (player) {
                const nameSpan = area.querySelector('.player-name');
                const dealerIndicator = area.querySelector('.dealer-indicator');
                
                nameSpan.textContent = player.name;
                
                // Show/hide dealer indicator
                if (this.gameState.dealer_index === position) {
                    dealerIndicator.style.display = 'flex';
                } else {
                    dealerIndicator.style.display = 'none';
                }

                // Update connection status visual indicator
                const playerInfo = area.querySelector('.player-info');
                if (player.is_connected) {
                    playerInfo.classList.remove('disconnected');
                } else {
                    playerInfo.classList.add('disconnected');
                }
                
                // Update hand display
                this.updatePlayerHand(area, player, position);
            }
        });
    }

    updatePlayerHand(area, player, position) {
        const handContainer = area.querySelector('.hand-cards');
        const currentCards = Array.from(handContainer.children);

        if (position === this.gameState.player_position) {
            // Current player - show actual cards
            const newCards = this.gameState.hand.map(card => ({
                card,
                element: this.createCardElement(card, true)
            }));

            // Animate new cards in
            newCards.forEach(({ card, element }, index) => {
                element.addEventListener('click', () => this.handleCardClick(card, element));
                
                // Check if this is a new card (not in current hand)
                const isNewCard = !currentCards.some(existing => 
                    existing.dataset && existing.dataset.cardId === `${card.suit}_${card.rank}`
                );
                
                if (isNewCard && this.gameState.phase === 'dealing') {
                    element.classList.add('dealing');
                    element.style.animationDelay = `${index * 0.1}s`;
                }
                
                element.dataset.cardId = `${card.suit}_${card.rank}`;
            });

            // Replace hand contents with animation
            this.replaceHandWithAnimation(handContainer, newCards.map(nc => nc.element));
        } else {
            // Other players - show card backs
            const cardBacks = [];
            for (let i = 0; i < player.hand_size; i++) {
                const cardElement = this.createCardBackElement();
                if (this.gameState.phase === 'dealing') {
                    cardElement.classList.add('dealing');
                    cardElement.style.animationDelay = `${i * 0.1}s`;
                }
                cardBacks.push(cardElement);
            }
            
            this.replaceHandWithAnimation(handContainer, cardBacks);
        }
    }

    replaceHandWithAnimation(container, newCards) {
        // Fade out old cards
        const oldCards = Array.from(container.children);
        oldCards.forEach(card => {
            card.classList.add('flip-out');
        });

        // After fade out, replace with new cards
        setTimeout(() => {
            container.innerHTML = '';
            newCards.forEach(card => {
                card.classList.add('flip-in');
                container.appendChild(card);
            });
        }, 200);
    }

    updateTrickArea() {
        const trickCards = document.querySelectorAll('.trick-card');
        
        // Store previous trick state for animation comparison
        const previousTrickState = this.previousTrickState || [];
        this.previousTrickState = this.gameState.current_trick ? [...this.gameState.current_trick.cards] : [];

        // Clear trick cards that are no longer present
        trickCards.forEach((trickCard, index) => {
            const position = parseInt(trickCard.dataset.position);
            const hasCardNow = this.gameState.current_trick && 
                this.gameState.current_trick.cards.some(([playerId]) => {
                    const player = this.gameState.players.find(p => p.id === playerId);
                    return player && player.position === position;
                });

            if (!hasCardNow) {
                // Check if this card was just collected
                const wasPresent = previousTrickState.some(([playerId]) => {
                    const player = this.gameState.players.find(p => p.id === playerId);
                    return player && player.position === position;
                });

                if (wasPresent) {
                    // Animate card collection
                    const cards = trickCard.querySelectorAll('.card');
                    cards.forEach(card => {
                        card.classList.add('collecting');
                    });

                    setTimeout(() => {
                        trickCard.innerHTML = '';
                        trickCard.classList.remove('has-card');
                    }, 800);
                } else {
                    trickCard.innerHTML = '';
                    trickCard.classList.remove('has-card');
                }
            }
        });

        // Add new cards to trick with animations
        if (this.gameState.current_trick && this.gameState.current_trick.cards) {
            this.gameState.current_trick.cards.forEach(([playerId, card]) => {
                const player = this.gameState.players.find(p => p.id === playerId);
                if (player) {
                    const trickCard = document.querySelector(`.trick-card[data-position="${player.position}"]`);
                    if (trickCard && !trickCard.hasChildNodes()) {
                        const cardElement = this.createCardElement(card, true);
                        cardElement.style.width = '50px';
                        cardElement.style.height = '70px';
                        
                        // Check if this is a newly played card
                        const wasPlayedBefore = previousTrickState.some(([prevPlayerId]) => prevPlayerId === playerId);
                        if (!wasPlayedBefore) {
                            cardElement.classList.add('playing');
                        }
                        
                        trickCard.appendChild(cardElement);
                        trickCard.classList.add('has-card');
                    }
                }
            });
        }

        // Highlight winner's card if trick is complete
        if (this.gameState.current_trick && 
            this.gameState.current_trick.cards.length === 4 &&
            this.lastTrickWinner !== this.gameState.current_trick.winner) {
            
            this.lastTrickWinner = this.gameState.current_trick.winner;
            const winnerPlayer = this.gameState.players.find(p => p.id === this.lastTrickWinner);
            
            if (winnerPlayer) {
                const winnerTrickCard = document.querySelector(`.trick-card[data-position="${winnerPlayer.position}"]`);
                if (winnerTrickCard) {
                    winnerTrickCard.classList.add('winner');
                    setTimeout(() => {
                        winnerTrickCard.classList.remove('winner');
                    }, 1000);
                }
            }
        }

        // Update trick count
        const trickCount = this.gameState.completed_tricks_count || 0;
        
        if (this.gameState.phase === 'playing' || this.gameState.phase === 'round_complete') {
            const currentTrick = trickCount + 1;
            const remainingTricks = 5 - currentTrick;
            
            document.getElementById('trick-count').textContent = `Trick ${currentTrick} of 5`;
            
            if (remainingTricks > 0) {
                document.getElementById('tricks-remaining').textContent = `${remainingTricks} remaining`;
            } else {
                document.getElementById('tricks-remaining').textContent = 'Final trick';
            }
        } else {
            // During dealing or trump selection
            document.getElementById('trick-count').textContent = 'Get ready...';
            document.getElementById('tricks-remaining').textContent = '5 tricks to play';
        }
        
        // Update leader indicator
        this.updateLeaderIndicator();
    }

    updateActionPanel() {
        // Hide all action groups
        document.querySelectorAll('.action-group').forEach(group => {
            if (group.id !== 'game-actions') {
                group.style.display = 'none';
            }
        });

        const phase = this.gameState.phase;
        const isCurrentPlayer = this.gameState.current_player_index === this.gameState.player_position;
        const isTrumpSelectionPlayer = this.gameState.trump_selection_player_index === this.gameState.player_position;
        const isYourTurn = isTrumpSelectionPlayer || isCurrentPlayer || this.needsToDiscard();

        if (phase === 'trump_selection' && isTrumpSelectionPlayer) {
            this.showTrumpSelectionActions();
        } else if (phase === 'playing' && this.gameState.trump_maker === this.gameState.player_id && !this.gameState.going_alone) {
            this.showGoingAloneActions();
        } else if (phase === 'playing' && isCurrentPlayer && this.needsToDiscard()) {
            this.showDiscardActions();
        }

        // Update game status
        this.updateGameStatus();
    }

    updateYourTurnIndicator() {
        const overlay = document.getElementById('your-turn-overlay');
        const gameBoard = document.querySelector('.game-board');
        const actionPanel = document.querySelector('.action-panel');
        
        if (!this.gameState) {
            overlay.style.display = 'none';
            gameBoard.classList.remove('your-turn');
            actionPanel.classList.remove('your-turn');
            return;
        }

        const phase = this.gameState.phase;
        const isCurrentPlayer = this.gameState.current_player_index === this.gameState.player_position;
        const isTrumpSelectionPlayer = this.gameState.trump_selection_player_index === this.gameState.player_position;
        const needsDiscard = this.needsToDiscard();
        const needsGoingAloneDecision = phase === 'playing' && this.gameState.trump_maker === this.gameState.player_id && !this.gameState.going_alone;
        const isYourTurn = isTrumpSelectionPlayer || isCurrentPlayer || needsDiscard || needsGoingAloneDecision;

        if (isYourTurn && (phase === 'trump_selection' || phase === 'playing')) {
            overlay.style.display = 'block';
            gameBoard.classList.add('your-turn');
            actionPanel.classList.add('your-turn');
            
            // Update overlay text based on action needed
            if (phase === 'trump_selection') {
                overlay.textContent = '🎯 Choose Trump!';
            } else if (needsGoingAloneDecision) {
                overlay.textContent = '🤔 Go Alone?';
            } else if (needsDiscard) {
                overlay.textContent = '🗂️ Discard a Card!';
            } else if (isCurrentPlayer) {
                overlay.textContent = '🃏 Play a Card!';
            }
        } else {
            overlay.style.display = 'none';
            gameBoard.classList.remove('your-turn');
            actionPanel.classList.remove('your-turn');
        }
    }

    needsToDiscard() {
        // Check if player is dealer and needs to discard after picking up trump card
        return this.gameState.dealer_index === this.gameState.player_position && 
               this.gameState.trump_suit && 
               this.gameState.hand && 
               this.gameState.hand.length > 5;
    }

    showTrumpSelectionActions() {
        const trumpActions = document.getElementById('trump-selection-actions');
        const suitSelection = trumpActions.querySelector('.suit-selection');
        
        trumpActions.style.display = 'block';
        
        if (this.gameState.trump_selection_round === 1) {
            // First round - can order up or pass
            document.getElementById('order-up-btn').style.display = 'inline-block';
            suitSelection.style.display = 'none';
        } else {
            // Second round - can name trump or pass
            document.getElementById('order-up-btn').style.display = 'none';
            suitSelection.style.display = 'flex';
            
            // Disable the suit that was turned down
            if (this.gameState.trump_card) {
                const turnedDownSuit = this.gameState.trump_card.suit;
                const suitBtn = document.querySelector(`[data-suit="${turnedDownSuit}"]`);
                if (suitBtn) {
                    suitBtn.disabled = true;
                    suitBtn.style.opacity = '0.5';
                }
            }
        }
    }

    showGoingAloneActions() {
        document.getElementById('going-alone-actions').style.display = 'block';
    }

    showDiscardActions() {
        document.getElementById('discard-actions').style.display = 'block';
        
        // Highlight cards as playable for discarding
        const cards = document.querySelectorAll('#current-player-hand .card');
        cards.forEach(card => card.classList.add('playable'));
    }

    updateGameStatus() {
        const phaseIndicator = document.getElementById('phase-indicator');
        const currentPlayerSpan = document.getElementById('current-player');
        
        const phase = this.gameState.phase;
        const currentPlayerIndex = this.gameState.current_player_index;
        const trumpSelectionIndex = this.gameState.trump_selection_player_index;
        
        switch (phase) {
            case 'dealing':
                phaseIndicator.textContent = 'Dealing cards...';
                currentPlayerSpan.textContent = '';
                break;
                
            case 'trump_selection':
                phaseIndicator.textContent = `Trump Selection - Round ${this.gameState.trump_selection_round}`;
                const trumpPlayer = this.gameState.players.find(p => p.position === trumpSelectionIndex);
                currentPlayerSpan.textContent = trumpPlayer ? `${trumpPlayer.name}'s turn` : '';
                break;
                
            case 'playing':
                phaseIndicator.textContent = 'Playing';
                const currentPlayer = this.gameState.players.find(p => p.position === currentPlayerIndex);
                currentPlayerSpan.textContent = currentPlayer ? `${currentPlayer.name}'s turn` : '';
                break;
                
            case 'round_complete':
                phaseIndicator.textContent = 'Round Complete';
                currentPlayerSpan.textContent = '';
                break;
                
            case 'game_complete':
                phaseIndicator.textContent = 'Game Complete';
                currentPlayerSpan.textContent = '';
                document.getElementById('new-game-btn').style.display = 'inline-block';
                break;
                
            default:
                phaseIndicator.textContent = 'Waiting...';
                currentPlayerSpan.textContent = '';
        }
    }

    createCardElement(card, faceUp = true) {
        const cardElement = document.createElement('div');
        cardElement.className = 'card';
        
        if (faceUp) {
            const rankSpan = document.createElement('span');
            rankSpan.className = 'card-rank';
            rankSpan.textContent = this.getCardRankDisplay(card.rank);
            
            const suitSpan = document.createElement('span');
            suitSpan.className = `card-suit ${card.suit}`;
            suitSpan.textContent = this.getSuitSymbol(card.suit);
            
            cardElement.appendChild(rankSpan);
            cardElement.appendChild(suitSpan);
        } else {
            cardElement.classList.add('card-back');
        }
        
        return cardElement;
    }

    createCardBackElement() {
        const cardElement = document.createElement('div');
        cardElement.className = 'card card-back';
        return cardElement;
    }

    getCardRankDisplay(rank) {
        const rankMap = {
            9: '9',
            10: '10',
            11: 'J',
            12: 'Q',
            13: 'K',
            14: 'A'
        };
        return rankMap[rank] || rank.toString();
    }

    getSuitSymbol(suit) {
        const suitMap = {
            'hearts': '♥',
            'diamonds': '♦',
            'clubs': '♣',
            'spades': '♠'
        };
        return suitMap[suit] || suit;
    }

    handleCardClick(card, cardElement) {
        const phase = this.gameState.phase;
        
        if (phase === 'playing') {
            if (this.needsToDiscard()) {
                this.discardCard(card);
            } else if (this.gameState.current_player_index === this.gameState.player_position) {
                this.playCard(card);
            }
        }
    }

    createRoom(playerName) {
        this.setLeftRoomFlag(false); // Reset flag when creating new room
        this.sendMessage({
            type: 'create_room',
            player_name: playerName
        });
    }

    joinRoom(roomCode, playerName) {
        this.setLeftRoomFlag(false); // Reset flag when joining new room
        this.sendMessage({
            type: 'join_room',
            room_code: roomCode,
            player_name: playerName
        });
    }

    leaveRoom() {
        this.setLeftRoomFlag(true); // Set persistent flag to prevent auto-reconnect
        this.clearGameSession();
        
        // Tell server we're leaving
        this.sendMessage({
            type: 'leave_room'
        });
        
        this.showScreen('main-menu');
        this.gameState = null;
        this.dealingAnimationStarted = false; // Reset dealing animation flag
    }

    sendTrumpSelection(action, suit = null) {
        const message = {
            type: 'trump_selection',
            action: action
        };
        
        if (suit) {
            message.suit = suit;
        }
        
        this.sendMessage(message);
    }

    sendGoingAlone(goingAlone) {
        this.sendMessage({
            type: 'going_alone',
            going_alone: goingAlone
        });
    }

    playCard(card) {
        this.sendMessage({
            type: 'play_card',
            card: card
        });
    }

    discardCard(card) {
        this.sendMessage({
            type: 'discard_card',
            card: card
        });
    }

    startNewGame() {
        // This would reset the game state on the server
        this.sendMessage({
            type: 'new_game'
        });
    }

    addAIOpponent() {
        this.sendMessage({
            type: 'add_ai_player'
        });
    }

    startGame() {
        // Only start if we have exactly 4 players
        console.log('Start Game button clicked');
        console.log('Current game state:', this.gameState);
        
        if (!this.gameState || !this.gameState.players) {
            console.error('No game state or players available');
            return;
        }
        
        const playerCount = this.gameState.players.length;
        console.log('Player count:', playerCount);
        console.log('Game phase:', this.gameState.phase);
        
        console.log('Sending start_game message regardless of current state');
        this.sendMessage({
            type: 'start_game'
        });
    }

    startGameWithAI() {
        this.sendMessage({
            type: 'start_game_with_ai'
        });
    }

    showScreen(screenId) {
        const currentScreen = document.querySelector('.screen.active');
        const newScreen = document.getElementById(screenId);
        
        if (currentScreen && currentScreen !== newScreen) {
            // Animate out current screen
            currentScreen.classList.add('slide-out');
            
            setTimeout(() => {
                currentScreen.classList.remove('active', 'slide-out');
                
                // Animate in new screen
                newScreen.classList.add('active', 'slide-in');
                
                setTimeout(() => {
                    newScreen.classList.remove('slide-in');
                }, 500);
            }, 300);
        } else {
            // First screen or same screen
            document.querySelectorAll('.screen').forEach(screen => {
                screen.classList.remove('active');
            });
            
            newScreen.classList.add('active');
        }
        
        this.currentScreen = screenId;
    }

    showMessage(title, text) {
        document.getElementById('message-title').textContent = title;
        document.getElementById('message-text').textContent = text;
        document.getElementById('message-overlay').style.display = 'flex';
    }

    hideMessage() {
        document.getElementById('message-overlay').style.display = 'none';
    }

    showLoading() {
        document.getElementById('loading-overlay').style.display = 'flex';
    }

    hideLoading() {
        document.getElementById('loading-overlay').style.display = 'none';
    }

    updateConnectionStatus(status, text) {
        const indicator = document.querySelector('.status-indicator');
        const statusText = document.querySelector('.status-text');
        
        indicator.className = `status-indicator ${status}`;
        statusText.textContent = text;
    }

    showNotification(message, type = 'info') {
        // Create notification element if it doesn't exist
        let notification = document.getElementById('notification');
        if (!notification) {
            notification = document.createElement('div');
            notification.id = 'notification';
            notification.className = 'notification';
            document.body.appendChild(notification);
        }

        notification.textContent = message;
        notification.className = `notification ${type} show`;

        // Auto-hide after 3 seconds
        setTimeout(() => {
            notification.classList.remove('show');
        }, 3000);
    }

    startShufflingAndDealingAnimation() {
        this.dealingAnimationStarted = true;
        
        // Show deck area and hide trick cards
        const deckArea = document.getElementById('deck-area');
        const trickCards = document.querySelector('.trick-cards');
        
        deckArea.style.display = 'block';
        trickCards.style.opacity = '0.3';
        
        // Start shuffling animation
        deckArea.classList.add('shuffling');
        
        // After shuffling, start dealing cards
        setTimeout(() => {
            deckArea.classList.remove('shuffling');
            this.startDealingSequence();
        }, 2000); // Shuffling duration
    }

    startDealingSequence() {
        const playerPositions = [0, 1, 2, 3]; // North, East, South, West
        let cardIndex = 0;
        
        // Deal 5 cards to each player (round-robin style)
        const dealRound = (roundNumber) => {
            if (roundNumber >= 5) {
                // Finished dealing all cards, now show trump card
                setTimeout(() => {
                    this.showTrumpCardAnimation();
                }, 500);
                return;
            }
            
            // Deal one card to each player in sequence
            let playerIndex = 0;
            const dealToNextPlayer = () => {
                if (playerIndex >= 4) {
                    // Round complete, start next round
                    setTimeout(() => dealRound(roundNumber + 1), 300);
                    return;
                }
                
                this.dealCardToPlayer(playerPositions[playerIndex], cardIndex);
                cardIndex++;
                playerIndex++;
                
                // Deal to next player after delay
                setTimeout(dealToNextPlayer, 150);
            };
            
            dealToNextPlayer();
        };
        
        // Start dealing
        dealRound(0);
    }

    dealCardToPlayer(position, cardIndex) {
        // Create a card element that animates from deck to player
        const deckArea = document.getElementById('deck-area');
        const dealingCard = document.createElement('div');
        dealingCard.className = 'deck-card dealing-card';
        dealingCard.style.position = 'absolute';
        dealingCard.style.zIndex = '30';
        
        deckArea.appendChild(dealingCard);
        
        // Calculate target position
        const playerArea = document.querySelector(`[data-position="${position}"]`);
        const deckRect = deckArea.getBoundingClientRect();
        const playerRect = playerArea.getBoundingClientRect();
        
        const deltaX = playerRect.left + playerRect.width/2 - deckRect.left - deckRect.width/2;
        const deltaY = playerRect.top + playerRect.height/2 - deckRect.top - deckRect.height/2;
        
        // Set CSS custom property for animation target
        dealingCard.style.setProperty('--deal-target-transform', 
            `translate(${deltaX}px, ${deltaY}px) rotate(${Math.random() * 20 - 10}deg) scale(0.8)`);
        
        // Start animation
        dealingCard.style.animation = 'dealFromDeck 0.6s ease-out forwards';
        
        // Remove the dealing card after animation
        setTimeout(() => {
            dealingCard.remove();
        }, 600);
    }

    showTrumpCardAnimation() {
        // Hide deck area and show trump card with flip animation
        const deckArea = document.getElementById('deck-area');
        const trickCards = document.querySelector('.trick-cards');
        const trumpCard = document.getElementById('trump-card');
        
        deckArea.style.display = 'none';
        trickCards.style.opacity = '1';
        
        // Show trump card with flip animation
        if (this.gameState.trump_card) {
            trumpCard.style.display = 'block';
            trumpCard.style.animation = 'trumpCardFlip 1s ease-out forwards';
        }
        
        // Finish dealing animation sequence
        setTimeout(() => {
            this.dealingAnimationStarted = false;
            this.updateGameScreen(); // Update the full game display
        }, 1000);
    }

    toggleEventLog() {
        const eventLog = document.getElementById('event-log');
        const toggleBtn = document.getElementById('toggle-log-btn');
        
        eventLog.classList.toggle('collapsed');
        
        if (eventLog.classList.contains('collapsed')) {
            toggleBtn.textContent = 'Show';
        } else {
            toggleBtn.textContent = 'Hide';
        }
    }

    updateEventLog() {
        if (!this.gameState || !this.gameState.events) return;
        
        const eventLogContent = document.getElementById('event-log-content');
        const events = this.gameState.events;
        
        // Clear existing events
        eventLogContent.innerHTML = '';
        
        // Add events
        events.forEach(event => {
            const eventItem = document.createElement('div');
            eventItem.className = `event-item ${event.event_type}-event`;
            
            const timeSpan = document.createElement('span');
            timeSpan.className = 'event-time';
            timeSpan.textContent = this.formatEventTime(event.timestamp);
            
            const textSpan = document.createElement('span');
            textSpan.className = 'event-text';
            textSpan.textContent = event.message;
            
            eventItem.appendChild(timeSpan);
            eventItem.appendChild(textSpan);
            eventLogContent.appendChild(eventItem);
        });
        
        // Auto-scroll to bottom
        eventLogContent.scrollTop = eventLogContent.scrollHeight;
    }

    formatEventTime(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit',
            second: '2-digit'
        });
    }

    updateLeaderIndicator() {
        // Remove existing leader indicators
        const existingIndicators = document.querySelectorAll('.leader-indicator');
        existingIndicators.forEach(indicator => indicator.remove());
        
        // Clear leader classes
        const trickCards = document.querySelectorAll('.trick-card');
        trickCards.forEach(card => card.classList.remove('is-leader'));
        
        // Add leader indicator if there's a current trick with a leader
        if (this.gameState.current_trick && this.gameState.current_trick.leader) {
            const leaderPlayer = this.gameState.players.find(p => p.id === this.gameState.current_trick.leader);
            
            if (leaderPlayer) {
                const leaderTrickCard = document.querySelector(`.trick-card[data-position="${leaderPlayer.position}"]`);
                
                if (leaderTrickCard) {
                    // Add leader class to trick card
                    leaderTrickCard.classList.add('is-leader');
                    
                    // Create leader indicator element
                    const indicator = document.createElement('div');
                    indicator.className = 'leader-indicator';
                    indicator.innerHTML = '👑';
                    indicator.title = `${leaderPlayer.name} led this trick`;
                    
                    leaderTrickCard.appendChild(indicator);
                }
            }
        }
    }
}

// Initialize the game client when the page loads
document.addEventListener('DOMContentLoaded', () => {
    window.gameClient = new EuchreClient();
});