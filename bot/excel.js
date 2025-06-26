const ExcelJS = require("exceljs");
const path = require("path");
const { parseTimeToSeconds, formatTime, avg, calculateModelPercentage } = require("../shared/utils");
const { modelTimesWORLD } = require("../shared/modelTableWORLD");
const { modelTimesRUSSIA } = require("../shared/modelTableRUSSIA");

// Функция создания Excel-файла
async function createExcelFile(chatId, session, getMessage) {
    try {
        if (!session || !session.results.length) {
            return null;
        }

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet("Результаты");
        const statsWorksheet = workbook.addWorksheet("Статистика");

        // Group results by name
        const groupedResults = {};
        session.results.forEach((result) => {
            if (!groupedResults[result.name]) {
                groupedResults[result.name] = {
                    name: result.name,
                    distance: result.distance,
                    boatClass: result.boatClass,
                    ageCategory: result.ageCategory,
                    modelType: result.modelType,
                    times: [],
                };
            }
            groupedResults[result.name].times.push(result.time);
        });

        // Add headers to main worksheet
        const headers = ["Имя", "Дистанция", "Класс", "Возраст"];
        const maxResults = Math.max(
            ...Object.values(groupedResults).map((g) => g.times.length)
        );
        for (let i = 0; i < maxResults; i++) {
            headers.push(`Время ${i + 1}`, `Модель ${i + 1}`);
        }
        headers.push("Среднее время", "Средняя модель");
        worksheet.addRow(headers);
        worksheet.getRow(1).font = { bold: true };

        // Add data rows
        Object.values(groupedResults).forEach((group) => {
            const rowData = [
                group.name,
                group.distance,
                group.boatClass,
                group.ageCategory,
            ];
            for (let i = 0; i < maxResults; i++) {
                if (i < group.times.length) {
                    const modelTable = group.modelType === getMessage(chatId, "worldModel") ? modelTimesWORLD : modelTimesRUSSIA;
                    const baseModelTime = modelTable[group.ageCategory]?.[group.boatClass];
                    const userTime = parseTimeToSeconds(group.times[i]);
                    const modelPercent = baseModelTime ? calculateModelPercentage(baseModelTime, group.distance, userTime).toFixed(2) : "";
                    rowData.push(group.times[i], `${modelPercent}%`);
                } else {
                    rowData.push("", "");
                }
            }
            const times = group.times.map((t) => parseTimeToSeconds(t));
            const modelTable = group.modelType === getMessage(chatId, "worldModel") ? modelTimesWORLD : modelTimesRUSSIA;
            const baseModelTime = modelTable[group.ageCategory]?.[group.boatClass];
            const models = times.map((userTime) => baseModelTime ? calculateModelPercentage(baseModelTime, group.distance, userTime) : 0);
            const avgSeconds = avg(times);
            const avgTime = formatTime(avgSeconds);
            const avgModel = avg(models).toFixed(2);
            rowData.push(avgTime, `${avgModel}%`);
            worksheet.addRow(rowData);
        });

        // Add statistics to stats worksheet
        statsWorksheet.addRow(["Общая статистика"]);
        statsWorksheet.addRow([
            "Количество спортсменов",
            Object.keys(groupedResults).length,
        ]);
        statsWorksheet.addRow([
            "Общее количество результатов",
            session.results.length,
        ]);
        const allModels = session.results.map((r) => parseFloat(r.modelPercentage));
        const teamAvgModel = avg(allModels).toFixed(2);
        statsWorksheet.addRow([
            "Средний процент от модели по команде",
            `${teamAvgModel}%`,
        ]);
        worksheet.columns.forEach((column) => {
            column.width = 15;
        });
        statsWorksheet.columns.forEach((column) => {
            column.width = 30;
        });
        const filename = `results_${session.username}_${session.chatId}.xlsx`;
        const filePath = path.resolve(filename);
        await workbook.xlsx.writeFile(filePath);
        return { excelFile: filePath };
    } catch (error) {
        throw error;
    }
}

module.exports = { createExcelFile }; 