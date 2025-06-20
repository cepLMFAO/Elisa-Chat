class VideoCallComponent {
    constructor(container, options = {}) {
        this.container = container;
        this.options = {
            autoAnswer: false,
            enableChat: true,
            enableScreenShare: true,
            enableRecording: false,
            videoQuality: 'high', // low, medium, high, hd
            audioOnly: false,
            muted: false,
            videoOff: false,
            enableStats: true,
            statsInterval: 5000,
            ...options
        };

        // WebRTC 狀態
        this.peerConnection = null;
        this.localStream = null;
        this.remoteStream = null;
        this.dataChannel = null;
        this.isInitiator = false;
        this.isConnected = false;
        this.isConnecting = false;
        this.callState = 'idle'; // idle, calling, ringing, connected, ended

        // 通話參與者
        this.currentUser = null;
        this.remoteUser = null;
        // 媒體設備
        this.currentVideoDevice = null;
        this.currentAudioDevice = null;
        this.availableDevices = {
            video: [],
            audio: [],
            speaker: []
        };

        // 螢幕分享
        this.isScreenSharing = false;
        this.screenStream = null;

        // 通話統計
        this.callStats = {
            startTime: null,
            duration: 0,
            packetsLost: 0,
            bytesReceived: 0,
            bytesSent: 0
        };

        // UI 元素
        this.elements = {};

        // WebRTC 配置
        this.rtcConfig = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                {
                    urls: 'turn:numb.viagenie.ca',
                    credential: 'muazkh',
                    username: 'webrtc@live.com'
                }
            ],
            iceCandidatePoolSize: 10
        };

        // 媒體約束配置
        this.mediaConstraints = {
            low: {
                video: { width: 320, height: 240, frameRate: 15 },
                audio: { echoCancellation: true, noiseSuppression: true }
            },
            medium: {
                video: { width: 640, height: 480, frameRate: 24 },
                audio: { echoCancellation: true, noiseSuppression: true }
            },
            high: {
                video: { width: 1280, height: 720, frameRate: 30 },
                audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
            },
            hd: {
                video: { width: 1920, height: 1080, frameRate: 30 },
                audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
            }
        };

        this.init();
    }

    async init() {
        this.checkWebRTCSupport();
        this.createCallInterface();
        this.bindEvents();
        await this.loadAvailableDevices();
    }

    checkWebRTCSupport() {
        if (!window.RTCPeerConnection) {
            throw new Error('此瀏覽器不支援 WebRTC');
        }

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('此瀏覽器不支援媒體設備訪問');
        }
    }

    createCallInterface() {
        if (!this.container) return;

        this.container.innerHTML = `
            <div class="video-call-interface" id="video-call-interface">
                <!-- 通話狀態覆蓋層 -->
                <div class="call-overlay" id="call-overlay">
                    <div class="call-status">
                        <div class="status-avatar" id="status-avatar">
                            <img src="" alt="" class="avatar-image">
                        </div>
                        <div class="status-info">
                            <div class="status-name" id="status-name">準備通話</div>
                            <div class="status-text" id="status-text">檢查設備中...</div>
                            <div class="call-duration hidden" id="call-duration">00:00</div>
                        </div>
                        <div class="status-icon" id="status-icon">
                            <i class="fas fa-phone"></i>
                        </div>
                    </div>
                    
                    <!-- 來電控制 -->
                    <div class="incoming-controls hidden" id="incoming-controls">
                        <button class="call-control-btn decline-btn" id="decline-btn">
                            <i class="fas fa-phone-slash"></i>
                            <span>拒絕</span>
                        </button>
                        <button class="call-control-btn accept-btn" id="accept-btn">
                            <i class="fas fa-phone"></i>
                            <span>接聽</span>
                        </button>
                    </div>
                </div>

                <!-- 主視訊區域 -->
                <div class="video-container" id="video-container">
                    <!-- 遠端視訊 -->
                    <div class="remote-video-wrapper" id="remote-video-wrapper">
                        <video id="remote-video" 
                               class="remote-video" 
                               autoplay 
                               playsinline>
                        </video>
                        
                        <!-- 遠端用戶資訊 -->
                        <div class="remote-user-overlay" id="remote-user-overlay">
                            <div class="remote-avatar" id="remote-avatar">
                                <img src="" alt="" class="avatar-image">
                            </div>
                            <div class="remote-info">
                                <div class="remote-name" id="remote-name">對方</div>
                                <div class="remote-status" id="remote-status">連接中...</div>
                            </div>
                        </div>

                        <!-- 連接品質指示器 -->
                        <div class="connection-quality" id="connection-quality">
                            <div class="quality-bars">
                                <div class="bar"></div>
                                <div class="bar"></div>
                                <div class="bar"></div>
                                <div class="bar"></div>
                            </div>
                            <span class="quality-text">良好</span>
                        </div>
                    </div>

                    <!-- 本地視訊 -->
                    <div class="local-video-wrapper" id="local-video-wrapper">
                        <video id="local-video" 
                               class="local-video" 
                               autoplay 
                               playsinline 
                               muted>
                        </video>
                        
                        <!-- 本地控制 -->
                        <div class="local-controls">
                            <button class="btn-icon flip-camera" id="flip-camera" title="翻轉畫面">
                                <i class="fas fa-sync-alt"></i>
                            </button>
                            <button class="btn-icon pip-toggle" id="pip-toggle" title="子母畫面">
                                <i class="fas fa-external-link-alt"></i>
                            </button>
                        </div>

                        <!-- 視訊關閉提示 -->
                        <div class="video-off-indicator hidden" id="video-off-indicator">
                            <i class="fas fa-video-slash"></i>
                            <span>視訊已關閉</span>
                        </div>
                    </div>
                </div>

                <!-- 通話控制欄 -->
                <div class="call-controls" id="call-controls">
                    <div class="controls-wrapper">
                        <!-- 左側控制 -->
                        <div class="control-group left">
                            <button class="control-btn audio-btn" id="audio-btn" data-active="true">
                                <div class="btn-icon">
                                    <i class="fas fa-microphone"></i>
                                </div>
                                <span class="btn-label">麥克風</span>
                            </button>
                            
                            <button class="control-btn video-btn" id="video-btn" data-active="true">
                                <div class="btn-icon">
                                    <i class="fas fa-video"></i>
                                </div>
                                <span class="btn-label">視訊</span>
                            </button>

                            ${this.options.enableScreenShare ? `
                                <button class="control-btn screen-btn" id="screen-btn">
                                    <div class="btn-icon">
                                        <i class="fas fa-desktop"></i>
                                    </div>
                                    <span class="btn-label">分享</span>
                                </button>
                            ` : ''}
                        </div>

                        <!-- 中央控制 -->
                        <div class="control-group center">
                            <button class="control-btn end-call-btn" id="end-call-btn">
                                <div class="btn-icon">
                                    <i class="fas fa-phone-slash"></i>
                                </div>
                                <span class="btn-label">結束</span>
                            </button>
                        </div>

                        <!-- 右側控制 -->
                        <div class="control-group right">
                            ${this.options.enableChat ? `
                                <button class="control-btn chat-btn" id="chat-btn">
                                    <div class="btn-icon">
                                        <i class="fas fa-comment"></i>
                                    </div>
                                    <span class="btn-label">聊天</span>
                                    <div class="notification-badge hidden" id="chat-badge">0</div>
                                </button>
                            ` : ''}
                            
                            <button class="control-btn settings-btn" id="settings-btn">
                                <div class="btn-icon">
                                    <i class="fas fa-cog"></i>
                                </div>
                                <span class="btn-label">設定</span>
                            </button>

                            <button class="control-btn fullscreen-btn" id="fullscreen-btn">
                                <div class="btn-icon">
                                    <i class="fas fa-expand"></i>
                                </div>
                                <span class="btn-label">全螢幕</span>
                            </button>
                        </div>
                    </div>
                </div>

                <!-- 聊天側邊欄 -->
                ${this.options.enableChat ? `
                    <div class="chat-sidebar hidden" id="chat-sidebar">
                        <div class="chat-header">
                            <h3>通話聊天</h3>
                            <button class="btn-icon close-chat" id="close-chat">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                        
                        <div class="chat-messages" id="chat-messages">
                            <div class="chat-welcome">
                                <i class="fas fa-comment"></i>
                                <p>在通話中發送文字訊息</p>
                            </div>
                        </div>
                        
                        <div class="chat-input-wrapper">
                            <input type="text" 
                                   id="chat-input" 
                                   class="chat-input"
                                   placeholder="輸入訊息..."
                                   maxlength="500">
                            <button class="btn-icon send-chat" id="send-chat">
                                <i class="fas fa-paper-plane"></i>
                            </button>
                        </div>
                    </div>
                ` : ''}

                <!-- 設定面板 -->
                <div class="settings-panel hidden" id="settings-panel">
                    <div class="settings-content">
                        <div class="settings-header">
                            <h3>通話設定</h3>
                            <button class="btn-icon close-settings" id="close-settings">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                        
                        <div class="settings-body">
                            <div class="setting-section">
                                <h4>音訊設定</h4>
                                <div class="setting-item">
                                    <label>麥克風</label>
                                    <select id="microphone-select" class="device-select">
                                        <option value="">選擇麥克風</option>
                                    </select>
                                </div>
                                <div class="setting-item">
                                    <label>揚聲器</label>
                                    <select id="speaker-select" class="device-select">
                                        <option value="">選擇揚聲器</option>
                                    </select>
                                </div>
                            </div>

                            <div class="setting-section">
                                <h4>視訊設定</h4>
                                <div class="setting-item">
                                    <label>攝影機</label>
                                    <select id="camera-select" class="device-select">
                                        <option value="">選擇攝影機</option>
                                    </select>
                                </div>
                                <div class="setting-item">
                                    <label>視訊品質</label>
                                    <select id="quality-select" class="quality-select">
                                        <option value="low">低品質 (240p)</option>
                                        <option value="medium">中品質 (480p)</option>
                                        <option value="high">高品質 (720p)</option>
                                        <option value="hd">超高品質 (1080p)</option>
                                    </select>
                                </div>
                            </div>

                            ${this.options.enableStats ? `
                                <div class="setting-section">
                                    <h4>通話統計</h4>
                                    <div class="stats-grid">
                                        <div class="stat-item">
                                            <span class="stat-label">通話時長</span>
                                            <span class="stat-value" id="stat-duration">00:00</span>
                                        </div>
                                        <div class="stat-item">
                                            <span class="stat-label">封包遺失</span>
                                            <span class="stat-value" id="stat-packets">0%</span>
                                        </div>
                                        <div class="stat-item">
                                            <span class="stat-label">連接延遲</span>
                                            <span class="stat-value" id="stat-latency">-- ms</span>
                                        </div>
                                        <div class="stat-item">
                                            <span class="stat-label">頻寬使用</span>
                                            <span class="stat-value" id="stat-bandwidth">-- kbps</span>
                                        </div>
                                    </div>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                </div>

                <!-- 通話結束摘要 -->
                <div class="call-summary hidden" id="call-summary">
                    <div class="summary-content">
                        <div class="summary-header">
                            <i class="fas fa-phone-slash"></i>
                            <h3>通話已結束</h3>
                        </div>
                        <div class="summary-stats">
                            <div class="summary-stat">
                                <span class="stat-label">通話時長</span>
                                <span class="stat-value" id="summary-duration">00:00</span>
                            </div>
                            <div class="summary-stat">
                                <span class="stat-label">通話品質</span>
                                <span class="stat-value" id="summary-quality">良好</span>
                            </div>
                        </div>
                        <div class="summary-actions">
                            <button class="btn btn-primary" id="call-again-btn">再次通話</button>
                            <button class="btn btn-secondary" id="close-summary-btn">關閉</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.getElements();
    }

    getElements() {
        // 獲取所有 DOM 元素引用
        const selectors = {
            // 主容器
            callInterface: '#video-call-interface',
            callOverlay: '#call-overlay',
            videoContainer: '#video-container',
            callControls: '#call-controls',

            // 狀態顯示
            statusAvatar: '#status-avatar img',
            statusName: '#status-name',
            statusText: '#status-text',
            statusIcon: '#status-icon',
            callDuration: '#call-duration',

            // 視訊元素
            localVideo: '#local-video',
            remoteVideo: '#remote-video',
            localVideoWrapper: '#local-video-wrapper',
            remoteVideoWrapper: '#remote-video-wrapper',

            // 用戶資訊
            remoteAvatar: '#remote-avatar img',
            remoteName: '#remote-name',
            remoteStatus: '#remote-status',

            // 控制按鈕
            audioBtn: '#audio-btn',
            videoBtn: '#video-btn',
            screenBtn: '#screen-btn',
            endCallBtn: '#end-call-btn',
            chatBtn: '#chat-btn',
            settingsBtn: '#settings-btn',
            fullscreenBtn: '#fullscreen-btn',
            flipCamera: '#flip-camera',
            pipToggle: '#pip-toggle',

            // 來電控制
            incomingControls: '#incoming-controls',
            acceptBtn: '#accept-btn',
            declineBtn: '#decline-btn',

            // 聊天
            chatSidebar: '#chat-sidebar',
            chatMessages: '#chat-messages',
            chatInput: '#chat-input',
            sendChat: '#send-chat',
            closeChat: '#close-chat',
            chatBadge: '#chat-badge',

            // 設定
            settingsPanel: '#settings-panel',
            closeSettings: '#close-settings',
            cameraSelect: '#camera-select',
            microphoneSelect: '#microphone-select',
            speakerSelect: '#speaker-select',
            qualitySelect: '#quality-select',

            // 其他
            connectionQuality: '#connection-quality',
            videoOffIndicator: '#video-off-indicator',
            callSummary: '#call-summary',
            callAgainBtn: '#call-again-btn',
            closeSummaryBtn: '#close-summary-btn'
        };

        this.elements = {};
        for (const [key, selector] of Object.entries(selectors)) {
            this.elements[key] = this.container.querySelector(selector);
        }
    }

    bindEvents() {
        // 控制按鈕事件
        this.elements.audioBtn?.addEventListener('click', this.toggleAudio.bind(this));
        this.elements.videoBtn?.addEventListener('click', this.toggleVideo.bind(this));
        this.elements.screenBtn?.addEventListener('click', this.toggleScreenShare.bind(this));
        this.elements.endCallBtn?.addEventListener('click', this.endCall.bind(this));
        this.elements.chatBtn?.addEventListener('click', this.toggleChat.bind(this));
        this.elements.settingsBtn?.addEventListener('click', this.toggleSettings.bind(this));
        this.elements.fullscreenBtn?.addEventListener('click', this.toggleFullscreen.bind(this));
        this.elements.flipCamera?.addEventListener('click', this.flipCamera.bind(this));
        this.elements.pipToggle?.addEventListener('click', this.togglePictureInPicture.bind(this));

        // 來電控制
        this.elements.acceptBtn?.addEventListener('click', this.acceptCall.bind(this));
        this.elements.declineBtn?.addEventListener('click', this.declineCall.bind(this));

        // 聊天功能
        this.elements.sendChat?.addEventListener('click', this.sendChatMessage.bind(this));
        this.elements.chatInput?.addEventListener('keydown', this.handleChatKeydown.bind(this));
        this.elements.closeChat?.addEventListener('click', this.closeChat.bind(this));

        // 設定功能
        this.elements.closeSettings?.addEventListener('click', this.closeSettings.bind(this));
        this.elements.cameraSelect?.addEventListener('change', this.changeCameraDevice.bind(this));
        this.elements.microphoneSelect?.addEventListener('change', this.changeMicrophoneDevice.bind(this));
        this.elements.qualitySelect?.addEventListener('change', this.changeVideoQuality.bind(this));

        // 通話摘要
        this.elements.callAgainBtn?.addEventListener('click', this.callAgain.bind(this));
        this.elements.closeSummaryBtn?.addEventListener('click', this.closeSummary.bind(this));

        // 視訊事件
        this.elements.remoteVideo?.addEventListener('loadedmetadata', this.handleRemoteVideoLoaded.bind(this));
        this.elements.localVideo?.addEventListener('loadedmetadata', this.handleLocalVideoLoaded.bind(this));

        // 全域事件
        document.addEventListener('keydown', this.handleKeyboardShortcuts.bind(this));
        document.addEventListener('fullscreenchange', this.handleFullscreenChange.bind(this));
        window.addEventListener('beforeunload', this.handleBeforeUnload.bind(this));
    }

    // ========== 公共 API 方法 ==========

    async startCall(user, audioOnly = false) {
        try {
            this.remoteUser = user;
            this.isInitiator = true;
            this.options.audioOnly = audioOnly;

            this.updateCallState('calling');
            this.updateRemoteUserInfo(user);

            // 獲取本地媒體
            await this.getLocalMedia();

            // 創建 PeerConnection
            this.createPeerConnection();

            // 創建資料通道（用於聊天）
            if (this.options.enableChat) {
                this.createDataChannel();
            }

            // 創建並發送 Offer
            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);

            this.emit('callOffer', {
                to: user.id,
                offer: offer,
                audioOnly: audioOnly
            });

        } catch (error) {
            console.error('發起通話失敗:', error);
            this.handleCallError(error);
        }
    }

    async acceptCall() {
        try {
            this.updateCallState('connecting');

            // 獲取本地媒體
            await this.getLocalMedia();

            // 創建 PeerConnection
            this.createPeerConnection();

            this.emit('callAccepted', {
                to: this.remoteUser.id
            });

        } catch (error) {
            console.error('接聽通話失敗:', error);
            this.handleCallError(error);
        }
    }

    declineCall() {
        this.emit('callDeclined', {
            to: this.remoteUser.id
        });
        this.updateCallState('idle');
    }

    endCall() {
        try {
            if (this.remoteUser) {
                this.emit('callEnded', {
                    to: this.remoteUser.id
                });
            }

            this.showCallSummary();
            this.cleanup();

            this.emit('callTerminated');

        } catch (error) {
            console.error('結束通話失敗:', error);
        }
    }

    showIncomingCallUI(user, audioOnly = false) {
        this.remoteUser = user;
        this.options.audioOnly = audioOnly;
        this.updateCallState('incoming');
        this.updateRemoteUserInfo(user);
    }

    setCurrentUser(user) {
        this.currentUser = user;
    }

    // ========== WebRTC 核心方法 ==========

    async getLocalMedia() {
        try {
            const constraints = this.getMediaConstraints();
            this.localStream = await navigator.mediaDevices.getUserMedia(constraints);

            if (this.elements.localVideo) {
                this.elements.localVideo.srcObject = this.localStream;
            }

            // 添加軌道到 PeerConnection
            if (this.peerConnection) {
                this.localStream.getTracks().forEach(track => {
                    this.peerConnection.addTrack(track, this.localStream);
                });
            }

            this.emit('localStreamObtained', { stream: this.localStream });

        } catch (error) {
            console.error('獲取本地媒體失敗:', error);
            throw new Error('無法訪問攝影機或麥克風');
        }
    }

    getMediaConstraints() {
        const quality = this.options.videoQuality;
        const constraints = this.mediaConstraints[quality] || this.mediaConstraints.high;

        return {
            video: this.options.audioOnly ? false : {
                ...constraints.video,
                deviceId: this.currentVideoDevice ? { exact: this.currentVideoDevice } : undefined
            },
            audio: {
                ...constraints.audio,
                deviceId: this.currentAudioDevice ? { exact: this.currentAudioDevice } : undefined
            }
        };
    }

    createPeerConnection() {
        this.peerConnection = new RTCPeerConnection(this.rtcConfig);

        // 綁定事件處理器
        this.peerConnection.onicecandidate = this.handleIceCandidate.bind(this);
        this.peerConnection.ontrack = this.handleRemoteTrack.bind(this);
        this.peerConnection.onconnectionstatechange = this.handleConnectionStateChange.bind(this);
        this.peerConnection.ondatachannel = this.handleDataChannel.bind(this);

        // 添加本地軌道
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                this.peerConnection.addTrack(track, this.localStream);
            });
        }
    }

    createDataChannel() {
        this.dataChannel = this.peerConnection.createDataChannel('chat', {
            ordered: true
        });
        this.setupDataChannel(this.dataChannel);
    }

    setupDataChannel(channel) {
        this.dataChannel = channel;

        this.dataChannel.onopen = () => {
            console.log('資料通道已開啟');
        };

        this.dataChannel.onmessage = (event) => {
            const message = JSON.parse(event.data);
            this.handleDataChannelMessage(message);
        };

        this.dataChannel.onerror = (error) => {
            console.error('資料通道錯誤:', error);
        };
    }

    // ========== WebRTC 事件處理器 ==========

    handleIceCandidate(event) {
        if (event.candidate) {
            this.emit('iceCandidate', {
                to: this.remoteUser.id,
                candidate: event.candidate
            });
        }
    }

    handleRemoteTrack(event) {
        this.remoteStream = event.streams[0];
        if (this.elements.remoteVideo) {
            this.elements.remoteVideo.srcObject = this.remoteStream;
        }
        this.updateCallState('connected');
    }

    handleConnectionStateChange() {
        const state = this.peerConnection.connectionState;

        switch (state) {
            case 'connected':
                this.isConnected = true;
                this.startCallTimer();
                this.startStatsCollection();
                this.updateConnectionQuality('good');
                break;
            case 'disconnected':
                this.updateConnectionQuality('poor');
                break;
            case 'failed':
                this.handleCallError(new Error('連接失敗'));
                break;
            case 'closed':
                this.cleanup();
                break;
        }
    }

    handleDataChannel(event) {
        this.setupDataChannel(event.channel);
    }

    // ========== 信令處理 ==========

    async handleOffer(offer) {
        try {
            await this.peerConnection.setRemoteDescription(offer);

            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);

            this.emit('callAnswer', {
                to: this.remoteUser.id,
                answer: answer
            });

        } catch (error) {
            console.error('處理 offer 失敗:', error);
            this.handleCallError(error);
        }
    }

    async handleAnswer(answer) {
        try {
            await this.peerConnection.setRemoteDescription(answer);
        } catch (error) {
            console.error('處理 answer 失敗:', error);
            this.handleCallError(error);
        }
    }

    async handleIceCandidate(candidate) {
        try {
            await this.peerConnection.addIceCandidate(candidate);
        } catch (error) {
            console.error('處理 ICE candidate 失敗:', error);
        }
    }

    // ========== 媒體控制 ==========

    toggleAudio() {
        if (!this.localStream) return;

        const audioTrack = this.localStream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            this.options.muted = !audioTrack.enabled;

            this.updateControlButton('audio', !this.options.muted);
            this.emit('audioToggled', { muted: this.options.muted });
        }
    }

    toggleVideo() {
        if (!this.localStream) return;

        const videoTrack = this.localStream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.enabled = !videoTrack.enabled;
            this.options.videoOff = !videoTrack.enabled;

            this.updateControlButton('video', !this.options.videoOff);
            this.updateLocalVideoDisplay();
            this.emit('videoToggled', { videoOff: this.options.videoOff });
        }
    }

    async toggleScreenShare() {
        try {
            if (this.isScreenSharing) {
                await this.stopScreenShare();
            } else {
                await this.startScreenShare();
            }
        } catch (error) {
            console.error('螢幕分享失敗:', error);
            this.showError('無法開始螢幕分享');
        }
    }

    async startScreenShare() {
        const stream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: true
        });

        this.screenStream = stream;
        const videoTrack = stream.getVideoTracks()[0];

        // 替換視訊軌道
        const sender = this.peerConnection.getSenders().find(s =>
            s.track && s.track.kind === 'video'
        );

        if (sender) {
            await sender.replaceTrack(videoTrack);
        }

        this.isScreenSharing = true;
        this.updateControlButton('screen', true);

        // 監聽螢幕分享結束事件
        videoTrack.onended = () => {
            this.stopScreenShare();
        };

        this.emit('screenShareStarted');
    }

    async stopScreenShare() {
        if (!this.isScreenSharing) return;

        // 恢復攝影機視訊
        const videoTrack = this.localStream.getVideoTracks()[0];
        const sender = this.peerConnection.getSenders().find(s =>
            s.track && s.track.kind === 'video'
        );

        if (sender && videoTrack) {
            await sender.replaceTrack(videoTrack);
        }

        // 停止螢幕分享流
        if (this.screenStream) {
            this.screenStream.getTracks().forEach(track => track.stop());
            this.screenStream = null;
        }

        this.isScreenSharing = false;
        this.updateControlButton('screen', false);

        this.emit('screenShareStopped');
    }

    async flipCamera() {
        try {
            const videoDevices = this.availableDevices.video;
            if (videoDevices.length <= 1) return;

            const currentDeviceIndex = videoDevices.findIndex(device =>
                device.deviceId === this.currentVideoDevice
            );

            const nextIndex = (currentDeviceIndex + 1) % videoDevices.length;
            const nextDevice = videoDevices[nextIndex];

            await this.changeVideoDevice(nextDevice.deviceId);

        } catch (error) {
            console.error('切換攝影機失敗:', error);
        }
    }

    async changeVideoDevice(deviceId) {
        try {
            const constraints = {
                video: {
                    deviceId: { exact: deviceId },
                    ...this.mediaConstraints[this.options.videoQuality].video
                },
                audio: false
            };

            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            const videoTrack = stream.getVideoTracks()[0];

            // 替換視訊軌道
            const sender = this.peerConnection.getSenders().find(s =>
                s.track && s.track.kind === 'video'
            );

            if (sender) {
                await sender.replaceTrack(videoTrack);
            }

            // 更新本地流
            const oldVideoTrack = this.localStream.getVideoTracks()[0];
            this.localStream.removeTrack(oldVideoTrack);
            this.localStream.addTrack(videoTrack);

            oldVideoTrack.stop();
            this.currentVideoDevice = deviceId;

        } catch (error) {
            console.error('變更視訊設備失敗:', error);
            this.showError('無法切換攝影機');
        }
    }

    async changeMicrophoneDevice() {
        const deviceId = this.elements.microphoneSelect?.value;
        if (!deviceId) return;

        try {
            const constraints = {
                video: false,
                audio: {
                    deviceId: { exact: deviceId },
                    ...this.mediaConstraints[this.options.videoQuality].audio
                }
            };

            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            const audioTrack = stream.getAudioTracks()[0];

            // 替換音訊軌道
            const sender = this.peerConnection.getSenders().find(s =>
                s.track && s.track.kind === 'audio'
            );

            if (sender) {
                await sender.replaceTrack(audioTrack);
            }

            // 更新本地流
            const oldAudioTrack = this.localStream.getAudioTracks()[0];
            this.localStream.removeTrack(oldAudioTrack);
            this.localStream.addTrack(audioTrack);

            oldAudioTrack.stop();
            this.currentAudioDevice = deviceId;

        } catch (error) {
            console.error('變更音訊設備失敗:', error);
            this.showError('無法切換麥克風');
        }
    }

    changeVideoQuality() {
        const quality = this.elements.qualitySelect?.value;
        if (!quality) return;

        this.options.videoQuality = quality;

        // 重新獲取媒體流以應用新的品質設定
        if (this.localStream && !this.isScreenSharing) {
            this.changeVideoDevice(this.currentVideoDevice);
        }
    }

    // ========== 設備管理 ==========

    async loadAvailableDevices() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();

            this.availableDevices = {
                video: devices.filter(device => device.kind === 'videoinput'),
                audio: devices.filter(device => device.kind === 'audioinput'),
                speaker: devices.filter(device => device.kind === 'audiooutput')
            };

            this.populateDeviceSelects();

        } catch (error) {
            console.error('載入設備列表失敗:', error);
        }
    }

    populateDeviceSelects() {
        // 填充攝影機選項
        if (this.elements.cameraSelect) {
            this.populateSelect(this.elements.cameraSelect, this.availableDevices.video, '攝影機');
        }

        // 填充麥克風選項
        if (this.elements.microphoneSelect) {
            this.populateSelect(this.elements.microphoneSelect, this.availableDevices.audio, '麥克風');
        }

        // 填充揚聲器選項
        if (this.elements.speakerSelect) {
            this.populateSelect(this.elements.speakerSelect, this.availableDevices.speaker, '揚聲器');
        }
    }

    populateSelect(selectElement, devices, deviceType) {
        selectElement.innerHTML = `<option value="">預設${deviceType}</option>`;

        devices.forEach((device, index) => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.textContent = device.label || `${deviceType} ${index + 1}`;
            selectElement.appendChild(option);
        });
    }

    // ========== UI 狀態管理 ==========

    updateCallState(state) {
        this.callState = state;

        // 隱藏所有覆蓋層
        this.elements.callOverlay?.classList.add('hidden');
        this.elements.incomingControls?.classList.add('hidden');
        this.elements.callControls?.classList.add('hidden');

        switch (state) {
            case 'idle':
                this.elements.callOverlay?.classList.add('hidden');
                break;

            case 'incoming':
                this.showIncomingCallOverlay();
                break;

            case 'calling':
                this.showCallingOverlay();
                break;

            case 'connecting':
                this.showConnectingOverlay();
                break;

            case 'connected':
                this.showConnectedState();
                break;

            case 'ended':
                this.showCallEndedOverlay();
                break;
        }
    }

    showIncomingCallOverlay() {
        this.elements.callOverlay?.classList.remove('hidden');
        this.elements.incomingControls?.classList.remove('hidden');

        if (this.elements.statusText) {
            this.elements.statusText.textContent = this.options.audioOnly ? '語音來電' : '視訊來電';
        }

        this.updateStatusIcon('fas fa-phone');
    }

    showCallingOverlay() {
        this.elements.callOverlay?.classList.remove('hidden');

        if (this.elements.statusText) {
            this.elements.statusText.textContent = '正在撥號...';
        }

        this.updateStatusIcon('fas fa-phone');
    }

    showConnectingOverlay() {
        if (this.elements.statusText) {
            this.elements.statusText.textContent = '連接中...';
        }

        this.updateStatusIcon('fas fa-spinner fa-spin');
    }

    showConnectedState() {
        this.elements.callOverlay?.classList.add('hidden');
        this.elements.callControls?.classList.remove('hidden');

        // 顯示通話時長
        this.elements.callDuration?.classList.remove('hidden');
    }

    showCallEndedOverlay() {
        this.elements.callOverlay?.classList.remove('hidden');
        this.elements.callControls?.classList.add('hidden');

        if (this.elements.statusText) {
            this.elements.statusText.textContent = '通話已結束';
        }

        this.updateStatusIcon('fas fa-phone-slash');

        // 3 秒後自動隱藏
        setTimeout(() => {
            this.updateCallState('idle');
        }, 3000);
    }

    updateStatusIcon(iconClass) {
        if (this.elements.statusIcon) {
            this.elements.statusIcon.innerHTML = `<i class="${iconClass}"></i>`;
        }
    }

    updateRemoteUserInfo(user) {
        if (this.elements.statusName) {
            this.elements.statusName.textContent = user.displayName || user.username;
        }

        if (this.elements.remoteName) {
            this.elements.remoteName.textContent = user.displayName || user.username;
        }

        if (this.elements.statusAvatar) {
            this.elements.statusAvatar.src = user.avatar || '';
        }

        if (this.elements.remoteAvatar) {
            this.elements.remoteAvatar.src = user.avatar || '';
        }
    }

    updateControlButton(type, active) {
        const button = this.elements[`${type}Btn`];
        if (!button) return;

        button.setAttribute('data-active', active.toString());

        const icon = button.querySelector('i');
        if (!icon) return;

        switch (type) {
            case 'audio':
                icon.className = active ? 'fas fa-microphone' : 'fas fa-microphone-slash';
                break;
            case 'video':
                icon.className = active ? 'fas fa-video' : 'fas fa-video-slash';
                break;
            case 'screen':
                icon.className = active ? 'fas fa-stop' : 'fas fa-desktop';
                button.querySelector('.btn-label').textContent = active ? '停止' : '分享';
                break;
        }
    }

    updateLocalVideoDisplay() {
        if (this.options.videoOff) {
            this.elements.localVideoWrapper?.classList.add('video-off');
            this.elements.videoOffIndicator?.classList.remove('hidden');
        } else {
            this.elements.localVideoWrapper?.classList.remove('video-off');
            this.elements.videoOffIndicator?.classList.add('hidden');
        }
    }

    updateConnectionQuality(quality) {
        if (!this.elements.connectionQuality) return;

        const qualityText = this.elements.connectionQuality.querySelector('.quality-text');
        const bars = this.elements.connectionQuality.querySelectorAll('.bar');

        let barCount = 0;
        let text = '';

        switch (quality) {
            case 'excellent':
                barCount = 4;
                text = '極佳';
                break;
            case 'good':
                barCount = 3;
                text = '良好';
                break;
            case 'fair':
                barCount = 2;
                text = '一般';
                break;
            case 'poor':
                barCount = 1;
                text = '較差';
                break;
            default:
                barCount = 0;
                text = '無訊號';
                break;
        }

        bars.forEach((bar, index) => {
            bar.classList.toggle('active', index < barCount);
        });

        if (qualityText) {
            qualityText.textContent = text;
        }
    }

    // ========== 聊天功能 ==========

    toggleChat() {
        if (this.elements.chatSidebar?.classList.contains('hidden')) {
            this.openChat();
        } else {
            this.closeChat();
        }
    }

    openChat() {
        this.elements.chatSidebar?.classList.remove('hidden');
        this.elements.chatInput?.focus();

        // 清除未讀標記
        this.updateChatBadge(0);
    }

    closeChat() {
        this.elements.chatSidebar?.classList.add('hidden');
    }

    sendChatMessage() {
        const input = this.elements.chatInput;
        if (!input || !this.dataChannel) return;

        const message = input.value.trim();
        if (!message) return;

        const chatMessage = {
            type: 'chat',
            content: message,
            sender: this.currentUser?.id || 'unknown',
            timestamp: Date.now()
        };

        try {
            this.dataChannel.send(JSON.stringify(chatMessage));
            this.addChatMessage(chatMessage, true);
            input.value = '';
        } catch (error) {
            console.error('發送聊天訊息失敗:', error);
        }
    }

    handleChatKeydown(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            this.sendChatMessage();
        }
    }

    handleDataChannelMessage(message) {
        if (message.type === 'chat') {
            this.addChatMessage(message, false);

            // 如果聊天面板是關閉的，顯示未讀標記
            if (this.elements.chatSidebar?.classList.contains('hidden')) {
                this.incrementChatBadge();
            }
        }
    }

    addChatMessage(message, isOwn) {
        if (!this.elements.chatMessages) return;

        const messageElement = document.createElement('div');
        messageElement.className = `chat-message ${isOwn ? 'own' : 'remote'}`;

        const time = new Date(message.timestamp).toLocaleTimeString('zh-TW', {
            hour: '2-digit',
            minute: '2-digit'
        });

        messageElement.innerHTML = `
            <div class="message-content">${this.escapeHtml(message.content)}</div>
            <div class="message-time">${time}</div>
        `;

        this.elements.chatMessages.appendChild(messageElement);
        this.elements.chatMessages.scrollTop = this.elements.chatMessages.scrollHeight;
    }

    updateChatBadge(count) {
        if (!this.elements.chatBadge) return;

        if (count > 0) {
            this.elements.chatBadge.textContent = count > 99 ? '99+' : count.toString();
            this.elements.chatBadge.classList.remove('hidden');
        } else {
            this.elements.chatBadge.classList.add('hidden');
        }
    }

    incrementChatBadge() {
        const currentCount = parseInt(this.elements.chatBadge?.textContent || '0');
        this.updateChatBadge(currentCount + 1);
    }

    // ========== 設定面板 ==========

    toggleSettings() {
        if (this.elements.settingsPanel?.classList.contains('hidden')) {
            this.openSettings();
        } else {
            this.closeSettings();
        }
    }

    openSettings() {
        this.elements.settingsPanel?.classList.remove('hidden');
        this.updateSettingsValues();
    }

    closeSettings() {
        this.elements.settingsPanel?.classList.add('hidden');
    }

    updateSettingsValues() {
        // 更新設備選擇
        if (this.elements.cameraSelect) {
            this.elements.cameraSelect.value = this.currentVideoDevice || '';
        }

        if (this.elements.microphoneSelect) {
            this.elements.microphoneSelect.value = this.currentAudioDevice || '';
        }

        if (this.elements.qualitySelect) {
            this.elements.qualitySelect.value = this.options.videoQuality;
        }
    }

    // ========== 通話統計 ==========

    startCallTimer() {
        this.callStats.startTime = Date.now();

        this.callTimer = setInterval(() => {
            this.updateCallDuration();
        }, 1000);
    }

    stopCallTimer() {
        if (this.callTimer) {
            clearInterval(this.callTimer);
            this.callTimer = null;
        }
    }

    updateCallDuration() {
        if (!this.callStats.startTime) return;

        const duration = Date.now() - this.callStats.startTime;
        this.callStats.duration = duration;

        const formattedTime = this.formatDuration(duration);

        if (this.elements.callDuration) {
            this.elements.callDuration.textContent = formattedTime;
        }

        // 更新設定面板中的統計
        const statDuration = this.container.querySelector('#stat-duration');
        if (statDuration) {
            statDuration.textContent = formattedTime;
        }
    }

    startStatsCollection() {
        if (!this.options.enableStats) return;

        this.statsInterval = setInterval(async () => {
            await this.collectCallStats();
        }, this.options.statsInterval);
    }

    stopStatsCollection() {
        if (this.statsInterval) {
            clearInterval(this.statsInterval);
            this.statsInterval = null;
        }
    }

    async collectCallStats() {
        if (!this.peerConnection) return;

        try {
            const stats = await this.peerConnection.getStats();

            stats.forEach(report => {
                if (report.type === 'inbound-rtp' && report.kind === 'video') {
                    this.callStats.packetsLost = report.packetsLost || 0;
                    this.callStats.bytesReceived = report.bytesReceived || 0;
                }

                if (report.type === 'outbound-rtp' && report.kind === 'video') {
                    this.callStats.bytesSent = report.bytesSent || 0;
                }
            });

            this.updateStatsDisplay();

        } catch (error) {
            console.error('收集通話統計失敗:', error);
        }
    }

    updateStatsDisplay() {
        // 更新封包遺失率
        const statPackets = this.container.querySelector('#stat-packets');
        if (statPackets) {
            const lossRate = (this.callStats.packetsLost / 100) * 100; // 簡化計算
            statPackets.textContent = `${lossRate.toFixed(1)}%`;
        }

        // 更新頻寬使用
        const statBandwidth = this.container.querySelector('#stat-bandwidth');
        if (statBandwidth) {
            const bandwidth = Math.round((this.callStats.bytesSent + this.callStats.bytesReceived) / 1024 / 8);
            statBandwidth.textContent = `${bandwidth} kbps`;
        }
    }

    // ========== 其他功能 ==========

    toggleFullscreen() {
        if (document.fullscreenElement) {
            document.exitFullscreen();
        } else {
            this.container.requestFullscreen();
        }
    }

    async togglePictureInPicture() {
        if (!this.elements.remoteVideo) return;

        try {
            if (document.pictureInPictureElement) {
                await document.exitPictureInPicture();
            } else {
                await this.elements.remoteVideo.requestPictureInPicture();
            }
        } catch (error) {
            console.error('子母畫面失敗:', error);
        }
    }

    handleKeyboardShortcuts(e) {
        if (!this.isConnected) return;

        // 只在通話界面有焦點時處理快捷鍵
        if (!this.container.contains(document.activeElement)) return;

        switch (e.key.toLowerCase()) {
            case 'm':
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    this.toggleAudio();
                }
                break;

            case 'v':
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    this.toggleVideo();
                }
                break;

            case 's':
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    this.toggleScreenShare();
                }
                break;

            case 'escape':
                this.closeSettings();
                this.closeChat();
                break;
        }
    }

    handleFullscreenChange() {
        const isFullscreen = !!document.fullscreenElement;
        const icon = this.elements.fullscreenBtn?.querySelector('i');

        if (icon) {
            icon.className = isFullscreen ? 'fas fa-compress' : 'fas fa-expand';
        }
    }

    handleBeforeUnload(e) {
        if (this.isConnected) {
            e.preventDefault();
            e.returnValue = '通話進行中，確定要離開嗎？';
        }
    }

    handleRemoteVideoLoaded() {
        console.log('遠端視訊已載入');
    }

    handleLocalVideoLoaded() {
        console.log('本地視訊已載入');
    }

    // ========== 通話摘要 ==========

    showCallSummary() {
        if (!this.elements.callSummary) return;

        const duration = this.formatDuration(this.callStats.duration);
        const quality = this.getCallQuality();

        // 更新摘要資訊
        const summaryDuration = this.container.querySelector('#summary-duration');
        if (summaryDuration) {
            summaryDuration.textContent = duration;
        }

        const summaryQuality = this.container.querySelector('#summary-quality');
        if (summaryQuality) {
            summaryQuality.textContent = quality;
        }

        this.elements.callSummary.classList.remove('hidden');
    }

    getCallQuality() {
        const lossRate = this.callStats.packetsLost / 100;

        if (lossRate < 0.01) return '極佳';
        if (lossRate < 0.05) return '良好';
        if (lossRate < 0.1) return '一般';
        return '較差';
    }

    callAgain() {
        this.closeSummary();
        if (this.remoteUser) {
            this.startCall(this.remoteUser, this.options.audioOnly);
        }
    }

    closeSummary() {
        this.elements.callSummary?.classList.add('hidden');
        this.updateCallState('idle');
    }

    // ========== 錯誤處理 ==========

    handleCallError(error) {
        console.error('通話錯誤:', error);
        this.emit('callError', { error });
        this.showError(error.message || '通話發生錯誤');
        this.endCall();
    }

    showError(message) {
        this.emit('error', { message });
    }

    // ========== 工具方法 ==========

    formatDuration(milliseconds) {
        const totalSeconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;

        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ========== 清理方法 ==========

    cleanup() {
        // 停止計時器
        this.stopCallTimer();
        this.stopStatsCollection();

        // 停止所有媒體軌道
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }

        if (this.remoteStream) {
            this.remoteStream.getTracks().forEach(track => track.stop());
            this.remoteStream = null;
        }

        if (this.screenStream) {
            this.screenStream.getTracks().forEach(track => track.stop());
            this.screenStream = null;
        }

        // 關閉 PeerConnection
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }

        // 關閉資料通道
        if (this.dataChannel) {
            this.dataChannel.close();
            this.dataChannel = null;
        }

        // 重置狀態
        this.isConnected = false;
        this.isConnecting = false;
        this.isScreenSharing = false;
        this.remoteUser = null;
        this.callStats = {
            startTime: null,
            duration: 0,
            packetsLost: 0,
            bytesReceived: 0,
            bytesSent: 0
        };

        // 清理 UI
        if (this.elements.localVideo) {
            this.elements.localVideo.srcObject = null;
        }

        if (this.elements.remoteVideo) {
            this.elements.remoteVideo.srcObject = null;
        }
    }

    // ========== 公共 API ==========

    getCallState() {
        return this.callState;
    }

    isCallActive() {
        return this.isConnected;
    }

    getCurrentUser() {
        return this.currentUser;
    }

    getRemoteUser() {
        return this.remoteUser;
    }

    getCallStats() {
        return { ...this.callStats };
    }

    // ========== 事件系統 ==========

    emit(event, data = {}) {
        if (this.options.onEvent) {
            this.options.onEvent(event, data);
        }

        const customEvent = new CustomEvent(`videoCall:${event}`, {
            detail: { ...data, call: this }
        });
        this.container.dispatchEvent(customEvent);
    }

    on(event, callback) {
        this.container.addEventListener(`videoCall:${event}`, callback);
    }

    off(event, callback) {
        this.container.removeEventListener(`videoCall:${event}`, callback);
    }

    // ========== 銷毀方法 ==========

    destroy() {
        this.cleanup();

        // 移除全域事件監聽器
        document.removeEventListener('keydown', this.handleKeyboardShortcuts.bind(this));
        document.removeEventListener('fullscreenchange', this.handleFullscreenChange.bind(this));
        window.removeEventListener('beforeunload', this.handleBeforeUnload.bind(this));

        // 清空容器
        if (this.container) {
            this.container.innerHTML = '';
        }

        // 清空元素引用
        this.elements = {};
    }
}

// 導出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = VideoCallComponent;
} else {
    window.VideoCallComponent = VideoCallComponent;
}