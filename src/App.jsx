import React, { useState, useEffect } from "react";
import { Dumbbell, TrendingUp, AlertTriangle, Save, Trash2, ChevronRight, Check, Loader2 } from "lucide-react";

/* ---------------------------------------------------------------
   TOKENS
   Palette: chalk & steel — a gym at 6am, not a SaaS dashboard.
   #1B1A18 charcoal bg · #E9E4D8 chalk · #4C6373 steel ·
   #B5432D rust (fail/warn) · #C9A227 brass (progress) · #3F7D4E iron-green
   Display: Oswald (condensed, signage) · Body: Inter · Data: JetBrains Mono
------------------------------------------------------------------*/

const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;700&display=swap');`;

const PLATE_COLORS = {
  25: "#B5432D",
  20: "#3D5A80",
  15: "#C9A227",
  10: "#3F7D4E",
  5: "#E9E4D8",
  2.5: "#15140F",
  1.25: "#8C8578",
};
const PLATE_WEIGHTS = [25, 20, 15, 10, 5, 2.5, 1.25];

function roundToStep(value, step = 1.25) {
  return Math.round(value / step) * step;
}

function fmt(n) {
  const r = Math.round(n * 100) / 100;
  return Number.isInteger(r) ? r.toString() : r.toFixed(2).replace(/0$/, "").replace(/\.$/, "");
}

function estimate1RM(weight, reps) {
  if (reps <= 1) return weight;
  return weight * (1 + reps / 30); // Epley
}

function plateBreakdown(totalWeight, barWeight = 20) {
  let perSide = (totalWeight - barWeight) / 2;
  if (perSide <= 0) return { plates: [], perSide: 0, feasible: totalWeight >= 0 };
  let remaining = perSide;
  const plates = [];
  for (const p of PLATE_WEIGHTS) {
    while (remaining >= p - 0.001) {
      plates.push(p);
      remaining -= p;
    }
  }
  return { plates, perSide, leftover: remaining };
}

/* ---------------------------------------------------------------
   PLATE VISUAL — signature element: an actual side-loaded barbell
------------------------------------------------------------------*/
function BarbellLoad({ weight, label, accent = "#C9A227" }) {
  const { plates, leftover } = plateBreakdown(weight);
  const maxDiscH = 92;
  return (
    <div className="barbell-wrap">
      <div className="barbell-label">{label}</div>
      <div className="barbell-row">
        <div className="bar-sleeve" />
        <div className="plate-stack">
          {plates.map((p, i) => {
            const h = Math.max(30, Math.min(maxDiscH, 30 + p * 2.4));
            return (
              <div
                key={i}
                className="plate"
                style={{
                  height: `${h}px`,
                  width: p >= 10 ? "14px" : "9px",
                  background: PLATE_COLORS[p],
                  border: p === 5 ? "1px solid #15140F" : "none",
                }}
                title={`${p} kg`}
              />
            );
          })}
        </div>
        <div className="bar-center" style={{ borderColor: accent }} />
      </div>
      <div className="barbell-total" style={{ color: accent }}>
        {fmt(weight)} <span>kg</span>
      </div>
      {leftover > 0.05 && (
        <div className="barbell-note">+{fmt(leftover * 2)} kg non chargeable avec ce jeu de disques</div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------
   PROGRAM GENERATION
------------------------------------------------------------------*/
const PACE = {
  prudent: { label: "Prudent", rate: 0.005, hint: "0,5 %/semaine" },
  modere: { label: "Modéré", rate: 0.0075, hint: "0,75 %/semaine" },
  ambitieux: { label: "Ambitieux", rate: 0.012, hint: "1,2 %/semaine" },
};

function generateProgram({ currentWeight, currentReps, targetWeight, pace }) {
  const current1RM = estimate1RM(currentWeight, currentReps);
  if (targetWeight <= current1RM) {
    return { alreadyThere: true, current1RM };
  }
  const rate = PACE[pace].rate;
  const weeksRaw = Math.log(targetWeight / current1RM) / Math.log(1 + rate);
  const weeks = Math.min(78, Math.max(4, Math.ceil(weeksRaw)));

  let hyp = Math.max(1, Math.round(weeks * 0.4));
  let str = Math.max(1, Math.round(weeks * 0.35));
  let peak = weeks - hyp - str;
  if (peak < 1) {
    peak = 1;
    if (hyp + str + peak > weeks) str = Math.max(1, weeks - hyp - peak);
  }
  // reconcile rounding drift
  const total = hyp + str + peak;
  if (total !== weeks) hyp += weeks - total;

  const plan = [];
  for (let i = 1; i <= weeks; i++) {
    const weekEst1RM = current1RM * Math.pow(targetWeight / current1RM, i / weeks);
    let phase, pct, scheme;
    if (i <= hyp) {
      phase = "Volume";
      pct = 0.7;
      scheme = "4 × 8–10";
    } else if (i <= hyp + str) {
      phase = "Force";
      pct = 0.8;
      scheme = "4 × 5";
    } else {
      phase = "Affûtage";
      pct = 0.9;
      scheme = "3 × 3";
    }
    const isLast = i === weeks;
    const workingWeight = isLast ? targetWeight : roundToStep(weekEst1RM * pct);
    plan.push({
      week: i,
      phase: isLast ? "Jour J" : phase,
      pct: isLast ? 1 : pct,
      weight: workingWeight,
      scheme: isLast ? "1 × 1 (tentative)" : scheme,
      isLast,
    });
  }

  return { current1RM, weeks, plan, hyp, str, peak };
}

/* ---------------------------------------------------------------
   FREE SESSION SUGGESTION ENGINE
------------------------------------------------------------------*/
function suggestNext({ goalType, lastWeight, lastReps, tooHeavy }) {
  if (tooHeavy) {
    return {
      weight: roundToStep(lastWeight * 0.9),
      note: "Charge réduite après une série trop lourde.",
    };
  }
  if (goalType === "force") {
    if (lastReps >= 6)
      return { weight: roundToStep(lastWeight * 1.05), note: "Marge confortable — on augmente la charge." };
    if (lastReps >= 3)
      return { weight: lastWeight, note: "Zone de force optimale — on garde la charge." };
    return { weight: roundToStep(lastWeight * 0.93), note: "Série difficile — on allège légèrement." };
  }
  // volume
  if (lastReps >= 12)
    return { weight: roundToStep(lastWeight * 1.03), note: "Répétitions élevées — légère hausse de charge." };
  if (lastReps >= 8)
    return { weight: lastWeight, note: "Bonne zone de volume — on garde la charge." };
  return { weight: roundToStep(lastWeight * 0.92), note: "Sous la zone de volume — on allège pour tenir les reps." };
}

/* ---------------------------------------------------------------
   STORAGE HELPERS
------------------------------------------------------------------*/
async function loadStorage(key, fallback) {
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}
async function saveStorage(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Le mode privé ou un stockage saturé peut empêcher l'enregistrement. */
  }
}

/* ---------------------------------------------------------------
   APP
------------------------------------------------------------------*/
export default function App() {
  const [tab, setTab] = useState("goal");
  const [ready, setReady] = useState(false);

  const [goals, setGoals] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [activeSession, setActiveSession] = useState(null);

  useEffect(() => {
    (async () => {
      const g = await loadStorage("goals-list", []);
      const s = await loadStorage("free-sessions", []);
      const a = await loadStorage("free-active-session", null);
      setGoals(g);
      setSessions(s);
      setActiveSession(a);
      setReady(true);
    })();
  }, []);

  if (!ready) {
    return (
      <div className="loading-screen">
        <style>{FONT_IMPORT}</style>
        <Loader2 className="spin" size={28} />
      </div>
    );
  }

  return (
    <div className="app-root">
      <style>{`
        ${FONT_IMPORT}
        * { box-sizing: border-box; }
        .app-root {
          background: #1B1A18;
          color: #E9E4D8;
          min-height: 100vh;
          font-family: 'Inter', sans-serif;
          padding: 28px 18px 60px;
        }
        .loading-screen {
          background: #1B1A18; color:#C9A227; min-height:100vh;
          display:flex; align-items:center; justify-content:center;
        }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }

        .header { max-width: 720px; margin: 0 auto 28px; }
        .header h1 {
          font-family: 'Oswald', sans-serif;
          font-weight: 700;
          font-size: 40px;
          letter-spacing: 0.5px;
          margin: 0;
          text-transform: uppercase;
        }
        .header h1 span { color: #C9A227; }
        .header p {
          margin: 4px 0 0;
          color: #8C8578;
          font-size: 14px;
        }

        .tabs {
          display: flex;
          max-width: 720px;
          margin: 22px auto 24px;
          border: 1px solid #3A3833;
          border-radius: 999px;
          padding: 4px;
          gap: 4px;
        }
        .tab-btn {
          flex: 1;
          background: transparent;
          border: none;
          color: #8C8578;
          font-family: 'Oswald', sans-serif;
          font-size: 14px;
          letter-spacing: 0.6px;
          text-transform: uppercase;
          padding: 10px 12px;
          border-radius: 999px;
          cursor: pointer;
          transition: all 0.15s ease;
          display: flex; align-items: center; justify-content: center; gap: 6px;
        }
        .tab-btn.active { background: #C9A227; color: #1B1A18; font-weight: 600; }

        .content { max-width: 720px; margin: 0 auto; }

        .card {
          background: #211F1B;
          border: 1px solid #3A3833;
          border-radius: 14px;
          padding: 22px;
          margin-bottom: 18px;
        }
        .card h2 {
          font-family: 'Oswald', sans-serif;
          text-transform: uppercase;
          font-size: 16px;
          letter-spacing: 0.6px;
          margin: 0 0 16px;
          color: #E9E4D8;
          display: flex; align-items: center; gap: 8px;
        }
        .field { margin-bottom: 14px; }
        .field label {
          display: block; font-size: 12px; color: #8C8578;
          margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.4px;
        }
        .field input, .field select {
          width: 100%;
          background: #15140F;
          border: 1px solid #3A3833;
          color: #E9E4D8;
          font-family: 'JetBrains Mono', monospace;
          font-size: 15px;
          padding: 10px 12px;
          border-radius: 8px;
          outline: none;
        }
        .field input:focus, .field select:focus { border-color: #C9A227; }
        .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

        .pill-group { display: flex; gap: 8px; flex-wrap: wrap; }
        .pill {
          flex: 1;
          min-width: 90px;
          text-align: center;
          background: #15140F;
          border: 1px solid #3A3833;
          color: #8C8578;
          padding: 10px 8px;
          border-radius: 8px;
          font-size: 13px;
          cursor: pointer;
          font-family: 'Inter', sans-serif;
        }
        .pill small { display:block; font-family:'JetBrains Mono',monospace; font-size:10px; margin-top:2px; opacity:0.8;}
        .pill.active { border-color: #C9A227; color: #C9A227; background: rgba(201,162,39,0.08); }

        .btn {
          font-family: 'Oswald', sans-serif;
          text-transform: uppercase;
          letter-spacing: 0.6px;
          font-size: 14px;
          border: none;
          border-radius: 8px;
          padding: 13px 18px;
          cursor: pointer;
          display: inline-flex; align-items: center; justify-content: center; gap: 8px;
          width: 100%;
        }
        .btn-primary { background: #C9A227; color: #1B1A18; font-weight: 600; }
        .btn-primary:hover { background: #dcb433; }
        .btn-danger { background: #B5432D; color: #E9E4D8; }
        .btn-ghost { background: transparent; color: #8C8578; border: 1px solid #3A3833; }
        .btn-ghost:hover { color: #E9E4D8; border-color: #8C8578; }
        .btn-sm { padding: 8px 12px; font-size: 12px; width: auto; }

        .btn-row { display: flex; gap: 10px; margin-top: 6px; }

        .barbell-wrap { text-align: center; padding: 10px 0 4px; }
        .barbell-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.6px; color: #8C8578; margin-bottom: 10px; }
        .barbell-row { display: flex; align-items: center; justify-content: center; height: 100px; }
        .bar-sleeve { width: 34px; height: 8px; background: #55524A; border-radius: 2px; }
        .plate-stack { display: flex; align-items: center; gap: 2px; flex-direction: row-reverse; }
        .plate { border-radius: 2px; }
        .bar-center { width: 3px; height: 40px; border-left: 2px dashed; opacity: 0.6; }
        .barbell-total {
          font-family: 'JetBrains Mono', monospace;
          font-size: 26px; font-weight: 700; margin-top: 8px;
        }
        .barbell-total span { font-size: 13px; opacity: 0.7; }
        .barbell-note { font-size: 11px; color: #8C8578; margin-top: 4px; }

        .stat-row { display: flex; gap: 18px; justify-content: center; flex-wrap: wrap; }

        .timeline { border-top: 1px solid #3A3833; margin-top: 6px; }
        .tl-row {
          display: grid;
          grid-template-columns: 44px 1fr auto auto;
          gap: 10px;
          align-items: center;
          padding: 10px 0;
          border-bottom: 1px solid #2A2823;
          font-size: 13px;
        }
        .tl-row.last { background: rgba(201,162,39,0.06); border-radius: 6px; padding-left: 8px; }
        .tl-week { font-family: 'JetBrains Mono', monospace; color: #8C8578; }
        .tl-phase { color: #E9E4D8; }
        .tl-phase small { display: block; color: #8C8578; font-size: 11px; }
        .tl-weight { font-family: 'JetBrains Mono', monospace; color: #C9A227; font-weight: 700; text-align: right; }
        .tl-scheme { color: #8C8578; text-align: right; font-size: 12px; }

        .empty {
          text-align: center; color: #8C8578; font-size: 13px; padding: 24px 10px;
        }

        .goal-card-mini {
          display: flex; justify-content: space-between; align-items: center;
          padding: 12px 14px; background: #15140F; border: 1px solid #3A3833;
          border-radius: 10px; margin-bottom: 10px; cursor: pointer;
        }
        .goal-card-mini:hover { border-color: #8C8578; }
        .goal-card-mini .name { font-weight: 600; }
        .goal-card-mini .sub { font-size: 12px; color: #8C8578; margin-top: 2px; }
        .icon-btn { background: none; border: none; color: #8C8578; cursor: pointer; padding: 6px; }
        .icon-btn:hover { color: #B5432D; }

        .set-history { margin-top: 10px; }
        .set-row {
          display: grid; grid-template-columns: 30px 1fr 1fr auto;
          align-items: center; gap: 10px; padding: 8px 0;
          border-bottom: 1px solid #2A2823; font-size: 13px;
        }
        .set-row .n { font-family:'JetBrains Mono',monospace; color:#8C8578; }
        .chip { font-size: 10px; padding: 3px 8px; border-radius: 999px; text-transform: uppercase; letter-spacing: 0.4px; }
        .chip.ok { background: rgba(63,125,78,0.15); color: #6FBE84; }
        .chip.heavy { background: rgba(181,67,45,0.18); color: #E08069; }

        .suggestion-banner {
          background: rgba(201,162,39,0.08);
          border: 1px solid rgba(201,162,39,0.4);
          border-radius: 10px;
          padding: 12px 14px;
          margin-bottom: 14px;
          font-size: 13px;
        }
        .suggestion-banner b { color: #C9A227; font-family: 'JetBrains Mono', monospace; font-size: 16px; }

        @media (max-width: 480px) {
          .header h1 { font-size: 30px; }
          .row2 { grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="header">
        <h1>Charge<span>.</span></h1>
        <p>Planification de charge et pilotage de séance, kilo par kilo.</p>
      </div>

      <div className="tabs">
        <button className={`tab-btn ${tab === "goal" ? "active" : ""}`} onClick={() => setTab("goal")}>
          <TrendingUp size={15} /> Objectif 1RM
        </button>
        <button className={`tab-btn ${tab === "free" ? "active" : ""}`} onClick={() => setTab("free")}>
          <Dumbbell size={15} /> Séance libre
        </button>
      </div>

      <div className="content">
        {tab === "goal" ? (
          <GoalTab
            goals={goals}
            setGoals={(g) => {
              setGoals(g);
              saveStorage("goals-list", g);
            }}
          />
        ) : (
          <FreeTab
            sessions={sessions}
            setSessions={(s) => {
              setSessions(s);
              saveStorage("free-sessions", s);
            }}
            activeSession={activeSession}
            setActiveSession={(a) => {
              setActiveSession(a);
              saveStorage("free-active-session", a);
            }}
          />
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   GOAL TAB
------------------------------------------------------------------*/
function GoalTab({ goals, setGoals }) {
  const [exercise, setExercise] = useState("Développé couché");
  const [currentWeight, setCurrentWeight] = useState("");
  const [currentReps, setCurrentReps] = useState("");
  const [targetWeight, setTargetWeight] = useState("");
  const [pace, setPace] = useState("modere");
  const [result, setResult] = useState(null);
  const [savedMsg, setSavedMsg] = useState(false);

  const canGenerate = currentWeight && currentReps && targetWeight;

  const handleGenerate = () => {
    const cw = parseFloat(currentWeight);
    const cr = parseInt(currentReps, 10);
    const tw = parseFloat(targetWeight);
    if (!cw || !cr || !tw) return;
    const program = generateProgram({ currentWeight: cw, currentReps: cr, targetWeight: tw, pace });
    setResult({ ...program, exercise, currentWeight: cw, currentReps: cr, targetWeight: tw, pace });
    setSavedMsg(false);
  };

  const handleSave = () => {
    if (!result || result.alreadyThere) return;
    const entry = { id: Date.now().toString(), createdAt: new Date().toISOString(), ...result };
    setGoals([entry, ...goals]);
    setSavedMsg(true);
  };

  const handleDelete = (id) => setGoals(goals.filter((g) => g.id !== id));
  const handleLoad = (g) => setResult(g);

  return (
    <>
      <div className="card">
        <h2><TrendingUp size={16} /> Nouvel objectif</h2>

        <div className="field">
          <label>Exercice</label>
          <input value={exercise} onChange={(e) => setExercise(e.target.value)} placeholder="Développé couché" />
        </div>

        <div className="row2">
          <div className="field">
            <label>Charge soulevée aujourd'hui (kg)</label>
            <input
              type="number"
              step="0.01"
              value={currentWeight}
              onChange={(e) => setCurrentWeight(e.target.value)}
              placeholder="90.01"
            />
          </div>
          <div className="field">
            <label>Répétitions faites</label>
            <input
              type="number"
              value={currentReps}
              onChange={(e) => setCurrentReps(e.target.value)}
              placeholder="3"
            />
          </div>
        </div>

        <div className="field">
          <label>Objectif — charge à soulever une fois (kg)</label>
          <input
            type="number"
            step="0.01"
            value={targetWeight}
            onChange={(e) => setTargetWeight(e.target.value)}
            placeholder="100"
          />
        </div>

        <div className="field">
          <label>Rythme de progression</label>
          <div className="pill-group">
            {Object.entries(PACE).map(([key, p]) => (
              <div key={key} className={`pill ${pace === key ? "active" : ""}`} onClick={() => setPace(key)}>
                {p.label}
                <small>{p.hint}</small>
              </div>
            ))}
          </div>
        </div>

        <button className="btn btn-primary" disabled={!canGenerate} onClick={handleGenerate}>
          Générer le programme <ChevronRight size={16} />
        </button>
      </div>

      {result && result.alreadyThere && (
        <div className="card">
          <p style={{ margin: 0 }}>
            Ton 1RM estimé (<b>{fmt(result.current1RM)} kg</b>) atteint déjà l'objectif. Tente directement la charge en séance, avec un vrai échauffement progressif.
          </p>
        </div>
      )}

      {result && !result.alreadyThere && (
        <div className="card">
          <h2>Charge de départ vs objectif</h2>
          <div className="stat-row">
            <BarbellLoad weight={result.current1RM} label="1RM estimé aujourd'hui" accent="#4C6373" />
            <BarbellLoad weight={result.targetWeight} label="Objectif" accent="#C9A227" />
          </div>

          <p style={{ textAlign: "center", color: "#8C8578", fontSize: 13, marginTop: 4 }}>
            Programme sur <b style={{ color: "#E9E4D8" }}>{result.weeks} semaines</b> — {result.hyp} sem. volume · {result.str} sem. force · {result.peak} sem. affûtage
          </p>

          <div className="timeline">
            {result.plan.map((w) => (
              <div key={w.week} className={`tl-row ${w.isLast ? "last" : ""}`}>
                <div className="tl-week">S{String(w.week).padStart(2, "0")}</div>
                <div className="tl-phase">
                  {w.phase}
                </div>
                <div className="tl-weight">{fmt(w.weight)} kg</div>
                <div className="tl-scheme">{w.scheme}</div>
              </div>
            ))}
          </div>

          <div className="btn-row" style={{ marginTop: 16 }}>
            <button className="btn btn-primary" onClick={handleSave}>
              {savedMsg ? <Check size={16} /> : <Save size={16} />} {savedMsg ? "Enregistré" : "Enregistrer ce programme"}
            </button>
          </div>
        </div>
      )}

      {goals.length > 0 && (
        <div className="card">
          <h2>Programmes enregistrés</h2>
          {goals.map((g) => (
            <div className="goal-card-mini" key={g.id} onClick={() => handleLoad(g)}>
              <div>
                <div className="name">{g.exercise}</div>
                <div className="sub">
                  {fmt(g.current1RM)} → {fmt(g.targetWeight)} kg · {g.weeks} sem.
                </div>
              </div>
              <button
                className="icon-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(g.id);
                }}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/* ---------------------------------------------------------------
   FREE TAB
------------------------------------------------------------------*/
function FreeTab({ sessions, setSessions, activeSession, setActiveSession }) {
  const [exercise, setExercise] = useState("");
  const [goalType, setGoalType] = useState("volume");
  const [weightInput, setWeightInput] = useState("");
  const [repsInput, setRepsInput] = useState("");

  const startSession = () => {
    if (!exercise) return;
    setActiveSession({
      id: Date.now().toString(),
      exercise,
      goalType,
      startedAt: new Date().toISOString(),
      sets: [],
      suggestion: null,
    });
    setWeightInput("");
    setRepsInput("");
  };

  const validateSet = (tooHeavy = false) => {
    if (!activeSession) return;
    const w = parseFloat(weightInput);
    const r = tooHeavy ? parseInt(repsInput || "0", 10) : parseInt(repsInput, 10);
    if (!w || (!tooHeavy && !r)) return;

    const newSet = { weight: w, reps: r || 0, tooHeavy };
    const nextSets = [...activeSession.sets, newSet];
    const suggestion = suggestNext({
      goalType: activeSession.goalType,
      lastWeight: w,
      lastReps: r || 0,
      tooHeavy,
    });

    const updated = { ...activeSession, sets: nextSets, suggestion };
    setActiveSession(updated);
    setWeightInput(fmt(suggestion.weight).toString());
    setRepsInput("");
  };

  const endSession = () => {
    if (!activeSession || activeSession.sets.length === 0) {
      setActiveSession(null);
      return;
    }
    const finished = { ...activeSession, endedAt: new Date().toISOString() };
    setSessions([finished, ...sessions]);
    setActiveSession(null);
    setExercise("");
    setWeightInput("");
    setRepsInput("");
  };

  const discardSession = () => setActiveSession(null);

  if (!activeSession) {
    return (
      <>
        <div className="card">
          <h2><Dumbbell size={16} /> Nouvelle séance libre</h2>
          <div className="field">
            <label>Exercice</label>
            <input value={exercise} onChange={(e) => setExercise(e.target.value)} placeholder="Squat" />
          </div>
          <div className="field">
            <label>Objectif de la séance</label>
            <div className="pill-group">
              <div className={`pill ${goalType === "volume" ? "active" : ""}`} onClick={() => setGoalType("volume")}>
                Volume
              </div>
              <div className={`pill ${goalType === "force" ? "active" : ""}`} onClick={() => setGoalType("force")}>
                Force
              </div>
            </div>
          </div>
          <button className="btn btn-primary" disabled={!exercise} onClick={startSession}>
            Démarrer la séance <ChevronRight size={16} />
          </button>
        </div>

        {sessions.length > 0 && (
          <div className="card">
            <h2>Séances passées</h2>
            {sessions.slice(0, 8).map((s) => (
              <div className="goal-card-mini" key={s.id}>
                <div>
                  <div className="name">{s.exercise}</div>
                  <div className="sub">
                    {s.goalType === "volume" ? "Volume" : "Force"} · {s.sets.length} séries
                  </div>
                </div>
                <div className="sub">{new Date(s.startedAt).toLocaleDateString("fr-FR")}</div>
              </div>
            ))}
          </div>
        )}
      </>
    );
  }

  const lastSet = activeSession.sets[activeSession.sets.length - 1];

  return (
    <>
      <div className="card">
        <h2>
          <Dumbbell size={16} /> {activeSession.exercise}
          <span style={{ marginLeft: "auto", fontSize: 11, color: "#8C8578", textTransform: "uppercase" }}>
            {activeSession.goalType === "volume" ? "Volume" : "Force"}
          </span>
        </h2>

        {activeSession.suggestion && (
          <div className="suggestion-banner">
            Prochaine série : charger <b>{fmt(activeSession.suggestion.weight)} kg</b> — {activeSession.suggestion.note}
          </div>
        )}

        <BarbellLoad
          weight={parseFloat(weightInput) || activeSession.sets[0]?.weight || 0}
          label={`Série ${activeSession.sets.length + 1}`}
          accent={activeSession.goalType === "force" ? "#B5432D" : "#3F7D4E"}
        />

        <div className="row2">
          <div className="field">
            <label>Charge (kg)</label>
            <input type="number" step="0.01" value={weightInput} onChange={(e) => setWeightInput(e.target.value)} placeholder="60" />
          </div>
          <div className="field">
            <label>Répétitions</label>
            <input type="number" value={repsInput} onChange={(e) => setRepsInput(e.target.value)} placeholder="10" />
          </div>
        </div>

        <div className="btn-row">
          <button className="btn btn-primary" onClick={() => validateSet(false)}>
            <Check size={16} /> Valider la série
          </button>
        </div>
        <div className="btn-row">
          <button className="btn btn-danger" onClick={() => validateSet(true)}>
            <AlertTriangle size={16} /> Trop lourd
          </button>
        </div>

        {activeSession.sets.length > 0 && (
          <div className="set-history">
            {activeSession.sets.map((s, i) => (
              <div className="set-row" key={i}>
                <div className="n">#{i + 1}</div>
                <div>{fmt(s.weight)} kg</div>
                <div>{s.reps ? `${s.reps} reps` : "—"}</div>
                <div>
                  <span className={`chip ${s.tooHeavy ? "heavy" : "ok"}`}>{s.tooHeavy ? "Trop lourd" : "Validée"}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="btn-row" style={{ marginTop: 16 }}>
          <button className="btn btn-ghost" onClick={discardSession}>
            Annuler
          </button>
          <button className="btn btn-primary" onClick={endSession}>
            <Save size={16} /> Terminer la séance
          </button>
        </div>
      </div>
    </>
  );
}
