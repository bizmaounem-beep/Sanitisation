// API Wrapper for Sanitation Management System REST API

const API = {
    // Auth state management
    getToken() {
        return localStorage.getItem('sms_auth_token');
    },

    getCurrentUser() {
        const userStr = localStorage.getItem('sms_user');
        return userStr ? JSON.parse(userStr) : null;
    },

    setSession(user, token) {
        localStorage.setItem('sms_user', JSON.stringify(user));
        localStorage.setItem('sms_auth_token', token);
    },

    clearSession() {
        localStorage.removeItem('sms_user');
        localStorage.removeItem('sms_auth_token');
    },

    // HTTP helpers
    async request(url, options = {}) {
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers
        };

        const token = this.getToken();
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const config = {
            ...options,
            headers
        };

        try {
            const response = await fetch(url, config);
            const data = await response.json();
            if (!response.ok) {
                // Session expired or invalid token — force re-login
                if (response.status === 401) {
                    this.clearSession();
                    if (window.App && typeof window.App.showLoginPortal === 'function') {
                        window.App.showToast('Session expired. Please log in again.', 'warning');
                        window.App.showLoginPortal();
                    }
                    return; // Stop propagation — don't throw
                }
                throw new Error(data.message || 'API request failed');
            }
            return data;
        } catch (error) {
            console.error(`API Error on ${url}:`, error);
            throw error;
        }
    },

    async uploadRequest(url, formData, options = {}) {
        const headers = {
            ...options.headers
        };

        const token = this.getToken();
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const config = {
            ...options,
            method: 'POST',
            body: formData,
            headers
        };

        try {
            const response = await fetch(url, config);
            const data = await response.json();
            if (!response.ok) {
                // Session expired or invalid token — force re-login
                if (response.status === 401) {
                    this.clearSession();
                    if (window.App && typeof window.App.showLoginPortal === 'function') {
                        window.App.showToast('Session expired. Please log in again.', 'warning');
                        window.App.showLoginPortal();
                    }
                    return;
                }
                throw new Error(data.message || 'Upload failed');
            }
            return data;
        } catch (error) {
            console.error(`API Upload Error on ${url}:`, error);
            throw error;
        }
    },

    // --- Authentication ---
    async login(username, password) {
        const data = await this.request('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });
        if (data.user) {
            this.setSession(data.user, data.token);
        }
        return data;
    },


    async register(userData) {
        return this.request('/api/auth/register', {
            method: 'POST',
            body: JSON.stringify(userData)
        });
    },

    async generateResetCode(userId) {
        return this.request(`/api/users/${userId}/reset_code`, {
            method: 'POST'
        });
    },

    async requestReset(username, name) {
        return this.request('/api/auth/request_reset', {
            method: 'POST',
            body: JSON.stringify({ username, name })
        });
    },

    async recoverAccount(username, name, resetCode) {
        return this.request('/api/auth/recover', {
            method: 'POST',
            body: JSON.stringify({ username, name, reset_code: resetCode })
        });
    },

    async resetPassword(username, name, resetCode, new_password) {
        return this.request('/api/auth/reset_password', {
            method: 'POST',
            body: JSON.stringify({ username, name, reset_code: resetCode, new_password })
        });
    },

    // --- User Management (Coordinator) ---
    async getUsers() {
        return this.request('/api/users');
    },

    async createUser(userData) {
        return this.request('/api/users', {
            method: 'POST',
            body: JSON.stringify(userData)
        });
    },

    async updateUser(userId, userData) {
        return this.request(`/api/users/${userId}`, {
            method: 'PUT',
            body: JSON.stringify(userData)
        });
    },

    async deleteUser(userId) {
        return this.request(`/api/users/${userId}`, {
            method: 'DELETE'
        });
    },

    async approveUser(userId, approve = true) {
        return this.request(`/api/users/approve/${userId}`, {
            method: 'POST',
            body: JSON.stringify({ approve })
        });
    },

    // --- Facility Structure Configuration ---
    async getFacilityHierarchy() {
        return this.request('/api/facility');
    },

    async createFacilityNode(nodeData) {
        return this.request('/api/facility', {
            method: 'POST',
            body: JSON.stringify(nodeData)
        });
    },

    async updateFacilityNode(nodeId, nodeData) {
        return this.request(`/api/facility/${nodeId}`, {
            method: 'PUT',
            body: JSON.stringify(nodeData)
        });
    },

    async deleteFacilityNode(nodeId) {
        return this.request(`/api/facility/${nodeId}`, {
            method: 'DELETE'
        });
    },

    // --- Sanitation Protocol Management ---
    async getProtocols() {
        return this.request('/api/protocols');
    },

    async createProtocol(protocolData) {
        return this.request('/api/protocols', {
            method: 'POST',
            body: JSON.stringify(protocolData)
        });
    },

    async updateProtocol(protocolId, protocolData) {
        return this.request(`/api/protocols/${protocolId}`, {
            method: 'PUT',
            body: JSON.stringify(protocolData)
        });
    },

    async deleteProtocol(protocolId) {
        return this.request(`/api/protocols/${protocolId}`, {
            method: 'DELETE'
        });
    },

    // --- Inventory Management ---
    async getInventory() {
        return this.request('/api/inventory');
    },

    async createInventoryItem(itemData) {
        return this.request('/api/inventory', {
            method: 'POST',
            body: JSON.stringify(itemData)
        });
    },

    async updateInventoryItem(itemId, itemData) {
        return this.request(`/api/inventory/${itemId}`, {
            method: 'PUT',
            body: JSON.stringify(itemData)
        });
    },

    async deleteInventoryItem(itemId) {
        return this.request(`/api/inventory/${itemId}`, {
            method: 'DELETE'
        });
    },

    async adjustStock(itemId, quantity, notes = '') {
        return this.request(`/api/inventory/${itemId}/adjust`, {
            method: 'POST',
            body: JSON.stringify({ quantity, notes })
        });
    },

    async getInventoryLogs(itemId = null) {
        const url = itemId ? `/api/inventory/logs?item_id=${itemId}` : '/api/inventory/logs';
        return this.request(url);
    },

    // --- Tasks Workflow ---
    async getTasks(status = null) {
        const url = status ? `/api/tasks?status=${status}` : '/api/tasks';
        return this.request(url);
    },

    async createTask(taskData) {
        return this.request('/api/tasks', {
            method: 'POST',
            body: JSON.stringify(taskData)
        });
    },

    async updateTask(taskId, taskData) {
        return this.request(`/api/tasks/${taskId}`, {
            method: 'PUT',
            body: JSON.stringify(taskData)
        });
    },

    async deleteTask(taskId) {
        return this.request(`/api/tasks/${taskId}`, {
            method: 'DELETE'
        });
    },

    async updateTaskStatus(taskId, status, extraData = {}) {
        return this.request(`/api/tasks/${taskId}/status`, {
            method: 'POST',
            body: JSON.stringify({ status, ...extraData })
        });
    },

    async submitTaskValidation(taskId, submissionData) {
        // submissionData should contain notes, consumption array, photoBefore base64, photoAfter base64
        return this.request(`/api/tasks/${taskId}/submit`, {
            method: 'POST',
            body: JSON.stringify(submissionData)
        });
    },

    async validateTask(taskId, approved, rejectionReason = '') {
        return this.request(`/api/tasks/${taskId}/validate`, {
            method: 'POST',
            body: JSON.stringify({ approved, rejection_reason: rejectionReason })
        });
    },

    // --- Audit & Reports ---
    async getAuditLogs(filters = {}) {
        const queryParams = new URLSearchParams(filters).toString();
        const url = queryParams ? `/api/audit?${queryParams}` : '/api/audit';
        return this.request(url);
    },

    async getReports(filters = {}) {
        const queryParams = new URLSearchParams(filters).toString();
        const url = queryParams ? `/api/reports?${queryParams}` : '/api/reports';
        return this.request(url);
    },

    // --- Backup & Settings ---
    async triggerBackup() {
        return this.request('/api/backup', {
            method: 'POST'
        });
    },

    async updateProfile(profileData) {
        const data = await this.request('/api/users/profile', {
            method: 'PUT',
            body: JSON.stringify(profileData)
        });
        if (data.user) {
            const user = this.getCurrentUser();
            if (user) {
                user.name = data.user.name;
                user.profile_image = data.user.profile_image;
                localStorage.setItem('sms_user', JSON.stringify(user));
            }
        }
        return data;
    },

    async updateProfileLanguage(lang) {
        const user = this.getCurrentUser();
        if (user) {
            user.language = lang;
            localStorage.setItem('sms_user', JSON.stringify(user));
        }
        return this.request('/api/users/profile/language', {
            method: 'POST',
            body: JSON.stringify({ language: lang })
        });
    }
};
