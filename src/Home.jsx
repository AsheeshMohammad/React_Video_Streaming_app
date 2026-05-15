import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Button, TextField, Typography, Paper, Divider, Container } from '@mui/material';
import VideocamIcon from '@mui/icons-material/Videocam';

const Home = () => {
  const [roomId, setRoomId] = useState('');
  const navigate = useNavigate();

  const handleCreateRoom = () => {
    const newRoomId = Math.random().toString(36).substring(2, 8);
    localStorage.setItem('organizer_' + newRoomId, 'true');
    navigate(`/room/${newRoomId}`);
  };

  const handleJoinRoom = (e) => {
    e.preventDefault();
    if (roomId.trim()) {
      navigate(`/room/${roomId.trim()}`);
    }
  };

  return (
    <Box sx={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      bgcolor: '#0f1115',
      backgroundImage: 'radial-gradient(circle at top right, #1f2331, #0f1115)',
    }}>
      <Container maxWidth="sm">
        <Paper elevation={24} sx={{ p: 5, borderRadius: 4, textAlign: 'center', bgcolor: '#1c1f26', color: 'white', border: '1px solid #2e333d' }}>
          <Box sx={{ display: 'flex', justifyContent: 'center', mb: 3 }}>
            <Box sx={{ bgcolor: 'rgba(59, 130, 246, 0.1)', p: 2, borderRadius: '50%' }}>
              <VideocamIcon sx={{ fontSize: 48, color: '#3b82f6' }} />
            </Box>
          </Box>
          <Typography variant="h4" component="h1" fontWeight="bold" sx={{ mb: 1, background: 'linear-gradient(90deg, #60a5fa, #3b82f6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            MeetStream
          </Typography>
          <Typography variant="body1" sx={{ color: '#a0aab2', mb: 4 }}>
            Premium video calling for small teams.
          </Typography>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Button 
              variant="contained" 
              size="large" 
              startIcon={<VideocamIcon />}
              onClick={handleCreateRoom}
              sx={{ py: 1.5, borderRadius: 2, textTransform: 'none', fontSize: '1.1rem', bgcolor: '#3b82f6', '&:hover': { bgcolor: '#2563eb' } }}
            >
              New Meeting
            </Button>
            
            <Divider sx={{ my: 2, '&::before, &::after': { borderColor: '#2e333d' }, color: '#a0aab2' }}>or</Divider>
            
            <form onSubmit={handleJoinRoom} style={{ display: 'flex', gap: '8px' }}>
              <TextField
                fullWidth
                variant="outlined"
                placeholder="Enter meeting code"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                InputProps={{
                  sx: { bgcolor: '#0f1115', color: 'white', '& fieldset': { borderColor: '#2e333d' }, '&:hover fieldset': { borderColor: '#3b82f6' } }
                }}
              />
              <Button 
                type="submit" 
                variant="outlined" 
                disabled={!roomId.trim()}
                sx={{ px: 4, borderRadius: 2, textTransform: 'none', borderColor: '#3b82f6', color: '#3b82f6', '&:hover': { bgcolor: 'rgba(59, 130, 246, 0.1)' } }}
              >
                Join
              </Button>
            </form>
          </Box>
        </Paper>
      </Container>
    </Box>
  );
};

export default Home;
