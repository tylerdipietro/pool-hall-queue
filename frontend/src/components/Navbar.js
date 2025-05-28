import React from 'react';
import { Link } from 'react-router-dom';

function Navbar({ user }) {
  return (
    <nav>
      <Link to="/">Home</Link>
      {user ? (
        <>
          <Link to="/dashboard">Dashboard</Link>
          <a href="http://localhost:5000/auth/logout">Logout</a>
        </>
      ) : (
        <a href="http://localhost:5000/auth/google">Login with Google</a>
      )}
    </nav>
  );
}

export default Navbar;
