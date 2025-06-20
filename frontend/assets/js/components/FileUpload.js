
class FileUploadComponent {
    constructor(container, options = {}) {
        this.container = container;
        this.options = {
            multiple: true,
            maxFiles: 10,
            maxFileSize: 50 * 1024 * 1024, // 50MB
            allowedTypes: ['image/*', 'video/*', 'audio/*', 'application/pdf', '.doc', '.docx'],
            showPreview: true,
            enableDragDrop: true,
            uploadOnSelect: false,
            compressionEnabled: true,
            compressionQuality: 0.8,
            thumbnailSize: 100,
            ...options
        };

        this.files = [];
        this.uploadQueue = [];
        this.isUploading = false;
        this.dragCounter = 0;

        this.init();
    }

    init() {
        this.createUploadInterface();
        this.bindEvents();
    }

    createUploadInterface() {
        if (!this.container) return;

        this.container.innerHTML = `
            <div class="file-upload-container">
                <!-- 拖放區域 -->
                <div class="drop-zone" id="drop-zone">
                    <div class="drop-zone-content">
                        <div class="drop-zone-icon">
                            <i class="fas fa-cloud-upload-alt"></i>
                        </div>
                        <div class="drop-zone-text">
                            <p class="primary-text">點擊或拖放檔案到這裡</p>
                            <p class="secondary-text">
                                支援多種格式，最大 ${this.formatFileSize(this.options.maxFileSize)}
                            </p>
                        </div>
                        <button class="btn btn-primary browse-btn" id="browse-btn">
                            <i class="fas fa-folder-open"></i>
                            選擇檔案
                        </button>
                    </div>
                    <div class="drop-overlay hidden" id="drop-overlay">
                        <div class="drop-overlay-content">
                            <i class="fas fa-download"></i>
                            <span>放開以上傳檔案</span>
                        </div>
                    </div>
                </div>

                <!-- 檔案列表 -->
                <div class="file-list hidden" id="file-list">
                    <div class="file-list-header">
                        <h4>已選擇的檔案</h4>
                        <button class="btn btn-text clear-all-btn" id="clear-all-btn">
                            <i class="fas fa-trash"></i>
                            清除全部
                        </button>
                    </div>
                    <div class="file-items" id="file-items">
                        <!-- 檔案項目會動態插入這裡 -->
                    </div>
                </div>

                <!-- 上傳控制 -->
                <div class="upload-controls hidden" id="upload-controls">
                    <div class="upload-progress-overall">
                        <div class="progress-info">
                            <span class="progress-text">總進度</span>
                            <span class="progress-stats" id="progress-stats">0 / 0 檔案</span>
                        </div>
                        <div class="progress-bar">
                            <div class="progress-fill" id="overall-progress"></div>
                        </div>
                    </div>
                    <div class="control-buttons">
                        <button class="btn btn-primary upload-btn" id="upload-btn">
                            <i class="fas fa-upload"></i>
                            開始上傳
                        </button>
                        <button class="btn btn-secondary pause-btn hidden" id="pause-btn">
                            <i class="fas fa-pause"></i>
                            暫停
                        </button>
                        <button class="btn btn-secondary cancel-btn hidden" id="cancel-btn">
                            <i class="fas fa-times"></i>
                            取消
                        </button>
                    </div>
                </div>

                <!-- 隱藏的檔案輸入 -->
                <input type="file" 
                       id="file-input" 
                       ${this.options.multiple ? 'multiple' : ''}
                       accept="${this.options.allowedTypes.join(',')}"
                       style="display: none;">
            </div>
        `;

        this.getElements();
    }

    getElements() {
        this.dropZone = this.container.querySelector('#drop-zone');
        this.dropOverlay = this.container.querySelector('#drop-overlay');
        this.fileInput = this.container.querySelector('#file-input');
        this.browseBtn = this.container.querySelector('#browse-btn');
        this.fileList = this.container.querySelector('#file-list');
        this.fileItems = this.container.querySelector('#file-items');
        this.uploadControls = this.container.querySelector('#upload-controls');
        this.uploadBtn = this.container.querySelector('#upload-btn');
        this.pauseBtn = this.container.querySelector('#pause-btn');
        this.cancelBtn = this.container.querySelector('#cancel-btn');
        this.clearAllBtn = this.container.querySelector('#clear-all-btn');
        this.overallProgress = this.container.querySelector('#overall-progress');
        this.progressStats = this.container.querySelector('#progress-stats');
    }

    bindEvents() {
        // 瀏覽按鈕
        this.browseBtn?.addEventListener('click', () => {
            this.fileInput.click();
        });

        // 檔案選擇
        this.fileInput?.addEventListener('change', this.handleFileSelect.bind(this));

        // 拖放事件
        if (this.options.enableDragDrop) {
            this.bindDragDropEvents();
        }

        // 控制按鈕
        this.uploadBtn?.addEventListener('click', this.startUpload.bind(this));
        this.pauseBtn?.addEventListener('click', this.pauseUpload.bind(this));
        this.cancelBtn?.addEventListener('click', this.cancelUpload.bind(this));
        this.clearAllBtn?.addEventListener('click', this.clearAllFiles.bind(this));

        // 點擊拖放區域
        this.dropZone?.addEventListener('click', (e) => {
            if (e.target === this.dropZone || e.target.closest('.drop-zone-content')) {
                this.fileInput.click();
            }
        });
    }

    bindDragDropEvents() {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            this.dropZone?.addEventListener(eventName, this.preventDefaults, false);
            document.body.addEventListener(eventName, this.preventDefaults, false);
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            this.dropZone?.addEventListener(eventName, this.handleDragEnter.bind(this), false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            this.dropZone?.addEventListener(eventName, this.handleDragLeave.bind(this), false);
        });

        this.dropZone?.addEventListener('drop', this.handleDrop.bind(this), false);
    }

    preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    handleDragEnter(e) {
        this.dragCounter++;
        this.dropOverlay?.classList.remove('hidden');
        this.dropZone?.classList.add('drag-over');
    }

    handleDragLeave(e) {
        this.dragCounter--;
        if (this.dragCounter === 0) {
            this.dropOverlay?.classList.add('hidden');
            this.dropZone?.classList.remove('drag-over');
        }
    }

    handleDrop(e) {
        this.dragCounter = 0;
        this.dropOverlay?.classList.add('hidden');
        this.dropZone?.classList.remove('drag-over');

        const files = Array.from(e.dataTransfer.files);
        this.addFiles(files);
    }

    handleFileSelect(e) {
        const files = Array.from(e.target.files);
        this.addFiles(files);
        e.target.value = ''; // 重置輸入
    }

    async addFiles(files) {
        for (const file of files) {
            if (this.validateFile(file)) {
                const fileObj = await this.createFileObject(file);
                this.files.push(fileObj);
            }
        }

        this.updateFileList();
        this.updateUploadControls();

        if (this.options.uploadOnSelect) {
            this.startUpload();
        }
    }

    validateFile(file) {
        // 檢查檔案數量限制
        if (this.files.length >= this.options.maxFiles) {
            this.showError(`最多只能選擇 ${this.options.maxFiles} 個檔案`);
            return false;
        }

        // 檢查檔案大小
        if (file.size > this.options.maxFileSize) {
            this.showError(`檔案 "${file.name}" 大小超過限制 ${this.formatFileSize(this.options.maxFileSize)}`);
            return false;
        }

        // 檢查檔案類型
        if (!this.isFileTypeAllowed(file)) {
            this.showError(`不支援的檔案類型: ${file.name}`);
            return false;
        }

        // 檢查重複檔案
        if (this.files.some(f => f.name === file.name && f.size === file.size)) {
            this.showError(`檔案 "${file.name}" 已存在`);
            return false;
        }

        return true;
    }

    isFileTypeAllowed(file) {
        return this.options.allowedTypes.some(type => {
            if (type.includes('*')) {
                const baseType = type.replace('/*', '');
                return file.type.startsWith(baseType);
            }
            if (type.startsWith('.')) {
                return file.name.toLowerCase().endsWith(type.toLowerCase());
            }
            return file.type === type;
        });
    }

    async createFileObject(file) {
        const fileObj = {
            id: this.generateId(),
            file: file,
            name: file.name,
            size: file.size,
            type: file.type,
            status: 'pending',
            progress: 0,
            error: null,
            preview: null,
            thumbnail: null
        };

        // 生成預覽
        if (this.options.showPreview) {
            fileObj.preview = await this.generatePreview(file);
            if (file.type.startsWith('image/')) {
                fileObj.thumbnail = await this.generateThumbnail(file);
            }
        }

        return fileObj;
    }

    async generatePreview(file) {
        return new Promise((resolve) => {
            if (file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target.result);
                reader.readAsDataURL(file);
            } else {
                resolve(null);
            }
        });
    }

    async generateThumbnail(file) {
        if (!file.type.startsWith('image/')) return null;

        return new Promise((resolve) => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const img = new Image();

            img.onload = () => {
                const size = this.options.thumbnailSize;
                const ratio = Math.min(size / img.width, size / img.height);

                canvas.width = img.width * ratio;
                canvas.height = img.height * ratio;

                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL(file.type, 0.8));
            };

            img.src = URL.createObjectURL(file);
        });
    }

    updateFileList() {
        if (this.files.length === 0) {
            this.fileList?.classList.add('hidden');
            return;
        }

        this.fileList?.classList.remove('hidden');

        if (this.fileItems) {
            this.fileItems.innerHTML = this.files.map(file => this.createFileItemHTML(file)).join('');
            this.bindFileItemEvents();
        }
    }

    createFileItemHTML(file) {
        const statusIcon = this.getStatusIcon(file.status);
        const preview = file.thumbnail || this.getFileTypeIcon(file.name);
        const isImage = file.type.startsWith('image/');

        return `
            <div class="file-item ${file.status}" data-file-id="${file.id}">
                <div class="file-preview">
                    ${isImage ?
            `<img src="${preview}" alt="預覽" class="preview-image">` :
            `<div class="file-icon">${preview}</div>`
        }
                    <div class="file-status-overlay">
                        ${statusIcon}
                    </div>
                </div>
                
                <div class="file-info">
                    <div class="file-name" title="${file.name}">
                        ${this.truncateFileName(file.name)}
                    </div>
                    <div class="file-details">
                        <span class="file-size">${this.formatFileSize(file.size)}</span>
                        <span class="file-type">${this.getFileTypeText(file.type)}</span>
                    </div>
                    
                    ${file.status === 'uploading' ? `
                        <div class="file-progress">
                            <div class="progress-bar small">
                                <div class="progress-fill" style="width: ${file.progress}%"></div>
                            </div>
                            <span class="progress-percent">${file.progress}%</span>
                        </div>
                    ` : ''}
                    
                    ${file.error ? `
                        <div class="file-error">
                            <i class="fas fa-exclamation-triangle"></i>
                            ${file.error}
                        </div>
                    ` : ''}
                </div>
                
                <div class="file-actions">
                    ${file.status === 'pending' || file.status === 'error' ? `
                        <button class="btn-icon retry-btn" data-action="retry" title="重試">
                            <i class="fas fa-redo"></i>
                        </button>
                    ` : ''}
                    
                    ${file.status === 'uploading' ? `
                        <button class="btn-icon pause-file-btn" data-action="pause" title="暫停">
                            <i class="fas fa-pause"></i>
                        </button>
                    ` : ''}
                    
                    <button class="btn-icon remove-btn" data-action="remove" title="移除">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
        `;
    }

    bindFileItemEvents() {
        this.fileItems?.querySelectorAll('.file-item').forEach(item => {
            const fileId = item.dataset.fileId;

            item.querySelectorAll('[data-action]').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const action = btn.dataset.action;
                    this.handleFileAction(fileId, action);
                });
            });

            // 預覽點擊
            const preview = item.querySelector('.file-preview');
            preview?.addEventListener('click', () => {
                this.previewFile(fileId);
            });
        });
    }

    handleFileAction(fileId, action) {
        const fileIndex = this.files.findIndex(f => f.id === fileId);
        if (fileIndex === -1) return;

        const file = this.files[fileIndex];

        switch (action) {
            case 'remove':
                this.removeFile(fileIndex);
                break;
            case 'retry':
                this.retryFile(file);
                break;
            case 'pause':
                this.pauseFile(file);
                break;
        }
    }

    removeFile(index) {
        this.files.splice(index, 1);
        this.updateFileList();
        this.updateUploadControls();
        this.emit('fileRemoved', { files: this.files });
    }

    retryFile(file) {
        file.status = 'pending';
        file.error = null;
        file.progress = 0;
        this.updateFileList();
    }

    async startUpload() {
        if (this.isUploading || this.files.length === 0) return;

        this.isUploading = true;
        this.uploadQueue = this.files.filter(f => f.status === 'pending' || f.status === 'error');

        this.updateUploadButtons();
        this.emit('uploadStarted', { files: this.uploadQueue });

        for (const file of this.uploadQueue) {
            if (!this.isUploading) break;
            await this.uploadFile(file);
        }

        this.isUploading = false;
        this.updateUploadButtons();
        this.emit('uploadCompleted', { files: this.files });
    }

    async uploadFile(fileObj) {
        fileObj.status = 'uploading';
        fileObj.progress = 0;
        this.updateFileItem(fileObj);

        try {
            const formData = new FormData();

            // 壓縮圖片（如果啟用）
            if (this.options.compressionEnabled && fileObj.type.startsWith('image/')) {
                const compressedFile = await this.compressImage(fileObj.file);
                formData.append('file', compressedFile, fileObj.name);
            } else {
                formData.append('file', fileObj.file);
            }

            // 添加元數據
            formData.append('metadata', JSON.stringify({
                originalName: fileObj.name,
                originalSize: fileObj.size,
                type: fileObj.type
            }));

            const response = await this.performUpload(formData, (progress) => {
                fileObj.progress = progress;
                this.updateFileItem(fileObj);
                this.updateOverallProgress();
            });

            fileObj.status = 'completed';
            fileObj.progress = 100;
            fileObj.result = response;

            this.updateFileItem(fileObj);
            this.emit('fileUploaded', { file: fileObj, result: response });

        } catch (error) {
            fileObj.status = 'error';
            fileObj.error = error.message || '上傳失敗';
            this.updateFileItem(fileObj);
            this.emit('fileError', { file: fileObj, error: error });
        }
    }

    async performUpload(formData, onProgress) {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();

            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable) {
                    const progress = Math.round((e.loaded / e.total) * 100);
                    onProgress(progress);
                }
            });

            xhr.addEventListener('load', () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        const response = JSON.parse(xhr.responseText);
                        resolve(response);
                    } catch (error) {
                        reject(new Error('無效的回應格式'));
                    }
                } else {
                    reject(new Error(`上傳失敗: ${xhr.status}`));
                }
            });

            xhr.addEventListener('error', () => {
                reject(new Error('網路錯誤'));
            });

            xhr.addEventListener('abort', () => {
                reject(new Error('上傳已取消'));
            });

            xhr.open('POST', this.options.uploadUrl || '/api/upload');
            xhr.send(formData);

            // 儲存 xhr 以便取消
            formData.xhr = xhr;
        });
    }

    async compressImage(file) {
        return new Promise((resolve) => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const img = new Image();

            img.onload = () => {
                const maxWidth = 1920;
                const maxHeight = 1080;
                const ratio = Math.min(maxWidth / img.width, maxHeight / img.height, 1);

                canvas.width = img.width * ratio;
                canvas.height = img.height * ratio;

                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                canvas.toBlob(resolve, file.type, this.options.compressionQuality);
            };

            img.src = URL.createObjectURL(file);
        });
    }

    updateFileItem(fileObj) {
        const item = this.container.querySelector(`[data-file-id="${fileObj.id}"]`);
        if (!item) return;

        // 更新狀態類
        item.className = `file-item ${fileObj.status}`;

        // 更新進度條
        const progressFill = item.querySelector('.progress-fill');
        const progressPercent = item.querySelector('.progress-percent');

        if (progressFill) {
            progressFill.style.width = `${fileObj.progress}%`;
        }

        if (progressPercent) {
            progressPercent.textContent = `${fileObj.progress}%`;
        }

        // 更新錯誤訊息
        const errorDiv = item.querySelector('.file-error');
        if (fileObj.error && !errorDiv) {
            const errorElement = document.createElement('div');
            errorElement.className = 'file-error';
            errorElement.innerHTML = `
                <i class="fas fa-exclamation-triangle"></i>
                ${fileObj.error}
            `;
            item.querySelector('.file-info').appendChild(errorElement);
        }

        // 更新狀態圖示
        const statusIcon = item.querySelector('.file-status-overlay');
        if (statusIcon) {
            statusIcon.innerHTML = this.getStatusIcon(fileObj.status);
        }
    }

    updateOverallProgress() {
        const completedFiles = this.files.filter(f => f.status === 'completed').length;
        const totalFiles = this.files.length;
        const overallProgress = totalFiles > 0 ? (completedFiles / totalFiles) * 100 : 0;

        if (this.overallProgress) {
            this.overallProgress.style.width = `${overallProgress}%`;
        }

        if (this.progressStats) {
            this.progressStats.textContent = `${completedFiles} / ${totalFiles} 檔案`;
        }
    }

    updateUploadControls() {
        const hasPendingFiles = this.files.some(f => f.status === 'pending' || f.status === 'error');

        if (this.files.length > 0) {
            this.uploadControls?.classList.remove('hidden');
        } else {
            this.uploadControls?.classList.add('hidden');
        }

        this.updateUploadButtons();
    }

    updateUploadButtons() {
        const hasPendingFiles = this.files.some(f => f.status === 'pending' || f.status === 'error');

        if (this.uploadBtn) {
            this.uploadBtn.style.display = (!this.isUploading && hasPendingFiles) ? 'block' : 'none';
        }

        if (this.pauseBtn) {
            this.pauseBtn.style.display = this.isUploading ? 'block' : 'none';
        }

        if (this.cancelBtn) {
            this.cancelBtn.style.display = this.isUploading ? 'block' : 'none';
        }
    }

    pauseUpload() {
        this.isUploading = false;
        this.updateUploadButtons();
        this.emit('uploadPaused');
    }

    cancelUpload() {
        this.isUploading = false;

        // 取消正在上傳的檔案
        this.files.forEach(file => {
            if (file.status === 'uploading') {
                file.status = 'pending';
                file.progress = 0;
            }
        });

        this.updateFileList();
        this.updateUploadButtons();
        this.emit('uploadCancelled');
    }

    clearAllFiles() {
        this.files = [];
        this.uploadQueue = [];
        this.updateFileList();
        this.updateUploadControls();
        this.emit('allFilesCleared');
    }

    previewFile(fileId) {
        const file = this.files.find(f => f.id === fileId);
        if (!file) return;

        this.emit('filePreview', { file });

        // 如果是圖片，顯示預覽模態框
        if (file.type.startsWith('image/') && file.preview) {
            this.showImagePreview(file);
        }
    }

    showImagePreview(file) {
        const modal = document.createElement('div');
        modal.className = 'image-preview-modal';
        modal.innerHTML = `
            <div class="modal-backdrop">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>${file.name}</h3>
                        <button class="btn-icon close-btn">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="modal-body">
                        <img src="${file.preview}" alt="${file.name}" class="preview-image-large">
                    </div>
                    <div class="modal-footer">
                        <div class="file-info">
                            <span>大小: ${this.formatFileSize(file.size)}</span>
                            <span>類型: ${file.type}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // 綁定關閉事件
        const closeBtn = modal.querySelector('.close-btn');
        const backdrop = modal.querySelector('.modal-backdrop');

        const closeModal = () => {
            document.body.removeChild(modal);
        };

        closeBtn.addEventListener('click', closeModal);
        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) {
                closeModal();
            }
        });

        // ESC 鍵關閉
        const handleKeydown = (e) => {
            if (e.key === 'Escape') {
                closeModal();
                document.removeEventListener('keydown', handleKeydown);
            }
        };
        document.addEventListener('keydown', handleKeydown);
    }

    // 工具方法
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    truncateFileName(name, maxLength = 30) {
        if (name.length <= maxLength) return name;
        const ext = name.substring(name.lastIndexOf('.'));
        const nameWithoutExt = name.substring(0, name.lastIndexOf('.'));
        const truncatedName = nameWithoutExt.substring(0, maxLength - ext.length - 3) + '...';
        return truncatedName + ext;
    }

    getFileTypeIcon(filename) {
        const ext = filename.split('.').pop().toLowerCase();
        const iconMap = {
            // 圖片
            jpg: 'fas fa-image', jpeg: 'fas fa-image', png: 'fas fa-image', gif: 'fas fa-image',
            // 影片
            mp4: 'fas fa-video', avi: 'fas fa-video', mov: 'fas fa-video',
            // 音頻
            mp3: 'fas fa-music', wav: 'fas fa-music', ogg: 'fas fa-music',
            // 文件
            pdf: 'fas fa-file-pdf', doc: 'fas fa-file-word', docx: 'fas fa-file-word',
            xls: 'fas fa-file-excel', xlsx: 'fas fa-file-excel',
            ppt: 'fas fa-file-powerpoint', pptx: 'fas fa-file-powerpoint',
            txt: 'fas fa-file-alt', csv: 'fas fa-file-csv',
            // 壓縮檔
            zip: 'fas fa-file-archive', rar: 'fas fa-file-archive', '7z': 'fas fa-file-archive'
        };
        return `<i class="${iconMap[ext] || 'fas fa-file'}"></i>`;
    }

    getFileTypeText(mimeType) {
        const typeMap = {
            'image/jpeg': 'JPEG 圖片',
            'image/png': 'PNG 圖片',
            'image/gif': 'GIF 圖片',
            'video/mp4': 'MP4 影片',
            'audio/mp3': 'MP3 音頻',
            'application/pdf': 'PDF 文件',
            'application/msword': 'Word 文件',
            'text/plain': '純文字檔案'
        };
        return typeMap[mimeType] || mimeType;
    }

    getStatusIcon(status) {
        const iconMap = {
            pending: '<i class="fas fa-clock text-muted"></i>',
            uploading: '<i class="fas fa-spinner fa-spin text-primary"></i>',
            completed: '<i class="fas fa-check-circle text-success"></i>',
            error: '<i class="fas fa-exclamation-circle text-danger"></i>'
        };
        return iconMap[status] || '';
    }

    showError(message) {
        this.emit('error', { message });
    }

    // 公共 API
    getFiles() {
        return [...this.files];
    }

    getCompletedFiles() {
        return this.files.filter(f => f.status === 'completed');
    }

    getPendingFiles() {
        return this.files.filter(f => f.status === 'pending' || f.status === 'error');
    }

    getUploadProgress() {
        const total = this.files.length;
        const completed = this.files.filter(f => f.status === 'completed').length;
        const uploading = this.files.filter(f => f.status === 'uploading').length;

        return {
            total,
            completed,
            uploading,
            pending: total - completed - uploading,
            percentage: total > 0 ? (completed / total) * 100 : 0
        };
    }

    reset() {
        this.cancelUpload();
        this.clearAllFiles();
    }

    setOptions(newOptions) {
        this.options = { ...this.options, ...newOptions };
    }

    // 事件系統
    emit(event, data = {}) {
        if (this.options.onEvent) {
            this.options.onEvent(event, data);
        }

        const customEvent = new CustomEvent(`fileUpload:${event}`, {
            detail: { ...data, uploader: this }
        });
        this.container.dispatchEvent(customEvent);
    }

    on(event, callback) {
        this.container.addEventListener(`fileUpload:${event}`, callback);
    }

    off(event, callback) {
        this.container.removeEventListener(`fileUpload:${event}`, callback);
    }

    // 銷毀方法
    destroy() {
        this.cancelUpload();

        // 清理事件監聽器
        if (this.container) {
            this.container.innerHTML = '';
        }

        // 釋放資源
        this.files.forEach(file => {
            if (file.preview && file.preview.startsWith('blob:')) {
                URL.revokeObjectURL(file.preview);
            }
            if (file.thumbnail && file.thumbnail.startsWith('blob:')) {
                URL.revokeObjectURL(file.thumbnail);
            }
        });

        this.files = [];
        this.uploadQueue = [];
    }
}

// 簡化版檔案上傳器
class SimpleFileUploader {
    constructor(inputElement, options = {}) {
        this.input = inputElement;
        this.options = {
            maxFileSize: 10 * 1024 * 1024,
            allowedTypes: ['image/*'],
            onFileSelected: null,
            onUploadComplete: null,
            onError: null,
            ...options
        };

        this.init();
    }

    init() {
        this.input.addEventListener('change', this.handleFileSelect.bind(this));
    }

    handleFileSelect(e) {
        const file = e.target.files[0];
        if (!file) return;

        if (!this.validateFile(file)) return;

        if (this.options.onFileSelected) {
            this.options.onFileSelected(file);
        }

        if (this.options.autoUpload) {
            this.uploadFile(file);
        }
    }

    validateFile(file) {
        if (file.size > this.options.maxFileSize) {
            this.handleError(`檔案大小超過限制`);
            return false;
        }

        if (!this.isFileTypeAllowed(file)) {
            this.handleError(`不支援的檔案類型`);
            return false;
        }

        return true;
    }

    isFileTypeAllowed(file) {
        return this.options.allowedTypes.some(type => {
            if (type.includes('*')) {
                const baseType = type.replace('/*', '');
                return file.type.startsWith(baseType);
            }
            return file.type === type;
        });
    }

    async uploadFile(file) {
        try {
            const formData = new FormData();
            formData.append('file', file);

            const response = await fetch(this.options.uploadUrl || '/api/upload', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error(`上傳失敗: ${response.status}`);
            }

            const result = await response.json();

            if (this.options.onUploadComplete) {
                this.options.onUploadComplete(result, file);
            }

            return result;

        } catch (error) {
            this.handleError(error.message);
            throw error;
        }
    }

    handleError(message) {
        if (this.options.onError) {
            this.options.onError(message);
        }
    }
}

// 導出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { FileUploadComponent, SimpleFileUploader };
} else {
    window.FileUploadComponent = FileUploadComponent;
    window.SimpleFileUploader = SimpleFileUploader;
}