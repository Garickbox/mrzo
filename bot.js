const { Telegraf, Markup } = require('telegraf');
require('dotenv').config();

const { 
    CONFIG, 
    TestLoader, 
    TestManager, 
    FirebaseService, 
    initializeFirebase, 
    setupAdminConsole,
    formatUptime 
} = require('./services');
const STUDENTS_DB = require('./students');

// Используем токен из .env или из CONFIG
const botToken = process.env.BOT_TOKEN || CONFIG.BOT_TOKEN;

if (!botToken) {
    console.error('❌ Ошибка: BOT_TOKEN не найден!');
    console.error('💡 Создайте файл .env с BOT_TOKEN=ваш_токен');
    process.exit(1);
}

const bot = new Telegraf(botToken);
const testLoader = new TestLoader();
const testManager = new TestManager();

// Глобальные переменные для доступа из админ-консоли
global.testManagerInstance = testManager;
global.testLoaderInstance = testLoader;
global.startTime = Date.now();

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================
function formatDuration(minutes) {
    if (minutes < 1) return 'менее минуты';
    if (minutes === 1) return '1 минута';
    if (minutes < 5) return `${minutes} минуты`;
    return `${minutes} минут`;
}

function escapeMarkdown(text) {
    return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

function formatQuestionText(text) {
    return text
        .replace(/{([^}]+)}/g, '`$1`')  // Множества в моноширинный
        .replace(/∅/g, '∅')           // Пустое множество
        .replace(/∈/g, '∈')           // Принадлежность
        .replace(/⊆/g, '⊆')           // Подмножество
        .replace(/∩/g, '∩')           // Пересечение
        .replace(/∪/g, '∪')           // Объединение
        .replace(/\n/g, '\n\n');      // Двойной отступ
}

// Проверка на админа
function isAdmin(userId) {
    return userId.toString() === CONFIG.ADMIN_TELEGRAM_ID;
}

// Функция для отправки сообщения с автоматическим удалением предыдущего активного
async function sendMessageWithCleanup(ctx, userId, text, options = {}, addToChain = true) {
    // Удаляем предыдущее активное сообщение
    await testManager.deleteActiveMessage(userId, ctx);
    
    // Отправляем новое сообщение
    const message = await ctx.reply(text, options);
    
    // Сохраняем как активное
    testManager.setActiveMessage(userId, message.message_id);
    
    // Добавляем в цепочку если нужно
    if (addToChain) {
        testManager.addToMessageChain(userId, message.message_id);
    }
    
    return message;
}

// Функция для отправки временного сообщения (удаляется через 3 секунды)
async function sendTempMessage(ctx, userId, text, options = {}) {
    const message = await ctx.reply(text, options);
    
    // Удаляем через 3 секунды
    setTimeout(async () => {
        try {
            await ctx.telegram.deleteMessage(ctx.chat.id, message.message_id);
        } catch (error) {
            // Игнорируем ошибки удаления
        }
    }, CONFIG.MESSAGE_TIMING.TEMP_MESSAGE);
    
    return message;
}

// Удаляем сообщение пользователя
async function deleteUserMessage(ctx, userId) {
    try {
        await ctx.deleteMessage();
        // Добавляем в цепочку для последующей очистки
        testManager.addToMessageChain(userId, ctx.message.message_id);
    } catch (error) {
        // Игнорируем ошибки удаления
    }
}

// ==================== КОМАНДЫ ====================
bot.start(async (ctx) => {
    const userId = ctx.from.id;
    
    // Удаляем сообщение пользователя
    await deleteUserMessage(ctx, userId);
    
    // Проверяем, есть ли сохраненный ученик
    const savedStudent = testManager.getStudent(userId);
    
    if (savedStudent) {
        // Пользователь уже авторизован - показываем меню
        await showMainMenu(ctx, userId, savedStudent);
    } else {
        // Пользователь не авторизован - начинаем новую цепочку
        testManager.startMessageChain(userId, ctx.message.message_id);
        await requestStudentAuth(ctx, userId);
    }
});

bot.command('help', async (ctx) => {
    const userId = ctx.from.id;
    
    // Удаляем сообщение пользователя
    await deleteUserMessage(ctx, userId);
    
    await sendMessageWithCleanup(ctx, userId, `🆘 *Помощь и поддержка*

📞 *Контакты разработчика:* @garickbox
🌐 *Официальный сайт:* ${CONFIG.MAIN_WEBSITE}

*Основные команды:*
/start - Главное меню
/help - Эта справка
/cancel - Отменить текущий тест
${isAdmin(userId) ? '/admin - Панель администратора\n' : ''}

*Процесс тестирования:*
1. Выберите "Начать тест"
2. Пришлите код теста (например: ttii7)
3. Пройдите вопросы теста (используйте кнопки под сообщением)
4. Получите результат

*Если возникли проблемы:*
- Проверьте правильность ввода кода теста
- Убедитесь в стабильности интернет-соединения
- Используйте кнопки для ответов, не пишите текст
- При необходимости свяжитесь с разработчиком`, {
        parse_mode: 'Markdown',
        ...Markup.removeKeyboard()
    });
});

bot.command('cancel', async (ctx) => {
    const userId = ctx.from.id;
    
    // Удаляем сообщение пользователя
    await deleteUserMessage(ctx, userId);
    
    const session = testManager.getSession(userId);
    
    if (session) {
        // Очищаем цепочку сообщений теста
        await testManager.cleanupMessageChain(userId, ctx);
        // Удаляем текущий вопрос если есть
        await testManager.deleteCurrentQuestionMessage(userId, ctx);
        // Удаляем активное сообщение
        await testManager.deleteActiveMessage(userId, ctx);
        // Удаляем сессию
        testManager.deleteSession(userId);
        
        await sendTempMessage(ctx, userId, '✅ *Тест отменен.*\n\nВсе сообщения теста удалены.', {
            parse_mode: 'Markdown'
        });
        
        // Показываем главное меню
        const savedStudent = testManager.getStudent(userId);
        if (savedStudent) {
            await showMainMenu(ctx, userId, savedStudent);
        } else {
            await requestStudentAuth(ctx, userId);
        }
    } else {
        await sendTempMessage(ctx, userId, '❌ *Нет активного теста для отмены.*', {
            parse_mode: 'Markdown'
        });
    }
});

// Команда админа
bot.command('admin', async (ctx) => {
    const userId = ctx.from.id;
    
    if (!isAdmin(userId)) {
        await ctx.reply('⛔ У вас нет прав администратора');
        return;
    }
    
    await deleteUserMessage(ctx, userId);
    
    const adminMenu = `
🔧 *Панель администратора*

📊 *Статистика:*
• Активных сессий: ${testManager.userSessions.size}
• Авторизованных учеников: ${testManager.userStudents.size}
• Загруженных тестов: ${testLoader.cache.size}

🛠️ *Действия:*
Нажмите кнопку ниже для просмотра статистики.`;

    await sendMessageWithCleanup(ctx, userId, adminMenu, {
        parse_mode: 'Markdown',
        ...Markup.keyboard([
            ['📊 Статистика', '👥 Пользователи'],
            ['📚 Тесты', '🔙 Главное меню']
        ]).resize()
    });
});

// ==================== ОБРАБОТКА ТЕКСТА ====================
bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const text = ctx.message.text.trim();
    
    // Проверяем разные состояния
    const savedStudent = testManager.getStudent(userId);
    const session = testManager.getSession(userId);
    
    // Если есть активный тест
    if (session) {
        // Удаляем сообщение пользователя
        await deleteUserMessage(ctx, userId);
        
        // Отправляем временное напоминание об использовании кнопок
        await sendTempMessage(ctx, userId, '⚠️ *Используйте кнопки для ответа!*\n\nДля отмены теста используйте /cancel', {
            parse_mode: 'Markdown'
        });
        return;
    }
    
    // Обработка админских команд
    if (isAdmin(userId)) {
        if (text === '📊 Статистика') {
            await deleteUserMessage(ctx, userId);
            await showAdminStats(ctx, userId);
            return;
        }
        if (text === '👥 Пользователи') {
            await deleteUserMessage(ctx, userId);
            await showAdminUsers(ctx, userId);
            return;
        }
        if (text === '📚 Тесты') {
            await deleteUserMessage(ctx, userId);
            await showAdminTests(ctx, userId);
            return;
        }
        if (text === '🔙 Главное меню') {
            await deleteUserMessage(ctx, userId);
            if (savedStudent) {
                await showMainMenu(ctx, userId, savedStudent);
            } else {
                await requestStudentAuth(ctx, userId);
            }
            return;
        }
    }
    
    // Обработка кнопок меню
    if (text === '🚀 Начать тест') {
        await deleteUserMessage(ctx, userId);
        
        if (!savedStudent) {
            await sendMessageWithCleanup(ctx, userId, '❌ *Сначала нужно авторизоваться!*\n\nНажмите /start для начала.', {
                parse_mode: 'Markdown'
            });
            return;
        }
        
        await requestTestCode(ctx, userId);
        return;
    }
    
    if (text === '📋 Показать тесты') {
        await deleteUserMessage(ctx, userId);
        
        const tests = testLoader.getAvailableTests();
        let message = '📋 *Доступные тесты:*\n\n';
        tests.forEach(test => {
            message += `🎯 *${test.name}*\n📝 ${test.title}\n\n`;
        });
        message += 'Для начала теста введите его код или нажмите "Начать тест"';
        
        await sendMessageWithCleanup(ctx, userId, message, {
            parse_mode: 'Markdown'
        });
        return;
    }
    
    if (text === '📊 Мои результаты') {
        await deleteUserMessage(ctx, userId);
        
        if (!savedStudent) {
            await sendMessageWithCleanup(ctx, userId, '❌ *Сначала нужно авторизоваться!*', {
                parse_mode: 'Markdown'
            });
            return;
        }
        
        await sendMessageWithCleanup(ctx, userId, '📊 *Ваши результаты*\n\nФункция просмотра результатов находится в разработке. Скоро появится!', {
            parse_mode: 'Markdown'
        });
        return;
    }
    
    if (text === '🆘 Помощь') {
        await deleteUserMessage(ctx, userId);
        await sendMessageWithCleanup(ctx, userId, `📞 *Контакты поддержки:* @garickbox\n🌐 *Сайт:* ${CONFIG.MAIN_WEBSITE}\n\nДля отмены теста: /cancel`, {
            parse_mode: 'Markdown'
        });
        return;
    }
    
    if (text === '👤 Сменить пользователя') {
        await deleteUserMessage(ctx, userId);
        
        // Удаляем сохраненного ученика
        testManager.removeStudent(userId);
        // Очищаем цепочку
        await testManager.cleanupMessageChain(userId, ctx);
        // Удаляем активное сообщение
        await testManager.deleteActiveMessage(userId, ctx);
        
        // Начинаем новую цепочку авторизации
        testManager.startMessageChain(userId, ctx.message.message_id);
        await requestStudentAuth(ctx, userId);
        return;
    }
    
    // Проверяем, может быть это код теста (не чувствительно к регистру)
    const lowerText = text.toLowerCase();
    if (lowerText.startsWith('ttii') || lowerText === 'test' || lowerText === 'teststat89') {
        await deleteUserMessage(ctx, userId);
        await processTestCode(ctx, userId, text, savedStudent);
        return;
    }
    
    // Обработка авторизации (если пользователь еще не авторизован)
    if (!savedStudent) {
        await processStudentAuth(ctx, userId, text);
        return;
    }
    
    // Если ничего не подошло - показываем меню
    await deleteUserMessage(ctx, userId);
    await showMainMenu(ctx, userId, savedStudent);
});

// ==================== INLINE КНОПКИ (для теста) ====================
bot.action(/answer:(\d+)/, async (ctx) => {
    const answerIndex = parseInt(ctx.match[1]);
    const userId = ctx.from.id;
    
    // Показываем индикатор загрузки
    await ctx.answerCbQuery('⏳ Проверяем ответ...');
    
    const result = testManager.answerQuestion(userId, answerIndex);
    if (!result) {
        await ctx.answerCbQuery('❌ Сессия теста не найдена');
        return;
    }
    
    const { session, isCorrect, isCompleted } = result;
    
    // Удаляем текущий вопрос
    await testManager.deleteCurrentQuestionMessage(userId, ctx);
    
    // Анимированный ответ
    const answerEmoji = isCorrect ? '🎯' : '💥';
    const message = isCorrect ? `
✅ *ПРАВИЛЬНО!* ${answerEmoji}

🎉 Отличная работа! Продолжайте в том же духе!
    ` : `
❌ *НЕПРАВИЛЬНО* ${answerEmoji}

💡 Не расстраивайтесь! Следующий вопрос будет лучше!
    `;
    
    // Отправляем красивый результат
    const resultMessage = await ctx.reply(message, {
        parse_mode: 'Markdown'
    });
    
    testManager.addToMessageChain(userId, resultMessage.message_id);
    
    // Удаляем через 2.5 секунды
    setTimeout(async () => {
        try {
            await ctx.telegram.deleteMessage(ctx.chat.id, resultMessage.message_id);
        } catch (error) {
            // Игнорируем
        }
        
        if (isCompleted) {
            // Небольшая задержка перед финалом
            setTimeout(() => finishTest(ctx, session), 1000);
        } else {
            // Показываем следующий вопрос с анимацией
            const loadingMessage = await ctx.reply('🌀 *Загружаем следующий вопрос...*', {
                parse_mode: 'Markdown'
            });
            
            setTimeout(async () => {
                try {
                    await ctx.telegram.deleteMessage(ctx.chat.id, loadingMessage.message_id);
                } catch (error) {
                    // Игнорируем
                }
                await showQuestion(ctx, session);
            }, CONFIG.MESSAGE_TIMING.QUESTION_TRANSITION);
        }
    }, CONFIG.MESSAGE_TIMING.ANSWER_FEEDBACK - 1500);
});

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================
async function showMainMenu(ctx, userId, student) {
    const welcomeMessage = `
🎓 *Добро пожаловать в школьную систему тестирования!*

👤 *Ученик:* ${escapeMarkdown(student.firstName)} ${escapeMarkdown(student.lastName)}
🏫 *Класс:* ${student.class} | 🆔 ID: ${student.id}
📅 *Сегодня:* ${new Date().toLocaleDateString('ru-RU')}

👇 *Выберите действие:*`;
    
    const keyboard = Markup.keyboard([
        ['📝 Начать тест', '📋 Список тестов'],
        ['📊 Мои результаты', '🆘 Помощь'],
        ['👤 Сменить профиль']
    ]).resize();
    
    await sendMessageWithCleanup(ctx, userId, welcomeMessage, {
        parse_mode: 'Markdown',
        ...keyboard
    });
}

async function requestStudentAuth(ctx, userId) {
    await sendMessageWithCleanup(ctx, userId, '👤 *Авторизация ученика*\n\nВведите ваши данные в формате:\n`Фамилия Имя Класс`\n\n*Пример:*\n`Иванов Иван 7`\n\n_Класс указывать обязательно (7-11)_', {
        parse_mode: 'Markdown',
        ...Markup.removeKeyboard()
    });
}

async function processStudentAuth(ctx, userId, text) {
    const parts = text.trim().split(/\s+/);
    
    if (parts.length >= 3) {
        const lastName = parts[0];
        const firstName = parts[1];
        const className = parts[2];
        
        // Валидация класса
        if (!['7','8','9','10','11'].includes(className)) {
            await sendMessageWithCleanup(ctx, userId, '❌ *Класс должен быть числом от 7 до 11*\n\nПопробуйте еще раз:', {
                parse_mode: 'Markdown'
            });
            return;
        }
        
        const results = STUDENTS_DB.searchStudents(lastName, firstName, className);
        
        if (results.length > 0) {
            // Берем лучший результат
            const bestMatch = results[0];
            const student = bestMatch.student;
            
            // Сохраняем ученика
            testManager.saveStudent(userId, student);
            
            // Удаляем сообщение пользователя с ФИО
            await deleteUserMessage(ctx, userId);
            
            // Показываем главное меню
            await showMainMenu(ctx, userId, student);
        } else {
            await sendMessageWithCleanup(ctx, userId, '❌ *Ученик не найден*\n\nПроверьте:\n1. Правильность Фамилии и Имени\n2. Правильность класса (7-11)\n3. Попробуйте еще раз\n\nПример: `Иванов Иван 7`', {
                parse_mode: 'Markdown'
            });
        }
    } else {
        await sendMessageWithCleanup(ctx, userId, '❌ *Неверный формат*\n\nВведите: `Фамилия Имя Класс`\n\nПример: `Иванов Иван 7`', {
            parse_mode: 'Markdown'
        });
    }
}

async function requestTestCode(ctx, userId) {
    const tests = testLoader.getAvailableTests();
    
    let testCards = '';
    tests.forEach((test, index) => {
        const emoji = ['❶', '❷', '❸', '❹', '❺'][index] || '•';
        testCards += `
${emoji} *${test.name.toUpperCase()}*
   📝 ${test.title}
   🔤 *Код:* \`${test.name}\`
   ────────────
`;
    });
    
    const message = `
📚 *ВЫБОР ТЕСТА*

Доступные тесты:
${testCards}

📝 *Введите код теста* (например: \`ttii7\`)
_Или выберите из списка выше_`;
    
    await sendMessageWithCleanup(ctx, userId, message, {
        parse_mode: 'Markdown',
        ...Markup.removeKeyboard()
    });
}

async function processTestCode(ctx, userId, testCode, student) {
    // Удаляем сообщение пользователя с кодом теста
    await deleteUserMessage(ctx, userId);
    
    try {
        // Нормализуем код теста: удаляем пробелы, приводим к нижнему регистру
        const normalizedCode = testCode.trim().toLowerCase();
        
        TestManager.logEvent('info', `Поиск теста: введен "${testCode}", нормализован "${normalizedCode}"`);
        
        // Проверка минимальной длины кода
        if (normalizedCode.length < 4) {
            await sendMessageWithCleanup(ctx, userId, `❌ *Код теста слишком короткий*\n\nКод теста должен содержать минимум 4 символа.\nПроверьте правильность ввода.`, {
                parse_mode: 'Markdown'
            });
            return;
        }
        
        // Проверка на наличие посторонних символов
        const validCodePattern = /^[a-z0-9]+$/;
        if (!validCodePattern.test(normalizedCode)) {
            await sendMessageWithCleanup(ctx, userId, `❌ *Недопустимые символы в коде теста*\n\nКод теста должен содержать только буквы и цифры.\nПроверьте правильность ввода.`, {
                parse_mode: 'Markdown'
            });
            return;
        }
        
        // Проверяем существование теста
        const tests = testLoader.getAvailableTests();
        const testExists = tests.some(test => test.name === normalizedCode);
        
        if (!testExists) {
            // Проверяем похожие коды
            const similarTests = testLoader.getSimilarTests(normalizedCode);
            
            let errorMessage = `❌ *Тест "${testCode}" не найден*\n\n`;
            
            if (similarTests.length > 0) {
                errorMessage += `*Возможно, вы имели в виду:*\n`;
                similarTests.forEach(test => {
                    errorMessage += `• \`${test.name}\` - ${test.title}\n`;
                });
                errorMessage += `\nПроверьте правильность написания кода.`;
            } else {
                errorMessage += `*Доступные тесты:*\n`;
                tests.forEach(test => {
                    errorMessage += `• \`${test.name}\` - ${test.title}\n`;
                });
                errorMessage += `\nВведите код теста точно как указано выше.`;
            }
            
            await sendMessageWithCleanup(ctx, userId, errorMessage, {
                parse_mode: 'Markdown'
            });
            return;
        }
        
        // Загружаем тест
        const testData = await testLoader.loadTest(normalizedCode);
        
        // Создаем сессию теста
        const session = testManager.createTestSession(userId, testData, student);
        
        // Начинаем новую цепочку сообщений для теста
        testManager.startMessageChain(userId, ctx.message.message_id);
        
        // Показываем первый вопрос
        await showQuestion(ctx, session);
        
    } catch (error) {
        TestManager.logEvent('error', `Ошибка начала теста: ${error.message}`);
        await sendMessageWithCleanup(ctx, userId, `❌ *Ошибка:* ${error.message}\n\nПроверьте правильность кода теста и попробуйте еще раз.`, {
            parse_mode: 'Markdown'
        });
    }
}

async function showQuestion(ctx, session) {
    try {
        const question = session.allQuestions[session.currentQuestionIndex];
        const questionNumber = session.currentQuestionIndex + 1;
        const totalQuestions = session.allQuestions.length;
        
        // Визуальный прогресс-бар
        const progressPercentage = Math.round((questionNumber / totalQuestions) * 100);
        const progressBarLength = 20;
        const filledBlocks = Math.round((progressPercentage / 100) * progressBarLength);
        const emptyBlocks = progressBarLength - filledBlocks;
        
        const progressBar = '🟩'.repeat(filledBlocks) + '⬜'.repeat(emptyBlocks);
        
        // Индикатор сложности
        const difficultyIcon = question.points === 3 ? '🔴' : '🟢';
        const difficultyText = question.points === 3 ? 'Задача (3 балла)' : 'Вопрос (1 балл)';
        
        // Форматированный текст вопроса
        const formattedText = formatQuestionText(question.text);
        
        const message = `
${difficultyIcon} *${difficultyText}*

📊 *Прогресс:* ${questionNumber}/${totalQuestions}
${progressBar} ${progressPercentage}%

─────────────
📝 *Вопрос ${questionNumber}:*

${formattedText}

─────────────
*Выберите правильный ответ:*`;
        
        // Кнопки с буквами и цветами
        const buttons = question.options.map((option, index) => {
            const letter = String.fromCharCode(65 + index); // A, B, C, D
            const emoji = ['🅰️', '🅱️', '🆎', '🅾️', '🆑', '🆒', '🆓', '🆔'][index] || '🔘';
            return [
                Markup.button.callback(`${emoji} ${letter}. ${option.t}`, `answer:${index}`)
            ];
        });
        
        const questionMessage = await ctx.reply(message, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard(buttons)
        });
        
        testManager.setCurrentQuestionMessageId(session.userId, questionMessage.message_id);
        testManager.addToMessageChain(session.userId, questionMessage.message_id);
        
    } catch (error) {
        console.error('Ошибка показа вопроса:', error);
        await sendMessageWithCleanup(ctx, session.userId, '❌ Произошла ошибка при загрузке вопроса. Пожалуйста, начните тест заново.');
        testManager.deleteSession(ctx.from.id);
    }
}

async function finishTest(ctx, session) {
    try {
        const result = {
            student: session.student,
            testName: session.testTitle,
            testCode: session.testName,
            score: session.score,
            maxScore: session.maxScore,
            grade: session.grade,
            correctQuestions: session.correctQuestions,
            correctProblems: session.correctProblems,
            answers: session.userAnswers,
            duration: Math.floor((session.endTime - session.startTime) / 1000)
        };
        
        // Сохраняем результат
        await FirebaseService.saveTestResult(ctx.from.id, session, result);
        
        // Отправляем в Telegram (если настроено)
        await testManager.sendResultsToTelegram(session);
        
        // Визуализация результатов
        const percentage = Math.round((session.score / session.maxScore) * 100);
        
        // График результата
        const scoreBarLength = 20;
        const filledScore = Math.round((percentage / 100) * scoreBarLength);
        const scoreBar = '⭐'.repeat(filledScore) + '☆'.repeat(scoreBarLength - filledScore);
        
        // Звезды оценки
        const stars = '⭐'.repeat(session.grade) + '☆'.repeat(5 - session.grade);
        
        // Мотивационное сообщение
        let motivation = '';
        if (percentage >= 90) {
            motivation = '🏆 *Блестящий результат!* Вы настоящий эксперт!';
        } else if (percentage >= 75) {
            motivation = '🎯 *Отличная работа!* Вы хорошо знаете материал!';
        } else if (percentage >= 60) {
            motivation = '👍 *Хорошо!* Есть куда расти!';
        } else {
            motivation = '💪 *Продолжайте учиться!* У вас все получится!';
        }
        
        const durationFormatted = formatDuration(Math.floor(result.duration / 60));
        
        const message = `
🎉 *ТЕСТ ЗАВЕРШЕН!*

${motivation}

📊 *ВАШИ РЕЗУЛЬТАТЫ:*
${scoreBar} ${percentage}%

👤 Ученик: ${escapeMarkdown(session.student.lastName)} ${escapeMarkdown(session.student.firstName)}
🏫 Класс: ${session.student.class}
⏱️ Время: ${durationFormatted}

🎯 Баллы: *${session.score} из ${session.maxScore}*
📈 Оценка: ${stars} (${session.grade}/5)

📖 Вопросы: ✅ ${session.correctQuestions}
📐 Задачи: ✅ ${session.correctProblems}

📅 Результат сохранен: ${new Date().toLocaleDateString('ru-RU', { 
    day: 'numeric', 
    month: 'long',
    hour: '2-digit',
    minute: '2-digit'
})}

_Через 15 секунд вернемся в меню..._`;
        
        // Очищаем ВСЕ сообщения теста (включая активное сообщение)
        await testManager.cleanupMessageChain(ctx.from.id, ctx);
        await testManager.deleteActiveMessage(ctx.from.id, ctx);
        
        // Очищаем сессию
        testManager.deleteSession(ctx.from.id);
        
        // Отправляем результат (НЕ добавляем в цепочку для удаления)
        const finalMessage = await ctx.reply(message, {
            parse_mode: 'Markdown',
            ...Markup.removeKeyboard()
        });
        
        // Сохраняем финальное сообщение как активное
        testManager.setActiveMessage(ctx.from.id, finalMessage.message_id);
        
        // Добавляем разделитель перед возвратом в меню
        setTimeout(async () => {
            const transitionMessage = await ctx.reply("🔄 *Возвращаемся в главное меню...*", {
                parse_mode: 'Markdown'
            });
            
            setTimeout(async () => {
                try {
                    await ctx.telegram.deleteMessage(ctx.chat.id, transitionMessage.message_id);
                } catch (error) {}
                
                const savedStudent = testManager.getStudent(ctx.from.id);
                if (savedStudent) {
                    await showMainMenu(ctx, ctx.from.id, savedStudent);
                }
            }, 1500);
        }, CONFIG.MESSAGE_TIMING.FINAL_RESULT);
        
    } catch (error) {
        console.error('Ошибка завершения теста:', error);
        await sendMessageWithCleanup(ctx, session.userId, '❌ Произошла ошибка при сохранении результатов. Пожалуйста, свяжитесь с администратором.');
    }
}

// ==================== АДМИНИСТРАТИВНЫЕ ФУНКЦИИ ====================
async function showAdminStats(ctx, userId) {
    const sessions = testManager.userSessions;
    let activeSessionsInfo = '📭 Нет активных сессий';
    
    if (sessions.size > 0) {
        activeSessionsInfo = Array.from(sessions.entries())
            .map(([id, session]) => 
                `👤 ${session.student.lastName} ${session.student.firstName} (${session.student.class} класс)\n   📝 ${session.testTitle}\n   📊 ${session.currentQuestionIndex + 1}/${session.allQuestions.length} вопросов`
            )
            .join('\n\n');
    }
    
    const stats = `
📈 *Детальная статистика*

👥 *Пользователи:*
• Активных сессий: ${sessions.size}
• Авторизованных: ${testManager.userStudents.size}

📚 *Тесты:*
• В кэше: ${testLoader.cache.size}
• Доступно: ${testLoader.getAvailableTests().length}

⏱️ *Система:*
• Время работы: ${formatUptime(Date.now() - startTime)}
• Память: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB

🎯 *Активные тесты:*
${activeSessionsInfo}
    `;
    
    await sendMessageWithCleanup(ctx, userId, stats, { parse_mode: 'Markdown' });
}

async function showAdminUsers(ctx, userId) {
    const users = testManager.userStudents;
    
    if (users.size === 0) {
        await sendMessageWithCleanup(ctx, userId, '📭 *Нет авторизованных пользователей*', {
            parse_mode: 'Markdown'
        });
        return;
    }
    
    let usersList = '';
    Array.from(users.entries()).forEach(([id, student]) => {
        const session = testManager.getSession(id);
        const status = session ? '📝 В процессе теста' : '✅ Ожидает';
        usersList += `👤 *${student.lastName} ${student.firstName}*\n🏫 Класс: ${student.class}\n🆔 User ID: ${id}\n📋 Статус: ${status}\n\n`;
    });
    
    await sendMessageWithCleanup(ctx, userId, `👥 *Авторизованные ученики (${users.size})*\n\n${usersList}`, {
        parse_mode: 'Markdown'
    });
}

async function showAdminTests(ctx, userId) {
    const tests = testLoader.cache;
    
    if (tests.size === 0) {
        await sendMessageWithCleanup(ctx, userId, '📭 *Нет загруженных тестов*', {
            parse_mode: 'Markdown'
        });
        return;
    }
    
    let testsList = '';
    Array.from(tests.entries()).forEach(([name, data]) => {
        const questions = data.questionsBank?.length || 0;
        const problems = data.problemsBank?.length || 0;
        testsList += `📚 *${data.TEST_CONFIG?.title || 'Без названия'}*\n🔤 Код: ${name}\n📖 Вопросов: ${questions}\n📐 Задач: ${problems}\n🎯 Макс. балл: ${data.TEST_CONFIG?.maxScore || 'N/A'}\n\n`;
    });
    
    await sendMessageWithCleanup(ctx, userId, `📚 *Загруженные тесты (${tests.size})*\n\n${testsList}`, {
        parse_mode: 'Markdown'
    });
}

// ==================== ОБРАБОТКА ОШИБОК ====================
bot.catch((err, ctx) => {
    console.error(`Ошибка для пользователя ${ctx.from?.id}:`, err);
    
    try {
        ctx.reply('❌ Произошла непредвиденная ошибка. Пожалуйста, попробуйте позже или обратитесь к администратору @garickbox');
    } catch (e) {
        console.error('Не удалось отправить сообщение об ошибке:', e);
    }
});

// ==================== ЗАПУСК ====================
async function startBot() {
    try {
        console.log('🚀 Запуск школьного бота тестирования...');
        console.log('═══════════════════════════════════════════\n');
        
        // Настройка консоли администратора
        setupAdminConsole();
        
        // Проверяем Firebase
        if (initializeFirebase()) {
            console.log('✅ Firebase готов к работе');
        } else {
            console.warn('⚠️ Firebase не подключен. Результаты не будут сохраняться.');
        }
        
        // Запускаем бота
        await bot.launch();
        
        console.log('🤖 Бот успешно запущен!');
        console.log('👤 Бот доступен как:', bot.botInfo.username);
        console.log('🔗 Ссылка на бота:', `https://t.me/${bot.botInfo.username}`);
        
    } catch (error) {
        console.error('❌ Критическая ошибка запуска бота:', error.message);
        console.error('💡 Проверьте:');
        console.error('1. Правильность BOT_TOKEN в .env файле');
        console.error('2. Интернет соединение');
        console.error('3. Доступ к Telegram API');
        process.exit(1);
    }
}

// ==================== ОБРАБОТКА ЗАВЕРШЕНИЯ ====================
process.once('SIGINT', () => {
    console.log('🛑 Остановка бота (SIGINT)...');
    bot.stop('SIGINT');
    process.exit(0);
});

process.once('SIGTERM', () => {
    console.log('🛑 Остановка бота (SIGTERM)...');
    bot.stop('SIGTERM');
    process.exit(0);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Неперехваченное исключение:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Необработанный промис:', reason);
});

// Запуск бота
startBot();