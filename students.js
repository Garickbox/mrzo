module.exports = {
    classes: {
        "7": [
            { id: 701, lastName: "Брановицкий", firstName: "Богдан" },
            { id: 702, lastName: "Гречко", firstName: "Алексей" },
            { id: 703, lastName: "Грушко", firstName: "Николай" },
            { id: 704, lastName: "Колоскова", firstName: "Кира" },
            { id: 705, lastName: "Лысак", firstName: "Владислав" },
            { id: 706, lastName: "Редько", firstName: "Владимир" },
            { id: 707, lastName: "Сайбель", firstName: "Захар" },
            { id: 708, lastName: "Тюрина", firstName: "Диана" },
            { id: 709, lastName: "Чумак", firstName: "Никита" }
        ],
        "8": [
            { id: 801, lastName: "Емец", firstName: "Тимур" },
            { id: 802, lastName: "Пархоменко", firstName: "Марк" },
            { id: 803, lastName: "Редько", firstName: "Анастасия" }
        ],
        "9": [
            { id: 901, lastName: "Аветисян", firstName: "София" },
            { id: 902, lastName: "Брановицкая", firstName: "Алина" },
            { id: 903, lastName: "Золотарёва", firstName: "Виктория" },
            { id: 904, lastName: "Касимова", firstName: "Наталья" },
            { id: 905, lastName: "Коваленко", firstName: "Станислав" },
            { id: 906, lastName: "Кудикова", firstName: "Виолета" },
            { id: 907, lastName: "Куксова", firstName: "Нина" },
            { id: 908, lastName: "Лысак", firstName: "Артём" },
            { id: 909, lastName: "Миронова", firstName: "Алина" },
            { id: 910, lastName: "Трош", firstName: "Богдана" }
        ],
        "10": [
            { id: 1001, lastName: "Желнов", firstName: "Трофим" },
            { id: 1002, lastName: "Кирчу", firstName: "Сюзанна" },
            { id: 1003, lastName: "Костюк", firstName: "Валентина" },
            { id: 1004, lastName: "Кученко", firstName: "Станислав" },
            { id: 1005, lastName: "Потапов", firstName: "Дмитрий" },
            { id: 1006, lastName: "Ханыкин", firstName: "Станислав" }
        ],
        "11": [
            { id: 1101, lastName: "Брагинец", firstName: "Данил" },
            { id: 1102, lastName: "Конык", firstName: "Ирина" },
            { id: 1103, lastName: "Кубайкина", firstName: "Виктория" },
            { id: 1104, lastName: "Обрезанов", firstName: "Виталий" },
            { id: 1105, lastName: "Потапов", firstName: "Максим" },
            { id: 1106, lastName: "Редько", firstName: "Артём" },
            { id: 1107, lastName: "Тетерюк", firstName: "Николай" }
        ]
    },

    normalizeName: function(name) {
        if (!name) return '';
        return name.toLowerCase()
            .trim()
            .replace(/\s+/g, ' ')
            .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '')
            .replace(/ё/g, 'е')
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    },

    similarity: function(a, b) {
        if (!a || !b) return 0;
        if (a === b) return 1;
        if (a.includes(b) || b.includes(a)) return 0.9;
        if (a.substring(0, 3) === b.substring(0, 3)) return 0.7;
        
        const maxLength = Math.max(a.length, b.length);
        let distance = 0;
        for (let i = 0; i < maxLength; i++) {
            if (a[i] !== b[i]) distance++;
        }
        return Math.max(0, 1 - distance / maxLength);
    },

    searchStudents: function(lastName, firstName, className) {
        const normalizedLastName = this.normalizeName(lastName);
        const normalizedFirstName = this.normalizeName(firstName);
        
        const results = [];
        const classesToSearch = className ? [className] : Object.keys(this.classes);
        
        classesToSearch.forEach(classNum => {
            this.classes[classNum]?.forEach(student => {
                const studentLastNameNorm = this.normalizeName(student.lastName);
                const studentFirstNameNorm = this.normalizeName(student.firstName);
                
                const lastNameMatch = this.similarity(studentLastNameNorm, normalizedLastName);
                const firstNameMatch = this.similarity(studentFirstNameNorm, normalizedFirstName);
                
                const totalScore = (lastNameMatch * 0.7 + firstNameMatch * 0.3);
                
                if (totalScore > 0.4) {
                    results.push({
                        student: { ...student, class: classNum },
                        scores: {
                            lastName: lastNameMatch,
                            firstName: firstNameMatch,
                            total: totalScore
                        }
                    });
                }
            });
        });
        
        results.sort((a, b) => b.scores.total - a.scores.total);
        return results;
    },

    getStudentById: function(id) {
        for (const [className, students] of Object.entries(this.classes)) {
            const student = students.find(s => s.id === id);
            if (student) return { ...student, class: className };
        }
        return null;
    }
};