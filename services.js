const fetch = require('node-fetch');
const admin = require('firebase-admin');

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
    RESULTS_CHAT_ID: process.env.RESULTS_CHAT_ID
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
        console.log('✅ Firebase Admin подключен');
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
            console.log(`📥 Загружаю тест: ${testName}`);
            const response = await fetch(`${this.baseUrl}${testName}.js`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: Тест "${testName}" не найден`);
            }
            
            const jsCode = await response.text();
            const testData = this.parseTestData(jsCode, testName);
            
            this.cache.set(testName, testData);
            console.log(`✅ Тест загружен: ${testData.TEST_CONFIG.title}`);
            return testData;
        } catch (error) {
            console.error(`❌ Ошибка загрузки теста "${testName}":`, error.message);
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
            { name: 'test', title: 'Основной тест' }
        ];
    }
}

// ==================== МЕНЕДЖЕР ТЕСТОВ ====================
class TestManager {
    constructor() {
        this.userSessions = new Map();
        this.userLastMessages = new Map(); // Храним последнее сообщение пользователя
    }

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
            lastBotMessageId: null // ID последнего сообщения бота для удаления
        };
        
        this.userSessions.set(userId, session);
        console.log(`✅ Создана сессия теста для ${student.lastName} ${student.firstName} (${student.class} класс)`);
        return session;
    }

    getSession(userId) {
        return this.userSessions.get(userId);
    }

    deleteSession(userId) {
        this.userLastMessages.delete(userId);
        return this.userSessions.delete(userId);
    }

    // Обновляем последнее сообщение пользователя
    updateUserLastMessage(userId, messageId) {
        this.userLastMessages.set(userId, messageId);
    }

    // Удаляем последнее сообщение пользователя
    async deleteUserLastMessage(userId, ctx) {
        const lastMessageId = this.userLastMessages.get(userId);
        if (lastMessageId) {
            try {
                await ctx.telegram.deleteMessage(ctx.chat.id, lastMessageId);
                this.userLastMessages.delete(userId);
                return true;
            } catch (error) {
                // Сообщение уже удалено или недоступно
                return false;
            }
        }
        return false;
    }

    // Удаляем предыдущее сообщение бота перед отправкой нового
    async cleanupPreviousBotMessage(userId, ctx) {
        const session = this.userSessions.get(userId);
        if (session && session.lastBotMessageId) {
            try {
                await ctx.telegram.deleteMessage(ctx.chat.id, session.lastBotMessageId);
                session.lastBotMessageId = null;
                return true;
            } catch (error) {
                // Сообщение уже удалено или недоступно
                return false;
            }
        }
        return false;
    }

    // Обновляем последнее сообщение бота
    updateBotLastMessage(userId, messageId) {
        const session = this.userSessions.get(userId);
        if (session) {
            session.lastBotMessageId = messageId;
        }
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
            
            console.log(`✅ Тест завершен: ${session.score}/${session.maxScore}, оценка ${session.grade}`);
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
                console.log('⚠️ Telegram не настроен для этого теста');
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
                console.log('✅ Результаты отправлены в Telegram');
                return true;
            } else {
                console.error('❌ Ошибка Telegram API:', data.description);
                return false;
            }
        } catch (error) {
            console.error('❌ Ошибка отправки в Telegram:', error.message);
            return false;
        }
    }
}

// ==================== FIREBASE СЕРВИС ====================
class FirebaseService {
    static async saveTestResult(userId, session, result) {
        if (!initializeFirebase() || !db) {
            console.log('⚠️ Firebase не подключен, результат не сохранен');
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
            console.log(`✅ Результат сохранен в Firebase для userId: ${userId}`);
            return true;
        } catch (error) {
            console.error('❌ Ошибка сохранения в Firebase:', error.message);
            return false;
        }
    }

    static async getUserResults(userId) {
        if (!initializeFirebase() || !db) {
            console.log('⚠️ Firebase не подключен');
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
            console.error('❌ Ошибка получения результатов:', error.message);
            return [];
        }
    }
}

// Экспорт
module.exports = {
    CONFIG,
    TestLoader,
    TestManager,
    FirebaseService,
    initializeFirebase
};