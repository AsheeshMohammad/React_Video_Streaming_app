import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Peer from 'peerjs';
import { Mic, MicOff, Video as VideoIcon, VideoOff, MonitorUp, PhoneOff, Copy, Check, Pin, PinOff } from 'lucide-react';

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

  const [username, setUsername] = useState('');
  const [hasJoined, setHasJoined] = useState(false);

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
      
      // Attempt to maintain connection to host
      maintainConnectionToHost(guestPeer, hostId, stream, currentUsername);
    });

    guestPeer.on('error', (err) => {
      console.error('Guest Peer error:', err);
      if (err.type === 'peer-unavailable') {
        // The host we tried to call is offline. Allow interval to retry later.
        if (peersRef.current[hostId]) {
          delete peersRef.current[hostId];
        }
      }
    });
  };

  const maintainConnectionToHost = (guestPeer, hostId, stream, currentUsername) => {
    const attemptConnection = () => {
      if (peersRef.current[hostId]) return; // Already attempting or connected
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
        }
        if (data.type === 'new-guest' && !isCurrentHost) {
          connectToPeer(currentPeer, data.peerId, stream, currentUsername);
        }
      });
      conn.on('open', () => {
         conn.send({ type: 'user-info', username: currentUsername, peerId: currentPeer.id });
      });
    });
  };

  const connectToPeer = (currentPeer, targetId, stream, currentUsername) => {
    if (peersRef.current[targetId]) return;

    console.log('Calling', targetId);
    const call = currentPeer.call(targetId, stream, { metadata: { username: currentUsername } });
    
    if (!call) return; // Might happen if peer disconnected right before

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
        conn.send({ type: 'user-info', username: currentUsername, peerId: currentPeer.id });
      });
    }
  };

  const addPeerStream = (peerId, stream) => {
    setPeers(prev => ({
      ...prev,
      [peerId]: stream
    }));
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
    if (!isHost) return; 
    
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
      setHasJoined(true);
    }
  };

  if (!hasJoined) {
    return (
      <div className="home-container">
        <div className="home-card">
          <h2 className="home-title">Join Room</h2>
          <p className="home-subtitle">Enter your name to join the meeting</p>
          <form onSubmit={handleJoin} className="action-container">
            <div className="join-container">
              <input
                type="text"
                placeholder="Your Name"
                className="input-field"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoFocus
              />
              <button type="submit" className="primary-btn">Join</button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Joining room...</p>
      </div>
    );
  }

  return (
    <div className="room-container">
      <div className="room-header">
        <div className="room-info">
          <h2>MeetStream Room</h2>
          <div className="room-id">
            Code: {roomId}
            <button onClick={copyRoomId} className="copy-btn" title="Copy code">
              {copied ? <Check size={16} /> : <Copy size={16} />}
            </button>
          </div>
        </div>
      </div>

      <div className="video-grid">
        {/* My Video */}
        <div className={`video-wrapper ${isScreenSharing ? 'screen-share' : ''} ${pinnedId === 'local' || (pinnedId === null && Object.keys(peers).length === 0) ? 'main' : 'secondary'}`}>
          <video 
            ref={myVideoRef} 
            autoPlay 
            muted 
            playsInline 
            style={{ transform: isScreenSharing ? 'none' : 'scaleX(-1)' }} 
          />
          <div className="video-label">{username} {isOrganizer ? '(Host)' : ''}</div>
          <button 
            className={`pin-btn ${pinnedId === 'local' ? 'pinned' : ''}`}
            onClick={() => setPinnedId(pinnedId === 'local' ? null : 'local')}
            title={pinnedId === 'local' ? "Unpin" : "Pin"}
          >
            {pinnedId === 'local' ? <PinOff size={16} /> : <Pin size={16} />}
          </button>
        </div>

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
      </div>

      <div className="controls-container">
        <button 
          className={`control-btn ${!audioEnabled ? 'off' : ''}`} 
          onClick={toggleAudio}
          title={audioEnabled ? 'Mute' : 'Unmute'}
        >
          {audioEnabled ? <Mic size={24} /> : <MicOff size={24} />}
        </button>
        
        <button 
          className={`control-btn ${!videoEnabled ? 'off' : ''}`} 
          onClick={toggleVideo}
          title={videoEnabled ? 'Turn off camera' : 'Turn on camera'}
        >
          {videoEnabled ? <VideoIcon size={24} /> : <VideoOff size={24} />}
        </button>
        
        {isOrganizer && (
          <button 
            className={`control-btn ${isScreenSharing ? 'active' : ''}`} 
            onClick={toggleScreenShare}
            title="Share screen"
          >
            <MonitorUp size={24} />
          </button>
        )}
        
        <button 
          className="control-btn danger" 
          onClick={leaveRoom}
          title="Leave call"
        >
          <PhoneOff size={24} />
        </button>
      </div>
    </div>
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
    <div className={`video-wrapper ${isPinned ? 'main' : 'secondary'}`}>
      <video ref={videoRef} autoPlay playsInline />
      <div className="video-label">{name}</div>
      <button 
        className={`pin-btn ${isPinned ? 'pinned' : ''}`}
        onClick={onPinToggle}
        title={isPinned ? "Unpin" : "Pin"}
      >
        {isPinned ? <PinOff size={16} /> : <Pin size={16} />}
      </button>
    </div>
  );
};

export default Room;
