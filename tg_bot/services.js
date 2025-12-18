const fetch = require('node-fetch');
const admin = require('firebase-admin');

// ==================== ВСТРОЕННАЯ КОНФИГУРАЦИЯ ====================
const CONFIG = {
    // Telegram бот токен
    BOT_TOKEN: '8344281396:AAGZ9-M2XRyPMHiI2akBSSIN7QAtRGDmLOY',
    
    // Firebase Admin ключ (ВАШ КЛЮЧ)
    FIREBASE_ADMIN_KEY: {
        "type": "service_account",
        "project_id": "school-test-mrzo25",
        "private_key_id": "c3bb26969994c2d6e062fe7ab1abcff0ce2ea7b0",
        "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQCvcemMis8JwS43\n5lQEtsRcCCoIiu9ecd+sUukflST8EKn/7nr+hF5s9onQIV6QTpmwXbh0389KARG4\nw8uapBxSSGPm9fvqHb52JxxSASPqKc4ffKKOxbbXzJbyE0Jd+dHhyBRkmFB2eLyp\nxVlkdmPNMikcCR9QwfQDV4cLJwJjv66wz2XFovw7tunntwyFWwrBJI9hIBhWjoWD\nQBxbd/mCXx+yHqmd3lNz/Bsq58qpCiNHyCtTxKsBMr4Wn39OxCZD8DRrGMlWK1fv\niRloIH+BPmpruuEUcVrPEB9LYM+o6VZwwFXXvG77tnzn8c5RRQ4SBtInb2SSEDev\n578K48hjAgMBAAECggEACi3vUZa6NYQuZNLp3A4orXhRzAYXpmCwDCURXqI+L5vd\n6ToSi9LtUaAqVdehz3ioBSoi6jEUK2SNfS1rElFkTUfi+AMctzQ7mUpio8VqKot7\naKtIGUWSesnlli0U5DP7AAEmYcHOpVkTBTysl54g40Z+SSCkXwCp4knBTZ3ZTyU2\ntTubIpL//rfroKyb+Lspx4U0qD5m04xtLVqWPrllwakbUEIwETenP74+RMu+gk5X\nFXzKIV7GRaaVKVPjkB7nCptdL8zHeARDBSdYoi2DA4lL/XPuQox7KnutWjgiqMrU\ng7D4LI0nKeq20SNam9uqlHu6u1ggESgvtexuz5ki7QKBgQDxk2TJ30vtfrFYNOmm\nL/eO0hzWPsonN56P3Oo2kIWZsWtG2lbzMVhUFlZjf9ytWpP+RGgXh7mPvIZ6JzxP\nVK4vBISuT9iagcwIsC4s4tgwQiWSfWDo0FrWj1fx4F9xVjUefXlb5vatbmnhH7mY\nRQowS2HJZc/ptjsDqh9yFuzcdQKBgQC5660q849nOKJx2QbIozTLS+ehm5Ue8DKH\nJugnE4M5M7FMg8sOjr4uiIiIGduqArLHAbNiDPNDolSfO4+yLl2FO9MVDuYnCKJL\namr+uu4VEz+E+I5vQ0OKv4LeJprXi4a4b9yUYXN4s9m84cHwjhRlDcB0TTqrApgu\nzC1N/pJWdwKBgDLUztpjb/iTNgHXcGqVoUOeFo9GOwcxft3KoEXG9zW1zVrlSnJ1\nqZ5X7OmW1/pqGsXf4v9Agd0q0CkX5GrU6KngC4MaLfuk4Cfb2nt7Z/4PjRRb6W5T\nmSmYk+rDSZHxj8/Qmx6pZLJtjz3djRHrRQ+QbQ0RrUQCIjzNKTy6cjCZAoGBAJD3\nqC3ufemxalC1NanqQDcod3M2mh7mka96cdhOSaqnmN6dgQ5X1Qj5ouPkrbgxpG6x\n78pLaL9a6vrB+Xio2HkTvbIUzPawr8N4NfdrkErUmFm5aW5uF1Mvov5PQbtB6wkT\nB/6Wwe/i5Kt3qL5GOrbU8zR8J3vCaSFMSSMglcBfAoGBAM2pAtwYeijrAtGg0Nz/\nAdV7MBfy53M4AFWZKnDmjlO3XMNW35Qn56tnQg8kCpS3epimyHTB7dpznyLc4vgc\nOjtwoUgTu9Z0aoqL7JBDkjyK97PoaXi5ia0xmSEC91Y7nfhzwhaNObzbEArma8TV\npd4bbX4FrorC0pOAci878eHW\n-----END PRIVATE KEY-----\n",
        "client_email": "firebase-adminsdk-fbsvc@school-test-mrzo25.iam.gserviceaccount.com",
        "client_id": "109420656094756851306",
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
        "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
        "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-fbsvc%40school-test-mrzo25.iam.gserviceaccount.com",
        "universe_domain": "googleapis.com"
    },
    
    TESTS_BASE_URL: 'https://garickbox.github.io/test/test/',
    MAIN_WEBSITE: 'https://garickbox.github.io/test/'
};

// ==================== FIREBASE ====================
let db = null;
try {
    admin.initializeApp({
        credential: admin.credential.cert(CONFIG.FIREBASE_ADMIN_KEY),
        databaseURL: `https://${CONFIG.FIREBASE_ADMIN_KEY.project_id}.firebaseio.com`
    });
    db = admin.firestore();
    console.log('✅ Firebase Admin подключен');
} catch (error) {
    console.error('❌ Ошибка Firebase:', error.message);
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
            
            if (!response.ok) throw new Error(`Тест ${testName} не найден`);
            
            const jsCode = await response.text();
            const testData = this.parseTestData(jsCode, testName);
            
            this.cache.set(testName, testData);
            console.log(`✅ Тест загружен: ${testData.TEST_CONFIG.title}`);
            return testData;
        } catch (error) {
            throw new Error(`Не удалось загрузить тест "${testName}": ${error.message}`);
        }
    }

    parseTestData(jsCode, testName) {
        const configMatch = jsCode.match(/window\.TEST_CONFIG\s*=\s*({[\s\S]*?});/);
        const questionsMatch = jsCode.match(/window\.questionsBank\s*=\s*(\[[\s\S]*?\]);/);
        const problemsMatch = jsCode.match(/window\.problemsBank\s*=\s*(\[[\s\S]*?\]);/);

        if (!configMatch || !questionsMatch || !problemsMatch) {
            throw new Error('Неверный формат тестового файла');
        }

        const safeEval = (str) => Function(`"use strict"; return (${str})`)();
        
        return {
            name: testName,
            TEST_CONFIG: safeEval(configMatch[1]),
            questionsBank: safeEval(questionsMatch[1]),
            problemsBank: safeEval(problemsMatch[1])
        };
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
            telegramConfig: testData.TEST_CONFIG.telegram
        };
        
        this.userSessions.set(userId, session);
        console.log(`✅ Создана сессия теста для ${student.lastName} ${student.firstName}`);
        return session;
    }

    getSession(userId) {
        return this.userSessions.get(userId);
    }

    deleteSession(userId) {
        return this.userSessions.delete(userId);
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
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    async sendResultsToTelegram(session) {
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
        
        try {
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
        if (!db) {
            console.log('⚠️ Firebase не подключен, результат не сохранен');
            return false;
        }
        
        try {
            await db.collection('telegram_results').add({
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
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                completedAt: new Date().toISOString()
            });
            console.log(`✅ Результат сохранен в Firebase для userId: ${userId}`);
            return true;
        } catch (error) {
            console.error('❌ Ошибка сохранения в Firebase:', error.message);
            return false;
        }
    }

    static async getUserResults(userId) {
        if (!db) {
            console.log('⚠️ Firebase не подключен');
            return [];
        }
        
        try {
            const snapshot = await db.collection('telegram_results')
                .where('userId', '==', userId.toString())
                .orderBy('timestamp', 'desc')
                .limit(10)
                .get();
            
            return snapshot.docs.map(doc => doc.data());
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
    FirebaseService
};