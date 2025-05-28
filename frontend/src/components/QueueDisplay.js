// src/components/QueueDisplay.js
import React from 'react';

const QueueDisplay = ({ queue }) => {
  return (
    <ul>
      {queue.map((player, i) => (
        <li key={player._id}>
          {i + 1}. {player.name}
        </li>
      ))}
    </ul>
  );
};

export default QueueDisplay;
