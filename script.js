import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getAuth, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { getDatabase, ref, get, set, push, onValue, off } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-database.js";

// Firebase 설정
const firebaseConfig = {
  apiKey: "AIzaSyBzjJycrTy2tztsdicyQwSCDkzMq5gd4aQ",
  authDomain: "class-point-34.firebaseapp.com",
  projectId: "class-point-34",
  storageBucket: "class-point-34.firebasestorage.app",
  messagingSenderId: "650346593021",
  appId: "1:650346593021:web:33219ee58db3366d965c94",
  measurementId: "G-YHB6XFPDFF",
  databaseURL: "https://class-point-34-default-rtdb.asia-southeast1.firebasedatabase.app/"
};

// Firebase 초기화
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const database = getDatabase(app);

class PointManager {
    constructor() {
        this.currentUser = null;
        this.transactions = [];
        this.currentFilter = 'all';
        this.onlineUsers = new Set();
        this.rouletteHistory = [];
        this.weeklyRouletteCount = 0;
        this.init();
    }

    init() {
        // DOM이 완전히 로드되었는지 확인
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                this.initializeAfterDOM();
            });
        } else {
            this.initializeAfterDOM();
        }
    }

    initializeAfterDOM() {
        this.checkAuthState();
        this.bindEvents();
        this.loadTransactions();
        this.updateUI();
    }

    checkAuthState() {
        // 사용자 인증 상태 확인
        onAuthStateChanged(auth, (user) => {
            if (user) {
                // 로그인된 상태
                this.currentUser = user;
                this.loadUserData();
                this.showUserActions();
                this.loadUserTransactions();
                this.updateOnlineStatus(true); // 로그인 시 온라인 상태 업데이트
            } else {
                // 로그아웃된 상태
                this.currentUser = null;
                this.showGuestActions();
                this.clearUserData();
                this.updateOnlineStatus(false); // 로그아웃 시 온라인 상태 업데이트
            }
        });
    }

    async loadUserData() {
        if (!this.currentUser) return;
        
        try {
            const userRef = ref(database, 'users/' + this.currentUser.uid);
            const userSnapshot = await get(userRef);
            
            if (userSnapshot.exists()) {
                const userData = userSnapshot.val();
                this.updateHeaderUserInfo(userData.username, userData.points || 0);
                this.updateBalance(userData.points || 0);
                
                // 룰렛 관련 데이터 로드
                this.loadRouletteData();
            }
        } catch (error) {
            console.error('사용자 정보 로드 오류:', error);
        }
    }

    async loadUserTransactions() {
        if (!this.currentUser) return;
        
        try {
            const transactionsRef = ref(database, 'users/' + this.currentUser.uid + '/transactions');
            onValue(transactionsRef, (snapshot) => {
                if (snapshot.exists()) {
                    const transactionsData = snapshot.val();
                    this.transactions = Object.values(transactionsData || {});
                    this.updateUI();
                } else {
                    this.transactions = [];
                    this.updateUI();
                }
            });
        } catch (error) {
            console.error('거래 내역 로드 오류:', error);
        }
    }

    showUserActions() {
        document.getElementById('guestActions').classList.add('hidden');
        document.getElementById('userActions').classList.remove('hidden');
    }

    showGuestActions() {
        document.getElementById('guestActions').classList.remove('hidden');
        document.getElementById('userActions').classList.add('hidden');
    }

    updateHeaderUserInfo(username, points) {
        document.getElementById('headerUsername').textContent = username || '사용자';
        document.getElementById('headerUserPoints').textContent = points + 'P';
    }

    clearUserData() {
        this.transactions = [];
        this.updateBalance(0);
        this.updateStats(0, 0, 0);
        this.updateTransactionsList();
        this.updateHeaderUserInfo('사용자', 0);
    }

    bindEvents() {
        // 로그인 버튼
        document.getElementById('loginBtn').addEventListener('click', () => this.handleLogin());

        // 로그아웃 버튼
        document.getElementById('logoutBtn').addEventListener('click', () => this.handleLogout());

        // 탭 버튼들
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchTab(e));
        });

        // 적립 폼
        document.getElementById('addEarnBtn').addEventListener('click', () => this.addTransaction('earn'));

        // 사용 폼
        document.getElementById('addSpendBtn').addEventListener('click', () => this.addTransaction('spend'));

        // 필터 버튼들
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.filterTransactions(e));
        });

        // 룰렛 관련 이벤트
        document.getElementById('spinRouletteBtn').addEventListener('click', () => this.spinRoulette());
    }

    handleLogin() {
        // 로그인 페이지로 이동
        window.location.href = 'login.html';
    }

    async handleLogout() {
        try {
            await signOut(auth);
            this.showNotification('로그아웃되었습니다.', 'success');
            
            // 로컬 스토리지 정리
            localStorage.removeItem('currentUser');
            
            // 페이지 새로고침 (선택사항)
            // window.location.reload();
        } catch (error) {
            console.error('로그아웃 오류:', error);
            this.showNotification('로그아웃 중 오류가 발생했습니다.', 'error');
        }
    }

    switchTab(e) {
        const targetTab = e.target.dataset.tab;
        
        // 모든 탭 버튼 비활성화
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        
        // 모든 폼 숨기기
        document.querySelectorAll('.input-form').forEach(form => form.classList.add('hidden'));
        
        // 선택된 탭 활성화
        e.target.classList.add('active');
        
        // 해당 폼 표시
        document.getElementById(targetTab + 'Form').classList.remove('hidden');
    }



    async addTransaction(type) {
        if (!this.currentUser) {
            this.showNotification('로그인이 필요합니다.', 'warning');
            return;
        }

        let amount, reason;
        
        if (type === 'earn') {
            amount = parseInt(document.getElementById('earnAmount').value);
            reason = document.getElementById('earnReason').value;
            
            if (!amount || !reason) {
                this.showNotification('적립 사유와 포인트를 선택해주세요.', 'warning');
                return;
            }
        } else {
            amount = parseInt(document.getElementById('spendAmount').value);
            reason = document.getElementById('spendReason').value;
            
            if (!amount || !reason) {
                this.showNotification('사용할 포인트와 사유를 입력해주세요.', 'warning');
                return;
            }
            
            if (amount > this.getCurrentBalance()) {
                this.showNotification('보유 포인트가 부족합니다.', 'error');
                return;
            }
        }

        try {
            const transaction = {
                type: type,
                amount: amount,
                reason: reason,
                timestamp: new Date().toISOString(),
                date: new Date().toLocaleDateString('ko-KR')
            };

            // Firebase에 거래 내역 저장
            const transactionsRef = ref(database, 'users/' + this.currentUser.uid + '/transactions');
            const newTransactionRef = push(transactionsRef);
            await set(newTransactionRef, transaction);

            // 전역 활동 로그에 저장
            const globalActivityRef = ref(database, 'globalActivity');
            const newActivityRef = push(globalActivityRef);
            const activityData = {
                ...transaction,
                userId: this.currentUser.uid,
                username: this.currentUser.displayName || '알 수 없음'
            };
            await set(newActivityRef, activityData);

            // 사용자 포인트 업데이트
            const userRef = ref(database, 'users/' + this.currentUser.uid);
            const userSnapshot = await get(userRef);
            
            if (userSnapshot.exists()) {
                const userData = userSnapshot.val();
                const currentPoints = userData.points || 0;
                const newPoints = type === 'earn' ? currentPoints + amount : currentPoints - amount;
                
                await set(ref(database, 'users/' + this.currentUser.uid + '/points'), newPoints);
                
                // 헤더 포인트 업데이트
                this.updateHeaderUserInfo(userData.username, newPoints);
            }

            // 폼 초기화
            if (type === 'earn') {
                document.getElementById('earnReason').selectedIndex = 0;
                document.getElementById('earnAmount').value = '';
            } else {
                document.getElementById('spendAmount').value = '';
                document.getElementById('spendReason').value = '';
            }

            this.showNotification(`${type === 'earn' ? '적립' : '사용'}이 완료되었습니다!`, 'success');
            
        } catch (error) {
            console.error('거래 추가 오류:', error);
            this.showNotification('거래 처리 중 오류가 발생했습니다.', 'error');
        }
    }

    filterTransactions(e) {
        const filter = e.target.dataset.filter;
        
        // 모든 필터 버튼 비활성화
        document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
        
        // 선택된 필터 활성화
        e.target.classList.add('active');
        
        this.currentFilter = filter;
        this.updateTransactionsList();
    }

    getCurrentBalance() {
        return parseInt(document.getElementById('currentBalance').textContent) || 0;
    }

    updateBalance(balance) {
        document.getElementById('currentBalance').textContent = balance;
    }

    updateStats(totalEarned, totalSpent, transactionCount) {
        document.getElementById('totalEarned').textContent = totalEarned;
        document.getElementById('totalSpent').textContent = totalSpent;
        document.getElementById('transactionCount').textContent = transactionCount;
    }

    updateTransactionsList() {
        const transactionsList = document.getElementById('transactionsList');
        const emptyState = document.getElementById('emptyState');
        
        // 필터링된 거래 내역
        let filteredTransactions = this.transactions;
        
        if (this.currentFilter === 'earn') {
            filteredTransactions = this.transactions.filter(t => t.type === 'earn');
        } else if (this.currentFilter === 'spend') {
            filteredTransactions = this.transactions.filter(t => t.type === 'spend');
        }

        if (filteredTransactions.length === 0) {
            transactionsList.innerHTML = '';
            emptyState.style.display = 'block';
            return;
        }

        emptyState.style.display = 'none';

        // 통계 계산
        const totalEarned = this.transactions.filter(t => t.type === 'earn').reduce((sum, t) => sum + t.amount, 0);
        const totalSpent = this.transactions.filter(t => t.type === 'spend').reduce((sum, t) => sum + t.amount, 0);
        const transactionCount = this.transactions.length;

        this.updateStats(totalEarned, totalSpent, transactionCount);

        // 거래 내역 렌더링
        transactionsList.innerHTML = filteredTransactions
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .map(transaction => this.createTransactionHTML(transaction))
            .join('');
    }

    createTransactionHTML(transaction) {
        const isEarn = transaction.type === 'earn';
        const icon = isEarn ? 'fa-plus-circle' : 'fa-minus-circle';
        const colorClass = isEarn ? 'earn' : 'spend';
        const sign = isEarn ? '+' : '-';
        
        return `
            <div class="transaction-item ${colorClass}">
                <div class="transaction-icon">
                    <i class="fas ${icon}"></i>
                </div>
                <div class="transaction-details">
                    <div class="transaction-reason">${transaction.reason}</div>
                    <div class="transaction-date">${transaction.date}</div>
                </div>
                <div class="transaction-amount">
                    <span class="amount-sign">${sign}</span>
                    <span class="amount-value">${transaction.amount}</span>
                    <span class="amount-unit">P</span>
                </div>
            </div>
        `;
    }

    loadTransactions() {
        // 로컬 스토리지에서 거래 내역 로드 (기존 코드 유지)
        const savedTransactions = localStorage.getItem('transactions');
        if (savedTransactions) {
            this.transactions = JSON.parse(savedTransactions);
        }
    }

    updateUI() {
        this.updateTransactionsList();
        this.updateActivityLog();
        
        // 초기 상태에서 empty state 표시
        if (this.transactions.length === 0) {
            document.getElementById('emptyState').style.display = 'block';
        }
    }

    showNotification(message, type = 'info') {
        // 알림 시스템
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;

        document.body.appendChild(notification);

        // 애니메이션
        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
        }, 100);

        // 자동 제거
        setTimeout(() => {
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }

    // 활동 로그 업데이트
    updateActivityLog() {
        this.loadGlobalActivityLog();
        this.updateOnlineUsers();
        this.updateLastUpdate();
    }

    // 전역 활동 로그 로드
    loadGlobalActivityLog() {
        try {
            const globalActivityRef = ref(database, 'globalActivity');
            onValue(globalActivityRef, (snapshot) => {
                if (snapshot.exists()) {
                    const activities = snapshot.val();
                    const activityArray = Object.values(activities || {});
                    this.renderActivityLog(activityArray);
                } else {
                    this.renderActivityLog([]);
                }
            });
        } catch (error) {
            console.error('전역 활동 로그 로드 오류:', error);
        }
    }

    // 활동 로그 렌더링
    renderActivityLog(activities) {
        const activityFeed = document.getElementById('activityFeed');
        const emptyActivity = document.getElementById('emptyActivity');
        
        if (activities.length === 0) {
            activityFeed.innerHTML = '';
            emptyActivity.style.display = 'block';
            return;
        }
        
        emptyActivity.style.display = 'none';
        
        // 최신 순으로 정렬하고 최대 50개만 표시
        const sortedActivities = activities
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, 50);
        
        activityFeed.innerHTML = sortedActivities.map(activity => 
            this.createActivityHTML(activity)
        ).join('');
        
        // 자동 스크롤을 맨 아래로
        activityFeed.scrollTop = activityFeed.scrollHeight;
    }

    // 활동 HTML 생성
    createActivityHTML(activity) {
        const isEarn = activity.type === 'earn';
        const avatarClass = isEarn ? 'earn' : 'spend';
        const typeClass = isEarn ? 'earn' : 'spend';
        const amountClass = isEarn ? 'earn' : 'spend';
        const typeText = isEarn ? '적립' : '사용';
        const sign = isEarn ? '+' : '-';
        
        // 사용자 이름의 첫 글자로 아바타 생성
        const avatarText = activity.username ? activity.username.charAt(0).toUpperCase() : '?';
        
        // 시간 포맷팅
        const timeAgo = this.getTimeAgo(activity.timestamp);
        
        return `
            <div class="activity-item">
                <div class="activity-avatar ${avatarClass}">
                    ${avatarText}
                </div>
                <div class="activity-content">
                    <div class="activity-header">
                        <span class="activity-username">${activity.username || '알 수 없음'}</span>
                        <span class="activity-type ${typeClass}">${typeText}</span>
                        <span class="activity-time">${timeAgo}</span>
                    </div>
                    <div class="activity-message">
                        ${activity.reason}
                        <span class="activity-amount ${amountClass}">${sign}${activity.amount}P</span>
                    </div>
                </div>
            </div>
        `;
    }

    // 시간 전 표시
    getTimeAgo(timestamp) {
        const now = new Date();
        const activityTime = new Date(timestamp);
        const diffInSeconds = Math.floor((now - activityTime) / 1000);
        
        if (diffInSeconds < 60) return '방금 전';
        if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}분 전`;
        if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}시간 전`;
        if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 86400)}일 전`;
        
        return activityTime.toLocaleDateString('ko-KR');
    }

    // 온라인 사용자 수 업데이트
    updateOnlineUsers() {
        try {
            const onlineUsersRef = ref(database, 'onlineUsers');
            onValue(onlineUsersRef, (snapshot) => {
                if (snapshot.exists()) {
                    const onlineUsers = snapshot.val();
                    const count = Object.keys(onlineUsers || {}).length;
                    document.getElementById('onlineUsers').textContent = `온라인: ${count}명`;
                } else {
                    document.getElementById('onlineUsers').textContent = '온라인: 0명';
                }
            });
        } catch (error) {
            console.error('온라인 사용자 수 업데이트 오류:', error);
        }
    }

    // 마지막 업데이트 시간 업데이트
    updateLastUpdate() {
        const now = new Date();
        const timeString = now.toLocaleTimeString('ko-KR', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
        document.getElementById('lastUpdate').textContent = `마지막 업데이트: ${timeString}`;
        
        // 1분마다 업데이트
        setTimeout(() => this.updateLastUpdate(), 60000);
    }

    // 거래 추가 시 전역 활동 로그에도 저장
    async addTransaction(type) {
        if (!this.currentUser) {
            this.showNotification('로그인이 필요합니다.', 'warning');
            return;
        }

        let amount, reason;
        
        if (type === 'earn') {
            amount = parseInt(document.getElementById('earnAmount').value);
            reason = document.getElementById('earnReason').value;
            
            if (!amount || !reason) {
                this.showNotification('적립 사유와 포인트를 선택해주세요.', 'warning');
                return;
            }
        } else {
            amount = parseInt(document.getElementById('spendAmount').value);
            reason = document.getElementById('spendReason').value;
            
            if (!amount || !reason) {
                this.showNotification('사용할 포인트와 사유를 입력해주세요.', 'warning');
                return;
            }
            
            if (amount > this.getCurrentBalance()) {
                this.showNotification('보유 포인트가 부족합니다.', 'error');
                return;
            }
        }

        try {
            const transaction = {
                type: type,
                amount: amount,
                reason: reason,
                timestamp: new Date().toISOString(),
                date: new Date().toLocaleDateString('ko-KR')
            };

            // Firebase에 거래 내역 저장
            const transactionsRef = ref(database, 'users/' + this.currentUser.uid + '/transactions');
            const newTransactionRef = push(transactionsRef);
            await set(newTransactionRef, transaction);

            // 전역 활동 로그에 저장
            const globalActivityRef = ref(database, 'globalActivity');
            const newActivityRef = push(globalActivityRef);
            const activityData = {
                ...transaction,
                userId: this.currentUser.uid,
                username: this.currentUser.displayName || '알 수 없음'
            };
            await set(newActivityRef, activityData);

            // 사용자 포인트 업데이트
            const userRef = ref(database, 'users/' + this.currentUser.uid);
            const userSnapshot = await get(userRef);
            
            if (userSnapshot.exists()) {
                const userData = userSnapshot.val();
                const currentPoints = userData.points || 0;
                const newPoints = type === 'earn' ? currentPoints + amount : currentPoints - amount;
                
                await set(ref(database, 'users/' + this.currentUser.uid + '/points'), newPoints);
                
                // 헤더 포인트 업데이트
                this.updateHeaderUserInfo(userData.username, newPoints);
            }

            // 폼 초기화
            if (type === 'earn') {
                document.getElementById('earnReason').selectedIndex = 0;
                document.getElementById('earnAmount').value = '';
            } else {
                document.getElementById('spendAmount').value = '';
                document.getElementById('spendReason').value = '';
            }

            this.showNotification(`${type === 'earn' ? '적립' : '사용'}이 완료되었습니다!`, 'success');
            
        } catch (error) {
            console.error('거래 추가 오류:', error);
            this.showNotification('거래 처리 중 오류가 발생했습니다.', 'error');
        }
    }

    // 사용자 로그인 시 온라인 상태 추가
    async updateOnlineStatus(isOnline) {
        if (!this.currentUser) return;
        
        try {
            const onlineUsersRef = ref(database, 'onlineUsers/' + this.currentUser.uid);
            if (isOnline) {
                await set(onlineUsersRef, {
                    username: this.currentUser.displayName || '알 수 없음',
                    lastSeen: new Date().toISOString()
                });
            } else {
                await set(onlineUsersRef, null);
            }
        } catch (error) {
            console.error('온라인 상태 업데이트 오류:', error);
        }
    }

    // 룰렛 데이터 로드
    async loadRouletteData() {
        try {
            const rouletteRef = ref(database, 'users/' + this.currentUser.uid + '/roulette');
            const rouletteSnapshot = await get(rouletteRef);
            
            if (rouletteSnapshot.exists()) {
                const rouletteData = rouletteSnapshot.val();
                this.rouletteHistory = rouletteData.history || [];
                this.weeklyRouletteCount = rouletteData.weeklyCount || 0;
                this.lastResetDate = rouletteData.lastResetDate;
                
                // 주간 리셋 확인
                this.checkWeeklyReset();
                
                this.updateRouletteUI();
            }
        } catch (error) {
            console.error('룰렛 데이터 로드 오류:', error);
        }
    }

    // 주간 리셋 확인
    checkWeeklyReset() {
        const now = new Date();
        const lastReset = this.lastResetDate ? new Date(this.lastResetDate) : null;
        
        // 월요일 00:00 기준으로 리셋
        const currentWeekStart = this.getWeekStart(now);
        const lastWeekStart = lastReset ? this.getWeekStart(lastReset) : null;
        
        if (!lastWeekStart || currentWeekStart.getTime() !== lastWeekStart.getTime()) {
            this.weeklyRouletteCount = 0;
            this.lastResetDate = currentWeekStart.toISOString();
            this.saveRouletteData();
        }
    }

    // 주의 시작일 계산 (월요일 00:00)
    getWeekStart(date) {
        const day = date.getDay();
        const diff = date.getDate() - day + (day === 0 ? -6 : 1); // 월요일이 1, 일요일이 0
        const monday = new Date(date.setDate(diff));
        monday.setHours(0, 0, 0, 0);
        return monday;
    }

    // 룰렛 UI 업데이트
    updateRouletteUI() {
        // 주간 제한 표시
        document.getElementById('weeklyLimitCount').textContent = 3 - this.weeklyRouletteCount;
        
        // 룰렛 버튼 활성화/비활성화
        const spinBtn = document.getElementById('spinRouletteBtn');
        if (this.weeklyRouletteCount >= 3) {
            spinBtn.disabled = true;
            spinBtn.textContent = '이번 주 한계 도달';
        } else {
            spinBtn.disabled = false;
            spinBtn.innerHTML = '<i class="fas fa-play"></i> 룰렛 돌리기';
        }
        
        // 기록 표시
        this.renderRouletteHistory();
    }

    // 룰렛 돌리기
    async spinRoulette() {
        if (!this.currentUser) {
            this.showNotification('로그인이 필요합니다.', 'warning');
            return;
        }

        if (this.weeklyRouletteCount >= 3) {
            this.showNotification('이번 주 룰렛 사용 한계에 도달했습니다.', 'warning');
            return;
        }

        const betAmount = parseInt(document.getElementById('betAmount').value);
        const predictedNumber = parseInt(document.getElementById('predictedNumber').value);

        if (!betAmount || betAmount <= 0) {
            this.showNotification('베팅 포인트를 입력해주세요.', 'warning');
            return;
        }

        if (!predictedNumber) {
            this.showNotification('예측 숫자를 선택해주세요.', 'warning');
            return;
        }

        if (betAmount > this.getCurrentBalance()) {
            this.showNotification('보유 포인트가 부족합니다.', 'error');
            return;
        }

        try {
            // 룰렛 애니메이션 시작
            const wheel = document.getElementById('rouletteWheel');
            wheel.classList.add('spinning');
            
            // 버튼 비활성화
            const spinBtn = document.getElementById('spinRouletteBtn');
            spinBtn.disabled = true;
            spinBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 돌리는 중...';

            // 3초 후 결과 표시
            setTimeout(async () => {
                wheel.classList.remove('spinning');
                
                // 결과 계산
                const result = this.calculateRouletteResult();
                const isWin = result === predictedNumber;
                const winAmount = isWin ? betAmount * result : 0;
                const netAmount = winAmount - betAmount;

                // 결과 표시
                this.showRouletteResult(isWin, result, predictedNumber, betAmount, winAmount, netAmount);

                // 포인트 업데이트
                await this.updateUserPoints(netAmount);

                // 룰렛 기록 저장
                this.saveRouletteResult(betAmount, predictedNumber, result, isWin, netAmount);

                // 주간 카운트 증가
                this.weeklyRouletteCount++;
                this.updateRouletteUI();

                // 버튼 재활성화
                spinBtn.disabled = false;
                spinBtn.innerHTML = '<i class="fas fa-play"></i> 룰렛 돌리기';

                // 폼 초기화
                document.getElementById('betAmount').value = '';
                document.getElementById('predictedNumber').selectedIndex = 0;

            }, 3000);

        } catch (error) {
            console.error('룰렛 실행 오류:', error);
            this.showNotification('룰렛 실행 중 오류가 발생했습니다.', 'error');
            
            // 에러 시 버튼 재활성화
            const spinBtn = document.getElementById('spinRouletteBtn');
            spinBtn.disabled = false;
            spinBtn.innerHTML = '<i class="fas fa-play"></i> 룰렛 돌리기';
        }
    }

    // 룰렛 결과 계산 (확률 기반)
    calculateRouletteResult() {
        const random = Math.random() * 100;
        
        // 확률 분배
        if (random < 50) return 2;      // 50%
        if (random < 80) return 3;      // 30%
        if (random < 95) return 5;      // 15%
        if (random < 98) return 7;      // 3%
        if (random < 99.5) return 10;   // 1.5%
        return 15;                       // 0.5%
    }

    // 룰렛 결과 표시
    showRouletteResult(isWin, result, predicted, betAmount, winAmount, netAmount) {
        const resultDiv = document.getElementById('rouletteResult');
        
        const resultHTML = `
            <div class="result-text ${isWin ? 'result-win' : 'result-lose'}">
                ${isWin ? '🎉 당첨!' : '😢 아쉽네요...'}
            </div>
            <div class="result-details">
                예측: ${predicted}배 | 결과: ${result}배<br>
                베팅: ${betAmount}P | ${isWin ? `획득: +${winAmount}P` : `손실: -${betAmount}P`}<br>
                <strong>${netAmount >= 0 ? '+' : ''}${netAmount}P</strong>
            </div>
        `;
        
        resultDiv.innerHTML = resultHTML;
        resultDiv.classList.add('show');
        
        // 5초 후 결과 숨기기
        setTimeout(() => {
            resultDiv.classList.remove('show');
        }, 5000);
    }

    // 사용자 포인트 업데이트
    async updateUserPoints(netAmount) {
        try {
            const userRef = ref(database, 'users/' + this.currentUser.uid);
            const userSnapshot = await get(userRef);
            
            if (userSnapshot.exists()) {
                const userData = userSnapshot.val();
                const currentPoints = userData.points || 0;
                const newPoints = currentPoints + netAmount;
                
                await set(ref(database, 'users/' + this.currentUser.uid + '/points'), newPoints);
                
                // 헤더 포인트 업데이트
                this.updateHeaderUserInfo(userData.username, newPoints);
                this.updateBalance(newPoints);
            }
        } catch (error) {
            console.error('포인트 업데이트 오류:', error);
        }
    }

    // 룰렛 결과 저장
    async saveRouletteResult(betAmount, predicted, result, isWin, netAmount) {
        const rouletteRecord = {
            timestamp: new Date().toISOString(),
            date: new Date().toLocaleDateString('ko-KR'),
            betAmount: betAmount,
            predicted: predicted,
            result: result,
            isWin: isWin,
            netAmount: netAmount
        };

        this.rouletteHistory.unshift(rouletteRecord);
        
        // 최근 10개만 유지
        if (this.rouletteHistory.length > 10) {
            this.rouletteHistory = this.rouletteHistory.slice(0, 10);
        }

        await this.saveRouletteData();
        this.renderRouletteHistory();
    }

    // 룰렛 데이터 저장
    async saveRouletteData() {
        try {
            const rouletteRef = ref(database, 'users/' + this.currentUser.uid + '/roulette');
            await set(rouletteRef, {
                history: this.rouletteHistory,
                weeklyCount: this.weeklyRouletteCount,
                lastResetDate: this.lastResetDate
            });
        } catch (error) {
            console.error('룰렛 데이터 저장 오류:', error);
        }
    }

    // 룰렛 기록 렌더링
    renderRouletteHistory() {
        const historyList = document.getElementById('rouletteHistory');
        
        if (this.rouletteHistory.length === 0) {
            historyList.innerHTML = '<div style="text-align: center; color: #999; padding: 20px;">아직 기록이 없습니다</div>';
            return;
        }

        historyList.innerHTML = this.rouletteHistory.map(record => `
            <div class="history-item">
                <div class="history-prediction">${record.predicted}배</div>
                <div class="history-result ${record.isWin ? 'win' : 'lose'}">
                    ${record.isWin ? '승' : '패'}
                </div>
                <div class="history-amount ${record.netAmount >= 0 ? 'positive' : 'negative'}">
                    ${record.netAmount >= 0 ? '+' : ''}${record.netAmount}P
                </div>
            </div>
        `).join('');
    }
}

// 앱 초기화
document.addEventListener('DOMContentLoaded', () => {
    new PointManager();
});
