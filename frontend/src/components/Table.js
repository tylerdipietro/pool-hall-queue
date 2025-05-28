import React, { useState, useEffect } from 'react';
import Modal from 'react-modal';
import socket from '../socket'; // Your socket instance

Modal.setAppElement('#root'); // Accessibility

const Table = ({ table: initialTable, currentUserId, onEndGame }) => {
  const [table, setTable] = useState(initialTable);
  const [modalIsOpen, setModalIsOpen] = useState(false);
  const [modalMessage, setModalMessage] = useState('');
  const [waitingForConfirm, setWaitingForConfirm] = useState(false);
  const [confirmingWin, setConfirmingWin] = useState(false);
  const [showConfirmLoser, setShowConfirmLoser] = useState(false);

  const [confirmWinnerId, setConfirmWinnerId] = useState(null);
  const [confirmTableId, setConfirmTableId] = useState(null);

  // Determine if current user is player or pendingUser
  const isPlayer = table.players.some(p => p._id === currentUserId);
  const opponent = table.players.find(p => p._id !== currentUserId) || null;
  const loserId = opponent?._id;

  const isPendingUser = table.pendingUser?._id === currentUserId;

  // Register user socket on mount
  useEffect(() => {
    if (currentUserId) {
      socket.emit('registerUser', currentUserId);
    }
  }, [currentUserId]);



  // Listen for table updates and update local state
  useEffect(() => {
    const handleTableUpdated = ({ tableId, updatedTable }) => {
      if (updatedTable._id === table._id) {
        setTable(updatedTable);
      }
    };

    socket.on('tableUpdated', handleTableUpdated);

    return () => {
      socket.off('tableUpdated', handleTableUpdated);
    };
  }, [table._id]);

  // Listen for confirm_win_request event (loser gets modal)
useEffect(() => {
  const confirmWinListener = ({ tableId, winnerId, loserId }) => {
    // Ensure this table is the right one
    if (table._id !== tableId) return;

    const playerIds = table.players.map(p => p._id);

    if (!playerIds.includes(winnerId) || !playerIds.includes(loserId)) {
      console.warn('Either winner or loser is no longer on the table. Ignoring event.');
      return;
    }

    if (currentUserId === loserId) {
      const winner = table.players.find(p => p._id === winnerId);
      const winnerName = winner ? winner.username : 'opponent';

      setConfirmWinnerId(winnerId);
      setConfirmTableId(tableId);
      setModalMessage(`Confirm that ${winnerName} has won`);
      setConfirmingWin(true);
      setWaitingForConfirm(false);
      setModalIsOpen(true);
    }
  };

  socket.on('confirm_win_request', confirmWinListener);
  return () => {
    socket.off('confirm_win_request', confirmWinListener);
  };
}, [currentUserId, table]);


  // Listen for game_finalized event
  useEffect(() => {
    const handleGameFinalized = () => {
      setModalIsOpen(false);
      setWaitingForConfirm(false);
      setConfirmingWin(false);
      if (onEndGame) onEndGame();
    };

    socket.on('game_finalized', handleGameFinalized);

    return () => {
      socket.off('game_finalized', handleGameFinalized);
    };
  }, [onEndGame]);

  // Handle "I WON" click by player
  const handleIWONClick = () => {
  if (!opponent) {
    alert('No opponent found. You may already be the remaining player.');
    return;
  }

  socket.emit('claim_win', {
    tableId: table._id,
    winnerId: currentUserId,
  });

  setModalMessage(`Waiting for verification from ${opponent?.username || 'opponent'}...`);
  setWaitingForConfirm(true);
  setConfirmingWin(false);
  setModalIsOpen(true);
};


  // Handle pendingUser accepting invite
  const handleAcceptInvite = () => {
    socket.emit('acceptInvite', { tableId: table._id, userId: currentUserId });
    setModalIsOpen(false);
  };

  // Handle pendingUser rejecting invite
  const handleRejectInvite = () => {
    socket.emit('rejectInvite', { tableId: table._id, userId: currentUserId });
    setModalIsOpen(false);
  };

  const [confirmed, setConfirmed] = useState(false);

  // Loser confirms the win
  const handleConfirmClick = () => {
    if (confirmed) return; // Prevent multiple emits
    // Inside handleConfirmClick()
    if (!table.players.some(p => p._id === confirmWinnerId || p._id === currentUserId)) {
      console.warn('You or opponent not on table anymore. Not sending confirm.');
      return;
    }


    setConfirmed(true); // Lock out further submissions

    socket.emit('confirm_win_response', {
      tableId: confirmTableId,
      winnerId: confirmWinnerId,
      confirmed: true,
    });

      if (onEndGame) {
    onEndGame(currentUserId); // Current user is confirming the opponent's win, so they are the loser
  }

     setWaitingForConfirm(true);
    setConfirmingWin(false); // Hide confirm buttons, show waiting state

  };

    useEffect(() => {
      const handleMatchConfirmed = ({ tableId, winnerId }) => {
        if (table._id !== tableId) return;

        // Prevent further confirm attempts after winner is confirmed
        setModalIsOpen(false);
        setWaitingForConfirm(false);
        setConfirmingWin(false);
        setConfirmed(false);

        const winner = table.players.find(p => p._id === winnerId);
        setTable((prev) => ({
          ...prev,
          players: winner ? [winner] : [],
          pendingUser: null
        }));

        if (winnerId === currentUserId) {
          alert('You are confirmed as the winner!');
        } else {
          alert('Your opponent has been confirmed as the winner.');
        }
      };

      socket.on('matchConfirmed', handleMatchConfirmed);
      return () => {
        socket.off('matchConfirmed', handleMatchConfirmed);
      };
    }, [table, currentUserId]);



  // Cancel modal
  const handleCancelClick = () => {
    setModalIsOpen(false);
    setWaitingForConfirm(false);
    setConfirmingWin(false);
  };

  return (
    <div style={{ border: '1px solid black', margin: 10, padding: 10 }}>
      <h3>Table {table.tableNumber}</h3>

      <p>Players:</p>
      <ul>
        {table.players.length > 0 ? (
          table.players.map((p) => (
            <li key={p._id}>
              {p.username} {currentUserId === p._id ? '(You)' : ''}
            </li>
          ))
        ) : (
          <li>Empty</li>
        )}
      </ul>

      {/* Show pending user separately */}
      {table.pendingUser && (
        <p>
          Invite sent to: {table.pendingUser.username}{' '}
          {isPendingUser && '(You)'}
        </p>
      )}

      {/* Show Accept/Reject buttons ONLY if current user is pendingUser */}
      {isPendingUser && (
        <div>
          <button onClick={handleAcceptInvite}>Accept Invite</button>
          <button onClick={handleRejectInvite}>Reject Invite</button>
        </div>
      )}

      {/* Show "I WON" button ONLY if current user is player */}
      {isPlayer && (
        <button onClick={handleIWONClick}>I WON</button>
      )}

      <Modal
        isOpen={modalIsOpen}
        onRequestClose={handleCancelClick}
        contentLabel="Game Confirmation Modal"
      >
        <h2>{modalMessage}</h2>
        {waitingForConfirm && <p>Waiting for match confirmation...</p>}


        {waitingForConfirm && (
          <button onClick={handleCancelClick}>Cancel</button>
        )}

        {confirmingWin && (
          <>
            <button onClick={handleConfirmClick} disabled={confirmed}>Confirm</button>
            <button onClick={handleCancelClick}>Cancel</button>
          </>
        )}

         {/* Confirmation dialog */}
      {showConfirmLoser && (
        <div>
          <p>Confirm that your opponent won?</p>
          <button onClick={() => onEndGame(loserId)}>End Game</button>
          <button onClick={() => setShowConfirmLoser(false)}>Cancel</button>
        </div>
      )}
      </Modal>
    </div>
  );
};

export default Table;
