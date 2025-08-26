import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getAuth, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { getDatabase, ref, get, set, push, onValue, update, increment, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-database.js";

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
        this.currentLoanType = null;
        this.gamblingMultiplier = 2;
        this.gamblingBetAmount = 100;
        this.probabilities = { 2: 0.50, 3: 0.33, 5: 0.20, 10: 0.10, 15: 0.07 };
        this.basicGamblingMultiplier = 2;
        this.basicGamblingBetAmount = 100;
        this.basicProbabilities = { 2: 0.45, 3: 0.30, 5: 0.18, 10: 0.09, 15: 0.06 };
        this.afterPasswordCallback = null;
        this.userToAdjust = null;
        this.editingListType = null; // New
        this.isJackpotOpen = true;
        this.isGamblingOpen = true;
        this.isBasicGamblingOpen = true;
        this.isMemoEditMode = false;
        this.init();
    }

    init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.initializeAfterDOM());
        } else {
            this.initializeAfterDOM();
        }
    }

    initializeAfterDOM() {
        this.checkAuthState();
        this.bindEvents();
        this.displayBankProfit();
        this.displayBankSpendingHistory();
        this.displayUsersPoints(); // Display all users points
        this.displayJackpot();
        this.displayDonations();
        this.displayLoanLimits();
        this.initializeSectionStates();
        this.loadMemoContent();
        this.displayGamblerRanking();
        this.displayAllUsersLoanStatus();
        this.updateUI();
        this.loadNewGlobalActivityLog();
    }

    checkAuthState() {
        onAuthStateChanged(auth, (user) => {
            if (user) {
                this.currentUser = user;
                this.loadUserData();
                this.showUserActions();
                this.loadUserTransactions();
                this.updateOnlineStatus(true);
            } else {
                this.currentUser = null;
                this.showGuestActions();
                this.clearUserData();
                this.updateOnlineStatus(false);
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
                this._calculateAndApplyInterest();
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
                this.transactions = Object.values(snapshot.val() || {});
                this.updateUI();
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
        document.getElementById('headerUserPoints').textContent = `${points}P`;
    }

    clearUserData() {
        this.transactions = [];
        this.updateBalance(0);
        this.updateStats(0, 0, 0);
        this.updateTransactionsList();
        this.updateHeaderUserInfo('사용자', 0);
        document.getElementById('totalDebtAmount').textContent = '0P';
        document.getElementById('loanStatusBody').innerHTML = '';
    }

    bindEvents() {
        document.getElementById('loginBtn').addEventListener('click', () => this.handleLogin());
        document.getElementById('logoutBtn').addEventListener('click', () => this.handleLogout());
        document.querySelectorAll('.tab-btn').forEach(btn => btn.addEventListener('click', (e) => this.switchTab(e)));
        document.getElementById('addEarnBtn').addEventListener('click', () => this.addTransaction('earn'));
        document.getElementById('addSpendBtn').addEventListener('click', () => this.addTransaction('spend'));
        document.querySelectorAll('.filter-btn').forEach(btn => btn.addEventListener('click', (e) => this.filterTransactions(e)));
        document.querySelectorAll('.loan-option-btn').forEach(btn => btn.addEventListener('click', (e) => this.openLoanForm(e)));
        document.getElementById('requestLoanBtn').addEventListener('click', () => this.requestLoan());
        document.getElementById('loanStatusBody').addEventListener('click', (e) => {
            if (e.target && e.target.classList.contains('repay-btn')) {
                this.handleRepayment(e);
            }
        });

        // Bank Profit Modal Events
        document.getElementById('useProfitBtn').addEventListener('click', () => {
            this.afterPasswordCallback = () => document.getElementById('spendProfitModal').classList.remove('hidden');
            this.openPasswordModal();
        });
        document.getElementById('closePasswordModalBtn').addEventListener('click', () => this.closeModals());
        document.getElementById('closeSpendModalBtn').addEventListener('click', () => this.closeModals());
        document.getElementById('passwordForm').addEventListener('submit', (e) => this.handlePasswordCheck(e));
        document.getElementById('spendProfitForm').addEventListener('submit', (e) => this.handleSpendProfit(e));
        
        // Jackpot Events
        document.getElementById('tryJackpotBtn').addEventListener('click', () => this.tryJackpot());

        // Gambling Events
        document.querySelectorAll('.gambling-section:not(#basic-gambling-section) .multiplier-btn').forEach(btn => btn.addEventListener('click', (e) => this.selectMultiplier(e, 'standard')));
        document.getElementById('decreaseBetBtn').addEventListener('click', () => this.adjustBet(-100, 'standard'));
        document.getElementById('increaseBetBtn').addEventListener('click', () => this.adjustBet(100, 'standard'));
        document.getElementById('placeBetBtn').addEventListener('click', () => this.placeBet('standard'));

        // Basic Gambling Events
        document.querySelectorAll('#basic-gambling-section .multiplier-btn').forEach(btn => btn.addEventListener('click', (e) => this.selectMultiplier(e, 'basic')));
        document.getElementById('basic-decreaseBetBtn').addEventListener('click', () => this.adjustBet(-100, 'basic'));
        document.getElementById('basic-increaseBetBtn').addEventListener('click', () => this.adjustBet(100, 'basic'));
        document.getElementById('basic-placeBetBtn').addEventListener('click', () => this.placeBet('basic'));

        // Self-study Events
        document.querySelectorAll('.day-btn').forEach(btn => btn.addEventListener('click', (e) => e.currentTarget.classList.toggle('active')));
        document.getElementById('earnSelfStudyBtn').addEventListener('click', () => this.earnSelfStudyPoints());

        // Adjust Points Events
        document.getElementById('usersPointsTableBody').addEventListener('click', (e) => {
            if (e.target && e.target.classList.contains('adjust-btn')) {
                this.handleAdjustPointsClick(e);
            }
        });
        document.getElementById('adjustPointsForm').addEventListener('submit', (e) => this.saveAdjustedPoints(e));
        document.getElementById('closeAdjustModalBtn').addEventListener('click', () => this.closeModals());
        document.getElementById('clearLogBtn').addEventListener('click', () => this.handleClearLog());

        document.getElementById('donateBtn').addEventListener('click', () => this.handleDonation());

        // Loan Limit Events
        document.getElementById('loanLimitTableBody').addEventListener('click', (e) => this.handleEditLoanLimitClick(e));
        document.getElementById('editLoanLimitForm').addEventListener('submit', (e) => this.saveLoanLimit(e));
        document.getElementById('closeLoanLimitModalBtn').addEventListener('click', () => this.closeModals());

        // Toggle Section Events
        document.querySelectorAll('.toggle-section-btn').forEach(btn => btn.addEventListener('click', (e) => this.handleToggleSection(e)));

        // Memo Events
        document.getElementById('editMemoBtn').addEventListener('click', () => this.handleMemoClick());

        // Gambler Ranking Events
        document.getElementById('resetRankingBtn').addEventListener('click', () => this.handleResetGamblerRanking());
    }

    handleLogin() {
        window.location.href = 'login.html';
    }

    async handleLogout() {
        try {
            await signOut(auth);
            this.showNotification('로그아웃되었습니다.', 'success');
        } catch (error) {
            console.error('로그아웃 오류:', error);
            this.showNotification('로그아웃 중 오류가 발생했습니다.', 'error');
        }
    }

    switchTab(e) {
        const targetTab = e.currentTarget.dataset.tab;
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.input-form').forEach(form => form.classList.add('hidden'));
        e.currentTarget.classList.add('active');
        document.getElementById(`${targetTab}Form`).classList.remove('hidden');
    }

    async _saveTransaction(transaction, loanDetails = null, targetUserId = null, skipActivity = false) {
        const userId = targetUserId || this.currentUser.uid;
        if (!userId) return;

        try {
            const transactionsRef = ref(database, `users/${userId}/transactions`);
            const newTransactionRef = push(transactionsRef);
            await set(newTransactionRef, transaction);

            if (loanDetails) {
                const loanRef = ref(database, `users/${userId}/loans/${newTransactionRef.key}`);
                await set(loanRef, loanDetails);
            }

            if (!skipActivity) {
                const globalActivityRef = ref(database, 'globalActivity');
                const newActivityRef = push(globalActivityRef);
                const activityData = { ...transaction, userId: userId, username: this.currentUser.displayName || '알 수 없음' };
                await set(newActivityRef, activityData);

                // Add to new global activity log
                const newGlobalActivityRef = ref(database, 'newGlobalActivity');
                const newActivityLogRef = push(newGlobalActivityRef);
                const newActivityLogData = { ...transaction, userId: userId, username: this.currentUser.displayName || '알 수 없음' };
                await set(newActivityLogRef, newActivityLogData);
            }

            const userRef = ref(database, `users/${userId}`);
            const userSnapshot = await get(userRef);
            if (userSnapshot.exists()) {
                const userData = userSnapshot.val();
                const currentPoints = userData.points || 0;
                const newPoints = transaction.type === 'earn' ? currentPoints + transaction.amount : currentPoints - transaction.amount;
                await set(ref(database, `users/${userId}/points`), newPoints);
                
                if (userId === this.currentUser.uid) {
                    this.updateHeaderUserInfo(userData.username, newPoints);
                    this.updateBalance(newPoints);
                }
            }
            if (!skipActivity) {
                this.showNotification(`${transaction.reason}이(가) 완료되었습니다!`, 'success');
            }
        } catch (error) {
            console.error('거래 추가 오류:', error);
            this.showNotification('거래 처리 중 오류가 발생했습니다.', 'error');
        }
    }

    async addTransaction(type) {
        if (!this.currentUser) return this.showNotification('로그인이 필요합니다.', 'warning');
        const amount = parseInt(document.getElementById(`${type}Amount`).value);
        const reason = document.getElementById(`${type}Reason`).value;
        if (!amount || !reason) return this.showNotification('사유와 포인트를 올바르게 입력해주세요.', 'warning');
        if (type === 'spend' && amount > this.getCurrentBalance()) return this.showNotification('보유 포인트가 부족합니다.', 'error');
        const transaction = { type, amount, reason, timestamp: new Date().toISOString() };
        await this._saveTransaction(transaction);
        document.getElementById(`${type}Amount`).value = '';
        document.getElementById(`${type}Reason`).value = '';
    }

    openLoanForm(e) {
        const loanType = e.currentTarget.dataset.loanType;
        this.currentLoanType = loanType;
        document.getElementById('loanTypeTitle').textContent = `${loanType} 신청`;
        
        const loanReasonGroup = document.getElementById('loanReasonGroup');
        const loanInterestGroup = document.getElementById('loanInterestGroup');

        loanReasonGroup.classList.add('hidden');
        loanInterestGroup.classList.add('hidden');

        if (loanType === '사회적 가치 우대 대출') {
            loanReasonGroup.classList.remove('hidden');
        } else if (loanType === '테스트용 대출') {
            loanInterestGroup.classList.remove('hidden');
        }

        document.getElementById('loanForm').classList.remove('hidden');
    }

    async requestLoan() {
        if (!this.currentUser) return this.showNotification('로그인이 필요합니다.', 'warning');
        const amount = parseInt(document.getElementById('loanAmount').value);
        if (!amount || amount < 100) return this.showNotification('대출은 100포인트 이상부터 가능합니다.', 'warning');

        const userRef = ref(database, `users/${this.currentUser.uid}`);
        const userSnapshot = await get(userRef);
        const userData = userSnapshot.val();
        const loanLimit = userData.loanLimit || 1000; // Default to 1000 if not set

        const loansRef = ref(database, `users/${this.currentUser.uid}/loans`);
        const loansSnapshot = await get(loansRef);
        const loans = loansSnapshot.val() || {};
        const totalDebt = Object.values(loans)
            .filter(loan => loan.status === 'active')
            .reduce((sum, loan) => sum + loan.amountDue, 0);

        if (totalDebt + amount > loanLimit) {
            return this.showNotification(`대출 한도(${loanLimit}P)를 초과할 수 없습니다. 현재 대출 총액: ${totalDebt}P`, 'error');
        }

        let reason = this.currentLoanType;
        let loanDetails = null;

        if (this.currentLoanType === '일반 대출') {
            loanDetails = { type: '일반 대출', interestRate: 0.05, principal: amount, amountDue: amount, startDate: new Date().toISOString(), lastInterestAppliedDate: new Date().toISOString(), status: 'active' };
        } else if (this.currentLoanType === '사회적 가치 우대 대출') {
            const loanReasonText = document.getElementById('loanReason').value;
            if (!loanReasonText) return this.showNotification('대출 사유를 입력해주세요.', 'warning');
            reason = `${this.currentLoanType}: ${loanReasonText}`;
            loanDetails = { type: '사회적 가치 우대 대출', interestRate: 0.02, principal: amount, amountDue: amount, reason: loanReasonText, startDate: new Date().toISOString(), lastInterestAppliedDate: new Date().toISOString(), status: 'active' };
        }

        const transaction = { type: 'earn', amount, reason, timestamp: new Date().toISOString() };
        await this._saveTransaction(transaction, loanDetails);

        document.getElementById('loanForm').classList.add('hidden');
        document.getElementById('loanAmount').value = '';
        document.getElementById('loanReason').value = '';
        document.getElementById('loanInterestAmount').value = '';
        this.currentLoanType = null;
        this._calculateAndApplyInterest();
        this.displayAllUsersLoanStatus();
    }

    async handleRepayment(e) {
        const loanId = e.target.dataset.loanId;
        const amountDue = parseInt(e.target.dataset.amountDue);
        if (!loanId || !amountDue) return;

        if (this.getCurrentBalance() < amountDue) {
            return this.showNotification('포인트가 부족하여 상환할 수 없습니다.', 'error');
        }

        const loanRef = ref(database, `users/${this.currentUser.uid}/loans/${loanId}`);
        const loanSnapshot = await get(loanRef);
        if (!loanSnapshot.exists()) return this.showNotification('대출 정보를 찾을 수 없습니다.', 'error');
        
        const loan = loanSnapshot.val();
        const profit = amountDue - loan.principal;

        const transaction = { type: 'spend', amount: amountDue, reason: `${loan.type} 상환`, timestamp: new Date().toISOString() };
        await this._saveTransaction(transaction);

        await update(loanRef, { status: 'paid', amountDue: amountDue });

        if (profit > 0) {
            const profitRef = ref(database, 'globalStats/bankProfit');
            const updates = {};
            updates[`total`] = increment(profit);
            updates[`byType/${loan.type}`] = increment(profit);
            await update(profitRef, updates);
        }

        this.showNotification('대출 상환이 완료되었습니다.', 'success');
        this._calculateAndApplyInterest();
        this.displayAllUsersLoanStatus();
    }

    displayBankProfit() {
        const profitRef = ref(database, 'globalStats/bankProfit');
        onValue(profitRef, (snapshot) => {
            const data = snapshot.val() || { total: 0, byType: {} };
            document.getElementById('totalBankProfit').textContent = `${data.total || 0}P`;
            
            const tableBody = document.getElementById('bankProfitTableBody');
            tableBody.innerHTML = '';
            
            if (data.byType && Object.keys(data.byType).length > 0) {
                for (const loanType in data.byType) {
                    const row = `
                        <tr>
                            <td>${loanType}</td>
                            <td>+${data.byType[loanType]}P</td>
                        </tr>
                    `;
                    tableBody.innerHTML += row;
                }
            } else {
                tableBody.innerHTML = '<tr><td colspan="2">아직 수익이 없습니다.</td></tr>';
            }
        });
    }

    displayBankSpendingHistory() {
        const spendingRef = ref(database, 'globalStats/bankSpendingHistory');
        onValue(spendingRef, (snapshot) => {
            const history = snapshot.val() || {};
            const tableBody = document.getElementById('bankSpendingHistoryBody');
            tableBody.innerHTML = '';
            const sortedHistory = Object.values(history).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

            if (sortedHistory.length > 0) {
                sortedHistory.forEach(record => {
                    const row = `
                        <tr>
                            <td>${record.reason}</td>
                            <td>-${record.amount}P</td>
                            <td>${new Date(record.timestamp).toLocaleDateString('ko-KR')}</td>
                        </tr>
                    `;
                    tableBody.innerHTML += row;
                });
            } else {
                tableBody.innerHTML = '<tr><td colspan="3">사용 내역이 없습니다.</td></tr>';
            }
        });
    }

    openPasswordModal(message = '은행 수익을 사용하려면 비밀번호를 입력하세요.') {
        document.getElementById('passwordModal').querySelector('p').textContent = message;
        document.getElementById('passwordModal').classList.remove('hidden');
    }

    closeModals() {
        document.getElementById('passwordModal').classList.add('hidden');
        document.getElementById('spendProfitModal').classList.add('hidden');
        document.getElementById('adjustPointsModal').classList.add('hidden');
        document.getElementById('editLoanLimitModal').classList.add('hidden');
    }

    handlePasswordCheck(e) {
        e.preventDefault();
        const password = document.getElementById('passwordInput').value;
        if (password === 'cjw03688055') {
            this.closeModals();
            if (typeof this.afterPasswordCallback === 'function') {
                this.afterPasswordCallback();
                this.afterPasswordCallback = null; // Reset callback after use
            }
        } else {
            this.showNotification('비밀번호가 올바르지 않습니다.', 'error');
        }
        document.getElementById('passwordInput').value = '';
    }

    async handleSpendProfit(e) {
        e.preventDefault();
        const reason = document.getElementById('spendProfitReason').value;
        const amount = parseInt(document.getElementById('spendProfitAmount').value);

        if (!reason || !amount || amount <= 0) {
            return this.showNotification('사용 목적과 금액을 올바르게 입력하세요.', 'warning');
        }

        const profitRef = ref(database, 'globalStats/bankProfit/total');
        const snapshot = await get(profitRef);
        const totalProfit = snapshot.val() || 0;

        if (amount > totalProfit) {
            return this.showNotification('사용할 수 있는 수익이 부족합니다.', 'error');
        }

        const spendingRecord = {
            reason,
            amount,
            timestamp: new Date().toISOString()
        };

        const newSpendingRef = push(ref(database, 'globalStats/bankSpendingHistory'));
        await set(newSpendingRef, spendingRecord);

        await update(ref(database, 'globalStats/bankProfit'), { total: increment(-amount) });

        this.showNotification('수익 사용이 완료되었습니다.', 'success');
        this.closeModals();
        document.getElementById('spendProfitReason').value = '';
        document.getElementById('spendProfitAmount').value = '';
    }

    displayUsersPoints() {
        const usersRef = ref(database, 'users');
        onValue(usersRef, (snapshot) => {
            const usersData = snapshot.val() || {};
            const tableBody = document.getElementById('usersPointsTableBody');
            const tableHead = document.querySelector('#usersPointsTable thead tr');
            tableBody.innerHTML = '';
            tableHead.innerHTML = '<th>사용자</th><th>포인트</th><th>수정</th>';

            const sortedUsers = Object.keys(usersData).map(uid => ({
                uid,
                ...usersData[uid]
            })).sort((a, b) => (b.points || 0) - (a.points || 0));

            if (sortedUsers.length > 0) {
                sortedUsers.forEach(user => {
                    const row = `
                        <tr>
                            <td>${user.username || '알 수 없음'}</td>
                            <td>${user.points || 0}P</td>
                            <td>
                                <button class="adjust-btn" data-uid="${user.uid}" data-username="${user.username}" data-points="${user.points || 0}">수정</button>
                            </td>
                        </tr>
                    `;
                    tableBody.innerHTML += row;
                });
            } else {
                tableBody.innerHTML = '<tr><td colspan="3">사용자가 없습니다.</td></tr>';
            }
        });
    }

    handleAdjustPointsClick(e) {
        const target = e.target;
        this.userToAdjust = {
            uid: target.dataset.uid,
            username: target.dataset.username,
            points: parseInt(target.dataset.points)
        };
        this.afterPasswordCallback = () => this.openAdjustPointsModal();
        this.openPasswordModal();
    }

    openAdjustPointsModal() {
        if (!this.userToAdjust) return;
        document.getElementById('adjustUsername').textContent = this.userToAdjust.username;
        document.getElementById('newPointsInput').value = this.userToAdjust.points;
        document.getElementById('adjustPointsModal').classList.remove('hidden');
    }

    async saveAdjustedPoints(e) {
        e.preventDefault();
        if (!this.userToAdjust) return;

        const newPoints = parseInt(document.getElementById('newPointsInput').value);
        if (isNaN(newPoints) || newPoints < 0) {
            return this.showNotification('유효한 포인트를 입력하세요.', 'warning');
        }

        const oldPoints = this.userToAdjust.points;
        const difference = newPoints - oldPoints;

        if (difference === 0) {
            return this.closeModals();
        }

        const transactionType = difference > 0 ? 'earn' : 'spend';
        const transactionAmount = Math.abs(difference);
        const reason = `관리자 조정 (${this.currentUser.displayName})`;

        const transaction = { type: transactionType, amount: transactionAmount, reason, timestamp: new Date().toISOString() };
        
        // Use a special parameter to save transaction for another user
        await this._saveTransaction(transaction, null, this.userToAdjust.uid, true);

        // Directly set the points for the user
        const userPointsRef = ref(database, `users/${this.userToAdjust.uid}/points`);
        await set(userPointsRef, newPoints);

        this.showNotification(`${this.userToAdjust.username}님의 포인트를 ${newPoints}P로 변경했습니다.`, 'success');
        this.closeModals();
        this.userToAdjust = null;
    }

    displayJackpot() {
        const jackpotRef = ref(database, 'globalStats/jackpot');
        onValue(jackpotRef, (snapshot) => {
            const data = snapshot.val() || { amount: 0, winners: {} };
            document.getElementById('jackpotAmount').textContent = `${data.amount || 0}P`;
            
            const winnersList = document.getElementById('jackpotWinnersList');
            winnersList.innerHTML = '';
            if (data.winners) {
                const sortedWinners = Object.values(data.winners).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                sortedWinners.forEach(winner => {
                    const winnerItem = `
                        <div class="winner-item">
                            <span class="username">${winner.username}</span>
                            <span class="amount">+${winner.amount}P</span>
                        </div>
                    `;
                    winnersList.innerHTML += winnerItem;
                });
            }
        });
    }

    async tryJackpot() {
        if (!this.currentUser) return this.showNotification('로그인이 필요합니다.', 'warning');
        
        const tryBtn = document.getElementById('tryJackpotBtn');
        if (tryBtn.disabled) return;

        const cost = 101;
        const userPoints = this.getCurrentBalance();

        if (userPoints < cost) {
            return this.showNotification(`잭팟에 도전하려면 ${cost}P가 필요합니다.`, 'error');
        }

        try {
            tryBtn.disabled = true;
            tryBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 행운을 비는 중...';

            // 1. Deduct points and update jackpot pool
            const transaction = { type: 'spend', amount: cost, reason: '잭팟 도전', timestamp: new Date().toISOString() };
            await this._saveTransaction(transaction);

            const bankProfitRef = ref(database, 'globalStats/bankProfit');
            await update(bankProfitRef, { total: increment(1), 'byType/잭팟': increment(1) });

            await update(ref(database, 'globalStats/jackpot'), { amount: increment(100) });

            // 2. Run animation
            const result = await this.runJackpotAnimation();

            // 3. Check for win
            const isWinner = result.length === 3 && result[0] === result[1] && result[1] === result[2];

            if (isWinner) {
                const jackpotSnapshot = await get(ref(database, 'globalStats/jackpot/amount'));
                const jackpotAmount = jackpotSnapshot.val();

                const winTransaction = { type: 'earn', amount: jackpotAmount, reason: '잭팟 당첨!', timestamp: new Date().toISOString() };
                await this._saveTransaction(winTransaction);

                const winnerInfo = {
                    username: this.currentUser.displayName || '알 수 없음',
                    amount: jackpotAmount,
                    timestamp: new Date().toISOString()
                };
                const newWinnerRef = push(ref(database, 'globalStats/jackpot/winners'));
                await set(newWinnerRef, winnerInfo);

                await set(ref(database, 'globalStats/jackpot/amount'), 0); // Reset jackpot

                this.showNotification(`축하합니다! ${jackpotAmount}P 잭팟에 당첨되셨습니다!`, 'success');
            } else {
                this.showNotification('아쉽지만 다음 기회에!', 'info');
            }

            tryBtn.disabled = false;
            tryBtn.innerHTML = '<i class="fas fa-dice-d6"></i> 잭팟 도전!';

            this.displayGamblerRanking();
        } catch (error) {
            console.error("Jackpot error:", error);
            this.showNotification('잭팟 진행 중 오류가 발생했습니다.', 'error');
            tryBtn.disabled = false;
            tryBtn.innerHTML = '<i class="fas fa-dice-d6"></i> 잭팟 도전!';
        }
    }

    runJackpotAnimation() {
        return new Promise(resolve => {
            const scrollers = [document.getElementById('scroller1'), document.getElementById('scroller2'), document.getElementById('scroller3')];
            const numbers = [1, 3, 5, 7, 9];
            let finalResult = [];

            scrollers.forEach((scroller, i) => {
                scroller.innerHTML = ''; // Clear previous numbers
                const numberList = document.createElement('ul');
                numberList.className = 'number-list';
                for (let j = 0; j < 10; j++) { // Add numbers for spinning effect
                    const item = document.createElement('li');
                    item.textContent = numbers[Math.floor(Math.random() * numbers.length)];
                    item.style.height = '80px';
                    item.style.lineHeight = '80px';
                    item.style.fontSize = '40px';
                    numberList.appendChild(item);
                }
                scroller.appendChild(numberList);
                scroller.classList.add('spinning');
            });

            setTimeout(() => {
                scrollers.forEach((scroller, i) => {
                    scroller.classList.remove('spinning');
                    const resultNum = numbers[Math.floor(Math.random() * numbers.length)];
                    finalResult.push(resultNum);
                    scroller.innerHTML = `<div style="font-size: 40px; line-height: 80px;">${resultNum}</div>`;
                });
                resolve(finalResult);
            }, 2000 + Math.random() * 1000); // Spin for 2-3 seconds
        });
    }

    selectMultiplier(e, type = 'standard') {
        const multiplier = parseInt(e.target.dataset.multiplier);
        if (type === 'standard') {
            this.gamblingMultiplier = multiplier;
            document.querySelectorAll('.gambling-section:not(#basic-gambling-section) .multiplier-btn').forEach(btn => btn.classList.remove('active'));
        } else {
            this.basicGamblingMultiplier = multiplier;
            document.querySelectorAll('#basic-gambling-section .multiplier-btn').forEach(btn => btn.classList.remove('active'));
        }
        e.target.classList.add('active');
    }

    adjustBet(amount, type = 'standard') {
        if (type === 'standard') {
            this.gamblingBetAmount += amount;
            if (this.gamblingBetAmount < 100) {
                this.gamblingBetAmount = 100;
            }
            document.getElementById('betAmountDisplay').textContent = this.gamblingBetAmount;
        } else {
            this.basicGamblingBetAmount += amount;
            if (this.basicGamblingBetAmount < 100) {
                this.basicGamblingBetAmount = 100;
            }
            document.getElementById('basic-betAmountDisplay').textContent = this.basicGamblingBetAmount;
        }
    }

    async placeBet(type = 'standard') {
        if (!this.currentUser) return this.showNotification('로그인이 필요합니다.', 'warning');

        const betAmount = type === 'standard' ? this.gamblingBetAmount : this.basicGamblingBetAmount;
        const multiplier = type === 'standard' ? this.gamblingMultiplier : this.basicGamblingMultiplier;
        const probabilities = type === 'standard' ? this.probabilities : this.basicProbabilities;
        const placeBetBtn = type === 'standard' ? document.getElementById('placeBetBtn') : document.getElementById('basic-placeBetBtn');
        const reasonText = type === 'standard' ? '확률 도박' : '기본 확률 도박';

        const fee = Math.floor(betAmount / 100);
        const totalCost = betAmount + fee;

        if (this.getCurrentBalance() < totalCost) {
            return this.showNotification('포인트가 부족합니다.', 'error');
        }

        placeBetBtn.disabled = true;
        placeBetBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 베팅 중...';

        try {
            // 1. Deduct points
            const transaction = { type: 'spend', amount: totalCost, reason: `${reasonText} (${multiplier}배)`, timestamp: new Date().toISOString() };
            await this._saveTransaction(transaction);

            // 2. Add fee to bank profit
            const bankProfitRef = ref(database, 'globalStats/bankProfit');
            await update(bankProfitRef, { total: increment(fee), 'byType/확률도박': increment(fee) });

            // 3. Roll the dice
            const probability = probabilities[multiplier];
            const isWinner = Math.random() < probability;

            if (isWinner) {
                const winnings = betAmount * multiplier;
                const winTransaction = { type: 'earn', amount: winnings, reason: `${reasonText} (${multiplier}배) 성공!`, timestamp: new Date().toISOString() };
                await this._saveTransaction(winTransaction);
                this.showNotification(`축하합니다! ${winnings}P 획득!`, 'success');
            } else {
                this.showNotification('아쉽지만, 베팅에 실패했습니다.', 'info');
            }
        } catch (error) {
            console.error("Gambling error:", error);
            this.showNotification('베팅 중 오류가 발생했습니다.', 'error');
        }

        placeBetBtn.disabled = false;
        placeBetBtn.innerHTML = '<i class="fas fa-dice"></i> 베팅하기!';

        this.displayGamblerRanking();
    }

    async earnSelfStudyPoints() {
        if (!this.currentUser) return this.showNotification('로그인이 필요합니다.', 'warning');

        const selectedDays = document.querySelectorAll('.day-btn.active');
        if (selectedDays.length === 0) {
            return this.showNotification('적립할 요일을 선택해주세요.', 'warning');
        }

        const pointsToEarn = selectedDays.length * 100;
        const reason = `야간 자율 학습 (${Array.from(selectedDays).map(btn => btn.dataset.day).join(', ')})`;

        const transaction = { type: 'earn', amount: pointsToEarn, reason, timestamp: new Date().toISOString() };
        await this._saveTransaction(transaction);

        selectedDays.forEach(btn => btn.classList.remove('active'));
    }

    _getWeeksBetween(startDate, endDate) {
        const msInWeek = 7 * 24 * 60 * 60 * 1000;
        return Math.floor((new Date(endDate) - new Date(startDate)) / msInWeek);
    }

    async _calculateAndApplyInterest() {
        if (!this.currentUser) return;
        const loansRef = ref(database, `users/${this.currentUser.uid}/loans`);
        const loansSnapshot = await get(loansRef);
        if (!loansSnapshot.exists()) {
            document.getElementById('totalDebtAmount').textContent = '0P';
            this._renderLoanTable({});
            return;
        }
        const loans = loansSnapshot.val();
        let totalDebt = 0;
        const today = new Date();
        for (const loanId in loans) {
            const loan = loans[loanId];
            if (loan.status === 'active' && loan.interestRate > 0) {
                const weeksPassed = this._getWeeksBetween(loan.lastInterestAppliedDate, today);
                if (weeksPassed > 0) {
                    loan.amountDue = Math.floor(loan.amountDue * Math.pow(1 + loan.interestRate, weeksPassed));
                    loan.lastInterestAppliedDate = today.toISOString();
                    const loanToUpdateRef = ref(database, `users/${this.currentUser.uid}/loans/${loanId}`);
                    await set(loanToUpdateRef, loan);
                }
            }
            if (loan.status === 'active') {
                totalDebt += loan.amountDue;
            }
        }
        document.getElementById('totalDebtAmount').textContent = `${totalDebt}P`;
        this._renderLoanTable(loans);
    }

    _renderLoanTable(loans) {
        const loanStatusBody = document.getElementById('loanStatusBody');
        loanStatusBody.innerHTML = '';
        let hasActiveLoans = false;
        for (const loanId in loans) {
            const loan = loans[loanId];
            if (loan.status === 'active') {
                hasActiveLoans = true;
                let interestHtml = '-';
                if (loan.type === '테스트용 대출') {
                    interestHtml = `+${loan.interest}P (일시불)`;
                } else if (loan.interestRate > 0) {
                    const weeklyInterest = Math.floor(loan.amountDue * loan.interestRate);
                    const lastDate = new Date(loan.lastInterestAppliedDate);
                    lastDate.setDate(lastDate.getDate() + 7);
                    const nextInterestDateStr = lastDate.toISOString().split('T')[0];
                    interestHtml = `+${weeklyInterest}P (${nextInterestDateStr})`;
                }

                const row = `
                    <tr>
                        <td>${loan.type}</td>
                        <td>${loan.principal}P</td>
                        <td>${loan.amountDue}P</td>
                        <td>${interestHtml}</td>
                        <td>
                            <button class="repay-btn" data-loan-id="${loanId}" data-amount-due="${loan.amountDue}">전액 상환</button>
                        </td>
                    </tr>
                `;
                loanStatusBody.innerHTML += row;
            }
        }
        if (!hasActiveLoans) {
            loanStatusBody.innerHTML = '<tr><td colspan="5">활성화된 대출이 없습니다.</td></tr>';
        }
    }

    filterTransactions(e) {
        this.currentFilter = e.currentTarget.dataset.filter;
        document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
        e.currentTarget.classList.add('active');
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
        const filtered = this.transactions.filter(t => this.currentFilter === 'all' || t.type === this.currentFilter);
        if (filtered.length === 0) {
            transactionsList.innerHTML = '';
            emptyState.style.display = 'block';
        } else {
            emptyState.style.display = 'none';
            transactionsList.innerHTML = filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).map(t => this.createTransactionHTML(t)).join('');
        }
        const totalEarned = this.transactions.filter(t => t.type === 'earn').reduce((sum, t) => sum + t.amount, 0);
        const totalSpent = this.transactions.filter(t => t.type === 'spend').reduce((sum, t) => sum + t.amount, 0);
        this.updateStats(totalEarned, totalSpent, this.transactions.length);
    }

    createTransactionHTML(transaction) {
        const isEarn = transaction.type === 'earn';
        const icon = isEarn ? 'fa-plus-circle' : 'fa-minus-circle';
        const colorClass = isEarn ? 'earn' : 'spend';
        const sign = isEarn ? '+' : '-';
        return `
            <div class="transaction-item ${colorClass}">
                <div class="transaction-icon"><i class="fas ${icon}"></i></div>
                <div class="transaction-details">
                    <div class="transaction-reason">${transaction.reason}</div>
                    <div class="transaction-date">${new Date(transaction.timestamp).toLocaleDateString('ko-KR')}</div>
                </div>
                <div class="transaction-amount">
                    <span class="amount-sign">${sign}</span>
                    <span class="amount-value">${transaction.amount}</span>
                    <span class="amount-unit">P</span>
                </div>
            </div>
        `;
    }

    updateUI() {
        this.updateTransactionsList();
        this.updateActivityLog();
        this.loadNewGlobalActivityLog();
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        document.body.appendChild(notification);
        setTimeout(() => notification.style.transform = 'translateX(0)', 100);
        setTimeout(() => {
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    updateActivityLog() {
        this.loadGlobalActivityLog();
        this.updateOnlineUsers();
        this.updateLastUpdate();
    }

    loadGlobalActivityLog() {
        try {
            const globalActivityRef = ref(database, 'globalActivity');
            onValue(globalActivityRef, (snapshot) => {
                const activities = snapshot.val() || {};
                this.renderActivityLog(Object.values(activities));
            });
        } catch (error) {
            console.error('전역 활동 로그 로드 오류:', error);
        }
    }

    renderActivityLog(activities) {
        const activityFeed = document.getElementById('activityFeed');
        const emptyActivity = document.getElementById('emptyActivity');
        if (activities.length === 0) {
            activityFeed.innerHTML = '';
            emptyActivity.style.display = 'block';
            return;
        }
        emptyActivity.style.display = 'none';
        const sortedActivities = activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 50);
        activityFeed.innerHTML = sortedActivities.map(activity => this.createActivityHTML(activity)).join('');
        activityFeed.scrollTop = activityFeed.scrollHeight;
    }

    createActivityHTML(activity) {
        const isEarn = activity.type === 'earn';
        const icon = isEarn ? 'fa-plus' : 'fa-minus';
        const avatarClass = isEarn ? 'earn' : 'spend';
        const timeAgo = this.getTimeAgo(activity.timestamp);

        return `
            <div class="activity-item">
                <div class="activity-avatar ${avatarClass}">
                    <i class="fas ${icon}"></i>
                </div>
                <div class="activity-content">
                    <div class="activity-header">
                        <span class="activity-username">${activity.username || '알 수 없음'}</span>
                        <span class="activity-time">${timeAgo}</span>
                    </div>
                    <div class="activity-message">
                        ${activity.reason}
                    </div>
                    <div class="activity-footer">
                        <span class="activity-amount ${avatarClass}">${isEarn ? '+' : '-'}${activity.amount}P</span>
                    </div>
                </div>
            </div>
        `;
    }

    getTimeAgo(timestamp) {
        const now = new Date();
        const activityTime = new Date(timestamp);
        const diffInSeconds = Math.floor((now - activityTime) / 1000);
        if (diffInSeconds < 60) return '방금 전';
        if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}분 전`;
        if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}시간 전`;
        return `${Math.floor(diffInSeconds / 86400)}일 전`;
    }

    updateOnlineUsers() {
        try {
            const onlineUsersRef = ref(database, 'onlineUsers');
            onValue(onlineUsersRef, (snapshot) => {
                const count = snapshot.exists() ? Object.keys(snapshot.val()).length : 0;
                document.getElementById('onlineUsers').textContent = `온라인: ${count}명`;
            });
        } catch (error) {
            console.error('온라인 사용자 수 업데이트 오류:', error);
        }
    }

    updateLastUpdate() {
        const timeString = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
        document.getElementById('lastUpdate').textContent = `마지막 업데이트: ${timeString}`;
        setTimeout(() => this.updateLastUpdate(), 60000);
    }

    async updateOnlineStatus(isOnline) {
        if (!this.currentUser) return;
        try {
            const onlineUserRef = ref(database, `onlineUsers/${this.currentUser.uid}`);
            if (isOnline) {
                await set(onlineUserRef, { username: this.currentUser.displayName || '알 수 없음', lastSeen: serverTimestamp() });
            } else {
                await set(onlineUserRef, null);
            }
        } catch (error) {
            console.error('온라인 상태 업데이트 오류:', error);
        }
    }

    loadNewGlobalActivityLog() {
        try {
            const newGlobalActivityRef = ref(database, 'newGlobalActivity');
            onValue(newGlobalActivityRef, (snapshot) => {
                const activities = snapshot.val() || {};
                this.renderNewActivityLog(Object.values(activities));
            });
        } catch (error) {
            console.error('신규 전역 활동 로그 로드 오류:', error);
        }
    }

    renderNewActivityLog(activities) {
        const newActivityFeed = document.getElementById('newActivityFeed');
        const emptyNewActivity = document.getElementById('emptyNewActivity');
        if (activities.length === 0) {
            newActivityFeed.innerHTML = '';
            emptyNewActivity.style.display = 'block';
            return;
        }
        emptyNewActivity.style.display = 'none';
        const sortedActivities = activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 50);
        newActivityFeed.innerHTML = sortedActivities.map(activity => this.createNewActivityHTML(activity)).join('');
    }

    createNewActivityHTML(activity) {
        const isEarn = activity.type === 'earn';
        const actionClass = isEarn ? 'action-earn' : 'action-spend';
        const sign = isEarn ? '+' : '-';
        const timestamp = new Date(activity.timestamp).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

        return `
            <div class="new-activity-item">
                <span class="timestamp">[${timestamp}]</span>
                <span class="username">${activity.username || '알 수 없음'}</span>
                <span class="${actionClass}">${activity.reason} ${sign}${activity.amount}P</span>
            </div>
        `;
    }

    async handleClearLog() { // Make it async
        const password = prompt('관리자 비밀번호를 입력하세요:');
        if (password === 'cjw03688055') {
            try {
                const newActivityRef = ref(database, 'newGlobalActivity');
                await set(newActivityRef, null); // This will delete the data
                
                // The onValue listener will handle the UI update automatically.
                // But for immediate feedback, we can also clear it here.
                const newActivityFeed = document.getElementById('newActivityFeed');
                const emptyNewActivity = document.getElementById('emptyNewActivity');
                newActivityFeed.innerHTML = '';
                emptyNewActivity.style.display = 'block';

                this.showNotification('신규 실시간 로그가 성공적으로 초기화되었습니다.', 'success');
            } catch (error) {
                console.error('로그 초기화 오류:', error);
                this.showNotification('로그 초기화 중 오류가 발생했습니다.', 'error');
            }
        } else if (password !== null) { // user did not cancel the prompt
            this.showNotification('비밀번호가 올바르지 않습니다.', 'error');
        }
    }

    async handleDonation() {
        if (!this.currentUser) return this.showNotification('로그인이 필요합니다.', 'warning');

        const amount = parseInt(document.getElementById('donationAmount').value);
        if (!amount || amount <= 0 || amount % 100 !== 0) {
            return this.showNotification('기부금은 100P 단위로 입력해주세요.', 'warning');
        }

        if (this.getCurrentBalance() < amount) {
            return this.showNotification('보유 포인트가 부족합니다.', 'error');
        }

        try {
            // 1. Deduct points from user
            const transaction = { type: 'spend', amount, reason: '은행 기부', timestamp: new Date().toISOString() };
            await this._saveTransaction(transaction);

            // 2. Add points to bank profit
            const profitRef = ref(database, 'globalStats/bankProfit');
            await update(profitRef, { total: increment(amount), 'byType/기부': increment(amount) });

            // 3. Record the donation
            const donationRecord = {
                username: this.currentUser.displayName || '알 수 없음',
                amount,
                timestamp: new Date().toISOString()
            };
            const newDonationRef = push(ref(database, 'donations'));
            await set(newDonationRef, donationRecord);

            this.showNotification('기부해주셔서 감사합니다!', 'success');
            document.getElementById('donationAmount').value = '';

        } catch (error) {
            console.error("Donation error:", error);
            this.showNotification('기부 처리 중 오류가 발생했습니다.', 'error');
        }
    }

    displayDonations() {
        const donationsRef = ref(database, 'donations');
        onValue(donationsRef, (snapshot) => {
            const donations = snapshot.val() || {};
            const tableBody = document.getElementById('donatorsTableBody');
            tableBody.innerHTML = '';
            const sortedDonations = Object.values(donations).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

            if (sortedDonations.length > 0) {
                sortedDonations.forEach(donation => {
                    const row = `
                        <tr>
                            <td>${donation.username}</td>
                            <td>${donation.amount}P</td>
                            <td>${new Date(donation.timestamp).toLocaleDateString('ko-KR')}</td>
                        </tr>
                    `;
                    tableBody.innerHTML += row;
                });
            } else {
                tableBody.innerHTML = '<tr><td colspan="3">아직 기부자가 없습니다.</td></tr>';
            }
        });
    }

    displayLoanLimits() {
        const usersRef = ref(database, 'users');
        onValue(usersRef, (snapshot) => {
            const usersData = snapshot.val() || {};
            const tableBody = document.getElementById('loanLimitTableBody');
            tableBody.innerHTML = '';

            const sortedUsers = Object.keys(usersData).map(uid => ({
                uid,
                ...usersData[uid]
            })).sort((a, b) => (a.username || '').localeCompare(b.username || ''));

            if (sortedUsers.length > 0) {
                sortedUsers.forEach(user => {
                    const loanLimit = user.loanLimit === undefined ? 1000 : user.loanLimit;
                    const row = `
                        <tr>
                            <td>${user.username || '알 수 없음'}</td>
                            <td>${loanLimit}P</td>
                            <td>
                                <button class="edit-loan-limit-btn" data-uid="${user.uid}" data-username="${user.username}" data-limit="${loanLimit}">수정</button>
                            </td>
                        </tr>
                    `;
                    tableBody.innerHTML += row;
                });
            } else {
                tableBody.innerHTML = '<tr><td colspan="3">사용자가 없습니다.</td></tr>';
            }
        });
    }

    handleEditLoanLimitClick(e) {
        if (e.target && e.target.classList.contains('edit-loan-limit-btn')) {
            const target = e.target;
            const userData = {
                uid: target.dataset.uid,
                username: target.dataset.username,
                limit: parseInt(target.dataset.limit)
            };
            this.afterPasswordCallback = () => this.openEditLoanLimitModal(userData);
            this.openPasswordModal('대출 한도를 수정하려면 비밀번호를 입력하세요.');
        }
    }

    openEditLoanLimitModal(userData) {
        document.getElementById('loanLimitUsername').textContent = userData.username;
        document.getElementById('newLoanLimitInput').value = userData.limit;
        document.getElementById('loanLimitUserId').value = userData.uid;
        document.getElementById('editLoanLimitModal').classList.remove('hidden');
    }

    async saveLoanLimit(e) {
        e.preventDefault();
        const userId = document.getElementById('loanLimitUserId').value;
        const newLimit = parseInt(document.getElementById('newLoanLimitInput').value);

        if (!userId || isNaN(newLimit) || newLimit < 0) {
            return this.showNotification('유효한 한도를 입력하세요.', 'warning');
        }

        const userLoanLimitRef = ref(database, `users/${userId}/loanLimit`);
        await set(userLoanLimitRef, newLimit);

        this.showNotification('대출 한도가 성공적으로 수정되었습니다.', 'success');
        this.closeModals();
    }

    initializeSectionStates() {
        this.toggleSection('jackpot-section', this.isJackpotOpen, false);
        this.toggleSection('gambling-section', this.isGamblingOpen, false);
        this.toggleSection('basic-gambling-section', this.isBasicGamblingOpen, false);

        document.querySelectorAll('.closed-message').forEach(el => el.style.display = 'none');
    }

    handleToggleSection(e) {
        const sectionId = e.currentTarget.dataset.section;
        this.afterPasswordCallback = () => {
            if (sectionId === 'jackpot-section') {
                this.isJackpotOpen = !this.isJackpotOpen;
                this.toggleSection(sectionId, this.isJackpotOpen);
            } else if (sectionId === 'gambling-section') {
                this.isGamblingOpen = !this.isGamblingOpen;
                this.toggleSection(sectionId, this.isGamblingOpen);
            } else if (sectionId === 'basic-gambling-section') {
                this.isBasicGamblingOpen = !this.isBasicGamblingOpen;
                this.toggleSection(sectionId, this.isBasicGamblingOpen);
            }
        };
        this.openPasswordModal('섹션을 열거나 닫으려면 비밀번호를 입력하세요.');
    }

    toggleSection(sectionId, isOpen, animate = true) {
        const sectionElement = document.querySelector(`.${sectionId}`);
        const buttonIcon = sectionElement.querySelector('.toggle-section-btn i');
        const closedMessage = sectionElement.querySelector('.closed-message');

        if (isOpen) {
            sectionElement.classList.remove('closed');
            if (closedMessage) closedMessage.style.display = 'none';
            buttonIcon.classList.remove('fa-eye');
            buttonIcon.classList.add('fa-eye-slash');
        } else {
            sectionElement.classList.add('closed');
            if (closedMessage) closedMessage.style.display = 'block';
            buttonIcon.classList.remove('fa-eye-slash');
            buttonIcon.classList.add('fa-eye');
        }
    }

    loadMemoContent() {
        const memoRef = ref(database, 'memo/content');
        onValue(memoRef, (snapshot) => {
            const memoContent = snapshot.val() || '<p>여기에 공지사항을 입력하세요.</p>';
            document.getElementById('memo-content').innerHTML = memoContent;
        });
    }

    handleMemoClick() {
        if (this.isMemoEditMode) {
            this.saveMemoContent();
        } else {
            this.afterPasswordCallback = () => this.enableMemoEditMode();
            this.openPasswordModal('메모를 수정하려면 비밀번호를 입력하세요.');
        }
    }

    enableMemoEditMode() {
        this.isMemoEditMode = true;
        const memoContent = document.getElementById('memo-content');
        memoContent.contentEditable = true;
        memoContent.focus();
        const editBtn = document.getElementById('editMemoBtn');
        editBtn.innerHTML = '<i class="fas fa-save"></i>';
        editBtn.title = '메모 저장';
    }

    async saveMemoContent() {
        const memoContent = document.getElementById('memo-content').innerHTML;
        const memoRef = ref(database, 'memo/content');
        await set(memoRef, memoContent);

        this.isMemoEditMode = false;
        document.getElementById('memo-content').contentEditable = false;
        const editBtn = document.getElementById('editMemoBtn');
        editBtn.innerHTML = '<i class="fas fa-edit"></i>';
        editBtn.title = '메모 수정';

        this.showNotification('메모가 저장되었습니다.', 'success');
    }

    handleResetGamblerRanking() {
        this.afterPasswordCallback = () => this.resetGamblerRanking();
        this.openPasswordModal('도박자 랭킹을 초기화하려면 비밀번호를 입력하세요.');
    }

    async resetGamblerRanking() {
        const usersRef = ref(database, 'users');
        const usersSnapshot = await get(usersRef);
        const usersData = usersSnapshot.val() || {};

        for (const uid in usersData) {
            const userTransactionsRef = ref(database, `users/${uid}/transactions`);
            const userTransactionsSnapshot = await get(userTransactionsRef);
            const userTransactions = userTransactionsSnapshot.val() || {};

            const updates = {};
            for (const txId in userTransactions) {
                const tx = userTransactions[txId];
                if (tx.type === 'spend' && (tx.reason.includes('잭팟') || tx.reason.includes('도박'))) {
                    updates[txId] = null; // Set to null to remove the transaction
                }
            }
            if (Object.keys(updates).length > 0) {
                await update(userTransactionsRef, updates);
            }
        }
        this.showNotification('도박자 랭킹이 초기화되었습니다.', 'success');
        this.displayGamblerRanking(); // Refresh the ranking display
    }

    async displayGamblerRanking() {
        const usersRef = ref(database, 'users');
        const usersSnapshot = await get(usersRef);
        const usersData = usersSnapshot.val() || {};

        const ranking = [];

        for (const uid in usersData) {
            const user = usersData[uid];
            const transactions = user.transactions || {};
            let totalSpent = 0;
            let betCount = 0;

            for (const txId in transactions) {
                const tx = transactions[txId];
                if (tx.type === 'spend' && (tx.reason.includes('잭팟') || tx.reason.includes('도박'))) {
                    totalSpent += tx.amount;
                    betCount++;
                }
            }

            if (betCount > 0) {
                ranking.push({
                    username: user.username,
                    totalSpent,
                    betCount
                });
            }
        }

        ranking.sort((a, b) => b.totalSpent - a.totalSpent);

        const tableBody = document.getElementById('gamblerRankingTableBody');
        tableBody.innerHTML = '';

        if (ranking.length > 0) {
            ranking.forEach((player, index) => {
                const row = `
                    <tr>
                        <td>${index + 1}</td>
                        <td>${player.username}</td>
                        <td>${player.totalSpent}P</td>
                        <td>${player.betCount}회</td>
                    </tr>
                `;
                tableBody.innerHTML += row;
            });
        } else {
            tableBody.innerHTML = '<tr><td colspan="4">아직 도박을 한 사용자가 없습니다.</td></tr>';
        }
    }

    async displayAllUsersLoanStatus() {
        const usersRef = ref(database, 'users');
        const usersSnapshot = await get(usersRef);
        const usersData = usersSnapshot.val() || {};

        const tableBody = document.getElementById('allUsersLoanStatusTableBody');
        tableBody.innerHTML = '';

        let hasActiveLoans = false;

        for (const uid in usersData) {
            const user = usersData[uid];
            const loans = user.loans || {};

            for (const loanId in loans) {
                const loan = loans[loanId];
                if (loan.status === 'active') {
                    hasActiveLoans = true;
                    let interestHtml = '-';
                    if (loan.type === '테스트용 대출') {
                        interestHtml = `+${loan.interest}P (일시불)`;
                    } else if (loan.interestRate > 0) {
                        const weeklyInterest = Math.floor(loan.amountDue * loan.interestRate);
                        const lastDate = new Date(loan.lastInterestAppliedDate);
                        lastDate.setDate(lastDate.getDate() + 7);
                        const nextInterestDateStr = lastDate.toISOString().split('T')[0];
                        interestHtml = `+${weeklyInterest}P (${nextInterestDateStr})`;
                    }

                    const row = `
                        <tr>
                            <td>${user.username || '알 수 없음'}</td>
                            <td>${loan.type}</td>
                            <td>${loan.principal}P</td>
                            <td>${loan.amountDue}P</td>
                            <td>${interestHtml}</td>
                        </tr>
                    `;
                    tableBody.innerHTML += row;
                }
            }
        }

        if (!hasActiveLoans) {
            tableBody.innerHTML = '<tr><td colspan="5">활성화된 대출이 없습니다.</td></tr>';
        }
    }
}

// 앱 초기화
document.addEventListener('DOMContentLoaded', () => {
    new PointManager();
});

// 전역 에러 핸들링
window.addEventListener('error', (event) => {
    console.error('전역 에러:', event.message, event.filename, event.lineno, event.colno, event.error);
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('처리되지 않은 Promise 거부:', event.reason);
});
