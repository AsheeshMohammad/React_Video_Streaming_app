import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Peer from 'peerjs';
import { Mic, MicOff, Video as VideoIcon, VideoOff, MonitorUp, PhoneOff, Copy, Check, Pin, PinOff } from 'lucide-react';

const Room = () => {
  const { roomId } = useParams();
  const navigate = useNavigate();

  const [peer, setPeer] = useState(null);
  const [myStream, setMyStream] = useState(null);
  const [peers, setPeers] = useState({});
  const [isHost, setIsHost] = useState(false);
  
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pinnedId, setPinnedId] = useState(null);

  const myVideoRef = useRef();
  const peersRef = useRef({}); // keep track of calls

  // Fix: Attach local stream to video element once it renders (after loading is false)
  useEffect(() => {
    if (!loading && myVideoRef.current && myStream) {
      myVideoRef.current.srcObject = myStream;
    }
  }, [loading, myStream]);

  useEffect(() => {
    // Get user media with noise cancellation
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
        
        initializePeer(stream);
      })
      .catch((err) => {
        console.error("Failed to get local stream", err);
        alert("Could not access camera/microphone");
        setLoading(false);
      });

    return () => {
      // Cleanup
      if (myStream) {
        myStream.getTracks().forEach(track => track.stop());
      }
      if (peer) {
        peer.destroy();
      }
    };
    // eslint-disable-next-line
  }, [roomId]);

  const initializePeer = (stream) => {
    const hostId = `${roomId}-host`;
    
    const newPeer = new Peer(hostId, {
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
    });

    newPeer.on('open', (id) => {
      console.log('Connected as Host:', id);
      setIsHost(true);
      setPeer(newPeer);
      setLoading(false);
      setupPeerListeners(newPeer, stream, true);
    });

    newPeer.on('error', (err) => {
      if (err.type === 'unavailable-id') {
        // Host already exists, join as guest
        const guestPeer = new Peer({
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
        });
        
        guestPeer.on('open', (id) => {
          console.log('Connected as Guest:', id);
          setIsHost(false);
          setPeer(guestPeer);
          setLoading(false);
          setupPeerListeners(guestPeer, stream, false);
          
          // Call the host
          connectToPeer(guestPeer, hostId, stream);
        });

        guestPeer.on('error', (guestErr) => {
          console.error('Guest Peer error:', guestErr);
          setLoading(false);
        });
      } else {
        console.error('Peer error:', err);
        setLoading(false);
      }
    });
  };

  const setupPeerListeners = (currentPeer, stream, isCurrentHost) => {
    // When someone calls us, answer with our stream
    currentPeer.on('call', (call) => {
      console.log('Receiving call from', call.peer);
      call.answer(stream);
      
      call.on('stream', (userVideoStream) => {
        addPeerStream(call.peer, userVideoStream);
      });

      call.on('close', () => {
        removePeerStream(call.peer);
      });

      peersRef.current[call.peer] = call;
    });

    // We can also setup data connections to share the list of participants if we are the host
    currentPeer.on('connection', (conn) => {
      conn.on('data', (data) => {
        if (data.type === 'new-guest' && !isCurrentHost) {
          // Connect to the new guest
          connectToPeer(currentPeer, data.peerId, stream);
        }
      });
    });
  };

  const connectToPeer = (currentPeer, targetId, stream) => {
    if (peersRef.current[targetId]) return; // already connected

    console.log('Calling', targetId);
    const call = currentPeer.call(targetId, stream);
    
    call.on('stream', (userVideoStream) => {
      addPeerStream(targetId, userVideoStream);
    });

    call.on('close', () => {
      removePeerStream(targetId);
    });

    peersRef.current[targetId] = call;

    // Data connection to let host know we are here
    const conn = currentPeer.connect(targetId);
    conn.on('open', () => {
      if (isHost) {
        // If I am host and someone connected, tell others about this new guy (not fully implemented to keep it simple, 2-3 works well with star topology mostly but peer to peer is better)
        // For simplicity in a 2-3 person app, we let them all talk to the host, 
        // if we want full mesh we should broadcast peer IDs.
      }
    });
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
    if (!isScreenSharing) {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = screenStream.getVideoTracks()[0];
        
        // Replace video track for all peers
        if (myStream) {
          const videoTrack = myStream.getVideoTracks()[0];
          
          Object.values(peersRef.current).forEach(call => {
            const sender = call.peerConnection.getSenders().find(s => s.track.kind === 'video');
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
      const sender = call.peerConnection.getSenders().find(s => s.track.kind === 'video');
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
    navigate('/');
  };

  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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
            style={{ transform: isScreenSharing ? 'none' : 'scaleX(-1)' }} // Mirror camera but not screen share
          />
          <div className="video-label">You {isHost ? '(Host)' : ''}</div>
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
        
        <button 
          className={`control-btn ${isScreenSharing ? 'active' : ''}`} 
          onClick={toggleScreenShare}
          title="Share screen"
        >
          <MonitorUp size={24} />
        </button>
        
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

const RemoteVideo = ({ peerId, stream, isPinned, onPinToggle }) => {
  const videoRef = useRef();

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className={`video-wrapper ${isPinned ? 'main' : 'secondary'}`}>
      <video ref={videoRef} autoPlay playsInline />
      <div className="video-label">User {peerId.substring(0, 4)}</div>
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
