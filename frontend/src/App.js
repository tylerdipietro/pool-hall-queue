import React from 'react';
import { useAuth } from './context/AuthContext';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import Modal from 'react-modal';

Modal.setAppElement('#root'); // or whatever your root element ID is


function App() {
  const { user } = useAuth();

  return (
    <div>
      {user ? <Dashboard /> : <Login />}
    </div>
  );
}

export default App;
