// ==UserScript==
// @name         KuanDev Prenium v1.0
// @namespace    https://viayoo.com/
// @version      1.0
// @description  Smart Garena Auto-Register — Prenium Edition (No tabs, Loud sound, Speed presets)
// @author       KuanDev
// @run-at       document-end
// @match        https://*/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    /* ================================================================
    SPEED PRESETS
    ================================================================ */
    const SPEED_PRESETS = {
        fast: {
            label: 'Nhanh (15-17s)',
            delayBeforeFill: 600,
            delayBetweenInputs: 1000,
            delayBeforeGetOTP: 700,
            delayBeforeSubmit: 450,
            delayBetweenSteps: 500,
            delayAfterReload: 1100,
            checkMailInterval: 250,
            jitterMin: 80,
            jitterMax: 300
        },
        medium: {
            label: 'Vừa (17-20s)',
            delayBeforeFill: 1200,
            delayBetweenInputs: 1000,
            delayBeforeGetOTP: 1500,
            delayBeforeSubmit: 900,
            delayBetweenSteps: 900,
            delayAfterReload: 2400,
            checkMailInterval: 300,
            jitterMin: 100,
            jitterMax: 400
        },
        slow: {
            label: 'Chậm (20-25s)',
            delayBeforeFill: 1800,
            delayBetweenInputs: 1000,
            delayBeforeGetOTP: 2200,
            delayBeforeSubmit: 1500,
            delayBetweenSteps: 1300,
            delayAfterReload: 3500,
            checkMailInterval: 400,
            jitterMin: 150,
            jitterMax: 500
        }
    };

    /* ================================================================
    CONFIG
    ================================================================ */
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
        speedPreset: 'medium',

        delayBeforeFill: 1200,
        delayBetweenInputs: 1000,
        delayBeforeGetOTP: 1500,
        delayBeforeSubmit: 900,
        delayBetweenSteps: 900,
        delayAfterReload: 2400,
        checkMailInterval: 300,
        jitterMin: 100,
        jitterMax: 400,

        captchaMaxWait: 120000,
        soundEnabled: true,
        smartRetry: true,
        maxRetries: 2,
        exportFormat: 'txt'
    };

    /* ================================================================
    PERSISTENCE
    ================================================================ */
    const KEYS = {
        config: 'kuandev_pro_cfg',
        pos: 'kuandev_pro_pos',
        hidden: 'kuandev_pro_hidden',
        reload: 'kuandev_pro_reload',
        saved: 'kuandev_pro_saved'
    };

    function saveJSON(key, obj) {
        try {
            localStorage.setItem(key, JSON.stringify(obj));
            return true;
        } catch {
            return false;
        }
    }

    function loadJSON(key) {
        try {
            return JSON.parse(localStorage.getItem(key));
        } catch {
            return null;
        }
    }

    function saveConfig() {
        return saveJSON(KEYS.config, {
            maxAccounts: CONFIG.maxAccounts,
            password: CONFIG.password,
            speedPreset: CONFIG.speedPreset,
            savedAt: Date.now()
        });
    }

    function applySpeedPreset(key) {
        const p = SPEED_PRESETS[key] || SPEED_PRESETS.medium;
        CONFIG.speedPreset = SPEED_PRESETS[key] ? key : 'medium';
        CONFIG.delayBeforeFill = p.delayBeforeFill;
        CONFIG.delayBetweenInputs = p.delayBetweenInputs;
        CONFIG.delayBeforeGetOTP = p.delayBeforeGetOTP;
        CONFIG.delayBeforeSubmit = p.delayBeforeSubmit;
        CONFIG.delayBetweenSteps = p.delayBetweenSteps;
        CONFIG.delayAfterReload = p.delayAfterReload;
        CONFIG.checkMailInterval = p.checkMailInterval;
        CONFIG.jitterMin = p.jitterMin;
        CONFIG.jitterMax = p.jitterMax;
    }

    function loadConfig() {
        const d = loadJSON(KEYS.config);
        if (!d) {
            applySpeedPreset(CONFIG.speedPreset);
            return false;
        }

        const num = (v, min, max, fb) =>
            (typeof v === 'number' && isFinite(v)) ? Math.min(max, Math.max(min, v)) : fb;

        CONFIG.maxAccounts = num(d.maxAccounts, 1, 10000, 10);
        CONFIG.password = typeof d.password === 'string' && d.password ? d.password : CONFIG.password;
        applySpeedPreset(typeof d.speedPreset === 'string' ? d.speedPreset : 'medium');
        return true;
    }

    /* ================================================================
    STATE
    ================================================================ */
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
        hidden: false,
        view: 'run',
        _shouldAutoResume: false,
        _dragging: false,
        captchaDetected: false,
        startTime: null,
        retries: 0
    };

    /* ================================================================
    THEME
    ================================================================ */
    const THEME = {
        text: '#e4e4e7',
        dim: '#a1a1aa',
        mut: '#52525b',
        ok: '#34d399',
        warn: '#fbbf24',
        err: '#f87171',
        accent: '#818cf8',
        accent2: '#22d3ee',
        bg: 'rgba(9,9,11,.92)',
        panel: 'rgba(255,255,255,.045)',
        input: 'rgba(255,255,255,.07)',
        border: 'rgba(255,255,255,.1)',
        borderHi: 'rgba(129,140,248,.5)'
    };

    const USER_AGENTS = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/121.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/122.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0'
    ];

    let uaIndex = 0;

    /* ================================================================
    HELPERS
    ================================================================ */
    const $ = id => document.getElementById(id);
    const sleep = ms => new Promise(r => setTimeout(r, ms));

    function randomSleep(base) {
        return new Promise((res, rej) => {
            const extra = Math.floor(Math.random() * (CONFIG.jitterMax - CONFIG.jitterMin + 1)) + CONFIG.jitterMin;
            const hesitate = Math.random() < 0.15 ? Math.floor(Math.random() * 1500) : 0;
            const total = base + extra + hesitate;
            const start = Date.now();

            const tick = () => {
                if (state.stopRequested) return rej(new Error('STOPPED'));
                if (Date.now() - start >= total) return res();
                setTimeout(tick, 50);
            };

            tick();
        });
    }

    async function waitStep(ms) {
        if (state.stopRequested) throw new Error('STOPPED');
        await randomSleep(ms);
    }

    // Delay cố định ~1s giữa các field để tránh bot-detection
    async function sleepBetweenFields() {
        if (state.stopRequested) throw new Error('STOPPED');
        const jitter = Math.floor(Math.random() * 200);
        await sleep(CONFIG.delayBetweenInputs + jitter);
    }

    function rotateUA() {
        return USER_AGENTS[uaIndex++ % USER_AGENTS.length];
    }

    /* ================================================================
    SOUND
    ================================================================ */
    let audioCtx = null;

    function beep(freq = 880, dur = 0.14, type = 'triangle') {
        if (!CONFIG.soundEnabled) return;
        try {
            if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            if (audioCtx.state === 'suspended') audioCtx.resume();

            const o = audioCtx.createOscillator();
            const g = audioCtx.createGain();

            o.type = type;
            o.frequency.value = freq;

            g.gain.setValueAtTime(0.35, audioCtx.currentTime);
            g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);

            o.connect(g);
            g.connect(audioCtx.destination);

            o.start();
            o.stop(audioCtx.currentTime + dur);
        } catch {}
    }

    const sndOK = () => {
        beep(1046, .12);
        setTimeout(() => beep(1318, .18), 110);
    };

    const sndErr = () => beep(220, .28, 'square');

    const sndDone = () => {
        beep(880, .12);
        setTimeout(() => beep(1108, .12), 130);
        setTimeout(() => beep(1318, .22), 260);
    };

    /* ================================================================
    DATADOME CAPTCHA
    ================================================================ */
    function detectDataDome() {
        return !!(
            document.querySelector('[id^="ddChallengeContainer"]') ||
            document.querySelector('iframe[src*="captcha-delivery.com"]') ||
            document.querySelector('[id^="ddStyleCaptchaBody"]')
        );
    }

    function removeDataDome() {
        document.querySelectorAll('[id^="ddChallengeContainer"], [id^="ddStyleCaptchaBody"], iframe[src*="captcha-delivery.com"]')
            .forEach(el => el.remove());

        try {
            document.documentElement.style.overflow = '';
            document.body.style.overflow = '';
            window.scrollTo(0, 0);
        } catch {}
    }

    async function humanWarmup() {
        try {
            for (let i = 0; i < 3; i++) {
                if (state.stopRequested) throw new Error('STOPPED');
                window.scrollBy({
                    top: Math.random() * 120 - 60,
                    behavior: 'smooth'
                });
                await randomSleep(260);
            }

            for (let i = 0; i < 5; i++) {
                if (state.stopRequested) throw new Error('STOPPED');
                try {
                    document.dispatchEvent(new MouseEvent('mousemove', {
                        clientX: Math.random() * window.innerWidth,
                        clientY: Math.random() * window.innerHeight,
                        bubbles: true
                    }));
                } catch {}
                await randomSleep(120);
            }

            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });

            await randomSleep(260);
        } catch (e) {
            if (e.message === 'STOPPED') throw e;
        }
    }

    async function handleCaptcha(maxWait = CONFIG.captchaMaxWait) {
        if (!detectDataDome()) return true;

        state.captchaDetected = true;
        renderStatus('🛡️ DataDome captcha — giải thủ công', THEME.warn);
        toast('🛡️ DataDome captcha — giải thủ công', 'warn');

        const start = Date.now();

        while (detectDataDome() && Date.now() - start < maxWait) {
            if (state.stopRequested) throw new Error('STOPPED');
            const left = Math.ceil((maxWait - (Date.now() - start)) / 1000);
            renderStatus(`🛡️ Chờ captcha (${left}s)`, THEME.warn);
            await sleep(1000);
        }

        if (detectDataDome()) {
            removeDataDome();
            state.captchaDetected = false;
            return false;
        }

        state.captchaDetected = false;
        await randomSleep(1500);
        return true;
    }

    /* ================================================================
    COOKIE / BAN
    ================================================================ */
    function clearBrowserData() {
        try {
            const keep = Object.values(KEYS);
            const backup = {};

            keep.forEach(k => {
                const v = localStorage.getItem(k);
                if (v !== null) backup[k] = v;
            });

            document.cookie.split(';').forEach(c => {
                const name = c.split('=')[0].trim();
                if (name) {
                    document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
                    document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=' + location.hostname;
                }
            });

            localStorage.clear();
            sessionStorage.clear();

            Object.entries(backup).forEach(([k, v]) => localStorage.setItem(k, v));

            if (window.caches) {
                caches.keys()
                    .then(ks => ks.forEach(x => caches.delete(x)))
                    .catch(() => {});
            }

            return true;
        } catch {
            return false;
        }
    }

    function checkForBan() {
        if (detectDataDome()) return false;
        const t = (document.body?.textContent || '').toLowerCase();
        return [
            'account locked',
            'your account has been blocked',
            'too many attempts',
            'tài khoản đã bị khóa',
            'bị chặn'
        ].some(k => t.includes(k));
    }

    /* ================================================================
    ERROR DETECTION
    ================================================================ */
    function detectRegError() {
        const t = (document.body?.innerText || document.body?.textContent || '').toLowerCase();

        const dup = [
            'đã tồn tại',
            'da ton tai',
            'đã được sử dụng',
            'account already exists',
            'username already exists',
            'email already exists',
            'existing account',
            'tên đăng nhập đã tồn tại',
            'email đã tồn tại',
            'đã có tài khoản',
            'tài khoản đã tồn tại'
        ];

        for (const k of dup) {
            if (t.includes(k)) return 'duplicate';
        }

        const otp = [
            'mã xác thực không đúng',
            'invalid otp',
            'wrong code',
            'mã đã hết hạn',
            'expired code',
            'mã không hợp lệ',
            'verification failed',
            'xác thực thất bại'
        ];

        for (const k of otp) {
            if (t.includes(k)) return 'otp_error';
        }

        const fail = [
            'đăng ký thất bại',
            'registration failed',
            'không thể tạo tài khoản',
            'cannot create account',
            'hệ thống đang bận',
            'system busy',
            'quá nhiều lần',
            'too many attempts',
            'bị chặn',
            'blocked',
            'thất bại',
            'lỗi hệ thống'
        ];

        for (const k of fail) {
            if (t.includes(k)) return 'general_error';
        }

        return null;
    }

    /* ================================================================
    REGISTRATION RESULT DETECTION
    ================================================================ */
    const SUCCESS_KEYWORDS = [
        'đăng ký thành công',
        'đăng ky thanh cong',
        'tạo tài khoản thành công',
        'tài khoản đã được tạo',
        'đăng ký hoàn tất',
        'registration successful',
        'registration complete',
        'account created',
        'signup successful',
        'sign up successful',
        'chúc mừng',
        'xác thực email của bạn',
        'xác nhận email',
        'verify your email',
        'kiểm tra email của bạn',
        'check your email',
        'gửi email xác thực thành công'
    ];

    const SUCCESS_URL_PARTS = [
        'success', 'welcome', 'dashboard', 'complete',
        'verify-email', 'verify_email', 'confirmation',
        'xac-thuc', 'thanh-cong', 'hoan-tat'
    ];

    function detectSuccess() {
        const url = location.href.toLowerCase();
        for (const k of SUCCESS_URL_PARTS) {
            if (url.includes(k)) return true;
        }

        const t = (document.body?.innerText || '').toLowerCase();
        for (const k of SUCCESS_KEYWORDS) {
            if (t.includes(k)) return true;
        }

        const stillOnForm =
            document.querySelector('input[type="password"]') ||
            /register|signup|đăng ký|đăng ký tài khoản/i.test(document.title || '') ||
            /register|signup|dang-ky/i.test(location.pathname);

        const visibleInputs = [...document.querySelectorAll('input:not([type="hidden"])')]
            .filter(i => i.offsetParent !== null).length;

        if (!stillOnForm && visibleInputs === 0 && !detectDataDome()) {
            return true;
        }

        return false;
    }

    async function waitForRegistrationResult(maxWait = 30000) {
        const startUrl = location.href;
        const startTime = Date.now();

        await sleep(1500);

        let sawInputs = false;

        while (Date.now() - startTime < maxWait) {
            if (state.stopRequested) throw new Error('STOPPED');

            const err = detectRegError();
            if (err === 'duplicate') return 'duplicate';
            if (err) return 'error';

            if (location.href !== startUrl) {
                await sleep(900);
                const err2 = detectRegError();
                if (err2 === 'duplicate') return 'duplicate';
                if (err2) return 'error';
                return 'success';
            }

            if (detectSuccess()) return 'success';

            const visibleInputs = [...document.querySelectorAll('input:not([type="hidden"])')]
                .filter(i => i.offsetParent !== null).length;
            if (visibleInputs > 0) sawInputs = true;
            if (sawInputs && visibleInputs === 0 && !detectDataDome()) {
                await sleep(700);
                if (detectRegError()) return 'error';
                return 'success';
            }

            if (detectDataDome()) {
                const ok = await handleCaptcha();
                if (!ok) return 'timeout';
            }

            const left = Math.ceil((maxWait - (Date.now() - startTime)) / 1000);
            renderStatus(`⏳ Chờ xác nhận đăng ký (${left}s)...`, THEME.warn);

            await sleep(600);
        }

        return 'timeout';
    }

    /* ================================================================
    PERSIST PROGRESS
    ================================================================ */
    function persistProgress(autoResume = true) {
        saveJSON(KEYS.reload, {
            shouldReload: true,
            shouldAutoResume: Boolean(autoResume && !state.stopRequested),
            accounts: state.accounts,
            totalCreated: state.totalCreated,
            successCount: state.successCount,
            failCount: state.failCount,
            targetAccounts: state.targetAccounts,
            timestamp: Date.now()
        });

        saveJSON(KEYS.saved, {
            accounts: state.accounts,
            totalCreated: state.totalCreated,
            successCount: state.successCount,
            failCount: state.failCount
        });
    }

    async function handleDuplicate() {
        stopAutoCheckMail();
        renderStatus('♻ Trùng — reload...', THEME.warn);
        persistProgress(true);
        await sleep(1000);
        clearBrowserData();
        autoReload();
    }

    /* ================================================================
    GENERATORS
    ================================================================ */
    function genUsername() {
        const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        const lower = 'abcdefghijklmnopqrstuvwxyz';
        const nums  = '0123456789';

        // Độ dài ngẫu nhiên 8–12 ký tự
        const len = 8 + Math.floor(Math.random() * 5);

        // Số lượng chữ số ngẫu nhiên 2–4
        const numCount = 2 + Math.floor(Math.random() * 3);
        const letterCount = len - numCount;

        const chars = [];

        // Chữ cái: ngẫu nhiên HOA/thường (70% HOA cho Garena thường yêu cầu)
        for (let i = 0; i < letterCount; i++) {
            const pool = Math.random() < 0.7 ? upper : lower;
            chars.push(pool[Math.floor(Math.random() * pool.length)]);
        }

        // Chèn số
        for (let i = 0; i < numCount; i++) {
            chars.push(nums[Math.floor(Math.random() * nums.length)]);
        }

        // Xáo trộn vị trí
        return chars.sort(() => Math.random() - 0.5).join('');
    }

    function genEmailUser() {
        const letters = 'abcdefghijklmnopqrstuvwxyz';
        const alnum   = 'abcdefghijklmnopqrstuvwxyz0123456789';

        // Độ dài 9–13 ký tự
        const len = 9 + Math.floor(Math.random() * 5);

        let r = letters[Math.floor(Math.random() * letters.length)];
        for (let i = 1; i < len; i++) {
            r += alnum[Math.floor(Math.random() * alnum.length)];
        }
        return r;
    }

    async function genEmail() {
        state.email = genEmailUser() + CONFIG.domains[0];
        renderStatus('📧 ' + state.email, THEME.text);
        updateCreds();
        return state.email;
    }

    /* ================================================================
    INPUT SETTER
    ================================================================ */
    function setInput(input, value) {
        if (!input) return false;

        input.value = value;

        ['input', 'change', 'blur', 'focus'].forEach(t =>
            input.dispatchEvent(new Event(t, {
                bubbles: true,
                composed: true
            }))
        );

        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
        if (setter?.set) {
            setter.set.call(input, value);
            input.dispatchEvent(new Event('input', {
                bubbles: true,
                composed: true
            }));
        }

        if (input.vue) input.vue.$emit('input', value);

        input.focus();
        setTimeout(() => input.blur(), 50);

        return true;
    }

    /* ================================================================
    MAIL API
    ================================================================ */
    function extractOTP(text) {
        if (!text) return null;

        const matches = text.match(/\b\d{8}\b/g);

        if (matches) {
            for (const m of matches) {
                const i = text.indexOf(m);
                const ctx = text.substring(Math.max(0, i - 100), Math.min(text.length, i + 100)).toLowerCase();
                if (/mã|code|otp|xác thực|xác nhận|verify|garena/i.test(ctx)) return m;
            }
        }

        return text.match(/\d{8}/)?.[0] || null;
    }

    async function checkMailbox() {
        if (state.checkingMail || !state.email || state.stopRequested) return;

        state.checkingMail = true;

        try {
            const res = await fetch(`${CONFIG.mailApi}/?to=${encodeURIComponent(state.email)}`, {
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (!res.ok) throw 0;

            const data = await res.json();
            if (!data.success) {
                state.checkingMail = false;
                return;
            }

            const msgs = data.data || [];
            if (!msgs.length) {
                state.checkingMail = false;
                return;
            }

            for (const msg of msgs.sort((a, b) => (b.id || 0) - (a.id || 0))) {
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

                        renderStatus('🎯 OTP: ' + otp, THEME.ok);
                        toast('🎯 OTP: ' + otp, 'success');

                        state.checkingMail = false;
                        clearInterval(state.mailCheckTimer);
                        state.mailCheckTimer = null;

                        await fillOTP(otp);
                        return;
                    }
                }
            }

            state.checkingMail = false;
        } catch {
            state.checkingMail = false;
        }
    }

    function startAutoCheckMail() {
        clearInterval(state.mailCheckTimer);

        state.otpFound = false;
        state.otpCode = '';
        state.otpAttempts = 0;

        renderStatus('📡 Đang check mail...', THEME.text);

        // Gọi 2 nhịp sớm để bắt mail ngay
        checkMailbox();
        setTimeout(checkMailbox, 400);

        state.mailCheckTimer = setInterval(() => {
            if (state.stopRequested) {
                clearInterval(state.mailCheckTimer);
                state.mailCheckTimer = null;
                return;
            }

            state.otpAttempts++;
            checkMailbox();
        }, CONFIG.checkMailInterval);
    }

    function stopAutoCheckMail() {
        clearInterval(state.mailCheckTimer);
        state.mailCheckTimer = null;
    }

    /* ================================================================
    GET OTP BUTTON
    ================================================================ */
    async function bypassGetOTP() {
        if (state.stopRequested) throw new Error('STOPPED');

        await waitStep(CONFIG.delayBeforeGetOTP);

        renderStatus('⚡ Tìm nút Nhận Mã...', THEME.warn);

        const selectors = [
            'button',
            '[role="button"]',
            'input[type="button"]',
            'input[type="submit"]',
            '.btn-primary',
            '.btn-submit',
            '[class*="submit"]',
            '[class*="get-code"]',
            '[class*="send-code"]'
        ];

        const kws = [
            'gửi mã',
            'nhận mã',
            'lấy mã',
            'xác thực',
            'xác nhận',
            'send code',
            'get code',
            'verify',
            'otp'
        ];

        const btns = [...new Set(selectors.flatMap(s => [...document.querySelectorAll(s)]))]
            .filter(b => b.offsetParent !== null);

        let best = null;
        let bestScore = -1;

        for (const b of btns) {
            if (b.disabled) continue;

            const t = (b.textContent || b.value || '').toLowerCase();
            const c = t + (b.id || '') + (b.name || '') + (b.className || '');

            let sc = 0;

            for (const k of kws) {
                if (c.includes(k)) sc += k.length * 2;
            }

            if (/gửi|send/.test(t)) sc += 20;
            if (/nhận|get/.test(t)) sc += 20;
            if (/mã|code/.test(t)) sc += 15;
            if (/otp/.test(t)) sc += 20;

            if (sc > bestScore) {
                bestScore = sc;
                best = b;
            }
        }

        if (best && bestScore > 0) {
            try {
                persistProgress(true);
                best.click();
                renderStatus('📱 Đã gửi yêu cầu OTP', THEME.ok);
                startAutoCheckMail();
                return true;
            } catch {}
        }

        for (const f of document.querySelectorAll('form')) {
            try {
                persistProgress(true);
                f.submit();
                startAutoCheckMail();
                return true;
            } catch {}
        }

        return false;
    }

    /* ================================================================
    FILL FORM
    ================================================================ */
    async function bypassForm() {
        if (state.isProcessing || state.stopRequested) return false;

        state.isProcessing = true;

        try {
            if (detectDataDome()) {
                const ok = await handleCaptcha();
                if (!ok) {
                    state.isProcessing = false;
                    return false;
                }
            }

            const {
                username,
                email
            } = state;

            if (!username || !email) {
                state.isProcessing = false;
                return false;
            }

            await waitStep(CONFIG.delayBeforeFill);

            renderStatus('⚡ Điền form...', THEME.warn);
            renderProgress(30, 'Form');

            if (checkForBan()) {
                clearBrowserData();
                state.isProcessing = false;
                return false;
            }

            const allInputs = document.querySelectorAll('input:not([type="hidden"])');
            const allPwd = document.querySelectorAll('input[type="password"]');

            let uField = null;
            let eField = null;
            let pField = null;
            let cField = null;

            for (const i of allInputs) {
                if (i.disabled || i.readOnly || i.offsetParent === null) continue;

                const p = (i.placeholder || '').toLowerCase();
                const c = p + (i.id || '') + (i.name || '') + (i.className || '');

                if (!uField && /username|user|tên đăng nhập|ten dang nhap/i.test(c) && i.type !== 'password') {
                    uField = i;
                }

                if (!eField && (i.type === 'email' || /email|mail|thư/i.test(c)) && i.type !== 'password') {
                    eField = i;
                }
            }

            const pwds = [...allPwd].filter(p => !p.disabled && !p.readOnly && p.offsetParent !== null);

            if (pwds.length >= 2) {
                pField = pwds[0];
                cField = pwds[1];
            } else if (pwds.length === 1) {
                pField = pwds[0];

                for (const i of allInputs) {
                    if (i.type === 'password' && i !== pField) {
                        const p = (i.placeholder || '').toLowerCase();
                        if (/nhập lại|confirm|xác nhận|again|re-enter|retype/i.test(p)) {
                            cField = i;
                            break;
                        }
                    }
                }
            }

            if (uField) {
                setInput(uField, username);
                await sleepBetweenFields();
            }

            if (pField) {
                setInput(pField, CONFIG.password);
                await sleepBetweenFields();
            }

            if (cField) {
                setInput(cField, CONFIG.password);
                await sleepBetweenFields();
            }

            if (eField) {
                setInput(eField, email);
                await sleepBetweenFields();
            }

            state.formFilled = true;

            renderProgress(50, 'Đã điền');
            renderStatus('✅ Form đã điền', THEME.ok);

            state.isProcessing = false;
            return true;
        } catch (e) {
            state.isProcessing = false;
            if (e.message === 'STOPPED') throw e;
            return false;
        }
    }

    /* ================================================================
    FILL OTP + SUBMIT
    ================================================================ */
    async function fillOTP(otp) {
        if (!otp || state.stopRequested) return false;

        renderStatus('⚡ Điền OTP...', THEME.warn);

        for (const i of document.querySelectorAll('input')) {
            if (i.disabled || i.readOnly || i.offsetParent === null) continue;

            const c = (i.placeholder || '') + (i.id || '') + (i.name || '');

            if (/otp|mã|code|xác thực|xac thuc|xác minh|verification/i.test(c) ||
                i.maxLength === CONFIG.otpLength ||
                i.type === 'tel') {

                setInput(i, otp);

                renderStatus('✅ Đã điền OTP', THEME.ok);
                renderProgress(90, 'OTP');

                await randomSleep(CONFIG.delayBeforeSubmit);
                await clickSubmit();

                return true;
            }
        }

        return false;
    }

    async function clickSubmit() {
        try {
            if (state.stopRequested) throw new Error('STOPPED');

            await waitStep(CONFIG.delayBeforeSubmit);

            const btns = document.querySelectorAll('button, input[type="button"], input[type="submit"]');
            let s = null;

            for (const b of btns) {
                if (b.disabled || b.offsetParent === null) continue;

                const t = (b.textContent || b.value || '').toLowerCase();

                if (/đăng ký|đăng ky|register|sign up|submit|xác nhận|create account|tạo tài khoản/i.test(t)) {
                    s = b;
                    break;
                }
            }

            if (!s) {
                for (const b of document.querySelectorAll('.btn-primary,.btn-submit,.submit-btn,[class*="submit"],[class*="register"]')) {
                    if (!b.disabled && b.offsetParent !== null) {
                        s = b;
                        break;
                    }
                }
            }

            if (s && !s.disabled) {
                persistProgress(true);
                s.click();
                renderStatus('✅ Đã gửi đăng ký!', THEME.ok);
                renderProgress(100, 'OK');
                return true;
            }

            for (const f of document.querySelectorAll('form')) {
                try {
                    persistProgress(true);
                    f.submit();
                    return true;
                } catch {}
            }

            return false;
        } catch (e) {
            if (e.message === 'STOPPED') throw e;
            return false;
        }
    }

    /* ================================================================
    AUTO GET OTP
    ================================================================ */
    async function autoGetOTP() {
        if (state.isGettingOTP || state.stopRequested) return;

        state.isGettingOTP = true;
        state.otpCode = '';
        state.otpFound = false;

        renderStatus('📱 Đang nhận OTP...', THEME.warn);
        renderProgress(60, 'OTP');

        try {
            if (detectDataDome()) {
                const ok = await handleCaptcha();
                if (!ok) {
                    state.isGettingOTP = false;
                    return;
                }
            }

            let ok = false;

            for (let i = 0; i < 3; i++) {
                if (state.stopRequested) throw new Error('STOPPED');
                if (await bypassGetOTP()) {
                    ok = true;
                    break;
                }
                await randomSleep(1200);
            }

            if (!ok) {
                state.isGettingOTP = false;
                return;
            }

            let w = 0;

            while (!state.otpFound && w < 60 && !state.stopRequested) {
                await randomSleep(CONFIG.checkMailInterval);
                w++;

                renderProgress(60 + Math.min((w / 60) * 30, 30), `OTP ${w}/60`);

                // Resend OTP mỗi 30 nhịp (interval nhanh hơn nên giãn ra)
                if (w % 30 === 0) await bypassGetOTP();
            }

            if (state.otpFound && state.otpCode) {
                renderProgress(95, 'OTP OK');
                state.isGettingOTP = false;
                return;
            }

            renderStatus('❌ Không nhận được OTP', THEME.err);
            sndErr();

            state.isGettingOTP = false;
        } catch (e) {
            state.isGettingOTP = false;
            if (e.message === 'STOPPED') throw e;
        }
    }

    /* ================================================================
    RELOAD / RESTORE
    ================================================================ */
    function autoReload() {
        if (state.reloadPending) return;

        state.reloadPending = true;

        renderStatus('🔄 Reloading...', THEME.warn);

        saveConfig();
        persistCurrentPosition();
        persistProgress(!state.stopRequested);
        stopAutoCheckMail();

        setTimeout(() => location.reload(), CONFIG.autoReloadDelay);
    }

    function checkAndRestore() {
        try {
            const d = loadJSON(KEYS.reload);

            if (d?.shouldReload) {
                localStorage.removeItem(KEYS.reload);

                state.accounts = Array.isArray(d.accounts) ? d.accounts : [];
                state.totalCreated = d.totalCreated || 0;
                state.successCount = typeof d.successCount === 'number' ? d.successCount : state.totalCreated;
                state.failCount = d.failCount || 0;

                if (typeof d.targetAccounts === 'number' && d.targetAccounts > 0) {
                    const t = Math.min(10000, Math.max(1, d.targetAccounts));
                    CONFIG.maxAccounts = t;
                    state.targetAccounts = t;
                } else {
                    state.targetAccounts = CONFIG.maxAccounts;
                }

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

        saveJSON(KEYS.pos, {
            left: r.left,
            top: r.top,
            ts: Date.now()
        });
    }

    /* ================================================================
    EXPORT
    ================================================================ */
    function downloadAccounts() {
        if (!state.accounts.length) {
            toast('⚠ Chưa có tài khoản nào', 'warn');
            return;
        }

        const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

        let content;
        let mime;
        let ext;

        if (CONFIG.exportFormat === 'csv') {
            const rows = [['#', 'Username', 'Email', 'Password', 'OTP', 'Created']];

            state.accounts.forEach((a, i) => rows.push([
                i + 1,
                a.username,
                a.email,
                a.password,
                a.otp || '',
                a.created
            ]));

            content = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
            mime = 'text/csv;charset=utf-8';
            ext = 'csv';
        } else {
            const SEP = '='.repeat(52);

            const header = [
                SEP,
                ` KUANDEV PRENIUM v1.0 — KẾT QUẢ ĐĂNG KÝ`,
                SEP,
                ` Ngày xuất  : ${new Date().toLocaleString('vi-VN')}`,
                ` Tổng       : ${state.accounts.length}`,
                ` Thành công : ${state.successCount}`,
                ` Thất bại   : ${state.failCount}`,
                SEP
            ].join('\n');

            const body = state.accounts.map((a, i) =>
                `${String(i + 1).padStart(3)}. ${a.username} | ${a.email} | ${a.password} | ${a.created}`
            ).join('\n');

            content = header + '\n' + body + '\n' + SEP;
            mime = 'text/plain;charset=utf-8';
            ext = 'txt';
        }

        const blob = new Blob([content], {
            type: mime
        });

        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `KuanDev_Prenium_${ts}.${ext}`;
        a.click();

        URL.revokeObjectURL(a.href);

        toast(`⬇ Đã tải ${state.accounts.length} acc (${ext.toUpperCase()})`, 'success');
    }

    /* ================================================================
    MAIN PROCESS
    ================================================================ */
    async function startProcess() {
        if (state.isRunning) return;

        const inputTarget = $('cfg-target');

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
        state.failCount = state.failCount || 0;

        state.startTime = Date.now();
        state.retries = 0;

        persistProgress(true);

        renderStatus('🚀 Đang chạy...', THEME.text);
        renderProgress(0, 'Start');

        updateButtons();
        updateStats();
        updateAccountsCount();

        while (state.totalCreated < state.targetAccounts && !state.stopRequested) {
            try {
                if (state.stopRequested) throw new Error('STOPPED');

                persistProgress(true);

                if (checkForBan()) {
                    state.failCount++;
                    updateStats();
                    clearBrowserData();
                    await waitStep(2000);
                    autoReload();
                    return;
                }

                const cur = state.totalCreated + 1;

                renderStatus(`📌 Đang tạo #${cur}/${state.targetAccounts}`, THEME.warn);
                renderProgress((state.totalCreated / state.targetAccounts) * 100, `#${cur}`);

                await humanWarmup();

                if (state.stopRequested) throw new Error('STOPPED');

                state.username = genUsername();
                await genEmail();

                await waitStep(CONFIG.delayBetweenSteps);

                if (state.stopRequested) throw new Error('STOPPED');

                if (!await bypassForm()) {
                    state.failCount++;
                    updateStats();
                    persistProgress(true);
                    sndErr();

                    const earlyErr = detectRegError();

                    if (earlyErr === 'duplicate') {
                        await handleDuplicate();
                        return;
                    } else if (earlyErr) {
                        await randomSleep(1500);
                        clearBrowserData();
                        autoReload();
                        return;
                    }

                    if (CONFIG.smartRetry && state.retries < CONFIG.maxRetries) {
                        state.retries++;
                        await randomSleep(2000);
                        continue;
                    }

                    state.retries = 0;
                    await randomSleep(2000);
                    continue;
                }

                state.retries = 0;

                let earlyErr = detectRegError();

                if (earlyErr === 'duplicate') {
                    state.failCount++;
                    updateStats();
                    persistProgress(true);
                    sndErr();
                    await handleDuplicate();
                    return;
                } else if (earlyErr) {
                    state.failCount++;
                    updateStats();
                    persistProgress(true);
                    sndErr();
                    await randomSleep(1500);
                    clearBrowserData();
                    autoReload();
                    return;
                }

                if (state.stopRequested) throw new Error('STOPPED');

                await waitStep(CONFIG.delayBetweenSteps);
                await autoGetOTP();

                if (state.stopRequested) throw new Error('STOPPED');

                earlyErr = detectRegError();

                if (earlyErr === 'duplicate') {
                    state.failCount++;
                    updateStats();
                    persistProgress(true);
                    sndErr();
                    await handleDuplicate();
                    return;
                } else if (earlyErr) {
                    state.failCount++;
                    updateStats();
                    persistProgress(true);
                    sndErr();
                    await randomSleep(1500);
                    clearBrowserData();
                    autoReload();
                    return;
                }

                if (state.otpFound && state.otpCode) {
                    renderStatus('⏳ Chờ server xác nhận đăng ký...', THEME.warn);
                    renderProgress(92, 'Chờ KQ');

                    const result = await waitForRegistrationResult(30000);

                    if (result === 'duplicate') {
                        stopAutoCheckMail();
                        state.failCount++;
                        updateStats();
                        persistProgress(true);
                        sndErr();
                        await handleDuplicate();
                        return;
                    }

                    if (result === 'error' || result === 'timeout') {
                        stopAutoCheckMail();
                        state.failCount++;
                        updateStats();
                        persistProgress(true);
                        sndErr();

                        renderStatus(
                            result === 'timeout'
                                ? '❌ Timeout — chưa xác nhận đăng ký'
                                : '❌ Đăng ký thất bại',
                            THEME.err
                        );

                        await randomSleep(1500);
                        clearBrowserData();
                        autoReload();
                        return;
                    }

                    state.accounts.push({
                        username: state.username,
                        email: state.email,
                        password: CONFIG.password,
                        otp: state.otpCode,
                        created: new Date().toLocaleString('vi-VN')
                    });

                    state.totalCreated++;
                    state.successCount++;

                    renderStatus(`✅ #${state.totalCreated} thành công`, THEME.ok);
                    toast(`✅ Acc #${state.totalCreated} OK`, 'success');
                    sndOK();

                    updateAccountsCount();
                    updateStats();

                    persistProgress(true);

                    await waitStep(CONFIG.delayAfterReload);

                    if (state.stopRequested) throw new Error('STOPPED');

                    clearBrowserData();
                    rotateUA();

                    if (state.totalCreated < state.targetAccounts) {
                        autoReload();
                        return;
                    }
                } else {
                    stopAutoCheckMail();
                    state.failCount++;
                    updateStats();
                    persistProgress(true);
                    sndErr();
                    await randomSleep(1500);
                    clearBrowserData();
                    autoReload();
                    return;
                }
            } catch (e) {
                stopAutoCheckMail();

                if (e.message === 'STOPPED') break;

                state.failCount++;
                updateStats();
                persistProgress(true);
                sndErr();

                await randomSleep(2000);
            }
        }

        if (state.totalCreated >= state.targetAccounts || state.stopRequested) {
            renderStatus(`✅ Hoàn tất ${state.totalCreated} acc`, THEME.ok);
            renderProgress(100, `${state.totalCreated} acc`);
            sndDone();

            stopAutoCheckMail();
            clearBrowserData();
            persistProgress(false);

            if (state.accounts.length) downloadAccounts();

            if (state.totalCreated >= state.targetAccounts) {
                toast('🎉 Hoàn tất mục tiêu!', 'success');
            }
        }

        state.isRunning = false;
        updateButtons();
    }

    function stopProcess() {
        state.stopRequested = true;
        state.isRunning = false;
        state.reloadPending = true;

        stopAutoCheckMail();
        persistProgress(false);

        renderStatus('⏹ Đã dừng', THEME.err);
        toast('⏹ Đã dừng', 'error');
        sndErr();

        updateButtons();
    }

    /* ================================================================
    TOAST
    ================================================================ */
    function toast(msg, type = 'info') {
        const colors = {
            success: THEME.ok,
            error: THEME.err,
            info: THEME.text,
            warn: THEME.warn
        };

        const el = document.createElement('div');

        el.style.cssText = `
            position:fixed;
            bottom:65vh;
            right:20px;
            transform:translateX(30px);
            background:rgba(9,9,11,.95);
            border:1px solid ${colors[type]};
            color:${colors[type]};
            padding:8px 16px;
            border-radius:10px;
            font-family:'Consolas',monospace;
            font-size:12px;
            z-index:9999999;
            box-shadow:0 8px 24px rgba(0,0,0,.6);
            opacity:0;
            transition:opacity .25s,transform .25s;
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

    /* ================================================================
    UI
    ================================================================ */
    const RING_SIZE = 64;
    const RING_R = 26;
    const RING_C = 2 * Math.PI * RING_R;

    function createUI() {
        $('kuandev-ui')?.remove();

        const c = document.createElement('div');
        c.id = 'kuandev-ui';
        c.style.cssText = `
            position:fixed;
            top:12px;
            right:12px;
            z-index:999999;
            font-family:'Consolas','Segoe UI',monospace;
            user-select:none;
            font-size:11px;
            line-height:1.5;
            touch-action:none;
        `;

        c.innerHTML = `
        <div id="kuan-box" style="background:${THEME.bg};backdrop-filter:blur(20px) saturate(1.3);
            border:1px solid ${THEME.border};border-radius:14px;
            box-shadow:0 16px 48px rgba(0,0,0,.75),0 0 0 1px rgba(255,255,255,.03) inset;
            color:${THEME.text};box-sizing:border-box;width:232px;overflow:hidden;">

            <!-- HEADER -->
            <div id="kuan-header" style="display:flex;align-items:center;justify-content:space-between;
                padding:8px 10px;border-bottom:1px solid ${THEME.border};cursor:move;touch-action:none;">
                <div style="display:flex;align-items:center;gap:6px;">
                    <span style="font-weight:800;letter-spacing:.8px;background:linear-gradient(90deg,${THEME.accent},${THEME.accent2});
                        -webkit-background-clip:text;-webkit-text-fill-color:transparent;">KUANDEV</span>
                    <span style="font-size:8px;padding:1px 5px;border-radius:4px;
                        background:linear-gradient(90deg,${THEME.accent},${THEME.accent2});color:#000;font-weight:700;">Prenium</span>
                </div>
                <div style="display:flex;gap:2px;">
                    <button id="kuan-settings-btn" title="Cài đặt" style="background:transparent;border:none;color:${THEME.dim};
                        cursor:pointer;font-size:13px;padding:2px 4px;border-radius:4px;">⚙</button>
                    <button id="kuan-close" title="Ẩn" style="background:transparent;border:none;color:${THEME.dim};
                        cursor:pointer;font-size:14px;padding:2px 4px;border-radius:4px;">×</button>
                </div>
            </div>

            <!-- CONTENT -->
            <div id="kuan-content" style="padding:10px;height:260px;overflow:hidden;">

                <!-- VIEW: RUN -->
                <div data-view="run" style="height:100%;display:flex;flex-direction:column;">
                    <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
                        <div style="position:relative;width:${RING_SIZE}px;height:${RING_SIZE}px;flex-shrink:0;">
                            <svg width="${RING_SIZE}" height="${RING_SIZE}">
                                <circle cx="${RING_SIZE / 2}" cy="${RING_SIZE / 2}" r="${RING_R}"
                                    stroke="rgba(255,255,255,.08)" stroke-width="5" fill="none"/>
                                <circle id="kuan-ring" cx="${RING_SIZE / 2}" cy="${RING_SIZE / 2}" r="${RING_R}"
                                    stroke="url(#kuanGrad)" stroke-width="5" fill="none"
                                    stroke-linecap="round" stroke-dasharray="${RING_C}"
                                    stroke-dashoffset="${RING_C}" transform="rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})"
                                    style="transition:stroke-dashoffset .5s ease;"/>
                                <defs>
                                    <linearGradient id="kuanGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                                        <stop offset="0%" stop-color="${THEME.accent}"/>
                                        <stop offset="100%" stop-color="${THEME.accent2}"/>
                                    </linearGradient>
                                </defs>
                            </svg>
                            <div id="kuan-ring-text" style="position:absolute;inset:0;display:flex;align-items:center;
                                justify-content:center;font-weight:800;font-size:13px;color:${THEME.text};">0%</div>
                        </div>

                        <div style="flex:1;min-width:0;">
                            <div id="kuan-status" style="color:${THEME.text};font-size:10.5px;font-weight:600;
                                white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Sẵn sàng</div>
                            <div style="font-size:9px;color:${THEME.mut};margin-top:5px;">
                                Tốc độ: <span id="kuan-speed-label" style="color:${THEME.accent2};">Vừa</span>
                            </div>
                        </div>
                    </div>

                    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px;margin-bottom:6px;">
                        <div class="kuan-cell">
                            <div class="kuan-label">ĐÃ TẠO</div>
                            <div class="kuan-value" style="color:${THEME.ok};">
                                <span id="kuan-accounts-count">0</span><span style="color:${THEME.mut};font-size:9px;">/<span id="kuan-target">${CONFIG.maxAccounts}</span></span>
                            </div>
                        </div>
                        <div class="kuan-cell">
                            <div class="kuan-label">✓ OK</div>
                            <div id="kuan-success" class="kuan-value" style="color:${THEME.ok};">0</div>
                        </div>
                        <div class="kuan-cell">
                            <div class="kuan-label">✗ LỖI</div>
                            <div id="kuan-fail" class="kuan-value" style="color:${THEME.err};">0</div>
                        </div>
                    </div>

                    <div class="kuan-cell" style="padding:4px 8px;margin-bottom:3px;">
                        <div class="kuan-label">USERNAME</div>
                        <div id="kuan-username" class="kuan-value kuan-copy" style="cursor:pointer;" title="Copy">—</div>
                    </div>

                    <div class="kuan-cell" style="padding:4px 8px;">
                        <div class="kuan-label">EMAIL</div>
                        <div id="kuan-email" class="kuan-value kuan-copy" style="color:${THEME.dim};font-size:10px;cursor:pointer;" title="Copy">—</div>
                    </div>

                    <div style="display:flex;gap:5px;margin-top:auto;padding-top:10px;">
                        <button id="kuan-start" class="kuan-btn kuan-btn-start">▶ START</button>
                        <button id="kuan-stop" class="kuan-btn kuan-btn-stop">■ STOP</button>
                        <button id="kuan-download" class="kuan-btn kuan-btn-dl" title="Tải kết quả">⬇</button>
                    </div>
                </div>

                <!-- VIEW: SETTINGS -->
                <div data-view="settings" style="height:100%;display:none;flex-direction:column;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                        <span style="color:${THEME.accent2};font-size:10px;font-weight:800;letter-spacing:1px;">⚙ CÀI ĐẶT</span>
                        <button id="kuan-back" style="background:rgba(255,255,255,.06);border:1px solid ${THEME.border};
                            color:${THEME.text};border-radius:5px;font-size:9px;padding:2px 8px;cursor:pointer;
                            font-family:inherit;">←</button>
                    </div>

                    <div style="flex:1;overflow-y:auto;scrollbar-width:thin;padding-right:2px;">
                        <div class="kuan-setting">
                            <label>Mục tiêu</label>
                            <input type="number" id="cfg-target" value="${CONFIG.maxAccounts}" min="1" max="10000">
                        </div>

                        <div class="kuan-setting">
                            <label>Password</label>
                            <input type="text" id="cfg-password" value="${CONFIG.password}">
                        </div>

                        <div class="kuan-setting">
                            <label>Tốc độ</label>
                            <button type="button" id="cfg-speed-btn" class="cfg-speed-trigger">
                                ${(SPEED_PRESETS[CONFIG.speedPreset] || SPEED_PRESETS.medium).label.split(' ')[0]} ▾
                            </button>
                            <input type="hidden" id="cfg-speed" value="${CONFIG.speedPreset || 'medium'}">
                        </div>

                        <div id="cfg-speed-menu" style="display:none;grid-template-columns:1fr 1fr 1fr;gap:4px;margin:6px 0 2px;">
                            <button type="button" class="cfg-speed-item" data-speed="fast">Nhanh</button>
                            <button type="button" class="cfg-speed-item" data-speed="medium">Vừa</button>
                            <button type="button" class="cfg-speed-item" data-speed="slow">Chậm</button>
                        </div>
                    </div>

                    <div style="display:flex;gap:5px;margin-top:8px;">
                        <button id="cfg-save" class="kuan-btn kuan-btn-start" style="flex:1;">Save Settings</button>
                        <button id="cfg-delete" class="kuan-btn" style="flex:1;background:rgba(248,113,113,.1);
                            border:1px solid rgba(248,113,113,.3);color:${THEME.err};">Delete Data</button>
                    </div>
                </div>
            </div>

            <!-- FOOTER -->
            <div id="kuan-footer" style="display:flex;justify-content:space-between;align-items:center;
                padding:4px 12px;border-top:1px solid ${THEME.border};font-size:8px;color:${THEME.mut};">
                <span><span id="kuan-status-dot" style="color:${THEME.ok};">●</span> <span id="kuan-footer-state">READY</span></span>
                <span>v1.0 Prenium</span>
            </div>
        </div>`;

        document.body.appendChild(c);

        const style = document.createElement('style');
        style.textContent = `
            #kuandev-ui *{box-sizing:border-box;}

            .kuan-cell{background:${THEME.panel};border-radius:7px;padding:6px 9px;}
            .kuan-label{color:${THEME.mut};font-size:8px;letter-spacing:.8px;}
            .kuan-value{font-weight:700;font-size:11px;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
            .kuan-copy:hover{color:${THEME.accent2}!important;}

            .kuan-btn{padding:7px 6px;border-radius:8px;cursor:pointer;font-family:inherit;
                font-size:10px;font-weight:700;transition:all .15s;border:1px solid transparent;}
            .kuan-btn:hover:not(:disabled){filter:brightness(1.4);}
            .kuan-btn:active:not(:disabled){transform:translateY(1px);}
            .kuan-btn:disabled{opacity:.3;cursor:not-allowed;}

            .kuan-btn-start{background:rgba(52,211,153,.12);border-color:rgba(52,211,153,.4);color:${THEME.ok};flex:1;}
            .kuan-btn-stop{background:rgba(248,113,113,.12);border-color:rgba(248,113,113,.4);color:${THEME.err};flex:1;}
            .kuan-btn-dl{background:rgba(255,255,255,.06);border-color:${THEME.border};color:${THEME.text};flex:0 0 36px;}

            .kuan-setting{display:flex;justify-content:space-between;align-items:center;
                padding:5px 0;border-bottom:1px dashed rgba(255,255,255,.06);gap:8px;}
            .kuan-setting label{color:${THEME.dim};font-size:9px;}
            .kuan-setting input{
                background:${THEME.input};border:1px solid ${THEME.border};
                color:${THEME.text};border-radius:6px;padding:4px 7px;font-family:inherit;font-size:10px;
                width:118px;outline:none;transition:border-color .15s;
            }
            .kuan-setting input:focus{border-color:${THEME.borderHi};}

            .cfg-speed-trigger{
                background:${THEME.input};border:1px solid ${THEME.border};
                color:${THEME.text};border-radius:6px;padding:4px 8px;font-family:inherit;
                font-size:10px;min-width:76px;cursor:pointer;transition:border-color .15s;
                text-align:right;
            }
            .cfg-speed-trigger:hover{border-color:${THEME.borderHi};}

            .cfg-speed-item{
                background:rgba(255,255,255,.05);
                border:1px solid ${THEME.border};
                color:${THEME.text};
                border-radius:6px;
                padding:5px 4px;
                font-size:9px;
                font-weight:700;
                cursor:pointer;
                transition:all .15s;
            }
            .cfg-speed-item:hover{
                border-color:${THEME.borderHi};
                color:${THEME.accent2};
            }

            #kuan-header button:hover{background:rgba(255,255,255,.08)!important;}
            #kuan-header{cursor:move;}
            #kuan-header:active{cursor:grabbing;}
        `;
        document.head.appendChild(style);

        /* ===== SPEED DROPDOWN ===== */
        function updateSpeedUI() {
            const hidden = $('cfg-speed');
            if (!hidden) return;

            const key = hidden.value || 'medium';
            const preset = SPEED_PRESETS[key] || SPEED_PRESETS.medium;
            const shortLabel = preset.label.split(' ')[0];

            const btn = $('cfg-speed-btn');
            if (btn) btn.textContent = shortLabel + ' ▾';

            const runLabel = $('kuan-speed-label');
            if (runLabel) runLabel.textContent = shortLabel;

            document.querySelectorAll('#cfg-speed-menu .cfg-speed-item').forEach(item => {
                const active = item.dataset.speed === key;

                item.style.background = active ? 'rgba(129,140,248,.18)' : 'rgba(255,255,255,.05)';
                item.style.borderColor = active ? THEME.borderHi : THEME.border;
                item.style.color = active ? THEME.accent2 : THEME.text;
            });
        }

        function closeSpeedMenu(e) {
            const menu = $('cfg-speed-menu');
            const trigger = $('cfg-speed-btn');

            if (!menu || !trigger) return;
            if (menu.style.display === 'none') return;

            if (!menu.contains(e.target) && !trigger.contains(e.target)) {
                menu.style.display = 'none';
            }
        }

        $('cfg-speed-btn').addEventListener('click', e => {
            e.stopPropagation();

            const menu = $('cfg-speed-menu');
            if (!menu) return;

            menu.style.display = menu.style.display === 'grid' ? 'none' : 'grid';
            updateSpeedUI();
        });

        document.querySelectorAll('#cfg-speed-menu .cfg-speed-item').forEach(item => {
            item.addEventListener('click', e => {
                e.stopPropagation();

                const hidden = $('cfg-speed');
                if (hidden) hidden.value = item.dataset.speed;

                updateSpeedUI();

                const menu = $('cfg-speed-menu');
                if (menu) menu.style.display = 'none';
            });
        });

        document.addEventListener('click', closeSpeedMenu);

        /* ===== EVENTS ===== */
        $('kuan-start').addEventListener('click', () => {
            if (!state.isRunning) startProcess();
        });

        $('kuan-stop').addEventListener('click', stopProcess);

        $('kuan-download').addEventListener('click', downloadAccounts);

        $('kuan-settings-btn').addEventListener('click', () => {
            const menu = $('cfg-speed-menu');
            if (menu) menu.style.display = 'none';

            showView(state.view === 'settings' ? 'run' : 'settings');
        });

        $('kuan-back').addEventListener('click', () => {
            const menu = $('cfg-speed-menu');
            if (menu) menu.style.display = 'none';

            showView('run');
        });

        $('kuan-close').addEventListener('click', () => {
            state.hidden = true;
            saveJSON(KEYS.hidden, '1');
            applyVisibility();
            toast('👁 Đã ẩn — bấm 🛠 mở lại', 'info');
        });

        ['kuan-username', 'kuan-email'].forEach(id => {
            $(id).addEventListener('click', () => {
                const v = $(id).textContent.trim();
                if (v && v !== '—') {
                    navigator.clipboard.writeText(v).then(() => toast('📋 Copied: ' + v, 'info'));
                }
            });
        });

        $('cfg-save').addEventListener('click', () => {
            CONFIG.maxAccounts = Math.min(10000, Math.max(1, +$('cfg-target').value || 10));
            CONFIG.password = $('cfg-password').value.trim() || CONFIG.password;

            const speedKey = $('cfg-speed')?.value || 'medium';
            applySpeedPreset(speedKey);

            state.targetAccounts = CONFIG.maxAccounts;

            const tEl = $('kuan-target');
            if (tEl) tEl.textContent = CONFIG.maxAccounts;

            updateSpeedUI();

            $('cfg-target').value = CONFIG.maxAccounts;

            const ok = saveConfig();

            toast(
                ok
                    ? `💾 Đã lưu (${CONFIG.maxAccounts} acc · ${SPEED_PRESETS[CONFIG.speedPreset].label})`
                    : '⚠ Lưu thất bại',
                ok ? 'success' : 'error'
            );
        });

        $('cfg-delete').addEventListener('click', () => {
            if (!confirm('Xóa toàn bộ dữ liệu acc đã lưu? Hành động không thể hoàn tác!')) return;

            state.accounts = [];
            state.totalCreated = 0;
            state.successCount = 0;
            state.failCount = 0;

            localStorage.removeItem(KEYS.saved);
            localStorage.removeItem(KEYS.reload);

            updateAccountsCount();
            updateStats();
            updateCreds();

            renderProgress(0, '0%');
            renderStatus('🗑 Đã xóa dữ liệu acc', THEME.warn);

            toast('🗑 Đã xóa toàn bộ dữ liệu acc', 'success');
        });

        makeDraggable(c, $('kuan-header'));

        showView('run');
        updateButtons();
        updateAccountsCount();
        updateStats();
        updateSpeedUI();

        return c;
    }

    /* ================================================================
    VIEW
    ================================================================ */
    function showView(name) {
        state.view = name;

        document.querySelectorAll('#kuan-content [data-view]').forEach(v => {
            v.style.display = v.dataset.view === name ? 'flex' : 'none';
        });

        const btn = $('kuan-settings-btn');

        if (btn) {
            btn.textContent = name === 'settings' ? '←' : '⚙';
            btn.style.color = name === 'settings' ? THEME.accent2 : THEME.dim;
        }
    }

    function updateButtons() {
        const s = $('kuan-start');
        const st = $('kuan-stop');

        if (!s || !st) return;

        s.disabled = state.isRunning;
        st.disabled = !state.isRunning;

        const dot = $('kuan-status-dot');
        const fs = $('kuan-footer-state');

        if (dot) {
            dot.style.color = state.isRunning ? THEME.accent2 : (state.stopRequested ? THEME.err : THEME.ok);
        }

        if (fs) {
            fs.textContent = state.isRunning ? 'RUNNING' : (state.stopRequested ? 'STOPPED' : 'READY');
        }
    }

    function updateAccountsCount() {
        const el = $('kuan-accounts-count');
        if (el) el.textContent = state.totalCreated;
    }

    function updateStats() {
        const sc = $('kuan-success');
        const fc = $('kuan-fail');

        if (sc) sc.textContent = state.successCount;
        if (fc) fc.textContent = state.failCount;
    }

    function renderStatus(msg, color) {
        const el = $('kuan-status');

        if (el) {
            el.textContent = msg || 'Sẵn sàng';
            el.style.color = color || THEME.text;
        }

        updateCreds();
    }

    function renderProgress(p, t = '') {
        const pct = Math.min(100, Math.max(0, p));

        const ring = $('kuan-ring');
        const txt = $('kuan-ring-text');

        if (ring) ring.style.strokeDashoffset = RING_C - (pct / 100) * RING_C;
        if (txt) txt.textContent = t || Math.round(pct) + '%';
    }

    function updateCreds() {
        const u = $('kuan-username');
        const e = $('kuan-email');

        if (u) u.textContent = state.username || '—';
        if (e) e.textContent = state.email || '—';
    }

    /* ================================================================
    DRAG
    ================================================================ */
    function makeDraggable(container, handle) {
        let ox = 0;
        let oy = 0;
        let sx = 0;
        let sy = 0;
        let dragging = false;

        const startDrag = (cx, cy, ev) => {
            if (ev && ev.cancelable) ev.preventDefault();

            const r = container.getBoundingClientRect();

            container.style.right = 'auto';
            container.style.bottom = 'auto';
            container.style.left = r.left + 'px';
            container.style.top = r.top + 'px';

            sx = cx;
            sy = cy;
            ox = r.left;
            oy = r.top;

            dragging = true;
            state._dragging = true;

            document.body.style.userSelect = 'none';
        };

        const moveDrag = (cx, cy, ev) => {
            if (!dragging) return;

            if (ev && ev.cancelable) ev.preventDefault();

            let nx = ox + cx - sx;
            let ny = oy + cy - sy;

            nx = Math.max(0, Math.min(window.innerWidth - container.offsetWidth, nx));
            ny = Math.max(0, Math.min(window.innerHeight - container.offsetHeight, ny));

            container.style.left = nx + 'px';
            container.style.top = ny + 'px';
        };

        const endDrag = () => {
            if (!dragging) return;

            dragging = false;
            state._dragging = false;

            document.body.style.userSelect = '';

            const r = container.getBoundingClientRect();

            saveJSON(KEYS.pos, {
                left: r.left,
                top: r.top,
                ts: Date.now()
            });
        };

        handle.addEventListener('mousedown', e => {
            if (e.target.tagName === 'BUTTON') return;

            e.preventDefault();
            startDrag(e.clientX, e.clientY, e);
        });

        document.addEventListener('mousemove', e => moveDrag(e.clientX, e.clientY, e));
        document.addEventListener('mouseup', endDrag);

        handle.addEventListener('touchstart', e => {
            if (e.target.tagName === 'BUTTON') return;

            const t = e.touches[0];
            startDrag(t.clientX, t.clientY, e);
        }, {
            passive: false
        });

        document.addEventListener('touchmove', e => {
            if (!dragging) return;

            e.preventDefault();

            const t = e.touches[0];
            moveDrag(t.clientX, t.clientY, e);
        }, {
            passive: false
        });

        document.addEventListener('touchend', endDrag);
        document.addEventListener('touchcancel', endDrag);

        handle.addEventListener('contextmenu', e => e.preventDefault());
    }

    function restoreUIPosition() {
        const ui = $('kuandev-ui');
        if (!ui) return;

        const pos = loadJSON(KEYS.pos);
        if (!pos) return;

        ui.style.right = 'auto';
        ui.style.bottom = 'auto';

        ui.style.left = Math.max(0, Math.min(window.innerWidth - 60, pos.left)) + 'px';
        ui.style.top = Math.max(0, Math.min(window.innerHeight - 60, pos.top)) + 'px';
    }

    /* ================================================================
    TOGGLE ICON
    ================================================================ */
    function createToggleIcon() {
        $('kuandev-toggle')?.remove();

        const btn = document.createElement('div');
        btn.id = 'kuandev-toggle';
        btn.title = 'Bật/Tắt KuanDev Prenium (Ctrl+Shift+K)';
        btn.textContent = '🛠';

        btn.style.cssText = `
            position:fixed;
            bottom:12px;
            right:12px;
            z-index:9999998;
            width:30px;
            height:30px;
            background:rgba(0,0,0,.55);
            backdrop-filter:blur(10px);
            border:1px solid rgba(255,255,255,.14);
            border-radius:9px;
            display:flex;
            align-items:center;
            justify-content:center;
            font-size:14px;
            cursor:pointer;
            box-shadow:0 4px 14px rgba(0,0,0,.55);
            transition:transform .15s;
            user-select:none;
        `;

        btn.addEventListener('mouseenter', () => btn.style.transform = 'scale(1.08)');
        btn.addEventListener('mouseleave', () => btn.style.transform = 'scale(1)');

        btn.addEventListener('click', () => {
            state.hidden = !state.hidden;
            saveJSON(KEYS.hidden, state.hidden ? '1' : '0');
            applyVisibility();
            toast(state.hidden ? '👁 Đã ẩn menu' : '👁 Đã hiện menu', 'info');
        });

        document.body.appendChild(btn);
    }

    function applyVisibility() {
        const ui = $('kuandev-ui');
        if (ui) ui.style.display = state.hidden ? 'none' : '';
    }

    document.addEventListener('keydown', e => {
        if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'k') {
            e.preventDefault();

            state.hidden = !state.hidden;
            saveJSON(KEYS.hidden, state.hidden ? '1' : '0');
            applyVisibility();
        }
    });

    /* ================================================================
    INIT
    ================================================================ */
    loadConfig();

    state.hidden = loadJSON(KEYS.hidden) === '1';

    const restored = checkAndRestore();

    function initUI() {
        createUI();
        createToggleIcon();
        restoreUIPosition();
        applyVisibility();

        state.targetAccounts = CONFIG.maxAccounts;

        const t1 = $('kuan-target');
        if (t1) t1.textContent = CONFIG.maxAccounts;

        if (restored) {
            updateAccountsCount();
            updateStats();

            renderStatus('🟡 Khôi phục phiên trước', THEME.warn);

            if (state._shouldAutoResume && state.totalCreated < state.targetAccounts) {
                toast('🔄 Tự động chạy tiếp...', 'info');
                setTimeout(() => {
                    if (!state.stopRequested) startProcess();
                }, 1500);
            }
        } else {
            renderStatus('🟢 Sẵn sàng — bấm ▶ START', THEME.ok);
        }
    }

    window.addEventListener('beforeunload', () => {
        if (!state._dragging) persistCurrentPosition();
        if (state.isRunning || state.accounts.length > 0) persistProgress(!state.stopRequested);
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initUI);
    } else {
        initUI();
    }
})();
