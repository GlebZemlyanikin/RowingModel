import React, { useState } from "react";
import { calculateModelPercentage, parseTimeToSeconds, formatTime, avg } from "@shared/utils";
import { modelTimesWORLD } from "@shared/modelTableWORLD";
import { modelTimesRUSSIA } from "@shared/modelTableRUSSIA";
import { distances } from "@shared/distanceTable";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

const getStyles = (theme) => ({
  page: {
    minHeight: "100vh",
    minWidth: "100vw",
    width: "100vw",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: theme === 'dark'
      ? "linear-gradient(120deg, #232526 0%, #414345 100%)"
      : "linear-gradient(120deg, #e0eafc 0%, #cfdef3 100%)",
    fontFamily: 'Segoe UI, Arial, sans-serif',
    transition: "background 0.3s",
  },
  card: {
    background: theme === 'dark' ? "#23272f" : "#fff",
    boxShadow: "0 4px 24px 0 rgba(34, 60, 80, 0.12)",
    borderRadius: 16,
    padding: 24,
    maxWidth: 1000,
    width: "100%",
    margin: "32px 0",
    transition: "background 0.3s",
  },
  section: {
    marginBottom: 24,
  },
  flexRow: {
    display: "flex",
    gap: 16,
    flexWrap: "wrap",
    alignItems: "center",
    marginBottom: 12,
  },
  input: {
    padding: "8px 12px",
    border: theme === 'dark' ? "1px solid #444" : "1px solid #bfc9d1",
    borderRadius: 8,
    fontSize: 16,
    outline: "none",
    transition: "border 0.2s, background 0.3s, color 0.3s",
    background: theme === 'dark' ? "#2c2f36" : "#f7fafd",
    color: theme === 'dark' ? "#fff" : "#222",
  },
  select: {
    padding: "8px 12px",
    border: theme === 'dark' ? "1px solid #444" : "1px solid #bfc9d1",
    borderRadius: 8,
    fontSize: 16,
    background: theme === 'dark' ? "#2c2f36" : "#f7fafd",
    color: theme === 'dark' ? "#fff" : "#222",
    transition: "background 0.3s, color 0.3s, border 0.2s",
  },
  button: {
    padding: "8px 20px",
    border: "none",
    borderRadius: 8,
    background: theme === 'dark' ? "#4f8cff" : "#4f8cff",
    color: "#fff",
    fontWeight: 600,
    fontSize: 16,
    cursor: "pointer",
    boxShadow: "0 2px 8px 0 rgba(34, 60, 80, 0.10)",
    marginRight: 8,
    marginTop: 4,
    marginBottom: 4,
    transition: "background 0.2s, box-shadow 0.2s",
  },
  buttonDanger: {
    background: "#ff4f4f",
    color: "#fff",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    marginTop: 16,
    background: theme === 'dark' ? "#23272f" : "#f7fafd",
    borderRadius: 8,
    overflow: "hidden",
    color: theme === 'dark' ? "#fff" : "#222",
    transition: "background 0.3s, color 0.3s",
  },
  th: {
    background: theme === 'dark' ? "#2c2f36" : "#eaf1fb",
    padding: 8,
    border: theme === 'dark' ? "1px solid #444" : "1px solid #dbe6f6",
    fontWeight: 600,
    textAlign: "center",
    color: theme === 'dark' ? "#fff" : "#222",
    transition: "background 0.3s, color 0.3s, border 0.2s",
  },
  td: {
    padding: 8,
    border: theme === 'dark' ? "1px solid #444" : "1px solid #dbe6f6",
    textAlign: "center",
    fontSize: 15,
    color: theme === 'dark' ? "#fff" : "#222",
    transition: "background 0.3s, color 0.3s, border 0.2s",
  },
  segmentBlock: {
    background: theme === 'dark' ? "#23272f" : "#f2f7fb",
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    transition: "background 0.3s",
  },
  themeToggle: {
    position: "absolute",
    top: 24,
    right: 24,
    zIndex: 10,
    background: theme === 'dark' ? "#2c2f36" : "#eaf1fb",
    color: theme === 'dark' ? "#fff" : "#222",
    border: "none",
    borderRadius: 8,
    padding: "8px 16px",
    fontSize: 15,
    cursor: "pointer",
    boxShadow: "0 2px 8px 0 rgba(34, 60, 80, 0.10)",
    transition: "background 0.3s, color 0.3s",
  },
});

export default function Calculator() {
  const [theme, setTheme] = useState('light');
  const styles = getStyles(theme);
  const [modelType, setModelType] = useState("Мировая модель");
  const modelTables = {
    "Мировая модель": modelTimesWORLD,
    "Российская модель (Н.Н.)": modelTimesRUSSIA,
  };
  const currentModel = modelTables[modelType];
  const defaultCategory = Object.keys(currentModel)[0];
  const defaultBoat = Object.keys(currentModel[defaultCategory])[0];
  const defaultDistance = parseInt(distances[0]);

  const [athletes, setAthletes] = useState([
    {
      name: "",
      category: defaultCategory,
      boat: defaultBoat,
      segments: [
        { distance: defaultDistance, time: "" }
      ]
    }
  ]);
  const [results, setResults] = useState([]);
  const [maxSegments, setMaxSegments] = useState(1);

  // Обновлять категории и классы лодок при смене модели
  React.useEffect(() => {
    setAthletes(athletes => athletes.map(ath => ({
      ...ath,
      category: Object.keys(currentModel)[0],
      boat: Object.keys(currentModel[Object.keys(currentModel)[0]])[0],
    })));
  }, [modelType]);

  const handleAthleteChange = (idx, field, value) => {
    setAthletes(athletes => athletes.map((ath, i) => {
      if (i !== idx) return ath;
      if (field === "category") {
        const newBoat = Object.keys(currentModel[value])[0];
        return { ...ath, category: value, boat: newBoat };
      }
      return { ...ath, [field]: value };
    }));
  };

  const handleSegmentChange = (athIdx, segIdx, field, value) => {
    setAthletes(athletes => athletes.map((ath, i) => {
      if (i !== athIdx) return ath;
      return {
        ...ath,
        segments: ath.segments.map((seg, j) =>
          j === segIdx ? { ...seg, [field]: value } : seg
        )
      };
    }));
  };

  const addAthlete = () => {
    setAthletes([
      ...athletes,
      {
        name: "",
        category: defaultCategory,
        boat: defaultBoat,
        segments: [
          { distance: defaultDistance, time: "" }
        ]
      }
    ]);
  };

  const removeAthlete = (idx) => {
    setAthletes(athletes.filter((_, i) => i !== idx));
  };

  const addSegment = (athIdx) => {
    setAthletes(athletes => athletes.map((ath, i) => {
      if (i !== athIdx) return ath;
      return {
        ...ath,
        segments: [...ath.segments, { distance: defaultDistance, time: "" }]
      };
    }));
  };

  const removeSegment = (athIdx, segIdx) => {
    setAthletes(athletes => athletes.map((ath, i) => {
      if (i !== athIdx) return ath;
      return {
        ...ath,
        segments: ath.segments.filter((_, j) => j !== segIdx)
      };
    }));
  };

  const handleCalc = () => {
    // Найти максимальное число отрезков
    const maxSeg = Math.max(...athletes.map(a => a.segments.length));
    setMaxSegments(maxSeg);
    // Для каждого спортсмена: массив процентов и секунд
    const res = athletes.map(({ name, category, boat, segments }) => {
      const baseModelTime = currentModel[category][boat];
      const segs = segments.map(({ distance, time }) => {
        const userTime = parseTimeToSeconds(time);
        const percent = userTime > 0 ? calculateModelPercentage(baseModelTime, distance, userTime) : null;
        return {
          distance,
          time,
          percent,
          seconds: userTime > 0 ? userTime : null
        };
      });
      // Среднее время (по введённым)
      const validTimes = segs.filter(s => s.seconds != null).map(s => s.seconds);
      const avgTime = validTimes.length > 0 ? avg(validTimes) : null;
      // Средний процент
      const validPercents = segs.filter(s => s.percent != null).map(s => s.percent);
      const avgPercent = validPercents.length > 0 ? avg(validPercents) : null;
      return {
        name,
        category,
        boat,
        segs,
        avgTime,
        avgPercent
      };
    });
    setResults(res);
  };

  const handleExport = () => {
    // Заголовки
    const headers = ["Имя", "Категория", "Класс лодки"];
    for (let i = 0; i < maxSegments; ++i) {
      headers.push(`Дистанция${i+1}`);
      headers.push(`Время${i+1}`);
      headers.push(`Модель${i+1}`);
    }
    headers.push("Среднее время");
    headers.push("Средняя модель");
    // Данные
    const wsData = [headers];
    results.forEach(r => {
      const row = [r.name, r.category, r.boat];
      for (let i = 0; i < maxSegments; ++i) {
        if (r.segs[i]) {
          row.push(r.segs[i].distance);
          row.push(r.segs[i].time);
          row.push(r.segs[i].percent != null ? `${r.segs[i].percent.toFixed(2)}%` : "");
        } else {
          row.push(""); row.push(""); row.push("");
        }
      }
      row.push(r.avgTime != null ? formatTime(r.avgTime) : "");
      row.push(r.avgPercent != null ? `${r.avgPercent.toFixed(2)}%` : "");
      wsData.push(row);
    });
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Результаты");
    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    saveAs(new Blob([wbout], { type: "application/octet-stream" }), "results.xlsx");
  };

  return (
    <div style={styles.page}>
      <button style={styles.themeToggle} onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
        {theme === 'light' ? '🌙 Тёмная тема' : '☀️ Светлая тема'}
      </button>
      <div style={styles.card}>
        <h2 style={{ textAlign: "center", marginBottom: 28, color: theme === 'dark' ? "#fff" : "#2a3b5d" }}>Калькулятор модельного времени</h2>
        <div style={{ ...styles.flexRow, ...styles.section }}>
          <div>
            <label style={{ color: theme === 'dark' ? '#fff' : '#2a3b5d', fontWeight: 500 }}>Тип модели: </label>
            <select value={modelType} onChange={e => setModelType(e.target.value)} style={styles.select}>
              {Object.keys(modelTables).map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>
        </div>
        <hr style={{ margin: "20px 0" }} />
        <h3 style={{ color: theme === 'dark' ? "#fff" : "#2a3b5d" }}>Данные спортсменов</h3>
        {athletes.map((ath, idx) => (
          <div key={idx} style={{ ...styles.section, ...styles.segmentBlock }}>
            <div style={styles.flexRow}>
              <input
                placeholder="Имя"
                value={ath.name}
                onChange={e => handleAthleteChange(idx, "name", e.target.value)}
                style={styles.input}
              />
              <select
                value={ath.category}
                onChange={e => handleAthleteChange(idx, "category", e.target.value)}
                style={styles.select}
              >
                {Object.keys(currentModel).map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
              <select
                value={ath.boat}
                onChange={e => handleAthleteChange(idx, "boat", e.target.value)}
                style={styles.select}
              >
                {Object.keys(currentModel[ath.category]).map(boat => (
                  <option key={boat} value={boat}>{boat}</option>
                ))}
              </select>
              {athletes.length > 1 && (
                <button onClick={() => removeAthlete(idx)} style={{ ...styles.button, ...styles.buttonDanger }}>✕</button>
              )}
            </div>
            <div style={{ marginTop: 8 }}>
              <b style={{ color: theme === 'dark' ? '#fff' : '#2a3b5d', fontWeight: 500 }}>Отрезки:</b>
              {ath.segments.map((seg, segIdx) => (
                <div key={segIdx} style={styles.flexRow}>
                  <select
                    value={seg.distance}
                    onChange={e => handleSegmentChange(idx, segIdx, "distance", Number(e.target.value))}
                    style={styles.select}
                  >
                    {distances.map(d => (
                      <option key={d} value={parseInt(d)}>{d}</option>
                    ))}
                  </select>
                  <input
                    placeholder="Время (например, 7:45.55)"
                    value={seg.time}
                    onChange={e => handleSegmentChange(idx, segIdx, "time", e.target.value)}
                    style={styles.input}
                  />
                  {ath.segments.length > 1 && (
                    <button onClick={() => removeSegment(idx, segIdx)} style={{ ...styles.button, ...styles.buttonDanger }}>✕</button>
                  )}
                </div>
              ))}
              <button onClick={() => addSegment(idx)} style={styles.button}>Добавить отрезок</button>
            </div>
          </div>
        ))}
        <button onClick={addAthlete} style={styles.button}>Добавить спортсмена</button>
        <br />
        <button style={{ ...styles.button, marginTop: 10, width: 180 }} onClick={handleCalc}>Рассчитать</button>
        {results.length > 0 && (
          <div style={{ marginTop: 32 }}>
            <h3 style={{ color: theme === 'dark' ? "#fff" : "#2a3b5d" }}>Результаты</h3>
            <div style={{ overflowX: "auto" }}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Имя</th>
                    <th style={styles.th}>Категория</th>
                    <th style={styles.th}>Класс лодки</th>
                    {Array.from({ length: maxSegments }).map((_, i) => [
                      <th key={`d${i}`} style={styles.th}>{`Дистанция${i+1}`}</th>,
                      <th key={`t${i}`} style={styles.th}>{`Время${i+1}`}</th>,
                      <th key={`p${i}`} style={styles.th}>{`Модель${i+1}`}</th>
                    ])}
                    <th style={styles.th}>Среднее время</th>
                    <th style={styles.th}>Средняя модель</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, i) => (
                    <tr key={i}>
                      <td style={styles.td}>{r.name}</td>
                      <td style={styles.td}>{r.category}</td>
                      <td style={styles.td}>{r.boat}</td>
                      {Array.from({ length: maxSegments }).map((_, j) => r.segs[j] ? [
                        <td key={`d${j}`} style={styles.td}>{r.segs[j].distance}</td>,
                        <td key={`t${j}`} style={styles.td}>{r.segs[j].time}</td>,
                        <td key={`p${j}`} style={styles.td}>{r.segs[j].percent != null ? `${r.segs[j].percent.toFixed(2)}%` : ""}</td>
                      ] : [
                        <td key={`d${j}`} style={styles.td}></td>,
                        <td key={`t${j}`} style={styles.td}></td>,
                        <td key={`p${j}`} style={styles.td}></td>
                      ])}
                      <td style={styles.td}>{r.avgTime != null ? formatTime(r.avgTime) : ""}</td>
                      <td style={styles.td}>{r.avgPercent != null ? `${r.avgPercent.toFixed(2)}%` : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button style={{ ...styles.button, marginTop: 16 }} onClick={handleExport}>Экспорт в Excel</button>
          </div>
        )}
      </div>
    </div>
  );
} 