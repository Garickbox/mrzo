// chat/chat.js - Логика чата для index.html
class ChatManager {
    constructor() {
        this.unreadCount = 0;
        this.chatWindow = null;
        this.init();
    }
    
    init() {
        // Загружаем количество непрочитанных из localStorage
        const savedCount = localStorage.getItem('chatUnreadCount');
        if (savedCount) {
            this.unreadCount = parseInt(savedCount);
        }
        
        // Создаем элемент чата
        this.createChatElement();
        this.setupEventListeners();
        this.updateBadge();
        
        // Слушаем сообщения от окна чата
        window.addEventListener('message', (event) => {
            if (event.data.type === 'CHAT_UNREAD_UPDATE') {
                this.unreadCount = event.data.count;
                this.updateBadge();
            }
        });
    }
    
    createChatElement() {
        // Создаем пиктограмму чата
        const chatMini = document.createElement('div');
        chatMini.className = 'chat-mini';
        chatMini.id = 'chatMini';
        chatMini.title = 'Школьный чат';
        chatMini.innerHTML = '💬';
        
        // Добавляем бейдж для непрочитанных
        const badge = document.createElement('span');
        badge.className = 'chat-badge';
        badge.id = 'chatBadge';
        badge.style.display = 'none';
        chatMini.appendChild(badge);
        
        // Добавляем в тело документа
        document.body.appendChild(chatMini);
    }
    
    setupEventListeners() {
        const chatMini = document.getElementById('chatMini');
        chatMini.addEventListener('click', () => this.openChat());
    }
    
    openChat() {
        // Открываем чат в новом окне
        const width = 800;
        const height = 600;
        const left = (screen.width - width) / 2;
        const top = (screen.height - height) / 2;
        
        this.chatWindow = window.open(
            'chat/chat.html',
            'schoolChat',
            `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
        );
        
        // Сбрасываем счетчик непрочитанных при открытии чата
        this.unreadCount = 0;
        this.updateBadge();
        localStorage.setItem('chatUnreadCount', 0);
        
        // Проверяем состояние чата каждые 5 секунд
        const checkChatClosed = setInterval(() => {
            if (this.chatWindow && this.chatWindow.closed) {
                clearInterval(checkChatClosed);
                this.chatWindow = null;
                
                // При закрытии чата запрашиваем обновление счетчика
                this.updateUnreadCountFromLocalStorage();
            }
        }, 5000);
    }
    
    updateUnreadCountFromLocalStorage() {
        // Запрашиваем обновленный счетчик из localStorage
        const savedCount = localStorage.getItem('chatUnreadCount');
        if (savedCount) {
            this.unreadCount = parseInt(savedCount);
            this.updateBadge();
        }
    }
    
    updateBadge() {
        const badge = document.getElementById('chatBadge');
        if (this.unreadCount > 0) {
            badge.textContent = this.unreadCount;
            badge.style.display = 'block';
            
            // Добавляем анимацию для новых сообщений
            badge.style.animation = 'none';
            setTimeout(() => {
                badge.style.animation = 'pulse 1s infinite';
            }, 10);
        } else {
            badge.style.display = 'none';
        }
    }
    
    // Публичный метод для обновления счетчика
    setUnreadCount(count) {
        this.unreadCount = count;
        this.updateBadge();
        localStorage.setItem('chatUnreadCount', count);
    }
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    window.chatManager = new ChatManager();
});