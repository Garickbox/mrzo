const fetch = require('node-fetch');
const admin = require('firebase-admin');
const readline = require('readline');

// Загрузка переменных окружения
require('dotenv').config();

// ==================== КОНФИГУРАЦИЯ ====================
const CONFIG = {
    // Telegram бот токен
    BOT_TOKEN: process.env.BOT_TOKEN,
    
    // Firebase Admin конфигурация
    FIREBASE_ADMIN_KEY: {
        "type": "service_account",
        "project_id": process.env.FIREBASE_PROJECT_ID,
        "private_key_id": process.env.FIREBASE_PRIVATE_KEY_ID,
        "private_key": process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        "client_email": process.env.FIREBASE_CLIENT_EMAIL,
        "client_id": process.env.FIREBASE_CLIENT_ID,
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
        "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
        "client_x509_cert_url": process.env.FIREBASE_CLIENT_X509_CERT_URL,
        "universe_domain": "googleapis.com"
    },
    
    // URLs
    TESTS_BASE_URL: process.env.TESTS_BASE_URL || 'https://garickbox.github.io/test/test/',
    MAIN_WEBSITE: process.env.MAIN_WEBSITE || 'https://garickbox.github.io/test/',
    
    // Telegram
    ADMIN_TELEGRAM_ID: process.env.ADMIN_TELEGRAM_ID,
    RESULTS_CHAT_ID: process.env.RESULTS_CHAT_ID,
    
    // Время отображения сообщений (в миллисекундах)
    MESSAGE_TIMING: {
        ANSWER_FEEDBACK: 4000,      // Результат ответа (правильно/неправильно)
        FINAL_RESULT: 15000,        // Финальный результат теста
        TEMP_MESSAGE: 3000,         // Временные сообщения
        QUESTION_TRANSITION: 1500   // Переход между вопросами
    }
};

// ==================== FIREBASE ИНИЦИАЛИЗАЦИЯ ====================
let db = null;
let firebaseInitialized = false;

function initializeFirebase() {
    if (firebaseInitialized) return true;
    
    try {
        // Проверяем наличие необходимых переменных
        if (!CONFIG.FIREBASE_ADMIN_KEY.project_id || 
            !CONFIG.FIREBASE_ADMIN_KEY.private_key || 
            !CONFIG.FIREBASE_ADMIN_KEY.client_email) {
            console.warn('⚠️ Firebase конфигурация неполная. Firebase будет отключен.');
            return false;
        }
        
        // Инициализируем Firebase только если не инициализирован
        if (admin.apps.length === 0) {
            admin.initializeApp({
                credential: admin.credential.cert(CONFIG.FIREBASE_ADMIN_KEY),
                databaseURL: `https://${CONFIG.FIREBASE_ADMIN_KEY.project_id}.firebaseio.com`
            });
        }
        
        db = admin.firestore();
        firebaseInitialized = true;
        TestManager.logEvent('admin', 'Firebase Admin подключен');
        return true;
    } catch (error) {
        console.error('❌ Ошибка инициализации Firebase:', error.message);
        return false;
    }
}

// ==================== ЗАГРУЗЧИК ТЕСТОВ ====================
class TestLoader {
    constructor() {
        this.baseUrl = CONFIG.TESTS_BASE_URL;
        this.cache = new Map();
    }

    async loadTest(testName) {
        if (this.cache.has(testName)) {
            return this.cache.get(testName);
        }

        try {
            TestManager.logEvent('info', `Загружаю тест: ${testName}`);
            const response = await fetch(`${this.baseUrl}${testName}.js`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: Тест "${testName}" не найден`);
            }
            
            const jsCode = await response.text();
            const testData = this.parseTestData(jsCode, testName);
            
            this.cache.set(testName, testData);
            TestManager.logEvent('test_load', `Тест загружен: ${testData.TEST_CONFIG.title}`);
            return testData;
        } catch (error) {
            TestManager.logEvent('error', `Ошибка загрузки теста "${testName}": ${error.message}`);
            throw new Error(`Не удалось загрузить тест "${testName}". Проверьте интернет соединение и правильность названия теста.`);
        }
    }

    parseTestData(jsCode, testName) {
        try {
            const configMatch = jsCode.match(/window\.TEST_CONFIG\s*=\s*({[\s\S]*?});/);
            const questionsMatch = jsCode.match(/window\.questionsBank\s*=\s*(\[[\s\S]*?\]);/);
            const problemsMatch = jsCode.match(/window\.problemsBank\s*=\s*(\[[\s\S]*?\]);/);

            if (!configMatch) throw new Error('TEST_CONFIG не найден');
            if (!questionsMatch) throw new Error('questionsBank не найден');
            if (!problemsMatch) throw new Error('problemsBank не найден');

            const safeEval = (str) => {
                try {
                    return Function(`"use strict"; return (${str})`)();
                } catch (e) {
                    throw new Error(`Ошибка парсинга данных: ${e.message}`);
                }
            };
            
            return {
                name: testName,
                TEST_CONFIG: safeEval(configMatch[1]),
                questionsBank: safeEval(questionsMatch[1]),
                problemsBank: safeEval(problemsMatch[1])
            };
        } catch (error) {
            throw new Error(`Неверный формат тестового файла "${testName}": ${error.message}`);
        }
    }

    getAvailableTests() {
        return [
            { name: 'ttii7', title: 'Компьютер — универсальное устройство (7 класс)' },
            { name: 'test', title: 'Основной тест' },
            { name: 'teststat89', title: 'Случайные опыты, события и множества (8-9 класс)' }
        ];
    }

    getSimilarTests(searchTerm) {
        const normalizedSearch = searchTerm.toLowerCase().trim();
        const allTests = this.getAvailableTests();
        
        // Поиск по точному совпадению
        const exactMatch = allTests.find(test => test.name === normalizedSearch);
        if (exactMatch) return [exactMatch];
        
        // Поиск по начальным символам
        return allTests.filter(test => 
            test.name.startsWith(normalizedSearch.substring(0, 3)) ||
            test.name.includes(normalizedSearch)
        );
    }
}

// ==================== МЕНЕДЖЕР ТЕСТОВ ====================
class TestManager {
    constructor() {
        this.userSessions = new Map();
        this.userStudents = new Map();
        this.userMessageChains = new Map();
        this.userActiveMessage = new Map(); // Активное сообщение для каждого пользователя
        
        // Очистка старых сессий каждые 5 минут
        setInterval(() => this.cleanupOldSessions(), 5 * 60 * 1000);
    }

    // Метод для логирования с цветами и временем
    static logEvent(type, message, data = null) {
        const timestamp = new Date().toLocaleTimeString('ru-RU');
        const colors = {
            INFO: '\x1b[36m',    // Cyan
            SUCCESS: '\x1b[32m', // Green
            WARNING: '\x1b[33m', // Yellow
            ERROR: '\x1b[31m',   // Red
            RESET: '\x1b[0m'     // Reset
        };
        
        const typeMap = {
            'test_start': { emoji: '🚀', color: colors.SUCCESS, type: 'START' },
            'test_complete': { emoji: '✅', color: colors.SUCCESS, type: 'COMPLETE' },
            'test_load': { emoji: '📥', color: colors.INFO, type: 'LOAD' },
            'test_error': { emoji: '❌', color: colors.ERROR, type: 'ERROR' },
            'auth_success': { emoji: '👤', color: colors.INFO, type: 'AUTH' },
            'auth_fail': { emoji: '🚫', color: colors.WARNING, type: 'AUTH_FAIL' },
            'admin': { emoji: '🔧', color: colors.INFO, type: 'ADMIN' },
            'info': { emoji: 'ℹ️', color: colors.INFO, type: 'INFO' }
        };
        
        const event = typeMap[type] || { emoji: '📝', color: colors.INFO, type: type.toUpperCase() };
        
        let logMessage = `${event.color}[${timestamp}] ${event.emoji} ${event.type}: ${message}${colors.RESET}`;
        
        if (data && Object.keys(data).length > 0) {
            logMessage += `\n${event.color}    ↳ Данные: ${JSON.stringify(data, null, 2)}${colors.RESET}`;
        }
        
        console.log(logMessage);
    }

    cleanupOldSessions() {
        const now = Date.now();
        const timeout = 30 * 60 * 1000; // 30 минут
        
        for (const [userId, session] of this.userSessions.entries()) {
            if (now - session.startTime > timeout) {
                TestManager.logEvent('info', `Удалена старая сессия пользователя ${userId}`, {
                    student: `${session.student.lastName} ${session.student.firstName}`,
                    test: session.testTitle,
                    duration: Math.floor((now - session.startTime) / 1000 / 60) + ' мин'
                });
                this.userSessions.delete(userId);
                this.userMessageChains.delete(userId);
                this.userActiveMessage.delete(userId);
            }
        }
    }

    // Авторизация пользователей
    saveStudent(userId, student) {
        this.userStudents.set(userId, student);
        TestManager.logEvent('auth_success', `Ученик авторизован`, {
            userId,
            student: `${student.lastName} ${student.firstName}`,
            class: student.class,
            id: student.id
        });
        return true;
    }

    getStudent(userId) {
        return this.userStudents.get(userId);
    }

    removeStudent(userId) {
        const student = this.userStudents.get(userId);
        if (student) {
            TestManager.logEvent('auth_success', `Ученик удален`, {
                userId,
                student: `${student.lastName} ${student.firstName}`
            });
        }
        this.userStudents.delete(userId);
        return true;
    }

    // Управление активными сообщениями
    setActiveMessage(userId, messageId) {
        this.userActiveMessage.set(userId, messageId);
        return true;
    }

    getActiveMessage(userId) {
        return this.userActiveMessage.get(userId);
    }

    async deleteActiveMessage(userId, ctx) {
        const activeMessageId = this.userActiveMessage.get(userId);
        if (activeMessageId) {
            try {
                await ctx.telegram.deleteMessage(ctx.chat.id, activeMessageId);
                this.userActiveMessage.delete(userId);
                return true;
            } catch (error) {
                return false;
            }
        }
        return false;
    }

    // Управление цепочками сообщений
    startMessageChain(userId, firstMessageId) {
        this.userMessageChains.set(userId, [firstMessageId]);
        return true;
    }

    addToMessageChain(userId, messageId) {
        const chain = this.userMessageChains.get(userId) || [];
        chain.push(messageId);
        this.userMessageChains.set(userId, chain);
        return true;
    }

    async cleanupMessageChain(userId, ctx) {
        const chain = this.userMessageChains.get(userId);
        if (!chain || chain.length === 0) return false;
        
        TestManager.logEvent('info', `Удаляю цепочку из ${chain.length} сообщений для userId ${userId}`);
        
        for (const messageId of chain) {
            try {
                await ctx.telegram.deleteMessage(ctx.chat.id, messageId);
            } catch (error) {
                // Игнорируем ошибки
            }
        }
        
        this.userMessageChains.delete(userId);
        return true;
    }

    // Сессии тестов
    createTestSession(userId, testData, student) {
        const questions = this.shuffle([...testData.questionsBank])
            .slice(0, testData.TEST_CONFIG.totalQuestions || 20);
        const problems = this.shuffle([...testData.problemsBank])
            .slice(0, testData.TEST_CONFIG.totalProblems || 3);
        
        const allQuestions = this.shuffle([...questions, ...problems]);
        
        const session = {
            userId,
            student,
            testName: testData.name,
            testTitle: testData.TEST_CONFIG.title,
            allQuestions,
            currentQuestionIndex: 0,
            userAnswers: Array(allQuestions.length).fill(null),
            score: 0,
            startTime: Date.now(),
            isCompleted: false,
            maxScore: testData.TEST_CONFIG.maxScore || 29,
            telegramConfig: testData.TEST_CONFIG.telegram || {
                botToken: CONFIG.BOT_TOKEN,
                chatId: CONFIG.RESULTS_CHAT_ID
            },
            currentQuestionMessageId: null // ID текущего сообщения с вопросом
        };
        
        this.userSessions.set(userId, session);
        TestManager.logEvent('test_start', `Старт теста "${testData.TEST_CONFIG.title}"`, {
            userId,
            student: `${student.lastName} ${student.firstName}`,
            class: student.class,
            questions: allQuestions.length
        });
        return session;
    }

    getSession(userId) {
        return this.userSessions.get(userId);
    }

    deleteSession(userId) {
        const session = this.userSessions.get(userId);
        if (session) {
            TestManager.logEvent('info', `Сессия удалена`, {
                userId,
                test: session.testTitle,
                student: `${session.student.lastName} ${session.student.firstName}`
            });
        }
        this.userMessageChains.delete(userId);
        this.userActiveMessage.delete(userId);
        return this.userSessions.delete(userId);
    }

    setCurrentQuestionMessageId(userId, messageId) {
        const session = this.userSessions.get(userId);
        if (session) {
            session.currentQuestionMessageId = messageId;
            return true;
        }
        return false;
    }

    async deleteCurrentQuestionMessage(userId, ctx) {
        const session = this.userSessions.get(userId);
        if (session && session.currentQuestionMessageId) {
            try {
                await ctx.telegram.deleteMessage(ctx.chat.id, session.currentQuestionMessageId);
                session.currentQuestionMessageId = null;
                return true;
            } catch (error) {
                return false;
            }
        }
        return false;
    }

    answerQuestion(userId, answerIndex) {
        const session = this.userSessions.get(userId);
        if (!session || session.isCompleted) return null;
        
        const question = session.allQuestions[session.currentQuestionIndex];
        const isCorrect = question.options[answerIndex].v === 'correct';
        
        session.userAnswers[session.currentQuestionIndex] = {
            answerIndex,
            isCorrect,
            points: question.points
        };
        
        if (isCorrect) {
            session.score += question.points;
        }
        
        session.currentQuestionIndex++;
        
        if (session.currentQuestionIndex >= session.allQuestions.length) {
            session.isCompleted = true;
            session.endTime = Date.now();
            session.grade = this.calculateGrade(session.score, session.maxScore);
            
            // Подсчет правильных ответов
            session.correctQuestions = 0;
            session.correctProblems = 0;
            
            session.userAnswers.forEach((answer, index) => {
                if (answer && answer.isCorrect) {
                    if (session.allQuestions[index].points === 1) {
                        session.correctQuestions++;
                    } else if (session.allQuestions[index].points === 3) {
                        session.correctProblems++;
                    }
                }
            });
            
            TestManager.logEvent('test_complete', `Тест завершен`, {
                student: `${session.student.lastName} ${session.student.firstName}`,
                score: `${session.score}/${session.maxScore}`,
                grade: session.grade,
                duration: Math.floor((session.endTime - session.startTime) / 1000) + ' сек'
            });
        }
        
        return {
            session,
            isCorrect,
            isCompleted: session.isCompleted
        };
    }

    calculateGrade(score, maxScore) {
        const percentage = (score / maxScore) * 100;
        if (percentage >= 90) return 5;
        if (percentage >= 75) return 4;
        if (percentage >= 60) return 3;
        if (percentage >= 40) return 2;
        return 1;
    }

    shuffle(array) {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }

    async sendResultsToTelegram(session) {
        try {
            const config = session.telegramConfig;
            if (!config || !config.botToken || !config.chatId) {
                TestManager.logEvent('info', 'Telegram не настроен для этого теста');
                return false;
            }
            
            const student = session.student;
            const duration = Math.floor((session.endTime - session.startTime) / 1000 / 60);
            
            const message = `⚡ Результаты теста: ${session.testTitle}

👤 Ученик: ${student.lastName} ${student.firstName}
🏫 Класс: ${student.class}
⏱️ Время: ${duration} мин
🎯 Баллы: ${session.score}/${session.maxScore}
📊 Оценка: ${session.grade}

Детализация:
📖 Правильных вопросов: ${session.correctQuestions}
📐 Правильных задач: ${session.correctProblems}`;
            
            const response = await fetch(
                `https://api.telegram.org/bot${config.botToken}/sendMessage`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: config.chatId,
                        text: message,
                        parse_mode: 'Markdown'
                    })
                }
            );
            
            const data = await response.json();
            if (data.ok) {
                TestManager.logEvent('info', 'Результаты отправлены в Telegram');
                return true;
            } else {
                TestManager.logEvent('error', 'Ошибка Telegram API:', data.description);
                return false;
            }
        } catch (error) {
            TestManager.logEvent('error', 'Ошибка отправки в Telegram:', error.message);
            return false;
        }
    }
}

// ==================== FIREBASE СЕРВИС ====================
class FirebaseService {
    static async saveTestResult(userId, session, result) {
        if (!initializeFirebase() || !db) {
            TestManager.logEvent('warning', 'Firebase не подключен, результат не сохранен');
            return false;
        }
        
        try {
            const resultData = {
                userId: userId.toString(),
                student: result.student,
                testName: session.testTitle,
                testCode: session.testName,
                score: result.score,
                maxScore: result.maxScore,
                grade: result.grade,
                correctQuestions: result.correctQuestions,
                correctProblems: result.correctProblems,
                answers: result.answers,
                duration: result.duration,
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                completedAt: new Date().toISOString()
            };
            
            await db.collection('telegram_results').add(resultData);
            TestManager.logEvent('info', `Результат сохранен в Firebase для userId: ${userId}`);
            return true;
        } catch (error) {
            TestManager.logEvent('error', 'Ошибка сохранения в Firebase:', error.message);
            return false;
        }
    }

    static async getUserResults(userId) {
        if (!initializeFirebase() || !db) {
            TestManager.logEvent('warning', 'Firebase не подключен');
            return [];
        }
        
        try {
            const snapshot = await db.collection('telegram_results')
                .where('userId', '==', userId.toString())
                .orderBy('timestamp', 'desc')
                .limit(20)
                .get();
            
            if (snapshot.empty) {
                return [];
            }
            
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            TestManager.logEvent('error', 'Ошибка получения результатов:', error.message);
            return [];
        }
    }
}

// ==================== АДМИНИСТРАТИВНЫЕ ФУНКЦИИ ====================
function setupAdminConsole() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    console.log('\n\x1b[36m🔧 *Консоль администратора активирована*\x1b[0m');
    console.log('\x1b[33mДоступные команды:\x1b[0m');
    console.log('  stats       - Статистика системы');
    console.log('  sessions    - Активные сессии тестов');
    console.log('  users       - Авторизованные пользователи');
    console.log('  tests       - Загруженные тесты');
    console.log('  clear       - Очистить консоль');
    console.log('  help        - Справка');
    console.log('  exit        - Выйти (бот продолжит работу)\n');

    rl.on('line', (input) => {
        handleAdminCommand(input.trim(), rl);
    });
}

function handleAdminCommand(cmd, rl) {
    const testManager = global.testManagerInstance;
    const testLoader = global.testLoaderInstance;
    
    switch(cmd.toLowerCase()) {
        case 'stats':
            showStatistics(testManager, testLoader);
            break;
        case 'sessions':
            showActiveSessions(testManager);
            break;
        case 'users':
            showActiveUsers(testManager);
            break;
        case 'tests':
            showLoadedTests(testLoader);
            break;
        case 'clear':
            console.clear();
            console.log('\x1b[32m🔄 Консоль очищена\n\x1b[0m');
            break;
        case 'help':
            console.log(`
\x1b[36m📋 Доступные команды:\x1b[0m
• stats    - Общая статистика
• sessions - Активные тестовые сессии (ID, ученик, вопрос)
• users    - Авторизованные ученики (ID, ФИО, класс)
• tests    - Загруженные тесты в кэше
• clear    - Очистить консоль
• help     - Эта справка
• exit     - Выйти из консоли (бот продолжит работу)
            `);
            break;
        case 'exit':
            console.log('\x1b[32m👋 Выход из консоли администратора. Бот продолжает работу.\x1b[0m');
            rl.close();
            break;
        default:
            console.log('\x1b[31m❌ Неизвестная команда. Введите "help" для списка команд.\x1b[0m');
    }
}

function showStatistics(testManager, testLoader) {
    const now = new Date();
    const uptime = global.startTime ? Date.now() - global.startTime : 0;
    
    console.log(`
\x1b[36m📊 *СТАТИСТИКА СИСТЕМЫ*\x1b[0m
\x1b[33m──────────────────────\x1b[0m
\x1b[32m👥 Пользователи:\x1b[0m
• Активные сессии: ${testManager.userSessions.size}
• Авторизованные ученики: ${testManager.userStudents.size}
• Активные цепочки сообщений: ${testManager.userMessageChains.size}

\x1b[32m📚 Тесты:\x1b[0m
• Загружено тестов: ${testLoader.cache.size}
• Доступно тестов: ${testLoader.getAvailableTests().length}
• Время работы бота: ${formatUptime(uptime)}

\x1b[32m⚙️ Система:\x1b[0m
• Память: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB
• Время: ${now.toLocaleTimeString('ru-RU')}
• Дата: ${now.toLocaleDateString('ru-RU')}
\x1b[33m──────────────────────\x1b[0m
    `);
}

function showActiveSessions(testManager) {
    const sessions = testManager.userSessions;
    
    if (sessions.size === 0) {
        console.log('\x1b[33m📭 Нет активных тестовых сессий\x1b[0m');
        return;
    }
    
    console.log(`
\x1b[36m🎯 АКТИВНЫЕ ТЕСТОВЫЕ СЕССИИ (${sessions.size})\x1b[0m
\x1b[33m──────────────────────────────────────\x1b[0m
${Array.from(sessions.entries()).map(([userId, session]) => {
    const progress = session.currentQuestionIndex + 1;
    const total = session.allQuestions.length;
    const percentage = Math.round((progress / total) * 100);
    const timeElapsed = Math.floor((Date.now() - session.startTime) / 1000 / 60);
    
    return `\x1b[32m👤 ID:\x1b[0m ${userId}
\x1b[32m📝 Тест:\x1b[0m ${session.testTitle}
\x1b[32m🎓 Ученик:\x1b[0m ${session.student.lastName} ${session.student.firstName} (${session.student.class} класс)
\x1b[32m📊 Прогресс:\x1b[0m ${progress}/${total} вопросов (${percentage}%)
\x1b[32m⏱️ Время:\x1b[0m ${timeElapsed} мин
\x1b[33m──────────────────────────────────────\x1b[0m`;
}).join('\n')}
    `);
}

function showActiveUsers(testManager) {
    const users = testManager.userStudents;
    
    if (users.size === 0) {
        console.log('\x1b[33m📭 Нет авторизованных пользователей\x1b[0m');
        return;
    }
    
    console.log(`
\x1b[36m👥 АВТОРИЗОВАННЫЕ УЧЕНИКИ (${users.size})\x1b[0m
\x1b[33m──────────────────────────────────────\x1b[0m
${Array.from(users.entries()).map(([userId, student]) => {
    const session = testManager.getSession(userId);
    const status = session ? '\x1b[31m📝 В процессе теста\x1b[0m' : '\x1b[32m✅ Ожидает\x1b[0m';
    
    return `\x1b[32m🆔 User ID:\x1b[0m ${userId}
\x1b[32m👤 Ученик:\x1b[0m ${student.lastName} ${student.firstName}
\x1b[32m🏫 Класс:\x1b[0m ${student.class}
\x1b[32m📋 Статус:\x1b[0m ${status}
\x1b[33m──────────────────────────────────────\x1b[0m`;
}).join('\n')}
    `);
}

function showLoadedTests(testLoader) {
    const tests = testLoader.cache;
    
    if (tests.size === 0) {
        console.log('\x1b[33m📭 Нет загруженных тестов\x1b[0m');
        return;
    }
    
    console.log(`
\x1b[36m📚 ЗАГРУЖЕННЫЕ ТЕСТЫ (${tests.size})\x1b[0m
\x1b[33m──────────────────────────────────────\x1b[0m
${Array.from(tests.entries()).map(([name, data]) => {
    const questions = data.questionsBank?.length || 0;
    const problems = data.problemsBank?.length || 0;
    
    return `\x1b[32m🎯 ${data.TEST_CONFIG?.title || 'Без названия'}\x1b[0m
\x1b[32m🔤 Код:\x1b[0m ${name}
\x1b[32m📖 Вопросов:\x1b[0m ${questions}
\x1b[32m📐 Задач:\x1b[0m ${problems}
\x1b[32m🎯 Макс. балл:\x1b[0m ${data.TEST_CONFIG?.maxScore || 'N/A'}
\x1b[33m──────────────────────────────────────\x1b[0m`;
}).join('\n')}
    `);
}

function formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}д ${hours % 24}ч ${minutes % 60}мин`;
    if (hours > 0) return `${hours}ч ${minutes % 60}мин`;
    if (minutes > 0) return `${minutes}мин ${seconds % 60}сек`;
    return `${seconds}сек`;
}

// Экспорт
module.exports = {
    CONFIG,
    TestLoader,
    TestManager,
    FirebaseService,
    initializeFirebase,
    setupAdminConsole,
    formatUptime
};