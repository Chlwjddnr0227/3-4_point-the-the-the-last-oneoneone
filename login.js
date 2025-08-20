import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { getDatabase, ref, get } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-database.js";

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

class LoginManager {
    constructor() {
        this.init();
    }

    init() {
        this.bindEvents();
        this.checkRememberMe();
        this.checkAuthState();
    }

    bindEvents() {
        // 비밀번호 표시/숨김 토글
        document.getElementById('togglePassword').addEventListener('click', () => this.togglePasswordVisibility());
        
        // 로그인 폼 제출
        document.getElementById('loginForm').addEventListener('submit', (e) => this.handleLogin(e));
        
        // 소셜 로그인 버튼들
        document.querySelector('.google-btn').addEventListener('click', () => this.handleSocialLogin('google'));
        document.querySelector('.facebook-btn').addEventListener('click', () => this.handleSocialLogin('facebook'));
        
        // 회원가입 링크
        document.getElementById('signupLink').addEventListener('click', (e) => this.handleSignup(e));
        
        // 비밀번호 찾기
        document.querySelector('.forgot-password').addEventListener('click', (e) => this.handleForgotPassword(e));
    }

    checkAuthState() {
        // 사용자 인증 상태 확인
        onAuthStateChanged(auth, (user) => {
            if (user) {
                // 이미 로그인된 상태라면 메인 페이지로 이동
                console.log('이미 로그인된 사용자:', user.email);
                // 여기서는 자동 리다이렉트하지 않고 사용자가 직접 로그인하도록 함
            }
        });
    }

    togglePasswordVisibility() {
        const passwordInput = document.getElementById('password');
        const toggleBtn = document.getElementById('togglePassword');
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

    async handleLogin(e) {
        e.preventDefault();
        
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        const rememberMe = document.getElementById('rememberMe').checked;
        
        // 입력 검증
        if (!email || !password) {
            this.showNotification('이메일과 비밀번호를 모두 입력해주세요.', 'warning');
            return;
        }
        
        if (!this.isValidEmail(email)) {
            this.showNotification('올바른 이메일 형식을 입력해주세요.', 'warning');
            return;
        }
        
        // 로그인 상태 표시
        const submitBtn = document.querySelector('.login-submit-btn');
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 로그인 중...';
        submitBtn.disabled = true;
        
        try {
            // Firebase를 사용한 로그인
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;
            
            // 사용자 정보를 Firebase Realtime Database에서 가져오기
            const userRef = ref(database, 'users/' + user.uid);
            const userSnapshot = await get(userRef);
            
            if (userSnapshot.exists()) {
                const userData = userSnapshot.val();
                console.log('로그인된 사용자 정보:', userData);
                
                // 로컬 스토리지에 사용자 정보 저장 (선택사항)
                if (rememberMe) {
                    localStorage.setItem('rememberedEmail', email);
                    localStorage.setItem('currentUser', JSON.stringify({
                        uid: user.uid,
                        email: user.email,
                        username: userData.username || user.displayName,
                        points: userData.points || 0
                    }));
                } else {
                    localStorage.removeItem('rememberedEmail');
                    localStorage.setItem('currentUser', JSON.stringify({
                        uid: user.uid,
                        email: user.email,
                        username: userData.username || user.displayName,
                        points: userData.points || 0
                    }));
                }
            }
            
            // 로그인 성공 알림
            this.showNotification('로그인에 성공했습니다!', 'success');
            
            // 메인 페이지로 리다이렉트
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 1500);
            
        } catch (error) {
            // 에러 처리
            let errorMessage = '로그인 중 오류가 발생했습니다.';
            
            switch (error.code) {
                case 'auth/user-not-found':
                    errorMessage = '등록되지 않은 이메일입니다.';
                    break;
                case 'auth/wrong-password':
                    errorMessage = '비밀번호가 올바르지 않습니다.';
                    break;
                case 'auth/invalid-email':
                    errorMessage = '유효하지 않은 이메일 형식입니다.';
                    break;
                case 'auth/user-disabled':
                    errorMessage = '비활성화된 계정입니다.';
                    break;
                case 'auth/too-many-requests':
                    errorMessage = '너무 많은 로그인 시도가 있었습니다. 잠시 후 다시 시도해주세요.';
                    break;
                case 'auth/network-request-failed':
                    errorMessage = '네트워크 오류가 발생했습니다. 인터넷 연결을 확인해주세요.';
                    break;
                default:
                    errorMessage = `로그인 오류: ${error.message}`;
            }
            
            this.showNotification(errorMessage, 'error');
            
            // 버튼 상태 복원
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
        }
    }

    handleSocialLogin(provider) {
        this.showNotification(`${provider} 로그인 기능이 준비 중입니다!`, 'info');
        
        // 여기에 실제 소셜 로그인 로직을 추가할 수 있습니다
        // 예: Firebase Auth, Google OAuth, Facebook SDK 등
    }

    handleSignup(e) {
        e.preventDefault();
        // 회원가입 페이지로 이동
        window.location.href = 'signup.html';
    }

    handleForgotPassword(e) {
        e.preventDefault();
        this.showNotification('비밀번호 찾기 기능이 준비 중입니다!', 'info');
        
        // 여기에 비밀번호 찾기 페이지로 이동하는 로직을 추가할 수 있습니다
        // Firebase Auth의 sendPasswordResetEmail을 사용할 수 있습니다
    }

    checkRememberMe() {
        const rememberedEmail = localStorage.getItem('rememberedEmail');
        if (rememberedEmail) {
            document.getElementById('email').value = rememberedEmail;
            document.getElementById('rememberMe').checked = true;
        }
    }

    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
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
    new LoginManager();
});
