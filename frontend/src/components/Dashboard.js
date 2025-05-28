// frontend/Dashboard.js
import React, { useEffect, useState, useCallback, useRef } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import socket from '../socket';
import Queue from './Queue';
import Table from './Table';
import QueueManager from './QueueManager';
import { useAuth } from '../context/AuthContext';

// Track registered socket IDs to prevent duplicate emits
const registeredSocketsRef = new Set();

// ---------- Custom Hooks ----------

const useDashboardAPI = ({ fetchUser, navigate, setQueue, setTables, setLoading }) => {
  const fetchData = useCallback(async () => {
    try {
      const { data } = await axios.get('http://localhost:5000/api/queue', { withCredentials: true });
      setQueue(Array.isArray(data.queue) ? data.queue : []);
      setTables(Array.isArray(data.tables) ? data.tables : []);
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  }, [setQueue, setTables, setLoading]);

  const checkIn = async () => {
    try {
      await axios.post('http://localhost:5000/api/queue/checkin', {}, { withCredentials: true });
      await fetchData();
    } catch (err) {
      alert(err.response?.data?.message || 'Check-in failed');
    }
  };

  const logout = useCallback(async () => {
    try {
      await axios.post('http://localhost:5000/api/queue/leave', {}, { withCredentials: true });
    } catch (err) {
      console.warn('Queue leave error:', err.response?.data?.message || err.message);
    }

    try {
      await axios.post('http://localhost:5000/auth/logout', {}, { withCredentials: true });
      fetchUser();
      navigate('/login');
    } catch (err) {
      console.error('Logout failed:', err);
      alert('Logout failed. Please try again.');
    }
  }, [fetchUser, navigate]);

  const clearQueue = async () => {
    if (!window.confirm('Are you sure you want to clear the queue?')) return;
    try {
      await axios.post('http://localhost:5000/api/queue/clear', {}, { withCredentials: true });
      await fetchData();
      alert('Queue cleared');
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to clear queue');
    }
  };

  return { fetchData, checkIn, logout, clearQueue };
};

const useSocketEvents = ({ user, setQueue, setPendingInvite, setTimeLeft, pendingInviteRef, setTables }) => {
  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    if (!user) return;

    const handleQueueUpdated = (updatedQueue) => {
      const queueArray = Array.isArray(updatedQueue) ? updatedQueue : [];
      setQueue(queueArray);

      if (queueArray.length === 0 && pendingInviteRef.current) {
        setPendingInvite(null);
        setTimeLeft(30);
      }
    };

    const handleTablesUpdated = (updatedTables) => {
      const tablesArray = Array.isArray(updatedTables) ? updatedTables : [];
      setTables(tablesArray);
    };

    const handleTableInvite = (data) => {
      if (userRef.current?.username === data.invitedUsername) {
        setPendingInvite({
          tableId: data.tableId,
          tableNumber: data.tableNumber,
          opponent: data.opponent,
        });
        setTimeLeft(30);
      }
    };

    const handleInviteTimeout = ({ tableId }) => {
      if (pendingInviteRef.current?.tableId === tableId) {
        alert('You did not respond in time. You have been skipped.');
        setPendingInvite(null);
        setTimeLeft(30);
      }
    };

    socket.on('queueUpdated', handleQueueUpdated);
    socket.on('tablesUpdated', handleTablesUpdated);
    socket.on('tableInvite', handleTableInvite);
    socket.on('tableInviteTimeout', handleInviteTimeout);

    return () => {
      socket.off('queueUpdated', handleQueueUpdated);
      socket.off('tablesUpdated', handleTablesUpdated);
      socket.off('tableInvite', handleTableInvite);
      socket.off('tableInviteTimeout', handleInviteTimeout);
    };
  }, [user, setQueue, setPendingInvite, setTimeLeft, pendingInviteRef, setTables]);
};


// ---------- Main Component ----------

const Dashboard = () => {
  const { user, fetchUser } = useAuth();
  const navigate = useNavigate();

  const [queue, setQueue] = useState([]);
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pendingInvite, setPendingInvite] = useState(null);
  const [timeLeft, setTimeLeft] = useState(30);

  const pendingInviteRef = useRef(null);
  useEffect(() => {
    pendingInviteRef.current = pendingInvite;
  }, [pendingInvite]);

  const { fetchData, checkIn, logout, clearQueue } = useDashboardAPI({
    fetchUser,
    navigate,
    setQueue,
    setTables,
    setLoading,
  });

  const acceptInvite = useCallback(async () => {
    const invite = pendingInviteRef.current;
    if (!invite) return;
    try {
      await axios.post('http://localhost:5000/api/queue/accept', { tableId: invite.tableId }, { withCredentials: true });
      alert(`Accepted Table ${invite.tableNumber}`);
    } catch (err) {
      alert(err.response?.data?.message || 'Error accepting invite');
    }
    setPendingInvite(null);
  }, []);

  const skipInvite = useCallback(async () => {
    const invite = pendingInviteRef.current;
    if (!invite) return;
    try {
      await axios.post('http://localhost:5000/api/queue/skip', { tableId: invite.tableId }, { withCredentials: true });
      alert(`Skipped Table ${invite.tableNumber}`);
    } catch (err) {
      alert(err.response?.data?.message || 'Error skipping invite');
    }
    setPendingInvite(null);
  }, []);

  const [endgameInProgress, setEndgameInProgress] = useState(false);

  const handleEndgame = async (tableId, loserId) => {
  if (endgameInProgress) return;
  setEndgameInProgress(true);
  try {
    await axios.post('/api/table/endgame', { tableId, loserId }, { withCredentials: true });
    await fetchData(); // refresh tables/queue
  } catch (err) {
    console.error(err.response?.data?.message || err.message);
  } finally {
    setEndgameInProgress(false);
  }
};



  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Register socket for current user
  useEffect(() => {
    if (!user?._id) return;

    const registerUser = () => {
      if (!registeredSocketsRef.has(socket.id)) {
        console.log('Registering user on socket:', user.username, socket.id);
        socket.emit('registerUser', user._id);
        registeredSocketsRef.add(socket.id);
      }
    };

    if (socket.connected) registerUser();

    socket.on('connect', registerUser);
    socket.io.on('reconnect', registerUser);

    return () => {
      socket.off('connect', registerUser);
      socket.io.off('reconnect', registerUser);
      registeredSocketsRef.clear();
    };
  }, [user]);

  // Socket event handling
useSocketEvents({ user, setQueue, setTables, setPendingInvite, setTimeLeft, pendingInviteRef });

  // Invite countdown timer
  useEffect(() => {
    if (!pendingInvite || timeLeft <= 0) {
      if (pendingInvite) skipInvite();
      return;
    }
    const timer = setTimeout(() => setTimeLeft((prev) => prev - 1), 1000);
    return () => clearTimeout(timer);
  }, [pendingInvite, timeLeft, skipInvite]);

  if (loading) return <p>Loading...</p>;

  return (
    <div style={{ maxWidth: 800, margin: 'auto' }}>
      <h1>Welcome, {user.username}</h1>
       <QueueManager />

      <button onClick={checkIn}>Check In</button>
      <button onClick={logout}>Logout</button>

      {user.isAdmin && (
        <button
          style={{ marginLeft: 10, backgroundColor: 'red', color: 'white' }}
          onClick={clearQueue}
        >
          Clear Queue
        </button>
      )}

      {pendingInvite && (
        <div style={{ border: '1px solid black', padding: 10, margin: '10px 0', backgroundColor: '#ffffcc' }}>
          <p>
            You’ve been invited to Table {pendingInvite.tableNumber} vs{' '}
            <strong>{pendingInvite.opponent}</strong>
          </p>
          <p>Time left: {timeLeft} seconds</p>
          <button onClick={acceptInvite}>Accept</button>
          <button onClick={skipInvite} style={{ marginLeft: 10 }}>
            Skip Turn
          </button>
        </div>
      )}

      <Queue queue={queue} />

      <h2>Tables</h2>
      {tables.map((table) => (
  <Table
    key={table._id}
    table={table}
    currentUserId={user._id}
    onEndGame={(loserId) => handleEndgame(table._id, loserId)}
  />
))}

    </div>
  );
};

export default Dashboard;
