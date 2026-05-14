import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Video, Users } from 'lucide-react';

const Home = () => {
  const [roomId, setRoomId] = useState('');
  const navigate = useNavigate();

  const handleCreateRoom = () => {
    // Generate a random 6-character string for room ID
    const newRoomId = Math.random().toString(36).substring(2, 8);
    navigate(`/room/${newRoomId}`);
  };

  const handleJoinRoom = (e) => {
    e.preventDefault();
    if (roomId.trim()) {
      navigate(`/room/${roomId.trim()}`);
    }
  };

  return (
    <div className="home-container">
      <div className="home-card">
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
          <div style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', padding: '1rem', borderRadius: '50%' }}>
            <Video size={40} color="#3b82f6" />
          </div>
        </div>
        <h1 className="home-title">MeetStream</h1>
        <p className="home-subtitle">Premium video calling for small teams.</p>
        
        <div className="action-container">
          <button className="primary-btn" onClick={handleCreateRoom}>
            <Video size={20} />
            New Meeting
          </button>
          
          <div className="divider">or</div>
          
          <form onSubmit={handleJoinRoom} className="join-container">
            <input 
              type="text" 
              className="input-field" 
              placeholder="Enter meeting code" 
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
            />
            <button type="submit" className="secondary-btn" disabled={!roomId.trim()}>
              Join
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Home;
