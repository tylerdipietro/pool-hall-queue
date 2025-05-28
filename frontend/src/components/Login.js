import React from 'react';

const Login = () => {
  const handleLogin = () => {
    window.location.href = 'http://localhost:5000/auth/google';
  };

  return (
    <div style={{ textAlign: 'center', marginTop: 50 }}>
      <h2>Please log in to join the queue</h2>
      <button onClick={handleLogin}>Login with Google</button>
    </div>
  );
};

export default Login;
