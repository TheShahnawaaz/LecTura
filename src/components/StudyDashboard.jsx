import React, { useState, useEffect, useRef, useMemo } from "react";
import { 
  Flame, 
  Target, 
  BookOpen, 
  Calendar, 
  ChevronDown, 
  ChevronUp, 
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

// Visual Count-up animation helper component
function AnimatedNumber({ value, formatter = (v) => v }) {
  const [displayValue, setDisplayValue] = useState(0);
  const startValRef = useRef(0);
  const endVal = parseInt(value, 10) || 0;

  useEffect(() => {
    let active = true;
    const start = startValRef.current;
    const end = endVal;
    
    if (start === end) {
      setDisplayValue(end);
      return;
    }
    
    const duration = 1000; // 1s animation duration
    const startTime = performance.now();
    
    const animate = (now) => {
      if (!active) return;
      const elapsed = now - startTime;
      const progress = Math.min(1.0, elapsed / duration);
      // Ease-out quad formula
      const ease = progress * (2 - progress);
      const current = Math.floor(start + (end - start) * ease);
      setDisplayValue(current);
      
      if (progress < 1.0) {
        requestAnimationFrame(animate);
      } else {
        setDisplayValue(end);
        startValRef.current = end;
      }
    };
    
    requestAnimationFrame(animate);
    return () => {
      active = false;
    };
  }, [endVal]);

  return <span>{formatter(displayValue)}</span>;
}

// Collapsible Daily Study Dashboard Widget
export default function StudyDashboard({ studyStats, dailyStudyGoal }) {
  const [isDashboardOpen, setIsDashboardOpen] = useState(() => {
    return localStorage.getItem("lectura_dashboard_expanded") !== "false";
  });
  const [hoveredDate, setHoveredDate] = useState(null);
  const [hoveredDay, setHoveredDay] = useState(null);
  const [selectedYear, setSelectedYear] = useState("last_year");

  const logYears = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const years = new Set([currentYear, currentYear - 1]);
    if (studyStats?.daily_logs) {
      Object.keys(studyStats.daily_logs).forEach(dateStr => {
        const year = parseInt(dateStr.split("-")[0], 10);
        if (year) years.add(year);
      });
    }
    return Array.from(years).sort((a, b) => b - a);
  }, [studyStats?.daily_logs]);

  useEffect(() => {
    localStorage.setItem("lectura_dashboard_expanded", isDashboardOpen);
  }, [isDashboardOpen]);

  // Format minutes to hours and minutes
  const formatMinsToDuration = (totalMins) => {
    if (!totalMins || totalMins <= 0) return "0m";
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    if (h > 0) {
      return `${h}h ${m}m`;
    }
    return `${m}m`;
  };

  const getTodayDateString = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const todayStr = getTodayDateString();
  const todaySeconds = studyStats?.daily_logs?.[todayStr] || 0;
  const todayMinutes = Math.floor(todaySeconds / 60);
  
  const goalProgress = dailyStudyGoal > 0 
    ? Math.min(100, Math.round((todayMinutes / dailyStudyGoal) * 100)) 
    : 0;

  // Streak calculations
  const calculateStreak = (dailyLogs = {}, goalMins) => {
    let currentStreak = 0;
    let bestStreak = 0;
    let tempStreak = 0;
    
    const oneDayMs = 24 * 60 * 60 * 1000;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const logDates = Object.keys(dailyLogs).sort();
    if (logDates.length === 0) return { current: 0, best: 0 };
    
    let lastDate = null;
    for (const dateStr of logDates) {
      const seconds = dailyLogs[dateStr] || 0;
      const mins = seconds / 60;
      const currentDate = new Date(dateStr + "T00:00:00");
      
      if (mins >= goalMins) {
        if (lastDate) {
          const diff = (currentDate - lastDate) / oneDayMs;
          if (diff <= 1.1) {
            tempStreak += 1;
          } else {
            tempStreak = 1;
          }
        } else {
          tempStreak = 1;
        }
        bestStreak = Math.max(bestStreak, tempStreak);
        lastDate = currentDate;
      } else {
        tempStreak = 0;
        lastDate = null;
      }
    }
    
    const goalSeconds = goalMins * 60;
    
    const todaySeconds = dailyLogs[todayStr] || 0;
    
    const yesterday = new Date(today.getTime() - oneDayMs);
    const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
    const yesterdaySeconds = dailyLogs[yesterdayStr] || 0;
    
    const hitToday = todaySeconds >= goalSeconds;
    const hitYesterday = yesterdaySeconds >= goalSeconds;
    
    if (hitToday || hitYesterday) {
      let startTraceDate = hitToday ? today : yesterday;
      while (true) {
        const dateStr = `${startTraceDate.getFullYear()}-${String(startTraceDate.getMonth() + 1).padStart(2, "0")}-${String(startTraceDate.getDate()).padStart(2, "0")}`;
        const secs = dailyLogs[dateStr] || 0;
        if (secs >= goalSeconds) {
          currentStreak += 1;
          startTraceDate = new Date(startTraceDate.getTime() - oneDayMs);
        } else {
          break;
        }
      }
    }
    
    return { current: currentStreak, best: Math.max(bestStreak, currentStreak) };
  };

  const streak = useMemo(() => calculateStreak(studyStats?.daily_logs || {}, dailyStudyGoal), [studyStats?.daily_logs, dailyStudyGoal]);

  // Heatmap generation (full year)
  const heatmapDates = useMemo(() => {
    if (selectedYear === "last_year") {
      const today = new Date();
      const dayOfWeek = today.getDay();
      const saturdayThisWeek = new Date(today);
      saturdayThisWeek.setDate(today.getDate() + (6 - dayOfWeek));
      saturdayThisWeek.setHours(23, 59, 59, 999);
      
      const gridStartDate = new Date(saturdayThisWeek);
      gridStartDate.setDate(saturdayThisWeek.getDate() - 53 * 7 + 1);
      gridStartDate.setHours(0, 0, 0, 0);
      
      const dates = [];
      const current = new Date(gridStartDate);
      while (current <= saturdayThisWeek) {
        dates.push(new Date(current));
        current.setDate(current.getDate() + 1);
      }
      return dates;
    } else {
      const year = parseInt(selectedYear, 10);
      const yearStartDate = new Date(year, 0, 1);
      const dayOfWeek = yearStartDate.getDay();
      
      const gridStartDate = new Date(yearStartDate);
      gridStartDate.setDate(yearStartDate.getDate() - dayOfWeek);
      gridStartDate.setHours(0, 0, 0, 0);
      
      const yearEndDate = new Date(year, 11, 31);
      const endDayOfWeek = yearEndDate.getDay();
      
      const gridEndDate = new Date(yearEndDate);
      gridEndDate.setDate(yearEndDate.getDate() + (6 - endDayOfWeek));
      gridEndDate.setHours(23, 59, 59, 999);
      
      const dates = [];
      const current = new Date(gridStartDate);
      while (current <= gridEndDate) {
        dates.push(new Date(current));
        current.setDate(current.getDate() + 1);
      }
      return dates;
    }
  }, [selectedYear]);

  const weekCount = useMemo(() => Math.ceil(heatmapDates.length / 7), [heatmapDates]);

  const monthLabels = useMemo(() => {
    const labels = [];
    let lastMonth = -1;
    for (let col = 0; col < weekCount; col++) {
      const dayIndex = col * 7;
      if (dayIndex < heatmapDates.length) {
        const date = heatmapDates[dayIndex];
        const month = date.getMonth();
        
        let isValidDate = true;
        if (selectedYear !== "last_year") {
          isValidDate = date.getFullYear() === parseInt(selectedYear, 10);
        }
        
        if (isValidDate && month !== lastMonth) {
          // Prevent adjacent month labels (within 2 columns) from clashing
          if (labels.length === 0 || col - labels[labels.length - 1].colIndex >= 2) {
            labels.push({
              colIndex: col,
              name: date.toLocaleDateString(undefined, { month: "short" })
            });
            lastMonth = month;
          }
        }
      }
    }
    return labels;
  }, [heatmapDates, weekCount, selectedYear]);

  const totalStudyMinutes = Math.floor((studyStats?.total_study_seconds || 0) / 60);
  const totalCoveredMinutes = Math.floor((studyStats?.total_video_covered_seconds || 0) / 60);

  // SVG Progress Ring calculations
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (goalProgress / 100) * circumference;

  return (
    <div className="bg-card border border-border shadow-sm rounded-2xl overflow-hidden transition-all duration-300">
      {/* Dashboard Toggle Header */}
      <button
        onClick={() => setIsDashboardOpen(!isDashboardOpen)}
        className="w-full flex items-center justify-between px-5 py-3.5 bg-muted/20 hover:bg-muted/40 transition-colors border-b border-border/40 select-none text-left"
      >
        <div className="flex items-center gap-2">
          <Target size={16} className="text-primary animate-pulse" />
          <span className="text-xs font-bold tracking-wide text-foreground">
            Daily Study Dashboard
          </span>
          <Badge variant="outline" className="bg-primary/5 border-primary/20 text-primary text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded">
            Metrics
          </Badge>
        </div>
        <div className="text-muted-foreground hover:text-foreground">
          {isDashboardOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </button>

      {/* Collapsible Content */}
      <div className={`transition-all duration-300 ease-in-out overflow-hidden ${
        isDashboardOpen ? "max-h-[800px] opacity-100 p-5" : "max-h-0 opacity-0 p-0 pointer-events-none"
      }`}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          
          {/* Card 1: Today's Goal */}
          <div className="bg-muted/15 border border-border/40 p-4 rounded-xl flex items-center justify-between gap-4 shadow-sm hover:border-border/80 transition-all duration-200">
            <div className="flex-1 min-w-0">
              <span className="text-[9px] uppercase font-bold tracking-wider text-muted-foreground flex items-center gap-1">
                <Target size={10} className="text-muted-foreground/60" /> Daily Target
              </span>
              <div className="text-lg font-black text-foreground mt-1 tabular-nums">
                <AnimatedNumber value={todayMinutes} /> / {dailyStudyGoal} mins
              </div>
              <p className="text-[10px] text-muted-foreground mt-1.5 font-medium leading-relaxed">
                {todayMinutes >= dailyStudyGoal ? (
                  <span className="text-emerald-500 font-semibold flex items-center gap-0.5">
                    🎉 Goal completed today!
                  </span>
                ) : (
                  <span className="text-amber-500 font-semibold">
                    ⏳ {dailyStudyGoal - todayMinutes} mins left to maintain streak
                  </span>
                )}
              </p>
            </div>
            
            {/* Custom SVG Circular Progress Ring */}
            <div className="relative flex items-center justify-center flex-shrink-0">
              <svg className="w-12 h-12 transform -rotate-90">
                <circle
                  cx="24"
                  cy="24"
                  r={radius}
                  className="stroke-muted/30"
                  strokeWidth="3.5"
                  fill="transparent"
                />
                <circle
                  cx="24"
                  cy="24"
                  r={radius}
                  className="stroke-primary transition-all duration-700 ease-out"
                  strokeWidth="4"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  fill="transparent"
                />
              </svg>
              <div className="absolute text-[10px] font-black text-foreground tabular-nums">
                {goalProgress}%
              </div>
            </div>
          </div>

          {/* Card 2: Current Streak */}
          <div className="bg-muted/15 border border-border/40 p-4 rounded-xl flex items-center justify-between gap-4 shadow-sm hover:border-border/80 transition-all duration-200">
            <div className="min-w-0">
              <span className="text-[9px] uppercase font-bold tracking-wider text-muted-foreground flex items-center gap-1">
                <Flame size={10} className="text-amber-500" /> Active Streak
              </span>
              <div className="text-2xl font-black text-amber-500 mt-1 flex items-center gap-1.5 tabular-nums">
                🔥 <AnimatedNumber value={streak.current} /> <span className="text-xs font-semibold text-muted-foreground">days</span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-2 font-medium">
                Personal best streak: <span className="font-bold text-foreground tabular-nums">{streak.best} days</span>
              </p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center flex-shrink-0">
              <Flame size={20} fill="currentColor" className="animate-pulse" />
            </div>
          </div>

          {/* Card 3: Video Content Covered */}
          <div className="bg-muted/15 border border-border/40 p-4 rounded-xl flex items-center justify-between gap-4 shadow-sm hover:border-border/80 transition-all duration-200">
            <div className="min-w-0">
              <span className="text-[9px] uppercase font-bold tracking-wider text-muted-foreground flex items-center gap-1">
                <BookOpen size={10} className="text-muted-foreground/60" /> Library Coverage
              </span>
              <div className="text-lg font-black text-foreground mt-1 tabular-nums">
                <AnimatedNumber value={totalCoveredMinutes} formatter={formatMinsToDuration} />
              </div>
              <p className="text-[10px] text-muted-foreground mt-2.5 font-medium">
                Lectures completed: <span className="font-extrabold text-foreground tabular-nums"><AnimatedNumber value={studyStats?.completed_lectures_count || 0} /></span>
              </p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 text-primary flex items-center justify-center flex-shrink-0">
              <BookOpen size={18} />
            </div>
          </div>

        </div>

        {/* Heatmap & Grid Section */}
        <div className="mt-5 border-t border-border/40 pt-5 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div className="flex-1 col-span-1">
            <div className="flex items-center justify-between mr-4">
              <h4 className="text-[10px] font-bold text-foreground uppercase tracking-wider flex items-center gap-1">
                <Calendar size={11} className="text-muted-foreground" /> Annual Study Heatmap
              </h4>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="text-[9px] font-bold bg-muted/40 hover:bg-muted/65 border border-border/40 rounded px-1.5 py-0.5 text-foreground cursor-pointer focus:outline-none transition-all"
              >
                <option value="last_year" className="bg-background text-foreground text-[10px]">
                  This Year
                </option>
                {logYears.map(yr => (
                  <option key={yr} value={String(yr)} className="bg-background text-foreground text-[10px]">
                    {yr}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-[9px] text-muted-foreground mt-1 leading-relaxed max-w-sm">
              Shading indicates daily study duration (total real-world minutes). Hover over any square to see logged study time.
            </p>
                 {/* Total watched time summary */}
            <div className="text-[10px] text-foreground font-semibold mt-3">
              Total Focus Time: <span className="text-primary tabular-nums"><AnimatedNumber value={totalStudyMinutes} formatter={formatMinsToDuration} /></span>
            </div>
          </div>

          {/* Grid container */}
          <div className="flex items-start gap-2 self-center lg:self-auto overflow-x-auto max-w-full pb-2">
            
            {/* Day of Week Labels */}
            <div className="flex flex-col justify-between text-[7px] font-bold text-muted-foreground/60 h-[102px] pr-1 leading-none py-1 select-none">
              <span>Sun</span>
              <span>Tue</span>
              <span>Thu</span>
              <span>Sat</span>
            </div>

            <div className="flex flex-col">
              {/* Sunday-Saturday Heatmap Grid */}
              <div className="grid grid-flow-col grid-rows-7 gap-1 p-1.5 bg-muted/20 border border-border/40 rounded-lg">
              {heatmapDates.map((date) => {
                const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
                const seconds = studyStats?.daily_logs?.[dateStr] || 0;
                const mins = Math.round(seconds / 60);
                const maxMins = 60; // 60 mins is maximum opacity (100% color)
                const opacityVal = mins > 0 ? Math.min(1.0, Math.max(0.15, mins / maxMins)) : 0;
                
                const formattedDate = date.toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                });
                
                // Check if the date should be visible in the current view
                const today = new Date();
                today.setHours(23, 59, 59, 999);
                
                let isHidden = false;
                if (selectedYear === "last_year") {
                  isHidden = date > today;
                } else {
                  const targetYear = parseInt(selectedYear, 10);
                  isHidden = date.getFullYear() !== targetYear;
                }
                
                if (isHidden) {
                  return (
                    <div
                      key={dateStr}
                      className="w-[11px] h-[11px] rounded-[2px] opacity-0 pointer-events-none"
                    />
                  );
                }
                
                const isHovered = hoveredDate === dateStr;
                
                return (
                  <div
                    key={dateStr}
                    onMouseEnter={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setHoveredDate(dateStr);
                      setHoveredDay({
                        formattedDate,
                        mins,
                        x: rect.left + rect.width / 2,
                        y: rect.top - 8,
                      });
                    }}
                    onMouseLeave={() => {
                      setHoveredDate(null);
                      setHoveredDay(null);
                    }}
                    className={`w-[11px] h-[11px] rounded-[2px] transition-all duration-200 cursor-pointer ${
                      mins > 0 
                        ? "bg-primary border border-primary/20 shadow-sm" 
                        : "bg-muted/40 border border-border/20"
                    }`}
                    style={
                      mins > 0 
                        ? { 
                            opacity: isHovered ? 1.0 : opacityVal,
                            transform: isHovered ? "scale(1.3)" : "scale(1)",
                            zIndex: isHovered ? 10 : 1
                          } 
                        : {
                            transform: isHovered ? "scale(1.3)" : "scale(1)",
                            zIndex: isHovered ? 10 : 1,
                            backgroundColor: isHovered ? "hsl(var(--muted-foreground))" : undefined,
                            opacity: isHovered ? 0.6 : undefined
                          }
                    }
                  />
                );
              })}
            </div>

              {/* Month Labels Grid (X-axis below heatmap) */}
              <div 
                className="grid grid-flow-col gap-1 pl-1.5 pr-1.5 text-[7px] font-bold text-muted-foreground/60 select-none mt-1"
                style={{ gridTemplateColumns: `repeat(${weekCount}, 11px)` }}
              >
                {monthLabels.map((lbl, idx) => (
                  <span 
                    key={idx} 
                    style={{ gridColumnStart: lbl.colIndex + 1 }}
                    className="col-span-4 truncate text-left"
                  >
                    {lbl.name}
                  </span>
                ))}
              </div>
            </div>

            {/* Heatmap Legend */}
            <div className="flex flex-col justify-between text-[8px] font-bold text-muted-foreground/75 h-[100px] pl-2 border-l border-border/40 py-2 select-none">
              <span className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-[2px] bg-muted/40 border border-border/20" /> Less
              </span>
              <span className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-[2px] bg-primary border border-primary/20 opacity-30" /> 1-15m
              </span>
              <span className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-[2px] bg-primary border border-primary/20 opacity-65" /> 15-45m
              </span>
              <span className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-[2px] bg-primary border border-primary/20 opacity-100" /> 45m+
              </span>
            </div>

          </div>
        </div>
      </div>
      
      {/* Floating GitHub-style Tooltip */}
      {hoveredDay && (
        <div 
          className="fixed z-[9999] px-2.5 py-1.5 text-[10px] font-medium text-zinc-100 bg-zinc-950 border border-zinc-800 rounded shadow-md pointer-events-none transform -translate-x-1/2 -translate-y-full animate-in fade-in zoom-in-95 duration-100"
          style={{
            left: hoveredDay.x,
            top: hoveredDay.y,
          }}
        >
          <div className="relative leading-none">
            {hoveredDay.mins > 0 ? (
              <span>
                <strong className="text-zinc-50 font-extrabold">{hoveredDay.mins} mins</strong> on {hoveredDay.formattedDate}
              </span>
            ) : (
              <span>No study time on {hoveredDay.formattedDate}</span>
            )}
            {/* Downward pointing arrow */}
            <div className="absolute left-1/2 -bottom-[10.5px] w-1.5 h-1.5 bg-zinc-950 border-r border-b border-zinc-800 transform -translate-x-1/2 rotate-45" />
          </div>
        </div>
      )}
    </div>
  );
}
