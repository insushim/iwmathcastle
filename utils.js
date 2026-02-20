export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

export function showMessage(text) {
    const popup = document.createElement('div');
    popup.className = 'message-popup';
    popup.textContent = text;
    document.body.appendChild(popup);
    setTimeout(() => popup.remove(), 3000);
}

export function showUpgradeNotification(text) {
    const popup = document.createElement('div');
    popup.className = 'upgrade-notification';
    popup.textContent = text;
    document.body.appendChild(popup);
    setTimeout(() => popup.remove(), 3000);
}

export function showModal(modal) { modal.classList.add('show'); }
export function hideModal(modal) { modal.classList.remove('show'); }

export function getDistanceSq(obj1, obj2) {
    const dx = obj1.x - obj2.x;
    const dy = obj1.y - obj2.y;
    return dx * dx + dy * dy;
}

export function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

export function getAnswerType(answer) {
    const strAnswer = String(answer);
    const hasNumber = /\d/.test(strAnswer);
    const hasText = /[ㄱ-ㅎㅏ-ㅣ가-힣a-zA-Z]/.test(strAnswer);
    if (hasNumber && !hasText) return 'numeric';
    if (!hasNumber && hasText) return 'text';
    if (hasNumber && hasText) return 'mixed';
    if (['<', '>', '='].includes(strAnswer)) return 'symbol';
    return 'other';
}