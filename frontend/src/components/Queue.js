import React from 'react';

const Queue = ({ queue }) => {
  if (!queue || queue.length === 0) {
    return <p>No players in queue</p>;
  }

  return (
    <div>
      <h2>Current Queue</h2>
      <ul>
        {queue.map((user, index) => (
          <li key={user?._id || index}>
            {user?.username || 'Unknown user'}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default Queue;
