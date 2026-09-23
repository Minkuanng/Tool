(function() {
    'use strict';

    // ================================================================
    //  CONFIG
    // ================================================================
    const CONFIG = {
        password: 'KuanDev182@#',
        mailApi: 'https://api.mailforspam.net',
        domains: ['@mailforspam.net'],
        otpLength: 8,
        usernameLetters: 7,
        usernameNumbers: 3,
        autoReloadDelay: 2000,
        maxAccounts: 10,
        emailPrefixLength: 7,
        emailSuffixLength: 3,
        checkMailInterval: 800,
        delayBeforeFill: 1200,
        delayBetweenInputs: 400,
        delayBeforeGetOTP: 1500,
        delayBeforeSubmit: 1000,
        delayBetweenSteps: 900,
        delayAfterReload: 2500,
        jitterMin: 200,
        jitterMax: 1500
    };

    // ================================================================
    //  PERSISTENCE KEYS
    // ================================================================
    const CONFIG_KEY = 'kuandev_config_v3';
    const POS_KEY    = 'kuandev_ui_position_v3';
    const VIEW_KEY   = 'kuandev_ui_view_v8';
    const HIDE_KEY   = 'kuandev_ui_hidden_v8';

    function saveConfig() {
        try {
            localStorage.setItem(CONFIG_KEY, JSON.stringify({
                maxAccounts: CONFIG.maxAccounts,
                password: CONFIG.password,
                delayBeforeFill: CONFIG.delayBeforeFill,
                delayBetweenSteps: CONFIG.delayBetweenSteps,
                checkMailInterval: CONFIG.checkMailInterval,
                mailApi: CONFIG.mailApi,
                domains: CONFIG.domains,
                savedAt: Date.now()
            }));
            return true;
        } catch { return false; }
    }

    function loadConfig() {
        try {
            const raw = localStorage.getItem(CONFIG_KEY);
            if (!raw) return false;
            const d = JSON.parse(raw);
            if (typeof d.maxAccounts === 'number' && d.maxAccounts > 0)
                CONFIG.maxAccounts = Math.min(10000, Math.max(1, d.maxAccounts));
            if (typeof d.password === 'string' && d.password)
                CONFIG.password = d.password;
            if (typeof d.delayBeforeFill === 'number')
                CONFIG.delayBeforeFill = Math.max(0, d.delayBeforeFill);
            if (typeof d.delayBetweenSteps === 'number')
                CONFIG.delayBetweenSteps = Math.max(0, d.delayBetweenSteps);
            if (typeof d.checkMailInterval === 'number')
                CONFIG.checkMailInterval = Math.max(200, d.checkMailInterval);
            if (typeof d.mailApi === 'string' && d.mailApi)
                CONFIG.mailApi = d.mailApi;
            if (Array.isArray(d.domains) && d.domains.length)
                CONFIG.domains = d.domains;
            return true;
        } catch { return false; }
    }

    function saveUIPosition(left, top) {
        try { localStorage.setItem(POS_KEY, JSON.stringify({ left, top, ts: Date.now() })); } catch {}
    }
    function loadUIPosition() {
        try {
            const d = JSON.parse(localStorage.getItem(POS_KEY));
            if (typeof d?.left === 'number' && typeof d?.top === 'number') return d;
        } catch {}
        return null;
    }
    function saveView(v) { try { localStorage.setItem(VIEW_KEY, v); } catch {} }
    function loadView() {
        try {
            const v = localStorage.getItem(VIEW_KEY);
            if (['run','log','settings'].includes(v)) return v;
        } catch {}
        return 'run';
    }
    function saveHidden(h) { try { localStorage.setItem(HIDE_KEY, h ? '1' : '0'); } catch {} }
    function loadHidden() {
        try { return localStorage.getItem(HIDE_KEY) === '1'; } catch {}
        return false;
    }

    loadConfig();

    // ================================================================
    //  STATE
    // ================================================================
    const state = {
        isRunning: false,
        accounts: [],
        totalCreated: 0,
        successCount: 0,
        failCount: 0,
        email: '',
        username: '',
        otpCode: '',
        otpFound: false,
        isGettingOTP: false,
        checkingMail: false,
        isProcessing: false,
        stopRequested: false,
        reloadPending: false,
        targetAccounts: CONFIG.maxAccounts,
        mailCheckTimer: null,
        otpAttempts: 0,
        formFilled: false,
        userAgentIndex: 0,
        view: loadView(),
        hidden: loadHidden(),
        logs: [],
        _shouldAutoResume: false,
        _dragging: false
    };

    const THEME = {
        text:    '#ffffff',
        textDim: '#b8b8b8',
        textMut: '#707070',
        success: '#4ADE80',
        warning: '#FBBF24',
        error:   '#F87171',
        primary: '#ffffff',
        bg:      'rgba(10,10,12,.85)',
        bgPanel: 'rgba(0,0,0,.35)',
        bgInput: 'rgba(255,255,255,.06)',
        border:  'rgba(255,255,255,.12)',
        borderHi:'rgba(255,255,255,.25)'
    };

    const USER_AGENTS = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/119.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120.0.0.0 Safari/537.36'
    ];

    // ================================================================
    //  CORE HELPERS
    // ================================================================
    const $ = id => document.getElementById(id);
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const randomSleep = base => new Promise((res, rej) => {
        const extra = Math.floor(Math.random() * (CONFIG.jitterMax - CONFIG.jitterMin + 1)) + CONFIG.jitterMin;
        const total = base + extra;
        const start = Date.now();
        const tick = () => {
            if (state.stopRequested) return rej(new Error('STOPPED'));
            if (Date.now() - start >= total) return res();
            setTimeout(tick, 50);
        };
        tick();
    });
    async function waitStep(ms, label) {
        if (state.stopRequested) throw new Error('STOPPED');
        await randomSleep(ms);
    }
    function rotateUserAgent() { return USER_AGENTS[state.userAgentIndex++ % USER_AGENTS.length]; }

    // ================================================================
    //  COOKIE
    // ================================================================
    function clearAllBrowserData() {
        try {
            const keep = [CONFIG_KEY, POS_KEY, VIEW_KEY, HIDE_KEY];
            const backup = {};
            for (const k of keep) {
                const v = localStorage.getItem(k);
                if (v !== null) backup[k] = v;
            }

            document.cookie.split(";").forEach(c => {
                const name = c.split("=")[0].trim();
                if (name) {
                    document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
                    document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=" + location.hostname;
                }
            });
            localStorage.clear();
            sessionStorage.clear();

            for (const k of keep) if (backup[k] !== undefined) localStorage.setItem(k, backup[k]);

            if (caches) caches.keys().then(k => k.forEach(x => caches.delete(x))).catch(()=>{});
            return true;
        } catch { return false; }
    }

    function checkForBan() {
        const t = document.body?.textContent?.toLowerCase() || '';
        return ['account locked','suspicious','blocked','too many attempts','captcha','banned']
            .some(k => t.includes(k));
    }

    // ================================================================
    //  GENERATORS
    // ================================================================
    function generateUsername() {
        const L = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', N = '0123456789';
        let r = '';
        for (let i = 0; i < CONFIG.usernameLetters; i++) r += L[Math.floor(Math.random()*26)];
        for (let i = 0; i < CONFIG.usernameNumbers; i++) r += N[Math.floor(Math.random()*10)];
        return r.split('').sort(() => Math.random()-.5).join('');
    }
    function generateEmailUsername() {
        const c = 'abcdefghijklmnopqrstuvwxyz';
        let r = '';
        for (let i = 0; i < CONFIG.emailPrefixLength; i++) r += c[Math.floor(Math.random()*26)];
        for (let i = 0; i < CONFIG.emailSuffixLength; i++) r += Math.floor(Math.random()*10);
        return r;
    }
    async function generateEmail() {
        state.email = generateEmailUsername() + CONFIG.domains[0];
        renderStatus('📧 ' + state.email, THEME.text);
        return state.email;
    }

    // ================================================================
    //  INPUT SETTER
    // ================================================================
    function setInputValue(input, value) {
        if (!input) return false;
        input.value = value;
        ['input','change','blur','focus'].forEach(t =>
            input.dispatchEvent(new Event(t, { bubbles:true, composed:true })));
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
        if (setter?.set) {
            setter.set.call(input, value);
            input.dispatchEvent(new Event('input', { bubbles:true, composed:true }));
        }
        if (input.__vue__) input.__vue__.$emit('input', value);
        input.focus();
        setTimeout(() => input.blur(), 50);
        return true;
    }

    // ================================================================
    //  MAIL API
    // ================================================================
    async function checkMailbox() {
        if (state.checkingMail || !state.email || state.stopRequested) return;
        state.checkingMail = true;
        try {
            const res = await fetch(`${CONFIG.mailApi}/?to=${encodeURIComponent(state.email)}`,
                { headers: { 'Accept': 'application/json' } });
            if (!res.ok) throw 0;
            const data = await res.json();
            if (!data.success) { state.checkingMail = false; return; }
            const msgs = data.data || [];
            if (!msgs.length) { state.checkingMail = false; return; }
            for (const msg of msgs.sort((a,b) => (b.id||0)-(a.id||0))) {
                let text = msg.text || msg.body || '';
                if (msg.html) {
                    const d = document.createElement('div');
                    d.innerHTML = msg.html;
                    text = d.textContent || '';
                }
                if (/garena|xác thực|verification|đăng ký|mã/i.test(text)) {
                    const otp = extractOTP(text);
                    if (otp) {
                        state.otpCode = otp;
                        state.otpFound = true;
                        renderStatus('🎯 OTP: ' + otp, THEME.success);
                        addLog('🎯', `Nhận OTP: ${otp}`);
                        toast('🎯 Nhận được OTP: ' + otp, 'success');
                        state.checkingMail = false;
                        clearInterval(state.mailCheckTimer);
                        state.mailCheckTimer = null;
                        await fillOTP(otp);
                        return;
                    }
                }
            }
            state.checkingMail = false;
        } catch { state.checkingMail = false; }
    }

    function startAutoCheckMail() {
        clearInterval(state.mailCheckTimer);
        state.otpFound = false; state.otpCode = ''; state.otpAttempts = 0;
        renderStatus('📡 Đang check mail...', THEME.text);
        checkMailbox();
        state.mailCheckTimer = setInterval(() => {
            if (state.stopRequested) { clearInterval(state.mailCheckTimer); state.mailCheckTimer = null; return; }
            state.otpAttempts++;
            checkMailbox();
        }, CONFIG.checkMailInterval);
    }
    function stopAutoCheckMail() { clearInterval(state.mailCheckTimer); state.mailCheckTimer = null; }

    function extractOTP(text) {
        if (!text) return null;
        const matches = text.match(/\b\d{8}\b/g);
        if (matches) {
            for (const m of matches) {
                const i = text.indexOf(m);
                const ctx = text.substring(Math.max(0,i-100), Math.min(text.length,i+100)).toLowerCase();
                if (/mã|code|otp|xác thực|xác nhận|verify|garena/i.test(ctx)) return m;
            }
        }
        return text.match(/\d{8}/)?.[0] || null;
    }

    // ================================================================
    //  BYPASS OTP BUTTON
    // ================================================================
    async function bypassGetOTPButton() {
        if (state.stopRequested) throw new Error('STOPPED');
        await waitStep(CONFIG.delayBeforeGetOTP, 'trước "Nhận mã"');
        renderStatus('⚡ Tìm nút Nhận Mã...', THEME.warning);

        const selectors = ['button','[role="button"]','input[type="button"]','input[type="submit"]',
                          '.btn-primary','.btn-submit','[class*="submit"]','[class*="get-code"]','[class*="send-code"]'];
        const kws = ['gửi mã','nhận mã','lấy mã','xác thực','xác nhận','send code','get code','verify','otp','verification'];
        const btns = [...new Set(selectors.flatMap(s => [...document.querySelectorAll(s)]))]
            .filter(b => b.offsetParent !== null);
        let best = null, bestScore = -1;
        for (const b of btns) {
            if (b.disabled) continue;
            const t = (b.textContent || b.value || '').toLowerCase();
            const c = t + (b.id||'') + (b.name||'') + (b.className||'');
            let sc = 0;
            for (const k of kws) if (c.includes(k)) sc += k.length * 2;
            if (/gửi|send/.test(t)) sc += 20;
            if (/nhận|get/.test(t)) sc += 20;
            if (/mã|code/.test(t)) sc += 15;
            if (/xác|verify/.test(t)) sc += 15;
            if (/otp/.test(t)) sc += 20;
            if (sc > bestScore) { bestScore = sc; best = b; }
        }
        if (best && bestScore > 0) {
            try {
                best.click();
                renderStatus('📱 Đã gửi yêu cầu OTP', THEME.success);
                startAutoCheckMail();
                return true;
            } catch {}
        }
        for (const f of document.querySelectorAll('form')) {
            try { f.submit(); startAutoCheckMail(); return true; } catch {}
        }
        return false;
    }

    // ================================================================
    //  BYPASS FORM
    // ================================================================
    async function bypassForm() {
        if (state.isProcessing || state.stopRequested) return false;
        state.isProcessing = true;
        try {
            const { username, email } = state;
            if (!username || !email) { state.isProcessing = false; return false; }
            await waitStep(CONFIG.delayBeforeFill, 'trước khi điền form');
            renderStatus('⚡ Điền form...', THEME.warning);
            renderProgress(30, 'Bypass form');
            if (checkForBan()) { clearAllBrowserData(); state.isProcessing = false; return false; }

            const allInputs = document.querySelectorAll('input:not([type="hidden"])');
            const allPasswords = document.querySelectorAll('input[type="password"]');
            let uField=null, eField=null, pField=null, cField=null;

            for (const i of allInputs) {
                if (i.disabled || i.readOnly || i.offsetParent === null) continue;
                const p = (i.placeholder||'').toLowerCase();
                const c = p + (i.id||'') + (i.name||'') + (i.className||'');
                if (!uField && /username|user|tên đăng nhập|ten dang nhap|tên/i.test(c) && i.type !== 'password') uField = i;
                if (!eField && (i.type === 'email' || /email|mail|thư/i.test(c)) && i.type !== 'password') eField = i;
            }
            const pwds = [...allPasswords].filter(p => !p.disabled && !p.readOnly && p.offsetParent !== null);
            if (pwds.length >= 2) { pField = pwds[0]; cField = pwds[1]; }
            else if (pwds.length === 1) {
                pField = pwds[0];
                for (const i of allInputs) {
                    if (i.type === 'password' && i !== pField) {
                        const p = (i.placeholder||'').toLowerCase();
                        if (/nhập lại|confirm|xác nhận|again|re-enter|retype/i.test(p)) { cField = i; break; }
                    }
                }
            }
            if (uField) { setInputValue(uField, username); await randomSleep(CONFIG.delayBetweenInputs); }
            if (eField) { setInputValue(eField, email);       await randomSleep(CONFIG.delayBetweenInputs); }
            if (pField) { setInputValue(pField, CONFIG.password); await randomSleep(CONFIG.delayBetweenInputs); }
            if (cField) { setInputValue(cField, CONFIG.password); await randomSleep(CONFIG.delayBetweenInputs); }

            state.formFilled = true;
            renderProgress(50, 'Đã điền form');
            renderStatus('✅ Form đã điền', THEME.success);
            state.isProcessing = false;
            return true;
        } catch (e) {
            state.isProcessing = false;
            if (e.message === 'STOPPED') throw e;
            return false;
        }
    }

    // ================================================================
    //  FILL OTP
    // ================================================================
    async function fillOTP(otp) {
        if (!otp || state.stopRequested) return false;
        renderStatus('⚡ Điền OTP...', THEME.warning);
        for (const i of document.querySelectorAll('input')) {
            if (i.disabled || i.readOnly || i.offsetParent === null) continue;
            const c = (i.placeholder||'') + (i.id||'') + (i.name||'');
            if (/otp|mã|code|xác thực|xac thuc|xác minh|verification/i.test(c) ||
                i.maxLength === CONFIG.otpLength || i.type === 'tel') {
                setInputValue(i, otp);
                renderStatus('✅ Đã điền OTP', THEME.success);
                renderProgress(90, '✅ OTP đã điền');
                await randomSleep(CONFIG.delayBeforeSubmit);
                await clickSubmit();
                return true;
            }
        }
        return false;
    }

    // ================================================================
    //  SUBMIT
    // ================================================================
    async function clickSubmit() {
        try {
            if (state.stopRequested) throw new Error('STOPPED');
            await waitStep(CONFIG.delayBeforeSubmit, 'trước khi submit');
            const btns = document.querySelectorAll('button, input[type="button"], input[type="submit"]');
            let s = null;
            for (const b of btns) {
                if (b.disabled || b.offsetParent === null) continue;
                const t = (b.textContent || b.value || '').toLowerCase();
                if (/đăng ký|đăng ky|register|sign up|submit|xác nhận|create account|tạo tài khoản/i.test(t)) { s = b; break; }
            }
            if (!s) {
                for (const b of document.querySelectorAll('.btn-primary,.btn-submit,.submit-btn,[class*="submit"],[class*="register"]')) {
                    if (!b.disabled && b.offsetParent !== null) { s = b; break; }
                }
            }
            if (s && !s.disabled) {
                s.click();
                renderStatus('✅ Đã gửi đăng ký!', THEME.success);
                renderProgress(100, '✅ Hoàn tất!');
                return true;
            }
            for (const f of document.querySelectorAll('form')) { try { f.submit(); return true; } catch {} }
            return false;
        } catch (e) {
            if (e.message === 'STOPPED') throw e;
            return false;
        }
    }

    // ================================================================
    //  AUTO GET OTP
    // ================================================================
    async function autoGetOTP() {
        if (state.isGettingOTP || state.stopRequested) return;
        state.isGettingOTP = true;
        state.otpCode = ''; state.otpFound = false;
        renderStatus('📱 Đang nhận OTP...', THEME.warning);
        renderProgress(60, 'Đang nhận OTP');
        try {
            let ok = false;
            for (let i = 0; i < 3; i++) {
                if (state.stopRequested) throw new Error('STOPPED');
                if (await bypassGetOTPButton()) { ok = true; break; }
                await randomSleep(1500);
            }
            if (!ok) { state.isGettingOTP = false; return; }
            let w = 0;
            while (!state.otpFound && w < 60 && !state.stopRequested) {
                await randomSleep(CONFIG.checkMailInterval);
                w++;
                renderProgress(60 + Math.min((w/60)*30, 30), `Đợi OTP ${w}/60`);
                if (w % 15 === 0) await bypassGetOTPButton();
            }
            if (state.otpFound && state.otpCode) {
                renderProgress(95, '✅ OTP nhận thành công');
                state.isGettingOTP = false;
                return;
            }
            renderStatus('❌ Không nhận được OTP', THEME.error);
            addLog('❌', 'Không nhận được OTP — thử lại');
            state.isGettingOTP = false;
        } catch (e) {
            state.isGettingOTP = false;
            if (e.message === 'STOPPED') throw e;
        }
    }

    // ================================================================
    //  RELOAD & RESTORE
    // ================================================================
    function autoReload() {
        if (state.reloadPending) return;
        state.reloadPending = true;
        renderStatus('🔄 Reloading...', THEME.warning);
        saveConfig();
        persistCurrentPosition();

        localStorage.setItem('kuandev_reload_data', JSON.stringify({
            shouldReload: true,
            shouldAutoResume: !state.stopRequested,
            accounts: state.accounts,
            totalCreated: state.totalCreated,
            successCount: state.successCount,
            failCount: state.failCount,
            targetAccounts: state.targetAccounts,
            timestamp: Date.now()
        }));
        stopAutoCheckMail();
        setTimeout(() => location.reload(), CONFIG.autoReloadDelay);
    }

    function checkAndRestore() {
        try {
            const d = JSON.parse(localStorage.getItem('kuandev_reload_data'));
            if (d?.shouldReload) {
                localStorage.removeItem('kuandev_reload_data');
                state.accounts = d.accounts || [];
                state.totalCreated = d.totalCreated || 0;
                state.successCount = d.successCount || state.totalCreated;
                state.failCount = d.failCount || 0;
                state.targetAccounts = CONFIG.maxAccounts;
                state._shouldAutoResume = !!d.shouldAutoResume;
                return true;
            }
        } catch {}
        return false;
    }

    function persistCurrentPosition() {
        const ui = $('kuandev-ui');
        if (!ui || ui.style.display === 'none') return;
        const r = ui.getBoundingClientRect();
        saveUIPosition(r.left, r.top);
    }

    // ================================================================
    //  DOWNLOAD
    // ================================================================
    function downloadAccounts() {
        if (!state.accounts.length) {
            toast('⚠ Chưa có tài khoản nào để tải', 'warn');
            return;
        }
        const content = state.accounts.map((a, i) =>
            `[${i+1}] Username: ${a.username}\n    Email: ${a.email}\n    Password: ${a.password}\n    OTP: ${a.otp || 'N/A'}\n    Created: ${a.created}\n`
        ).join('\n');
        const blob = new Blob([`=== KuanDev Smart v3.8 ===\nNgày: ${new Date().toLocaleString('vi-VN')}\nTổng: ${state.accounts.length}\nThành công: ${state.successCount} | Lỗi: ${state.failCount}\n${'='.repeat(50)}\n\n${content}`],
            { type: 'text/plain;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `KuanDev_${Date.now()}.txt`;
        a.click();
        URL.revokeObjectURL(a.href);
        toast('⬇ Đã tải file kết quả', 'success');
    }

    // ================================================================
    //  MAIN PROCESS
    // ================================================================
    async function startProcess() {
        if (state.isRunning) return;

        const inputTarget = document.getElementById('cfg-target');
        if (inputTarget) {
            const v = Math.min(10000, Math.max(1, +inputTarget.value || CONFIG.maxAccounts));
            CONFIG.maxAccounts = v;
            saveConfig();
        }
        state.targetAccounts = CONFIG.maxAccounts;

        state.isRunning = true;
        state.stopRequested = false;
        state.reloadPending = false;
        state.totalCreated = state.accounts.length;
        state.successCount = state.accounts.length;
        state.failCount = 0;

        renderStatus('🚀 Đang chạy...', THEME.text);
        renderProgress(0, 'Bắt đầu...');
        addLog('🚀', `Bắt đầu — mục tiêu ${state.targetAccounts} acc`);
        updateButtons();
        updateStats();

        switchView('log');

        while (state.totalCreated < state.targetAccounts && !state.stopRequested) {
            try {
                if (state.stopRequested) throw new Error('STOPPED');
                if (checkForBan()) {
                    addLog('⚠️', 'Phát hiện dấu hiệu ban — xóa dữ liệu & reload');
                    state.failCount++;
                    updateStats();
                    clearAllBrowserData();
                    await waitStep(2000, 'tránh ban');
                    autoReload();
                    return;
                }
                const cur = state.totalCreated + 1;
                renderStatus(`📌 Đang tạo #${cur}/${state.targetAccounts}`, THEME.warning);
                renderProgress((state.totalCreated / state.targetAccounts) * 100, `#${cur}/${state.targetAccounts}`);

                state.username = generateUsername();
                await generateEmail();
                await waitStep(CONFIG.delayBetweenSteps, 'giữa các bước');
                if (state.stopRequested) throw new Error('STOPPED');

                if (!await bypassForm()) {
                    state.failCount++;
                    updateStats();
                    addLog('❌', `Lỗi điền form — bỏ qua #${cur}`);
                    await randomSleep(2000);
                    continue;
                }
                if (state.stopRequested) throw new Error('STOPPED');

                await waitStep(CONFIG.delayBetweenSteps, 'trước khi lấy OTP');
                await autoGetOTP();
                if (state.stopRequested) throw new Error('STOPPED');

                if (state.otpFound && state.otpCode) {
                    state.accounts.push({
                        username: state.username,
                        email: state.email,
                        password: CONFIG.password,
                        otp: state.otpCode,
                        created: new Date().toLocaleString('vi-VN')
                    });
                    state.totalCreated++;
                    state.successCount++;
                    renderStatus(`✅ #${state.totalCreated} thành công`, THEME.success);
                    addLog('✅', `Tạo thành công acc #${state.totalCreated} / ${state.targetAccounts}`);
                    toast(`✅ Tạo thành công acc #${state.totalCreated}`, 'success');
                    updateAccountsCount();
                    updateStats();
                    await waitStep(CONFIG.delayAfterReload, 'trước khi reload');
                    if (state.stopRequested) throw new Error('STOPPED');
                    clearAllBrowserData();
                    rotateUserAgent();
                    if (state.totalCreated < state.targetAccounts) {
                        addLog('🔄', 'Reload để chạy acc tiếp theo...');
                        autoReload();
                        return;
                    }
                } else {
                    stopAutoCheckMail();
                    state.failCount++;
                    updateStats();
                    await randomSleep(1500);
                    state.otpFound = false; state.otpCode = '';
                }
            } catch (e) {
                stopAutoCheckMail();
                if (e.message === 'STOPPED') break;
                state.failCount++;
                updateStats();
                addLog('⚠️', 'Lỗi bước — thử lại');
                await randomSleep(2000);
            }
        }

        if (state.totalCreated >= state.targetAccounts || state.stopRequested) {
            renderStatus(`✅ Hoàn tất ${state.totalCreated} acc`, THEME.success);
            renderProgress(100, `✅ ${state.totalCreated} acc`);
            addLog('🎉', `Hoàn tất — ${state.successCount} thành công / ${state.failCount} lỗi`);
            stopAutoCheckMail();
            clearAllBrowserData();
            if (state.accounts.length) downloadAccounts();
            if (state.totalCreated >= state.targetAccounts) toast('🎉 Hoàn tất mục tiêu!', 'success');
        }
        state.isRunning = false;
        updateButtons();
    }

    function stopProcess() {
        state.stopRequested = true;
        state.isRunning = false;
        state.reloadPending = true;
        stopAutoCheckMail();
        try {
            const d = JSON.parse(localStorage.getItem('kuandev_reload_data'));
            if (d) { d.shouldAutoResume = false; localStorage.setItem('kuandev_reload_data', JSON.stringify(d)); }
        } catch {}
        renderStatus('⏹ Đã dừng', THEME.error);
        addLog('⏹', 'Người dùng đã dừng tool');
        toast('⏹ Đã dừng tool', 'error');
        updateButtons();
        switchView('run');
    }

    // ================================================================
    //  TOAST
    // ================================================================
    function toast(msg, type = 'info') {
        const colors = { success: THEME.success, error: THEME.error, info: THEME.text, warn: THEME.warning };
        const el = document.createElement('div');
        el.style.cssText = `
            position:fixed;
            bottom:65vh;
            right:20px;
            transform:translateX(30px);
            background:rgba(10,10,12,.94);
            border:1px solid ${colors[type]};
            color:${colors[type]};
            padding:8px 16px;
            border-radius:8px;
            font-family:'Consolas',monospace;
            font-size:12px;
            z-index:9999999;
            box-shadow:0 8px 24px rgba(0,0,0,.6);
            opacity:0;
            transition:opacity .25s, transform .25s;
            pointer-events:none;
            max-width:320px;
            word-wrap:break-word;
        `;
        el.textContent = msg;
        document.body.appendChild(el);
        requestAnimationFrame(() => {
            el.style.opacity = '1';
            el.style.transform = 'translateX(0)';
        });
        setTimeout(() => {
            el.style.opacity = '0';
            el.style.transform = 'translateX(30px)';
            setTimeout(() => el.remove(), 300);
        }, 2200);
    }

    // ================================================================
    //  ICON TOGGLE
    // ================================================================
    function createToggleIcon() {
        $('kuandev-toggle')?.remove();
        const btn = document.createElement('div');
        btn.id = 'kuandev-toggle';
        btn.title = 'Bật / Tắt menu KuanDev';
        btn.textContent = '🛠';
        btn.style.cssText = `
            position:fixed; bottom:12px; right:12px; z-index:9999998;
            width:26px; height:26px;
            background:rgba(10,10,12,.88);
            border:1px solid rgba(255,255,255,.18);
            border-radius:5px;
            display:flex;align-items:center;justify-content:center;
            font-size:13px; cursor:pointer;
            box-shadow:0 3px 10px rgba(0,0,0,.5);
            transition:transform .15s, background .15s;
            user-select:none;
            line-height:1;
        `;
        btn.addEventListener('mouseenter', () => {
            btn.style.transform = 'scale(1.08)';
            btn.style.background = 'rgba(35,35,42,.95)';
        });
        btn.addEventListener('mouseleave', () => {
            btn.style.transform = 'scale(1)';
            btn.style.background = 'rgba(10,10,12,.88)';
        });
        btn.addEventListener('click', () => {
            state.hidden = !state.hidden;
            saveHidden(state.hidden);
            applyVisibility();
            toast(state.hidden ? '👁 Đã ẩn menu' : '👁 Đã hiện menu', 'info');
        });
        document.body.appendChild(btn);
    }

    function applyVisibility() {
        const ui = $('kuandev-ui');
        if (!ui) return;
        ui.style.display = state.hidden ? 'none' : '';
    }

    // ================================================================
    //  UI
    // ================================================================
    const CONTENT_HEIGHT = 310;

    function createUI() {
        $('kuandev-ui')?.remove();

        const c = document.createElement('div');
        c.id = 'kuandev-ui';
        c.style.cssText = `
            position:fixed; top:12px; right:12px; z-index:999999;
            font-family:'Consolas','Segoe UI',monospace; user-select:none;
            font-size:11px; line-height:1.5;
            touch-action:none;
            overscroll-behavior:contain;
        `;

        c.innerHTML = `
        <div id="kuan-box" style="
            background:${THEME.bg};
            backdrop-filter:blur(18px) saturate(1.2);
            border:1px solid ${THEME.border};
            border-radius:12px;
            box-shadow:0 12px 40px rgba(0,0,0,.7), 0 0 0 1px rgba(255,255,255,.04) inset;
            color:${THEME.text}; box-sizing:border-box;
            width:240px; overflow:hidden;
        ">
            <!-- HEADER -->
            <div id="kuan-header" style="
                display:flex; align-items:center; justify-content:space-between;
                padding:8px 10px;
                border-bottom:1px solid ${THEME.border};
                cursor:move;
                touch-action:none;
            ">
                <div style="display:flex;align-items:center;gap:7px;">
                    <span id="kuan-dot" style="color:${THEME.success};font-size:10px;">●</span>
                    <span style="font-weight:bold;color:${THEME.text};letter-spacing:.6px;">KUANDEV</span>
                    <span style="color:${THEME.textMut};font-size:9px;">v3.8</span>
                </div>
                <div style="display:flex;align-items:center;gap:2px;">
                    <button id="kuan-settings-btn" title="Cài đặt" style="
                        background:transparent;border:none;color:${THEME.textDim};cursor:pointer;
                        font-size:14px;line-height:1;padding:2px 5px;font-family:inherit;
                        border-radius:4px;transition:background .15s;
                    ">⚙️</button>
                    <button id="kuan-close" title="Ẩn menu (dùng icon 🛠 dưới web để mở lại)" style="
                        background:transparent;border:none;color:${THEME.textDim};cursor:pointer;
                        font-size:14px;line-height:1;padding:2px 5px;font-family:inherit;
                        border-radius:4px;transition:background .15s;
                    ">×</button>
                </div>
            </div>

            <!-- CONTENT (chiều cao cố định) -->
            <div id="kuan-content" style="padding:12px; height:${CONTENT_HEIGHT}px; overflow:hidden;">

                <!-- VIEW: RUN -->
                <div data-view="run" style="height:100%; display:flex; flex-direction:column;">
                    <div style="
                        display:flex;justify-content:space-between;align-items:center;
                        background:${THEME.bgPanel};border-radius:8px;padding:7px 9px;
                        margin-bottom:8px;
                    ">
                        <div style="display:flex;align-items:center;gap:6px;min-width:0;flex:1;">
                            <span style="color:${THEME.textMut};font-size:9px;">●</span>
                            <span id="kuan-status" style="color:${THEME.text};font-size:11px;
                                white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Sẵn sàng</span>
                        </div>
                        <span id="kuan-progress-text" style="color:${THEME.text};font-weight:bold;font-size:10px;">0%</span>
                    </div>

                    <div style="height:5px;background:rgba(255,255,255,.08);border-radius:3px;overflow:hidden;margin-bottom:10px;">
                        <div id="kuan-progress-bar" style="width:0%;height:100%;
                            background:linear-gradient(90deg,#ffffff,#b8b8b8);
                            transition:width .4s ease;"></div>
                    </div>

                    <!-- Grid stats: ĐÃ TẠO | MỤC TIÊU -->
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px;">
                        <div class="kuan-cell">
                            <div class="kuan-label">ĐÃ TẠO</div>
                            <div id="kuan-accounts-count" class="kuan-value" style="color:${THEME.success};">0</div>
                        </div>
                        <div class="kuan-cell">
                            <div class="kuan-label">MỤC TIÊU</div>
                            <div id="kuan-target" class="kuan-value" style="color:${THEME.warning};">${CONFIG.maxAccounts}</div>
                        </div>
                    </div>

                    <!-- Grid stats: THÀNH CÔNG | LỖI -->
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px;">
                        <div class="kuan-cell">
                            <div class="kuan-label">✓ THÀNH CÔNG</div>
                            <div id="kuan-success" class="kuan-value" style="color:${THEME.success};">0</div>
                        </div>
                        <div class="kuan-cell">
                            <div class="kuan-label">✗ LỖI</div>
                            <div id="kuan-fail" class="kuan-value" style="color:${THEME.error};">0</div>
                        </div>
                    </div>

                    <!-- USERNAME -->
                    <div class="kuan-cell" style="margin-bottom:6px;">
                        <div class="kuan-label">USERNAME</div>
                        <div id="kuan-username" class="kuan-value kuan-copy" style="color:${THEME.text};font-size:12px;cursor:pointer;" title="Click để copy">—</div>
                    </div>

                    <!-- EMAIL -->
                    <div class="kuan-cell" style="margin-bottom:0;">
                        <div class="kuan-label">EMAIL</div>
                        <div id="kuan-email" class="kuan-value kuan-copy" style="color:${THEME.textDim};font-size:10px;cursor:pointer;" title="Click để copy">—</div>
                    </div>

                    <!-- HÀNG NÚT — cách trên 14px cho thoáng -->
                    <div style="display:flex;gap:6px;margin-top:auto;padding-top:14px;">
                        <button id="kuan-start" class="kuan-btn kuan-btn-start">▶ BẮT ĐẦU</button>
                        <button id="kuan-stop" class="kuan-btn kuan-btn-stop">■ DỪNG</button>
                        <button id="kuan-download" class="kuan-btn kuan-btn-dl" title="Tải file kết quả">⬇</button>
                    </div>
                </div>

                <!-- VIEW: LOG -->
                <div data-view="log" style="height:100%; display:none; flex-direction:column;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                        <button id="kuan-back-1" class="kuan-back">← Quay lại</button>
                        <span style="color:${THEME.textMut};font-size:10px;">NHẬT KÝ</span>
                    </div>
                    <div id="kuan-log" style="
                        flex:1;overflow-y:auto;padding:6px 8px;
                        font-size:10px;line-height:1.75;color:${THEME.textDim};
                        background:${THEME.bgPanel};border-radius:8px;
                        scrollbar-width:thin;
                    "></div>
                    <div style="display:flex;gap:6px;margin-top:8px;">
                        <button id="kuan-clear-log" class="kuan-btn" style="flex:1;background:rgba(248,113,113,.1);border-color:rgba(248,113,113,.35);color:${THEME.error};">🗑 Xóa log</button>
                    </div>
                </div>

                <!-- VIEW: SETTINGS -->
                <div data-view="settings" style="height:100%; display:none; flex-direction:column;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                        <button id="kuan-back-2" class="kuan-back">← Quay lại</button>
                        <span style="color:${THEME.textMut};font-size:10px;">CÀI ĐẶT</span>
                    </div>
                    <div style="flex:1;overflow-y:auto;">
                        <div class="kuan-setting">
                            <label>Mục tiêu (accounts)</label>
                            <input type="number" id="cfg-target" value="${CONFIG.maxAccounts}" min="1" max="10000">
                        </div>
                        <div class="kuan-setting">
                            <label>Password</label>
                            <input type="text" id="cfg-password" value="${CONFIG.password}">
                        </div>
                        <div class="kuan-setting">
                            <label>Delay trước khi điền</label>
                            <input type="number" id="cfg-delay-fill" value="${CONFIG.delayBeforeFill}" min="0" max="10000">
                        </div>
                        <div class="kuan-setting">
                            <label>Delay giữa các bước</label>
                            <input type="number" id="cfg-delay-step" value="${CONFIG.delayBetweenSteps}" min="0" max="10000">
                        </div>
                        <div class="kuan-setting">
                            <label>Check mail interval</label>
                            <input type="number" id="cfg-mail-interval" value="${CONFIG.checkMailInterval}" min="200" max="5000">
                        </div>
                    </div>
                    <div style="display:flex;gap:6px;margin-top:8px;">
                        <button id="cfg-save" class="kuan-btn kuan-btn-start" style="flex:2;">💾 LƯU</button>
                        <button id="cfg-reset" class="kuan-btn" style="flex:1;background:rgba(248,113,113,.1);border-color:rgba(248,113,113,.35);color:${THEME.error};">↺ Reset</button>
                    </div>
                </div>
            </div>

            <!-- FOOTER -->
            <div id="kuan-footer" style="
                display:flex;justify-content:space-between;align-items:center;
                padding:5px 12px;border-top:1px solid ${THEME.border};
                font-size:9px;color:${THEME.textMut};
            ">
                <span><span id="kuan-status-dot" style="color:${THEME.success};">●</span> READY</span>
                <span>RUN: <b id="kuan-run-count" style="color:${THEME.text};">0</b></span>
            </div>
        </div>`;

        document.body.appendChild(c);

        const style = document.createElement('style');
        style.textContent = `
            #kuandev-ui * { box-sizing: border-box; }
            .kuan-cell {
                background:${THEME.bgPanel};border-radius:8px;padding:6px 9px;
            }
            .kuan-label { color:${THEME.textMut};font-size:9px;letter-spacing:.6px; }
            .kuan-value { font-weight:bold;font-size:12px;margin-top:2px;
                white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }
            .kuan-copy:hover { color:${THEME.text} !important; }
            .kuan-btn {
                flex:1;padding:7px 8px;border-radius:8px;cursor:pointer;
                font-family:inherit;font-size:11px;font-weight:bold;
                transition:all .15s;
            }
            .kuan-btn:hover:not(:disabled) { filter:brightness(1.35); }
            .kuan-btn:active:not(:disabled) { transform:translateY(1px); }
            .kuan-btn:disabled { opacity:.35;cursor:not-allowed; }
            .kuan-btn-start { background:rgba(74,222,128,.12);border:1px solid rgba(74,222,128,.45);color:${THEME.success}; }
            .kuan-btn-stop  { background:rgba(248,113,113,.12);border:1px solid rgba(248,113,113,.45);color:${THEME.error}; }
            .kuan-btn-dl    { background:rgba(255,255,255,.06);border:1px solid ${THEME.border};color:${THEME.text};flex:0 0 38px; }
            .kuan-back {
                background:transparent;border:1px solid ${THEME.border};
                color:${THEME.textDim};border-radius:6px;cursor:pointer;
                font-family:inherit;font-size:10px;padding:3px 8px;
                transition:all .15s;
            }
            .kuan-back:hover { color:${THEME.text}; border-color:${THEME.borderHi}; }
            .kuan-setting {
                display:flex;justify-content:space-between;align-items:center;
                padding:5px 0;border-bottom:1px dashed rgba(255,255,255,.06);
            }
            .kuan-setting label { color:${THEME.textDim};font-size:10px; }
            .kuan-setting input {
                background:${THEME.bgInput};border:1px solid ${THEME.border};
                color:${THEME.text};border-radius:6px;padding:4px 7px;
                font-family:inherit;font-size:10px;width:110px;outline:none;
                transition:border-color .15s;
            }
            .kuan-setting input:focus { border-color:${THEME.borderHi}; }
            #kuan-log::-webkit-scrollbar { width:4px; }
            #kuan-log::-webkit-scrollbar-thumb { background:rgba(255,255,255,.2);border-radius:2px; }
            #kuan-log::-webkit-scrollbar-track { background:transparent; }
            #kuan-header button:hover { background:rgba(255,255,255,.08) !important; }
            #kuan-header { cursor: move; }
            #kuan-header:active { cursor: grabbing; }
        `;
        document.head.appendChild(style);

        // ============ EVENTS ============
        $('kuan-start').addEventListener('click', () => {
            if (state.isRunning) return;
            startProcess();
        });
        $('kuan-stop').addEventListener('click', stopProcess);
        $('kuan-download').addEventListener('click', downloadAccounts);

        $('kuan-settings-btn').addEventListener('click', () => switchView('settings'));
        $('kuan-back-1').addEventListener('click', () => switchView('run'));
        $('kuan-back-2').addEventListener('click', () => switchView('run'));

        $('kuan-close').addEventListener('click', () => {
            state.hidden = true;
            saveHidden(true);
            applyVisibility();
            toast('👁 Đã ẩn — bấm 🛠 để mở lại', 'info');
        });

        $('kuan-clear-log').addEventListener('click', () => {
            state.logs = [];
            renderLogs();
        });

        ['kuan-username', 'kuan-email'].forEach(id => {
            $(id).addEventListener('click', () => {
                const v = $(id).textContent.trim();
                if (v && v !== '—') {
                    navigator.clipboard.writeText(v).then(() => toast('📋 Đã copy: ' + v, 'info'));
                }
            });
        });

        $('cfg-save').addEventListener('click', () => {
            const newTarget = Math.min(10000, Math.max(1, +$('cfg-target').value || 10));
            CONFIG.maxAccounts = newTarget;
            CONFIG.password = $('cfg-password').value.trim() || CONFIG.password;
            CONFIG.delayBeforeFill = Math.max(0, +$('cfg-delay-fill').value || 0);
            CONFIG.delayBetweenSteps = Math.max(0, +$('cfg-delay-step').value || 0);
            CONFIG.checkMailInterval = Math.max(200, +$('cfg-mail-interval').value || 800);

            state.targetAccounts = newTarget;
            $('kuan-target').textContent = newTarget;
            $('cfg-target').value = newTarget;

            const ok = saveConfig();
            toast(ok ? `💾 Đã lưu (target: ${newTarget})` : '⚠ Lưu thất bại', ok ? 'success' : 'error');
        });

        $('cfg-reset').addEventListener('click', () => {
            if (!confirm('Khôi phục cài đặt mặc định?')) return;
            localStorage.removeItem(CONFIG_KEY);
            CONFIG.maxAccounts = 10;
            CONFIG.password = 'KuanDev182@#';
            CONFIG.delayBeforeFill = 1200;
            CONFIG.delayBetweenSteps = 900;
            CONFIG.checkMailInterval = 800;
            state.targetAccounts = 10;

            $('kuan-target').textContent = 10;
            $('cfg-target').value = 10;
            $('cfg-password').value = CONFIG.password;
            $('cfg-delay-fill').value = CONFIG.delayBeforeFill;
            $('cfg-delay-step').value = CONFIG.delayBetweenSteps;
            $('cfg-mail-interval').value = CONFIG.checkMailInterval;

            toast('↺ Đã khôi phục mặc định', 'info');
        });

        makeDraggable(c, $('kuan-header'));

        switchView(state.view || 'run');
        updateButtons();
        updateAccountsCount();
        updateStats();
        return c;
    }

    // ================================================================
    //  VIEW SWITCHER
    // ================================================================
    function switchView(name) {
        state.view = name;
        saveView(name);

        document.querySelectorAll('#kuan-content [data-view]').forEach(v => {
            const show = v.dataset.view === name;
            v.style.display = show ? 'flex' : 'none';
        });

        if (name === 'settings') {
            const el = id => document.getElementById(id);
            if (el('cfg-target'))         el('cfg-target').value         = CONFIG.maxAccounts;
            if (el('cfg-password'))       el('cfg-password').value       = CONFIG.password;
            if (el('cfg-delay-fill'))     el('cfg-delay-fill').value     = CONFIG.delayBeforeFill;
            if (el('cfg-delay-step'))     el('cfg-delay-step').value     = CONFIG.delayBetweenSteps;
            if (el('cfg-mail-interval'))  el('cfg-mail-interval').value  = CONFIG.checkMailInterval;
        }
        if (name === 'log') renderLogs();
    }

    // ================================================================
    //  DRAG  —  FIX LỖI KÉO XUỐNG DƯỚI BỊ RELOAD TRANG
    // ================================================================
    function makeDraggable(container, handle) {
        let ox = 0, oy = 0, sx = 0, sy = 0, dragging = false;

        const startDrag = (clientX, clientY, ev) => {
            if (ev && ev.cancelable) ev.preventDefault();
            const r = container.getBoundingClientRect();
            container.style.right = 'auto';
            container.style.bottom = 'auto';
            container.style.left = r.left + 'px';
            container.style.top = r.top + 'px';
            sx = clientX; sy = clientY; ox = r.left; oy = r.top;
            dragging = true;
            state._dragging = true;
            document.body.style.userSelect = 'none';
            document.body.style.overscrollBehavior = 'none';
            document.documentElement.style.overscrollBehavior = 'none';
        };

        const moveDrag = (clientX, clientY, ev) => {
            if (!dragging) return;
            if (ev && ev.cancelable) ev.preventDefault();
            let nx = ox + clientX - sx;
            let ny = oy + clientY - sy;
            const maxX = window.innerWidth - container.offsetWidth;
            const maxY = window.innerHeight - container.offsetHeight;
            nx = Math.max(0, Math.min(maxX, nx));
            ny = Math.max(0, Math.min(maxY, ny));
            container.style.left = nx + 'px';
            container.style.top = ny + 'px';
        };

        const endDrag = () => {
            if (!dragging) return;
            dragging = false;
            state._dragging = false;
            document.body.style.userSelect = '';
            document.body.style.overscrollBehavior = '';
            document.documentElement.style.overscrollBehavior = '';
            const r = container.getBoundingClientRect();
            saveUIPosition(r.left, r.top);
        };

        // --- MOUSE ---
        handle.addEventListener('mousedown', e => {
            if (e.target.tagName === 'BUTTON') return;
            e.preventDefault();
            startDrag(e.clientX, e.clientY, e);
        });
        document.addEventListener('mousemove', e => moveDrag(e.clientX, e.clientY, e));
        document.addEventListener('mouseup', endDrag);

        // --- TOUCH (chặn scroll/reload) ---
        handle.addEventListener('touchstart', e => {
            if (e.target.tagName === 'BUTTON') return;
            const t = e.touches[0];
            startDrag(t.clientX, t.clientY, e);
        }, { passive: false });

        document.addEventListener('touchmove', e => {
            if (!dragging) return;
            e.preventDefault();
            const t = e.touches[0];
            moveDrag(t.clientX, t.clientY, e);
        }, { passive: false });

        document.addEventListener('touchend', endDrag);
        document.addEventListener('touchcancel', endDrag);

        handle.addEventListener('contextmenu', e => e.preventDefault());
    }

    function restoreUIPosition() {
        const ui = $('kuandev-ui');
        if (!ui) return;
        const pos = loadUIPosition();
        if (!pos) return;
        const maxX = window.innerWidth - 60;
        const maxY = window.innerHeight - 60;
        const left = Math.max(0, Math.min(maxX, pos.left));
        const top = Math.max(0, Math.min(maxY, pos.top));
        ui.style.right = 'auto';
        ui.style.bottom = 'auto';
        ui.style.left = left + 'px';
        ui.style.top = top + 'px';
    }

    // ================================================================
    //  RENDER HELPERS
    // ================================================================
    function updateButtons() {
        const s = $('kuan-start'), st = $('kuan-stop');
        if (!s || !st) return;
        s.disabled = state.isRunning;
        st.disabled = !state.isRunning;
        const dot = $('kuan-status-dot');
        if (dot) dot.style.color = state.isRunning ? THEME.success : (state.stopRequested ? THEME.error : THEME.success);
    }

    function updateAccountsCount() {
        const el = $('kuan-accounts-count');
        if (el) el.textContent = state.totalCreated;
        const r = $('kuan-run-count');
        if (r) r.textContent = state.totalCreated;
    }

    function updateStats() {
        const sc = $('kuan-success');
        const fc = $('kuan-fail');
        if (sc) sc.textContent = state.successCount;
        if (fc) fc.textContent = state.failCount;
    }

    function renderStatus(msg, color) {
        const el = $('kuan-status');
        const text = String(msg).replace(/^[^\p{L}\p{N}]*/u, '').trim();
        if (el) { el.textContent = text || 'Sẵn sàng'; el.style.color = color || THEME.text; }
        updateEmailDisplay();
        updateUsernameDisplay();
    }

    function renderProgress(p, t = '') {
        const bar = $('kuan-progress-bar');
        const label = $('kuan-progress-text');
        if (bar) bar.style.width = Math.min(100, Math.max(0, p)) + '%';
        if (label) label.textContent = t || Math.round(p) + '%';
    }

    function addLog(icon, msg) {
        const time = new Date().toLocaleTimeString('vi-VN', { hour12: false });
        state.logs.unshift(`<span style="color:${THEME.textMut}">${time}</span>  <b style="color:${THEME.text}">${icon}</b>  ${msg}`);
        if (state.logs.length > 80) state.logs.pop();
        renderLogs();
    }

    function renderLogs() {
        const el = $('kuan-log');
        if (el) el.innerHTML = state.logs.map(l => `<div>${l}</div>`).join('');
    }

    function updateEmailDisplay() {
        const el = $('kuan-email');
        if (el) el.textContent = state.email || '—';
    }

    function updateUsernameDisplay() {
        const el = $('kuan-username');
        if (el) el.textContent = state.username || '—';
    }

    // ================================================================
    //  INIT
    // ================================================================
    const restored = checkAndRestore();

    function initUI() {
        createUI();
        createToggleIcon();
        restoreUIPosition();
        applyVisibility();

        state.targetAccounts = CONFIG.maxAccounts;
        const targetEl = document.getElementById('kuan-target');
        if (targetEl) targetEl.textContent = CONFIG.maxAccounts;
        const cfgTargetEl = document.getElementById('cfg-target');
        if (cfgTargetEl) cfgTargetEl.value = CONFIG.maxAccounts;

        if (restored) {
            updateAccountsCount();
            updateStats();
            addLog('↻', `Khôi phục — ${state.totalCreated}/${state.targetAccounts} acc`);
            renderStatus('🟡 Sẵn sàng (khôi phục)', THEME.warning);
            if (state._shouldAutoResume && state.totalCreated < state.targetAccounts) {
                addLog('▶', 'Tự động chạy tiếp sau reload...');
                toast('🔄 Tự động chạy tiếp...', 'info');
                setTimeout(() => { if (!state.stopRequested) startProcess(); }, 1500);
            }
        } else {
            renderStatus('🟢 Sẵn sàng — bấm ▶ BẮT ĐẦU', THEME.success);
        }
    }

    window.addEventListener('beforeunload', () => {
        if (!state._dragging) persistCurrentPosition();
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initUI);
    } else {
        initUI();
    }

})();
