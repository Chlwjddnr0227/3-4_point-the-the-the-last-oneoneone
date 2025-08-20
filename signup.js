import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, updateProfile } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { getDatabase, ref, set } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-database.js";

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

class SignupManager {
    constructor() {
        this.init();
    }

    init() {
        this.bindEvents();
        this.setupPasswordValidation();
    }

    bindEvents() {
        // 비밀번호 표시/숨김 토글
        document.getElementById('togglePassword').addEventListener('click', () => this.togglePasswordVisibility('password'));
        document.getElementById('toggleConfirmPassword').addEventListener('click', () => this.togglePasswordVisibility('confirmPassword'));
        
        // 회원가입 폼 제출
        document.getElementById('signupForm').addEventListener('submit', (e) => this.handleSignup(e));
        
        // 소셜 회원가입 버튼들
        document.querySelector('.google-btn').addEventListener('click', () => this.handleSocialSignup('google'));
        document.querySelector('.facebook-btn').addEventListener('click', () => this.handleSocialSignup('facebook'));
        
        // 이용약관 링크들
        document.querySelectorAll('.terms-link').forEach(link => {
            link.addEventListener('click', (e) => this.handleTermsClick(e));
        });
        
        // 실시간 입력 검증
        this.setupRealTimeValidation();
    }

    togglePasswordVisibility(fieldId) {
        const passwordInput = document.getElementById(fieldId);
        const toggleBtn = document.getElementById(`toggle${fieldId.charAt(0).toUpperCase() + fieldId.slice(1)}`);
        const icon = toggleBtn.querySelector('i');
        
        if (passwordInput.type === 'password') {
            passwordInput.type = 'text';
            icon.className = 'fas fa-eye-slash';
            toggleBtn.title = '비밀번호 숨기기';
        } else {
            passwordInput.type = 'password';
            icon.className = 'fas fa-eye';
            toggleBtn.title = '비밀번호 보기';
        }
    }

    setupPasswordValidation() {
        const passwordInput = document.getElementById('password');
        const confirmPasswordInput = document.getElementById('confirmPassword');
        
        passwordInput.addEventListener('input', () => {
            this.validatePassword(passwordInput.value);
            this.checkPasswordMatch();
        });
        
        confirmPasswordInput.addEventListener('input', () => {
            this.checkPasswordMatch();
        });
    }

    validatePassword(password) {
        const hasLength = password.length >= 8;
        const hasLetter = /[a-zA-Z]/.test(password);
        const hasNumber = /\d/.test(password);
        const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);
        
        let strength = 0;
        if (hasLength) strength++;
        if (hasLetter) strength++;
        if (hasNumber) strength++;
        if (hasSpecial) strength++;
        
        // 비밀번호 강도 표시 업데이트
        this.updatePasswordStrength(strength);
        
        return strength >= 3;
    }

    updatePasswordStrength(strength) {
        // 기존 강도 표시 제거
        const existingStrength = document.querySelector('.password-strength');
        if (existingStrength) {
            existingStrength.remove();
        }
        
        if (strength === 0) return;
        
        const passwordInput = document.getElementById('password');
        const strengthDiv = document.createElement('div');
        strengthDiv.className = 'password-strength';
        
        const strengthBar = document.createElement('div');
        strengthBar.className = 'password-strength-bar';
        
        if (strength <= 2) {
            strengthBar.classList.add('weak');
        } else if (strength === 3) {
            strengthBar.classList.add('medium');
        } else {
            strengthBar.classList.add('strong');
        }
        
        strengthDiv.appendChild(strengthBar);
        passwordInput.parentNode.appendChild(strengthDiv);
    }

    checkPasswordMatch() {
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        const confirmInput = document.getElementById('confirmPassword');
        
        if (confirmPassword && password !== confirmPassword) {
            confirmInput.setCustomValidity('비밀번호가 일치하지 않습니다');
        } else {
            confirmInput.setCustomValidity('');
        }
    }

    setupRealTimeValidation() {
        const inputs = document.querySelectorAll('input[required]');
        inputs.forEach(input => {
            input.addEventListener('blur', () => {
                this.validateField(input);
            });
        });
    }

    validateField(input) {
        const value = input.value.trim();
        
        if (input.type === 'email') {
            if (!this.isValidEmail(value)) {
                input.setCustomValidity('올바른 이메일 형식을 입력해주세요');
            } else {
                input.setCustomValidity('');
            }
        } else if (input.type === 'tel' && value) {
            if (!this.isValidPhone(value)) {
                input.setCustomValidity('올바른 전화번호 형식을 입력해주세요');
            } else {
                input.setCustomValidity('');
            }
        }
    }

    async handleSignup(e) {
        e.preventDefault();
        
        const username = document.getElementById('username').value.trim();
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        const phone = document.getElementById('phone').value.trim();
        const agreeTerms = document.getElementById('agreeTerms').checked;
        const agreeMarketing = document.getElementById('agreeMarketing').checked;
        
        // 입력 검증
        if (!username || !email || !password || !confirmPassword) {
            this.showNotification('필수 항목을 모두 입력해주세요.', 'warning');
            return;
        }
        
        if (!agreeTerms) {
            this.showNotification('이용약관에 동의해주세요.', 'warning');
            return;
        }
        
        if (!this.isValidEmail(email)) {
            this.showNotification('올바른 이메일 형식을 입력해주세요.', 'warning');
            return;
        }
        
        if (password !== confirmPassword) {
            this.showNotification('비밀번호가 일치하지 않습니다.', 'warning');
            return;
        }
        
        if (!this.validatePassword(password)) {
            this.showNotification('비밀번호는 8자 이상이며, 영문/숫자/특수문자를 포함해야 합니다.', 'warning');
            return;
        }
        
        if (phone && !this.isValidPhone(phone)) {
            this.showNotification('올바른 전화번호 형식을 입력해주세요.', 'warning');
            return;
        }
        
        // 회원가입 상태 표시
        const submitBtn = document.querySelector('.signup-submit-btn');
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 회원가입 중...';
        submitBtn.disabled = true;
        
        try {
            // Firebase를 사용한 회원가입
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;
            
            // 사용자 프로필 업데이트 (사용자 이름 설정)
            await updateProfile(user, {
                displayName: username
            });
            
            // 사용자 정보를 Firebase Realtime Database에 저장
            const userData = {
                uid: user.uid,
                username: username,
                email: email,
                phone: phone || '',
                agreeMarketing: agreeMarketing,
                createdAt: new Date().toISOString(),
                points: 0, // 초기 포인트 설정
                totalEarned: 0,
                totalSpent: 0,
                transactionCount: 0
            };
            
            // Firebase Realtime Database에 사용자 정보 저장
            await set(ref(database, 'users/' + user.uid), userData);
            
            // 회원가입 성공 알림
            this.showNotification('회원가입에 성공했습니다!', 'success');
            
            // 로그인 페이지로 리다이렉트
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 1500);
            
        } catch (error) {
            // 에러 처리
            let errorMessage = '회원가입 중 오류가 발생했습니다.';
            
            switch (error.code) {
                case 'auth/email-already-in-use':
                    errorMessage = '이미 사용 중인 이메일입니다.';
                    break;
                case 'auth/invalid-email':
                    errorMessage = '유효하지 않은 이메일 형식입니다.';
                    break;
                case 'auth/operation-not-allowed':
                    errorMessage = '이메일/비밀번호 회원가입이 비활성화되어 있습니다.';
                    break;
                case 'auth/weak-password':
                    errorMessage = '비밀번호가 너무 약합니다. 더 강한 비밀번호를 사용해주세요.';
                    break;
                case 'auth/network-request-failed':
                    errorMessage = '네트워크 오류가 발생했습니다. 인터넷 연결을 확인해주세요.';
                    break;
                default:
                    errorMessage = `회원가입 오류: ${error.message}`;
            }
            
            this.showNotification(errorMessage, 'error');
            
            // 버튼 상태 복원
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
        }
    }

    handleSocialSignup(provider) {
        this.showNotification(`${provider} 회원가입 기능이 준비 중입니다!`, 'info');
        
        // 여기에 실제 소셜 회원가입 로직을 추가할 수 있습니다
        // 예: Firebase Auth, Google OAuth, Facebook SDK 등
    }

    handleTermsClick(e) {
        e.preventDefault();
        this.showNotification('이용약관 및 개인정보처리방침 페이지가 준비 중입니다!', 'info');
        
        // 여기에 이용약관 페이지로 이동하는 로직을 추가할 수 있습니다
    }

    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    isValidPhone(phone) {
        const phoneRegex = /^[0-9-+\s()]+$/;
        return phoneRegex.test(phone) && phone.replace(/[^0-9]/g, '').length >= 10;
    }

    showNotification(message, type = 'info') {
        // 알림 시스템
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        
        // 스타일 추가
        Object.assign(notification.style, {
            position: 'fixed',
            top: '20px',
            right: '20px',
            padding: '15px 20px',
            borderRadius: '8px',
            color: 'white',
            fontWeight: 'bold',
            zIndex: '1000',
            transform: 'translateX(100%)',
            transition: 'transform 0.3s ease',
            maxWidth: '300px',
            wordWrap: 'break-word'
        });

        // 타입별 색상
        const colors = {
            success: '#28a745',
            warning: '#ffc107',
            error: '#dc3545',
            info: '#17a2b8'
        };
        
        notification.style.backgroundColor = colors[type] || colors.info;
        notification.style.color = type === 'warning' ? '#333' : 'white';

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
}

// 앱 초기화
document.addEventListener('DOMContentLoaded', () => {
    new SignupManager();
});
