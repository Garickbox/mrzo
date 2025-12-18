
// firebase-init.js - Инициализация структуры базы данных для чата

console.log('🚀 Инициализация Firebase для школьного чата...');

// Конфигурация Firebase (такая же как везде)
const firebaseConfig = {
    apiKey: "AIzaSyCox_zyQP5GMa5W9Tw2cUoBtvkQC-PcrsE",
    authDomain: "school-test-mrzo25.firebaseapp.com",
    projectId: "school-test-mrzo25",
    storageBucket: "school-test-mrzo25.firebasestorage.app",
    messagingSenderId: "143703431012",
    appId: "1:143703431012:web:b02bec2f8b28ce6e2acc71",
    measurementId: "G-MDJ60H5TBC"
};

// Инициализация Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();

/**
 * Создает структуру чатов в базе данных
 * Эта функция должна запускаться один раз администратором
 */
async function initializeChats() {
    console.log('📝 Создание структуры чатов...');
    
    const chats = [
        { id: 'general', name: 'Общий чат школы', description: 'Чат для всех учеников и учителей' },
        { id: '7', name: 'Чат 7 класса', description: 'Чат для учеников 7 класса' },
        { id: '8', name: 'Чат 8 класса', description: 'Чат для учеников 8 класса' },
        { id: '9', name: 'Чат 9 класса', description: 'Чат для учеников 9 класса' },
        { id: '10', name: 'Чат 10 класса', description: 'Чат для учеников 10 класса' },
        { id: '11', name: 'Чат 11 класса', description: 'Чат для учеников 11 класса' }
    ];
    
    try {
        for (const chat of chats) {
            const chatRef = db.collection('chats').doc(chat.id);
            const chatDoc = await chatRef.get();
            
            if (!chatDoc.exists) {
                await chatRef.set({
                    id: chat.id,
                    name: chat.name,
                    description: chat.description,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    lastMessageAt: null,
                    messageCount: 0,
                    isActive: true
                });
                
                console.log(`✅ Создан чат: ${chat.name}`);
                
                // Добавляем приветственное сообщение
                await chatRef.collection('messages').add({
                    text: chat.id === 'general' 
                        ? '🎓 Добро пожаловать в общий чат Высоковской школы №25! Здесь вы можете общаться со всеми учениками и учителями.'
                        : `📚 Добро пожаловать в чат ${chat.name}! Здесь общаются ученики ${chat.id} класса.`,
                    senderId: 'system',
                    senderName: 'Система',
                    senderClass: 'system',
                    timestamp: Date.now(),
                    type: 'system',
                    chatId: chat.id
                });
                
                console.log(`✅ Добавлено приветственное сообщение в чат ${chat.name}`);
            } else {
                console.log(`ℹ️ Чат ${chat.name} уже существует`);
            }
        }
        
        console.log('🎉 Все чаты успешно инициализированы!');
        return true;
        
    } catch (error) {
        console.error('❌ Ошибка инициализации чатов:', error);
        return false;
    }
}

/**
 * Получает статистику по чатам
 */
async function getChatStats() {
    try {
        const stats = {};
        const chats = ['general', '7', '8', '9', '10', '11'];
        
        for (const chatId of chats) {
            const chatRef = db.collection('chats').doc(chatId);
            const chatDoc = await chatRef.get();
            
            if (chatDoc.exists) {
                const messagesSnapshot = await chatRef.collection('messages').get();
                stats[chatId] = {
                    name: chatDoc.data().name,
                    messageCount: messagesSnapshot.size,
                    lastMessage: chatDoc.data().lastMessageAt 
                        ? new Date(chatDoc.data().lastMessageAt.toDate()).toLocaleString()
                        : 'Нет сообщений'
                };
            }
        }
        
        console.log('📊 Статистика чатов:', stats);
        return stats;
        
    } catch (error) {
        console.error('❌ Ошибка получения статистики:', error);
        return null;
    }
}

/**
 * Очищает все сообщения в указанном чате
 * @param {string} chatId - ID чата
 */
async function clearChat(chatId) {
    if (!confirm(`Вы уверены, что хотите очистить чат "${chatId}"?`)) {
        return;
    }
    
    try {
        const chatRef = db.collection('chats').doc(chatId);
        const messagesSnapshot = await chatRef.collection('messages').get();
        
        const batch = db.batch();
        messagesSnapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
        });
        
        await batch.commit();
        
        // Добавляем сообщение об очистке
        await chatRef.collection('messages').add({
            text: '💬 История чата была очищена администратором.',
            senderId: 'system',
            senderName: 'Система',
            senderClass: 'system',
            timestamp: Date.now(),
            type: 'system',
            chatId: chatId
        });
        
        // Обновляем статистику чата
        await chatRef.update({
            lastMessageAt: firebase.firestore.FieldValue.serverTimestamp(),
            messageCount: 1
        });
        
        console.log(`✅ Чат ${chatId} очищен`);
        alert(`Чат ${chatId} успешно очищен!`);
        
    } catch (error) {
        console.error('❌ Ошибка очистки чата:', error);
        alert('Ошибка очистки чата');
    }
}

/**
 * Проверяет и обновляет структуру базы данных
 */
async function checkAndUpdateDatabase() {
    console.log('🔍 Проверка структуры базы данных...');
    
    try {
        // Проверяем существование коллекции chats
        const chatsSnapshot = await db.collection('chats').limit(1).get();
        
        if (chatsSnapshot.empty) {
            console.log('📭 Коллекция чатов не найдена, создаем структуру...');
            const success = await initializeChats();
            
            if (success) {
                console.log('✅ База данных успешно инициализирована');
            } else {
                console.error('❌ Не удалось инициализировать базу данных');
            }
        } else {
            console.log('✅ Структура базы данных уже существует');
            
            // Проверяем наличие всех необходимых чатов
            const requiredChats = ['general', '7', '8', '9', '10', '11'];
            const existingChats = [];
            
            const allChatsSnapshot = await db.collection('chats').get();
            allChatsSnapshot.forEach(doc => {
                existingChats.push(doc.id);
            });
            
            const missingChats = requiredChats.filter(chat => !existingChats.includes(chat));
            
            if (missingChats.length > 0) {
                console.log(`⚠️ Отсутствуют чаты: ${missingChats.join(', ')}`);
                
                // Создаем недостающие чаты
                for (const chatId of missingChats) {
                    const chatRef = db.collection('chats').doc(chatId);
                    const name = chatId === 'general' ? 'Общий чат школы' : `Чат ${chatId} класса`;
                    
                    await chatRef.set({
                        id: chatId,
                        name: name,
                        description: chatId === 'general' 
                            ? 'Чат для всех учеников и учителей'
                            : `Чат для учеников ${chatId} класса`,
                        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                        lastMessageAt: null,
                        messageCount: 0,
                        isActive: true
                    });
                    
                    console.log(`✅ Создан отсутствующий чат: ${name}`);
                }
            }
        }
        
        return true;
        
    } catch (error) {
        console.error('❌ Ошибка проверки базы данных:', error);
        return false;
    }
}

/**
 * Добавляет тестовые сообщения в чат (для отладки)
 */
async function addTestMessages(chatId = 'general', count = 5) {
    const testMessages = [
        "Привет всем! Как дела?",
        "Кто сделал домашнее задание по математике?",
        "Напоминаю: завтра контрольная по физике!",
        "Кто пойдет в столовую на большой перемене?",
        "У кого есть конспект по истории?",
        "Когда будет родительское собрание?",
        "Поздравляю всех с началом учебной недели!",
        "Не забывайте делать зарядку по утрам!",
        "Кто хочет в футбол после уроков?",
        "Наш класс - самый лучший! 🎉"
    ];
    
    const testUsers = [
        { id: 701, firstName: "Богдан", lastName: "Брановицкий", class: "7" },
        { id: 901, firstName: "София", lastName: "Аветисян", class: "9" },
        { id: 1101, firstName: "Данил", lastName: "Брагинец", class: "11" },
        { id: 1000, firstName: "Admin", lastName: "Admin", class: "admin", isAdmin: true }
    ];
    
    try {
        const chatRef = db.collection('chats').doc(chatId);
        
        for (let i = 0; i < count; i++) {
            const user = testUsers[Math.floor(Math.random() * testUsers.length)];
            const message = testMessages[Math.floor(Math.random() * testMessages.length)];
            
            await chatRef.collection('messages').add({
                text: message,
                senderId: user.id,
                senderName: `${user.firstName} ${user.lastName}`,
                senderClass: user.isAdmin ? 'admin' : user.class,
                timestamp: Date.now() - (i * 3600000), // Сообщения за последние несколько часов
                chatId: chatId
            });
            
            console.log(`✅ Добавлено тестовое сообщение ${i + 1}: "${message}" от ${user.firstName}`);
        }
        
        // Обновляем время последнего сообщения
        await chatRef.update({
            lastMessageAt: firebase.firestore.FieldValue.serverTimestamp(),
            messageCount: firebase.firestore.FieldValue.increment(count)
        });
        
        console.log(`✅ Добавлено ${count} тестовых сообщений в чат ${chatId}`);
        return true;
        
    } catch (error) {
        console.error('❌ Ошибка добавления тестовых сообщений:', error);
        return false;
    }
}

/**
 * Создает панель администратора для управления чатами
 */
function createAdminPanel() {
    // Проверяем, является ли текущий пользователь администратором
    const savedStudent = localStorage.getItem('lastStudent');
    if (!savedStudent) return;
    
    try {
        const student = JSON.parse(savedStudent);
        if (!student.isAdmin) return;
        
        console.log('👑 Создание панели администратора...');
        
        // Создаем кнопку администратора
        const adminButton = document.createElement('button');
        adminButton.id = 'chatAdminButton';
        adminButton.innerHTML = '<i class="fas fa-cog"></i>';
        adminButton.title = 'Панель администратора чата';
        adminButton.style.cssText = `
            position: fixed;
            bottom: 90px;
            left: 20px;
            width: 40px;
            height: 40px;
            background: linear-gradient(135deg, #673AB7 0%, #4527A0 100%);
            color: white;
            border-radius: 50%;
            border: none;
            cursor: pointer;
            z-index: 1001;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 18px;
            box-shadow: 0 4px 10px rgba(103, 58, 183, 0.3);
            transition: all 0.3s;
        `;
        
        adminButton.addEventListener('mouseenter', () => {
            adminButton.style.transform = 'scale(1.1)';
            adminButton.style.boxShadow = '0 6px 15px rgba(103, 58, 183, 0.5)';
        });
        
        adminButton.addEventListener('mouseleave', () => {
            adminButton.style.transform = 'scale(1)';
            adminButton.style.boxShadow = '0 4px 10px rgba(103, 58, 183, 0.3)';
        });
        
        adminButton.addEventListener('click', () => {
            showAdminPanel();
        });
        
        document.body.appendChild(adminButton);
        
        console.log('✅ Панель администратора создана');
        
    } catch (error) {
        console.error('❌ Ошибка создания панели администратора:', error);
    }
}

/**
 * Показывает панель администратора
 */
function showAdminPanel() {
    // Создаем модальное окно
    const modal = document.createElement('div');
    modal.id = 'chatAdminModal';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.7);
        z-index: 9999;
        display: flex;
        align-items: center;
        justify-content: center;
        animation: fadeIn 0.3s ease;
    `;
    
    modal.innerHTML = `
        <div style="
            background: white;
            border-radius: 15px;
            padding: 30px;
            max-width: 500px;
            width: 90%;
            max-height: 80vh;
            overflow-y: auto;
            box-shadow: 0 10px 30px rgba(0,0,0,0.3);
        ">
            <h2 style="color: #673AB7; margin-bottom: 20px; display: flex; align-items: center; gap: 10px;">
                <i class="fas fa-cog"></i> Панель администратора чата
            </h2>
            
            <div id="adminChatStats" style="margin-bottom: 25px; padding: 15px; background: #f5f5f5; border-radius: 10px;">
                <p><i class="fas fa-spinner fa-spin"></i> Загрузка статистики...</p>
            </div>
            
            <div style="display: flex; flex-direction: column; gap: 15px;">
                <button onclick="window.firebaseInit.initializeChats()" class="admin-btn">
                    <i class="fas fa-plus-circle"></i> Инициализировать чаты
                </button>
                
                <button onclick="window.firebaseInit.getChatStats()" class="admin-btn">
                    <i class="fas fa-chart-bar"></i> Обновить статистику
                </button>
                
                <div style="border-top: 1px solid #ddd; padding-top: 15px;">
                    <h3 style="font-size: 16px; margin-bottom: 10px;">Очистка чатов:</h3>
                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
                        <button onclick="window.firebaseInit.clearChat('general')" class="clear-btn">Общий</button>
                        <button onclick="window.firebaseInit.clearChat('7')" class="clear-btn">7 класс</button>
                        <button onclick="window.firebaseInit.clearChat('8')" class="clear-btn">8 класс</button>
                        <button onclick="window.firebaseInit.clearChat('9')" class="clear-btn">9 класс</button>
                        <button onclick="window.firebaseInit.clearChat('10')" class="clear-btn">10 класс</button>
                        <button onclick="window.firebaseInit.clearChat('11')" class="clear-btn">11 класс</button>
                    </div>
                </div>
                
                <div style="border-top: 1px solid #ddd; padding-top: 15px;">
                    <h3 style="font-size: 16px; margin-bottom: 10px;">Тестовые данные:</h3>
                    <div style="display: flex; gap: 10px;">
                        <button onclick="window.firebaseInit.addTestMessages('general', 3)" class="test-btn">Общий чат</button>
                        <button onclick="window.firebaseInit.addTestMessages('9', 2)" class="test-btn">9 класс</button>
                    </div>
                </div>
            </div>
            
            <button onclick="closeAdminPanel()" style="
                margin-top: 25px;
                width: 100%;
                padding: 12px;
                background: #f5f5f5;
                border: none;
                border-radius: 8px;
                cursor: pointer;
                font-weight: 600;
            ">Закрыть</button>
        </div>
    `;
    
    // Добавляем стили
    const style = document.createElement('style');
    style.textContent = `
        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }
        
        .admin-btn {
            padding: 12px;
            background: linear-gradient(135deg, #673AB7 0%, #4527A0 100%);
            color: white;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 600;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            transition: transform 0.2s;
        }
        
        .admin-btn:hover {
            transform: translateY(-2px);
        }
        
        .clear-btn {
            padding: 8px;
            background: #ff4757;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 12px;
        }
        
        .clear-btn:hover {
            background: #ff2e43;
        }
        
        .test-btn {
            padding: 8px 12px;
            background: #4b6cb7;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 12px;
            flex: 1;
        }
        
        .test-btn:hover {
            background: #3a4f8c;
        }
    `;
    
    document.head.appendChild(style);
    document.body.appendChild(modal);
    
    // Загружаем статистику
    loadAdminStats();
    
    // Закрытие при клике на фон
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeAdminPanel();
        }
    });
}

/**
 * Загружает статистику для панели администратора
 */
async function loadAdminStats() {
    const statsContainer = document.getElementById('adminChatStats');
    
    try {
        const stats = await getChatStats();
        
        if (stats) {
            let html = '<div style="font-size: 14px;">';
            html += '<div style="display: grid; grid-template-columns: 2fr 1fr 2fr; gap: 10px; margin-bottom: 10px; font-weight: 600;">';
            html += '<div>Чат</div><div>Сообщений</div><div>Последнее</div>';
            html += '</div>';
            
            for (const [chatId, data] of Object.entries(stats)) {
                html += `
                    <div style="display: grid; grid-template-columns: 2fr 1fr 2fr; gap: 10px; padding: 5px 0; border-bottom: 1px solid #eee;">
                        <div>${data.name}</div>
                        <div style="text-align: center;">${data.messageCount}</div>
                        <div style="font-size: 12px; color: #666;">${data.lastMessage}</div>
                    </div>
                `;
            }
            
            html += '</div>';
            statsContainer.innerHTML = html;
        }
    } catch (error) {
        statsContainer.innerHTML = '<p style="color: #ff4757;">Ошибка загрузки статистики</p>';
    }
}

/**
 * Закрывает панель администратора
 */
function closeAdminPanel() {
    const modal = document.getElementById('chatAdminModal');
    if (modal) {
        modal.remove();
    }
}

// Делаем функции доступными глобально
window.firebaseInit = {
    initializeChats,
    getChatStats,
    clearChat,
    addTestMessages,
    checkAndUpdateDatabase,
    createAdminPanel
};

// Автоматическая проверка базы данных при загрузке
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🔍 Автоматическая проверка структуры базы данных...');
    
    try {
        // Проверяем и обновляем базу данных
        await checkAndUpdateDatabase();
        
        // Создаем панель администратора, если пользователь - админ
        setTimeout(createAdminPanel, 2000);
        
    } catch (error) {
        console.error('❌ Ошибка при автоматической проверке базы данных:', error);
    }
});

console.log('✅ Firebase инициализирован. Функции доступны в window.firebaseInit');