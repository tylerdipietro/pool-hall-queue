import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import axios from 'axios';

const socket = io(); // adjust with your backend URL if needed

export default function QueueManager() {
  const [queue, setQueue] = useState([]);
  const [tables, setTables] = useState([]);

  const fetchQueue = async () => {
  const res = await axios.get('http://localhost:5000/api/queue', { withCredentials: true });
  return res.data;
};

const fetchTables = async () => {
  const res = await axios.get('http://localhost:5000/api/tables', { withCredentials: true });
  return res.data;
};


  useEffect(() => {
    fetchQueue();
    fetchTables();

    socket.on('queueUpdated', fetchQueue);
    socket.on('tablesUpdated', fetchTables);

    return () => {
      socket.off('queueUpdated', fetchQueue);
      socket.off('tablesUpdated', fetchTables);
    };
  }, []);

  return (
    <div>
      <h2>Queue</h2>
      <ul>
        {queue.map((user) => (
          <li key={user._id}>{user.username}</li>
        ))}
      </ul>

      <h2>Tables</h2>
      <ul>
        {tables.map((table) => (
          <li key={table._id}>
            Table {table.number}: {table.players.length} player(s)
          </li>
        ))}
      </ul>
    </div>
  );
}
