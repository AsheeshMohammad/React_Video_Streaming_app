import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Peer from 'peerjs';
import { 
  Box, 
  Button, 
  TextField, 
  Typography, 
  Paper, 
  Container, 
  IconButton, 
  CircularProgress 
} from '@mui/material';
import MicIcon from '@mui/icons-material/Mic';
import MicOffIcon from '@mui/icons-material/MicOff';
import VideocamIcon from '@mui/icons-material/Videocam';
import VideocamOffIcon from '@mui/icons-material/VideocamOff';
import ScreenShareIcon from '@mui/icons-material/ScreenShare';
import CallEndIcon from '@mui/icons-material/CallEnd';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';
import PushPinIcon from '@mui/icons-material/PushPin';
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined';

const peerConfig = {
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
    ]
  },
  debug: 2
};

const Room = () => {
  const { roomId } = useParams();
  const navigate = useNavigate();

  const [username, setUsername] = useState(() => sessionStorage.getItem(`username_${roomId}`) || '');
  const [hasJoined, setHasJoined] = useState(() => sessionStorage.getItem(`joined_${roomId}`) === 'true');

  const [peer, setPeer] = useState(null);
  const [myStream, setMyStream] = useState(null);
  const [peers, setPeers] = useState({});
  const [peerNames, setPeerNames] = useState({});
  const [isHost, setIsHost] = useState(false);
  
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pinnedId, setPinnedId] = useState(null);

  const myVideoRef = useRef();
  const peersRef = useRef({}); 
  const connectionsRef = useRef({});
  const hostReconnectInterval = useRef(null);

  const isOrganizer = localStorage.getItem('organizer_' + roomId) === 'true';

  useEffect(() => {
    if (!loading && hasJoined && myVideoRef.current && myStream) {
      myVideoRef.current.srcObject = myStream;
    }
  }, [loading, hasJoined, myStream]);

  useEffect(() => {
    if (!hasJoined) return;

    navigator.mediaDevices.getUserMedia({ 
      video: true, 
      audio: {
        noiseSuppression: true,
        echoCancellation: true,
        autoGainControl: true
      } 
    })
      .then((stream) => {
        setMyStream(stream);
        if (myVideoRef.current) {
          myVideoRef.current.srcObject = stream;
        }
        
        initializePeer(stream, username);
      })
      .catch((err) => {
        console.error("Failed to get local stream", err);
        alert("Could not access camera/microphone");
        setLoading(false);
      });

    return () => {
      if (myStream) {
        myStream.getTracks().forEach(track => track.stop());
      }
      if (peer) {
        peer.destroy();
      }
      if (hostReconnectInterval.current) {
        clearInterval(hostReconnectInterval.current);
      }
    };
    // eslint-disable-next-line
  }, [roomId, hasJoined]);

  const initializePeer = (stream, currentUsername) => {
    const hostId = `${roomId}-host`;
    
    if (isOrganizer) {
      tryCreateHostPeer(hostId, stream, currentUsername);
    } else {
      createGuestPeer(hostId, stream, currentUsername);
    }
  };

  const tryCreateHostPeer = (hostId, stream, currentUsername) => {
    const newPeer = new Peer(hostId, { ...peerConfig });

    newPeer.on('open', (id) => {
      console.log('Connected as Host/Organizer:', id);
      setIsHost(true);
      setPeer(newPeer);
      setLoading(false);
      setupPeerListeners(newPeer, stream, true, currentUsername);
    });

    newPeer.on('error', (err) => {
      if (err.type === 'unavailable-id') {
        console.log('Host ID unavailable (likely still dropping old session). Retrying in 2s...');
        setTimeout(() => {
          if (!peer || peer.destroyed) {
            tryCreateHostPeer(hostId, stream, currentUsername);
          }
        }, 2000);
      } else {
        console.error('Host peer error:', err);
        setLoading(false);
      }
    });
  };

  const createGuestPeer = (hostId, stream, currentUsername) => {
    const guestPeer = new Peer({ ...peerConfig });
    
    guestPeer.on('open', (id) => {
      console.log('Connected as Guest:', id);
      setIsHost(false);
      setPeer(guestPeer);
      setLoading(false);
      setupPeerListeners(guestPeer, stream, false, currentUsername);
      
      maintainConnectionToHost(guestPeer, hostId, stream, currentUsername);
    });

    guestPeer.on('error', (err) => {
      console.error('Guest Peer error:', err);
      if (err.type === 'peer-unavailable') {
        if (peersRef.current[hostId]) {
          delete peersRef.current[hostId];
        }
      }
    });
  };

  const maintainConnectionToHost = (guestPeer, hostId, stream, currentUsername) => {
    const attemptConnection = () => {
      if (peersRef.current[hostId]) return; 
      console.log('Attempting to connect to host...');
      connectToPeer(guestPeer, hostId, stream, currentUsername);
    };
    
    attemptConnection();
    hostReconnectInterval.current = setInterval(attemptConnection, 3000);
  };

  const setupPeerListeners = (currentPeer, stream, isCurrentHost, currentUsername) => {
    currentPeer.on('call', (call) => {
      console.log('Receiving call from', call.peer);
      
      if (call.metadata && call.metadata.username) {
        setPeerNames(prev => ({ ...prev, [call.peer]: call.metadata.username }));
      }
      
      call.answer(stream);
      
      call.on('stream', (userVideoStream) => {
        addPeerStream(call.peer, userVideoStream);
      });

      call.on('close', () => {
        removePeerStream(call.peer);
        delete peersRef.current[call.peer];
      });

      peersRef.current[call.peer] = call;
    });

    currentPeer.on('connection', (conn) => {
      conn.on('data', (data) => {
        if (data.type === 'user-info') {
          setPeerNames(prev => ({ ...prev, [data.peerId]: data.username }));
          
          if (isCurrentHost) {
            // Notify existing peers about this new guest
            Object.values(connectionsRef.current).forEach(c => {
              if (c.peer !== conn.peer && c.open) {
                c.send({ type: 'new-guest', peerId: data.peerId });
              }
            });
          }
        }
        if (data.type === 'new-guest' && !isCurrentHost) {
          connectToPeer(currentPeer, data.peerId, stream, currentUsername);
        }
      });
      conn.on('open', () => {
         connectionsRef.current[conn.peer] = conn;
         conn.send({ type: 'user-info', username: currentUsername, peerId: currentPeer.id });
         
         if (isCurrentHost) {
           // Tell the new guest about all existing peers
           Object.keys(connectionsRef.current).forEach(existingPeerId => {
             if (existingPeerId !== conn.peer && connectionsRef.current[existingPeerId].open) {
               conn.send({ type: 'new-guest', peerId: existingPeerId });
             }
           });
         }
      });
      conn.on('close', () => {
        delete connectionsRef.current[conn.peer];
      });
    });
  };

  const connectToPeer = (currentPeer, targetId, stream, currentUsername) => {
    if (peersRef.current[targetId]) return;

    console.log('Calling', targetId);
    const call = currentPeer.call(targetId, stream, { metadata: { username: currentUsername } });
    
    if (!call) return; 

    peersRef.current[targetId] = call;
    
    call.on('stream', (userVideoStream) => {
      addPeerStream(targetId, userVideoStream);
    });

    call.on('close', () => {
      removePeerStream(targetId);
      delete peersRef.current[targetId];
    });

    const conn = currentPeer.connect(targetId);
    if (conn) {
      conn.on('open', () => {
        connectionsRef.current[conn.peer] = conn;
        conn.send({ type: 'user-info', username: currentUsername, peerId: currentPeer.id });
      });
      conn.on('data', (data) => {
        if (data.type === 'user-info') {
          setPeerNames(prev => ({ ...prev, [data.peerId]: data.username }));
        }
        if (data.type === 'new-guest') {
          connectToPeer(currentPeer, data.peerId, stream, currentUsername);
        }
      });
      conn.on('close', () => {
        delete connectionsRef.current[conn.peer];
      });
    }
  };

  const addPeerStream = (peerId, stream) => {
    setPeers(prev => ({ ...prev, [peerId]: stream }));
  };

  const removePeerStream = (peerId) => {
    setPeers(prev => {
      const newPeers = { ...prev };
      delete newPeers[peerId];
      return newPeers;
    });
    if (peersRef.current[peerId]) {
      peersRef.current[peerId].close();
      delete peersRef.current[peerId];
    }
  };

  const toggleAudio = () => {
    if (myStream) {
      const audioTrack = myStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setAudioEnabled(audioTrack.enabled);
      }
    }
  };

  const toggleVideo = () => {
    if (myStream) {
      const videoTrack = myStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setVideoEnabled(videoTrack.enabled);
      }
    }
  };

  const toggleScreenShare = async () => { 
    
    if (!isScreenSharing) {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = screenStream.getVideoTracks()[0];
        
        if (myStream) {
          const videoTrack = myStream.getVideoTracks()[0];
          
          Object.values(peersRef.current).forEach(call => {
            const sender = call.peerConnection?.getSenders().find(s => s.track.kind === 'video');
            if (sender) {
              sender.replaceTrack(screenTrack);
            }
          });

          if (myVideoRef.current) {
            myVideoRef.current.srcObject = screenStream;
          }

          screenTrack.onended = () => {
            stopScreenSharing(videoTrack);
          };
          
          setIsScreenSharing(true);
        }
      } catch (error) {
        console.error("Error sharing screen", error);
      }
    } else {
      if (myStream) {
        const videoTrack = myStream.getVideoTracks()[0];
        stopScreenSharing(videoTrack);
      }
    }
  };

  const stopScreenSharing = (videoTrack) => {
    Object.values(peersRef.current).forEach(call => {
      const sender = call.peerConnection?.getSenders().find(s => s.track.kind === 'video');
      if (sender) {
        sender.replaceTrack(videoTrack);
      }
    });

    if (myVideoRef.current) {
      myVideoRef.current.srcObject = myStream;
    }
    
    setIsScreenSharing(false);
  };

  const leaveRoom = () => {
    if (myStream) {
      myStream.getTracks().forEach(track => track.stop());
    }
    if (peer) {
      peer.destroy();
    }
    if (hostReconnectInterval.current) {
      clearInterval(hostReconnectInterval.current);
    }
    sessionStorage.removeItem(`joined_${roomId}`);
    navigate('/');
  };

  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleJoin = (e) => {
    e.preventDefault();
    if (username.trim()) {
      sessionStorage.setItem(`username_${roomId}`, username.trim());
      sessionStorage.setItem(`joined_${roomId}`, 'true');
      setHasJoined(true);
    }
  };

  if (!hasJoined) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', bgcolor: '#0f1115', backgroundImage: 'radial-gradient(circle at top right, #1f2331, #0f1115)' }}>
        <Container maxWidth="sm">
          <Paper elevation={24} sx={{ p: 5, borderRadius: 4, textAlign: 'center', bgcolor: '#1c1f26', color: 'white', border: '1px solid #2e333d' }}>
            <Typography variant="h4" component="h1" fontWeight="bold" sx={{ mb: 1, background: 'linear-gradient(90deg, #60a5fa, #3b82f6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Join Room
            </Typography>
            <Typography variant="body1" sx={{ color: '#a0aab2', mb: 4 }}>
              Enter your name to join the meeting
            </Typography>
            <form onSubmit={handleJoin} style={{ display: 'flex', gap: '8px' }}>
              <TextField
                fullWidth
                variant="outlined"
                placeholder="Your Name"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoFocus
                InputProps={{
                  sx: { bgcolor: '#0f1115', color: 'white', '& fieldset': { borderColor: '#2e333d' }, '&:hover fieldset': { borderColor: '#3b82f6' } }
                }}
              />
              <Button type="submit" variant="contained" sx={{ px: 4, borderRadius: 2, textTransform: 'none', bgcolor: '#3b82f6', '&:hover': { bgcolor: '#2563eb' } }}>
                Join
              </Button>
            </form>
          </Paper>
        </Container>
      </Box>
    );
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', bgcolor: '#0f1115', color: '#a0aab2', gap: 2 }}>
        <CircularProgress sx={{ color: '#3b82f6' }} />
        <Typography>Joining room...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', bgcolor: '#0f1115' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 2, bgcolor: '#1c1f26', borderBottom: '1px solid #2e333d' }}>
        <Box>
          <Typography variant="h6" fontWeight={600} color="white">
            MeetStream Room
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: '#a0aab2' }}>
            <Typography variant="body2">Code: {roomId}</Typography>
            <IconButton onClick={copyRoomId} size="small" sx={{ color: '#3b82f6' }}>
              {copied ? <CheckIcon fontSize="small" /> : <ContentCopyIcon fontSize="small" />}
            </IconButton>
          </Box>
        </Box>
      </Box>

      <Box sx={{ flex: 1, display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: 2, p: 2, overflow: 'auto' }}>
        {/* My Video */}
        <Box 
          sx={{ 
            position: 'relative', 
            bgcolor: '#1c1f26', 
            borderRadius: 3, 
            overflow: 'hidden', 
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)', 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center', 
            transition: 'all 0.3s ease',
            minWidth: 300, 
            minHeight: 200,
            flex: pinnedId === 'local' || (pinnedId === null && Object.keys(peers).length === 0) ? '2 1 600px' : '1 1 300px',
            maxWidth: pinnedId === 'local' || (pinnedId === null && Object.keys(peers).length === 0) ? 'calc(100% - 2rem)' : 400,
            maxHeight: pinnedId === 'local' || (pinnedId === null && Object.keys(peers).length === 0) ? 'calc(100% - 2rem)' : 300,
            '&:hover .pin-btn': { opacity: 1 }
          }}
        >
          <video 
            ref={myVideoRef} 
            autoPlay 
            muted 
            playsInline 
            style={{ width: '100%', height: '100%', objectFit: isScreenSharing ? 'contain' : 'cover', transform: isScreenSharing ? 'none' : 'scaleX(-1)' }} 
          />
          <Box sx={{ position: 'absolute', bottom: 16, left: 16, bgcolor: 'rgba(0,0,0,0.6)', px: 1.5, py: 0.5, borderRadius: 1, color: 'white', backdropFilter: 'blur(4px)' }}>
            <Typography variant="body2">{username} {isOrganizer ? '(Host)' : ''}</Typography>
          </Box>
          <IconButton 
            className="pin-btn"
            onClick={() => setPinnedId(pinnedId === 'local' ? null : 'local')}
            sx={{ position: 'absolute', top: 16, right: 16, bgcolor: pinnedId === 'local' ? '#3b82f6' : 'rgba(0,0,0,0.6)', color: 'white', opacity: pinnedId === 'local' ? 1 : 0, transition: 'all 0.2s', '&:hover': { bgcolor: '#3b82f6' } }}
          >
            {pinnedId === 'local' ? <PushPinOutlinedIcon fontSize="small" /> : <PushPinIcon fontSize="small" />}
          </IconButton>
        </Box>

        {/* Remote Videos */}
        {Object.entries(peers).map(([peerId, stream]) => (
          <RemoteVideo 
            key={peerId} 
            peerId={peerId} 
            stream={stream} 
            name={peerNames[peerId] || `User ${peerId.substring(0, 4)}`}
            isPinned={pinnedId === peerId}
            onPinToggle={() => setPinnedId(pinnedId === peerId ? null : peerId)}
          />
        ))}
      </Box>

      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 2, p: 3, bgcolor: '#1c1f26', borderTop: '1px solid #2e333d' }}>
        <IconButton 
          onClick={toggleAudio}
          sx={{ width: 56, height: 56, bgcolor: audioEnabled ? '#2e333d' : '#ef4444', color: 'white', '&:hover': { bgcolor: audioEnabled ? '#404756' : '#dc2626' } }}
        >
          {audioEnabled ? <MicIcon /> : <MicOffIcon />}
        </IconButton>
        
        <IconButton 
          onClick={toggleVideo}
          sx={{ width: 56, height: 56, bgcolor: videoEnabled ? '#2e333d' : '#ef4444', color: 'white', '&:hover': { bgcolor: videoEnabled ? '#404756' : '#dc2626' } }}
        >
          {videoEnabled ? <VideocamIcon /> : <VideocamOffIcon />}
        </IconButton>
        
        <IconButton 
          onClick={toggleScreenShare}
          sx={{ width: 56, height: 56, bgcolor: isScreenSharing ? 'rgba(59, 130, 246, 0.2)' : '#2e333d', color: isScreenSharing ? '#3b82f6' : 'white', '&:hover': { bgcolor: isScreenSharing ? 'rgba(59, 130, 246, 0.3)' : '#404756' } }}
        >
          <ScreenShareIcon />
        </IconButton>
        
        <IconButton 
          onClick={leaveRoom}
          sx={{ width: 56, height: 56, bgcolor: '#ef4444', color: 'white', '&:hover': { bgcolor: '#dc2626' } }}
        >
          <CallEndIcon />
        </IconButton>
      </Box>
    </Box>
  );
};

const RemoteVideo = ({ peerId, stream, name, isPinned, onPinToggle }) => {
  const videoRef = useRef();

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <Box 
      sx={{ 
        position: 'relative', 
        bgcolor: '#1c1f26', 
        borderRadius: 3, 
        overflow: 'hidden', 
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)', 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        transition: 'all 0.3s ease',
        minWidth: 300, 
        minHeight: 200,
        flex: isPinned ? '2 1 600px' : '1 1 300px',
        maxWidth: isPinned ? 'calc(100% - 2rem)' : 400,
        maxHeight: isPinned ? 'calc(100% - 2rem)' : 300,
        '&:hover .pin-btn': { opacity: 1 }
      }}
    >
      <video ref={videoRef} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      <Box sx={{ position: 'absolute', bottom: 16, left: 16, bgcolor: 'rgba(0,0,0,0.6)', px: 1.5, py: 0.5, borderRadius: 1, color: 'white', backdropFilter: 'blur(4px)' }}>
        <Typography variant="body2">{name}</Typography>
      </Box>
      <IconButton 
        className="pin-btn"
        onClick={onPinToggle}
        sx={{ position: 'absolute', top: 16, right: 16, bgcolor: isPinned ? '#3b82f6' : 'rgba(0,0,0,0.6)', color: 'white', opacity: isPinned ? 1 : 0, transition: 'all 0.2s', '&:hover': { bgcolor: '#3b82f6' } }}
      >
        {isPinned ? <PushPinOutlinedIcon fontSize="small" /> : <PushPinIcon fontSize="small" />}
      </IconButton>
    </Box>
  );
};

export default Room;
