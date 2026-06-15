// Single Page Application state and view controller

const App = {
    state: {
        currentUser: null,
        currentView: 'dashboard',
        facilityNodes: [],
        protocols: [],
        inventoryItems: [],
        tasks: [],
        activeTimerInterval: null,
        activeTimerTaskId: null,
        currentPIN: '',
        globalListenersSetup: false
    },

    escapeHTML(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    },

    // --- Toast Notifications ---
    showToast(message, type = 'success') {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <span>${message}</span>
        `;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    },

    renderAvatar(user, sizeClass = '') {
        if (!user) return '';
        const sizeLg = sizeClass.includes('avatar-lg');
        const sizeSm = sizeClass.includes('avatar-sm');

        if (user.profile_image) {
            return `<img src="/static/uploads/${user.profile_image}" class="avatar ${sizeClass}" alt="${user.name}">`;
        }

        const nameParts = (user.name || 'U').trim().split(/\s+/);
        let initials = '';
        if (nameParts.length > 1) {
            initials = nameParts[0][0] + nameParts[nameParts.length - 1][0];
        } else if (nameParts.length === 1 && nameParts[0].length > 0) {
            initials = nameParts[0].substring(0, Math.min(2, nameParts[0].length));
        } else {
            initials = 'U';
        }
        initials = initials.toUpperCase();

        let placeholderSizeClass = 'avatar-placeholder-md';
        if (sizeLg) placeholderSizeClass = 'avatar-placeholder-lg';
        if (sizeSm) placeholderSizeClass = 'avatar-placeholder-sm';

        return `<div class="avatar-placeholder ${placeholderSizeClass}">${initials}</div>`;
    },

    handleUserPhotoUpload(input, containerId, dataFieldId) {
        const file = input.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const container = document.getElementById(containerId);
            container.innerHTML = `<img src="${e.target.result}" class="avatar-lg" style="border-radius:50%; object-fit:cover;">`;
            document.getElementById(dataFieldId).value = e.target.result; // base64 string
        };
        reader.readAsDataURL(file);
    },

    openMyProfileModal() {
        const user = this.state.currentUser;
        if (!user) return;

        document.getElementById('profile-name').value = user.name;
        document.getElementById('profile-username').value = user.username;
        document.getElementById('profile-password').value = '';
        document.getElementById('profile-confirm-password').value = '';
        document.getElementById('profile-photo-data').value = '';

        document.getElementById('profile-avatar-container').innerHTML = this.renderAvatar(user, 'avatar-lg');

        document.getElementById('profile-modal').style.display = 'flex';
        i18n.translateDOM();
    },

    async handleUpdateProfile(e) {
        e.preventDefault();
        const name = document.getElementById('profile-name').value;
        const password = document.getElementById('profile-password').value;
        const confirmPassword = document.getElementById('profile-confirm-password').value;
        const profile_image = document.getElementById('profile-photo-data').value;

        if (password && password !== confirmPassword) {
            this.showToast(i18n.t('password_confirm_error'), 'error');
            return;
        }

        const payload = { name };
        if (password) payload.password = password;
        if (profile_image) payload.profile_image = profile_image;

        try {
            const data = await API.updateProfile(payload);
            this.state.currentUser = data.user;
            this.showToast(i18n.t('update_profile_success'), 'success');
            document.getElementById('profile-modal').style.display = 'none';
            // Refresh just the sidebar user section without resetting current view
            this.refreshSidebarUserInfo();
        } catch (err) {
            this.showToast(err.message, 'error');
        }
    },

    toggleSidebar() {
        const sidebar = document.getElementById('app-sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        if (sidebar && overlay) {
            const isOpen = sidebar.classList.toggle('open');
            overlay.style.display = isOpen ? 'block' : 'none';
        }
    },

    closeSidebar() {
        const sidebar = document.getElementById('app-sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        if (sidebar && overlay) {
            sidebar.classList.remove('open');
            overlay.style.display = 'none';
        }
    },

    // --- Init Application ---
    init() {
        // Hydrate authentication state
        const storedUser = API.getCurrentUser();
        const storedToken = API.getToken();

        if (storedUser && storedToken) {
            this.state.currentUser = storedUser;
            i18n.setLanguage(storedUser.language || 'en');
            // Restore last visited view (so page reload doesn't always reset to dashboard)
            const lastView = localStorage.getItem('sms_last_view');
            const defaultView = storedUser.role === 'worker' ? 'tasks' : 'dashboard';
            this.showAppLayout(false); // false = don't force reset to dashboard
            // Always switch to some view: last visited or role default
            this.switchView(lastView || defaultView);
        } else {
            this.showLoginPortal();
        }

        this.setupGlobalEventListeners();
        this.setupInactivityTracker();
    },

    refreshSidebarUserInfo() {
        const userSection = document.getElementById('sidebar-user-section');
        if (!userSection || !this.state.currentUser) return;
        const u = this.state.currentUser;
        userSection.innerHTML = `
            ${this.renderAvatar(u, 'avatar-sm')}
            <div style="display:flex; flex-direction:column; min-width:0;">
                <div style="font-weight:600; font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${u.name}</div>
                <div style="font-size:11px; color:var(--text-secondary);">${i18n.t(u.role)}</div>
            </div>
        `;
    },

    setupInactivityTracker() {
        this.state.lastActivity = Date.now();

        const resetActivity = () => {
            this.state.lastActivity = Date.now();
        };

        const events = ['mousemove', 'mousedown', 'keypress', 'touchstart', 'scroll', 'click'];
        events.forEach(name => {
            document.addEventListener(name, resetActivity, { passive: true });
        });

        if (this.state.inactivityInterval) {
            clearInterval(this.state.inactivityInterval);
        }

        this.state.inactivityInterval = setInterval(() => {
            if (this.state.currentUser) {
                const elapsedMs = Date.now() - this.state.lastActivity;
                const timeoutMs = 15 * 60 * 1000; // 15 minutes
                if (elapsedMs > timeoutMs) {
                    this.showToast('Session expired due to inactivity.', 'warning');
                    this.showLoginPortal();
                }
            }
        }, 5000);
    },

    // --- Global Event Listeners ---
    setupGlobalEventListeners() {
        if (this.state.globalListenersSetup) return;
        this.state.globalListenersSetup = true;

        // Language Toggle dropdown using robust document event delegation
        document.addEventListener('click', (e) => {
            const langBtn = document.getElementById('lang-btn');
            const langDropdown = document.getElementById('lang-dropdown');
            if (langBtn && langDropdown) {
                if (langBtn.contains(e.target)) {
                    langDropdown.style.display = langDropdown.style.display === 'flex' ? 'none' : 'flex';
                } else if (!langDropdown.contains(e.target)) {
                    langDropdown.style.display = 'none';
                }
            }
        });

        // Modal closures when clicking backdrop using dynamic delegation
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-backdrop')) {
                e.target.style.display = 'none';
                if (e.target.id === 'task-completion-modal') {
                    this.stopActiveWorkerTimerDisplay();
                }
            }
        });
    },

    setAppLanguage(lang) {
        i18n.setLanguage(lang);
        if (this.state.currentUser) {
            API.updateProfileLanguage(lang).catch(err => console.error(err));

            // Update the user badge role translation in the header
            const headerBadgeSpan = document.querySelector('#header-user-badge span');
            if (headerBadgeSpan) {
                headerBadgeSpan.textContent = `${this.state.currentUser.name} (${i18n.t(this.state.currentUser.role)})`;
            }
        }

        // Update the language button text
        const langBtn = document.getElementById('lang-btn');
        if (langBtn) {
            langBtn.innerHTML = `🌐 ${lang.toUpperCase()}`;
        }

        // Explicitly close the dropdown menu
        const langDropdown = document.getElementById('lang-dropdown');
        if (langDropdown) {
            langDropdown.style.display = 'none';
        }

        // Re-render current view to swap translatable keys
        this.renderCurrentView();
    },

    // --- Auth Screens Management ---
    showLoginPortal() {
        this.state.currentUser = null;
        API.clearSession();
        // Clear remembered view so next login starts fresh at dashboard
        localStorage.removeItem('sms_last_view');

        const root = document.getElementById('app-root');
        root.innerHTML = `
            <div class="login-container">
                <div class="glass-panel login-card">
                    <div class="login-header">
                        <div style="display: flex; justify-content: center; margin-bottom: 16px;">
                            <div class="sidebar-logo">S</div>
                        </div>
                        <h2 data-i18n="login_title">Facility Access Portal</h2>
                        <p data-i18n="app_subtitle" style="color: var(--text-secondary); margin-top: 4px;">Industrial Operations & Traceability</p>
                    </div>
                    
                    <!-- Standard credentials form -->
                    <form id="login-form-credentials" onsubmit="App.handleCredentialsLogin(event)">
                        <div class="form-group">
                            <label data-i18n="username">Username</label>
                            <input type="text" id="login-username" class="form-control" placeholder="username" required>
                        </div>
                        <div class="form-group">
                            <label data-i18n="password">Password</label>
                            <input type="password" id="login-password" class="form-control" placeholder="password" required>
                        </div>
                        <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 12px;" data-i18n="btn_login">Login</button>
                    </form>
                    
                    <div style="text-align: center; margin-top: 24px;">
                        <a href="#" class="sidebar-link" style="display: inline-block; font-size: 14px;" data-i18n="forgot_password" onclick="App.showRecoveryModal()">Forgot Password or PIN?</a>
                    </div>
                </div>
            </div>
            
            <!-- Account Recovery modal -->
            <div class="modal-backdrop" id="recovery-modal" style="display: none;">
                <div class="glass-panel modal-content">
                    <div class="modal-header">
                        <h3 data-i18n="recovery_title">Account Recovery</h3>
                        <button class="modal-close" onclick="document.getElementById('recovery-modal').style.display='none'">&times;</button>
                    </div>
                    
                    <!-- Step 1: Submit Reset Request -->
                    <div id="recovery-step-request">
                        <form onsubmit="App.handleRequestReset(event)">
                            <div class="form-group">
                                <label data-i18n="username">Username</label>
                                <input type="text" id="recover-req-username" class="form-control" required placeholder="username">
                            </div>
                            <div class="form-group">
                                <label data-i18n="name_label">Full Name</label>
                                <input type="text" id="recover-req-name" class="form-control" required placeholder="Full Name">
                            </div>
                            <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 12px;" data-i18n="btn_submit_request">Submit Reset Request</button>
                            <div style="text-align: center; margin-top: 16px;">
                                <a href="#" class="sidebar-link" style="font-size: 14px;" data-i18n="btn_have_reset_code" onclick="App.toggleRecoveryStep('verify')">I have a Reset Code</a>
                            </div>
                        </form>
                    </div>

                    <!-- Step 2: Verify Reset Code -->
                    <div id="recovery-step-verify" style="display: none;">
                        <form onsubmit="App.handleVerifyRecovery(event)">
                            <div class="form-group">
                                <label data-i18n="username">Username</label>
                                <input type="text" id="recover-username" class="form-control" required placeholder="username">
                            </div>
                            <div class="form-group">
                                <label data-i18n="name_label">Full Name</label>
                                <input type="text" id="recover-name" class="form-control" required placeholder="Full Name">
                            </div>
                            <div class="form-group">
                                <label data-i18n="reset_code_label">Reset Code</label>
                                <input type="text" id="recover-reset-code" class="form-control" required data-i18n="reset_code_placeholder">
                            </div>
                            <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 12px;" data-i18n="btn_verify">Verify Identity</button>
                            <div style="text-align: center; margin-top: 16px;">
                                <a href="#" class="sidebar-link" style="font-size: 14px;" data-i18n="btn_request_reset_form" onclick="App.toggleRecoveryStep('request')">Request Reset Code</a>
                            </div>
                        </form>
                    </div>
                    


                    <!-- Step 3 (Password Reset): Reset Form -->
                    <div id="recovery-step-password" style="display: none;">
                        <p style="margin-bottom: 12px; color: var(--text-secondary);" data-i18n="recovery_reset_prompt">Identity verified! Please enter a new password.</p>
                        <form onsubmit="App.handleResetPassword(event)">
                            <div class="form-group">
                                <label data-i18n="new_password">New Password</label>
                                <input type="password" id="recover-new-password" class="form-control" required>
                            </div>
                            <div class="form-group">
                                <label data-i18n="confirm_new_password">Confirm New Password</label>
                                <input type="password" id="recover-confirm-password" class="form-control" required>
                            </div>
                            <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 12px;" data-i18n="btn_reset_password">Reset Password</button>
                        </form>
                    </div>
                </div>
            </div>
        `;
        i18n.translateDOM();
    },


    async handleCredentialsLogin(e) {
        e.preventDefault();
        const username = document.getElementById('login-username').value;
        const password = document.getElementById('login-password').value;
        try {
            const data = await API.login(username, password);
            this.state.currentUser = data.user;
            i18n.setLanguage(data.user.language || 'en');
            this.showAppLayout();
        } catch (err) {
            this.showToast(i18n.t('login_failed'), 'error');
        }
    },



    showRecoveryModal() {
        document.getElementById('recovery-modal').style.display = 'flex';
        this.toggleRecoveryStep('request');

        // Clear all fields
        document.getElementById('recover-req-username').value = '';
        document.getElementById('recover-req-name').value = '';
        document.getElementById('recover-username').value = '';
        document.getElementById('recover-name').value = '';
        document.getElementById('recover-reset-code').value = '';
        document.getElementById('recover-new-password').value = '';
        document.getElementById('recover-confirm-password').value = '';
        i18n.translateDOM();
    },

    toggleRecoveryStep(step) {
        if (step === 'request') {
            document.getElementById('recovery-step-request').style.display = 'block';
            document.getElementById('recovery-step-verify').style.display = 'none';
        } else if (step === 'verify') {
            document.getElementById('recovery-step-request').style.display = 'none';
            document.getElementById('recovery-step-verify').style.display = 'block';

            // Auto-populate verification username/name from request if they filled it out
            const reqUser = document.getElementById('recover-req-username').value;
            const reqName = document.getElementById('recover-req-name').value;
            if (reqUser) document.getElementById('recover-username').value = reqUser;
            if (reqName) document.getElementById('recover-name').value = reqName;
        }
        const stepPassword = document.getElementById('recovery-step-password');
        if (stepPassword) stepPassword.style.display = 'none';
        i18n.translateDOM();
    },

    async handleRequestReset(e) {
        e.preventDefault();
        const username = document.getElementById('recover-req-username').value;
        const name = document.getElementById('recover-req-name').value;

        try {
            const res = await API.requestReset(username, name);
            this.showToast(i18n.t('request_success_message'), 'success');
            this.toggleRecoveryStep('verify');
        } catch (err) {
            this.showToast(err.message, 'error');
        }
    },

    async handleVerifyRecovery(e) {
        e.preventDefault();
        const username = document.getElementById('recover-username').value;
        const name = document.getElementById('recover-name').value;
        const resetCode = document.getElementById('recover-reset-code').value;

        try {
            const res = await API.recoverAccount(username, name, resetCode);
            if (res.requires_reset) {
                document.getElementById('recovery-step-verify').style.display = 'none';
                document.getElementById('recovery-step-password').style.display = 'block';
            }
        } catch (err) {
            console.error("Recovery verification error:", err);
            this.showToast(i18n.t('invalid_reset_code_error'), 'error');
        }
    },

    async handleResetPassword(e) {
        e.preventDefault();
        const username = document.getElementById('recover-username').value;
        const name = document.getElementById('recover-name').value;
        const resetCode = document.getElementById('recover-reset-code').value;
        const newPassword = document.getElementById('recover-new-password').value;
        const confirmPassword = document.getElementById('recover-confirm-password').value;

        if (newPassword !== confirmPassword) {
            this.showToast(i18n.t('password_confirm_error'), 'error');
            return;
        }

        try {
            await API.resetPassword(username, name, resetCode, newPassword);
            this.showToast(i18n.t('password_reset_success'), 'success');
            document.getElementById('recovery-modal').style.display = 'none';
        } catch (err) {
            this.showToast(err.message, 'error');
        }
    },

    // --- Main Layout ---
    showAppLayout(resetView = true) {
        const root = document.getElementById('app-root');
        root.innerHTML = `
            <div class="app-container">
                <!-- Sidebar Overlay for mobile -->
                <div class="sidebar-overlay" id="sidebar-overlay" onclick="App.closeSidebar()"></div>

                <!-- Sidebar Menu -->
                <aside class="sidebar" id="app-sidebar">
                    <div class="sidebar-brand">
                        <div class="sidebar-logo">S</div>
                        <h2 data-i18n="app_title">Sanitation System</h2>
                    </div>

                    <!-- Sidebar User Profile Details -->
                    <div class="sidebar-user-section flex-gap-12 mb-12" style="padding: 12px; background: hsla(222,47%,8%,0.3); border-radius: 12px; border: 1px solid var(--border-color);">
                        <div id="sidebar-user-section" style="display:flex; align-items:center; gap:12px; min-width:0; width:100%;">
                            ${this.renderAvatar(this.state.currentUser, 'avatar-sm')}
                            <div style="display:flex; flex-direction:column; overflow:hidden;">
                                <span style="font-weight:600; font-size:14px; color:var(--text-primary); text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">${this.state.currentUser.name}</span>
                                <span style="font-size:11px; color:var(--text-secondary); text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">@${this.state.currentUser.username}</span>
                            </div>
                        </div>
                    </div>
                    
                    <ul class="sidebar-menu">
                        <li id="menu-dashboard">
                            <a class="sidebar-link active" id="nav-dashboard" onclick="App.switchView('dashboard')">
                                <span data-i18n="nav_dashboard">Dashboard</span>
                            </a>
                        </li>
                        <li id="menu-tasks">
                            <a class="sidebar-link" id="nav-tasks" onclick="App.switchView('tasks')">
                                <span data-i18n="nav_tasks">Sanitation Tasks</span>
                            </a>
                        </li>
                        <li id="menu-inventory" style="display: none;">
                            <a class="sidebar-link" id="nav-inventory" onclick="App.switchView('inventory')">
                                <span data-i18n="nav_inventory">Inventory Stock</span>
                            </a>
                        </li>
                        <li id="menu-protocols" style="display: none;">
                            <a class="sidebar-link" id="nav-protocols" onclick="App.switchView('protocols')">
                                <span data-i18n="nav_protocols">Sanitation Protocols</span>
                            </a>
                        </li>
                        <li id="menu-facility" style="display: none;">
                            <a class="sidebar-link" id="nav-facility" onclick="App.switchView('facility')">
                                <span data-i18n="nav_facility">Facility Hierarchy</span>
                            </a>
                        </li>
                        <li id="menu-users" style="display: none;">
                            <a class="sidebar-link" id="nav-users" onclick="App.switchView('users')">
                                <span data-i18n="nav_users">User Accounts</span>
                            </a>
                        </li>
                        <li id="menu-audit" style="display: none;">
                            <a class="sidebar-link" id="nav-audit" onclick="App.switchView('audit')">
                                <span data-i18n="nav_audit">Audit Trail</span>
                            </a>
                        </li>
                        <li id="menu-reports" style="display: none;">
                            <a class="sidebar-link" id="nav-reports" onclick="App.switchView('reports')">
                                <span data-i18n="nav_reports">Reports & Analytics</span>
                            </a>
                        </li>
                    </ul>
                    
                    <div class="sidebar-footer" style="margin-top:auto;">
                        <a class="sidebar-link mb-4" id="nav-profile" onclick="App.openMyProfileModal()" style="border: none;">
                            <span data-i18n="menu_profile">My Profile</span>
                        </a>
                        <a class="sidebar-link" onclick="App.showLoginPortal()" style="border: none;">
                            <span data-i18n="nav_logout">Logout</span>
                        </a>
                    </div>
                </aside>
                
                <!-- Main Content Area -->
                <main class="main-content">
                    <header class="header-bar">
                        <div class="flex-gap-12">
                            <!-- Mobile Menu Toggle -->
                            <button class="menu-toggle-btn" id="menu-toggle-btn" onclick="App.toggleSidebar()">☰</button>
                            <h1 id="view-title" style="font-size: 24px; font-weight: 700;">Dashboard</h1>
                        </div>
                        <div class="header-user-info">
                            <!-- Dynamic Local Network Clock -->
                            <div id="live-clock" style="font-size: 14px; font-weight: 500; color: var(--text-secondary);"></div>
                            
                            <!-- Role Badge -->
                            <div class="user-badge user-role-${this.state.currentUser.role} flex-gap-12" id="header-user-badge">
                                ${this.renderAvatar(this.state.currentUser, 'avatar-sm')}
                                <span>${this.state.currentUser.name} (${i18n.t(this.state.currentUser.role)})</span>
                            </div>
                            
                            <!-- Language Dropdown selector -->
                            <div class="lang-selector">
                                <button class="lang-btn" id="lang-btn">
                                    🌐 ${i18n.currentLang.toUpperCase()}
                                </button>
                                <div class="lang-dropdown" id="lang-dropdown">
                                    <div class="lang-option" onclick="App.setAppLanguage('en')">English</div>
                                    <div class="lang-option" onclick="App.setAppLanguage('fr')">Français</div>
                                    <div class="lang-option" onclick="App.setAppLanguage('ar')">العربية</div>
                                </div>
                            </div>
                        </div>
                    </header>
                    
                    <!-- Dynamic view content -->
                    <div id="view-content"></div>
                </main>
            </div>
            
            <div id="toast-container" class="toast-container"></div>
            
            <!-- My Profile Modal -->
            <div class="modal-backdrop" id="profile-modal">
                <div class="glass-panel modal-content">
                    <div class="modal-header">
                        <h3 data-i18n="menu_profile">My Profile</h3>
                        <button class="modal-close" onclick="document.getElementById('profile-modal').style.display='none'">&times;</button>
                    </div>
                    <form onsubmit="App.handleUpdateProfile(event)">
                        <div class="form-group" style="display:flex; flex-direction:column; align-items:center; gap:12px; margin-bottom:24px;">
                            <div id="profile-avatar-container"></div>
                            <div class="photo-uploader-box" style="width:100%; max-width:200px; min-height:60px; padding:8px;" onclick="document.getElementById('profile-file').click()">
                                <span style="font-size:12px;" data-i18n="change_profile_img">Change Photo</span>
                                <input type="file" id="profile-file" style="display:none;" accept="image/*" onchange="App.handleUserPhotoUpload(this, 'profile-avatar-container', 'profile-photo-data')">
                                <input type="hidden" id="profile-photo-data">
                            </div>
                        </div>
                        <div class="form-group">
                            <label data-i18n="name_label">Full Name</label>
                            <input type="text" id="profile-name" class="form-control" required>
                        </div>
                        <div class="form-group">
                            <label data-i18n="username">Username</label>
                            <input type="text" id="profile-username" class="form-control" readonly style="opacity:0.7;">
                        </div>
                        <div class="form-group">
                            <label data-i18n="password">New Password (leave blank to keep current)</label>
                            <input type="password" id="profile-password" class="form-control" placeholder="new password">
                        </div>
                        <div class="form-group">
                            <label data-i18n="confirm_password">Confirm New Password</label>
                            <input type="password" id="profile-confirm-password" class="form-control" placeholder="confirm new password">
                        </div>
                        <button type="submit" class="btn btn-primary" style="width:100%;" data-i18n="btn_save">Save Changes</button>
                    </form>
                </div>
            </div>

            <!-- Task Details Modal -->
            <div class="modal-backdrop" id="task-details-modal">
                <div class="glass-panel modal-content" style="max-height:90vh; overflow-y:auto;">
                    <div class="modal-header">
                        <h3 data-i18n="task_details_title">Sanitation Task Details</h3>
                        <button class="modal-close" onclick="document.getElementById('task-details-modal').style.display='none'">&times;</button>
                    </div>
                    <div>
                        <!-- Photos before and after -->
                        <div class="grid-2 form-group">
                            <div>
                                <label data-i18n="upload_before">Photo Before</label>
                                <div style="position:relative; width:100%; height:150px; background:#000; border-radius:10px; overflow:hidden;">
                                    <img id="details-preview-before" style="width:100%; height:100%; object-fit:cover;">
                                </div>
                            </div>
                            <div>
                                <label data-i18n="upload_after">Photo After</label>
                                <div style="position:relative; width:100%; height:150px; background:#000; border-radius:10px; overflow:hidden;">
                                    <img id="details-preview-after" style="width:100%; height:100%; object-fit:cover;">
                                </div>
                            </div>
                        </div>
                        
                        <!-- Material consumption -->
                        <div class="form-group">
                            <label style="font-weight:700;" data-i18n="recorded_consumptions">Quantities Consumed</label>
                            <div id="details-consumptions-list" style="font-size:14px; background:hsla(222,47%,8%,0.4); padding:12px; border-radius:10px;"></div>
                        </div>
                        
                        <!-- Worker comments -->
                        <div class="form-group">
                            <label style="font-weight:700;" data-i18n="task_notes">Comments / Observations</label>
                            <div id="details-worker-notes" style="font-size:14px; background:hsla(222,47%,8%,0.4); padding:12px; border-radius:10px; min-height:40px;"></div>
                        </div>
                        
                        <!-- Rejection Reason -->
                        <div class="form-group" id="details-rejection-container" style="display:none;">
                            <label style="font-weight:700; color:var(--danger);" data-i18n="rejection_reason">Rejection Reason</label>
                            <div id="details-reject-reason" style="font-size:14px; background:hsla(0,100%,50%,0.1); border: 1px solid var(--danger); padding:12px; border-radius:10px; min-height:40px; color: var(--text-primary);"></div>
                        </div>

                        <div style="display:flex; justify-content:flex-end; margin-top:20px;">
                            <button type="button" class="btn btn-secondary" onclick="document.getElementById('task-details-modal').style.display='none'" data-i18n="btn_close">Close</button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Task Start Dialog Modal -->
            <div class="modal-backdrop" id="task-start-modal">
                <div class="glass-panel modal-content">
                    <div class="modal-header">
                        <h3 data-i18n="start_work_title">Start Sanitation Work</h3>
                        <button class="modal-close" onclick="App.closeTaskStartModal()">&times;</button>
                    </div>
                    <form onsubmit="App.handleSubmitTaskStart(event)">
                        <input type="hidden" id="start-task-id">
                        <div class="form-group">
                            <label data-i18n="upload_before_desc">Take or upload a photo of the area/machine BEFORE starting work</label>
                            <div class="photo-uploader-box" onclick="document.getElementById('file-before-start').click()">
                                <span style="font-size:32px;">📸</span>
                                <span style="font-size:12px;" data-i18n="upload_before">Upload Photo</span>
                                <input type="file" id="file-before-start" style="display:none;" accept="image/*" capture="environment" onchange="App.handlePhotoUpload(this, 'preview-before-start', 'data-before-start')">
                                <img id="preview-before-start" class="photo-preview-img" style="display:none;">
                                <input type="hidden" id="data-before-start">
                            </div>
                        </div>
                        <button type="submit" class="btn btn-primary" style="width:100%;" data-i18n="btn_start_confirm">Start Work & Log Photo</button>
                    </form>
                </div>
            </div>
        `;

        // Start clocks
        this.startLiveClock();

        // Show/hide menu based on permissions
        const role = this.state.currentUser.role;
        if (role === 'coordinator') {
            document.getElementById('menu-users').style.display = 'block';
            document.getElementById('menu-facility').style.display = 'block';
            document.getElementById('menu-protocols').style.display = 'block';
            document.getElementById('menu-inventory').style.display = 'block';
            document.getElementById('menu-audit').style.display = 'block';
            document.getElementById('menu-reports').style.display = 'block';
        } else if (role === 'supervisor') {
            document.getElementById('menu-facility').style.display = 'block';
            document.getElementById('menu-protocols').style.display = 'block';
            document.getElementById('menu-inventory').style.display = 'block';
            document.getElementById('menu-reports').style.display = 'block';
        } else if (role === 'worker') {
            document.getElementById('menu-dashboard').style.display = 'none';
        }

        // Set language
        i18n.setLanguage(i18n.currentLang);

        // Display dashboard or tasks depending on role (only on first login)
        if (resetView) {
            if (role === 'worker') {
                this.switchView('tasks');
            } else {
                this.switchView('dashboard');
            }
        }

        // Re-setup global event list because DOM was replaced
        this.setupGlobalEventListeners();
    },

    startLiveClock() {
        const updateClock = () => {
            const clockEl = document.getElementById('live-clock');
            if (clockEl) {
                const now = new Date();
                clockEl.textContent = now.toLocaleDateString(i18n.currentLang, {
                    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                    hour: '2-digit', minute: '2-digit', second: '2-digit'
                });
            }
        };
        updateClock();
        setInterval(updateClock, 1000);
    },

    // --- Navigation Routing ---
    switchView(viewName) {
        this.state.currentView = viewName;
        // Remember last view so page reload restores position
        localStorage.setItem('sms_last_view', viewName);

        // Sidebar active link swapping
        document.querySelectorAll('.sidebar-link').forEach(link => link.classList.remove('active'));
        const activeLink = document.getElementById(`nav-${viewName}`);
        if (activeLink) activeLink.classList.add('active');

        // Set Header Title
        const titleEl = document.getElementById('view-title');
        if (titleEl) {
            titleEl.setAttribute('data-i18n', `nav_${viewName}`);
        }

        // Automatically close mobile sidebar on navigation
        this.closeSidebar();

        this.renderCurrentView();
    },

    renderCurrentView() {
        const view = this.state.currentView;
        if (view === 'dashboard') this.renderDashboardView();
        else if (view === 'users') this.renderUsersView();
        else if (view === 'facility') this.renderFacilityView();
        else if (view === 'protocols') this.renderProtocolsView();
        else if (view === 'inventory') this.renderInventoryView();
        else if (view === 'tasks') this.renderTasksView();
        else if (view === 'audit') this.renderAuditView();
        else if (view === 'reports') this.renderReportsView();

        i18n.translateDOM();
    },

    // ==========================================
    // VIEW RENDERERS
    // ==========================================

    // --- 1. Dashboard View ---
    async renderDashboardView() {
        const container = document.getElementById('view-content');
        container.innerHTML = `
            <div style="display:flex; justify-content:center; align-items:center; min-height:200px;">
                <div class="timer-badge">Loading Dashboard Content...</div>
            </div>
        `;

        try {
            const role = this.state.currentUser.role;

            // Fetch stats if supervisor or coordinator
            if (role === 'coordinator' || role === 'supervisor') {
                const [stats, tasks] = await Promise.all([
                    API.getReports(),
                    API.getTasks()
                ]);

                let approvalRequestsHTML = '';
                if (role === 'coordinator') {
                    // Fetch users to display supervisors pending approval & password reset requests
                    const users = await API.getUsers();
                    const pendingUsers = users.filter(u => !u.is_approved);
                    if (pendingUsers.length > 0) {
                        approvalRequestsHTML += `
                            <div class="glass-panel mb-24">
                                <h3 data-i18n="user_approval_title" style="margin-bottom:16px;">Pending Supervisor Approvals</h3>
                                <div class="table-container">
                                    <table id="pending-approvals-table">
                                        <thead>
                                            <tr>
                                                <th data-i18n="name_label">Name</th>
                                                <th data-i18n="username">Username</th>
                                                <th data-i18n="action">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            ${pendingUsers.map(u => `
                                                <tr>
                                                    <td>${this.escapeHTML(u.name)}</td>
                                                    <td>${this.escapeHTML(u.username)}</td>
                                                    <td>
                                                        <div class="flex-gap-12">
                                                            <button class="btn btn-success" style="padding:6px 12px; font-size:12px;" onclick="App.approveSupervisorAccess(${u.id}, true)" data-i18n="btn_approve_user">Approve</button>
                                                            <button class="btn btn-danger" style="padding:6px 12px; font-size:12px;" onclick="App.approveSupervisorAccess(${u.id}, false)" data-i18n="btn_reject_user">Reject</button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            `).join('')}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        `;
                    }

                    const pendingResets = users.filter(u => u.reset_requested === 1);
                    if (pendingResets.length > 0) {
                        approvalRequestsHTML += `
                            <div class="glass-panel mb-24">
                                <h3 data-i18n="pending_resets_title" style="margin-bottom:16px;">Pending Password/PIN Reset Requests</h3>
                                <div class="table-container">
                                    <table id="pending-resets-table">
                                        <thead>
                                            <tr>
                                                <th data-i18n="name_label">Name</th>
                                                <th data-i18n="username">Username</th>
                                                <th data-i18n="action">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            ${pendingResets.map(u => `
                                                <tr>
                                                     <td>
                                                         <div class="flex-gap-12">
                                                             ${this.renderAvatar(u, 'avatar-sm')}
                                                             <div style="display:flex; flex-direction:column;">
                                                                 <div style="font-weight:600;">${this.escapeHTML(u.name)}</div>
                                                                 <div style="font-size:12px; color:var(--text-secondary);"><span class="user-role-${this.escapeHTML(u.role)}">${i18n.t(u.role)}</span></div>
                                                             </div>
                                                         </div>
                                                     </td>
                                                     <td>@${this.escapeHTML(u.username)}</td>
                                                     <td>
                                                         <button class="btn btn-secondary" style="padding:6px 12px; font-size:12px;" onclick="App.generateResetCodeFromRequest(${u.id})" data-i18n="btn_generate_reset">Reset Code</button>
                                                     </td>
                                                </tr>
                                            `).join('')}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        `;
                    }
                }

                // Filter waiting and operating tasks
                const waitingTasks = tasks.filter(t => t.status === 'assigned' || t.status === 'accepted');
                const operatingTasks = tasks.filter(t => t.status === 'in_progress' || t.status === 'pending_validation' || t.status === 'rejected');

                // Tasks Waiting to Start HTML
                let waitingTasksHTML = `
                    <div class="glass-panel mb-24">
                        <h3 data-i18n="tasks_waiting_start" style="margin-bottom:16px;">Tasks Waiting to Start</h3>
                        <div class="table-container">
                            <table id="waiting-tasks-table">
                                <thead>
                                    <tr>
                                        <th data-i18n="select_protocol">Protocol</th>
                                        <th data-i18n="select_machine">Area/Machine</th>
                                        <th data-i18n="assignee">Worker</th>
                                        <th data-i18n="status">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                `;
                if (waitingTasks.length === 0) {
                    waitingTasksHTML += `
                                    <tr>
                                        <td colspan="4" style="text-align:center; color:var(--text-secondary);" data-i18n="no_waiting_tasks">No tasks waiting to start.</td>
                                    </tr>
                    `;
                } else {
                    waitingTasksHTML += waitingTasks.map(t => `
                                    <tr>
                                        <td style="font-weight:600;">${this.escapeHTML(t.protocol_name)}</td>
                                        <td>${this.escapeHTML(t.node_name)}</td>
                                        <td>${this.escapeHTML(t.worker_name || '')}</td>
                                        <td><span class="status-badge badge-${t.status}">${i18n.t(`task_status_${t.status}`)}</span></td>
                                    </tr>
                    `).join('');
                }
                waitingTasksHTML += `
                                </tbody>
                            </table>
                        </div>
                    </div>
                `;

                // Tasks in Progress HTML
                let operatingTasksHTML = `
                    <div class="glass-panel mb-24">
                        <h3 data-i18n="tasks_operating" style="margin-bottom:16px;">Tasks in Progress</h3>
                        <div class="table-container">
                            <table id="operating-tasks-table">
                                <thead>
                                    <tr>
                                        <th data-i18n="select_protocol">Protocol</th>
                                        <th data-i18n="select_machine">Area/Machine</th>
                                        <th data-i18n="assignee">Worker</th>
                                        <th data-i18n="status">Status</th>
                                        <th data-i18n="task_timer">Duration</th>
                                    </tr>
                                </thead>
                                <tbody>
                `;
                if (operatingTasks.length === 0) {
                    operatingTasksHTML += `
                                    <tr>
                                        <td colspan="5" style="text-align:center; color:var(--text-secondary);" data-i18n="no_operating_tasks">No tasks currently operating.</td>
                                    </tr>
                    `;
                } else {
                    operatingTasksHTML += operatingTasks.map(t => {
                        let elapsedMins = 0;
                        if (t.end_time && t.start_time) {
                            elapsedMins = Math.floor((new Date(t.end_time) - new Date(t.start_time)) / 60000);
                        } else if (t.start_time) {
                            elapsedMins = Math.floor((new Date() - new Date(t.start_time)) / 60000);
                        }
                        const displayElapsed = elapsedMins >= 0 ? `${elapsedMins} ${i18n.t('min_label')}` : `0 ${i18n.t('min_label')}`;
                        return `
                                    <tr>
                                        <td style="font-weight:600;">${this.escapeHTML(t.protocol_name)}</td>
                                        <td>${this.escapeHTML(t.node_name)}</td>
                                        <td>${this.escapeHTML(t.worker_name || '')}</td>
                                        <td><span class="status-badge badge-${t.status}">${i18n.t(`task_status_${t.status}`)}</span></td>
                                        <td>
                                            <span class="timer-badge timer-badge-green" style="font-size:12px; padding:4px 8px;">
                                                ⏱️ ${this.escapeHTML(displayElapsed)}
                                            </span>
                                        </td>
                                    </tr>
                        `;
                    }).join('');
                }
                operatingTasksHTML += `
                                </tbody>
                            </table>
                        </div>
                    </div>
                `;

                // Filter low stock items
                const lowStockItems = stats.inventory.filter(item => item.stock <= item.min_stock);

                let stockAlertsHTML = '';
                if (lowStockItems.length > 0) {
                    stockAlertsHTML = `
                        <div class="glass-panel" style="border: 1px solid var(--danger); background: hsla(355, 85%, 58%, 0.05);">
                            <div style="display:flex; align-items:center; gap:12px; margin-bottom:16px;">
                                <span style="font-size:24px;">⚠️</span>
                                <h3 style="color:var(--danger); margin:0;" data-i18n="alert_low_stock">Low Stock Alerts</h3>
                            </div>
                            <div class="table-container">
                                <table>
                                    <thead>
                                        <tr>
                                            <th data-i18n="name_label">Product Name</th>
                                            <th data-i18n="category">Category</th>
                                            <th data-i18n="stock">Current Stock</th>
                                            <th data-i18n="min_stock">Threshold Alert</th>
                                            <th data-i18n="unit">Unit</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${lowStockItems.map(item => `
                                            <tr style="background: hsla(355, 85%, 58%, 0.08);">
                                                <td style="font-weight:700; color:var(--danger);">${this.escapeHTML(item.name)}</td>
                                                <td>${i18n.t(item.category)}</td>
                                                <td class="text-danger" style="font-weight:bold;">${item.stock}</td>
                                                <td>${item.min_stock}</td>
                                                <td>${this.escapeHTML(item.unit)}</td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    `;
                } else {
                    stockAlertsHTML = `
                        <div class="glass-panel" style="border: 1px solid var(--success); background: hsla(145, 80%, 48%, 0.05); text-align:center; padding: 40px 24px;">
                            <div style="font-size:48px; margin-bottom:16px;">✅</div>
                            <h3 style="color:var(--success); margin-bottom:8px;" data-i18n="all_stock_normal">All Stock Levels Normal</h3>
                            <p style="color:var(--text-secondary); margin:0;" data-i18n="all_stock_normal_desc">All chemicals and consumables are above minimum alert thresholds.</p>
                        </div>
                    `;
                }

                container.innerHTML = `
                    ${approvalRequestsHTML}
                    ${operatingTasksHTML}
                    ${waitingTasksHTML}
                    ${stockAlertsHTML}
                `;
            } else if (role === 'worker') {
                // Simplified view for worker dashboard focusing on tasks
                container.innerHTML = `
                    <div class="glass-panel">
                        <h2>Welcome, ${this.state.currentUser.name}!</h2>
                        <p style="color: var(--text-secondary); margin-top:8px;">Access your operational panel below to check your assigned work schedules and log materials.</p>
                        <button class="btn btn-primary mt-24" onclick="App.switchView('tasks')" data-i18n="nav_tasks">Go to Tasks</button>
                    </div>
                `;
            } else if (role === 'validator') {
                container.innerHTML = `
                    <div class="glass-panel">
                        <h2>Welcome, Quality Validator!</h2>
                        <p style="color: var(--text-secondary); margin-top:8px;">Review, approve, and reject finished industrial sanitation operations from the factory dashboard.</p>
                        <button class="btn btn-primary mt-24" onclick="App.switchView('tasks')" data-i18n="nav_tasks">Go to Tasks</button>
                    </div>
                `;
            }
        } catch (err) {
            container.innerHTML = `<div class="glass-panel text-danger">Error loading dashboard: ${err.message}</div>`;
        }
        i18n.translateDOM();
    },

    async approveSupervisorAccess(userId, approve) {
        try {
            await API.approveUser(userId, approve);
            this.showToast(approve ? "Supervisor approved" : "Registration discarded");
            this.renderDashboardView();
        } catch (err) {
            this.showToast(err.message, 'error');
        }
    },

    renderBarChart(elementId, dataset) {
        const container = document.getElementById(elementId);
        if (!container) return;

        if (!dataset || dataset.length === 0) {
            container.innerHTML = `<div style="width: 100%; display: flex; align-items: center; justify-content: center; color: var(--text-muted); font-size: 13px; min-height: 150px;" data-i18n="no_data">No data available</div>`;
            if (window.i18n) window.i18n.translateDOM();
            return;
        }

        const maxValue = Math.max(...dataset.map(d => d.value), 1);

        // Render 3 horizontal gridlines with labels
        const gridlinesHTML = [0.25, 0.5, 0.75].map(ratio => {
            const heightPercent = ratio * 85;
            const gridValue = (ratio * maxValue).toFixed(1).replace(/\.0$/, '');
            return `
                <div style="position: absolute; left: 0; right: 0; bottom: ${heightPercent}%; border-top: 1px dashed hsla(222, 47%, 25%, 0.4); pointer-events: none; z-index: 1;">
                    <span style="position: absolute; left: 6px; bottom: 2px; font-size: 10px; color: var(--text-muted); font-family: monospace; font-weight: 600;">${gridValue}</span>
                </div>
            `;
        }).join('');

        const barsHTML = dataset.map(d => {
            const heightPercent = (d.value / maxValue) * 85;

            // Add a visual metric marker suffix to value if duration
            let suffix = '';
            if (elementId.includes('perf') && !elementId.includes('supervisor')) {
                suffix = ` ${i18n.t('min_label')}`;
            } else if (elementId.includes('machine')) {
                suffix = ` ${i18n.t('min_label')}`;
            }
            const displayValue = `${d.value}${suffix}`;

            return `
                <div class="chart-bar-wrapper" style="z-index: 2;">
                    <div class="chart-bar" style="height: ${heightPercent}%;" data-value="${this.escapeHTML(displayValue)}"></div>
                    <div class="chart-label" title="${this.escapeHTML(d.label)}">${this.escapeHTML(d.label)}</div>
                </div>
            `;
        }).join('');

        container.innerHTML = gridlinesHTML + barsHTML;
    },

    // --- 2. Users View (Coordinator Only) ---
    async renderUsersView() {
        const container = document.getElementById('view-content');
        container.innerHTML = `
            <div class="glass-panel">
                <!-- Header row with title and + button -->
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px;">
                    <h3 data-i18n="nav_users">Active User Accounts</h3>
                    <button
                        id="toggle-add-user-btn"
                        onclick="App.toggleAddUserPanel()"
                        class="btn btn-primary"
                        style="width:36px; height:36px; padding:0; font-size:22px; line-height:1; border-radius:50%; display:flex; align-items:center; justify-content:center; flex-shrink:0;"
                        title="Add New User"
                    >+</button>
                </div>

                <!-- Collapsible Add User Form -->
                <div id="add-user-panel" style="display:none; margin-bottom:24px; padding:20px; background:hsla(222,47%,8%,0.4); border-radius:12px; border:1px solid var(--border-color);">
                    <h4 data-i18n="btn_add" style="margin-bottom:16px;">Create User Account</h4>
                    <form onsubmit="App.handleCreateUser(event)">
                        <div class="form-group">
                            <label data-i18n="name_label">Full Name</label>
                            <input type="text" id="user-name" class="form-control" required>
                        </div>
                        <div class="form-group">
                            <label data-i18n="username">Username</label>
                            <input type="text" id="user-username" class="form-control" required>
                        </div>
                        <div class="form-group">
                            <label data-i18n="password">Password</label>
                            <input type="password" id="user-password" class="form-control" required>
                        </div>
                        <div class="form-group">
                            <label data-i18n="type">User Role</label>
                            <select id="user-role" class="form-control" required>
                                <option value="coordinator" data-i18n="coordinator">Sanitation Coordinator</option>
                                <option value="supervisor" data-i18n="supervisor">Sanitation Supervisor</option>
                                <option value="worker" data-i18n="worker">Sanitation Worker</option>
                                <option value="validator" data-i18n="validator">Maintenance Representative</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label data-i18n="personal_code">Personal PIN (4 digits for Workers)</label>
                            <input type="text" id="user-code" class="form-control" placeholder="Optional code">
                        </div>
                        <div style="display:flex; gap:12px;">
                            <button type="submit" class="btn btn-primary" style="flex:1;" data-i18n="btn_add">Add User</button>
                            <button type="button" class="btn btn-secondary" style="flex:0 0 auto;" onclick="App.toggleAddUserPanel()">Cancel</button>
                        </div>
                    </form>
                </div>

                <!-- Users Table -->
                <div class="table-container">
                    <table id="users-table">
                        <thead>
                            <tr>
                                <th data-i18n="name_label">Name</th>
                                <th data-i18n="type">Role</th>
                                <th data-i18n="status">Status</th>
                                <th data-i18n="action">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr><td colspan="4">Loading...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Edit User Modal -->
            <div class="modal-backdrop" id="edit-user-modal">
                <div class="glass-panel modal-content">
                    <div class="modal-header">
                        <h3>Edit User Account</h3>
                        <button class="modal-close" onclick="document.getElementById('edit-user-modal').style.display='none'">&times;</button>
                    </div>
                    <form onsubmit="App.handleUpdateUser(event)">
                        <input type="hidden" id="edit-user-id">
                        <div class="form-group">
                            <label data-i18n="name_label">Name</label>
                            <input type="text" id="edit-user-name" class="form-control" required>
                        </div>
                        <div class="form-group">
                            <label data-i18n="username">Username</label>
                            <input type="text" id="edit-user-username" class="form-control" readonly>
                        </div>
                        <div class="form-group">
                            <label data-i18n="password">New Password (leave blank to keep current)</label>
                            <input type="password" id="edit-user-password" class="form-control" placeholder="new password">
                        </div>
                        <div class="form-group">
                            <label data-i18n="type">User Role</label>
                            <select id="edit-user-role" class="form-control" required>
                                <option value="coordinator" data-i18n="coordinator">Sanitation Coordinator</option>
                                <option value="supervisor" data-i18n="supervisor">Sanitation Supervisor</option>
                                <option value="worker" data-i18n="worker">Sanitation Worker</option>
                                <option value="validator" data-i18n="validator">Maintenance Representative</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label data-i18n="personal_code">Personal PIN (4 digits for Workers)</label>
                            <input type="text" id="edit-user-code" class="form-control" placeholder="Optional PIN code">
                        </div>
                        <div class="form-group">
                            <label data-i18n="profile_image">Profile Picture</label>
                            <div style="display:flex; gap:16px; align-items:center;">
                                <div id="edit-user-avatar-container"></div>
                                <div class="photo-uploader-box" style="flex:1; min-height:80px; padding:12px;" onclick="document.getElementById('edit-user-file').click()">
                                    <span style="font-size:12px;" data-i18n="change_profile_img">Change Photo</span>
                                    <input type="file" id="edit-user-file" style="display:none;" accept="image/*" onchange="App.handleUserPhotoUpload(this, 'edit-user-avatar-container', 'edit-user-photo-data')">
                                    <input type="hidden" id="edit-user-photo-data">
                                </div>
                            </div>
                        </div>
                        <button type="submit" class="btn btn-primary" style="width:100%;" data-i18n="btn_save">Save Changes</button>
                    </form>
                </div>
            </div>
        `;

        try {
            const users = await API.getUsers();
            this.state.users = users;
            const tbody = document.querySelector('#users-table tbody');
            tbody.innerHTML = users.map(u => `
                <tr>
                    <td>
                        <div class="flex-gap-12">
                            ${this.renderAvatar(u, 'avatar-sm')}
                            <div style="display:flex; flex-direction:column;">
                                <div style="font-weight:600;">${u.name}</div>
                                <div style="font-size:12px; color:var(--text-secondary);">@${u.username} ${u.personal_code ? `(PIN: ${u.personal_code})` : ''}</div>
                            </div>
                        </div>
                    </td>
                    <td><span class="user-role-${u.role}">${i18n.t(u.role)}</span></td>
                    <td><span class="status-badge badge-${u.is_active ? 'active' : 'inactive'}">${u.is_active ? i18n.t('active') : i18n.t('inactive')}</span></td>
                    <td>
                        <div style="display:flex; gap:8px;">
                            <button class="btn btn-secondary" style="padding:6px 12px; font-size:12px;" onclick="App.openEditUserModal(${u.id})" data-i18n="btn_edit">Edit</button>
                            ${u.is_active && u.username !== 'admin' ? `
                                <button class="btn btn-danger" style="padding:6px 12px; font-size:12px;" onclick="App.deactivateUserAccount(${u.id})" data-i18n="btn_delete">Deactivate</button>
                            ` : ''}
                            ${u.is_active ? `
                                <button class="btn btn-secondary" style="padding:6px 12px; font-size:12px;" onclick="App.generateResetCode(${u.id})" data-i18n="btn_generate_reset">Reset Code</button>
                            ` : ''}
                        </div>
                    </td>
                </tr>
            `).join('');
        } catch (err) {
            this.showToast(err.message, 'error');
        }
        i18n.translateDOM();
    },

    toggleAddUserPanel() {
        const panel = document.getElementById('add-user-panel');
        const btn = document.getElementById('toggle-add-user-btn');
        if (!panel) return;
        const isOpen = panel.style.display !== 'none';
        panel.style.display = isOpen ? 'none' : 'block';
        if (btn) btn.textContent = isOpen ? '+' : '×';
        // Auto-focus first input when opening
        if (!isOpen) {
            setTimeout(() => {
                const firstInput = panel.querySelector('input');
                if (firstInput) firstInput.focus();
            }, 50);
        }
    },

    toggleAddFacilityPanel() {
        const panel = document.getElementById('add-facility-panel');
        const btn = document.getElementById('toggle-add-facility-btn');
        if (!panel) return;
        const isOpen = panel.style.display !== 'none';
        panel.style.display = isOpen ? 'none' : 'block';
        if (btn) btn.textContent = isOpen ? '+' : '×';
        if (!isOpen) {
            setTimeout(() => {
                const firstInput = panel.querySelector('input, select');
                if (firstInput) firstInput.focus();
            }, 50);
        }
    },

    toggleAddProtocolPanel() {
        const panel = document.getElementById('add-protocol-panel');
        const btn = document.getElementById('toggle-add-protocol-btn');
        if (!panel) return;
        const isOpen = panel.style.display !== 'none';
        panel.style.display = isOpen ? 'none' : 'block';
        if (btn) btn.textContent = isOpen ? '+' : '×';
        if (!isOpen) {
            setTimeout(() => {
                const firstInput = panel.querySelector('input, select');
                if (firstInput) firstInput.focus();
            }, 50);
        }
    },

    toggleAddInventoryPanel() {
        const panel = document.getElementById('add-inventory-panel');
        const btn = document.getElementById('toggle-add-inventory-btn');
        if (!panel) return;
        const isOpen = panel.style.display !== 'none';
        panel.style.display = isOpen ? 'none' : 'block';
        if (btn) btn.textContent = isOpen ? '+' : '×';
        if (!isOpen) {
            setTimeout(() => {
                const firstInput = panel.querySelector('input, select');
                if (firstInput) firstInput.focus();
            }, 50);
        }
    },

    toggleAddTaskPanel() {
        const panel = document.getElementById('add-task-panel');
        const btn = document.getElementById('toggle-add-task-btn');
        if (!panel) return;
        const isOpen = panel.style.display !== 'none';
        panel.style.display = isOpen ? 'none' : 'block';
        if (btn) btn.textContent = isOpen ? '+' : '×';
        if (!isOpen) {
            setTimeout(() => {
                const firstInput = panel.querySelector('input, select');
                if (firstInput) firstInput.focus();
            }, 50);
        }
    },

    handleTaskFacilityChange() {
        const facilitySelect = document.getElementById('task-facility');
        const nodeSelect = document.getElementById('task-node');
        if (!facilitySelect || !nodeSelect) return;
        
        const facilityId = parseInt(facilitySelect.value);
        const nodes = this.state.facilityNodes || [];
        
        const isDescendant = (nodeId, ancestorId) => {
            let currentId = nodeId;
            while (currentId !== null) {
                if (currentId === ancestorId) return true;
                const current = nodes.find(n => n.id === currentId);
                if (!current) break;
                currentId = current.parent_id;
            }
            return false;
        };
        
        const leafNodes = nodes.filter(n => 
            (n.type === 'machine' || n.type === 'line' || n.type === 'production_line') && 
            isDescendant(n.id, facilityId)
        );
        
        nodeSelect.innerHTML = leafNodes.map(n => `<option value="${n.id}">${n.name} (${i18n.t(n.type)})</option>`).join('');
    },

    handleEditTaskFacilityChange() {
        const facilitySelect = document.getElementById('edit-task-facility');
        const nodeSelect = document.getElementById('edit-task-node');
        if (!facilitySelect || !nodeSelect) return;
        
        const facilityId = parseInt(facilitySelect.value);
        const nodes = this.state.facilityNodes || [];
        
        const isDescendant = (nodeId, ancestorId) => {
            let currentId = nodeId;
            while (currentId !== null) {
                if (currentId === ancestorId) return true;
                const current = nodes.find(n => n.id === currentId);
                if (!current) break;
                currentId = current.parent_id;
            }
            return false;
        };
        
        const leafNodes = nodes.filter(n => 
            (n.type === 'machine' || n.type === 'line' || n.type === 'production_line') && 
            isDescendant(n.id, facilityId)
        );
        
        nodeSelect.innerHTML = leafNodes.map(n => `<option value="${n.id}">${n.name} (${i18n.t(n.type)})</option>`).join('');
    },

    async handleCreateUser(e) {
        e.preventDefault();
        const name = document.getElementById('user-name').value;
        const username = document.getElementById('user-username').value;
        const password = document.getElementById('user-password').value;
        const role = document.getElementById('user-role').value;
        const personal_code = document.getElementById('user-code').value;

        try {
            await API.createUser({ name, username, password, role, personal_code });
            this.showToast("User account created successfully");
            this.renderUsersView();
        } catch (err) {
            this.showToast(err.message, 'error');
        }
    },

    openEditUserModal(userId) {
        const user = this.state.users.find(u => u.id === userId);
        if (!user) return;

        document.getElementById('edit-user-id').value = user.id;
        document.getElementById('edit-user-name').value = user.name;
        document.getElementById('edit-user-username').value = user.username;
        document.getElementById('edit-user-password').value = '';
        document.getElementById('edit-user-role').value = user.role;
        document.getElementById('edit-user-code').value = user.personal_code || '';
        document.getElementById('edit-user-photo-data').value = '';
        document.getElementById('edit-user-avatar-container').innerHTML = this.renderAvatar(user, 'avatar-lg');

        document.getElementById('edit-user-modal').style.display = 'flex';
        i18n.translateDOM();
    },

    async handleUpdateUser(e) {
        e.preventDefault();
        const id = document.getElementById('edit-user-id').value;
        const name = document.getElementById('edit-user-name').value;
        const password = document.getElementById('edit-user-password').value;
        const role = document.getElementById('edit-user-role').value;
        const personal_code = document.getElementById('edit-user-code').value;
        const profile_image = document.getElementById('edit-user-photo-data').value;

        const payload = { name, role, personal_code };
        if (password) {
            payload.password = password;
        }
        if (profile_image) {
            payload.profile_image = profile_image;
        }

        try {
            await API.updateUser(id, payload);
            this.showToast("User account updated successfully");
            document.getElementById('edit-user-modal').style.display = 'none';
            this.renderUsersView();
        } catch (err) {
            this.showToast(err.message, 'error');
        }
    },

    async deactivateUserAccount(userId) {
        if (!confirm("Are you sure you want to deactivate this user account?")) return;
        try {
            await API.deleteUser(userId);
            this.showToast("User account deactivated");
            this.renderUsersView();
        } catch (err) {
            this.showToast(err.message, 'error');
        }
    },

    async generateResetCode(userId) {
        try {
            const res = await API.generateResetCode(userId);

            let modal = document.getElementById('reset-code-popup-modal');
            if (!modal) {
                modal = document.createElement('div');
                modal.id = 'reset-code-popup-modal';
                modal.className = 'modal-backdrop';
                document.body.appendChild(modal);
            }

            modal.innerHTML = `
                <div class="glass-panel modal-content" style="max-width: 400px; text-align: center; padding: 24px;">
                    <h3 data-i18n="reset_code_popup_title">Reset Code Generated</h3>
                    <p style="margin-top: 16px; color: var(--text-secondary);" data-i18n="reset_code_popup_body">
                        Please share this recovery reset code with the user (expires in 24 hours):
                    </p>
                    <div style="font-size: 36px; font-weight: bold; letter-spacing: 4px; color: var(--primary-color); margin: 24px 0; background: rgba(255,255,255,0.05); padding: 12px; border-radius: 8px; border: 1px dashed var(--primary-color);">
                        ${res.reset_code}
                    </div>
                    <button class="btn btn-primary" style="width: 100%;" onclick="document.getElementById('reset-code-popup-modal').style.display='none'">OK</button>
                </div>
            `;
            modal.style.display = 'flex';
            i18n.translateDOM();
        } catch (err) {
            this.showToast(err.message, 'error');
        }
    },

    async generateResetCodeFromRequest(userId) {
        await this.generateResetCode(userId);
        this.renderDashboardView();
    },

    // --- 3. Facility Hierarchy View ---
    async renderFacilityView() {
        const container = document.getElementById('view-content');
        const role = this.state.currentUser.role;

        let formHTML = '';
        let toggleButtonHTML = '';
        if (role === 'coordinator') {
            toggleButtonHTML = `
                <button
                    id="toggle-add-facility-btn"
                    onclick="App.toggleAddFacilityPanel()"
                    class="btn btn-primary"
                    style="width:36px; height:36px; padding:0; font-size:22px; line-height:1; border-radius:50%; display:flex; align-items:center; justify-content:center; flex-shrink:0;"
                    title="Add Facility Element"
                >+</button>
            `;
            formHTML = `
                <!-- Collapsible Add Facility Form -->
                <div id="add-facility-panel" style="display:none; margin-bottom:24px; padding:20px; background:hsla(222,47%,8%,0.4); border-radius:12px; border:1px solid var(--border-color);">
                    <h4 data-i18n="btn_add" style="margin-bottom:16px;">Add Facility Element</h4>
                    <form onsubmit="App.handleCreateFacilityNode(event)">
                        <div class="form-group">
                            <label data-i18n="name_label">Name</label>
                            <input type="text" id="node-name" class="form-control" required>
                        </div>
                        <div class="form-group">
                            <label data-i18n="node_type">Type</label>
                            <select id="node-type" class="form-control" required onchange="App.handleNodeTypeChange(this.value)">
                                <option value="facility" data-i18n="facility">Facility</option>
                                <option value="station" data-i18n="station">Station</option>
                                <option value="area" data-i18n="area">Area</option>
                                <option value="machine" data-i18n="machine">Machine</option>
                                <option value="line" data-i18n="production_line">Production Line</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label data-i18n="parent_node">Parent Node</label>
                            <select id="node-parent" class="form-control">
                                <option value="">None (Top Facility)</option>
                            </select>
                        </div>
                        <div class="form-group" id="node-assigned-protocol-group" style="display:none;">
                            <label data-i18n="assigned_protocol">Default Sanitation Protocol</label>
                            <select id="node-protocol" class="form-control">
                                <option value="" data-i18n="no_protocol">None</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label data-i18n="description">Description</label>
                            <textarea id="node-desc" class="form-control" rows="2"></textarea>
                        </div>
                        <div style="display:flex; gap:12px;">
                            <button type="submit" class="btn btn-primary" style="flex:1;" data-i18n="btn_add">Create Node</button>
                            <button type="button" class="btn btn-secondary" style="flex:0 0 auto;" onclick="App.toggleAddFacilityPanel()" data-i18n="btn_cancel">Cancel</button>
                        </div>
                    </form>
                </div>
            `;
        }

        container.innerHTML = `
            <div class="glass-panel">
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px;">
                    <h3 data-i18n="facility_builder">Facility Structure</h3>
                    ${toggleButtonHTML}
                </div>
                
                ${formHTML}
                
                <div id="facility-tree-container" class="mt-24">
                    Loading hierarchy...
                </div>
            </div>
            
            <!-- Update Node Modal -->
            <div class="modal-backdrop" id="edit-node-modal">
                <div class="glass-panel modal-content">
                    <div class="modal-header">
                        <h3>Edit Facility Component</h3>
                        <button class="modal-close" onclick="document.getElementById('edit-node-modal').style.display='none'">&times;</button>
                    </div>
                    <form onsubmit="App.handleUpdateFacilityNode(event)">
                        <input type="hidden" id="edit-node-id">
                        <div class="form-group">
                            <label data-i18n="name_label">Name</label>
                            <input type="text" id="edit-node-name" class="form-control" required>
                        </div>
                        <div class="form-group">
                            <label data-i18n="status">Status</label>
                            <select id="edit-node-status" class="form-control">
                                <option value="active" data-i18n="active">Active</option>
                                <option value="inactive" data-i18n="inactive">Inactive</option>
                                <option value="maintenance" data-i18n="maintenance">Maintenance</option>
                            </select>
                        </div>
                        <div class="form-group" id="edit-node-protocol-group">
                            <label data-i18n="assigned_protocol">Assigned Protocol</label>
                            <select id="edit-node-protocol" class="form-control">
                                <option value="" data-i18n="no_protocol">None</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label data-i18n="description">Description</label>
                            <textarea id="edit-node-desc" class="form-control" rows="2"></textarea>
                        </div>
                        <div class="flex-between">
                            <button type="submit" class="btn btn-primary" data-i18n="btn_save">Save Changes</button>
                            ${role === 'coordinator' ? `
                                <button type="button" class="btn btn-danger" onclick="App.deleteFacilityNode()" data-i18n="btn_delete">Delete Node</button>
                            ` : ''}
                        </div>
                    </form>
                </div>
            </div>
        `;

        await this.loadFacilityDataAndRender();
        i18n.translateDOM();
    },

    handleNodeTypeChange(val) {
        const group = document.getElementById('node-assigned-protocol-group');
        // Protocols can be assigned directly to Machines and Production Lines
        if (val === 'machine' || val === 'line' || val === 'production_line') {
            group.style.display = 'block';
        } else {
            group.style.display = 'none';
        }
    },

    async loadFacilityDataAndRender() {
        try {
            const nodes = await API.getFacilityHierarchy();
            const protocols = await API.getProtocols();
            this.state.facilityNodes = nodes;
            this.state.protocols = protocols;

            // Populate parent selects
            const parentSelect = document.getElementById('node-parent');
            if (parentSelect) {
                parentSelect.innerHTML = '<option value="">None (Top Facility)</option>' +
                    nodes.map(n => `<option value="${n.id}">${n.name} (${i18n.t(n.type)})</option>`).join('');
            }

            const protoSelect = document.getElementById('node-protocol');
            if (protoSelect) {
                protoSelect.innerHTML = `<option value="" data-i18n="no_protocol">None</option>` +
                    protocols.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
            }

            const editProtoSelect = document.getElementById('edit-node-protocol');
            if (editProtoSelect) {
                editProtoSelect.innerHTML = `<option value="" data-i18n="no_protocol">None</option>` +
                    protocols.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
            }

            // Build tree
            const container = document.getElementById('facility-tree-container');
            container.innerHTML = this.buildHTMLTree(nodes, null);
        } catch (err) {
            this.showToast(err.message, 'error');
        }
    },

    buildHTMLTree(nodes, parentId) {
        const children = nodes.filter(n => n.parent_id === parentId);
        if (children.length === 0) return '';

        return `
            <ul class="hierarchy-tree">
                ${children.map(c => `
                    <li class="tree-node">
                        <div class="node-item" onclick="App.openEditNodeModal(${c.id})">
                            <span class="node-type-badge type-${c.type}">${i18n.t(c.type)}</span>
                            <span style="font-weight:600;">${c.name}</span>
                            <span class="status-badge badge-${c.status}">${i18n.t(c.status)}</span>
                        </div>
                        ${this.buildHTMLTree(nodes, c.id)}
                    </li>
                `).join('')}
            </ul>
        `;
    },

    openEditNodeModal(nodeId) {
        const node = this.state.facilityNodes.find(n => n.id === nodeId);
        if (!node) return;

        document.getElementById('edit-node-id').value = node.id;
        document.getElementById('edit-node-name').value = node.name;
        document.getElementById('edit-node-status').value = node.status;
        document.getElementById('edit-node-desc').value = node.description || '';

        const protoSelectGroup = document.getElementById('edit-node-protocol-group');
        if (node.type === 'machine' || node.type === 'line' || node.type === 'production_line') {
            protoSelectGroup.style.display = 'block';
            document.getElementById('edit-node-protocol').value = node.assigned_protocol_id || '';
        } else {
            protoSelectGroup.style.display = 'none';
        }

        document.getElementById('edit-node-modal').style.display = 'flex';
        i18n.translateDOM();
    },

    async handleCreateFacilityNode(e) {
        e.preventDefault();
        const name = document.getElementById('node-name').value;
        const type = document.getElementById('node-type').value;
        const parent_id = document.getElementById('node-parent').value;
        const assigned_protocol_id = document.getElementById('node-protocol').value;
        const description = document.getElementById('node-desc').value;

        try {
            await API.createFacilityNode({ name, type, parent_id, assigned_protocol_id, description });
            this.showToast(i18n.t('add_node_success'));
            document.getElementById('node-name').value = '';
            document.getElementById('node-desc').value = '';
            this.toggleAddFacilityPanel();
            this.loadFacilityDataAndRender();
        } catch (err) {
            this.showToast(err.message, 'error');
        }
    },

    async handleUpdateFacilityNode(e) {
        e.preventDefault();
        const id = document.getElementById('edit-node-id').value;
        const name = document.getElementById('edit-node-name').value;
        const status = document.getElementById('edit-node-status').value;
        const assigned_protocol_id = document.getElementById('edit-node-protocol').value;
        const description = document.getElementById('edit-node-desc').value;

        try {
            await API.updateFacilityNode(id, { name, status, assigned_protocol_id, description });
            this.showToast("Facility component updated");
            document.getElementById('edit-node-modal').style.display = 'none';
            this.loadFacilityDataAndRender();
        } catch (err) {
            this.showToast(err.message, 'error');
        }
    },

    async deleteFacilityNode() {
        const id = document.getElementById('edit-node-id').value;
        if (!confirm(i18n.t('delete_node_confirm'))) return;

        try {
            await API.deleteFacilityNode(id);
            this.showToast("Facility component deleted");
            document.getElementById('edit-node-modal').style.display = 'none';
            this.loadFacilityDataAndRender();
        } catch (err) {
            this.showToast(err.message, 'error');
        }
    },

    // --- 4. Sanitation Protocols View ---
    async renderProtocolsView() {
        const container = document.getElementById('view-content');
        container.innerHTML = `
            <div class="glass-panel">
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px;">
                    <h3 data-i18n="protocol_title">Available Protocols</h3>
                    <button
                        id="toggle-add-protocol-btn"
                        onclick="App.toggleAddProtocolPanel()"
                        class="btn btn-primary"
                        style="width:36px; height:36px; padding:0; font-size:22px; line-height:1; border-radius:50%; display:flex; align-items:center; justify-content:center; flex-shrink:0;"
                        title="Add New Protocol"
                    >+</button>
                </div>

                <!-- Collapsible Add Protocol Form -->
                <div id="add-protocol-panel" style="display:none; margin-bottom:24px; padding:20px; background:hsla(222,47%,8%,0.4); border-radius:12px; border:1px solid var(--border-color);">
                    <h4 id="protocol-form-title" data-i18n="btn_add" style="margin-bottom:16px;">Create Protocol Template</h4>
                    <form onsubmit="App.handleCreateProtocol(event)" id="protocol-form">
                        <input type="hidden" id="proto-id">
                        <div class="form-group">
                            <label data-i18n="name_label">Name</label>
                            <input type="text" id="proto-name" class="form-control" required>
                        </div>
                        <div class="form-group">
                            <label data-i18n="estimated_duration">Estimated Duration</label>
                            <input type="number" id="proto-duration" class="form-control" required>
                        </div>
                        <div class="form-group">
                            <label data-i18n="description">Description</label>
                            <textarea id="proto-desc" class="form-control" rows="2"></textarea>
                        </div>
                        
                        <div class="form-group">
                            <div class="flex-between">
                                <label data-i18n="steps">Execution Steps</label>
                                <button type="button" class="btn btn-secondary" style="padding:4px 8px; font-size:12px;" onclick="App.addProtocolStepInput()" data-i18n="add_step">+ Add Step</button>
                            </div>
                            <div id="protocol-steps-container" style="margin-top:8px; display:flex; flex-direction:column; gap:8px;">
                                <input type="text" class="form-control proto-step-input" required placeholder="Step 1">
                            </div>
                        </div>
                        
                        <div class="form-group">
                            <label data-i18n="required_items">Required Consumables/Chemicals</label>
                            <div id="protocol-reqs-container" style="display:flex; flex-direction:column; gap:8px; margin-top:8px;">
                                <!-- Will be loaded dynamically -->
                            </div>
                            <button type="button" class="btn btn-secondary mt-12" style="padding:4px 8px; font-size:12px;" onclick="App.addProtocolReqInput()">+ Add Requirement</button>
                        </div>
                        
                        <div style="display:flex; gap:12px;">
                            <button type="submit" class="btn btn-primary" id="proto-submit-btn" style="flex:1;" data-i18n="btn_add">Add Protocol</button>
                            <button type="button" class="btn btn-secondary" id="proto-reset-btn" onclick="App.resetProtocolForm()" style="flex:0 0 auto;" data-i18n="btn_cancel">Cancel</button>
                        </div>
                    </form>
                </div>
                
                <div id="protocols-list-container" style="display:flex; flex-direction:column; gap:16px;">
                    Loading...
                </div>
            </div>
        `;

        await this.loadProtocolsDataAndRender();
        i18n.translateDOM();
    },

    addProtocolStepInput(val = '') {
        const container = document.getElementById('protocol-steps-container');
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'form-control proto-step-input';
        input.placeholder = `Step ${container.children.length + 1}`;
        input.required = true;
        input.value = val;
        container.appendChild(input);
    },

    async addProtocolReqInput(itemId = '', qty = '') {
        const container = document.getElementById('protocol-reqs-container');
        try {
            if (this.state.inventoryItems.length === 0) {
                this.state.inventoryItems = await API.getInventory();
            }

            const div = document.createElement('div');
            div.className = 'flex-gap-12';
            div.innerHTML = `
                <select class="form-control proto-req-item" style="flex:2;" required>
                    <option value="">-- Choose Product --</option>
                    ${this.state.inventoryItems.map(i => `<option value="${i.id}" ${i.id == itemId ? 'selected' : ''}>${i.name} (${i.unit})</option>`).join('')}
                </select>
                <input type="number" step="0.1" class="form-control proto-req-qty" style="flex:1;" placeholder="Qty" required value="${qty}">
                <button type="button" class="btn btn-danger" style="padding:10px 14px;" onclick="this.parentElement.remove()">&times;</button>
            `;
            container.appendChild(div);
        } catch (err) {
            this.showToast(err.message, 'error');
        }
    },

    async loadProtocolsDataAndRender() {
        try {
            const listContainer = document.getElementById('protocols-list-container');
            const protocols = await API.getProtocols();
            this.state.protocols = protocols;

            if (protocols.length === 0) {
                listContainer.innerHTML = 'No protocols defined.';
                return;
            }

            listContainer.innerHTML = protocols.map(p => `
                <div class="glass-panel" style="background:hsla(222, 47%, 8%, 0.4); padding:16px; position:relative;">
                    <div class="flex-between">
                        <h4 style="color:var(--info); font-size:16px; font-weight:700;">${p.name}</h4>
                        <div style="font-size:12px; color:var(--text-secondary);">⏱️ ${p.estimated_duration} mins</div>
                    </div>
                    <p style="font-size:13px; color:var(--text-secondary); margin-top:8px;">${p.description || ''}</p>
                    
                    <div style="margin-top:12px;">
                        <span style="font-size:12px; font-weight:700; color:var(--primary);" data-i18n="steps">Steps:</span>
                        <ol style="margin-left:16px; font-size:12px; color:var(--text-primary); list-style-type:decimal;">
                            ${p.steps.map(s => `<li>${s}</li>`).join('')}
                        </ol>
                    </div>
                    
                    ${p.requirements.length > 0 ? `
                        <div style="margin-top:12px;">
                            <span style="font-size:12px; font-weight:700; color:var(--success);" data-i18n="required_items">Required stock:</span>
                            <ul style="margin-left:16px; font-size:12px; color:var(--text-secondary); list-style-type:disc;">
                                ${p.requirements.map(r => `<li>${r.item_name}: <b>${r.quantity_required} ${r.unit}</b></li>`).join('')}
                            </ul>
                        </div>
                    ` : ''}
                    
                    <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:16px;">
                        <button class="btn btn-secondary" style="padding:6px 12px; font-size:12px;" onclick="App.editProtocol(${p.id})">Edit</button>
                        <button class="btn btn-danger" style="padding:6px 12px; font-size:12px;" onclick="App.deleteProtocol(${p.id})">Delete</button>
                    </div>
                </div>
            `).join('');

            i18n.translateDOM();
        } catch (err) {
            this.showToast(err.message, 'error');
        }
    },

    async handleCreateProtocol(e) {
        e.preventDefault();
        const id = document.getElementById('proto-id').value;
        const name = document.getElementById('proto-name').value;
        const estimated_duration = document.getElementById('proto-duration').value;
        const description = document.getElementById('proto-desc').value;

        const steps = Array.from(document.querySelectorAll('.proto-step-input')).map(input => input.value).filter(val => val.trim() !== '');

        const requirements = [];
        document.querySelectorAll('#protocol-reqs-container > div').forEach(div => {
            const item_id = div.querySelector('.proto-req-item').value;
            const quantity_required = div.querySelector('.proto-req-qty').value;
            if (item_id && quantity_required) {
                requirements.push({ item_id, quantity_required });
            }
        });

        try {
            if (id) {
                await API.updateProtocol(id, { name, estimated_duration, description, steps, requirements });
                this.showToast("Protocol updated successfully");
            } else {
                await API.createProtocol({ name, estimated_duration, description, steps, requirements });
                this.showToast("Protocol template added successfully");
            }
            this.resetProtocolForm();
            this.loadProtocolsDataAndRender();
        } catch (err) {
            this.showToast(err.message, 'error');
        }
    },

    editProtocol(protoId) {
        const proto = this.state.protocols.find(p => p.id === protoId);
        if (!proto) return;

        document.getElementById('proto-id').value = proto.id;
        document.getElementById('proto-name').value = proto.name;
        document.getElementById('proto-duration').value = proto.estimated_duration;
        document.getElementById('proto-desc').value = proto.description || '';

        // Load steps
        const stepsContainer = document.getElementById('protocol-steps-container');
        stepsContainer.innerHTML = '';
        proto.steps.forEach(s => this.addProtocolStepInput(s));
        if (proto.steps.length === 0) this.addProtocolStepInput();

        // Load requirements
        const reqsContainer = document.getElementById('protocol-reqs-container');
        reqsContainer.innerHTML = '';
        proto.requirements.forEach(r => this.addProtocolReqInput(r.item_id, r.quantity_required));

        // Toggle forms state
        document.getElementById('protocol-form-title').setAttribute('data-i18n', 'btn_edit');
        document.getElementById('proto-submit-btn').setAttribute('data-i18n', 'btn_save');

        // Ensure form panel is open
        const panel = document.getElementById('add-protocol-panel');
        if (panel && panel.style.display === 'none') {
            this.toggleAddProtocolPanel();
        }

        i18n.translateDOM();
    },

    resetProtocolForm() {
        document.getElementById('proto-id').value = '';
        document.getElementById('proto-name').value = '';
        document.getElementById('proto-duration').value = '';
        document.getElementById('proto-desc').value = '';

        document.getElementById('protocol-steps-container').innerHTML = '<input type="text" class="form-control proto-step-input" required placeholder="Step 1">';
        document.getElementById('protocol-reqs-container').innerHTML = '';

        document.getElementById('protocol-form-title').setAttribute('data-i18n', 'btn_add');
        document.getElementById('proto-submit-btn').setAttribute('data-i18n', 'btn_add');

        // Collapse panel
        const panel = document.getElementById('add-protocol-panel');
        if (panel) {
            panel.style.display = 'none';
            const btn = document.getElementById('toggle-add-protocol-btn');
            if (btn) btn.textContent = '+';
        }

        i18n.translateDOM();
    },

    async deleteProtocol(protoId) {
        if (!confirm("Are you sure you want to remove this protocol?")) return;
        try {
            await API.deleteProtocol(protoId);
            this.showToast("Protocol template removed");
            this.loadProtocolsDataAndRender();
        } catch (err) {
            this.showToast(err.message, 'error');
        }
    },

    // --- 5. Inventory Management View ---
    async renderInventoryView() {
        const container = document.getElementById('view-content');
        const role = this.state.currentUser.role;

        let formHTML = '';
        let toggleButtonHTML = '';
        if (role === 'coordinator' || role === 'supervisor') {
            toggleButtonHTML = `
                <button
                    id="toggle-add-inventory-btn"
                    onclick="App.toggleAddInventoryPanel()"
                    class="btn btn-primary"
                    style="width:36px; height:36px; padding:0; font-size:22px; line-height:1; border-radius:50%; display:flex; align-items:center; justify-content:center; flex-shrink:0;"
                    title="Register Material/Product"
                >+</button>
            `;
            formHTML = `
                <!-- Collapsible Add Inventory Form -->
                <div id="add-inventory-panel" style="display:none; margin-bottom:24px; padding:20px; background:hsla(222,47%,8%,0.4); border-radius:12px; border:1px solid var(--border-color);">
                    <h4 data-i18n="btn_add" style="margin-bottom:16px;">Register Material / Product</h4>
                    <form onsubmit="App.handleCreateInventoryItem(event)">
                        <div class="form-group">
                            <label data-i18n="name_label">Name</label>
                            <input type="text" id="inv-name" class="form-control" required>
                        </div>
                        <div class="form-group">
                            <label data-i18n="category">Category</label>
                            <select id="inv-category" class="form-control" required>
                                <option value="chemical" data-i18n="chemical">Chemical Product</option>
                                <option value="consumable" data-i18n="consumable">Consumable</option>
                                <option value="equipment" data-i18n="equipment">Cleaning Tool / Equipment</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label data-i18n="stock">Initial Stock</label>
                            <input type="number" step="0.1" id="inv-stock" class="form-control" required>
                        </div>
                        <div class="form-group">
                            <label data-i18n="min_stock">Min Stock Warning Level</label>
                            <input type="number" step="0.1" id="inv-min-stock" class="form-control" required>
                        </div>
                        <div class="form-group">
                            <label data-i18n="unit">Measurement Unit</label>
                            <input type="text" id="inv-unit" class="form-control" placeholder="L, kg, units, rolls" required>
                        </div>
                        <div style="display:flex; gap:12px;">
                            <button type="submit" class="btn btn-primary" style="flex:1;" data-i18n="btn_add">Register Item</button>
                            <button type="button" class="btn btn-secondary" style="flex:0 0 auto;" onclick="App.toggleAddInventoryPanel()" data-i18n="btn_cancel">Cancel</button>
                        </div>
                    </form>
                </div>
            `;
        }

        container.innerHTML = `
            <div class="glass-panel">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:24px;">
                    <div style="display:flex; align-items:center; gap:16px;">
                        <h3 data-i18n="inventory_title" style="margin:0;">Inventory Stock</h3>
                        ${toggleButtonHTML}
                    </div>
                    ${(role === 'coordinator' || role === 'supervisor') ? `
                        <div style="display:flex; gap:8px;">
                            <button class="btn btn-primary" onclick="App.exportInventoryToExcel()" data-i18n="btn_export_catalog" style="padding:6px 12px; font-size:12px;">Export Catalog</button>
                            <button class="btn btn-secondary" onclick="App.exportConsumptionsToExcel()" data-i18n="btn_export_consumptions" style="padding:6px 12px; font-size:12px;">Export Consumptions</button>
                        </div>
                    ` : ''}
                </div>
                
                ${formHTML}
                
                <div class="table-container">
                    <table id="inventory-table">
                        <thead>
                            <tr>
                                <th data-i18n="name_label">Product Name</th>
                                <th data-i18n="category">Category</th>
                                <th data-i18n="stock">Current Stock</th>
                                <th data-i18n="action">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr><td colspan="4">Loading...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
            
            <div class="glass-panel mt-24">
                <h3 data-i18n="stock_movement_logs">Stock movement history</h3>
                <div class="table-container" style="margin-top:16px;">
                    <table id="inventory-logs-table">
                        <thead>
                            <tr>
                                <th data-i18n="name_label">Product</th>
                                <th data-i18n="log_quantity">Qty</th>
                                <th data-i18n="log_user">User</th>
                                <th data-i18n="notes">Reason / Notes</th>
                                <th data-i18n="created_at">Date</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr><td colspan="5">Loading logs...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
            
            <!-- Stock Adjustment Modal -->
            <div class="modal-backdrop" id="adjust-stock-modal">
                <div class="glass-panel modal-content">
                    <div class="modal-header">
                        <h3 data-i18n="adjust_stock_title">Adjust Stock Level</h3>
                        <button class="modal-close" onclick="document.getElementById('adjust-stock-modal').style.display='none'">&times;</button>
                    </div>
                    <form onsubmit="App.handleAdjustStock(event)">
                        <input type="hidden" id="adjust-item-id">
                        <div class="form-group">
                            <label data-i18n="name_label">Item</label>
                            <input type="text" id="adjust-item-name" class="form-control" readonly>
                        </div>
                        <div class="form-group">
                            <label data-i18n="qty_change">Quantity Change</label>
                            <input type="number" step="0.1" id="adjust-item-qty" class="form-control" required placeholder="+50 or -10">
                        </div>
                        <div class="form-group">
                            <label data-i18n="notes">Reason for Adjustment</label>
                            <input type="text" id="adjust-item-notes" class="form-control" placeholder="Restocking / Cleaning spill" required>
                        </div>
                        <button type="submit" class="btn btn-primary" data-i18n="btn_confirm">Apply Adjustment</button>
                    </form>
                </div>
            </div>
        `;

        await this.loadInventoryDataAndRender();
        i18n.translateDOM();
    },

    async loadInventoryDataAndRender() {
        try {
            const tableBody = document.querySelector('#inventory-table tbody');
            const items = await API.getInventory();
            this.state.inventoryItems = items;

            const role = this.state.currentUser.role;

            tableBody.innerHTML = items.map(i => {
                const isLow = i.stock < i.min_stock;
                return `
                    <tr style="${isLow ? 'background: hsla(355, 85%, 58%, 0.15);' : ''}">
                        <td>
                            <div style="font-weight:600;">${this.escapeHTML(i.name)}</div>
                            ${isLow ? `<span class="text-danger" style="font-size:11px; font-weight:700;"><span data-i18n="alert_low_stock">Low Stock</span>: < ${i.min_stock} ${this.escapeHTML(i.unit)}</span>` : ''}
                        </td>
                        <td><span style="font-size:13px; color:var(--text-secondary);">${i18n.t(i.category)}</span></td>
                        <td><span style="font-weight:bold; font-size:16px; color:var(--text-primary);">${i.stock} ${this.escapeHTML(i.unit)}</span></td>
                        <td>
                            ${(role === 'coordinator' || role === 'supervisor') ? `
                                <div style="display:flex; gap:8px;">
                                    <button class="btn btn-secondary" style="padding:6px 12px; font-size:12px;" onclick="App.openAdjustStockModal(${i.id})">Adjust</button>
                                    <button class="btn btn-danger" style="padding:6px 12px; font-size:12px;" onclick="App.deleteInventoryItem(${i.id})">Delete</button>
                                </div>
                            ` : ''}
                        </td>
                    </tr>
                `;
            }).join('');

            // Load logs
            const logsBody = document.querySelector('#inventory-logs-table tbody');
            const logs = await API.getInventoryLogs();
            logsBody.innerHTML = logs.map(l => `
                <tr>
                    <td>${this.escapeHTML(l.item_name)}</td>
                    <td class="text-${l.quantity < 0 ? 'danger' : 'success'}" style="font-weight:600;">
                        ${l.quantity > 0 ? '+' : ''}${l.quantity} ${this.escapeHTML(l.unit)}
                    </td>
                    <td>${this.escapeHTML(l.user_name || 'System')}</td>
                    <td>${this.escapeHTML(l.notes || '')}</td>
                    <td>${this.escapeHTML(new Date(l.created_at).toLocaleString(i18n.currentLang))}</td>
                </tr>
            `).join('');

            i18n.translateDOM();
        } catch (err) {
            this.showToast(err.message, 'error');
        }
    },

    async handleCreateInventoryItem(e) {
        e.preventDefault();
        const name = document.getElementById('inv-name').value;
        const category = document.getElementById('inv-category').value;
        const stock = document.getElementById('inv-stock').value;
        const min_stock = document.getElementById('inv-min-stock').value;
        const unit = document.getElementById('inv-unit').value;

        try {
            await API.createInventoryItem({ name, category, stock, min_stock, unit });
            this.showToast("Inventory item added successfully");
            document.getElementById('inv-name').value = '';
            document.getElementById('inv-stock').value = '';
            document.getElementById('inv-min-stock').value = '';
            document.getElementById('inv-unit').value = '';
            this.toggleAddInventoryPanel();
            this.loadInventoryDataAndRender();
        } catch (err) {
            this.showToast(err.message, 'error');
        }
    },

    openAdjustStockModal(itemId) {
        const item = this.state.inventoryItems.find(i => i.id === itemId);
        if (!item) return;

        document.getElementById('adjust-item-id').value = item.id;
        document.getElementById('adjust-item-name').value = item.name;
        document.getElementById('adjust-item-qty').value = '';
        document.getElementById('adjust-item-notes').value = '';

        document.getElementById('adjust-stock-modal').style.display = 'flex';
        i18n.translateDOM();
    },

    async handleAdjustStock(e) {
        e.preventDefault();
        const id = document.getElementById('adjust-item-id').value;
        const qty = document.getElementById('adjust-item-qty').value;
        const notes = document.getElementById('adjust-item-notes').value;

        try {
            await API.adjustStock(id, qty, notes);
            this.showToast("Stock level adjusted");
            document.getElementById('adjust-stock-modal').style.display = 'none';
            this.loadInventoryDataAndRender();
        } catch (err) {
            this.showToast(err.message, 'error');
        }
    },

    async deleteInventoryItem(itemId) {
        if (!confirm("Remove this item from inventory?")) return;
        try {
            await API.deleteInventoryItem(itemId);
            this.showToast("Item deleted from inventory catalog");
            this.loadInventoryDataAndRender();
        } catch (err) {
            this.showToast(err.message, 'error');
        }
    },

    // --- 6. Tasks Workflow View ---
    async renderTasksView() {
        const container = document.getElementById('view-content');
        const role = this.state.currentUser.role;

        let formHTML = '';
        let toggleButtonHTML = '';
        if (role === 'coordinator' || role === 'supervisor') {
            toggleButtonHTML = `
                <button
                    id="toggle-add-task-btn"
                    onclick="App.toggleAddTaskPanel()"
                    class="btn btn-primary"
                    style="width:36px; height:36px; padding:0; font-size:22px; line-height:1; border-radius:50%; display:flex; align-items:center; justify-content:center; flex-shrink:0;"
                    title="Assign New Task"
                >+</button>
            `;
            formHTML = `
                <!-- Collapsible Add Task Form -->
                <div id="add-task-panel" style="display:none; margin-bottom:24px; padding:20px; background:hsla(222,47%,8%,0.4); border-radius:12px; border:1px solid var(--border-color);">
                    <h4 data-i18n="btn_assign_task" style="margin-bottom:16px;">Create & Assign Sanitation Task</h4>
                    <form onsubmit="App.handleCreateTask(event)">
                        <div class="form-group">
                            <label data-i18n="select_facility">Select Facility/Area</label>
                            <select id="task-facility" class="form-control" onchange="App.handleTaskFacilityChange()" required></select>
                        </div>
                        <div class="form-group">
                            <label data-i18n="select_machine">Select Station/Machine/Line</label>
                            <select id="task-node" class="form-control" required></select>
                        </div>
                        <div class="form-group">
                            <label data-i18n="select_protocol">Protocol</label>
                            <select id="task-protocol" class="form-control" required></select>
                        </div>
                        <div class="form-group">
                            <label data-i18n="assignee">Worker</label>
                            <select id="task-worker" class="form-control" required></select>
                        </div>
                        <div class="form-group">
                            <label>Location Image (Optional photo to guide worker)</label>
                            <div class="photo-uploader-box" onclick="document.getElementById('task-location-file').click()" style="min-height: 100px; padding: 16px;">
                                <span style="font-size:24px;">📸</span>
                                <span style="font-size:12px; color:var(--text-secondary);">Upload Location Photo</span>
                                <input type="file" id="task-location-file" style="display:none;" accept="image/*" capture="environment" onchange="App.handlePhotoUpload(this, 'task-location-preview', 'task-location-data')">
                                <img id="task-location-preview" class="photo-preview-img" style="display:none;">
                                <input type="hidden" id="task-location-data">
                            </div>
                        </div>
                        <div style="display:flex; gap:12px; margin-top:20px;">
                            <button type="submit" class="btn btn-primary" style="flex:1;" data-i18n="btn_assign_task">Assign Task</button>
                            <button type="button" class="btn btn-secondary" style="flex:0 0 auto;" onclick="App.toggleAddTaskPanel()" data-i18n="btn_cancel">Cancel</button>
                        </div>
                    </form>
                </div>
            `;
        }

        container.innerHTML = `
            <div class="glass-panel">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:24px;">
                    <div style="display:flex; align-items:center; gap:16px;">
                        <h3 data-i18n="tasks_title" style="margin:0;">Sanitation Task List</h3>
                        ${toggleButtonHTML}
                    </div>
                    ${role === 'coordinator' || role === 'supervisor' ? `
                        <button class="btn btn-secondary" onclick="App.exportTasksToExcel()" style="padding:6px 12px; font-size:12px;" data-i18n="btn_export_tasks">Export Tasks</button>
                    ` : ''}
                </div>
                
                ${formHTML}
                
                <div id="tasks-list-container" style="display:flex; flex-direction:column; gap:16px;">
                    Loading tasks...
                </div>
            </div>
            
            <!-- Complete Task Dialog Modal -->
            <div class="modal-backdrop" id="task-completion-modal">
                <div class="glass-panel modal-content" style="max-height:90vh; overflow-y:auto;">
                    <div class="modal-header">
                        <h3 data-i18n="btn_complete">Complete Task</h3>
                        <button class="modal-close" onclick="App.closeTaskCompletionModal()">&times;</button>
                    </div>
                    
                    <!-- Pulsing Timer display -->
                    <div style="display:flex; justify-content:center; margin-bottom:20px;">
                        <div class="timer-badge timer-badge-green">
                            ⏱️ <span data-i18n="task_timer">Timer</span>: <span id="modal-timer-text">00:00:00</span>
                        </div>
                    </div>
                    
                    <form onsubmit="App.handleSubmitTaskCompletion(event)">
                        <input type="hidden" id="complete-task-id">
                        
                        <!-- Protocol checklist -->
                        <div class="form-group">
                            <label style="font-weight:700;" data-i18n="steps">Required Protocol Checklist</label>
                            <div id="complete-task-steps" class="protocol-steps-list"></div>
                        </div>
                        
                        <!-- Material consumption auto-filled quantities -->
                        <div class="form-group">
                            <label style="font-weight:700;" data-i18n="recorded_consumptions">Quantities Consumed</label>
                            <div id="complete-task-consumptions" style="display:flex; flex-direction:column; gap:12px; margin-top:8px;"></div>
                        </div>

                        <!-- Additional materials used -->
                        <div class="form-group">
                            <label style="font-weight:700;" data-i18n="additional_materials">Additional Products/Chemicals Used</label>
                            <div id="additional-consumptions" style="display:flex; flex-direction:column; gap:12px; margin-top:8px;"></div>
                            <button type="button" class="btn btn-secondary" onclick="App.addConsumptionRow()" style="margin-top:8px; width:fit-content; font-size:12px; padding:6px 12px;" data-i18n="add_product_used">+ Add Product Used</button>
                        </div>
                        
                        <!-- Photos before and after -->
                        <div class="grid-2 form-group">
                            <div>
                                <label data-i18n="upload_before">Photo Before</label>
                                <div style="position:relative; width:100%; height:150px; background:#000; border-radius:10px; overflow:hidden;">
                                    <img id="completion-preview-before" style="width:100%; height:100%; object-fit:cover;">
                                </div>
                            </div>
                            <div>
                                <label data-i18n="upload_after">Photo After</label>
                                <div class="photo-uploader-box" onclick="document.getElementById('file-after').click()">
                                    <span style="font-size:32px;">📸</span>
                                    <span style="font-size:12px;" data-i18n="upload_after">Upload Photo</span>
                                    <input type="file" id="file-after" style="display:none;" accept="image/*" capture="environment" onchange="App.handlePhotoUpload(this, 'preview-after', 'data-after')">
                                    <img id="preview-after" class="photo-preview-img" style="display:none;">
                                    <input type="hidden" id="data-after">
                                </div>
                            </div>
                        </div>
                        
                        <!-- Remarks -->
                        <div class="form-group">
                            <label data-i18n="task_notes">Comments / Observations</label>
                            <textarea id="complete-task-notes" class="form-control" rows="2" placeholder="Describe operations..."></textarea>
                        </div>
                        
                        <button type="submit" class="btn btn-primary" style="width:100%;" data-i18n="btn_complete">Complete & Log Task</button>
                    </form>
                </div>
            </div>
            
            <!-- Quality Validation Modal (Validator/Maintenance Rep Review) -->
            <div class="modal-backdrop" id="task-validation-modal">
                <div class="glass-panel modal-content">
                    <div class="modal-header">
                        <h3 data-i18n="audit_validation_title">Sanitation Audit Validation</h3>
                        <button class="modal-close" onclick="document.getElementById('task-validation-modal').style.display='none'">&times;</button>
                    </div>
                    <div>
                        <input type="hidden" id="validate-task-id">
                        
                        <div class="grid-2 form-group">
                            <div>
                                <label>Photo Before Cleaning</label>
                                <div style="position:relative; width:100%; height:150px; background:#000; border-radius:10px; overflow:hidden;">
                                    <img id="validate-preview-before" style="width:100%; height:100%; object-fit:cover;">
                                </div>
                            </div>
                            <div>
                                <label>Photo After Cleaning</label>
                                <div style="position:relative; width:100%; height:150px; background:#000; border-radius:10px; overflow:hidden;">
                                    <img id="validate-preview-after" style="width:100%; height:100%; object-fit:cover;">
                                </div>
                            </div>
                        </div>
                        
                        <div class="form-group">
                            <label>Product Consumed</label>
                            <div id="validate-consumptions-list" style="font-size:14px; background:hsla(222,47%,8%,0.4); padding:12px; border-radius:10px;"></div>
                        </div>
                        
                        <div class="form-group">
                            <label>Worker Comments</label>
                            <div id="validate-worker-notes" style="font-size:14px; background:hsla(222,47%,8%,0.4); padding:12px; border-radius:10px; min-height:40px;"></div>
                        </div>
                        
                        <div class="form-group" id="rejection-reason-container" style="display:none;">
                            <label data-i18n="rejection_reason">Rejection Reason</label>
                            <textarea id="validate-reject-reason" class="form-control" rows="2" placeholder="Write details why it failed..."></textarea>
                        </div>
                        
                        <div class="flex-between">
                            <button type="button" class="btn btn-success" onclick="App.submitTaskValidationDecision(true)" data-i18n="btn_approve">Approve Task</button>
                            <button type="button" class="btn btn-danger" id="btn-show-reject" onclick="App.toggleRejectionInput()" data-i18n="btn_reject">Reject Task</button>
                            <button type="button" class="btn btn-danger" id="btn-submit-reject" style="display:none;" onclick="App.submitTaskValidationDecision(false)" data-i18n="btn_reject">Confirm Rejection</button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Edit Task Modal -->
            <div class="modal-backdrop" id="edit-task-modal">
                <div class="glass-panel modal-content" style="max-height:90vh; overflow-y:auto; max-width: 500px; width: 100%;">
                    <div class="modal-header">
                        <h3>Edit Sanitation Task</h3>
                        <button class="modal-close" onclick="App.closeEditTaskModal()">&times;</button>
                    </div>
                    <form onsubmit="App.handleSubmitEditTask(event)">
                        <input type="hidden" id="edit-task-id">
                        
                        <div class="form-group">
                            <label data-i18n="select_facility">Select Facility/Area</label>
                            <select id="edit-task-facility" class="form-control" onchange="App.handleEditTaskFacilityChange()" required></select>
                        </div>
                        <div class="form-group">
                            <label data-i18n="select_machine">Select Station/Machine/Line</label>
                            <select id="edit-task-node" class="form-control" required></select>
                        </div>
                        <div class="form-group">
                            <label data-i18n="select_protocol">Protocol</label>
                            <select id="edit-task-protocol" class="form-control" required></select>
                        </div>
                        <div class="form-group">
                            <label data-i18n="assignee">Worker</label>
                            <select id="edit-task-worker" class="form-control" required></select>
                        </div>
                        <div class="form-group">
                            <label data-i18n="status">Status</label>
                            <select id="edit-task-status" class="form-control" required>
                                <option value="assigned" data-i18n="task_status_assigned">Assigned</option>
                                <option value="accepted" data-i18n="task_status_accepted">Accepted</option>
                                <option value="in_progress" data-i18n="task_status_in_progress">In Progress</option>
                                <option value="pending_validation" data-i18n="task_status_pending_validation">Pending Validation</option>
                                <option value="completed" data-i18n="task_status_completed">Completed</option>
                                <option value="rejected" data-i18n="task_status_rejected">Rejected</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Location Image (Photo to guide worker)</label>
                            <div style="margin-bottom:8px;">
                                <img id="edit-location-preview-existing" style="max-width:150px; max-height:100px; display:none; border-radius:8px; border:1px solid var(--border-color); object-fit: cover;">
                            </div>
                            <div class="photo-uploader-box" onclick="document.getElementById('edit-task-location-file').click()" style="min-height: 100px; padding: 16px;">
                                <span style="font-size:24px;">📸</span>
                                <span style="font-size:12px; color:var(--text-secondary);">Upload New Location Photo</span>
                                <input type="file" id="edit-task-location-file" style="display:none;" accept="image/*" capture="environment" onchange="App.handlePhotoUpload(this, 'edit-location-preview', 'edit-task-location-data')">
                                <img id="edit-location-preview" class="photo-preview-img" style="display:none;">
                                <input type="hidden" id="edit-task-location-data">
                            </div>
                        </div>
                        
                        <div style="display:flex; gap:12px; margin-top:20px;">
                            <button type="submit" class="btn btn-primary" style="flex:1;">Save Changes</button>
                            <button type="button" class="btn btn-secondary" onclick="App.closeEditTaskModal()" data-i18n="btn_cancel">Cancel</button>
                        </div>
                    </form>
                </div>
            </div>

            <!-- View Protocol Details Modal -->
            <div class="modal-backdrop" id="task-protocol-details-modal">
                <div class="glass-panel modal-content" style="max-height:90vh; overflow-y:auto; max-width: 500px; width: 100%;">
                    <div class="modal-header">
                        <h3>Sanitation Protocol Details</h3>
                        <button class="modal-close" onclick="document.getElementById('task-protocol-details-modal').style.display='none'">&times;</button>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 16px;">
                        <div>
                            <h4 id="proto-modal-name" style="color:var(--info); font-size:18px; margin-bottom:8px; font-weight:700;"></h4>
                            <p id="proto-modal-desc" style="color:var(--text-secondary); font-size:14px; line-height: 1.4;"></p>
                        </div>
                        
                        <div class="form-group" style="margin: 0;">
                            <label style="font-weight:700; display: block; margin-bottom: 4px;">⏱️ Estimated Duration</label>
                            <div id="proto-modal-duration" style="font-size:14px; color:var(--text-primary);"></div>
                        </div>
                        
                        <div class="form-group" style="margin: 0;">
                            <label style="font-weight:700; display: block; margin-bottom: 4px;">📋 Execution Steps</label>
                            <div id="proto-modal-steps"></div>
                        </div>
                        
                        <div class="form-group" style="margin: 0;">
                            <label style="font-weight:700; display: block; margin-bottom: 4px;">🧪 Required Chemicals & Materials</label>
                            <div id="proto-modal-requirements"></div>
                        </div>
                        
                        <button class="btn btn-secondary" style="width:100%; margin-top:12px;" onclick="document.getElementById('task-protocol-details-modal').style.display='none'" data-i18n="btn_close">Close</button>
                    </div>
                </div>
            </div>

            <!-- Image Zoom Modal -->
            <div id="image-zoom-modal" class="modal-backdrop" onclick="this.style.display='none'" style="z-index: 20000;">
                <div style="position:relative; max-width:90%; max-height:90%; display: flex; align-items: center; justify-content: center;">
                    <img id="zoom-modal-img" style="max-width:100%; max-height:90vh; border-radius:12px; box-shadow:0 0 32px rgba(0,0,0,0.8); border:2px solid var(--border-color); object-fit:contain;">
                </div>
            </div>
        `;

        await this.loadTasksViewDataAndRender();
        i18n.translateDOM();
    },

    toggleRejectionInput() {
        document.getElementById('rejection-reason-container').style.display = 'block';
        document.getElementById('btn-show-reject').style.display = 'none';
        document.getElementById('btn-submit-reject').style.display = 'inline-flex';
    },

    async loadTasksViewDataAndRender() {
        try {
            const role = this.state.currentUser.role;

            // Populate selector lists for supervisor creation
            if (role === 'coordinator' || role === 'supervisor') {
                const nodes = await API.getFacilityHierarchy();
                this.state.facilityNodes = nodes;
                const facilities = nodes.filter(n => n.parent_id === null);

                const facilitySelect = document.getElementById('task-facility');
                if (facilitySelect) {
                    facilitySelect.innerHTML = facilities.map(f => `<option value="${f.id}">${f.name}</option>`).join('');
                }
                this.handleTaskFacilityChange();

                const protocols = await API.getProtocols();
                const protoSelect = document.getElementById('task-protocol');
                protoSelect.innerHTML = protocols.map(p => `<option value="${p.id}">${p.name}</option>`).join('');

                const users = await API.getUsers();
                const workers = users.filter(u => u.role === 'worker' && u.is_active);
                const workerSelect = document.getElementById('task-worker');
                workerSelect.innerHTML = workers.map(w => `<option value="${w.id}">${w.name}</option>`).join('');
            }

            // Render actual task list
            const listContainer = document.getElementById('tasks-list-container');
            const tasks = await API.getTasks();
            this.state.tasks = tasks;

            if (tasks.length === 0) {
                listContainer.innerHTML = 'No sanitation tasks logged.';
                return;
            }

            if (role === 'worker') {
                const activeTasks = tasks.filter(t => ['assigned', 'accepted', 'in_progress', 'rejected'].includes(t.status));
                const todayStr = new Date().toDateString();
                const historyTasks = tasks.filter(t => ['completed', 'pending_validation'].includes(t.status) &&
                    new Date(t.end_time || t.created_at).toDateString() === todayStr);

                const renderSingleTask = (t) => {
                    let actionButtonsHTML = '';
                    if (t.status === 'assigned') {
                        actionButtonsHTML = `
                            <div style="display:flex; gap:8px;">
                                <button class="btn btn-secondary" style="padding:6px 12px; font-size:12px;" onclick="App.openTaskProtocolModal(${t.id})">📋 View Protocol</button>
                                <button class="btn btn-info" style="padding:6px 12px; font-size:12px;" onclick="App.updateTaskStatus(${t.id}, 'accepted')" data-i18n="btn_accept">Accept</button>
                            </div>
                        `;
                    } else if (t.status === 'accepted') {
                        actionButtonsHTML = `
                            <div style="display:flex; gap:8px;">
                                <button class="btn btn-secondary" style="padding:6px 12px; font-size:12px;" onclick="App.openTaskProtocolModal(${t.id})">📋 View Protocol</button>
                                <button class="btn btn-primary" style="padding:6px 12px; font-size:12px;" onclick="App.openTaskStartModal(${t.id})" data-i18n="btn_start">Start</button>
                            </div>
                        `;
                    } else if (t.status === 'in_progress') {
                        actionButtonsHTML = `
                            <div style="display:flex; justify-content:space-between; align-items:center; width:100%; gap:12px; flex-wrap:wrap;">
                                <button class="btn btn-secondary" style="padding:6px 12px; font-size:12px;" onclick="App.openTaskProtocolModal(${t.id})">📋 View Protocol</button>
                                <div class="flex-gap-12">
                                    <button class="btn btn-secondary" style="padding:6px 12px; font-size:12px;" onclick="App.updateTaskStatus(${t.id}, 'accepted')" data-i18n="btn_pause">Pause</button>
                                    <button class="btn btn-success" style="padding:6px 12px; font-size:12px;" onclick="App.openTaskCompletionModal(${t.id})" data-i18n="btn_complete">Complete</button>
                                </div>
                            </div>
                        `;
                    } else if (t.status === 'rejected') {
                        actionButtonsHTML = `
                            <div style="display:flex; flex-direction:column; gap:8px; width:100%;">
                                <div class="text-danger" style="font-size:12px; font-weight:700;"><span data-i18n="rejection_reason">Reason</span>: ${this.escapeHTML(t.rejection_reason || '')}</div>
                                <div style="display:flex; gap:8px; justify-content:flex-end;">
                                    <button class="btn btn-secondary" style="padding:6px 12px; font-size:12px;" onclick="App.openTaskProtocolModal(${t.id})">📋 View Protocol</button>
                                    <button class="btn btn-info" style="padding:6px 12px; font-size:12px;" onclick="App.updateTaskStatus(${t.id}, 'accepted')" data-i18n="btn_accept">Accept & Restart</button>
                                </div>
                            </div>
                        `;
                    } else {
                        actionButtonsHTML = `<button class="btn btn-secondary" style="padding:6px 12px; font-size:12px;" onclick="App.openTaskProtocolModal(${t.id})">📋 View Protocol</button>`;
                    }

                    const locationImageHTML = t.photo_location ? `
                        <div style="margin-top:12px; display:flex; flex-direction:column; gap:4px;">
                            <span style="font-size:11px; font-weight:700; color:var(--text-secondary);">📍 Place to Clean (Guidance Photo):</span>
                            <div style="position:relative; width:120px; height:80px; border-radius:6px; overflow:hidden; border:1px solid var(--border-color); background: #000; cursor:pointer;" onclick="App.showImageZoomModal('/static/uploads/${t.photo_location}')">
                                <img src="/static/uploads/${t.photo_location}" style="width:100%; height:100%; object-fit:cover;">
                            </div>
                        </div>
                    ` : '';

                    return `
                        <div class="glass-panel" style="background:hsla(222, 47%, 8%, 0.4); padding:16px;">
                            <div class="flex-between">
                                <h4 style="color:var(--info); font-size:16px; font-weight:700;">${this.escapeHTML(t.protocol_name)}</h4>
                                <span class="status-badge badge-${t.status}">${i18n.t(`task_status_${t.status}`)}</span>
                            </div>
                            <div style="font-size:13px; color:var(--text-secondary); margin-top:8px;">
                                📍 <b>${this.escapeHTML(t.node_name)}</b>
                            </div>
                            
                            <div style="margin-top:12px; font-size:12px; display:flex; flex-wrap:wrap; gap:16px; color:var(--text-muted);">
                                ${t.worker_name ? `<div>👷 ${this.escapeHTML(t.worker_name)}</div>` : ''}
                                ${t.supervisor_name ? `<div>📋 By: ${this.escapeHTML(t.supervisor_name)}</div>` : ''}
                                <div>📅 Created: ${this.escapeHTML(new Date(t.created_at).toLocaleDateString(i18n.currentLang))}</div>
                            </div>
                            
                            ${locationImageHTML}
                            
                            ${t.consumptions && t.consumptions.length > 0 ? `
                                <div style="margin-top:12px; font-size:12px;">
                                    <span style="font-weight:700;">Consumed products:</span>
                                    <span style="color:var(--text-secondary);">${t.consumptions.map(c => ` ${this.escapeHTML(c.item_name)} (${c.quantity_used} ${this.escapeHTML(c.unit)})`).join(',')}</span>
                                </div>
                            ` : ''}
                            
                            <div style="display:flex; justify-content:flex-end; margin-top:16px;">
                                ${actionButtonsHTML}
                            </div>
                        </div>
                    `;
                };

                const activeTasksHTML = activeTasks.length > 0
                    ? activeTasks.map(renderSingleTask).join('')
                    : '<div style="color:var(--text-secondary); font-size:14px; padding:12px 0;">No active tasks assigned to you.</div>';

                const historyTasksHTML = historyTasks.length > 0
                    ? historyTasks.map(renderSingleTask).join('')
                    : '<div style="color:var(--text-secondary); font-size:14px; padding:12px 0;">No tasks completed today yet.</div>';

                listContainer.innerHTML = `
                    <h4 style="font-size:16px; font-weight:700; color:var(--text-primary); margin-bottom:8px;" data-i18n="active_tasks_header">Active Tasks</h4>
                    <div style="display:flex; flex-direction:column; gap:16px; margin-bottom:24px;">
                        ${activeTasksHTML}
                    </div>
                    <hr style="border:0; border-top:1px solid var(--border-color); margin-bottom:24px;">
                    <h4 style="font-size:16px; font-weight:700; color:var(--text-primary); margin-bottom:8px;" data-i18n="history_today_header">History of the Day</h4>
                    <div style="display:flex; flex-direction:column; gap:16px;">
                        ${historyTasksHTML}
                    </div>
                `;
            } else {
                listContainer.innerHTML = tasks.map(t => {
                    let actionButtonsHTML = '';

                    if ((role === 'validator' || role === 'coordinator' || role === 'supervisor') && t.status === 'pending_validation') {
                        actionButtonsHTML = `<button class="btn btn-success" style="padding:6px 12px; font-size:12px;" onclick="App.openTaskValidationModal(${t.id})" data-i18n="btn_audit_validation">Audit Validation</button>`;
                    }

                    if ((role === 'coordinator' || role === 'supervisor') && ['completed', 'pending_validation', 'rejected'].includes(t.status)) {
                        const space = actionButtonsHTML ? ' ' : '';
                        actionButtonsHTML += `${space}<button class="btn btn-secondary" style="padding:6px 12px; font-size:12px;" onclick="App.openTaskDetailsModal(${t.id})">View Details</button>`;
                    }

                    // Add Edit and Delete buttons for supervisor/coordinator
                    if (role === 'coordinator' || role === 'supervisor') {
                        const space = actionButtonsHTML ? ' ' : '';
                        actionButtonsHTML += `${space}<button class="btn btn-secondary" style="padding:6px 12px; font-size:12px;" onclick="App.openEditTaskModal(${t.id})">✏️ Edit</button>`;
                        actionButtonsHTML += ` <button class="btn btn-danger" style="padding:6px 12px; font-size:12px; background:var(--danger); border-color:var(--danger);" onclick="App.handleDeleteTask(${t.id})">🗑️ Delete</button>`;
                    }

                    const locationImageHTML = t.photo_location ? `
                        <div style="margin-top:12px; display:flex; flex-direction:column; gap:4px;">
                            <span style="font-size:11px; font-weight:700; color:var(--text-secondary);">📍 Place to Clean (Guidance Photo):</span>
                            <div style="position:relative; width:120px; height:80px; border-radius:6px; overflow:hidden; border:1px solid var(--border-color); background: #000; cursor:pointer;" onclick="App.showImageZoomModal('/static/uploads/${t.photo_location}')">
                                <img src="/static/uploads/${t.photo_location}" style="width:100%; height:100%; object-fit:cover;">
                            </div>
                        </div>
                    ` : '';

                    return `
                        <div class="glass-panel" style="background:hsla(222, 47%, 8%, 0.4); padding:16px;">
                            <div class="flex-between">
                                <h4 style="color:var(--info); font-size:16px; font-weight:700;">${this.escapeHTML(t.protocol_name)}</h4>
                                <span class="status-badge badge-${t.status}">${i18n.t(`task_status_${t.status}`)}</span>
                            </div>
                            <div style="font-size:13px; color:var(--text-secondary); margin-top:8px;">
                                📍 <b>${this.escapeHTML(t.node_name)}</b>
                            </div>
                            
                            <div style="margin-top:12px; font-size:12px; display:flex; flex-wrap:wrap; gap:16px; color:var(--text-muted);">
                                ${t.worker_name ? `<div>👷 ${this.escapeHTML(t.worker_name)}</div>` : ''}
                                ${t.supervisor_name ? `<div>📋 By: ${this.escapeHTML(t.supervisor_name)}</div>` : ''}
                                <div>📅 Created: ${this.escapeHTML(new Date(t.created_at).toLocaleDateString(i18n.currentLang))}</div>
                            </div>
                            
                            ${locationImageHTML}
                            
                            ${t.consumptions && t.consumptions.length > 0 ? `
                                <div style="margin-top:12px; font-size:12px;">
                                    <span style="font-weight:700;">Consumed products:</span>
                                    <span style="color:var(--text-secondary);">${t.consumptions.map(c => ` ${this.escapeHTML(c.item_name)} (${c.quantity_used} ${this.escapeHTML(c.unit)})`).join(',')}</span>
                                </div>
                            ` : ''}
                            
                            <div style="display:flex; justify-content:flex-end; margin-top:16px;">
                                ${actionButtonsHTML}
                            </div>
                        </div>
                    `;
                }).join('');
            }

            i18n.translateDOM();
        } catch (err) {
            this.showToast(err.message, 'error');
        }
    },

    async handleCreateTask(e) {
        e.preventDefault();
        const node_id = document.getElementById('task-node').value;
        const protocol_id = document.getElementById('task-protocol').value;
        const worker_id = document.getElementById('task-worker').value;
        const photo_location = document.getElementById('task-location-data') ? document.getElementById('task-location-data').value : '';

        try {
            await API.createTask({ node_id, protocol_id, worker_id, photo_location });
            this.showToast("Sanitation task created and assigned successfully");
            const panel = document.getElementById('add-task-panel');
            if (panel) {
                const form = panel.querySelector('form');
                if (form) form.reset();

                // Reset location photo uploader fields
                const preview = document.getElementById('task-location-preview');
                if (preview) {
                    preview.style.display = 'none';
                    preview.src = '';
                }
                const dataField = document.getElementById('task-location-data');
                if (dataField) dataField.value = '';
            }
            this.toggleAddTaskPanel();
            this.loadTasksViewDataAndRender();
        } catch (err) {
            this.showToast(err.message, 'error');
        }
    },

    async updateTaskStatus(taskId, status) {
        try {
            await API.updateTaskStatus(taskId, status);
            this.showToast(`Task status updated to ${status}`);
            this.loadTasksViewDataAndRender();
        } catch (err) {
            this.showToast(err.message, 'error');
        }
    },

    openTaskProtocolModal(taskId) {
        const task = this.state.tasks.find(t => t.id === taskId);
        if (!task) return;

        document.getElementById('proto-modal-name').textContent = task.protocol_name;
        document.getElementById('proto-modal-desc').textContent = task.protocol_description || 'No description provided.';
        document.getElementById('proto-modal-duration').textContent = `${task.protocol_duration || 0} ${i18n.t('min_label')}`;

        // Render steps
        const stepsContainer = document.getElementById('proto-modal-steps');
        if (task.protocol_steps && task.protocol_steps.length > 0) {
            stepsContainer.innerHTML = `<ol style="padding-left: 20px; display: flex; flex-direction: column; gap: 8px; margin: 0;">` +
                task.protocol_steps.map(step => `
                    <li style="color: var(--text-primary); font-size: 14px;">
                        ${this.escapeHTML(step)}
                    </li>
                `).join('') + `</ol>`;
        } else {
            stepsContainer.innerHTML = '<div style="color: var(--text-muted); font-style: italic;">No execution steps defined.</div>';
        }

        // Render requirements
        const reqsContainer = document.getElementById('proto-modal-requirements');
        if (task.protocol_requirements && task.protocol_requirements.length > 0) {
            reqsContainer.innerHTML = `<ul style="padding-left: 20px; display: flex; flex-direction: column; gap: 6px; margin: 0;">` +
                task.protocol_requirements.map(req => `
                    <li>
                        ${this.escapeHTML(req.item_name)}: <b style="color:var(--text-primary);">${req.quantity_required} ${this.escapeHTML(req.unit)}</b>
                    </li>
                `).join('') + `</ul>`;
        } else {
            reqsContainer.innerHTML = '<div style="color: var(--text-muted); font-style: italic;">No specific chemicals or materials required.</div>';
        }

        document.getElementById('task-protocol-details-modal').style.display = 'flex';
        i18n.translateDOM();
    },

    async openEditTaskModal(taskId) {
        const task = this.state.tasks.find(t => t.id === taskId);
        if (!task) return;

        document.getElementById('edit-task-id').value = task.id;

        // Populate facility & node selector list
        const nodes = await API.getFacilityHierarchy();
        this.state.facilityNodes = nodes;
        
        const getTopLevelAncestorId = (nodeId) => {
            let current = nodes.find(n => n.id === nodeId);
            while (current && current.parent_id !== null) {
                const parent = nodes.find(n => n.id === current.parent_id);
                if (!parent) break;
                current = parent;
            }
            return current ? current.id : null;
        };

        const topLevelId = getTopLevelAncestorId(task.node_id);

        const facilities = nodes.filter(n => n.parent_id === null);
        const facilitySelect = document.getElementById('edit-task-facility');
        if (facilitySelect) {
            facilitySelect.innerHTML = facilities.map(f => `<option value="${f.id}">${f.name}</option>`).join('');
            facilitySelect.value = topLevelId;
        }

        const isDescendant = (nodeId, ancestorId) => {
            let currentId = nodeId;
            while (currentId !== null) {
                if (currentId === ancestorId) return true;
                const current = nodes.find(n => n.id === currentId);
                if (!current) break;
                currentId = current.parent_id;
            }
            return false;
        };

        const nodeSelect = document.getElementById('edit-task-node');
        if (nodeSelect) {
            const leafNodes = nodes.filter(n => 
                (n.type === 'machine' || n.type === 'line' || n.type === 'production_line') && 
                isDescendant(n.id, topLevelId)
            );
            nodeSelect.innerHTML = leafNodes.map(n => `<option value="${n.id}">${n.name} (${i18n.t(n.type)})</option>`).join('');
            nodeSelect.value = task.node_id;
        }

        // Populate protocol selector list
        const protocols = await API.getProtocols();
        const protoSelect = document.getElementById('edit-task-protocol');
        protoSelect.innerHTML = protocols.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
        protoSelect.value = task.protocol_id;

        // Populate worker selector list
        const users = await API.getUsers();
        const workers = users.filter(u => u.role === 'worker' && u.is_active);
        const workerSelect = document.getElementById('edit-task-worker');
        workerSelect.innerHTML = workers.map(w => `<option value="${w.id}">${w.name}</option>`).join('');
        workerSelect.value = task.worker_id;

        // Populate status
        document.getElementById('edit-task-status').value = task.status;

        // Reset image uploaders
        document.getElementById('edit-location-preview').style.display = 'none';
        document.getElementById('edit-location-preview').src = '';
        document.getElementById('edit-task-location-data').value = '';

        const existingImg = document.getElementById('edit-location-preview-existing');
        if (task.photo_location) {
            existingImg.src = `/static/uploads/${task.photo_location}`;
            existingImg.style.display = 'block';
            document.getElementById('edit-task-location-data').value = task.photo_location;
        } else {
            existingImg.style.display = 'none';
            existingImg.src = '';
        }

        document.getElementById('edit-task-modal').style.display = 'flex';
        i18n.translateDOM();
    },

    closeEditTaskModal() {
        document.getElementById('edit-task-modal').style.display = 'none';
    },

    async handleSubmitEditTask(e) {
        e.preventDefault();
        const taskId = document.getElementById('edit-task-id').value;
        const node_id = document.getElementById('edit-task-node').value;
        const protocol_id = document.getElementById('edit-task-protocol').value;
        const worker_id = document.getElementById('edit-task-worker').value;
        const status = document.getElementById('edit-task-status').value;
        const photo_location = document.getElementById('edit-task-location-data').value;

        try {
            await API.updateTask(taskId, { node_id, protocol_id, worker_id, status, photo_location });
            this.showToast("Sanitation task updated successfully");
            this.closeEditTaskModal();
            this.loadTasksViewDataAndRender();
        } catch (err) {
            this.showToast(err.message, 'error');
        }
    },

    async handleDeleteTask(taskId) {
        if (!confirm("Are you sure you want to delete this sanitation task? This will permanently remove it from the system.")) return;
        try {
            await API.deleteTask(taskId);
            this.showToast("Sanitation task deleted successfully");
            this.loadTasksViewDataAndRender();
        } catch (err) {
            this.showToast(err.message, 'error');
        }
    },

    showImageZoomModal(imgUrl) {
        const modal = document.getElementById('image-zoom-modal');
        const img = document.getElementById('zoom-modal-img');
        if (modal && img) {
            img.src = imgUrl;
            modal.style.display = 'flex';
        }
    },

    openTaskStartModal(taskId) {
        document.getElementById('start-task-id').value = taskId;
        document.getElementById('preview-before-start').style.display = 'none';
        document.getElementById('preview-before-start').src = '';
        document.getElementById('data-before-start').value = '';
        document.getElementById('task-start-modal').style.display = 'flex';
        i18n.translateDOM();
    },

    closeTaskStartModal() {
        document.getElementById('task-start-modal').style.display = 'none';
    },

    async handleSubmitTaskStart(e) {
        e.preventDefault();
        const id = document.getElementById('start-task-id').value;
        const photo_before = document.getElementById('data-before-start').value;
        if (!photo_before) {
            this.showToast("Before photo is required to start work.", "error");
            return;
        }
        try {
            await API.updateTaskStatus(id, 'in_progress', { photo_before });
            this.showToast("Task started!");
            this.closeTaskStartModal();
            this.loadTasksViewDataAndRender();
        } catch (err) {
            this.showToast(err.message, 'error');
        }
    },

    // --- Worker Completion Panel ---
    async openTaskCompletionModal(taskId) {
        const task = this.state.tasks.find(t => t.id === taskId);
        if (!task) return;

        document.getElementById('complete-task-id').value = task.id;
        document.getElementById('complete-task-notes').value = '';

        // Set photo before preview
        const completionPreviewBefore = document.getElementById('completion-preview-before');
        if (completionPreviewBefore) {
            completionPreviewBefore.src = task.photo_before ? `/static/uploads/${task.photo_before}` : '';
        }

        // Reset photo previews
        document.getElementById('preview-after').style.display = 'none';
        document.getElementById('data-after').value = '';

        // Clear additional consumptions
        const addConsContainer = document.getElementById('additional-consumptions');
        if (addConsContainer) {
            addConsContainer.innerHTML = '';
        }

        // Fetch inventory if empty
        if (this.state.inventoryItems.length === 0) {
            try {
                this.state.inventoryItems = await API.getInventory();
            } catch (err) {
                console.error("Failed to load inventory items", err);
            }
        }

        // Load steps as checklist compliance
        const stepsContainer = document.getElementById('complete-task-steps');
        // Fetch matching protocol to grab steps details
        const protocol = this.state.protocols.find(p => p.name === task.protocol_name);

        if (protocol && protocol.steps) {
            stepsContainer.innerHTML = protocol.steps.map((step, idx) => `
                <div class="step-checklist-item" onclick="App.toggleChecklistStep(this)">
                    <input type="checkbox" class="step-checklist-checkbox" id="step-chk-${idx}" required>
                    <span id="step-lbl-${idx}">${step}</span>
                </div>
            `).join('');
        } else {
            stepsContainer.innerHTML = 'None';
        }

        // Load consumption auto-fills based on protocol requirements
        const consContainer = document.getElementById('complete-task-consumptions');
        if (protocol && protocol.requirements) {
            consContainer.innerHTML = protocol.requirements.map(r => `
                <div class="flex-gap-12">
                    <span style="flex:2; font-size:14px; font-weight:500;">${r.item_name} (${r.unit})</span>
                    <input type="number" step="0.1" class="form-control completion-cons-qty-req" style="flex:1;" 
                        data-item-id="${r.item_id}" data-name="${r.item_name}" data-unit="${r.unit}"
                        value="${r.quantity_required}" placeholder="Used qty" required>
                </div>
            `).join('');
        } else {
            consContainer.innerHTML = 'No materials required.';
        }

        // Start live elapsed timer in modal
        this.startActiveWorkerTimerDisplay(task.start_time);

        document.getElementById('task-completion-modal').style.display = 'flex';
        i18n.translateDOM();
    },

    closeTaskCompletionModal() {
        document.getElementById('task-completion-modal').style.display = 'none';
        this.stopActiveWorkerTimerDisplay();
    },

    addConsumptionRow(itemId = '', qty = '') {
        const container = document.getElementById('additional-consumptions');
        if (!container) return;

        const rowId = `add-cons-row-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
        const row = document.createElement('div');
        row.className = 'flex-gap-12';
        row.id = rowId;
        row.style.alignItems = 'center';

        const optionsHTML = this.state.inventoryItems.map(item => `
            <option value="${item.id}" ${item.id == itemId ? 'selected' : ''}>${item.name} (${item.unit})</option>
        `).join('');

        row.innerHTML = `
            <select class="form-control completion-cons-item" style="flex:2;" required>
                <option value="" disabled ${!itemId ? 'selected' : ''} data-i18n="select_product">Select Product...</option>
                ${optionsHTML}
            </select>
            <input type="number" step="0.1" class="form-control completion-cons-qty-add" style="flex:1;" 
                placeholder="Qty" value="${qty}" required>
            <button type="button" class="btn btn-danger" onclick="document.getElementById('${rowId}').remove()" style="padding:6px 12px; font-weight:bold;">&times;</button>
        `;

        container.appendChild(row);
        i18n.translateDOM();
    },

    toggleChecklistStep(div) {
        const chk = div.querySelector('input[type="checkbox"]');
        const lbl = div.querySelector('span');
        if (chk && lbl) {
            // toggle only if click didn't land directly on checkbox (avoid double click)
            if (event.target !== chk) {
                chk.checked = !chk.checked;
            }
            if (chk.checked) {
                lbl.className = 'step-text-completed';
            } else {
                lbl.className = '';
            }
        }
    },

    startActiveWorkerTimerDisplay(startTimeStr) {
        this.stopActiveWorkerTimerDisplay();

        const start = startTimeStr ? new Date(startTimeStr) : new Date();
        const display = document.getElementById('modal-timer-text');

        const updateTimer = () => {
            const diffMs = new Date() - start;
            const diffSecs = Math.floor(diffMs / 1000);

            const hours = String(Math.floor(diffSecs / 3600)).padStart(2, '0');
            const mins = String(Math.floor((diffSecs % 3600) / 60)).padStart(2, '0');
            const secs = String(diffSecs % 60).padStart(2, '0');

            if (display) {
                display.textContent = `${hours}:${mins}:${secs}`;
            }
        };

        updateTimer();
        this.state.activeTimerInterval = setInterval(updateTimer, 1000);
    },

    stopActiveWorkerTimerDisplay() {
        if (this.state.activeTimerInterval) {
            clearInterval(this.state.activeTimerInterval);
            this.state.activeTimerInterval = null;
        }
    },

    handlePhotoUpload(input, imgElementId, dataFieldId) {
        const file = input.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            document.getElementById(imgElementId).src = e.target.result;
            document.getElementById(imgElementId).style.display = 'block';
            document.getElementById(dataFieldId).value = e.target.result; // base64 string
        };
        reader.readAsDataURL(file);
    },

    async handleSubmitTaskCompletion(e) {
        e.preventDefault();
        const id = document.getElementById('complete-task-id').value;
        const notes = document.getElementById('complete-task-notes').value;
        const photo_after = document.getElementById('data-after').value;

        if (!photo_after) {
            this.showToast("After photo is required.", "error");
            return;
        }

        // Grab values from consumption fields
        const consumptions = [];

        // 1. Required consumptions
        document.querySelectorAll('.completion-cons-qty-req').forEach(input => {
            const item_id = input.getAttribute('data-item-id');
            const quantity = parseFloat(input.value);
            if (item_id && !isNaN(quantity) && quantity >= 0) {
                consumptions.push({ item_id, quantity });
            }
        });

        // 2. Added/Additional consumptions
        document.querySelectorAll('[id^="add-cons-row-"]').forEach(row => {
            const select = row.querySelector('.completion-cons-item');
            const input = row.querySelector('.completion-cons-qty-add');
            if (select && input) {
                const item_id = select.value;
                const quantity = parseFloat(input.value);
                if (item_id && !isNaN(quantity) && quantity >= 0) {
                    consumptions.push({ item_id, quantity });
                }
            }
        });

        try {
            await API.submitTaskValidation(id, { notes, consumptions, photo_after });
            this.showToast("Task completed & sent for validation");
            this.closeTaskCompletionModal();
            this.loadTasksViewDataAndRender();
        } catch (err) {
            this.showToast(err.message, 'error');
        }
    },

    // --- Validator Panel ---
    openTaskValidationModal(taskId) {
        const task = this.state.tasks.find(t => t.id === taskId);
        if (!task) return;

        document.getElementById('validate-task-id').value = task.id;
        document.getElementById('validate-worker-notes').textContent = task.notes || 'None';
        document.getElementById('validate-reject-reason').value = '';

        // Load photos
        document.getElementById('validate-preview-before').src = task.photo_before ? `/static/uploads/${task.photo_before}` : '';
        document.getElementById('validate-preview-after').src = task.photo_after ? `/static/uploads/${task.photo_after}` : '';

        // Load consumed materials
        const consList = document.getElementById('validate-consumptions-list');
        if (task.consumptions && task.consumptions.length > 0) {
            consList.innerHTML = task.consumptions.map(c => `<div>🧪 ${c.item_name}: <b>${c.quantity_used} ${c.unit}</b></div>`).join('');
        } else {
            consList.innerHTML = 'None';
        }

        // Reset rejection layout
        document.getElementById('rejection-reason-container').style.display = 'none';
        document.getElementById('btn-show-reject').style.display = 'inline-flex';
        document.getElementById('btn-submit-reject').style.display = 'none';

        document.getElementById('task-validation-modal').style.display = 'flex';
        i18n.translateDOM();
    },

    openTaskDetailsModal(taskId) {
        const task = this.state.tasks.find(t => t.id === taskId);
        if (!task) return;

        document.getElementById('details-worker-notes').textContent = task.notes || 'None';

        // Load photos
        document.getElementById('details-preview-before').src = task.photo_before ? `/static/uploads/${task.photo_before}` : '';
        document.getElementById('details-preview-after').src = task.photo_after ? `/static/uploads/${task.photo_after}` : '';

        // Load consumed materials
        const consList = document.getElementById('details-consumptions-list');
        if (task.consumptions && task.consumptions.length > 0) {
            consList.innerHTML = task.consumptions.map(c => `<div>🧪 ${c.item_name}: <b>${c.quantity_used} ${c.unit}</b></div>`).join('');
        } else {
            consList.innerHTML = 'None';
        }

        // Load rejection reason if active
        const rejectContainer = document.getElementById('details-rejection-container');
        if (task.status === 'rejected' && task.rejection_reason) {
            rejectContainer.style.display = 'block';
            document.getElementById('details-reject-reason').textContent = task.rejection_reason;
        } else {
            rejectContainer.style.display = 'none';
        }

        document.getElementById('task-details-modal').style.display = 'flex';
        i18n.translateDOM();
    },

    async submitTaskValidationDecision(approved) {
        const id = document.getElementById('validate-task-id').value;
        const reason = document.getElementById('validate-reject-reason').value;

        if (!approved && !reason) {
            this.showToast("A rejection reason is required.", "error");
            return;
        }

        try {
            await API.validateTask(id, approved, reason);
            this.showToast(approved ? "Task approved and closed" : "Task rejected & sent back to worker");
            document.getElementById('task-validation-modal').style.display = 'none';
            this.loadTasksViewDataAndRender();
        } catch (err) {
            this.showToast(err.message, 'error');
        }
    },

    // --- 7. Audit Trail View (Coordinator Only) ---
    async renderAuditView() {
        const container = document.getElementById('view-content');
        container.innerHTML = `
            <div class="glass-panel">
                <h3 data-i18n="audit_trail_title">System Audit Log</h3>
                
                <!-- Filters Bar -->
                <div class="flex-gap-12 mb-24 mt-24" style="flex-wrap: wrap; align-items: flex-end;">
                    <div class="form-group" style="margin:0; min-width:150px;">
                        <label style="font-size:12px; margin-bottom:4px; display:block;" data-i18n="start_date">Start Date</label>
                        <input type="date" id="audit-start-date" class="form-control" style="padding: 6px 12px; height: 38px;">
                    </div>
                    <div class="form-group" style="margin:0; min-width:150px;">
                        <label style="font-size:12px; margin-bottom:4px; display:block;" data-i18n="end_date">End Date</label>
                        <input type="date" id="audit-end-date" class="form-control" style="padding: 6px 12px; height: 38px;">
                    </div>
                    <div class="form-group" style="margin:0; min-width:150px;">
                        <label style="font-size:12px; margin-bottom:4px; display:block;" data-i18n="actor_label">Actor</label>
                        <select id="audit-user-select" class="form-control" style="padding: 6px 12px; height: 38px;">
                            <option value="" data-i18n="all_users">All Users</option>
                        </select>
                    </div>
                    <button class="btn btn-primary" onclick="App.applyAuditFilters()" style="padding: 10px 16px; height: 38px;" data-i18n="btn_filter">Filter</button>
                    <button class="btn btn-secondary" onclick="App.resetAuditFilters()" style="padding: 10px 16px; height: 38px;" data-i18n="btn_reset">Reset</button>
                    <button class="btn btn-secondary" onclick="App.exportAuditToExcel()" style="padding: 10px 16px; height: 38px;" data-i18n="btn_export_audit">Export Audit Trail</button>
                </div>

                <div class="table-container">
                    <table id="audit-table">
                        <thead>
                            <tr>
                                <th data-i18n="audit_user">Actor</th>
                                <th data-i18n="type">Role</th>
                                <th data-i18n="audit_action">Action</th>
                                <th data-i18n="audit_details">Details</th>
                                <th data-i18n="created_at">Timestamp</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr><td colspan="5">Loading logs...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        // Fetch users to populate selector
        try {
            const users = await API.getUsers();
            const select = document.getElementById('audit-user-select');
            if (select) {
                const usernames = [...new Set(users.map(u => u.username))];
                select.innerHTML = `<option value="" data-i18n="all_users">${i18n.t('all_users')}</option>` +
                    usernames.map(username => `<option value="${username}">${username}</option>`).join('');
            }
        } catch (err) {
            console.error("Failed to load users for filter", err);
        }

        await this.loadAuditLogsAndRender();
        i18n.translateDOM();
    },

    async loadAuditLogsAndRender(filters = {}) {
        try {
            const logs = await API.getAuditLogs(filters);
            const tbody = document.querySelector('#audit-table tbody');
            if (tbody) {
                if (logs.length === 0) {
                    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-secondary);">No logs found matching filters.</td></tr>`;
                } else {
                    tbody.innerHTML = logs.map(l => `
                        <tr>
                            <td><b>${this.escapeHTML(l.username)}</b></td>
                            <td><span class="user-role-${this.escapeHTML(l.role)}">${i18n.t(l.role)}</span></td>
                            <td><code style="color:var(--info); font-weight:700;">${this.escapeHTML(l.action)}</code></td>
                            <td><span style="font-size:13px; color:var(--text-secondary);">${this.escapeHTML(l.details || '')}</span></td>
                            <td>${this.escapeHTML(new Date(l.created_at).toLocaleString(i18n.currentLang))}</td>
                        </tr>
                    `).join('');
                }
            }
        } catch (err) {
            this.showToast(err.message, 'error');
        }
    },

    applyAuditFilters() {
        const start_date = document.getElementById('audit-start-date').value;
        const end_date = document.getElementById('audit-end-date').value;
        const username = document.getElementById('audit-user-select').value;

        const filters = {};
        if (start_date) filters.start_date = start_date;
        if (end_date) filters.end_date = end_date;
        if (username) filters.username = username;

        this.loadAuditLogsAndRender(filters);
    },

    resetAuditFilters() {
        document.getElementById('audit-start-date').value = '';
        document.getElementById('audit-end-date').value = '';
        document.getElementById('audit-user-select').value = '';
        this.loadAuditLogsAndRender();
    },

    // --- 8. Reports & Backup Settings View ---
    async renderReportsView() {
        const container = document.getElementById('view-content');
        const role = this.state.currentUser.role;

        let backupSettingsHTML = '';
        if (role === 'coordinator') {
            backupSettingsHTML = `
                <div class="glass-panel mt-24">
                    <h3>System Administration & Backup</h3>
                    <p style="color:var(--text-secondary); margin-top:8px; font-size:14px;">Trigger manual database snapshots or restore system checkpoints locally. Databases automatically backup every 24 hours.</p>
                    <div class="mt-24">
                        <button class="btn btn-primary" onclick="App.triggerManualBackup()" data-i18n="btn_confirm">Backup SQLite Database Now</button>
                    </div>
                </div>
            `;
        }

        container.innerHTML = `
            <h2 data-i18n="nav_reports" style="margin-bottom:16px;">Reports & Analytics</h2>

            <!-- Reports Filters Inline Toolbar -->
            <div class="glass-panel mb-24" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px; padding:12px 20px;">
                <div style="display:flex; align-items:center; gap:16px; flex-wrap:wrap; flex:1;">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <label style="font-size:12px; font-weight:600; color:var(--text-secondary); white-space:nowrap; margin:0;" data-i18n="start_date">Start Date</label>
                        <input type="date" id="rep-start-date" class="form-control" style="padding: 6px 12px; height: 38px; width:auto; margin:0;">
                    </div>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <label style="font-size:12px; font-weight:600; color:var(--text-secondary); white-space:nowrap; margin:0;" data-i18n="end_date">End Date</label>
                        <input type="date" id="rep-end-date" class="form-control" style="padding: 6px 12px; height: 38px; width:auto; margin:0;">
                    </div>
                    <div style="display:flex; gap:8px;">
                        <button class="btn btn-primary" onclick="App.applyReportsFilters()" style="padding: 0 16px; height: 38px; display:flex; align-items:center; justify-content:center;" data-i18n="btn_filter">Filter</button>
                        <button class="btn btn-secondary" onclick="App.resetReportsFilters()" style="padding: 0 16px; height: 38px; display:flex; align-items:center; justify-content:center;" data-i18n="btn_reset">Reset</button>
                    </div>
                </div>
                <button class="btn btn-primary" onclick="App.exportReportsToExcel()" data-i18n="btn_export_excel" style="display:flex; align-items:center; gap:8px; height: 38px; padding: 0 16px;">
                    📊 Export to Excel
                </button>
            </div>

            <!-- KPI Summary Cards Row -->
            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap:20px; margin-bottom:24px;">
                <!-- Card 1: Avg Clean Duration -->
                <div class="glass-panel" style="display:flex; justify-content:space-between; align-items:center; padding:20px 24px;">
                    <div style="display:flex; flex-direction:column; gap:6px;">
                        <span style="font-size:12px; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.5px; font-weight:700;" data-i18n="kpi_avg_duration">Avg Clean Duration</span>
                        <span id="kpi-avg-duration" style="font-size:26px; font-weight:800; color:var(--info);">Loading...</span>
                    </div>
                    <div style="width:48px; height:48px; border-radius:50%; background:var(--info-glow); border:1px solid var(--info); display:flex; align-items:center; justify-content:center; font-size:22px; flex-shrink:0;">⏱️</div>
                </div>
                <!-- Card 2: Validation Pass Rate -->
                <div class="glass-panel" style="display:flex; justify-content:space-between; align-items:center; padding:20px 24px;">
                    <div style="display:flex; flex-direction:column; gap:6px;">
                        <span style="font-size:12px; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.5px; font-weight:700;" data-i18n="kpi_pass_rate">Validation Pass Rate</span>
                        <span id="kpi-pass-rate" style="font-size:26px; font-weight:800; color:var(--success);">Loading...</span>
                    </div>
                    <div style="width:48px; height:48px; border-radius:50%; background:var(--success-glow); border:1px solid var(--success); display:flex; align-items:center; justify-content:center; font-size:22px; flex-shrink:0;">✅</div>
                </div>
                <!-- Card 3: Completed Tasks -->
                <div class="glass-panel" style="display:flex; justify-content:space-between; align-items:center; padding:20px 24px;">
                    <div style="display:flex; flex-direction:column; gap:6px;">
                        <span style="font-size:12px; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.5px; font-weight:700;" data-i18n="kpi_completed_tasks">Completed Tasks</span>
                        <span id="kpi-completed-tasks" style="font-size:26px; font-weight:800; color:var(--primary);">Loading...</span>
                    </div>
                    <div style="width:48px; height:48px; border-radius:50%; background:var(--primary-glow); border:1px solid var(--primary); display:flex; align-items:center; justify-content:center; font-size:22px; flex-shrink:0;">📋</div>
                </div>
            </div>
            
            <div class="grid-2">
                <div class="glass-panel">
                    <h3 data-i18n="rep_productivity">Productivity (Worker Performance)</h3>
                    <p style="font-size:13px; color:var(--text-secondary); margin-top:4px; margin-bottom:12px;" data-i18n="rep_productivity_desc">Average duration taken by each worker to complete tasks.</p>
                    <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 4px;" data-i18n="metric_avg_clean_time">Average Clean Time (mins)</div>
                    <div class="chart-container" id="chart-worker-perf" style="padding-bottom: 30px;"></div>
                </div>
                
                <div class="glass-panel">
                    <h3 data-i18n="rep_machine_clean_time">Average Clean Times by Machine</h3>
                    <p style="font-size:13px; color:var(--text-secondary); margin-top:4px; margin-bottom:12px;" data-i18n="rep_machine_clean_time_desc">Comparison of sanitation cycle durations.</p>
                    <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 4px;" data-i18n="metric_avg_clean_time">Average Clean Time (mins)</div>
                    <div class="chart-container" id="chart-machine-perf" style="padding-bottom: 30px;"></div>
                </div>
            </div>
            
            <div class="mt-24">
                <div class="glass-panel">
                    <h3 data-i18n="rep_supervisor_perf">Assigned Tasks by Supervisor</h3>
                    <p style="font-size:13px; color:var(--text-secondary); margin-top:4px; margin-bottom:12px;" data-i18n="rep_supervisor_perf_desc">Tasks delegated per supervisor.</p>
                    <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 4px;" data-i18n="metric_tasks_assigned">Tasks Assigned</div>
                    <div class="chart-container" id="chart-supervisor-perf" style="padding-bottom: 30px;"></div>
                </div>
            </div>
            
            ${backupSettingsHTML}
        `;

        await this.loadReportsDataAndRender();
        i18n.translateDOM();
    },

    async loadReportsDataAndRender(filters = {}) {
        try {
            const stats = await API.getReports(filters);

            // 1. Populate KPI Cards
            const avgDurationEl = document.getElementById('kpi-avg-duration');
            const passRateEl = document.getElementById('kpi-pass-rate');
            const completedEl = document.getElementById('kpi-completed-tasks');

            if (avgDurationEl) avgDurationEl.textContent = `${stats.avg_task_duration} ${i18n.t('min_label')}`;
            if (passRateEl) passRateEl.textContent = `${stats.validation_rate}%`;
            if (completedEl) completedEl.textContent = `${stats.status_counts.completed || 0}`;

            // 2. Render Worker Performance Chart
            this.renderBarChart('chart-worker-perf', stats.worker_performance.map(w => ({
                label: w.name,
                value: w.avg_time
            })));

            // 3. Render Machine Performance Chart
            this.renderBarChart('chart-machine-perf', stats.machine_performance.map(m => ({
                label: m.name,
                value: m.avg_time
            })));

            // 4. Render Supervisor Performance Chart
            this.renderBarChart('chart-supervisor-perf', stats.supervisor_performance.map(s => ({
                label: s.name,
                value: s.tasks_assigned
            })));

        } catch (err) {
            this.showToast(err.message, 'error');
        }
    },

    applyReportsFilters() {
        const start_date = document.getElementById('rep-start-date').value;
        const end_date = document.getElementById('rep-end-date').value;
        this.loadReportsDataAndRender({ start_date, end_date });
    },

    resetReportsFilters() {
        const startDateInput = document.getElementById('rep-start-date');
        const endDateInput = document.getElementById('rep-end-date');
        if (startDateInput) startDateInput.value = '';
        if (endDateInput) endDateInput.value = '';
        this.loadReportsDataAndRender({});
    },

    async triggerManualBackup() {
        if (!confirm(i18n.t('confirm_backup'))) return;
        try {
            await API.triggerBackup();
            this.showToast(i18n.t('success_backup'), 'success');
        } catch (err) {
            this.showToast(err.message, 'error');
        }
    },

    exportReportsToExcel() {
        const token = API.getToken();
        if (token) {
            const start_date = document.getElementById('rep-start-date') ? document.getElementById('rep-start-date').value : '';
            const end_date = document.getElementById('rep-end-date') ? document.getElementById('rep-end-date').value : '';
            let url = `/api/reports/export?token=${token}`;
            if (start_date) url += `&start_date=${start_date}`;
            if (end_date) url += `&end_date=${end_date}`;
            window.location.href = url;
        }
    },

    exportInventoryToExcel() {
        const token = API.getToken();
        if (token) {
            window.location.href = `/api/inventory/export?token=${token}`;
        }
    },

    exportAuditToExcel() {
        const token = API.getToken();
        if (token) {
            const start_date = document.getElementById('audit-start-date').value;
            const end_date = document.getElementById('audit-end-date').value;
            const username = document.getElementById('audit-user-select').value;
            let url = `/api/audit/export?token=${token}`;
            if (start_date) url += `&start_date=${start_date}`;
            if (end_date) url += `&end_date=${end_date}`;
            if (username) url += `&username=${username}`;
            window.location.href = url;
        }
    },

    exportConsumptionsToExcel() {
        const token = API.getToken();
        if (token) {
            window.location.href = `/api/inventory/logs/export?token=${token}`;
        }
    },

    exportTasksToExcel() {
        const token = API.getToken();
        if (token) {
            window.location.href = `/api/tasks/export?token=${token}`;
        }
    }
};

// Start
App.init();
window.App = App;
