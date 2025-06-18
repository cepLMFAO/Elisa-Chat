// frontend/assets/js/components/VoiceRecorder.js

class VoiceRecorderComponent {
    constructor(options = {}) {
        this.options = {
            maxDuration: 300000, // 5分鐘
            minDuration: 1000,   // 1秒
            sampleRate: 44100,
            bitRate: 128,
            format: 'webm',
            enableEchoCancellation: true,
            enableNoiseSuppression: true,
            enableAutoGainControl: true,
            visualizer: true,
            ...options
        };

        this.isRecording = false;
        this.isPaused = false;
        this.mediaRecorder = null;
        this.audioStream = null;
        this.audioChunks = [];
        this.startTime = null;
        this.pausedDuration = 0;
        this.recordingTimer = null;
        this.visualizerTimer = null;

        // 視覺化相關
        this.audioContext = null;
        this.analyser = null;
        this.dataArray = null;
        this.source = null;

        // UI 元素
        this.container = null;
        this.recordButton = null;
        this.pauseButton = null;
        this.stopButton = null;
        this.timeDisplay = null;
        this.visualizer = null;
        this.progressBar = null;

        this.init();
    }

    async init() {
        try {
            await this.checkMediaSupport();
            this.createUI();
            this.bindEvents();
        } catch (error) {
            console.error('初始化語音錄音器失敗:', error);
            throw error;
        }
    }

    async checkMediaSupport() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('您的瀏覽器不支援語音錄音功能');
        }

        if (!window.MediaRecorder) {
            throw new Error('您的瀏覽器不支援 MediaRecorder API');
        }

        // 檢查支援的格式
        const supportedFormats = ['audio/webm', 'audio/mp4', 'audio/ogg'];
        this.supportedFormat = supportedFormats.find(format =>
            MediaRecorder.isTypeSupported(format)
        ) || 'audio/webm';
    }

    createUI() {
        if (this.options.container) {
            this.container = this.options.container;
        } else {
            this.container = document.createElement('div');
            this.container.className = 'voice-recorder';
        }

        this.container.innerHTML = `
            <div class="voice-recorder-container">
                <div class="recording-status hidden" id="recording-status">
                    <div class="recording-indicator">
                        <div class="recording-dot"></div>
                        <span class="recording-text">正在錄音</span>
                    </div>
                    <div class="recording-time" id="recording-time">00:00</div>
                </div>

                <div class="voice-visualizer hidden" id="voice-visualizer">
                    <canvas id="visualizer-canvas" width="200" height="50"></canvas>
                </div>

                <div class="recording-progress hidden" id="recording-progress">
                    <div class="progress-bar">
                        <div class="progress-fill" id="progress-fill"></div>
                    </div>
                    <div class="progress-text">
                        <span id="current-time">00:00</span>
                        <span>/</span>
                        <span id="max-time">${this.formatTime(this.options.maxDuration)}</span>
                    </div>
                </div>

                <div class="voice-controls">
                    <button class="voice-btn record-btn" id="record-btn" title="開始錄音">
                        <i class="fas fa-microphone"></i>
                    </button>
                    <button class="voice-btn pause-btn hidden" id="pause-btn" title="暫停錄音">
                        <i class="fas fa-pause"></i>
                    </button>
                    <button class="voice-btn stop-btn hidden" id="stop-btn" title="停止錄音">
                        <i class="fas fa-stop"></i>
                    </button>
                    <button class="voice-btn cancel-btn hidden" id="cancel-btn" title="取消錄音">
                        <i class="fas fa-times"></i>
                    </button>
                </div>

                <div class="recording-tips hidden" id="recording-tips">
                    <p>點擊麥克風開始錄音，最長可錄製 ${this.formatTime(this.options.maxDuration)}</p>
                </div>

                <div class="recording-preview hidden" id="recording-preview">
                    <div class="preview-header">
                        <h4>錄音預覽</h4>
                        <div class="preview-duration" id="preview-duration"></div>
                    </div>
                    <div class="preview-controls">
                        <button class="preview-btn play-btn" id="play-btn" title="播放">
                            <i class="fas fa-play"></i>
                        </button>
                        <div class="preview-waveform" id="preview-waveform">
                            <canvas id="waveform-canvas" width="200" height="40"></canvas>
                        </div>
                    </div>
                    <div class="preview-actions">
                        <button class="btn btn-secondary" id="re-record-btn">重新錄音</button>
                        <button class="btn btn-primary" id="send-btn">發送語音</button>
                    </div>
                </div>
            </div>
        `;

        this.getUIElements();
    }

    getUIElements() {
        this.recordButton = this.container.querySelector('#record-btn');
        this.pauseButton = this.container.querySelector('#pause-btn');
        this.stopButton = this.container.querySelector('#stop-btn');
        this.cancelButton = this.container.querySelector('#cancel-btn');
        this.timeDisplay = this.container.querySelector('#recording-time');
        this.visualizer = this.container.querySelector('#voice-visualizer');
        this.progressBar = this.container.querySelector('#recording-progress');
        this.progressFill = this.container.querySelector('#progress-fill');
        this.currentTimeDisplay = this.container.querySelector('#current-time');
        this.recordingStatus = this.container.querySelector('#recording-status');
        this.recordingTips = this.container.querySelector('#recording-tips');
        this.recordingPreview = this.container.querySelector('#recording-preview');
        this.playButton = this.container.querySelector('#play-btn');
        this.reRecordButton = this.container.querySelector('#re-record-btn');
        this.sendButton = this.container.querySelector('#send-btn');
        this.previewDuration = this.container.querySelector('#preview-duration');
        this.visualizerCanvas = this.container.querySelector('#visualizer-canvas');
        this.waveformCanvas = this.container.querySelector('#waveform-canvas');
    }

    bindEvents() {
        this.recordButton?.addEventListener('click', this.startRecording.bind(this));
        this.pauseButton?.addEventListener('click', this.pauseRecording.bind(this));
        this.stopButton?.addEventListener('click', this.stopRecording.bind(this));
        this.cancelButton?.addEventListener('click', this.cancelRecording.bind(this));
        this.playButton?.addEventListener('click', this.playPreview.bind(this));
        this.reRecordButton?.addEventListener('click', this.reRecord.bind(this));
        this.sendButton?.addEventListener('click', this.sendRecording.bind(this));

        // 鍵盤快捷鍵
        document.addEventListener('keydown', this.handleKeydown.bind(this));
    }

    async startRecording() {
        try {
            // 請求麥克風權限
            this.audioStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: this.options.enableEchoCancellation,
                    noiseSuppression: this.options.enableNoiseSuppression,
                    autoGainControl: this.options.enableAutoGainControl,
                    sampleRate: this.options.sampleRate
                }
            });

            // 創建 MediaRecorder
            this.mediaRecorder = new MediaRecorder(this.audioStream, {
                mimeType: this.supportedFormat,
                audioBitsPerSecond: this.options.bitRate * 1000
            });

            // 設置事件監聽器
            this.setupMediaRecorderEvents();

            // 設置視覺化
            if (this.options.visualizer) {
                this.setupVisualizer();
            }

            // 開始錄音
            this.mediaRecorder.start();
            this.isRecording = true;
            this.startTime = Date.now();
            this.pausedDuration = 0;

            // 更新UI
            this.updateUIForRecording();

            // 開始計時器
            this.startTimer();

            this.emit('recordingStarted');

        } catch (error) {
            console.error('開始錄音失敗:', error);
            this.handleRecordingError(error);
        }
    }

    setupMediaRecorderEvents() {
        this.mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                this.audioChunks.push(event.data);
            }
        };

        this.mediaRecorder.onstop = () => {
            this.finishRecording();
        };

        this.mediaRecorder.onerror = (error) => {
            console.error('MediaRecorder 錯誤:', error);
            this.handleRecordingError(error);
        };
    }

    setupVisualizer() {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.analyser = this.audioContext.createAnalyser();
        this.source = this.audioContext.createMediaStreamSource(this.audioStream);

        this.analyser.fftSize = 256;
        this.analyser.smoothingTimeConstant = 0.8;

        this.source.connect(this.analyser);

        this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);

        this.visualizer?.classList.remove('hidden');
        this.startVisualizer();
    }

    startVisualizer() {
        const canvas = this.visualizerCanvas;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;

        const draw = () => {
            if (!this.isRecording && !this.isPaused) return;

            this.analyser.getByteFrequencyData(this.dataArray);

            ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
            ctx.fillRect(0, 0, width, height);

            const barWidth = width / this.dataArray.length * 2;
            let x = 0;

            for (let i = 0; i < this.dataArray.length; i++) {
                const barHeight = (this.dataArray[i] / 255) * height;

                const gradient = ctx.createLinearGradient(0, height - barHeight, 0, height);
                gradient.addColorStop(0, '#667eea');
                gradient.addColorStop(1, '#764ba2');

                ctx.fillStyle = gradient;
                ctx.fillRect(x, height - barHeight, barWidth, barHeight);

                x += barWidth + 1;
            }

            requestAnimationFrame(draw);
        };

        draw();
    }

    pauseRecording() {
        if (!this.isRecording || this.isPaused) return;

        this.mediaRecorder.pause();
        this.isPaused = true;
        this.pauseStartTime = Date.now();

        this.updateUIForPause();
        this.emit('recordingPaused');
    }

    resumeRecording() {
        if (!this.isRecording || !this.isPaused) return;

        this.mediaRecorder.resume();
        this.isPaused = false;
        this.pausedDuration += Date.now() - this.pauseStartTime;

        this.updateUIForRecording();
        this.emit('recordingResumed');
    }

    stopRecording() {
        if (!this.isRecording) return;

        this.mediaRecorder.stop();
        this.isRecording = false;
        this.isPaused = false;

        this.stopTimer();
        this.stopStream();

        this.emit('recordingStopped');
    }

    cancelRecording() {
        if (this.isRecording) {
            this.mediaRecorder.stop();
        }

        this.isRecording = false;
        this.isPaused = false;
        this.audioChunks = [];

        this.stopTimer();
        this.stopStream();
        this.resetUI();

        this.emit('recordingCancelled');
    }

    finishRecording() {
        const duration = this.getCurrentDuration();

        if (duration < this.options.minDuration) {
            this.showError(`錄音時間太短，至少需要 ${this.formatTime(this.options.minDuration)}`);
            this.cancelRecording();
            return;
        }

        // 創建音頻檔案
        const audioBlob = new Blob(this.audioChunks, {
            type: this.supportedFormat
        });

        const audioUrl = URL.createObjectURL(audioBlob);

        this.recordingData = {
            blob: audioBlob,
            url: audioUrl,
            duration: duration,
            size: audioBlob.size,
            format: this.supportedFormat,
            timestamp: Date.now()
        };

        this.showPreview();
        this.emit('recordingFinished', this.recordingData);
    }

    showPreview() {
        this.hideRecordingUI();
        this.recordingPreview?.classList.remove('hidden');

        if (this.previewDuration) {
            this.previewDuration.textContent = this.formatTime(this.recordingData.duration);
        }

        // 生成波形圖
        this.generateWaveform();
    }

    async generateWaveform() {
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const arrayBuffer = await this.recordingData.blob.arrayBuffer();
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

            const canvas = this.waveformCanvas;
            if (!canvas) return;

            const ctx = canvas.getContext('2d');
            const width = canvas.width;
            const height = canvas.height;

            // 清空畫布
            ctx.clearRect(0, 0, width, height);

            // 獲取音頻資料
            const channelData = audioBuffer.getChannelData(0);
            const samplesPerPixel = Math.floor(channelData.length / width);

            ctx.fillStyle = '#667eea';
            ctx.globalAlpha = 0.8;

            for (let x = 0; x < width; x++) {
                const start = x * samplesPerPixel;
                const end = start + samplesPerPixel;

                let max = 0;
                for (let i = start; i < end; i++) {
                    max = Math.max(max, Math.abs(channelData[i]));
                }

                const barHeight = max * height;
                const y = (height - barHeight) / 2;

                ctx.fillRect(x, y, 1, barHeight);
            }

        } catch (error) {
            console.error('生成波形圖失敗:', error);
        }
    }

    playPreview() {
        if (!this.recordingData) return;

        if (this.previewAudio) {
            if (this.previewAudio.paused) {
                this.previewAudio.play();
                this.playButton.innerHTML = '<i class="fas fa-pause"></i>';
            } else {
                this.previewAudio.pause();
                this.playButton.innerHTML = '<i class="fas fa-play"></i>';
            }
            return;
        }

        this.previewAudio = new Audio(this.recordingData.url);

        this.previewAudio.addEventListener('ended', () => {
            this.playButton.innerHTML = '<i class="fas fa-play"></i>';
        });

        this.previewAudio.addEventListener('pause', () => {
            this.playButton.innerHTML = '<i class="fas fa-play"></i>';
        });

        this.previewAudio.addEventListener('play', () => {
            this.playButton.innerHTML = '<i class="fas fa-pause"></i>';
        });

        this.previewAudio.play();
    }

    reRecord() {
        this.resetRecording();
        this.showRecordingUI();
    }

    sendRecording() {
        if (!this.recordingData) return;

        this.emit('recordingSend', this.recordingData);
        this.resetRecording();
    }

    resetRecording() {
        if (this.previewAudio) {
            this.previewAudio.pause();
            this.previewAudio = null;
        }

        if (this.recordingData) {
            URL.revokeObjectURL(this.recordingData.url);
            this.recordingData = null;
        }

        this.audioChunks = [];
    }

    // UI 更新方法
    updateUIForRecording() {
        this.recordButton?.classList.add('hidden');
        this.pauseButton?.classList.remove('hidden');
        this.stopButton?.classList.remove('hidden');
        this.cancelButton?.classList.remove('hidden');
        this.recordingStatus?.classList.remove('hidden');
        this.progressBar?.classList.remove('hidden');
        this.recordingTips?.classList.add('hidden');

        if (this.isPaused) {
            this.pauseButton.innerHTML = '<i class="fas fa-play"></i>';
            this.pauseButton.title = '繼續錄音';
        } else {
            this.pauseButton.innerHTML = '<i class="fas fa-pause"></i>';
            this.pauseButton.title = '暫停錄音';
        }
    }

    updateUIForPause() {
        this.pauseButton.innerHTML = '<i class="fas fa-play"></i>';
        this.pauseButton.title = '繼續錄音';
    }

    hideRecordingUI() {
        this.recordingStatus?.classList.add('hidden');
        this.visualizer?.classList.add('hidden');
        this.progressBar?.classList.add('hidden');
        this.recordButton?.classList.add('hidden');
        this.pauseButton?.classList.add('hidden');
        this.stopButton?.classList.add('hidden');
        this.cancelButton?.classList.add('hidden');
    }

    showRecordingUI() {
        this.recordingPreview?.classList.add('hidden');
        this.recordButton?.classList.remove('hidden');
        this.recordingTips?.classList.remove('hidden');
    }

    resetUI() {
        this.hideRecordingUI();
        this.recordingPreview?.classList.add('hidden');
        this.showRecordingUI();
    }

    // 計時器相關
    startTimer() {
        this.recordingTimer = setInterval(() => {
            this.updateTime();
            this.updateProgress();
            this.checkMaxDuration();
        }, 1000);
    }

    stopTimer() {
        if (this.recordingTimer) {
            clearInterval(this.recordingTimer);
            this.recordingTimer = null;
        }
    }

    updateTime() {
        const duration = this.getCurrentDuration();
        const formattedTime = this.formatTime(duration);

        if (this.timeDisplay) {
            this.timeDisplay.textContent = formattedTime;
        }

        if (this.currentTimeDisplay) {
            this.currentTimeDisplay.textContent = formattedTime;
        }
    }

    updateProgress() {
        const duration = this.getCurrentDuration();
        const progress = (duration / this.options.maxDuration) * 100;

        if (this.progressFill) {
            this.progressFill.style.width = `${Math.min(progress, 100)}%`;
        }
    }

    checkMaxDuration() {
        const duration = this.getCurrentDuration();
        if (duration >= this.options.maxDuration) {
            this.stopRecording();
            this.showError('已達到最大錄音時長');
        }
    }

    getCurrentDuration() {
        if (!this.startTime) return 0;

        let duration = Date.now() - this.startTime - this.pausedDuration;

        if (this.isPaused && this.pauseStartTime) {
            duration -= (Date.now() - this.pauseStartTime);
        }

        return Math.max(0, duration);
    }

    // 工具方法
    formatTime(milliseconds) {
        const totalSeconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;

        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    stopStream() {
        if (this.audioStream) {
            this.audioStream.getTracks().forEach(track => track.stop());
            this.audioStream = null;
        }

        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
    }

    handleRecordingError(error) {
        console.error('錄音錯誤:', error);

        let errorMessage = '錄音失敗';

        if (error.name === 'NotAllowedError') {
            errorMessage = '請允許訪問麥克風';
        } else if (error.name === 'NotFoundError') {
            errorMessage = '找不到麥克風設備';
        } else if (error.name === 'NotSupportedError') {
            errorMessage = '瀏覽器不支援錄音功能';
        }

        this.showError(errorMessage);
        this.cancelRecording();
    }

    showError(message) {
        this.emit('error', { message });
    }

    handleKeydown(e) {
        if (!this.container.contains(document.activeElement)) return;

        switch (e.key) {
            case ' ':
            case 'Enter':
                e.preventDefault();
                if (!this.isRecording) {
                    this.startRecording();
                } else if (this.isPaused) {
                    this.resumeRecording();
                } else {
                    this.pauseRecording();
                }
                break;
            case 'Escape':
                if (this.isRecording) {
                    this.cancelRecording();
                }
                break;
            case 's':
                if (e.ctrlKey && this.isRecording) {
                    e.preventDefault();
                    this.stopRecording();
                }
                break;
        }
    }

    // 設置方法
    setMaxDuration(duration) {
        this.options.maxDuration = duration;
        const maxTimeDisplay = this.container.querySelector('#max-time');
        if (maxTimeDisplay) {
            maxTimeDisplay.textContent = this.formatTime(duration);
        }
    }

    setMinDuration(duration) {
        this.options.minDuration = duration;
    }

    setBitRate(bitRate) {
        this.options.bitRate = bitRate;
    }

    // 獲取方法
    getState() {
        return {
            isRecording: this.isRecording,
            isPaused: this.isPaused,
            duration: this.getCurrentDuration(),
            maxDuration: this.options.maxDuration
        };
    }

    getRecordingData() {
        return this.recordingData;
    }

    // 事件系統
    emit(event, data = {}) {
        if (this.options.onEvent) {
            this.options.onEvent(event, data);
        }

        const customEvent = new CustomEvent(`voiceRecorder:${event}`, {
            detail: { ...data, recorder: this }
        });

        this.container.dispatchEvent(customEvent);
    }

    on(event, callback) {
        this.container.addEventListener(`voiceRecorder:${event}`, callback);
    }

    off(event, callback) {
        this.container.removeEventListener(`voiceRecorder:${event}`, callback);
    }

    // 銷毀方法
    destroy() {
        // 停止錄音
        if (this.isRecording) {
            this.cancelRecording();
        }

        // 清理計時器
        this.stopTimer();

        // 清理音頻資源
        this.stopStream();

        if (this.previewAudio) {
            this.previewAudio.pause();
            this.previewAudio = null;
        }

        if (this.recordingData && this.recordingData.url) {
            URL.revokeObjectURL(this.recordingData.url);
        }

        // 移除事件監聽器
        document.removeEventListener('keydown', this.handleKeydown.bind(this));

        // 清空容器
        if (this.container) {
            this.container.innerHTML = '';
        }

        // 重置狀態
        this.isRecording = false;
        this.isPaused = false;
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.recordingData = null;
    }

    // 靜態方法
    static async checkPermission() {
        try {
            const result = await navigator.permissions.query({ name: 'microphone' });
            return result.state;
        } catch (error) {
            console.warn('無法檢查麥克風權限:', error);
            return 'unknown';
        }
    }

    static async requestPermission() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach(track => track.stop());
            return 'granted';
        } catch (error) {
            if (error.name === 'NotAllowedError') {
                return 'denied';
            }
            return 'error';
        }
    }

    static getSupportedFormats() {
        const formats = [
            'audio/webm;codecs=opus',
            'audio/webm',
            'audio/mp4',
            'audio/ogg;codecs=opus',
            'audio/ogg',
            'audio/wav'
        ];

        return formats.filter(format => MediaRecorder.isTypeSupported(format));
    }

    static create(options = {}) {
        return new VoiceRecorderComponent(options);
    }
}

// 簡化版語音錄音器（用於快速整合）
class QuickVoiceRecorder {
    constructor(buttonElement, options = {}) {
        this.button = buttonElement;
        this.options = {
            maxDuration: 60000, // 1分鐘
            onRecordingComplete: null,
            onError: null,
            ...options
        };

        this.recorder = null;
        this.isRecording = false;

        this.init();
    }

    init() {
        this.bindEvents();
    }

    bindEvents() {
        this.button.addEventListener('mousedown', this.startRecording.bind(this));
        this.button.addEventListener('mouseup', this.stopRecording.bind(this));
        this.button.addEventListener('mouseleave', this.stopRecording.bind(this));

        // 觸控設備支援
        this.button.addEventListener('touchstart', this.startRecording.bind(this));
        this.button.addEventListener('touchend', this.stopRecording.bind(this));
    }

    async startRecording() {
        if (this.isRecording) return;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.mediaRecorder = new MediaRecorder(stream);
            this.audioChunks = [];

            this.mediaRecorder.ondataavailable = (event) => {
                this.audioChunks.push(event.data);
            };

            this.mediaRecorder.onstop = () => {
                this.finishRecording();
            };

            this.mediaRecorder.start();
            this.isRecording = true;

            // 更新按鈕狀態
            this.button.classList.add('recording');
            this.button.innerHTML = '<i class="fas fa-stop"></i>';

            // 設置最大時長限制
            this.maxDurationTimer = setTimeout(() => {
                this.stopRecording();
            }, this.options.maxDuration);

        } catch (error) {
            console.error('快速錄音失敗:', error);
            if (this.options.onError) {
                this.options.onError(error);
            }
        }
    }

    stopRecording() {
        if (!this.isRecording) return;

        this.mediaRecorder.stop();
        this.isRecording = false;

        // 停止音頻軌道
        this.mediaRecorder.stream.getTracks().forEach(track => track.stop());

        // 清除計時器
        if (this.maxDurationTimer) {
            clearTimeout(this.maxDurationTimer);
        }

        // 重置按鈕狀態
        this.button.classList.remove('recording');
        this.button.innerHTML = '<i class="fas fa-microphone"></i>';
    }

    finishRecording() {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        const audioUrl = URL.createObjectURL(audioBlob);

        const recordingData = {
            blob: audioBlob,
            url: audioUrl,
            size: audioBlob.size,
            format: 'audio/webm'
        };

        if (this.options.onRecordingComplete) {
            this.options.onRecordingComplete(recordingData);
        }
    }

    destroy() {
        if (this.isRecording) {
            this.stopRecording();
        }

        // 移除事件監聽器
        this.button.removeEventListener('mousedown', this.startRecording.bind(this));
        this.button.removeEventListener('mouseup', this.stopRecording.bind(this));
        this.button.removeEventListener('mouseleave', this.stopRecording.bind(this));
        this.button.removeEventListener('touchstart', this.startRecording.bind(this));
        this.button.removeEventListener('touchend', this.stopRecording.bind(this));
    }
}

// 導出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { VoiceRecorderComponent, QuickVoiceRecorder };
} else {
    window.VoiceRecorderComponent = VoiceRecorderComponent;
    window.QuickVoiceRecorder = QuickVoiceRecorder;
}