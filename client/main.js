// JavaScript variables holding stream and connection information
var localStream, remoteStream, peerConnection;

// JavaScript variables associated with HTML5 video elements in the page
var localVideo = document.getElementById("localVideo");
var remoteVideo = document.getElementById("remoteVideo");

// JavaScript variables assciated with call management buttons in the page
var captureButton = document.getElementById("captureButton");
var attachButton = document.getElementById("attachButton");
var joinButton = document.getElementById("joinButton");
var callButton = document.getElementById("callButton");
var answerButton = document.getElementById("answerButton");
var hangupButton = document.getElementById("hangupButton");

var urlParams = new URLSearchParams(window.location.search);
var isInitiator = urlParams.has('initiator');
var roomId = parseInt(urlParams.get('room_id')) || 111;

// Just allow the user to click on the Call button at start-up
captureButton.disabled = false;
attachButton.disabled = true;
callButton.disabled = !isInitiator;
answerButton.disabled = true;
hangupButton.disabled = true;

// Associate JavaScript handlers with click events on the buttons
captureButton.onclick = captureStream;
attachButton.onclick = attachToServer;
joinButton.onclick = joinRoom;
callButton.onclick = callRoom;
answerButton.onclick = answerCall;
hangupButton.onclick = hangup;

var websocket, sessionId, pluginHandleId;
var keepAliveInterval;
var sessionTransaction, handleTransaction, joinTransaction, callTransaction;
var janusHost = 'wss://192.168.99.100:8989';

function captureStream() {
  navigator.getUserMedia({ video: true }, successCallback, errorCallback);
  captureButton.disabled = true;
  attachButton.disabled = false;
}

function attachToServer() {
  attachButton.disabled = true;
  hangupButton.disabled = false;

  websocket = new WebSocket(janusHost, 'janus-protocol');
  websocket.onopen = function (event) {
    peerConnection = new RTCPeerConnection(null);

    // Triggered whenever a new candidate is made available to the local peer by the ICE protocol machine
    peerConnection.onicecandidate = gotLocalIceCandidate;

    // Triggered on setRemoteDescription() call
    peerConnection.onaddstream = gotRemoteStream;

    peerConnection.addStream(localStream);

    sessionTransaction = getTransactionId();
    var payload = {
      "janus": "create",
      "transaction": sessionTransaction
    };
    websocket.send(JSON.stringify(payload));
  };

  websocket.onmessage = onMessage;
}

// Callee join room to allow initiator to know in which room calle is
function joinRoom() {
  joinTransaction = getTransactionId();
  var message = {
    "event": "join",
    "room_id": roomId,
    "initiator": isInitiator
  };
  var payload = {
    "janus" : "message",
    "session_id": sessionId,
    "handle_id": pluginHandleId,
    "transaction" : joinTransaction,
    "body": message
  };

  console.log('Joining room');
  websocket.send(JSON.stringify(payload));
}

function callRoom() {
  console.log('creating offer');
  peerConnection.createOffer(onOfferReady, onSignalingError);
}

function answerCall() {
  console.log('creating answer');
  peerConnection.createAnswer(onAnswerReady, onSignalingError);
}

function handleEvent(data) {
  console.log('--> handleEvent');
  console.log(data);
  console.log('<-- handleEvent');

  var data = data.plugindata.data;
  switch (data.event) {
    case 'join':
      console.log('Joined');
      console.log(data);
      break;

    case 'call':
      console.log('Got remote SDP offer');
      console.log(data.jsep);
      peerConnection.setRemoteDescription(new RTCSessionDescription(data.jsep));
      answerButton.disabled = isInitiator;
      break;

    case 'accept':
      console.log('Got remote SDP answer');
      console.log(data.jsep);
      peerConnection.setRemoteDescription(new RTCSessionDescription(data.jsep));
      break;

    case 'candidate':
      var candidate = new RTCIceCandidate(data.candidate);
      peerConnection.addIceCandidate(candidate);
      break;

    default:
      console.error('Unknown event');
      break;
  }
}

function hangup() {
  peerConnection.close();
  websocket.close();

  localStream = null;
  remoteStream = null;

  captureButton.disabled = false;
  hangupButton.disabled = true;

  clearInterval(keepAliveInterval);
}

function gotLocalIceCandidate(event) {
  var candidate = event.candidate;
  console.log('gotLocalIceCandidate');
  console.log(candidate);

  if (candidate) {
    // var payload = {
    //   "janus": "trickle",
    //   "session_id": sessionId,
    //   "handle_id": pluginHandleId,
    //   "transaction": getTransactionId(),
    //   "candidate": candidate
    // };
    var message = {
      "event": "candidate",
      "candidate": candidate,
    };
    var payload = {
      "janus" : "message",
      "session_id": sessionId,
      "handle_id": pluginHandleId,
      "transaction" : getTransactionId(),
      "body": message
    };

    console.log('Uploading ICE candidate');
    console.log(payload);
    websocket.send(JSON.stringify(payload));
  }
}

function gotRemoteStream(event) {
  console.log('gotRemoteStream');

  remoteStream = event.stream;
  attachMediaStream(remoteVideo, remoteStream);
}

function onOfferReady(desc) {
  console.log('offer is ready');
  console.log(desc);

  peerConnection.setLocalDescription(desc);

  callTransaction = getTransactionId();
  var message = {
    "event": "call",
    "jsep": {
      "type": "offer",
      "sdp": desc.sdp
    },
    // "sdp": desc.sdp
  };
  var payload = {
    "janus" : "message",
    "session_id": sessionId,
    "handle_id": pluginHandleId,
    "transaction" : callTransaction,
    "body": message
  };

  console.log('Uploading offer');
  console.log(payload);
  websocket.send(JSON.stringify(payload));
}

function onAnswerReady(desc) {
  console.log('answer is ready');
  console.log(desc);

  peerConnection.setLocalDescription(desc);

  callTransaction = getTransactionId();
  var message = {
    "event": "accept",
    "jsep": {
      "type": "answer",
      "sdp": desc.sdp
    },
    // "sdp": desc.sdp
  };
  var payload = {
    "janus" : "message",
    "session_id": sessionId,
    "handle_id": pluginHandleId,
    "transaction" : callTransaction,
    "body": message
  };

  console.log('Uploading answer');
  console.log(payload);
  websocket.send(JSON.stringify(payload));
}

function onSignalingError(error){
  console.log('Failed to create signaling message : ' + error.message);
}

function successCallback(gotStream) {
  localStream = gotStream;
  attachMediaStream(localVideo, localStream);
}

function errorCallback(error) {
  console.log('error' + error);
}

function getTransactionId() {
  return Math.random().toString(36).replace(/[^a-z]+/g, '').substr(0, 5);
}

function onMessage(event) {
  var data = JSON.parse(event.data);

  console.log('---> got a message');
  console.log(data);
  console.log('<--- got a message');

  switch (data.janus) {
    case 'success':
      if (data.transaction == sessionTransaction) {
        sessionId = data.data.id;

        handleTransaction = getTransactionId();
        var payload = {
          "janus" : "attach",
          "session_id": sessionId,
          "plugin" : "janus.plugin.p2p",
          "transaction" : handleTransaction
        };
        websocket.send(JSON.stringify(payload));

        keepAliveInterval = setInterval(askKeepAlive, 50000);

      } else if(data.transaction == handleTransaction) {
        pluginHandleId = data.data.id;

      }
      break;

    case 'event':
      handleEvent(data);
      break;

    default:
      break;
  }
}

function askKeepAlive() {
  console.log('Keeping alive...');
  var payload = {
    "janus": "keepalive",
    "session_id": sessionId,
    "transaction": "sBJNyUhH6Vc6"
  };
  websocket.send(JSON.stringify(payload));
}

function attachMediaStream(element, stream) {
  if (typeof element.srcObject !== 'undefined') {
    element.srcObject = stream;
  } else if (typeof element.mozSrcObject !== 'undefined') {
    element.mozSrcObject = stream;
  } else if (typeof element.src !== 'undefined') {
    element.src = URL.createObjectURL(stream);
  } else {
    console.log('Error attaching stream to element.');
  }
}
