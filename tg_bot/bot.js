const { Telegraf, Markup } = require('telegraf');
const { CONFIG, TestLoader, TestManager, FirebaseService } = require('./services');
const STUDENTS_DB = require('./students');

const bot = new Telegraf(CONFIG.BOT_TOKEN);
const testLoader = new TestLoader();
const testManager = new TestManager();
const userStates = new Map();

// ==================== КОМАНДЫ ====================
bot.start(async (ctx) => {
    const userId = ctx.from.id;
    
    await ctx.reply(`🎓 *Школьная система тестирования*

Я помогу пройти тесты прямо в Telegram!

📋 *Команды:*
/start [код] - Начать тест (пример: /start ttii7)
/tests - Список тестов
/progress - Продолжить тест
/results - Мои результаты
/help - Помощь

📱 *Веб-версия:* ${CONFIG.MAIN_WEBSITE}`, { 
        parse_mode: 'Markdown',
        ...Markup.keyboard([
            ['📚 Тесты', '📊 Мои результаты'],
            ['🚀 Начать тест ttii7']
        ]).resize()
    });
});

bot.command('tests', async (ctx) => {
    const tests = testLoader.getAvailableTests();
    const buttons = tests.map(test => [
        Markup.button.callback(test.title, `start_test:${test.name}`)
    ]);
    
    await ctx.reply('📚 *Доступные тесты:*', {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(buttons)
    });
});

bot.command('results', async (ctx) => {
    const userId = ctx.from.id;
    const results = await FirebaseService.getUserResults(userId);
    
    if (results.length === 0) {
        await ctx.reply('📭 *Результатов пока нет*\n\nПройдите тест, чтобы увидеть результаты!', { 
            parse_mode: 'Markdown' 
        });
        return;
    }
    
    let message = '📊 *Ваши результаты:*\n\n';
    results.forEach((result, index) => {
        const date = result.completedAt ? 
            new Date(result.completedAt).toLocaleDateString('ru-RU') : 
            'Дата не указана';
        
        message += `*${index + 1}. ${result.testName}*\n`;
        message += `📅 ${date} | 🎯 ${result.grade}/5 | ${result.score}/${result.maxScore} баллов\n`;
        message += `👤 ${result.student.lastName} ${result.student.firstName} (${result.student.class} класс)\n`;
        message += `---\n`;
    });
    
    await ctx.reply(message, { parse_mode: 'Markdown' });
});

bot.command('start', async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length === 2) {
        const testCode = args[1].toLowerCase();
        await startTestProcess(ctx, ctx.from.id, testCode);
    } else {
        await ctx.reply('✏️ *Быстрый старт теста*\n\nИспользуйте: `/start ttii7`\n\nИли выберите тест:', {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('📚 Выбрать тест', 'show_tests')]
            ])
        });
    }
});

bot.command('help', (ctx) => {
    ctx.reply(`🆘 *Помощь*

📞 *Контакты:* @garickbox
🌐 *Сайт:* ${CONFIG.MAIN_WEBSITE}

*Проблемы с ботом?*
1. Проверьте, что ввели правильный код теста
2. Убедитесь, что правильно ввели Фамилию и Имя
3. Если проблема осталась - напишите разработчику`, {
        parse_mode: 'Markdown'
    });
});

// ==================== INLINE КНОПКИ ====================
bot.action('show_tests', async (ctx) => {
    await ctx.deleteMessage();
    const tests = testLoader.getAvailableTests();
    const buttons = tests.map(test => [
        Markup.button.callback(test.title, `start_test:${test.name}`)
    ]);
    
    await ctx.reply('📚 *Выберите тест:*', {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(buttons)
    });
});

bot.action(/start_test:(.+)/, async (ctx) => {
    const testCode = ctx.match[1];
    await ctx.deleteMessage();
    await startTestProcess(ctx, ctx.from.id, testCode);
});

bot.action(/select_student:(\d+)/, async (ctx) => {
    const studentId = parseInt(ctx.match[1]);
    const userId = ctx.from.id;
    
    const student = STUDENTS_DB.getStudentById(studentId);
    if (!student) {
        await ctx.reply('❌ Ученик не найден в базе');
        return;
    }
    
    userStates.set(userId, { 
        step: 'test_ready', 
        student,
        testCode: userStates.get(userId)?.testCode 
    });
    
    await ctx.editMessageText(`✅ *Идентификация успешна!*

👤 *Ученик:* ${student.lastName} ${student.firstName}
🏫 *Класс:* ${student.class}

Готовы начать тест?`, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('🚀 Начать тест', 'begin_test')],
            [Markup.button.callback('🔄 Выбрать другого', 'change_student')]
        ])
    });
});

bot.action('begin_test', async (ctx) => {
    await ctx.deleteMessage();
    const userId = ctx.from.id;
    const state = userStates.get(userId);
    
    if (!state || !state.student || !state.testCode) {
        await ctx.reply('❌ Ошибка: данные сессии утеряны. Начните заново.');
        return;
    }
    
    try {
        const testData = await testLoader.loadTest(state.testCode);
        const session = testManager.createTestSession(userId, testData, state.student);
        await showQuestion(ctx, session);
    } catch (error) {
        await ctx.reply(`❌ Ошибка: ${error.message}`);
    }
});

bot.action('change_student', async (ctx) => {
    await ctx.deleteMessage();
    const userId = ctx.from.id;
    const state = userStates.get(userId);
    
    if (state && state.testCode) {
        await showStudentSearch(ctx, userId, state.testCode);
    } else {
        await ctx.reply('❌ Ошибка: данные утеряны. Используйте /tests');
    }
});

bot.action(/answer:(\d+)/, async (ctx) => {
    const answerIndex = parseInt(ctx.match[1]);
    const userId = ctx.from.id;
    
    const result = testManager.answerQuestion(userId, answerIndex);
    if (!result) {
        await ctx.reply('❌ Сессия теста не найдена или завершена');
        return;
    }
    
    const { session, isCorrect, isCompleted } = result;
    
    try {
        await ctx.editMessageText(
            `✅ *Ответ принят!*\n\n${isCorrect ? 'Правильно! ✓' : 'Неправильно ✗'}\n${isCompleted ? '\n⏳ Подсчитываем результаты...' : ''}`,
            { parse_mode: 'Markdown' }
        );
    } catch (error) {
        // Игнорируем ошибки редактирования
    }
    
    if (isCompleted) {
        setTimeout(() => finishTest(ctx, session), 1500);
    } else {
        setTimeout(() => showQuestion(ctx, session), 1500);
    }
});

// ==================== ОБРАБОТКА ТЕКСТА ====================
bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const state = userStates.get(userId);
    const text = ctx.message.text;
    
    if (text === '🚀 Начать тест ttii7') {
        await startTestProcess(ctx, userId, 'ttii7');
        return;
    }
    
    if (text === '📚 Тесты') {
        const tests = testLoader.getAvailableTests();
        const buttons = tests.map(test => [
            Markup.button.callback(test.title, `start_test:${test.name}`)
        ]);
        
        await ctx.reply('📚 *Выберите тест:*', {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard(buttons)
        });
        return;
    }
    
    if (text === '📊 Мои результаты') {
        const results = await FirebaseService.getUserResults(userId);
        
        if (results.length === 0) {
            await ctx.reply('📭 *Результатов пока нет*', { parse_mode: 'Markdown' });
            return;
        }
        
        let message = '📊 *Ваши результаты:*\n\n';
        results.forEach((result, index) => {
            const date = result.completedAt ? 
                new Date(result.completedAt).toLocaleDateString('ru-RU') : 
                'Дата не указана';
            
            message += `*${index + 1}. ${result.testName}*\n`;
            message += `📅 ${date} | 🎯 ${result.grade}/5\n`;
            message += `👤 ${result.student.lastName} ${result.student.firstName}\n`;
            message += `---\n`;
        });
        
        await ctx.reply(message, { parse_mode: 'Markdown' });
        return;
    }
    
    if (state && state.step === 'awaiting_student') {
        const parts = text.trim().split(/\s+/);
        if (parts.length >= 3) {
            const lastName = parts[0];
            const firstName = parts[1];
            const className = parts[2];
            
            if (!['7','8','9','10','11'].includes(className)) {
                await ctx.reply('❌ Класс должен быть числом от 7 до 11');
                return;
            }
            
            const results = STUDENTS_DB.searchStudents(lastName, firstName, className);
            
            if (results.length > 0) {
                const buttons = results.slice(0, 3).map(result => [
                    Markup.button.callback(
                        `${result.student.lastName} ${result.student.firstName} (${result.student.class} класс) - ${Math.round(result.scores.total * 100)}%`,
                        `select_student:${result.student.id}`
                    )
                ]);
                
                await ctx.reply(`🔍 *Найдены ученики:*`, {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard(buttons)
                });
            } else {
                await ctx.reply('❌ *Ученик не найден*\n\nПроверьте:\n1. Правильность Фамилии и Имени\n2. Правильный класс (7-11)\n3. Попробуйте еще раз', {
                    parse_mode: 'Markdown'
                });
            }
        } else {
            await ctx.reply('❌ *Неверный формат*\n\nВведите: `Фамилия Имя Класс`\n\nПример: `Иванов Иван 7`', {
                parse_mode: 'Markdown'
            });
        }
    }
});

// ==================== ПОМОЩНИКИ ====================
async function startTestProcess(ctx, userId, testCode) {
    try {
        await testLoader.loadTest(testCode);
        userStates.set(userId, { 
            step: 'awaiting_student', 
            testCode 
        });
        
        await ctx.reply('👤 *Идентификация ученика*\n\nВведите ваши данные:\n`Фамилия Имя Класс`\n\nПример: `Иванов Иван 7`', {
            parse_mode: 'Markdown',
            ...Markup.removeKeyboard()
        });
    } catch (error) {
        await ctx.reply(`❌ *Ошибка:* ${error.message}\n\nИспользуйте /tests для списка тестов`, {
            parse_mode: 'Markdown'
        });
    }
}

async function showStudentSearch(ctx, userId, testCode) {
    userStates.set(userId, { 
        step: 'awaiting_student', 
        testCode 
    });
    
    await ctx.reply('👤 *Введите данные заново:*\n`Фамилия Имя Класс`', {
        parse_mode: 'Markdown'
    });
}

async function showQuestion(ctx, session) {
    const question = session.allQuestions[session.currentQuestionIndex];
    const questionNumber = session.currentQuestionIndex + 1;
    const totalQuestions = session.allQuestions.length;
    
    const buttons = question.options.map((option, index) => [
        Markup.button.callback(`${String.fromCharCode(65 + index)}. ${option.t}`, `answer:${index}`)
    ]);
    
    const message = `📝 *Вопрос ${questionNumber}/${totalQuestions}* ${question.points === 3 ? '(Задача, 3 балла)' : '(Вопрос, 1 балл)'}

${question.text}

*Выберите ответ:*`;
    
    await ctx.reply(message, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(buttons)
    });
}

async function finishTest(ctx, session) {
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
        duration: Math.floor((session.endTime - session.startTime) / 1000 / 60)
    };
    
    await FirebaseService.saveTestResult(ctx.from.id, session, result);
    await testManager.sendResultsToTelegram(session);
    
    const message = `🎉 *Тест завершен!*

📊 *Ваши результаты:*
👤 Ученик: ${session.student.lastName} ${session.student.firstName}
🏫 Класс: ${session.student.class}
⏱️ Время: ${result.duration} мин
🎯 Баллы: ${session.score}/${session.maxScore}
📈 Оценка: ${session.grade}/5

📖 Правильных вопросов: ${session.correctQuestions}
📐 Правильных задач: ${session.correctProblems}

${session.grade >= 4 ? '🏆 Отличный результат!' : session.grade === 3 ? '👍 Хорошая работа!' : '💪 Есть над чем поработать!'}`;
    
    await ctx.reply(message, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('📚 Пройти другой тест', 'show_tests')],
            [Markup.button.callback('📊 Все мои результаты', 'show_my_results')]
        ])
    });
    
    testManager.deleteSession(ctx.from.id);
    userStates.delete(ctx.from.id);
}

bot.action('show_my_results', async (ctx) => {
    await ctx.deleteMessage();
    const userId = ctx.from.id;
    const results = await FirebaseService.getUserResults(userId);
    
    if (results.length === 0) {
        await ctx.reply('📭 *Результатов пока нет*', { parse_mode: 'Markdown' });
        return;
    }
    
    let message = '📊 *Ваши результаты:*\n\n';
    results.forEach((result, index) => {
        const date = result.completedAt ? 
            new Date(result.completedAt).toLocaleDateString('ru-RU') : 
            'Дата не указана';
        
        message += `*${index + 1}. ${result.testName}*\n`;
        message += `📅 ${date} | 🎯 ${result.grade}/5\n`;
        message += `👤 ${result.student.lastName} ${result.student.firstName}\n`;
        message += `---\n`;
    });
    
    await ctx.reply(message, { parse_mode: 'Markdown' });
});

// ==================== ЗАПУСК ====================
bot.launch().then(() => {
    console.log('🤖 Бот успешно запущен!');
    console.log('📊 Используется Firebase проект:', CONFIG.FIREBASE_ADMIN_KEY.project_id);
    console.log('🔗 Бот доступен по ссылке: https://t.me/' + bot.botInfo.username);
}).catch(err => {
    console.error('❌ Ошибка запуска бота:', err.message);
    console.error('💡 Проверьте:');
    console.error('1. Правильность токена бота');
    console.error('2. Доступность Firebase');
    console.error('3. Интернет соединение');
});

process.once('SIGINT', () => {
    console.log('🛑 Остановка бота...');
    bot.stop('SIGINT');
    process.exit(0);
});

process.once('SIGTERM', () => {
    console.log('🛑 Остановка бота...');
    bot.stop('SIGTERM');
    process.exit(0);
});